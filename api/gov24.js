// api/gov24.js — Vercel Serverless Function
// 행정안전부 정부24 공공서비스(혜택) 목록 API 프록시
// Base: https://api.odcloud.kr/api/gov24/v3/serviceList
// Endpoint: GET /api/gov24?age=30&extras=청년,한부모+가정&job=직장인&income=월+200~300만원

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const GOV24_KEY = process.env.GOV24_API_KEY;
  if (!GOV24_KEY) {
    return res.status(500).json({ error: 'GOV24_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { age, extras = '', job = '', income = '' } = req.query;
  const ageNum = parseInt(age, 10);
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  // ── 서비스분야별로 조회
  // 실제 API 분야값: 생활안정, 주거·자립, 고용·창업, 보육·교육, 보건·의료, 행정·안전, 문화·환경, 농림축산어업
  const fieldsToFetch = new Set(['생활안정', '주거·자립', '고용·창업']);

  if (!isNaN(ageNum) && ageNum <= 8) {
    fieldsToFetch.add('보육·교육');
  }
  if (extraList.some(e => e.includes('임산부') || e.includes('출산') || e.includes('영유아'))) {
    fieldsToFetch.add('보육·교육');
  }
  if (extraList.some(e => e.includes('장애인'))) {
    fieldsToFetch.add('생활안정');
  }
  if (job.includes('학생') || (!isNaN(ageNum) && ageNum <= 25)) {
    fieldsToFetch.add('보육·교육');
  }

  // ── 사용자 키워드 목록 (지원대상 텍스트 매칭용)
  const targetKeywords = [];
  if (!isNaN(ageNum)) {
    if (ageNum < 8)   targetKeywords.push('영유아', '아동');
    else if (ageNum < 19) targetKeywords.push('청소년', '아동');
    else if (ageNum < 35) targetKeywords.push('청년');
    else if (ageNum >= 65) targetKeywords.push('노인', '어르신', '65세');
  }
  if (extraList.some(e => e.includes('임산부')))  targetKeywords.push('임산부', '산모');
  if (extraList.some(e => e.includes('출산')))    targetKeywords.push('출산', '영아');
  if (extraList.some(e => e.includes('신혼')))    targetKeywords.push('신혼', '결혼');
  if (extraList.some(e => e.includes('다자녀')))  targetKeywords.push('다자녀');
  if (extraList.some(e => e.includes('한부모')))  targetKeywords.push('한부모');
  if (extraList.some(e => e.includes('장애인')))  targetKeywords.push('장애');
  if (extraList.some(e => e.includes('기초') || e.includes('차상위') || e.includes('저소득'))) targetKeywords.push('저소득', '기초생활', '차상위');
  if (extraList.some(e => e.includes('보훈') || e.includes('유공자'))) targetKeywords.push('보훈', '유공자');

  // 항상 포함
  targetKeywords.push('전국민', '모든 국민', '가구', '개인');

  try {
    // 서비스분야별로 병렬 조회 (각 30개)
    // ⚠️ URLSearchParams는 [ ] 를 인코딩해서 cond 필터가 무시됨 → 직접 문자열 조합
    const fetchField = async (field) => {
      const url = `https://api.odcloud.kr/api/gov24/v3/serviceList?page=1&perPage=30&serviceKey=${encodeURIComponent(GOV24_KEY)}&cond[서비스분야::LIKE]=${field}`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.data || [];
    };

    const fieldResults = await Promise.all([...fieldsToFetch].map(fetchField));
    const allItems = fieldResults.flat();

    // 중복 제거
    const seen = new Set();
    const unique = allItems.filter(item => {
      const id = item['서비스ID'];
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // 지원대상 텍스트로 관련성 필터링 (키워드 없으면 전체 반환)
    let filtered = unique;
    if (targetKeywords.length > 3) {
      filtered = unique.filter(item => {
        const target = (item['지원대상'] || '') + (item['선정기준'] || '') + (item['서비스목적요약'] || '');
        return targetKeywords.some(kw => target.includes(kw));
      });
      // 필터 후 너무 적으면 원본 사용
      if (filtered.length < 5) filtered = unique;
    }

    // 조회수 기준 정렬 (인기순)
    filtered.sort((a, b) => (parseInt(b['조회수']) || 0) - (parseInt(a['조회수']) || 0));

    const benefits = filtered.slice(0, 50).map(item => ({
      title:      item['서비스명'] || '',
      ministry:   item['소관기관명'] || '',
      orgType:    item['소관기관유형'] || '',
      field:      item['서비스분야'] || '',
      target:     item['지원대상']?.slice(0, 80) || '',
      summary:    item['서비스목적요약'] || '',
      support:    item['지원내용']?.slice(0, 100) || '',
      applyMethod: item['신청방법'] || '',
      applyDeadline: item['신청기한'] || '',
      applyUrl:   item['상세조회URL'] || 'https://www.gov.kr/portal/serviceList',
      contact:    item['전화문의'] || '',
      views:      parseInt(item['조회수']) || 0,
    })).filter(b => b.title);

    return res.status(200).json({ count: benefits.length, benefits });
  } catch (e) {
    return res.status(502).json({ error: '정부24 API 호출 실패: ' + e.message });
  }
}
