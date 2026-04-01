// api/verify-otp.js — Vercel Serverless Function
// 클라이언트가 제출한 (token, code) 검증 → 성공 시 전화번호 반환

import crypto from 'node:crypto';

function verifyOTPToken(token, code, secret) {
  if (!token || !code) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  // 서명 검증 (timing-safe)
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  // 페이로드 디코딩
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }

  // 만료 확인
  if (Date.now() > data.exp) return null;

  // 코드 확인 (timing-safe)
  const codeBuf = Buffer.from(code.trim());
  const savedBuf = Buffer.from(data.code);
  if (codeBuf.length !== savedBuf.length) return null;
  if (!crypto.timingSafeEqual(codeBuf, savedBuf)) return null;

  return data.phone; // E.g. "01012345678"
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, code } = req.body ?? {};
  if (!token || !code) {
    return res.status(400).json({ error: '토큰 또는 코드가 없습니다.' });
  }

  const { OTP_TOKEN_SECRET } = process.env;
  if (!OTP_TOKEN_SECRET) {
    return res.status(500).json({ error: '서버 환경변수가 설정되지 않았습니다.' });
  }

  const phone = verifyOTPToken(token, code, OTP_TOKEN_SECRET);
  if (!phone) {
    return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료됐습니다.' });
  }

  // E.164 형식으로도 반환 (+82 prefix)
  const e164 = '+82' + phone.slice(1); // 01012345678 → +821012345678
  return res.status(200).json({ phone: e164, localPhone: phone });
}
