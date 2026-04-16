'use server';

import { parseBenefitDataBatch } from '../lib/gemini-parser.js';

const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_NEWS_URL   = 'https://google.serper.dev/news';
const SERPER_API_KEY    = process.env.SERPER_API_KEY;

// Gemini 무료 티어 레이트 리밋 + Vercel 300s 타임아웃 대응
// 패턴 1개 기준 최대 소요: 5건 × 2배치 + 딜레이 8s ≈ 20~30s
const GEMINI_BATCH_SIZE     = 5;     // 한 번에 Gemini에 보낼 검색 결과 수
const GEMINI_MAX_BATCHES    = 2;     // 최대 배치 횟수
const GEMINI_BATCH_DELAY_MS = 10_000; // 딜레이를 10초로 상향

const DEFAULT_QUERIES = [
  '지자체 생활 혜택 할인 후기',
  '청년 지원금 신청 방법',
  'site:instagram.com "gg24_kr" 2026 혜택',
  '"iammoneytip" 지원금 혜택',
];

// 인스타그램 전용 계정 쿼리 — site: 제약 포함 여부로 판별
const INSTAGRAM_ACCOUNTS = ['gg24_kr', 'iammoneytip'];
const isInstagramQuery = (q) =>
  q.includes('instagram.com') || INSTAGRAM_ACCOUNTS.some((a) => q.includes(a));

/** ms 대기 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * 배열을 chunkSize 크기의 청크 배열로 분할합니다.
 *
 * @template T
 * @param {T[]} arr
 * @param {number} chunkSize
 * @returns {T[][]}
 */
function chunkArray(arr, chunkSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 구글 검색(웹 + 뉴스) 결과를 모아 Gemini에 청크 단위로 전송하고 혜택 배열을 반환합니다.
 *
 * - site: 제약 쿼리는 site 제거 폴백 검색도 병렬 실행합니다.
 * - 뉴스 검색을 추가로 실행해 커버리지를 높입니다.
 * - URL 기준 중복 제거 후 GEMINI_BATCH_SIZE 건씩 나눠 순차 전송합니다.
 * - 배치 사이에 GEMINI_BATCH_DELAY_MS 딜레이를 삽입해 429를 방지합니다.
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

    // 인스타그램 쿼리는 news 타입 대신 계정명 기반 web 검색 추가
    // (인스타그램은 뉴스 인덱스에 거의 없음 → news 검색 비효율)
    if (isInstagramQuery(q)) {
      // site: 없는 계정명 단독 검색 — 블로그·커뮤니티 등 2차 확산 결과 포착
      if (q.includes('site:instagram.com')) {
        const qWithoutSite = q.replace(/\s*site:\S+/g, '').trim();
        tasks.push({ query: qWithoutSite, type: 'search' });
      }
    } else {
      tasks.push({ query: q, type: 'news' });

      // site: 제약이 있는 일반 쿼리는 제약 없는 폴백도 추가
      if (q.includes('site:')) {
        const qWithoutSite = q.replace(/\s*site:\S+/g, '').trim();
        tasks.push({ query: qWithoutSite, type: 'search' });
      }
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
      console.error(
        `[benefit-explorer] ❌ 검색 실패 [${type}] ("${query}"): ${r.reason?.message}`
      );
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

  // GEMINI_BATCH_SIZE 단위로 분할
  const chunks = chunkArray(uniqueItems, GEMINI_BATCH_SIZE);
  console.log(
    `[benefit-explorer] 중복 제거 후 ${uniqueItems.length}건 → ` +
    `${chunks.length}개 배치(${GEMINI_BATCH_SIZE}건씩) 순차 전송 시작`
  );

  // 배치 순차 실행 (병렬 금지 — 429 유발)
  const allBenefits = [];
  for (let i = 0; i < chunks.length && i < GEMINI_MAX_BATCHES; i++) {
    const chunk = chunks[i];
    console.log(`[benefit-explorer] 배치 ${i + 1}/${chunks.length} (${chunk.length}건) Gemini 전송`);

    try {
      const results = await parseBenefitDataBatch(chunk);
      allBenefits.push(...results);
      console.log(`[benefit-explorer] 배치 ${i + 1} 완료 → ${results.length}건 추출`);
    } catch (e) {
      console.error(`[benefit-explorer] ❌ 배치 ${i + 1} 실패: ${e?.message ?? e}`);
    }

    // 마지막 배치 이후엔 딜레이 불필요
    if (i < chunks.length - 1) {
      console.log(`[benefit-explorer] 다음 배치까지 ${GEMINI_BATCH_DELAY_MS / 1000}초 대기...`);
      await sleep(GEMINI_BATCH_DELAY_MS);
    }
  }

  console.log(`[benefit-explorer] 최종 혜택 ${allBenefits.length}건 추출 완료`);
  return allBenefits;
}
