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

// ─────────────────────────────────────────────────────────────────────────────
// 쿼리 패턴 세트 — pattern 값에 따라 접두어가 달라집니다.
//   'year'     → "2026년 [지역] [키워드]"    (연도 고정, 월 없음 → 범위 확대)
//   'latest'   → "최신 [지역] [키워드]"       (날짜 무관, 최신 후기 수집)
//   'official' → "[지역] [키워드]"            (시청·구청 공고 등 공식 출처)
// ─────────────────────────────────────────────────────────────────────────────
const QUERY_PATTERNS = [
  // ── 연도 기반 (blog / cafe)
  { pattern: 'year',     keyword: '지원금 혜택',          site: 'site:blog.naver.com' },
  { pattern: 'year',     keyword: '복지 혜택 신청 방법',   site: 'site:blog.naver.com' },
  { pattern: 'year',     keyword: '생활 혜택 할인',        site: 'site:cafe.naver.com' },
  { pattern: 'year',     keyword: '지원금 후기',           site: 'site:tistory.com'    },

  // ── 최신 기반 (날짜 제약 없이 더 많은 결과 수집)
  { pattern: 'latest',   keyword: '복지 혜택',             site: 'site:blog.naver.com' },
  { pattern: 'latest',   keyword: '지원금 신청 후기',       site: ''                    },

  // ── 공식 공고 (시청·구청·정부 사이트)
  { pattern: 'official', keyword: '시청 공고 지원금',       site: ''                    },
  { pattern: 'official', keyword: '구청 복지 혜택 신청',    site: ''                    },
];

// API 호출 사이 딜레이 (ms) — Serper / Gemini 레이트 리밋 방지
const INTER_REQUEST_DELAY_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────────

/** 지정된 ms 만큼 대기합니다 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 지역명 + 쿼리 패턴으로 검색 쿼리를 조립합니다.
 *
 * @param {string} regionName
 * @param {{ pattern: string, keyword: string, site: string }} pat
 * @returns {string}
 */
function buildQuery(regionName, pat) {
  const year = new Date().getFullYear();

  let base;
  if (pat.pattern === 'latest') {
    // "최신 서울 복지 혜택" — 날짜 무관, 최근 후기 위주
    base = `최신 ${regionName} ${pat.keyword}`;
  } else if (pat.pattern === 'official') {
    // "서울 시청 공고 지원금" — 공식 출처 위주
    base = `${regionName} ${pat.keyword}`;
  } else {
    // 'year' — "2026년 서울 지원금 혜택" (월 제거로 검색 범위 확대)
    base = `${year}년 ${regionName} ${pat.keyword}`;
  }

  return pat.site ? `${base} ${pat.site}` : base;
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── 보안: Vercel Cron 토큰 검증
 // 헤더(Vercel 시스템용) 또는 쿼리(브라우저 테스트용) 둘 다 허용
const authHeader = req.headers['authorization'];
const querySecret = req.query.secret; // 주소창의 ?secret= 부분을 읽음
const cronSecret = process.env.CRON_SECRET;

const isAuthorized = 
  (authHeader === `Bearer ${cronSecret}`) || 
  (querySecret === cronSecret);

if (cronSecret && !isAuthorized) {
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
    console.log(`[cron] ✅ 만료 혜택 ${deleted}건 삭제`);
  } catch (e) {
    // deleteExpiredBenefits는 내부에서도 catch하므로 여기까지 오는 경우는 거의 없음
    console.error(`[cron] ⚠️  만료 데이터 삭제 중 예외 (수집은 계속 진행): ${e?.message ?? e}`);
  }

  // ── 2. 지역 × 키워드 조합으로 순차 수집
  //    순차(for-of) 실행: 병렬로 돌리면 Serper/Gemini 레이트 리밋에 걸릴 수 있음
  for (const region of PRIORITY_REGIONS) {
    for (const pat of QUERY_PATTERNS) {
      const query = buildQuery(region.name, pat);

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
        const errMsg = e?.message ?? String(e);
        console.error(`[cron] ❌ 수집 실패 ("${query}"): ${errMsg}`);
        report.push({ region: region.name, query, saved: 0, status: 'error', error: errMsg });
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
    totalTargets: PRIORITY_REGIONS.length * QUERY_PATTERNS.length,
    report,
    collectedAt: new Date().toISOString(),
  });
}
