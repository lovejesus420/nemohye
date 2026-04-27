// api/discount.js — 전국 할인 행사 데이터 엔드포인트
import { queryFreshBenefits } from '../lib/db.js';

const SERPER_KEY  = process.env.SERPER_API_KEY;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const CACHE_TTL   = 3 * 60 * 60 * 1000; 

let _cache = null;
let _cacheAt = 0;

const SEARCH_QUERIES = [
  '이마트 롯데마트 홈플러스 이번주 전단지 할인 행사 이벤트',
  '롯데백화점 신세계백화점 현대백화점 정기 세일 브랜드 이벤트',
  '쿠팡 11번가 G마켓 최신 할인 쿠팡와우 특가 행사',
  'CU GS25 세븐일레븐 이달의 1+1 2+1 행사 증정 이벤트',
];

async function serperSearch(query) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 10 }),
  });
  return res.json();
}

async function geminiExtract(snippets) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `오늘은 ${today}입니다. 아래 검색 결과에서 마트, 백화점, 온라인쇼핑, 편의점 할인 행사를 JSON 배열로 추출하세요.\n\n${snippets}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const clean = raw.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(clean);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 캐시 체크
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.status(200).json({ ok: true, fromCache: true, discounts: _cache });
  }

  try {
    // 1. DB 데이터 조회 (가장 중요)
    console.log('[discount] Fetching from DB...');
    const { benefits: dbBenefits } = await queryFreshBenefits({ region: '전국', group: '할인행사', limit: 50 });
    
    const formattedDb = dbBenefits.map(b => ({
      title: b.혜택명 || b.title,
      store: b.지원대상 || b.store || '전국',
      category: b.카테고리 || '할인',
      discount: b.지원내용 || b.discount,
      period: b.마감일 || b.period || '상시',
      url: b.신청URL || b.출처 || b.url,
      icon: b.icon || '🎁'
    }));

    // 2. 실시간 검색 (보조)
    let liveResults = [];
    if (SERPER_KEY && GEMINI_KEY) {
      const results = await Promise.allSettled(SEARCH_QUERIES.slice(0, 2).map(serperSearch));
      const snippets = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value.organic || []).map(it => it.snippet).join('\n');
      if (snippets) liveResults = await geminiExtract(snippets);
    }

    // 3. 합치기 및 중복 제거
    const combined = [...formattedDb, ...liveResults];
    const seen = new Set();
    const final = combined.filter(d => {
      const k = (d.title || '').replace(/\s/g, '');
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    _cache = final;
    _cacheAt = Date.now();

    return res.status(200).json({
      ok: true,
      count: final.length,
      dbCount: formattedDb.length,
      liveCount: liveResults.length,
      discounts: final
    });
  } catch (e) {
    console.error('[discount] Error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
