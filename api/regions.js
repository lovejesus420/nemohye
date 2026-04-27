// api/regions.js — Vercel Serverless Function (Combined Seoul & Gyeonggi)

// --- Seoul Logic ---
async function handleSeoul(req, res) {
  const SEOUL_KEY = process.env.SEOUL_API_KEY;
  if (!SEOUL_KEY) return res.status(500).json({ error: 'SEOUL_API_KEY 미설정' });
  
  const { age, extras = '', address = '' } = req.query;
  const ageNum = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];
  
  if (!address.includes('서울')) return res.status(200).json({ count: 0, benefits: [], skipped: true });

  const guMatch = address.match(/서울(?:특별시)?\s*(.+?구)/);
  const gu = guMatch?.[1] || '';
  
  const BASE = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json`;
  const fetchSvc = async (svcName) => {
    try {
      const resp = await fetch(`${BASE}/${svcName}/1/100`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data?.[svcName]?.row || [];
    } catch { return []; }
  };

  const [welfare, edu, culture] = await Promise.all([
    fetchSvc('ListPublicReservationSociety'),
    fetchSvc('ListPublicReservationEducation'),
    fetchSvc('ListPublicReservationCulture'),
  ]);

  const targetKeywords = ['전체', '제한없음', '누구나', '시민'];
  if (!isNaN(ageNum)) {
    if (ageNum < 8) targetKeywords.push('영유아', '아동');
    else if (ageNum < 14) targetKeywords.push('아동', '어린이');
    else if (ageNum < 19) targetKeywords.push('청소년');
    else if (ageNum < 35) targetKeywords.push('청년');
    else if (ageNum >= 65) targetKeywords.push('어르신', '노인');
  }
  if (extraList.some(e => e.includes('청년'))) targetKeywords.push('청년');
  if (extraList.some(e => e.includes('임산부'))) targetKeywords.push('임산부');

  const all = [
    ...welfare.map(r => ({ ...r, _cat: '복지' })),
    ...edu.map(r => ({ ...r, _cat: '교육' })),
    ...culture.map(r => ({ ...r, _cat: '문화' })),
  ].filter(r => r.SVCSTATNM === '접수중' || r.SVCSTATNM === '안내중' || r.SVCSTATNM === '예약마감');

  const matched = all.filter(r => {
    const target = r.USETGTINFO || '';
    if (!target) return true;
    return targetKeywords.some(kw => target.includes(kw));
  });

  const benefits = (matched.length >= 3 ? matched : all).slice(0, 50).map(row => ({
    title: row.SVCNM,
    category: row._cat || row.MAXCLASSNM,
    status: row.SVCSTATNM,
    area: row.AREANM,
    place: row.PLACENM,
    target: row.USETGTINFO || '전체',
    applyUrl: row.SVCURL || 'https://yeyak.seoul.go.kr',
  }));

  return res.status(200).json({ count: benefits.length, benefits });
}

// --- Gyeonggi Logic ---
async function handleGyeonggi(req, res) {
  const GG_KEY = process.env.GG_API_KEY;
  if (!GG_KEY) return res.status(500).json({ error: 'GG_API_KEY 미설정' });
  const { address = '', extras = '' } = req.query;
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];
  if (!address.includes('경기')) return res.status(200).json({ count: 0, benefits: [], skipped: true });

  const cityMatch = address.match(/경기(?:도)?\s*(.+?(?:시|군))/);
  const city = cityMatch?.[1] || '';

  const fetchList = async (params = {}) => {
    const query = new URLSearchParams({ KEY: GG_KEY, Type: 'json', pIndex: '1', pSize: '100', ...params });
    try {
      const resp = await fetch(`https://openapi.gg.go.kr/PublServcList?${query.toString()}`);
      const data = await resp.json();
      return data?.PublServcList?.find(b => b.row)?.row || [];
    } catch { return []; }
  };

  const results = await Promise.all([fetchList(), city ? fetchList({ PUBL_SERVC_JURSDCTN_INST_NM: city }) : []]);
  const seen = new Set();
  const allItems = results.flat().filter(item => {
    if (!item.PUBL_SERVC_ID || seen.has(item.PUBL_SERVC_ID)) return false;
    seen.add(item.PUBL_SERVC_ID);
    return true;
  });

  const keywords = ['전체', '도민', '주민'];
  if (extraList.some(e => e.includes('청년'))) keywords.push('청년');
  if (extraList.some(e => e.includes('임산부'))) keywords.push('임산부');

  const filtered = allItems.filter(item => {
    const text = (item.PUBL_SERVC_TITLE || '') + (item.PUBL_SERVC_PURPS_DTCONT || '');
    return keywords.some(kw => text.includes(kw));
  });

  const benefits = (filtered.length >= 5 ? filtered : allItems).slice(0, 50).map(item => ({
    title: item.PUBL_SERVC_TITLE,
    ministry: item.PUBL_SERVC_JURSDCTN_INST_NM || '경기도',
    summary: (item.PUBL_SERVC_PURPS_DTCONT || '').slice(0, 120),
    applyUrl: item.PUBL_SERVC_DETAIL_KOR_URL || 'https://www.gg.go.kr',
  }));

  return res.status(200).json({ count: benefits.length, benefits });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  if (url.includes('/api/seoul')) return handleSeoul(req, res);
  if (url.includes('/api/gg')) return handleGyeonggi(req, res);
  // 만약 rewrite로 인해 경로가 regions라면 쿼리로 판단하거나 fallback
  if (url.includes('regions')) {
    // 쿼리 파라미터 address 등으로 추측 가능하지만 가급적 원본 URL 유지가 좋음
    if (req.query.address?.includes('서울')) return handleSeoul(req, res);
    return handleGyeonggi(req, res);
  }

  return res.status(404).json({ error: 'Not Found' });
}
