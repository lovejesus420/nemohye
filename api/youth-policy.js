// api/youth-policy.js — Vercel Serverless Function
// 온통청년 청년정책 Open API 프록시 + XML→JSON 변환
// Endpoint: GET /api/youth-policy?age=25&extras=청년,취업준비&address=서울특별시+강남구

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.YOUTH_POLICY_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'YOUTH_POLICY_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { age = '', extras = '', address = '', display = '100' } = req.query;
  const ageNum    = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  // ── 지역 키워드 추출 (시·도 단위)
  const regionKeyword = extractRegion(address);

  // ── 검색 쿼리 조합 (나이/특성별 우선순위 키워드)
  const query = buildSearchQuery(ageNum, extraList, regionKeyword);

  // ── 온통청년 API 호출
  const params = new URLSearchParams({
    openApiVlak: API_KEY,
    pageIndex:   '1',
    display:     String(Math.min(parseInt(display, 10) || 100, 100)),
    query,
  });

  const url = `https://www.youthcenter.go.kr/opi/youthPlcyList.do?${params.toString()}`;

  let xml;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/xml, text/xml' } });
    xml = await resp.text();
  } catch (e) {
    return res.status(502).json({ error: '온통청년 API 호출 실패: ' + e.message });
  }

  // ── 오류 응답 체크
  const resultCode = extract('resultCode', xml) || extract('result', xml);
  if (resultCode && !['00', '0', '000', 'SUCCESS'].includes(resultCode.toUpperCase())) {
    return res.status(502).json({
      error: `온통청년 API 오류 [${resultCode}]: ${extract('resultMessage', xml) || extract('errMsg', xml)}`,
    });
  }

  // ── XML → JSON 파싱
  const items   = extractAll('youthPolicy', xml);
  const totalCnt = parseInt(extract('totalCnt', xml), 10) || items.length;

  const benefits = items.map(item => ({
    plcyNo:       extract('plcyNo',       item),
    title:        cdata(extract('plcyNm', item)),
    category:     cdata(extract('polyBizSecdNm', item)) || cdata(extract('polyBizSecd', item)),
    target:       cdata(extract('sprtTrgtCn',    item)),
    support:      cdata(extract('sprtCont',       item)),
    period:       cdata(extract('aplcnPrdCn',     item)),
    method:       cdata(extract('aplcnMthdCn',    item)),
    documents:    cdata(extract('rqutPfroDesc',   item)),
    ministry:     cdata(extract('mngtMson',       item)),
    institution:  cdata(extract('cnsgNmor',       item)),
    url:          cdata(extract('plcyUrlAddr',    item)),
    startDate:    extract('bizPrdBgngDate', item),
    endDate:      extract('bizPrdEndDate',  item),
    region:       cdata(extract('polyRgnSecd',    item)),
  })).filter(b => b.title);

  return res.status(200).json({ totalCount: totalCnt, count: benefits.length, benefits });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function extractRegion(address) {
  if (!address) return '';
  // "서울특별시 강남구" → "서울" 등 짧은 키워드
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

function buildSearchQuery(ageNum, extraList, region) {
  const parts = [];
  if (region) parts.push(region);

  // 특성 기반 키워드
  if (extraList.some(e => e.includes('청년')))         parts.push('청년');
  if (extraList.some(e => e.includes('취업') || e.includes('구직'))) parts.push('취업');
  if (extraList.some(e => e.includes('창업')))          parts.push('창업');
  if (extraList.some(e => e.includes('주거') || e.includes('전세'))) parts.push('주거');
  if (extraList.some(e => e.includes('임산부') || e.includes('출산'))) parts.push('출산');
  if (extraList.some(e => e.includes('교육') || e.includes('학자금'))) parts.push('교육');

  // 나이 기반 기본 키워드 (청년 범위면 청년 추가)
  if (!isNaN(ageNum) && ageNum >= 19 && ageNum <= 34 && !parts.includes('청년')) {
    parts.push('청년');
  }

  // 키워드가 없으면 기본 쿼리
  if (parts.length === 0) parts.push('지원 혜택');

  return parts.join(' ');
}

/** 정규식으로 XML 태그 내용 단일 추출 */
function extract(tag, text) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

/** 정규식으로 XML 태그 내용 전체 추출 */
function extractAll(tag, text) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results;
}

/** CDATA 언래핑 */
function cdata(str) {
  if (!str) return '';
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
