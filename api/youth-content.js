// api/youth-content.js — Vercel Serverless Function
// 온통청년 청년콘텐츠 Open API 프록시 + XML→JSON 변환
// Endpoint: GET /api/youth-content?age=25&extras=청년&address=서울특별시+강남구
//
// ⚠️ 필드명 확인 안내:
//   실제 응답에서 필드명이 다르면 extract() 호출의 태그명을 수정하세요.
//   테스트 방법: Vercel 로그에서 rawXml 첫 500자를 확인
//   API 문서: https://www.youthcenter.go.kr/cmnFooter/openapiIntro/oaiDoc

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.YOUTH_CONTENT_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'YOUTH_CONTENT_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { age = '', extras = '', address = '', display = '50' } = req.query;
  const ageNum    = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  const query = buildSearchQuery(ageNum, extraList, extractRegion(address));

  const params = new URLSearchParams({
    openApiVlak: API_KEY,
    pageIndex:   '1',
    display:     String(Math.min(parseInt(display, 10) || 50, 100)),
    query,
  });

  const url = `https://www.youthcenter.go.kr/opi/youthCntsList.do?${params.toString()}`;

  let xml;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/xml, text/xml' } });
    xml = await resp.text();
    // 응답 구조 확인용 로그 (배포 초기에만 사용, 이후 제거 권장)
    console.log('[youth-content] XML 앞부분:', xml.slice(0, 300));
  } catch (e) {
    return res.status(502).json({ error: '온통청년 콘텐츠 API 호출 실패: ' + e.message });
  }

  // 오류 응답 체크
  const resultCode = extract('resultCode', xml) || extract('result', xml);
  if (resultCode && !['00', '0', '000', 'SUCCESS'].includes(resultCode.toUpperCase())) {
    return res.status(502).json({
      error: `온통청년 콘텐츠 API 오류 [${resultCode}]: ${extract('resultMessage', xml) || extract('errMsg', xml)}`,
    });
  }

  // ── XML → JSON 파싱
  // 후보 태그명: youthContent / youthCnts / content / item
  const items = extractAll('youthContent', xml).length > 0
    ? extractAll('youthContent', xml)
    : extractAll('youthCnts', xml).length > 0
    ? extractAll('youthCnts', xml)
    : extractAll('item', xml);

  const totalCnt = parseInt(extract('totalCnt', xml) || extract('totalCount', xml), 10) || items.length;

  const contents = items.map(item => ({
    // 제목 — 후보: cntsNm / cntsTtl / title
    title:      cdata(extract('cntsNm', item))    || cdata(extract('cntsTtl', item))   || cdata(extract('title', item)),
    // 요약 — 후보: cntsSmryCn / cntsCn / summary
    summary:    cdata(extract('cntsSmryCn', item)) || cdata(extract('cntsCn', item))   || cdata(extract('summary', item)),
    // 콘텐츠 유형 — 후보: cntsTypeNm / cntsKndNm / typeNm
    type:       cdata(extract('cntsTypeNm', item)) || cdata(extract('cntsKndNm', item)) || cdata(extract('typeNm', item)),
    // 게시 기간 — 후보: pstgBgngYmd / startDate / regDt
    startDate:  extract('pstgBgngYmd', item) || extract('startDate', item) || extract('regDt', item),
    endDate:    extract('pstgEndYmd',  item) || extract('endDate',   item),
    // URL — 후보: cntsUrlAddr / lnkUrl / url
    url:        cdata(extract('cntsUrlAddr', item)) || cdata(extract('lnkUrl', item)) || cdata(extract('url', item)),
    // 기관/출처 — 후보: mngtMson / orgNm
    org:        cdata(extract('mngtMson', item)) || cdata(extract('orgNm', item)),
  })).filter(c => c.title);

  return res.status(200).json({ totalCount: totalCnt, count: contents.length, contents });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (youth-policy.js와 동일)

function extractRegion(address) {
  const regionMap = [
    ['서울','서울'],['부산','부산'],['대구','대구'],['인천','인천'],
    ['광주','광주'],['대전','대전'],['울산','울산'],['세종','세종'],
    ['경기','경기'],['강원','강원'],['충북','충북'],['충남','충남'],
    ['전북','전북'],['전남','전남'],['경북','경북'],['경남','경남'],['제주','제주'],
  ];
  for (const [key, val] of regionMap) {
    if (address.includes(key)) return val;
  }
  return '';
}

function buildSearchQuery(ageNum, extraList, region) {
  const parts = [];
  if (region) parts.push(region);
  if (extraList.some(e => e.includes('청년')))                           parts.push('청년');
  if (extraList.some(e => e.includes('취업') || e.includes('구직')))     parts.push('취업');
  if (extraList.some(e => e.includes('창업')))                           parts.push('창업');
  if (extraList.some(e => e.includes('문화') || e.includes('행사')))     parts.push('문화행사');
  if (!isNaN(ageNum) && ageNum >= 19 && ageNum <= 34 && !parts.includes('청년')) {
    parts.push('청년');
  }
  if (parts.length === 0) parts.push('청년 콘텐츠');
  return parts.join(' ');
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
