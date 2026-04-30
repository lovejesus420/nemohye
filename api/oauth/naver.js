// api/oauth/naver.js — 네이버 OAuth 코드 교환 엔드포인트
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'code가 필요합니다.' });

  const CLIENT_ID     = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' });
  }

  try {
    // 1. 인가 코드 → 액세스 토큰 교환
    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      state: state || '',
    });
    const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id':     CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      },
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    // 2. 액세스 토큰 → 사용자 정보 조회
    const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    if (userData.resultcode !== '00') throw new Error(userData.message || '네이버 사용자 정보를 가져오지 못했습니다.');

    const r = userData.response || {};

    return res.status(200).json({
      id:       `naver:${r.id}`,
      name:     r.name || r.nickname || '네이버 사용자',
      email:    r.email || '',
      provider: 'naver',
    });
  } catch (e) {
    console.error('[oauth/naver]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
