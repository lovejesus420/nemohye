'use server';

import { parseBenefitDataBatch } from '../lib/gemini-parser.js';

const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_NEWS_URL   = 'https://google.serper.dev/news';
const SERPER_API_KEY    = process.env.SERPER_API_KEY;

const DEFAULT_QUERIES = [
  '지자체 생활 혜택 할인 후기',
  '청년 지원금 신청 방법',
];

/**
 * Serper API로 구글 검색 결과를 가져옵니다.
 *
 * @param {string} query
 * @param {number} num
 * @param {'search'|'news'} type
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
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[benefit-explorer] Serper API 오류 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.organic ?? data.news ?? []).slice(0, num);
}

/**
 * 구글 검색(웹 + 뉴스) 결과를 모아 Gemini에 한 번에 전송하고 혜택 배열을 반환합니다.
 *
 * - site: 제약 쿼리는 site 제거 폴백 검색도 병렬 실행합니다.
 * - 뉴스 검색을 추가로 실행해 커버리지를 높입니다.
 * - URL 기준 중복 제거 후 전체를 배치로 Gemini에 전송합니다.
 *
 * @param {string|string[]} [queries]
 * @returns {Promise<import('../lib/gemini-parser.js').BenefitData[]>}
 */
export async function exploreBenefits(queries = DEFAULT_QUERIES) {
  const queryList = Array.isArray(queries) ? queries : [queries];

  // 실행할 검색 작업 목록
  const tasks = [];
  for (const q of queryList) {
    tasks.push({ query: q, type: 'search' });
    tasks.push({ query: q, type: 'news' });

    // site: 제약이 있는 쿼리는 제약 없는 폴백도 추가
    if (q.includes('site:')) {
      const qWithoutSite = q.replace(/\s*site:\S+/g, '').trim();
      tasks.push({ query: qWithoutSite, type: 'search' });
    }
  }

  // 모든 검색 병렬 실행
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
  const uniqueItems = allItems.filter((item) => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });

  console.log(`[benefit-explorer] 중복 제거 후 ${uniqueItems.length}건 → Gemini 배치 전송`);

  // 전체를 한 번의 Gemini 호출로 처리
  const benefits = await parseBenefitDataBatch(uniqueItems);

  console.log(`[benefit-explorer] 최종 혜택 ${benefits.length}건 추출 완료`);
  return benefits;
}
