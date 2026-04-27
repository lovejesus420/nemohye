// api/discount.js — 전국 할인 행사 데이터 엔드포인트
// GET /api/discount
// DB에 수집된 브랜드별 할인 정보 + Serper 실시간 검색 결과를 결합하여 반환

import { queryFreshBenefits } from '../lib/db.js';

const SERPER_KEY  = process.env.SERPER_API_KEY;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const CACHE_TTL   = 3 * 60 * 60 * 1000; // 3시간 (할인 정보 특성상 조금 더 자주 갱신)

let _cache = null;
let _cacheAt = 0;

// 사용자가 요청한 주요 카테고리별 정교한 검색 쿼리
const SEARCH_QUERIES = [
  '이마트 롯데마트 홈플러스 이번주 전단지 할인 행사 이벤트',
  '롯데백화점 신세계백화점 현대백화점 정기 세일 브랜드 이벤트',
  '쿠팡 11번가 G마켓 최신 할인 쿠팡와우 특가 행사',
  'CU GS25 세븐일레븐 이달의 1+1 2+1 행사 증정 이벤트',
  '전국 대형마트 할인 행사 2026',
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
아래 검색 결과에서 대형마트(이마트, 롯데마트, 홈플러스), 백화점, 온라인쇼핑, 편의점의 현재 진행 중인 할인 행사·이벤트를 추출하세요.
각 행사마다 JSON 객체를 만들어 배열로 반환하세요. 마크다운 없이 순수 JSON 배열만.

필드:
- title: 행사명 (예: "홈플런 50% 할인", "이마트 전단 행사", "CU 1+1 행사")
- store: 업체/브랜드명 (예: 이마트, 쿠팡, 신세계백화점, GS25)
- category: 분류 (마트·식품 | 패션·뷰티 | 전자·가전 | 여행·레저 | 온라인쇼핑 | 편의점 | 기타)
- discount: 할인율 또는 혜택 요약 (예: "최대 50% 할인", "1+1", "카드사 7% 청구할인")
- period: 기간 (예: "4월 25일~5월 3일", "4월 한 달간")
- region: 지역 (전국 | 온라인 | 특정 지역명)
- description: 행사 핵심 내용 (1~2문장)
- url: 관련 링크 (없으면 검색 결과의 링크 사용)
- icon: 카테고리에 맞는 이모지 1개

검색 결과:
${snippets}

규칙:
- 실질적인 "이벤트/행사"만 추출하고 단순 개별 상품 광고는 제외하세요.
- 브랜드명이 명확한 것을 우선하세요.
- 중복된 행사는 하나로 합치세요.
- 최대 20개까지만 추출하세요.`;

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
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('[discount] JSON parse error:', e.message, clean);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 캐시 히트 (1시간 이내 데이터는 즉시 반환)
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.status(200).json({ ok: true, fromCache: true, count: _cache.length, discounts: _cache });
  }

  try {
    // 1. DB에서 수집된 할인 정보 가져오기 (targetGroup='할인행사')
    const { benefits: dbBenefits } = await queryFreshBenefits({ region: '전국', group: '할인행사', limit: 30 });
    const formattedDbBenefits = dbBenefits.map(b => {
        // 이미 discount.js 형식인 경우 (Gemini 수집 데이터)
        if (b.title && b.store) return b;
        // scraper 데이터인 경우 (여행가는 달 등)
        return {
          title: b.혜택명 || b.title || '할인 행사',
          store: b.지원대상 || b.store || '전국 공통',
          category: b.카테고리 || '기타',
          discount: b.지원내용 || b.discount || '상세 내용 참조',
          period: b.마감일 ? `~${b.마감일}` : (b.period || '상시'),
          region: '전국',
          description: b.신청방법 || b.description || '',
          url: b.출처 || b.url,
          icon: b.icon || '🎁'
        };
    });

    // 2. 실시간 검색 결과 가져오기
    let liveDiscounts = [];
    if (SERPER_KEY && GEMINI_KEY) {
      // 검색 쿼리 중 2개씩 순환하며 사용 (API 할당량 관리 및 다양성 확보)
      const qIndex = Math.floor((Date.now() / (1000 * 60 * 60)) % (SEARCH_QUERIES.length - 1));
      const queries = [SEARCH_QUERIES[qIndex], SEARCH_QUERIES[qIndex + 1]];
      
      const results = await Promise.allSettled(queries.map(serperSearch));
      const snippets = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => [
          ...(r.value?.organic || []).map(it => `[${it.title}] ${it.snippet || ''} ${it.link || ''}`),
          ...(r.value?.news || []).map(it => `[뉴스] ${it.title} ${it.snippet || ''} ${it.link || ''}`),
        ])
        .slice(0, 50)
        .join('\n');

      if (snippets.trim()) {
        liveDiscounts = await geminiExtract(snippets);
      }
    }

    // 3. 결합 및 중복 제거
    const combined = [...formattedDbBenefits, ...liveDiscounts];
    const seen = new Set();
    const finalDiscounts = combined.filter(d => {
      if (!d.title) return false;
      const key = d.title.replace(/\s+/g, '').slice(0, 20); // 제목 앞부분 유사도 체크
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. 정렬 (브랜드명이 있는 것, 마트/백화점/편의점 우선)
    const priorityCategories = ['마트·식품', '편의점', '온라인쇼핑', '패션·뷰티'];
    finalDiscounts.sort((a, b) => {
      const aIdx = priorityCategories.indexOf(a.category);
      const bIdx = priorityCategories.indexOf(b.category);
      const aVal = aIdx === -1 ? 99 : aIdx;
      const bVal = bIdx === -1 ? 99 : bIdx;
      return aVal - bVal;
    });

    if (finalDiscounts.length > 0) {
      _cache = finalDiscounts;
      _cacheAt = Date.now();
    }

    return res.status(200).json({
      ok: true,
      fromCache: false,
      count: finalDiscounts.length,
      dbCount: formattedDbBenefits.length,
      liveCount: liveDiscounts.length,
      fetchedAt: new Date().toISOString(),
      discounts: finalDiscounts,
    });
  } catch (e) {
    console.error('[discount] handler error:', e.message);
    return res.status(500).json({ ok: false, error: e.message, discounts: [] });
  }
}
