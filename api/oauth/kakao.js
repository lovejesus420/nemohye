// api/oauth/kakao.js — 카카오 OAuth 코드 교환 엔드포인트
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, redirect_uri } = req.query;
  if (!code) return res.status(400).json({ error: 'code가 필요합니다.' });

  const CLIENT_ID     = process.env.KAKAO_CLIENT_ID;
  const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
  const REDIRECT_URI  = redirect_uri || process.env.KAKAO_REDIRECT_URI || 'https://nemohye.vercel.app';

  if (!CLIENT_ID) return res.status(500).json({ error: 'KAKAO_CLIENT_ID 환경변수가 설정되지 않았습니다.' });

  try {
    // 1. 인가 코드 → 액세스 토큰 교환
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    // 2. 액세스 토큰 → 사용자 정보 조회
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    if (!userData.id) throw new Error('카카오 사용자 정보를 가져오지 못했습니다.');

    const account = userData.kakao_account || {};
    const profile = account.profile || {};

    return res.status(200).json({
      id:       `kakao:${userData.id}`,
      name:     profile.nickname || account.name || '카카오 사용자',
      email:    account.email || '',
      provider: 'kakao',
    });
  } catch (e) {
    console.error('[oauth/kakao]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
