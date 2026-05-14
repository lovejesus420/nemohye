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
  '야놀자 여기어때 아고다 숙박 할인 쿠폰 프로모션 여행',
  '무신사 올리브영 브랜드 세일 할인 코드 혜택',
  '삼성닷컴 LG전자 전자랜드 하이마트 가전 할인 행사',
  '배달의민족 쿠팡이츠 요기요 이번주 할인 쿠폰 혜택'
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
  const prompt = `오늘은 ${today}입니다. 아래 검색 결과에서 현재 진행 중인 마트, 백화점, 온라인쇼핑, 편의점, 여행, 가전, 패션 할인 행사를 추출하여 JSON 배열로 응답하세요.

카테고리는 반드시 다음 중 하나로 지정하세요: '마트·식품', '패션·뷰티', '전자·가전', '여행·레저', '온라인쇼핑', '기타'

응답 형식:
[
  {
    "title": "혜택 제목 (예: 와우회원 5,000원 할인)",
    "store": "업체명 (예: 쿠팡)",
    "category": "카테고리명",
    "discount": "핵심 혜택 내용 (예: 5,000원 할인, 1+1, 20% 세일)",
    "period": "행사 기간 (예: 5/1~5/31, 상시)",
    "url": "이벤트 또는 상품 페이지 URL (반드시 포함)",
    "description": "상세 설명 (1~2문장)",
    "icon": "카테고리에 어울리는 이모지"
  }
]

검색 결과:
${snippets}`;

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
    
    const formattedDb = dbBenefits.map(b => {
      // 카테고리 매핑 (DB 데이터가 이전 형식일 경우 대응)
      let cat = b.카테고리 || '기타';
      if (cat === '할인') cat = '기타';
      
      return {
        title: b.혜택명 || b.title,
        store: b.지원대상 || b.store || '전국',
        category: cat,
        discount: b.지원내용 || b.discount,
        period: b.마감일 || b.period || '상시',
        url: b.신청URL || b.출처 || b.url,
        icon: b.icon || '🎁',
        description: b.description || b.지원대상
      };
    });

    // 2. 실시간 검색 (보조)
    let liveResults = [];
    if (SERPER_KEY && GEMINI_KEY) {
      // 쿼리 중 랜덤하게 4개 선택하여 검색 (API 부하 감소 및 다양성 확보)
      const selectedQueries = SEARCH_QUERIES.sort(() => 0.5 - Math.random()).slice(0, 4);
      const results = await Promise.allSettled(selectedQueries.map(serperSearch));
      const snippets = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.organic || [])
        .map(it => `[${it.title}] ${it.snippet} (URL: ${it.link})`)
        .join('\n\n');
      
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
