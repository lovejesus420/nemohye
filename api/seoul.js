// api/seoul.js — Vercel Serverless Function
// 서울시 열린데이터광장 공공서비스예약 API 프록시
// Base: http://openapi.seoul.go.kr:8088/{KEY}/json/{SERVICE}/{start}/{end}
// Endpoint: GET /api/seoul?age=30&extras=청년&address=서울특별시+마포구

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SEOUL_KEY = process.env.SEOUL_API_KEY;
  if (!SEOUL_KEY) {
    return res.status(500).json({ error: 'SEOUL_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { age, extras = '', address = '' } = req.query;
  const ageNum = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  // 서울 거주자만 (경기도와 동일 패턴)
  const isSeoul = address.includes('서울');
  if (!isSeoul) {
    return res.status(200).json({ count: 0, benefits: [], skipped: true, reason: '서울 거주자 아님' });
  }

  // 구(자치구) 추출
  const guMatch = address.match(/서울(?:특별시)?\s*(.+?구)/);
  const gu = guMatch?.[1] || '';

  // ── 서비스별 fetch 헬퍼
  const BASE = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json`;
  const fetchSvc = async (svcName, start = 1, end = 100) => {
    const url = `${BASE}/${svcName}/${start}/${end}`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return [];
      const data = await resp.json();
      const block = data?.[svcName];
      if (!block || block.RESULT?.CODE !== 'INFO-000') return [];
      return block.row || [];
    } catch {
      return [];
    }
  };

  // ── 사용자 대상 키워드 (USETGTINFO 매칭용)
  const targetKeywords = ['전체', '제한없음', '누구나', '시민'];
  if (!isNaN(ageNum)) {
    if (ageNum < 8)               targetKeywords.push('영유아', '아동');
    else if (ageNum < 14)         targetKeywords.push('아동', '어린이');
    else if (ageNum < 19)         targetKeywords.push('청소년');
    else if (ageNum < 35)         targetKeywords.push('청년', '청소년');
    else if (ageNum >= 65)        targetKeywords.push('어르신', '노인', '시니어');
  }
  if (extraList.some(e => e.includes('청년')))     targetKeywords.push('청년');
  if (extraList.some(e => e.includes('임산부')))   targetKeywords.push('임산부', '산모');
  if (extraList.some(e => e.includes('출산')))     targetKeywords.push('임산부', '영유아', '아동');
  if (extraList.some(e => e.includes('신혼')))     targetKeywords.push('청년', '신혼');
  if (extraList.some(e => e.includes('다자녀')))   targetKeywords.push('가족', '어린이', '아동');
  if (extraList.some(e => e.includes('장애인')))   targetKeywords.push('장애', '장애인');
  if (extraList.some(e => e.includes('노인') || e.includes('65세'))) targetKeywords.push('어르신', '노인');
  if (extraList.some(e => e.includes('기초') || e.includes('저소득'))) targetKeywords.push('저소득', '취약');

  // ── 병렬로 복지·교육·문화 서비스 조회
  const [welfareRows, eduRows, cultureRows] = await Promise.all([
    fetchSvc('ListPublicReservationSociety', 1, 100),   // 복지 (실제 키 필요)
    fetchSvc('ListPublicReservationEducation', 1, 100), // 교육강좌
    fetchSvc('ListPublicReservationCulture', 1, 50),    // 문화체험
  ]);

  // ── 통합 후 처리
  const allRows = [
    ...welfareRows.map(r => ({ ...r, _category: '복지' })),
    ...eduRows.map(r => ({ ...r, _category: '교육' })),
    ...cultureRows.map(r => ({ ...r, _category: '문화' })),
  ];

  // 1) 접수중·안내중만 (마감된 것 제외)
  const active = allRows.filter(r =>
    r.SVCSTATNM === '접수중' || r.SVCSTATNM === '안내중' || r.SVCSTATNM === '예약마감'
  );

  // 2) 대상 키워드 매칭
  const matched = active.filter(r => {
    const target = r.USETGTINFO || '';
    if (!target) return true; // 대상 정보 없으면 포함
    return targetKeywords.some(kw => target.includes(kw));
  });

  // 3) 구 우선 정렬 (해당 구 → 전체)
  matched.sort((a, b) => {
    const aGu = a.AREANM || '';
    const bGu = b.AREANM || '';
    if (gu) {
      const aMatch = aGu.includes(gu) ? 0 : 1;
      const bMatch = bGu.includes(gu) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    // 접수중 우선
    const statusOrder = { '접수중': 0, '안내중': 1, '예약마감': 2 };
    return (statusOrder[a.SVCSTATNM] ?? 9) - (statusOrder[b.SVCSTATNM] ?? 9);
  });

  const benefits = (matched.length >= 3 ? matched : active).slice(0, 50).map(row => ({
    title:      row.SVCNM || '',
    category:   row._category || row.MAXCLASSNM || '',
    subCategory: row.MINCLASSNM || '',
    status:     row.SVCSTATNM || '',
    area:       row.AREANM || '서울',
    place:      row.PLACENM || '',
    target:     row.USETGTINFO || '전체',
    payType:    row.PAYATNM || '',
    startDate:  row.SVCOPNBGNDT || '',
    endDate:    row.SVCOPNENDDT || '',
    applyStart: row.RCPTBGNDT || '',
    applyEnd:   row.RCPTENDDT || '',
    summary:    (row.DTLCONT || '').replace(/&[a-z]+;|<[^>]+>/g, '').slice(0, 120),
    applyUrl:   row.SVCURL || `https://yeyak.seoul.go.kr`,
    tel:        row.TELNO || '',
  })).filter(b => b.title);

  return res.status(200).json({
    count: benefits.length,
    welfareCount: welfareRows.length,
    eduCount: eduRows.length,
    cultureCount: cultureRows.length,
    benefits,
  });
}
