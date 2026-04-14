// api/benefits.js — Vercel Serverless Function
// DB에 저장된 최신 혜택을 유저 조건(지역·그룹)으로 조회해 반환합니다.
//
// GET /api/benefits?region=서울특별시&group=청년&limit=40

import { queryFreshBenefits } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    region = '전국',
    group  = '전체',
    limit  = '50',
  } = req.query;

  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);

  try {
    const { benefits, collectedAt } = await queryFreshBenefits({
      region,
      group,
      limit: limitNum,
    });

    return res.status(200).json({
      ok: true,
      count: benefits.length,
      collectedAt: collectedAt ? collectedAt.toISOString() : null,
      benefits,
    });
  } catch (e) {
    console.error(
      `[api/benefits] ❌ DB 조회 실패\n` +
      `  region=${region} group=${group} limit=${limitNum}\n` +
      `  에러: ${e?.message ?? e}`
    );
    return res.status(500).json({ error: 'DB 조회 중 오류가 발생했습니다.', detail: e?.message });
  }
}
