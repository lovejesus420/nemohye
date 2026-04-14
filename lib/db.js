'use server';

// ── Vercel Postgres (Neon) 환경변수 우선순위 ─────────────────────────────────
//
//  Vercel 대시보드 Storage → Postgres 연결 시 자동 주입되는 변수:
//
//   POSTGRES_URL              풀링 URL (PgBouncer 경유) — 단순 SELECT에 적합
//   POSTGRES_URL_NON_POOLING  직접 연결 URL — 트랜잭션(BEGIN/COMMIT)에 필수
//   POSTGRES_PRISMA_URL       Prisma 전용 (사용 안 함)
//   POSTGRES_URL_NO_SSL       SSL 없는 URL (사용 안 함)
//
//  이 파일은 POSTGRES_URL_NON_POOLING을 Pool에, POSTGRES_URL을 폴백으로 사용합니다.
//  DATABASE_URL 변수는 이 프로젝트에서 사용하지 않습니다 (혼동 주의).
//
// ⚠️  테이블이 없으면 "relation does not exist" 에러가 납니다.
//     아래 DDL을 Neon 콘솔 SQL Editor에서 한 번 실행하세요.
//
// CREATE TABLE IF NOT EXISTS scraped_benefits (
//   id            SERIAL PRIMARY KEY,
//   benefit_data  JSONB        NOT NULL,
//   target_region TEXT         NOT NULL DEFAULT '전국',
//   target_group  TEXT         NOT NULL DEFAULT '전체',
//   source_query  TEXT         NOT NULL DEFAULT '',
//   collected_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
//   expires_at    TIMESTAMPTZ  NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_sb_region_group ON scraped_benefits (target_region, target_group);
// CREATE INDEX IF NOT EXISTS idx_sb_expires      ON scraped_benefits (expires_at);

import { Pool } from '@neondatabase/serverless';

// ── 환경변수 읽기 (POSTGRES_URL 최우선, DATABASE_URL 사용 안 함)
const POSTGRES_URL             = process.env.POSTGRES_URL             ?? '';
const POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL_NON_POOLING ?? POSTGRES_URL;

if (!POSTGRES_URL) {
  console.error(
    '[db] ❌ POSTGRES_URL 환경변수가 없습니다.\n' +
    '     Vercel 대시보드 Storage → Postgres → 프로젝트 연결 후\n' +
    '     로컬은 .env.local, 배포는 Vercel 환경변수 탭에서 추가하세요.'
  );
} else {
  // URL 앞 30자만 마스킹해서 로그 — 비밀번호 노출 방지
  const masked = POSTGRES_URL.replace(/:([^@]+)@/, ':***@');
  console.log(`[db] POSTGRES_URL 로드됨: ${masked.slice(0, 60)}...`);
  if (POSTGRES_URL_NON_POOLING !== POSTGRES_URL) {
    console.log('[db] POSTGRES_URL_NON_POOLING 별도 설정됨 (트랜잭션 Pool에 사용)');
  } else {
    console.warn('[db] ⚠️  POSTGRES_URL_NON_POOLING 미설정 — POSTGRES_URL을 Pool에도 사용 (트랜잭션 안정성 저하 가능)');
  }
}

// ── new URL()로 파싱 → 개별 파라미터 전달 (pg 내부 url.parse() 완전 우회)
function parsePoolConfig(urlString, label = '') {
  if (!urlString) return { connectionString: '' };
  try {
    const u = new URL(urlString);
    const sslmode = u.searchParams.get('sslmode');
    // sslmode=require / verify-full → SSL 강제, 없거나 disable → SSL 끔
    const ssl = (!sslmode || sslmode === 'require' || sslmode === 'verify-full')
      ? { rejectUnauthorized: false }
      : false;

    return {
      host:     u.hostname,
      port:     u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, ''),
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl,
    };
  } catch (e) {
    console.error(
      `[db] ❌ ${label} URL 파싱 실패: ${e.message}\n` +
      '     형식 예시: postgresql://user:pass@host.neon.tech/dbname?sslmode=require'
    );
    // 폴백: connectionString 그대로 — url.parse() 경고 재발 가능하나 연결은 유지
    return { connectionString: urlString };
  }
}

// Pool (트랜잭션용) — NON_POOLING 우선
const pool = new Pool(parsePoolConfig(POSTGRES_URL_NON_POOLING, 'POSTGRES_URL_NON_POOLING'));

// ── 공통 에러 로거
function logDbError(label, e) {
  const msg  = e?.message ?? String(e);
  const code = e?.code    ?? '';

  console.error(`[db] ❌ ${label} 실패 — code=${code || 'N/A'} msg=${msg}`);

  if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
    console.error(
      '[db] 힌트(404): ① Neon 프로젝트 존재 여부 확인  ' +
      '② POSTGRES_URL 값 정확성 확인  ' +
      '③ scraped_benefits 테이블 DDL 실행 여부 확인'
    );
  }
  if (code === '42P01' || msg.includes('does not exist')) {
    console.error('[db] 힌트(테이블 없음): 파일 상단 DDL 주석을 Neon SQL Editor에서 실행하세요.');
  }
  if (code === '28P01' || msg.toLowerCase().includes('password authentication')) {
    console.error('[db] 힌트(인증 실패): POSTGRES_URL의 user/password를 확인하세요.');
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    console.error('[db] 힌트(연결 실패): 네트워크 또는 Neon 프로젝트 상태를 확인하세요.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 혜택 배열을 scraped_benefits 테이블에 트랜잭션으로 일괄 저장합니다.
 *
 * @param {import('./gemini-parser.js').BenefitData[]} benefits
 * @param {{ targetRegion?: string, targetGroup?: string, sourceQuery?: string }} meta
 * @returns {Promise<number>} 저장된 건수
 */
export async function saveBenefits(
  benefits,
  { targetRegion = '전국', targetGroup = '전체', sourceQuery = '' } = {}
) {
  if (!benefits.length) return 0;

  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  console.log(`[db] saveBenefits 시작 — ${benefits.length}건, region=${targetRegion}, group=${targetGroup}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const benefit of benefits) {
      await client.query(
        `INSERT INTO scraped_benefits
           (benefit_data, target_region, target_group, source_query, collected_at, expires_at)
         VALUES ($1::jsonb, $2, $3, $4, $5, $6)`,
        [JSON.stringify(benefit), targetRegion, targetGroup, sourceQuery, now, expiresAt]
      );
    }

    await client.query('COMMIT');
    console.log(`[db] ✅ saveBenefits 완료 — ${benefits.length}건 저장됨`);
    return benefits.length;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logDbError('saveBenefits', e);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 유저 조건에 매칭되는 최근 24시간 이내 혜택을 조회합니다.
 *
 * @param {{ region?: string, group?: string, limit?: number }} params
 * @returns {Promise<{ benefits: import('./gemini-parser.js').BenefitData[], collectedAt: Date | null }>}
 */
export async function queryFreshBenefits({ region = '전국', group = '전체', limit = 50 } = {}) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT benefit_data, collected_at
       FROM scraped_benefits
       WHERE collected_at >= $1
         AND (target_region = $2 OR target_region = '전국')
         AND (target_group  = $3 OR target_group  = '전체')
       ORDER BY collected_at DESC
       LIMIT $4`,
      [cutoff, region, group, limit]
    );

    if (rows.length === 0) return { benefits: [], collectedAt: null };

    const benefits    = rows.map((r) => r.benefit_data).filter(Boolean);
    const collectedAt = rows[0].collected_at;
    return { benefits, collectedAt };
  } catch (e) {
    logDbError('queryFreshBenefits', e);
    return { benefits: [], collectedAt: null };
  } finally {
    client.release();
  }
}

/**
 * 만료된 혜택(expires_at < NOW())을 일괄 삭제합니다.
 * 에러가 나도 0을 반환해 수집 단계가 계속 진행되도록 합니다.
 *
 * @returns {Promise<number>} 삭제된 건수 (실패 시 0)
 */
export async function deleteExpiredBenefits() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `DELETE FROM scraped_benefits
       WHERE expires_at < NOW()
       RETURNING id`
    );
    console.log(`[db] 만료 데이터 ${rows.length}건 삭제`);
    return rows.length;
  } catch (e) {
    logDbError('deleteExpiredBenefits', e);
    return 0;
  } finally {
    client.release();
  }
}
