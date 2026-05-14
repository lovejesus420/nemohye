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

const FEATURED_DISCOUNTS = [
  {
    title: '배달의민족 매주 새로운 브랜드 할인',
    store: '배달의민족',
    category: '마트·식품',
    discount: '최대 1만원 할인',
    period: '매주 갱신',
    url: 'https://baemin.onelink.me/o97n/6620f4c',
    description: '치킨, 피자, 중식 등 매주 요일별로 인기 브랜드 최대 1만원 할인 쿠폰을 드립니다.',
    icon: '🛵'
  },
  {
    title: 'SKT T멤버십 0 day 혜택 (만 13~34세)',
    store: 'SKT',
    category: '기타',
    discount: '다양한 무료/할인',
    period: '매달 10일, 20일, 30일',
    url: 'https://tmembership.tworld.co.kr',
    description: '청년 고객이라면 누구나! 매월 10일, 20일, 30일에 다이소, 올리브영, 편의점 등 인기 브랜드 혜택을 선착순으로 드립니다.',
    icon: '📱'
  },
  {
    title: '쿠팡 와우 멤버십 로켓배송 및 OTT 혜택',
    store: '쿠팡',
    category: '온라인쇼핑',
    discount: '월 7,890원 무제한 혜택',
    period: '상시',
    url: 'https://www.coupang.com',
    description: '로켓배송 무료, 로켓직구 무료배송, 쿠팡플레이 시청, 쿠팡이츠 무제한 무료배달까지 모두 누리세요.',
    icon: '🚀'
  },
  {
    title: '네이버플러스 멤버십 첫 달 무료 체험',
    store: '네이버',
    category: '온라인쇼핑',
    discount: '최대 5% 적립',
    period: '상시',
    url: 'https://nid.naver.com/membership/join',
    description: '쇼핑 시 최대 5% 적립, 티빙 방송 무제한, 편의점/카페 할인 등 강력한 혜택을 첫 달 무료로 시작하세요.',
    icon: '💚'
  },
  {
    title: '야놀자 국내 숙소 최대 10% 할인 쿠폰',
    store: '야놀자',
    category: '여행·레저',
    discount: '최대 10% 할인',
    period: '상시',
    url: 'https://www.yanolja.com',
    description: '국내 호텔, 리조트, 펜션 예약 시 즉시 사용 가능한 할인 쿠폰을 드립니다.',
    icon: '🏨'
  }
];

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
    // 1. DB 데이터 조회
    console.log('[discount] Fetching from DB...');
    let dbBenefits = [];
    try {
      const dbRes = await queryFreshBenefits({ region: '전국', group: '할인행사', limit: 40 });
      dbBenefits = dbRes.benefits || [];
    } catch (e) {
      console.error('[discount] DB Query Error:', e.message);
    }
    
    const formattedDb = dbBenefits.map(b => {
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

    // 2. 실시간 검색
    let liveResults = [];
    if (SERPER_KEY && GEMINI_KEY) {
      try {
        const selectedQueries = SEARCH_QUERIES.sort(() => 0.5 - Math.random()).slice(0, 3);
        const results = await Promise.allSettled(selectedQueries.map(serperSearch));
        const snippets = results
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value.organic || [])
          .map(it => `[${it.title}] ${it.snippet} (URL: ${it.link})`)
          .join('\n\n');
        
        if (snippets) liveResults = await geminiExtract(snippets);
      } catch (e) {
        console.error('[discount] Live Search/Extraction Error:', e.message);
      }
    }

    // 3. 합치기 및 중복 제거
    // Featured + DB + Live 순서로 결합 (Featured를 앞에 두어 항상 보이게 함)
    const combined = [...FEATURED_DISCOUNTS, ...formattedDb, ...liveResults];
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
      featuredCount: FEATURED_DISCOUNTS.length,
      discounts: final
    });
  } catch (e) {
    console.error('[discount] Fatal Error:', e.message);
    // 에러 발생 시에도 최소한 Featured 데이터는 반환
    return res.status(200).json({ 
      ok: true, 
      error: e.message, 
      discounts: FEATURED_DISCOUNTS 
    });
  }
}
