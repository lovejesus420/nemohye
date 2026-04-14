'use server';

import { parseBenefitData } from '../lib/gemini-parser.js';

const SERPER_API_URL = 'https://google.serper.dev/search';
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// 네이버 블로그·카페에서 최신 생활 후기가 많은 곳을 우선 탐색한 뒤
// 일반 검색으로 커버리지를 보완하는 3개 쿼리 세트
const DEFAULT_QUERIES = [
  '2026년 4월 지자체 생활 혜택 할인 후기 site:blog.naver.com',
  '2026년 4월 지자체 생활 혜택 할인 후기 site:cafe.naver.com',
  '2026년 4월 지자체 혜택 청년 할인 신청방법',
];

/**
 * Serper API로 구글 검색 결과를 가져옵니다.
 *
 * @param {string} query - 검색 쿼리
 * @param {number} num   - 가져올 결과 수 (기본 10)
 * @returns {Promise<Array<{title:string, snippet:string, link:string}>>}
 */
async function searchGoogle(query, num = 10) {
  if (!SERPER_API_KEY) {
    throw new Error('[benefit-explorer] SERPER_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetch(SERPER_API_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl: 'kr',   // 한국 지역
      hl: 'ko',   // 한국어
      num,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[benefit-explorer] Serper API 오류 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.organic ?? []).slice(0, num);
}

/**
 * 검색 결과 한 건을 Gemini가 읽기 좋은 텍스트로 변환합니다.
 *
 * @param {{ title:string, snippet:string, link?:string }} item
 * @returns {string}
 */
function toAnalysisText(item) {
  const parts = [`제목: ${item.title ?? ''}`, `내용: ${item.snippet ?? ''}`];
  if (item.link) parts.push(`출처: ${item.link}`);
  return parts.join('\n');
}

/**
 * 구글 검색 → Gemini 파싱 → 정제된 혜택 배열 반환.
 *
 * 여러 쿼리를 병렬로 검색하고 URL 기준으로 중복을 제거한 뒤
 * 각 결과를 Gemini에 개별 병렬 전송합니다.
 * 한 쿼리·한 건이 실패해도 나머지 결과에는 영향을 주지 않습니다.
 *
 * @param {string|string[]} [queries] - 검색 쿼리 하나 또는 배열 (기본값: DEFAULT_QUERIES)
 * @returns {Promise<Array<import('../lib/gemini-parser.js').BenefitData>>}
 *          파싱 성공한 혜택 객체 배열 (실패 건은 제외)
 */
export async function exploreBenefits(queries = DEFAULT_QUERIES) {
  const queryList = Array.isArray(queries) ? queries : [queries];

  // 1. Search — 모든 쿼리를 병렬로 검색
  const searchResults = await Promise.allSettled(
    queryList.map((q) => searchGoogle(q))
  );

  // 검색 실패 쿼리 로깅 후 성공 결과만 수집
  const allItems = [];
  searchResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[benefit-explorer] "${queryList[i]}" → ${r.value.length}건`);
      allItems.push(...r.value);
    } else {
      console.error(`[benefit-explorer] 검색 실패 ("${queryList[i]}"): ${r.reason?.message}`);
    }
  });

  if (allItems.length === 0) {
    console.warn('[benefit-explorer] 모든 쿼리에서 검색 결과가 없습니다.');
    return [];
  }

  // 2. Refine — URL 기준 중복 제거 후 분석용 텍스트로 변환
  const seen = new Set();
  const uniqueTexts = allItems
    .filter((item) => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .map(toAnalysisText);

  console.log(`[benefit-explorer] 중복 제거 후 ${uniqueTexts.length}건 분석 시작`);

  // 3. Extract — 각 결과를 Gemini 파서에 개별 병렬 전송
  const settled = await Promise.allSettled(uniqueTexts.map((t) => parseBenefitData(t)));

  // 4. Return — 성공(fulfilled)하고 null이 아닌 결과만 모아 반환
  const benefits = settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);

  const failCount = settled.length - benefits.length;
  if (failCount > 0) {
    console.warn(`[benefit-explorer] ${failCount}건 파싱 실패 (총 ${settled.length}건 중)`);
  }

  console.log(`[benefit-explorer] 최종 혜택 ${benefits.length}건 추출 완료`);
  return benefits;
}
