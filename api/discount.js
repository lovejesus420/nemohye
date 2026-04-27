// api/discount.js — 전국 할인 행사 데이터 엔드포인트
// GET /api/discount
// DB에 수집된 할인 정보 + Serper 실시간 검색 결과를 결합하여 반환

import { queryFreshBenefits } from '../lib/db.js';

const SERPER_KEY  = process.env.SERPER_API_KEY;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const CACHE_TTL   = 4 * 60 * 60 * 1000; // 4시간

let _cache = null;
let _cacheAt = 0;

const SEARCH_QUERIES = [
  '전국 할인행사 2026 이벤트',
  '대형마트 할인 이벤트 행사',
  '백화점 세일 할인행사',
  '온라인쇼핑 특가 이벤트',
  '편의점 할인 이벤트 행사',
];

async function serperSearch(query) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 10 }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  return res.json();
}

async function geminiExtract(snippets) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `오늘은 ${today}입니다.
아래 검색 결과에서 현재 진행 중이거나 곧 시작하는 할인 행사·이벤트를 추출하세요.
각 행사마다 JSON 객체를 만들어 배열로 반환하세요. 마크다운 없이 순수 JSON 배열만.

필드:
- title: 행사명 (간결하게)
- store: 업체/브랜드명 (예: 이마트, 쿠팡, 롯데마트)
- category: 분류 (마트·식품 | 패션·뷰티 | 전자·가전 | 여행·레저 | 온라인쇼핑 | 기타)
- discount: 할인율 또는 혜택 요약 (예: 최대 50% 할인, 1+1 행사)
- period: 기간 (예: 4월 25일~5월 3일, 상시)
- region: 지역 (예: 전국, 서울, 온라인)
- description: 행사 설명 1~2문장
- url: 관련 링크 (없으면 null)
- icon: 관련 이모지 1개

검색 결과:
${snippets}

규칙:
- 행사가 아닌 단순 상품 광고는 제외
- 중복 제거
- 최대 20개
- 실제 정보만, 추측 금지`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return JSON.parse(clean);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 캐시 히트
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.status(200).json({ ok: true, fromCache: true, count: _cache.length, discounts: _cache });
  }

  try {
    // 1. DB에서 수집된 할인 정보 가져오기 (targetGroup='할인행사')
    const { benefits: dbBenefits } = await queryFreshBenefits({ region: '전국', group: '할인행사', limit: 20 });
    const formattedDbBenefits = dbBenefits.map(b => ({
      title: b.혜택명 || b.title,
      store: b.지원대상 || b.store || '전국 공통',
      category: b.카테고리 || '여행·레저',
      discount: b.지원내용 || b.discount,
      period: b.마감일 ? `~${b.마감일}` : (b.period || '상시'),
      region: '전국',
      description: b.신청방법 || b.description,
      url: b.출처 || b.url,
      icon: '🎁'
    }));

    // 2. 실시간 검색 결과 가져오기 (SERPER_KEY와 GEMINI_KEY가 있을 때만)
    let validLive = [];
    if (SERPER_KEY && GEMINI_KEY) {
      const queries = SEARCH_QUERIES.slice(0, 2);
      const results = await Promise.allSettled(queries.map(serperSearch));

      const snippets = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => [
          ...(r.value?.organic || []).map(it => `[${it.title}] ${it.snippet || ''} ${it.link || ''}`),
          ...(r.value?.news || []).map(it => `[뉴스] ${it.title} ${it.snippet || ''} ${it.link || ''}`),
        ])
        .slice(0, 40)
        .join('\n');

      if (snippets.trim()) {
        try {
          const liveDiscounts = await geminiExtract(snippets);
          validLive = Array.isArray(liveDiscounts) ? liveDiscounts.filter(d => d?.title) : [];
        } catch (e) {
          console.error('[discount] Gemini error:', e.message);
        }
      }
    }

    // 3. 결합 및 중복 제거 (제목 기준)
    const combined = [...formattedDbBenefits, ...validLive];
    const seen = new Set();
    const finalDiscounts = combined.filter(d => {
      const key = (d.title || '').replace(/\s+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 결과 저장 (캐시)
    if (finalDiscounts.length > 0) {
      _cache = finalDiscounts;
      _cacheAt = Date.now();
    }

    return res.status(200).json({
      ok: true,
      fromCache: false,
      count: finalDiscounts.length,
      dbCount: formattedDbBenefits.length,
      liveCount: validLive.length,
      fetchedAt: new Date().toISOString(),
      discounts: finalDiscounts,
    });
  } catch (e) {
    console.error('[discount] handler error:', e.message);
    return res.status(500).json({ ok: false, error: e.message, discounts: [] });
  }
}
