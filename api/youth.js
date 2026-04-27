// api/youth.js — Vercel Serverless Function (Combined Youth Policy & Content)

// --- Shared Helpers ---
function extractRegion(address) {
  if (!address) return '';
  const regionMap = [
    ['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'],
    ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'],
    ['경기', '경기'], ['강원', '강원'], ['충북', '충북'], ['충남', '충남'],
    ['전북', '전북'], ['전남', '전남'], ['경북', '경북'], ['경남', '경남'],
    ['제주', '제주'],
  ];
  for (const [key, val] of regionMap) {
    if (address.includes(key)) return val;
  }
  return '';
}

function extract(tag, text) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function extractAll(tag, text) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results;
}

function cdata(str) {
  if (!str) return '';
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// --- Youth Policy Logic ---
function buildPolicySearchQuery(ageNum, extraList, region) {
  const parts = [];
  if (region) parts.push(region);
  if (extraList.some(e => e.includes('청년'))) parts.push('청년');
  if (extraList.some(e => e.includes('취업') || e.includes('구직'))) parts.push('취업');
  if (extraList.some(e => e.includes('창업'))) parts.push('창업');
  if (extraList.some(e => e.includes('주거') || e.includes('전세'))) parts.push('주거');
  if (extraList.some(e => e.includes('출산'))) parts.push('출산');
  if (extraList.some(e => e.includes('교육'))) parts.push('교육');
  if (!isNaN(ageNum) && ageNum >= 19 && ageNum <= 34 && !parts.includes('청년')) parts.push('청년');
  return parts.length === 0 ? '지원 혜택' : parts.join(' ');
}

async function handleYouthPolicy(req, res) {
  const API_KEY = process.env.YOUTH_POLICY_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'YOUTH_POLICY_API_KEY 미설정' });

  const { age = '', extras = '', address = '', display = '100' } = req.query;
  const query = buildPolicySearchQuery(parseInt(age, 10), extras ? extras.split(',').map(s => s.trim()) : [], extractRegion(address));
  const params = new URLSearchParams({ openApiVlak: API_KEY, pageIndex: '1', display: String(Math.min(parseInt(display, 10) || 100, 100)), query });
  
  try {
    const resp = await fetch(`https://www.youthcenter.go.kr/opi/youthPlcyList.do?${params.toString()}`);
    const xml = await resp.text();
    const items = extractAll('youthPolicy', xml);
    const benefits = items.map(item => ({
      plcyNo: extract('plcyNo', item),
      title: cdata(extract('plcyNm', item)),
      category: cdata(extract('polyBizSecdNm', item)) || cdata(extract('polyBizSecd', item)),
      target: cdata(extract('sprtTrgtCn', item)),
      support: cdata(extract('sprtCont', item)),
      period: cdata(extract('aplcnPrdCn', item)),
      method: cdata(extract('aplcnMthdCn', item)),
      url: cdata(extract('plcyUrlAddr', item)),
      region: cdata(extract('polyRgnSecd', item)),
    })).filter(b => b.title);
    return res.status(200).json({ count: benefits.length, benefits });
  } catch (e) {
    return res.status(502).json({ error: 'API 호출 실패' });
  }
}

// --- Youth Content Logic ---
function buildContentSearchQuery(ageNum, extraList, region) {
  const parts = [];
  if (region) parts.push(region);
  if (extraList.some(e => e.includes('청년'))) parts.push('청년');
  if (extraList.some(e => e.includes('취업') || e.includes('구직'))) parts.push('취업');
  if (extraList.some(e => e.includes('창업'))) parts.push('창업');
  if (extraList.some(e => e.includes('문화'))) parts.push('문화행사');
  if (!isNaN(ageNum) && ageNum >= 19 && ageNum <= 34 && !parts.includes('청년')) parts.push('청년');
  return parts.length === 0 ? '청년 콘텐츠' : parts.join(' ');
}

async function handleYouthContent(req, res) {
  const API_KEY = process.env.YOUTH_CONTENT_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'YOUTH_CONTENT_API_KEY 미설정' });

  const { age = '', extras = '', address = '', display = '50' } = req.query;
  const query = buildContentSearchQuery(parseInt(age, 10), extras ? extras.split(',').map(s => s.trim()) : [], extractRegion(address));
  const params = new URLSearchParams({ openApiVlak: API_KEY, pageIndex: '1', display: String(Math.min(parseInt(display, 10) || 50, 100)), query });

  try {
    const resp = await fetch(`https://www.youthcenter.go.kr/opi/youthCntsList.do?${params.toString()}`);
    const xml = await resp.text();
    const items = extractAll('youthContent', xml).length > 0 ? extractAll('youthContent', xml) : extractAll('youthCnts', xml).length > 0 ? extractAll('youthCnts', xml) : extractAll('item', xml);
    const contents = items.map(item => ({
      title: cdata(extract('cntsNm', item)) || cdata(extract('cntsTtl', item)) || cdata(extract('title', item)),
      summary: cdata(extract('cntsSmryCn', item)) || cdata(extract('cntsCn', item)) || cdata(extract('summary', item)),
      type: cdata(extract('cntsTypeNm', item)) || cdata(extract('cntsKndNm', item)) || cdata(extract('typeNm', item)),
      url: cdata(extract('cntsUrlAddr', item)) || cdata(extract('lnkUrl', item)) || cdata(extract('url', item)),
    })).filter(c => c.title);
    return res.status(200).json({ count: contents.length, contents });
  } catch (e) {
    return res.status(502).json({ error: 'API 호출 실패' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  if (url.includes('youth-policy')) return handleYouthPolicy(req, res);
  if (url.includes('youth-content')) return handleYouthContent(req, res);
  return res.status(404).json({ error: 'Not Found' });
}
