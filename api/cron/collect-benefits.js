// api/cron/collect-benefits.js — Vercel Cron Job Endpoint
import { exploreBenefits } from '../../services/benefit-explorer.js';
import { scrapeTravelmonthBenefits } from '../../services/travelmonth-benefit-scraper.js';
import { scrapeMartFlyers } from '../../services/mart-flyer-scraper.js';
import { saveBenefits, deleteExpiredBenefits } from '../../lib/db.js';

const PRIORITY_REGIONS = [
  { name: '전국',  dbRegion: '전국',        group: '전체' },
  { name: '할인',  dbRegion: '전국',        group: '할인행사' }, // 전국 할인 행사 전용
  { name: '서울',  dbRegion: '서울특별시',  group: '전체' },
  { name: '경기',  dbRegion: '경기도',      group: '전체' },
  { name: '인천',  dbRegion: '인천광역시',  group: '전체' },
  { name: '파주',  dbRegion: '경기도',      group: '전체' },
  { name: '고양',  dbRegion: '경기도',      group: '전체' },
  { name: '수원',  dbRegion: '경기도',      group: '전체' },
  { name: '성남',  dbRegion: '경기도',      group: '전체' },
  { name: '용인',  dbRegion: '경기도',      group: '전체' },
  { name: '서울',  dbRegion: '서울특별시',  group: '청년' },
  { name: '경기',  dbRegion: '경기도',      group: '청년' },
];

const QUERY_PATTERNS = [
  { pattern: 'discount', keyword: '네이버 할인쿠폰 이벤트 혜택', site: 'site:blog.naver.com' },
  { pattern: 'discount', keyword: '오늘의 네이버 쇼핑 라이브 쿠폰 혜택', site: '' },
  { pattern: 'discount', keyword: '이마트 롯데마트 홈플러스 전단지 할인 행사', site: '' },
  { pattern: 'discount', keyword: '롯데백화점 신세계백화점 현대백화점 정기 세일 이벤트', site: '' },
  { pattern: 'discount', keyword: '쿠팡 11번가 G마켓 최신 특가 할인 이벤트', site: '' },
  { pattern: 'discount', keyword: 'CU GS25 세븐일레븐 1+1 2+1 이달의 행사', site: '' },
  { pattern: 'discount', keyword: '야놀자 여기어때 아고다 숙박 할인 프로모션', site: '' },
  { pattern: 'discount', keyword: '무신사 올리브영 브랜드 세일 할인 혜택', site: '' },
  { pattern: 'discount', keyword: '삼성닷컴 LG전자 가전 할인 행사 이벤트', site: '' },
  { pattern: 'discount', keyword: '배달의민족 쿠팡이츠 요기요 이번주 할인 쿠폰', site: '' },
  { pattern: 'finance',  keyword: '청년 우대형 청약통장 금리',  site: '' },
];

const MAX_PATTERNS_PER_RUN = 8; // 수집 범위 확대 (할인 카테고리 추가)
const SOFT_TIMEOUT_MS      = 260_000;
const INTER_QUERY_DELAY_MS = 1_500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildQuery(regionName, pat) {
  const year = new Date().getFullYear();
  let base;
  if      (pat.pattern === 'event')     base = `${pat.keyword}`;
  if      (pat.pattern === 'finance')   base = `${year} ${pat.keyword}`; 
  else if (pat.pattern === 'latest')    base = `최신 ${regionName} ${pat.keyword}`;
  else if (pat.pattern === 'official')  base = `${regionName} ${pat.keyword}`;
  else if (pat.pattern === 'instagram') base = `${year} ${pat.keyword}`;
  else                                  base = `${year}년 ${regionName} ${pat.keyword}`;
  return pat.site ? `${base} ${pat.site}` : base;
}

const DISCOUNT_QUERIES = {
  '마트·생필품': [
    '홈플러스 공식 홈페이지 이벤트 행사 할인',
    '다이소몰 이벤트 기획전 할인 혜택',
    '이마트 전단 광고 이번주 행사 할인',
    '이마트 트레이더스 추천 상품 행사',
    '코스트코 코리아 이번주 할인 품목',
    '롯데마트 GO 앱 전용 할인 행사'
  ],
  '음식·배달': [
    '배달의민족 이번주 브랜드 할인 쿠폰',
    '쿠팡이츠 무료배달 브랜드 할인 프로모션',
    '요기요 오늘의 할인 구독 혜택',
    '맥도날드 버거킹 롯데리아 이달의 행사'
  ],
  '패션·뷰티': [
    '무신사 브랜드 세일 할인 코드',
    '올리브영 이달의 올영세일 쿠폰',
    '지그재그 에이블리 할인 쿠폰'
  ],
  '전자·가전': [
    '삼성닷컴 LG전자 가전 할인 행사',
    '하이마트 전자랜드 가전 특가'
  ],
  '여행·레저': [
    '야놀자 여기어때 아고다 숙박 할인',
    '대한항공 아시아나 항공권 프로모션'
  ],
  '온라인쇼핑': [
    '쿠팡 11번가 G마켓 최신 할인 행사',
    'SSG닷컴 마켓컬리 신규 가입 혜택'
  ]
};

export default async function handler(req, res) {
  const authHeader  = req.headers['authorization'];
  const querySecret = req.query.secret;
  const cronSecret  = process.env.CRON_SECRET;
  const isAuthorized = (authHeader === `Bearer ${cronSecret}`) || (querySecret === cronSecret);

  if (cronSecret && !isAuthorized) return res.status(401).json({ error: '인증 실패' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startedAt = Date.now();
  // 기본적으로 '할인' 지역(index 1)부터 시작하거나 쿼리로 지정
  const regionIndex = parseInt(req.query.regionIndex ?? '1', 10);
  const region = PRIORITY_REGIONS[regionIndex] || PRIORITY_REGIONS[1];

  let deleted = 0;
  try { deleted = await deleteExpiredBenefits(); } catch (e) {}

  const report = [];

  if (region.name === '할인') {
    // 1. 특정 테마 직접 스크래핑
    const travel = await scrapeTravelmonthBenefits().catch(() => []);
    const martScrap = await scrapeMartFlyers().catch(() => []);
    
    // 2. 검색 기반 카테고리별 수집
    for (const [catName, queries] of Object.entries(DISCOUNT_QUERIES)) {
      console.log(`[cron] Collecting category: ${catName}...`);
      for (const query of queries.slice(0, 2)) { // 각 기업별 대표 쿼리 2개씩
        try {
          const benefits = await exploreBenefits(query);
          if (benefits.length > 0) {
            const saved = await saveBenefits(benefits, {
              targetRegion: '전국',
              targetGroup: '할인행사',
              category: catName, // 카테고리 태깅
              sourceQuery: query,
            });
            report.push({ query, saved, category: catName, status: 'ok' });
          }
          await sleep(2000); // 레이트 리밋 방지
        } catch (e) {
          report.push({ query, status: 'error', error: e.message });
        }
      }
    }
    
    // 스크래핑 결과 저장
    if (travel.length > 0) await saveBenefits(travel, { targetRegion: '전국', targetGroup: '할인행사', category: '여행·레저', sourceQuery: '스크래핑:여행' });
    if (martScrap.length > 0) await saveBenefits(martScrap, { targetRegion: '전국', targetGroup: '할인행사', category: '마트·생필품', sourceQuery: '스크래핑:마트' });

  } else {
    // 일반 지역 정책 수집
    const patterns = QUERY_PATTERNS.slice(0, MAX_PATTERNS_PER_RUN);
    for (let pi = 0; pi < patterns.length; pi++) {
      const pat = patterns[pi];
      const query = buildQuery(region.name, pat);
      try {
        const benefits = await exploreBenefits(query);
        if (benefits.length > 0) {
          const saved = await saveBenefits(benefits, {
            targetRegion: region.dbRegion,
            targetGroup: pat.pattern === 'discount' ? '할인행사' : region.group,
            sourceQuery: query,
          });
          report.push({ query, saved, status: 'ok' });
        }
      } catch (e) {
        report.push({ query, status: 'error', error: e.message });
      }
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  return res.status(200).json({
    ok: true,
    region: region.name,
    totalSaved: report.reduce((s, r) => s + (r.saved || 0), 0),
    report
  });
}
