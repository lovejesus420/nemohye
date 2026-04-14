'use server';

// Vercel Postgres — POSTGRES_URL 환경변수를 자동으로 읽습니다.
// Vercel 대시보드 Storage 탭에서 DB를 생성하면 아래 변수들이 자동 주입됩니다:
//   POSTGRES_URL              (필수 — 풀링 연결)
//   POSTGRES_URL_NON_POOLING  (마이그레이션/트랜잭션용)
//   POSTGRES_PRISMA_URL, POSTGRES_USER, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_DATABASE
//
// 로컬 개발 시: .env.local 에 POSTGRES_URL=postgres://... 추가
import { db } from '@vercel/postgres';

// 환경변수 누락 조기 감지 — 서버 시작 시 즉시 경고
if (!process.env.POSTGRES_URL) {
  console.error(
    '[db] POSTGRES_URL 환경변수가 없습니다. ' +
    'Vercel 대시보드 Storage → 프로젝트 연결 후 "Show secret" 에서 복사하거나, ' +
    '.env.local 에 추가하세요.'
  );
}

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

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const client = await db.connect();
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
 * target_region이 정확히 일치하거나 "전국"인 행을 모두 반환합니다.
 *
 * @param {{ region?: string, group?: string, limit?: number }} params
 * @returns {Promise<{ benefits: import('./gemini-parser.js').BenefitData[], collectedAt: Date | null }>}
 */
export async function queryFreshBenefits({ region = '전국', group = '전체', limit = 50 } = {}) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // target_region: 정확한 지역 OR "전국"
  // target_group:  요청 그룹 OR "전체"
  // collected_at:  최근 24시간 이내
  const { rows } = await db.query(
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

  const benefits = rows.map((r) => r.benefit_data).filter(Boolean);
  const collectedAt = rows[0].collected_at; // ORDER BY DESC → 가장 최신

  return { benefits, collectedAt };
}

/**
 * 만료된 혜택(expires_at < NOW())을 일괄 삭제합니다.
 * cron 작업에서 주기적으로 호출해 테이블 크기를 관리합니다.
 *
 * @returns {Promise<number>} 삭제된 건수
 */
export async function deleteExpiredBenefits() {
  const { rowCount } = await db.query(
    `DELETE FROM scraped_benefits WHERE expires_at < NOW()`
  );
  return rowCount ?? 0;
}
