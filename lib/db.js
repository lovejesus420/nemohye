'use server';

// @neondatabase/serverless
// POSTGRES_URL     — HTTP 기반 단순 쿼리 (neon 태그드 템플릿)
// POSTGRES_URL_NON_POOLING — WebSocket 기반 트랜잭션용 Pool (없으면 POSTGRES_URL 사용)
//
// ⚠️  테이블이 없으면 404 / "relation does not exist" 에러가 납니다.
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

import { neon, Pool } from '@neondatabase/serverless';

// ── 환경변수 검증 + new URL() 파싱 (url.parse() 경고 원천 차단)
const rawUrl   = process.env.POSTGRES_URL              ?? '';
const rawUrlNP = process.env.POSTGRES_URL_NON_POOLING  ?? rawUrl;

if (!rawUrl) {
  console.error(
    '[db] POSTGRES_URL 환경변수가 없습니다. ' +
    'Vercel 대시보드 Storage → 프로젝트 연결 후 .env.local 에 추가하세요.'
  );
}

// ── neon(): HTTP 기반 단순 쿼리 (SELECT / DELETE)
const sql = neon(rawUrl);

// ── Pool: new URL()로 직접 파싱 후 개별 파라미터 전달
//    connectionString을 그대로 넘기면 pg 내부에서 url.parse()를 호출해
//    DEP0169 경고가 발생합니다. 미리 파싱해서 넘기면 호출하지 않습니다.
function parsePoolConfig(urlString) {
  try {
    const u = new URL(urlString);
    return {
      host:     u.hostname,
      port:     u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, ''),
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl:      { rejectUnauthorized: false },
    };
  } catch {
    console.error('[db] POSTGRES_URL이 유효한 URL 형식이 아닙니다. connectionString 모드로 폴백.');
    return { connectionString: urlString };
  }
}

const pool = new Pool(parsePoolConfig(rawUrlNP));

// ── 공통 에러 힌트 출력 헬퍼
function logDbError(label, e) {
  console.error(`[db] ${label} 에러:`, e?.message ?? e);
  if (e?.message?.includes('404') || e?.message?.toLowerCase().includes('not found')) {
    console.error(
      '[db] 힌트: 404 / Not Found → ' +
      '① Neon 프로젝트가 존재하는지 대시보드에서 확인, ' +
      '② POSTGRES_URL 값이 올바른지 확인, ' +
      '③ scraped_benefits 테이블을 생성했는지 확인 (파일 상단 DDL 참고)'
    );
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

  try {
    const rows = await sql`
      SELECT benefit_data, collected_at
      FROM scraped_benefits
      WHERE collected_at >= ${cutoff}
        AND (target_region = ${region}  OR target_region = '전국')
        AND (target_group  = ${group}   OR target_group  = '전체')
      ORDER BY collected_at DESC
      LIMIT ${limit}
    `;

    if (rows.length === 0) return { benefits: [], collectedAt: null };

    const benefits    = rows.map((r) => r.benefit_data).filter(Boolean);
    const collectedAt = rows[0].collected_at;
    return { benefits, collectedAt };
  } catch (e) {
    logDbError('queryFreshBenefits', e);
    return { benefits: [], collectedAt: null };
  }
}

/**
 * 만료된 혜택(expires_at < NOW())을 일괄 삭제합니다.
 * 에러가 나도 throw하지 않고 0을 반환해 수집 단계가 계속 진행되도록 합니다.
 *
 * @returns {Promise<number>} 삭제된 건수 (실패 시 0)
 */
export async function deleteExpiredBenefits() {
  try {
    const rows = await sql`
      DELETE FROM scraped_benefits
      WHERE expires_at < NOW()
      RETURNING id
    `;
    // neon() 태그드 템플릿은 rowCount 대신 결과 배열을 반환 → length로 카운트
    return rows.length;
  } catch (e) {
    logDbError('deleteExpiredBenefits', e);
    return 0; // 에러가 나도 수집 단계는 계속 진행
  }
}
