'use server';

// @neondatabase/serverless — Pool 단일 사용 (neon() HTTP 클라이언트 제거)
//
// neon() 태그드 템플릿은 내부에서 pg의 url.parse()를 트리거해
// Node.js DEP0169 DeprecationWarning을 발생시킵니다.
// Pool에 new URL()로 미리 파싱한 개별 파라미터를 넘기면 url.parse()가
// 호출되지 않아 경고가 완전히 사라집니다.
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

// ── 환경변수 검증
const rawUrl   = process.env.POSTGRES_URL             ?? '';
const rawUrlNP = process.env.POSTGRES_URL_NON_POOLING ?? rawUrl;

if (!rawUrl) {
  console.error(
    '[db] ❌ POSTGRES_URL 환경변수가 없습니다.\n' +
    '     Vercel 대시보드 Storage → 프로젝트 연결 후 .env.local 에 추가하세요.'
  );
}

// ── new URL()로 파싱 → 개별 파라미터 전달 (url.parse() 우회)
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
  } catch (e) {
    console.error(
      `[db] ❌ POSTGRES_URL 파싱 실패: ${e.message}\n` +
      '     형식 예시: postgresql://user:pass@host.neon.tech/dbname?sslmode=require'
    );
    return { connectionString: urlString }; // 폴백 — url.parse() 경고 재발 가능
  }
}

// SELECT / DELETE / INSERT 전부 Pool 하나로 통일
const pool = new Pool(parsePoolConfig(rawUrlNP));

// ── 공통 에러 로거
function logDbError(label, e) {
  const msg = e?.message ?? String(e);
  const code = e?.code ?? '';

  console.error(`[db] ❌ ${label} 실패 — ${msg}`);

  if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
    console.error(
      '[db] 힌트(404): ① Neon 프로젝트 존재 여부 확인  ' +
      '② POSTGRES_URL 값 확인  ' +
      '③ scraped_benefits 테이블 DDL 실행 여부 확인'
    );
  }
  if (code === '42P01' || msg.includes('does not exist')) {
    console.error(
      '[db] 힌트(테이블 없음): 파일 상단 DDL 주석을 Neon SQL Editor에서 실행하세요.'
    );
  }
  if (code === '28P01' || msg.toLowerCase().includes('password')) {
    console.error('[db] 힌트(인증 실패): POSTGRES_URL의 user/password를 확인하세요.');
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
    return rows.length;
  } catch (e) {
    logDbError('deleteExpiredBenefits', e);
    return 0;
  } finally {
    client.release();
  }
}
