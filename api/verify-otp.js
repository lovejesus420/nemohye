// api/verify-otp.js — Vercel Serverless Function
import crypto from 'node:crypto';

function verifyOTPToken(token, code, secret) {
  if (!token || !code) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  // 서명 검증
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch { return null; }

  // 페이로드 디코딩
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); }
  catch { return null; }

  if (Date.now() > data.exp) return null;

  // 코드 비교
  const trimmed = String(code).trim();
  if (trimmed.length !== data.code.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(trimmed), Buffer.from(data.code))) return null;
  } catch { return null; }

  return data.phone;
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { token, code } = body;

  if (!token || !code) {
    return res.status(400).json({ error: '토큰 또는 코드가 없습니다.' });
  }

  const { OTP_TOKEN_SECRET } = process.env;
  if (!OTP_TOKEN_SECRET) {
    return res.status(500).json({ error: '서버 설정 오류입니다.' });
  }

  const phone = verifyOTPToken(token, String(code), OTP_TOKEN_SECRET);
  if (!phone) {
    return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료됐습니다. (5분 초과 시 재발송)' });
  }

  const e164 = '+82' + phone.slice(1); // 01012345678 → +821012345678
  return res.status(200).json({ phone: e164, localPhone: phone });
}
