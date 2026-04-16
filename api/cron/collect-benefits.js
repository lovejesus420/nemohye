// api/cron/collect-benefits.js — Vercel Cron Job Endpoint
// 스케줄: 매일 새벽 3시 KST (UTC 18:00) — vercel.json 참고
//
// ── 타임아웃 대응 전략 ───────────────────────────────────────────────────────
// Vercel 무료 티어 함수 제한: 300초
// 1회 크론 호출 = 지역 1개 × 최대 3개 쿼리 패턴만 처리 후 즉시 반환
//
// 전체 지역을 순차 처리하려면 ?regionIndex=0, 1, 2 ... 로 나눠 호출하세요.
// Vercel Cron에서 여러 스케줄을 등록하거나, 수동 호출로 인덱스를 올려가며 실행합니다.
// ─────────────────────────────────────────────────────────────────────────────

import { exploreBenefits } from '../../services/benefit-explorer.js';
import { saveBenefits, deleteExpiredBenefits } from '../../lib/db.js';

// ── 수집 대상 지역 (우선순위 순)
const PRIORITY_REGIONS = [
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

// ── 쿼리 패턴 세트
const QUERY_PATTERNS = [
  { pattern: 'year',      keyword: '지원금 혜택',          site: 'site:blog.naver.com' },
  { pattern: 'year',      keyword: '복지 혜택 신청 방법',   site: 'site:blog.naver.com' },
  { pattern: 'year',      keyword: '생활 혜택 할인',        site: 'site:cafe.naver.com' },
  { pattern: 'year',      keyword: '지원금 후기',           site: 'site:tistory.com'    },
  { pattern: 'latest',    keyword: '복지 혜택',             site: 'site:blog.naver.com' },
  { pattern: 'latest',    keyword: '지원금 신청 후기',       site: ''                    },
  { pattern: 'official',  keyword: '시청 공고 지원금',       site: ''                    },
  { pattern: 'official',  keyword: '구청 복지 혜택 신청',    site: ''                    },
  // ── 인스타그램 계정 기반 패턴 (@gg24_kr 경기도 공식 · @iammoneytip 금융/지원금 정보)
  { pattern: 'instagram', keyword: '"gg24_kr" 혜택 지원금', site: 'site:instagram.com'  },
  { pattern: 'instagram', keyword: '"iammoneytip" 지원금',  site: ''                    },
];

// ── 1회 실행 제한 — Vercel 300s 타임아웃 방지
// 패턴 1개당 예상 소요: Serper ~2s + Gemini 2배치 × ~5s + 딜레이 8s ≈ 25s
// 패턴 3개 × 1지역 = 약 75~120s → 300s 제한 내에서 안정적으로 여러 패턴 수집 가능
const MAX_PATTERNS_PER_RUN = 3;       // 수집량 증대를 위해 3으로 상향
const SOFT_TIMEOUT_MS      = 260_000; // 260초 (안전망 강화)

// 쿼리 패턴 사이 최소 딜레이 (Serper 레이트 리밋 방지)
const INTER_QUERY_DELAY_MS = 1_500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildQuery(regionName, pat) {
  const year = new Date().getFullYear();
  let base;
  if      (pat.pattern === 'latest')    base = `최신 ${regionName} ${pat.keyword}`;
  else if (pat.pattern === 'official')  base = `${regionName} ${pat.keyword}`;
  // 인스타그램 패턴: 계정명 기반이므로 지역명 없이 연도만 붙임
  else if (pat.pattern === 'instagram') base = `${year} ${pat.keyword}`;
  else                                  base = `${year}년 ${regionName} ${pat.keyword}`;
  return pat.site ? `${base} ${pat.site}` : base;
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── 인증
  const authHeader  = req.headers['authorization'];
  const querySecret = req.query.secret;
  const cronSecret  = process.env.CRON_SECRET;
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

  // ── 처리할 지역 결정
  // ?regionIndex=N  → PRIORITY_REGIONS[N] 한 개만 처리
  // 파라미터 없음   → index 0 (서울 전체) 만 처리
  const rawIndex   = parseInt(req.query.regionIndex ?? '0', 10);
  const regionIndex = Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < PRIORITY_REGIONS.length
    ? rawIndex
    : 0;
  const region = PRIORITY_REGIONS[regionIndex];

  console.log(
    `[cron] 시작 — 지역: "${region.name}" (index ${regionIndex}/${PRIORITY_REGIONS.length - 1}), ` +
    `최대 패턴 ${MAX_PATTERNS_PER_RUN}개`
  );

  // ── 만료 데이터 정리 (실패해도 계속 진행)
  let deleted = 0;
  try {
    deleted = await deleteExpiredBenefits();
    console.log(`[cron] ✅ 만료 혜택 ${deleted}건 삭제`);
  } catch (e) {
    console.error(`[cron] ⚠️  만료 데이터 삭제 예외 (무시): ${e?.message ?? e}`);
  }

  // ── 쿼리 패턴 순차 처리 (MAX_PATTERNS_PER_RUN 개 까지)
  const report = [];
  const patterns = QUERY_PATTERNS.slice(0, MAX_PATTERNS_PER_RUN);

  for (let pi = 0; pi < patterns.length; pi++) {
    // 소프트 타임아웃 체크 — Vercel 300s 전에 안전하게 탈출
    const elapsed = Date.now() - startedAt;
    if (elapsed > SOFT_TIMEOUT_MS) {
      console.warn(`[cron] ⚠️  소프트 타임아웃(${(elapsed / 1000).toFixed(1)}s) — 루프 조기 종료`);
      break;
    }

    const pat   = patterns[pi];
    const query = buildQuery(region.name, pat);
    console.log(`[cron] 패턴 ${pi + 1}/${patterns.length}: "${query}"`);

    try {
      const benefits = await exploreBenefits(query);

      if (benefits.length === 0) {
        console.log(`[cron] "${query}" → 0건 (empty)`);
        report.push({ query, saved: 0, status: 'empty' });
      } else {
        const saved = await saveBenefits(benefits, {
          targetRegion: region.dbRegion,
          targetGroup:  region.group,
          sourceQuery:  query,
        });
        console.log(`[cron] ✅ "${query}" → ${saved}건 저장`);
        report.push({ query, saved, status: 'ok' });
      }
    } catch (e) {
      const errMsg = e?.message ?? String(e);
      console.error(`[cron] ❌ 수집 실패 ("${query}"): ${errMsg}`);
      report.push({ query, saved: 0, status: 'error', error: errMsg });
    }

    // 마지막 패턴 이후엔 딜레이 불필요
    if (pi < patterns.length - 1) {
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  const totalSaved = report.reduce((s, r) => s + (r.saved ?? 0), 0);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`[cron] 완료 — ${totalSaved}건 저장, ${elapsedSec}s 소요`);

  // DB 저장 완료 즉시 반환
  return res.status(200).json({
    ok:          true,
    message:     `${totalSaved}건 수집 완료 (${elapsedSec}s)`,
    region:      region.name,
    regionIndex,
    nextIndex:   regionIndex + 1 < PRIORITY_REGIONS.length ? regionIndex + 1 : null,
    deleted,
    patternsRun: report.length,
    report,
    collectedAt: new Date().toISOString(),
  });
}
