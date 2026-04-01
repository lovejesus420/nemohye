// api/send-otp.js — Vercel Serverless Function
// Solapi(솔라피) SMS OTP 발송 + 서명된 토큰 반환
//
// 필요한 환경변수 (Vercel 대시보드 > Settings > Environment Variables):
//   SOLAPI_API_KEY       — 솔라피 콘솔 > 개발 > API Key Management
//   SOLAPI_API_SECRET    — 위와 동일 위치
//   SOLAPI_SENDER        — 솔라피에 등록한 발신번호 (e.g. 01012345678)
//   OTP_TOKEN_SECRET     — 임의의 긴 무작위 문자열 (openssl rand -hex 32)

import crypto from 'node:crypto';

// ─── Solapi 인증 헤더 생성 ────────────────────────────────────────
function makeSolapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('md5', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-MD5 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// ─── OTP 토큰 생성 (DB 없이 서버리스로 검증 가능) ─────────────────
// 토큰 = base64url(payload) + '.' + HMAC-SHA256(payload, secret)
function createOTPToken(phone, code, secret) {
  const payload = Buffer.from(
    JSON.stringify({ phone, code, exp: Date.now() + 5 * 60 * 1000 }) // 5분 유효
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: '전화번호가 없습니다.' });

  // 한국 번호 정규화: 010-1234-5678 → 01012345678
  const digits = phone.replace(/\D/g, '');
  const localPhone = digits.startsWith('82') ? '0' + digits.slice(2) : digits;
  if (!/^01[0-9]{8,9}$/.test(localPhone)) {
    return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해 주세요.' });
  }

  const {
    SOLAPI_API_KEY,
    SOLAPI_API_SECRET,
    SOLAPI_SENDER,
    OTP_TOKEN_SECRET,
  } = process.env;

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER || !OTP_TOKEN_SECRET) {
    return res.status(500).json({ error: '서버 환경변수가 설정되지 않았습니다.' });
  }

  // 6자리 OTP 생성
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Solapi SMS 발송
  const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: makeSolapiAuthHeader(SOLAPI_API_KEY, SOLAPI_API_SECRET),
    },
    body: JSON.stringify({
      message: {
        to: localPhone,
        from: SOLAPI_SENDER,
        text: `[네모혜] 인증번호: ${code}\n5분 내 입력해 주세요.`,
      },
    }),
  });

  if (!solapiRes.ok) {
    const err = await solapiRes.json().catch(() => ({}));
    console.error('Solapi error:', err);
    return res.status(502).json({ error: `SMS 발송 실패: ${err.errorMessage || solapiRes.status}` });
  }

  // 서명된 토큰 반환 (클라이언트가 verify-otp 호출 시 사용)
  const token = createOTPToken(localPhone, code, OTP_TOKEN_SECRET);
  return res.status(200).json({ token });
}
