// api/send-otp.js — Vercel Serverless Function (Solapi SMS OTP)
import crypto from 'node:crypto';

// Solapi HMAC-MD5 인증 헤더
function makeSolapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('md5', apiSecret).update(date + salt).digest('hex');
  return `HMAC-MD5 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`;
}

// 서명된 OTP 토큰 (DB 없이 서버리스 검증)
function createOTPToken(phone, code, secret) {
  const payload = Buffer.from(
    JSON.stringify({ phone, code, exp: Date.now() + 5 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// body를 안전하게 읽기 (Vercel은 자동 파싱하지만 방어적으로 처리)
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { phone } = body;

  if (!phone) return res.status(400).json({ error: '전화번호가 없습니다.' });

  // 한국 번호 정규화: 010-1234-5678 또는 +821012345678 → 01012345678
  const digits = String(phone).replace(/\D/g, '');
  const localPhone = digits.startsWith('82') ? '0' + digits.slice(2) : digits;
  if (!/^01[0-9]{8,9}$/.test(localPhone)) {
    return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해 주세요. (01012345678 형식)' });
  }

  const { SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, OTP_TOKEN_SECRET } = process.env;

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER || !OTP_TOKEN_SECRET) {
    console.error('Missing env vars:', {
      hasKey: !!SOLAPI_API_KEY,
      hasSecret: !!SOLAPI_API_SECRET,
      hasSender: !!SOLAPI_SENDER,
      hasTokenSecret: !!OTP_TOKEN_SECRET,
    });
    return res.status(500).json({ error: '서버 설정 오류입니다. 관리자에게 문의하세요.' });
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
        message: {
          to: localPhone,
          from: SOLAPI_SENDER,
          text: `[네모혜] 인증번호: ${code}\n5분 이내에 입력해 주세요.`,
        },
      }),
    });

    const solapiData = await solapiRes.json().catch(() => ({}));

    if (!solapiRes.ok) {
      console.error('Solapi error:', solapiData);
      return res.status(502).json({
        error: `SMS 발송 실패: ${solapiData.errorMessage || solapiData.message || solapiRes.status}`,
      });
    }

    const token = createOTPToken(localPhone, code, OTP_TOKEN_SECRET);
    return res.status(200).json({ token });

  } catch (err) {
    console.error('send-otp exception:', err);
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}
