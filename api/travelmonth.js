import { scrapeTravelmonthBenefits } from '../services/travelmonth-benefit-scraper.js';

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const CATEGORY_ICON_MAP = {
  교통: '🚆',
  숙박: '🏨',
  여행상품: '🧳',
  '인구감소지역 특별할인': '🗺️',
  '지역 여행할인': '🎫',
};

function toTravelBenefitCard(benefit, index) {
  const category = benefit['카테고리'] || '여행가는 달';
  const title = benefit['혜택명'] || '여행가는 달 혜택';
  const institution = benefit['지원대상'] || '한국관광공사 여행가는 달';
  const description = benefit['지원내용'] || '';
  const howToApply = benefit['신청방법'] || '';
  const deadline = benefit['마감일'] || '연중 상시';
  const applyUrl = benefit['출처'] || 'https://korean.visitkorea.or.kr/travelmonth/main.do';

  return {
    id: `travelmonth-${index}-${title}`,
    source: '한국관광공사',
    sourceIcon: '🗺️',
    category,
    categoryIcon: CATEGORY_ICON_MAP[category] || '🎁',
    scope: '전국',
    isUrgent: false,
    isHidden: false,
    title,
    institution,
    description,
    amount: description.split('\n')[0] || '상세 페이지 참조',
    deadline,
    requiredDocuments: [],
    howToApply,
    applyUrl,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return res.status(200).json({
      ok: true,
      fromCache: true,
      count: cache.length,
      benefits: cache,
      fetchedAt: new Date(cacheAt).toISOString(),
    });
  }

  try {
    const scraped = await scrapeTravelmonthBenefits();
    const benefits = scraped.map(toTravelBenefitCard);

    cache = benefits;
    cacheAt = Date.now();

    return res.status(200).json({
      ok: true,
      fromCache: false,
      count: benefits.length,
      benefits,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[travelmonth] ${error?.message ?? error}`);
    return res.status(500).json({
      ok: false,
      error: error?.message ?? 'Failed to scrape travelmonth benefits',
      benefits: [],
    });
  }
}

