// api/auth.js — Vercel Serverless Function (Combined OTP Send/Verify)
import crypto from 'node:crypto';

// --- Shared Helpers ---
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// --- Send OTP Logic ---
function makeSolapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('md5', apiSecret).update(date + salt).digest('hex');
  return `HMAC-MD5 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`;
}

function createOTPToken(phone, code, secret) {
  const payload = Buffer.from(
    JSON.stringify({ phone, code, exp: Date.now() + 5 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function handleSendOTP(req, res) {
  const body = await parseBody(req);
  const { phone } = body;
  if (!phone) return res.status(400).json({ error: '전화번호가 없습니다.' });

  const digits = String(phone).replace(/\D/g, '');
  const localPhone = digits.startsWith('82') ? '0' + digits.slice(2) : digits;
  if (!/^01[0-9]{8,9}$/.test(localPhone)) {
    return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해 주세요. (01012345678 형식)' });
  }

  const { SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, OTP_TOKEN_SECRET } = process.env;
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER || !OTP_TOKEN_SECRET) {
    return res.status(500).json({ error: '서버 설정 오류입니다.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  try {
    const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: makeSolapiAuthHeader(SOLAPI_API_KEY, SOLAPI_API_SECRET),
      },
      body: JSON.stringify({
        message: { to: localPhone, from: SOLAPI_SENDER, text: `[네모혜] 인증번호: ${code}\n5분 이내에 입력해 주세요.` },
      }),
    });
    const solapiData = await solapiRes.json().catch(() => ({}));
    if (!solapiRes.ok) {
      return res.status(502).json({ error: `SMS 발송 실패: ${solapiData.errorMessage || solapiRes.status}` });
    }
    const token = createOTPToken(localPhone, code, OTP_TOKEN_SECRET);
    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}

// --- Verify OTP Logic ---
function verifyOTPToken(token, code, secret) {
  if (!token || !code) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    const trimmed = String(code).trim();
    if (trimmed.length !== data.code.length || !crypto.timingSafeEqual(Buffer.from(trimmed), Buffer.from(data.code))) return null;
    return data.phone;
  } catch { return null; }
}

async function handleVerifyOTP(req, res) {
  const body = await parseBody(req);
  const { token, code } = body;
  if (!token || !code) return res.status(400).json({ error: '토큰 또는 코드가 없습니다.' });
  const { OTP_TOKEN_SECRET } = process.env;
  if (!OTP_TOKEN_SECRET) return res.status(500).json({ error: '서버 설정 오류입니다.' });
  const phone = verifyOTPToken(token, String(code), OTP_TOKEN_SECRET);
  if (!phone) return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료됐습니다.' });
  return res.status(200).json({ phone: '+82' + phone.slice(1), localPhone: phone });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // URL 경로에 따라 분기
  const url = req.url || '';
  if (url.includes('send-otp')) {
    return handleSendOTP(req, res);
  } else if (url.includes('verify-otp')) {
    return handleVerifyOTP(req, res);
  }

  return res.status(404).json({ error: 'Not Found' });
}
