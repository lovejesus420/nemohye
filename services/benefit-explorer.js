'use server';

import { parseBenefitData } from '../lib/gemini-parser.js';

const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_NEWS_URL   = 'https://google.serper.dev/news';
const SERPER_API_KEY    = process.env.SERPER_API_KEY;

// DEFAULT_QUERIES: cron이 직접 쿼리를 전달하지 않을 때만 사용 (fallback)
const DEFAULT_QUERIES = [
  '지자체 생활 혜택 할인 후기',
  '청년 지원금 신청 방법',
];

/**
 * Serper API로 구글 검색 결과를 가져옵니다.
 *
 * @param {string} query   - 검색 쿼리
 * @param {number} num     - 가져올 결과 수 (기본 10)
 * @param {'search'|'news'} type - 검색 유형 (기본 'search')
 * @returns {Promise<Array<{title:string, snippet:string, link:string}>>}
 */
async function searchGoogle(query, num = 10, type = 'search') {
  if (!SERPER_API_KEY) {
    throw new Error('[benefit-explorer] SERPER_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const endpoint = type === 'news' ? SERPER_NEWS_URL : SERPER_SEARCH_URL;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl: 'kr',
      hl: 'ko',
      num,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[benefit-explorer] Serper API 오류 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  // /news 엔드포인트는 'news' 키, /search 엔드포인트는 'organic' 키 사용
  return (data.organic ?? data.news ?? []).slice(0, num);
}

/**
 * 검색 결과 한 건을 Gemini가 읽기 좋은 텍스트로 변환합니다.
 */
function toAnalysisText(item) {
  const parts = [`제목: ${item.title ?? ''}`, `내용: ${item.snippet ?? ''}`];
  if (item.link) parts.push(`출처: ${item.link}`);
  return parts.join('\n');
}

/**
 * 구글 검색(웹 + 뉴스) → Gemini 파싱 → 정제된 혜택 배열 반환.
 *
 * - site: 제약이 있는 쿼리는 site: 없는 폴백 검색도 병렬 실행합니다.
 * - 뉴스 검색을 추가로 실행해 커버리지를 높입니다.
 * - URL 기준 중복을 제거한 뒤 Gemini 파싱을 병렬 수행합니다.
 *
 * @param {string|string[]} [queries]
 * @returns {Promise<Array<import('../lib/gemini-parser.js').BenefitData>>}
 */
export async function exploreBenefits(queries = DEFAULT_QUERIES) {
  const queryList = Array.isArray(queries) ? queries : [queries];

  // 각 쿼리에 대해 실행할 검색 작업 목록을 구성합니다
  // site: 제약 쿼리 → 원본 + site 제거 폴백 + 뉴스
  // 일반 쿼리       → 원본 + 뉴스
  const tasks = [];
  for (const q of queryList) {
    tasks.push({ query: q, type: 'search' });
    tasks.push({ query: q, type: 'news' });

    if (q.includes('site:')) {
      const qWithoutSite = q.replace(/\s*site:\S+/g, '').trim();
      tasks.push({ query: qWithoutSite, type: 'search' });
    }
  }

  // 모든 검색을 병렬 실행
  const searchResults = await Promise.allSettled(
    tasks.map(({ query, type }) => searchGoogle(query, 10, type))
  );

  // 결과 수집 + 상위 3개 제목 로깅
  const allItems = [];
  searchResults.forEach((r, i) => {
    const { query, type } = tasks[i];
    if (r.status === 'fulfilled') {
      const items = r.value;
      console.log(
        `[benefit-explorer] [${type}] "${query}" → ${items.length}건` +
        (items.length > 0
          ? '\n  Top3: ' + items.slice(0, 3).map((it) => it.title).join(' / ')
          : '')
      );
      allItems.push(...items);
    } else {
      console.error(`[benefit-explorer] 검색 실패 [${type}] ("${query}"): ${r.reason?.message}`);
    }
  });

  if (allItems.length === 0) {
    console.warn('[benefit-explorer] 모든 쿼리에서 검색 결과가 없습니다.');
    return [];
  }

  // URL 기준 중복 제거
  const seen = new Set();
  const uniqueTexts = allItems
    .filter((item) => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .map(toAnalysisText);

  console.log(`[benefit-explorer] 중복 제거 후 ${uniqueTexts.length}건 Gemini 분석 시작`);

  // Gemini 파싱 병렬 실행
  const settled = await Promise.allSettled(uniqueTexts.map((t) => parseBenefitData(t)));

  const benefits = settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);

  const failCount = settled.length - benefits.length;
  if (failCount > 0) {
    console.warn(`[benefit-explorer] ${failCount}건 파싱 제외 (총 ${settled.length}건 중)`);
  }

  console.log(`[benefit-explorer] 최종 혜택 ${benefits.length}건 추출 완료`);
  return benefits;
}
