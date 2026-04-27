// api/cron/collect-benefits.js — Vercel Cron Job Endpoint
import { exploreBenefits } from '../../services/benefit-explorer.js';
import { scrapeTravelmonthBenefits } from '../../services/travelmonth-benefit-scraper.js';
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
  { pattern: 'finance',  keyword: '청년 우대형 청약통장 금리',  site: '' },
  { pattern: 'finance',  keyword: '주요 은행 청년 적금 혜택',    site: '' },
  { pattern: 'finance',  keyword: '카드사 캐시백 지원금 이벤트',  site: '' },
  { pattern: 'event',    keyword: '여행가는 달 혜택 숙박 할인',  site: 'site:korean.visitkorea.or.kr' },
  { pattern: 'year',     keyword: '지원금 혜택',          site: 'site:blog.naver.com' },
  { pattern: 'year',     keyword: '복지 혜택 신청 방법',   site: 'site:blog.naver.com' },
  { pattern: 'latest',   keyword: '복지 혜택',             site: 'site:blog.naver.com' },
  { pattern: 'official', keyword: '시청 공고 지원금',       site: '' },
  { pattern: 'instagram', keyword: '"gg24_kr" 혜택 지원금', site: 'site:instagram.com' },
  { pattern: 'instagram', keyword: '"iammoneytip" 지원금',  site: '' },
];

const MAX_PATTERNS_PER_RUN = 3;
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

export default async function handler(req, res) {
  const authHeader  = req.headers['authorization'];
  const querySecret = req.query.secret;
  const cronSecret  = process.env.CRON_SECRET;
  const isAuthorized = (authHeader === `Bearer ${cronSecret}`) || (querySecret === cronSecret);

  if (cronSecret && !isAuthorized) return res.status(401).json({ error: '인증 실패' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startedAt = Date.now();
  const rawIndex   = parseInt(req.query.regionIndex ?? '0', 10);
  const regionIndex = Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < PRIORITY_REGIONS.length ? rawIndex : 0;
  const region = PRIORITY_REGIONS[regionIndex];

  let deleted = 0;
  try { deleted = await deleteExpiredBenefits(); } catch (e) {}

  const report = [];
  const patterns = QUERY_PATTERNS.slice(0, MAX_PATTERNS_PER_RUN);

  for (let pi = 0; pi < patterns.length; pi++) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > SOFT_TIMEOUT_MS) break;

    const pat   = patterns[pi];
    const query = buildQuery(region.name, pat);
    
    try {
      let benefits = [];
      if (region.name === '할인') {
        // 특정 할인 행사 사이트 직접 스크래핑
        benefits = await scrapeTravelmonthBenefits();
      } else {
        // 일반 검색 기반 수집
        benefits = await exploreBenefits(query);
      }

      if (benefits.length > 0) {
        const saved = await saveBenefits(benefits, {
          targetRegion: region.dbRegion,
          targetGroup:  region.group,
          sourceQuery:  region.name === '할인' ? '스크래핑:여행가는달' : query,
        });
        report.push({ query: region.name === '할인' ? '할인스크래핑' : query, saved, status: 'ok' });
      }
    } catch (e) {
      report.push({ query, saved: 0, status: 'error', error: e.message });
    }
    if (pi < patterns.length - 1) await sleep(INTER_QUERY_DELAY_MS);
  }

  return res.status(200).json({
    ok: true,
    region: region.name,
    totalSaved: report.reduce((s, r) => s + (r.saved || 0), 0),
    report
  });
}
