'use server';

// @neondatabase/serverless — @vercel/postgres 대체 라이브러리
// POSTGRES_URL 환경변수는 그대로 사용합니다.
// (Vercel Postgres는 내부적으로 Neon을 사용하므로 연결 문자열이 동일)
//
// Vercel 대시보드 Storage → 프로젝트 연결 시 자동 주입:
//   POSTGRES_URL              (neon HTTP 연결 — 단순 쿼리용)
//   POSTGRES_URL_NON_POOLING  (직접 연결 — 트랜잭션용, 없으면 POSTGRES_URL 사용)
//
// 로컬 개발 시: .env.local 에 POSTGRES_URL=postgresql://... 추가
import { neon }    from '@neondatabase/serverless';
import { Pool }    from '@neondatabase/serverless';

// 환경변수 누락 조기 감지
if (!process.env.POSTGRES_URL) {
  console.error(
    '[db] POSTGRES_URL 환경변수가 없습니다. ' +
    'Vercel 대시보드 Storage → 프로젝트 연결 후 .env.local 에 추가하세요.'
  );
}

// ── neon(): HTTP 기반 단순 쿼리 (SELECT/DELETE) — 서버리스 최적
const sql = neon(process.env.POSTGRES_URL ?? '');

// ── Pool: 트랜잭션이 필요한 INSERT — 웹소켓 기반 직접 연결
//    트랜잭션에는 NON_POOLING URL이 권장되지만, 없으면 POSTGRES_URL 사용
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? '',
});

/**
 * scraped_benefits 테이블 스키마 (참고용)
 *
 * @typedef {Object} ScrapedBenefit
 * @property {number}   id            - AUTO INCREMENT PK
 * @property {object}   benefit_data  - Gemini 파싱 결과 (JSONB)
 * @property {string}   target_region - 대상 지역 (예: "서울특별시", "전국")
 * @property {string}   target_group  - 대상 그룹 (예: "청년", "전체")
 * @property {string}   source_query  - 수집에 사용된 검색 쿼리
 * @property {Date}     collected_at  - 수집 시각 (TIMESTAMPTZ)
 * @property {Date}     expires_at    - 만료 시각 = collected_at + 24h
 */

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
    await client.query('ROLLBACK');
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
}

/**
 * 만료된 혜택(expires_at < NOW())을 일괄 삭제합니다.
 *
 * @returns {Promise<number>} 삭제된 건수
 */
export async function deleteExpiredBenefits() {
  const rows = await sql`
    DELETE FROM scraped_benefits
    WHERE expires_at < NOW()
    RETURNING id
  `;
  // neon() 태그드 템플릿은 rowCount 대신 결과 배열을 반환 → length로 카운트
  return rows.length;
}
