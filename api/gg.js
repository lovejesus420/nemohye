// api/gg.js — Vercel Serverless Function
// 경기도 공공서비스 목록 API 프록시
// https://openapi.gg.go.kr/PublServcList
// Endpoint: GET /api/gg?address=경기도+수원시&extras=청년

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const GG_KEY = process.env.GG_API_KEY;
  if (!GG_KEY) {
    return res.status(500).json({ error: 'GG_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const { address = '', extras = '', orgName = '' } = req.query;
  const extraList = extras ? extras.split(',').map(s => s.trim()) : [];

  // 경기도 주소가 아닌 경우 빈 결과 반환 (다른 지역 사람에게 무관한 데이터 제공 방지)
  const isGyeonggi = address.includes('경기');
  if (!isGyeonggi) {
    return res.status(200).json({ count: 0, benefits: [], skipped: true, reason: '경기도 거주자 아님' });
  }

  // 소관기관명 필터 — 주소에서 시/군 추출해서 지역 기관 우선
  const cityMatch = address.match(/경기(?:도)?\s*(.+?(?:시|군))/);
  const city = cityMatch?.[1] || '';

  try {
    // 병렬로 전체 목록 + 기관명 필터 조회
    const fetchList = async (params = {}) => {
      const query = new URLSearchParams({
        KEY: GG_KEY,
        Type: 'json',
        pIndex: '1',
        pSize: '100',
        ...params,
      });
      const url = `https://openapi.gg.go.kr/PublServcList?${query.toString()}`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) return [];
      const data = await resp.json();
      // 응답 구조: { PublServcList: [ {head:[{LIST_TOTAL_COUNT}]}, {row:[...items]} ] }
      const block = data?.PublServcList;
      if (!Array.isArray(block)) return [];
      const rowBlock = block.find(b => b.row);
      return rowBlock?.row || [];
    };

    // 전체 조회 + 시/군 기관 필터 병렬
    const requests = [fetchList()];
    if (city) {
      requests.push(fetchList({ PUBL_SERVC_JURSDCTN_INST_NM: city }));
    }

    const results = await Promise.all(requests);
    const seen = new Set();
    const allItems = results.flat().filter(item => {
      const id = item.PUBL_SERVC_ID;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // 추가상황 기반 키워드 매칭 필터
    const keywords = ['전체', '도민', '경기도민', '주민', '가구'];
    if (extraList.some(e => e.includes('청년')))   keywords.push('청년');
    if (extraList.some(e => e.includes('임산부') || e.includes('출산'))) keywords.push('임산부', '출산', '산모');
    if (extraList.some(e => e.includes('신혼')))   keywords.push('신혼', '결혼');
    if (extraList.some(e => e.includes('다자녀'))) keywords.push('다자녀');
    if (extraList.some(e => e.includes('한부모'))) keywords.push('한부모');
    if (extraList.some(e => e.includes('장애인'))) keywords.push('장애');
    if (extraList.some(e => e.includes('기초') || e.includes('저소득'))) keywords.push('저소득', '기초');
    if (extraList.some(e => e.includes('노인') || e.includes('65세'))) keywords.push('노인', '어르신');

    const filtered = allItems.filter(item => {
      const text = (item.PUBL_SERVC_TITLE || '') + (item.PUBL_SERVC_PURPS_DTCONT || '');
      return keywords.some(kw => text.includes(kw));
    });

    const benefits = (filtered.length >= 5 ? filtered : allItems).slice(0, 50).map(item => ({
      title:      item.PUBL_SERVC_TITLE || '',
      ministry:   item.PUBL_SERVC_JURSDCTN_INST_NM || '경기도',
      summary:    (item.PUBL_SERVC_PURPS_DTCONT || '').slice(0, 120),
      support:    (item.SPORT_FORM_DTLS || ''),
      applyUrl:   item.PUBL_SERVC_DETAIL_KOR_URL || item.PUBL_SERVC_DETAIL_URL || 'https://www.gg.go.kr',
      updatedAt:  item.LAST_UPD_DE || '',
    })).filter(b => b.title);

    return res.status(200).json({ count: benefits.length, benefits });
  } catch (e) {
    return res.status(502).json({ error: '경기도 API 호출 실패: ' + e.message });
  }
}
