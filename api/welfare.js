// api/welfare.js — Vercel Serverless Function
// 복지로 Open API (데이터포털) 프록시 + XML→JSON 변환
// Endpoint: GET /api/welfare?age=30&extras=청년,한부모+가정&pageNo=1&numOfRows=50

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const BOKJIRO_KEY = process.env.BOKJIRO_API_KEY;
  if (!BOKJIRO_KEY) {
    return res.status(500).json({ error: 'BOKJIRO_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { age, extras = '', pageNo = '1', numOfRows = '100' } = req.query;
  const ageNum = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  // ── 생애주기 코드 매핑
  const lifeSet = new Set();
  if (!isNaN(ageNum)) {
    if (ageNum < 8)        lifeSet.add('001'); // 영유아
    else if (ageNum < 14)  lifeSet.add('002'); // 아동
    else if (ageNum < 19)  lifeSet.add('003'); // 청소년
    else if (ageNum < 35)  lifeSet.add('004'); // 청년
    else if (ageNum < 65)  lifeSet.add('005'); // 중장년
    else                   lifeSet.add('006'); // 노년
  }
  if (extraList.some(e => e.includes('임산부') || e.includes('출산'))) lifeSet.add('007');
  if (extraList.some(e => e.includes('청년'))) lifeSet.add('004');
  if (extraList.some(e => e.includes('노인'))) lifeSet.add('006');

  // ── 대상자 특성 코드 매핑
  const trgSet = new Set();
  if (extraList.some(e => e.includes('다자녀')))                    trgSet.add('020');
  if (extraList.some(e => e.includes('보훈') || e.includes('유공자'))) trgSet.add('030');
  if (extraList.some(e => e.includes('장애인')))                    trgSet.add('040');
  if (extraList.some(e => e.includes('기초') || e.includes('차상위') || e.includes('저소득'))) trgSet.add('050');
  if (extraList.some(e => e.includes('한부모')))                    trgSet.add('060');
  if (extraList.some(e => e.includes('다문화') || e.includes('탈북'))) trgSet.add('010');

  // ── 관심주제 코드 (전반적으로 포함)
  const themaSet = new Set(['030', '050', '040', '100', '130']); // 생활지원, 일자리, 주거, 교육, 서민금융
  if (extraList.some(e => e.includes('임산부') || e.includes('출산') || e.includes('신혼'))) {
    themaSet.add('080'); // 임신출산
    themaSet.add('090'); // 보육
  }
  if (extraList.some(e => e.includes('청년'))) {
    themaSet.add('050'); // 일자리
    themaSet.add('040'); // 주거
  }

  // ── API 파라미터 구성
  const params = new URLSearchParams({
    serviceKey: BOKJIRO_KEY,
    callTp: 'L',
    pageNo: pageNo,
    numOfRows: numOfRows,
    srchKeyCode: '003', // 제목+내용 검색
    orderBy: 'popular',
  });

  if (lifeSet.size > 0)  params.set('lifeArray',          [...lifeSet].join(','));
  if (trgSet.size > 0)   params.set('trgterIndvdlArray',  [...trgSet].join(','));
  if (themaSet.size > 0) params.set('intrsThemaArray',    [...themaSet].join(','));
  if (!isNaN(ageNum))    params.set('age', String(ageNum));

  const url = `http://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001?${params.toString()}`;

  let xml;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/xml' } });
    xml = await resp.text();
  } catch (e) {
    return res.status(502).json({ error: '복지로 API 호출 실패: ' + e.message });
  }

  // ── XML → JSON 파싱 (의존성 없이 regex로)
  function extractAll(tag, text) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
    const items = [];
    let m;
    while ((m = re.exec(text)) !== null) items.push(m[1].trim());
    return items;
  }
  function extract(tag, text) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
  }

  // 오류 응답 체크
  const resultCode = extract('resultCode', xml);
  if (resultCode && resultCode !== '0' && resultCode !== '00') {
    return res.status(502).json({ error: `복지로 API 오류 ${resultCode}: ${extract('resultMessage', xml)}` });
  }

  const totalCount = parseInt(extract('totalCount', xml), 10) || 0;
  // 실제 응답 태그명은 <servList> (API 가이드의 wantedDtl이 아님)
  const welfareItems = extractAll('servList', xml);

  const benefits = welfareItems.map(item => ({
    servId:    extract('servId', item),
    title:     extract('servNm', item),
    ministry:  extract('jurMnofNm', item),
    summary:   extract('servDgst', item),
    // &amp; 디코딩
    detailUrl: (extract('servDtlLink', item) || 'https://www.bokjiro.go.kr').replace(/&amp;/g, '&'),
    lifeArray: extract('lifeArray', item),
    thema:     extract('intrsThemaArray', item),
    target:    extract('trgterIndvdlArray', item),
    cycle:     extract('sprtCycNm', item),
    method:    extract('srvPvsnNm', item),
    onlineApp: extract('onapPsbltYn', item),
  })).filter(b => b.title);

  return res.status(200).json({ totalCount, count: benefits.length, benefits });
}
