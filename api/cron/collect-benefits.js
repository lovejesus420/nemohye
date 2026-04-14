// api/cron/collect-benefits.js — Vercel Cron Job Endpoint
// 스케줄: 매일 새벽 3시 KST (UTC 18:00) — vercel.json 참고
//
// Vercel은 cron 호출 시 Authorization: Bearer <CRON_SECRET> 헤더를 자동 전송합니다.
// 환경변수 CRON_SECRET을 설정해 외부 임의 호출을 차단하세요.

import { exploreBenefits } from '../../services/benefit-explorer.js';
import { saveBenefits, deleteExpiredBenefits } from '../../lib/db.js';

// ─────────────────────────────────────────────────────────────────────────────
// 수집 대상 지역 — 우선순위 순으로 정렬 (위쪽일수록 먼저 수집)
// 새로운 지역 추가 시 이 배열에만 항목을 추가하면 됩니다.
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_REGIONS = [
  // 1순위: 수도권 광역 (검색량 최다)
  { name: '서울',  dbRegion: '서울특별시',  group: '전체' },
  { name: '경기',  dbRegion: '경기도',      group: '전체' },
  { name: '인천',  dbRegion: '인천광역시',  group: '전체' },

  // 2순위: 수도권 주요 도시
  { name: '파주',  dbRegion: '경기도',      group: '전체' },
  { name: '고양',  dbRegion: '경기도',      group: '전체' },
  { name: '수원',  dbRegion: '경기도',      group: '전체' },
  { name: '성남',  dbRegion: '경기도',      group: '전체' },
  { name: '용인',  dbRegion: '경기도',      group: '전체' },

  // 3순위: 청년 특화 (전국 대상이지만 청년 그룹으로 별도 수집)
  { name: '서울',  dbRegion: '서울특별시',  group: '청년' },
  { name: '경기',  dbRegion: '경기도',      group: '청년' },

  // ── 아래에 지역 추가 시 예시 ──────────────────────────────────────────
  // { name: '부산',  dbRegion: '부산광역시',  group: '전체' },
  // { name: '대구',  dbRegion: '대구광역시',  group: '전체' },
  // { name: '대전',  dbRegion: '대전광역시',  group: '전체' },
  // { name: '광주',  dbRegion: '광주광역시',  group: '전체' },
];

// 지역명과 조합할 검색 키워드 세트
const KEYWORD_SETS = [
  { keyword: '지원금 혜택',     site: 'site:blog.naver.com' },
  { keyword: '생활 혜택 할인',  site: 'site:cafe.naver.com' },
  { keyword: '복지 지원 신청',  site: '' }, // 일반 검색 (공식 사이트 포함)
];

// API 호출 사이 딜레이 (ms) — Serper / Gemini 레이트 리밋 방지
const INTER_REQUEST_DELAY_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────────

/** 지정된 ms 만큼 대기합니다 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 지역명 + 키워드 세트로 검색 쿼리를 조립합니다.
 * @param {string} regionName  - 예: "파주"
 * @param {{ keyword: string, site: string }} kwSet
 * @returns {string}
 */
function buildQuery(regionName, kwSet) {
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const base  = `${year}년 ${month}월 ${regionName} ${kwSet.keyword}`;
  return kwSet.site ? `${base} ${kwSet.site}` : base;
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── 보안: Vercel Cron 토큰 검증
  const authHeader = req.headers['authorization'] ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: '인증 실패' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  const report    = [];

  // ── 1. 만료 데이터 정리
  let deleted = 0;
  try {
    deleted = await deleteExpiredBenefits();
    console.log(`[cron] 만료 혜택 ${deleted}건 삭제`);
  } catch (e) {
    console.error('[cron] 만료 데이터 삭제 실패:', e.message);
  }

  // ── 2. 지역 × 키워드 조합으로 순차 수집
  //    순차(for-of) 실행: 병렬로 돌리면 Serper/Gemini 레이트 리밋에 걸릴 수 있음
  for (const region of PRIORITY_REGIONS) {
    for (const kwSet of KEYWORD_SETS) {
      const query = buildQuery(region.name, kwSet);

      try {
        const benefits = await exploreBenefits(query);

        if (benefits.length === 0) {
          report.push({ region: region.name, query, saved: 0, status: 'empty' });
        } else {
          const saved = await saveBenefits(benefits, {
            targetRegion: region.dbRegion,
            targetGroup:  region.group,
            sourceQuery:  query,
          });
          console.log(`[cron] "${query}" → ${saved}건 저장`);
          report.push({ region: region.name, query, saved, status: 'ok' });
        }
      } catch (e) {
        console.error(`[cron] 수집 실패 ("${query}"):`, e.message);
        report.push({ region: region.name, query, saved: 0, status: 'error', error: e.message });
      }

      // 다음 API 호출 전 딜레이
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }

  const totalSaved = report.reduce((s, r) => s + (r.saved ?? 0), 0);
  const elapsed    = ((Date.now() - startedAt) / 1000).toFixed(1);

  return res.status(200).json({
    ok:          true,
    message:     `${totalSaved}건 수집 완료 (${elapsed}s)`,
    deleted,
    totalTargets: PRIORITY_REGIONS.length * KEYWORD_SETS.length,
    report,
    collectedAt: new Date().toISOString(),
  });
}
