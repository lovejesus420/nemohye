// api/festival.js — 이달의 문화축제 데이터 엔드포인트
//
// GET /api/festival?month=4  (기본값: 현재 월)
//
// ── 데이터 우선순위 ──────────────────────────────────────────────────────────
//  1순위: 한국관광공사 KorService2  /searchFestival2  (KORSERVICE_API_KEY)
//         End Point: https://apis.data.go.kr/B551011/KorService2
//         → 공식 행사·축제 정보, 이미지·상세링크 포함
//
//  2순위: 공공데이터포털 전국문화축제 표준데이터  (FESTIVAL_API_KEY)
//         End Point: https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api
//         → 1순위 키가 없거나 실패할 때 폴백
//
// Vercel 환경변수에 KORSERVICE_API_KEY, FESTIVAL_API_KEY 중 하나 이상 설정
// ─────────────────────────────────────────────────────────────────────────────

const KORSERVICE_BASE   = 'https://apis.data.go.kr/B551011/KorService2';
const FESTIVAL_STD_BASE = 'https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api';

// ── 인메모리 캐시 (월별)
const _cache = {};            // { 'YYYY-MM': { data, fetchedAt } }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

// ── 날짜 포맷: "20260415" → "2026.04.15"
function fmtDate(s) {
  if (!s || s.length < 8) return s || '';
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

// ── 주소 → scope (시·도 + 시·군·구)
function extractScope(addr) {
  if (!addr) return '전국';
  const parts = addr.trim().split(/\s+/);
  return parts.slice(0, 2).join(' ') || parts[0] || '전국';
}

// ── 축제명 → 이모지 아이콘
function guessIcon(name = '') {
  if (/벚꽃|꽃|화전|장미|국화|튤립|유채/.test(name)) return '🌸';
  if (/불꽃|빛|야간|조명|미디어아트|루미나/.test(name)) return '✨';
  if (/음악|재즈|클래식|록|밴드|국악|오케스트라/.test(name)) return '🎵';
  if (/영화|시네마|필름/.test(name)) return '🎬';
  if (/음식|먹거리|미식|요리|푸드|마늘|딸기|복숭아|포도|사과|막걸리|한우|갈비/.test(name)) return '🍽️';
  if (/해산물|수산|갯벌|해변|바다|굴|꽃게|멍게/.test(name)) return '🦞';
  if (/도자기|공예|전통|민속/.test(name)) return '🏺';
  if (/마라톤|달리기|걷기|트레킹/.test(name)) return '🏃';
  if (/눈|얼음|겨울/.test(name)) return '⛄';
  if (/여름|물|워터|해수욕|수상/.test(name)) return '🌊';
  if (/단풍|가을/.test(name)) return '🍂';
  if (/연극|뮤지컬|공연|퍼포먼스/.test(name)) return '🎭';
  if (/봄|spring/.test(name)) return '🌱';
  return '🎊';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1순위: KorService2 /searchFestival2
// ─────────────────────────────────────────────────────────────────────────────
async function fetchKorService(apiKey, startDate, endDate, month) {
  const params = new URLSearchParams({
    serviceKey:     apiKey,
    numOfRows:      '100',
    pageNo:         '1',
    MobileOS:       'ETC',
    MobileApp:      '네모혜',
    _type:          'json',
    listYN:         'Y',
    arrange:        'A',
    eventStartDate: startDate,
    eventEndDate:   endDate,
  });

  const url = `${KORSERVICE_BASE}/searchFestival2?${params.toString()}`;
  console.log(`[festival] KorService2 호출 (${startDate}~${endDate})`);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`KorService2 HTTP ${res.status}`);

  const raw    = await res.json();
  const header = raw?.response?.header;
  // 성공 코드: "0000" (KorService2)
  if (header?.resultCode !== '0000') {
    throw new Error(`KorService2 에러 [${header?.resultCode}] ${header?.resultMsg}`);
  }

  const totalCount = raw?.response?.body?.totalCount ?? 0;
  console.log(`[festival] KorService2 총 ${totalCount}건`);

  const rawItems = raw?.response?.body?.items?.item ?? [];
  const itemList = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);

  return itemList
    .filter(it => it.title)
    .map((it, i) => {
      const name   = it.title || '';
      const addr   = it.addr1 || '';
      const start  = fmtDate(it.eventstartdate);
      const end    = fmtDate(it.eventenddate);
      const period = (start && end)
        ? `${start} ~ ${end}`
        : start || '일정 확인 필요';

      // visitkorea 상세 페이지 링크
      const detailUrl = it.contentid
        ? `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${it.contentid}`
        : 'https://korean.visitkorea.or.kr';

      const scope = extractScope(addr);
      return {
        id:           `kor-${it.contentid || i}`,
        eventType:    'festival-api',          // EventDetailModal에서 API 전용 뷰 사용
        badge:        `${month}월 축제`,
        badgeColor:   '#db2777',
        badgeBg:      '#fdf2f8',
        categoryIcon: guessIcon(name),
        category:     '축제',
        scope,
        title:        name,
        institution:  scope + ' 관광',
        amount:       '현장 방문',
        period,
        highlight:    `${period} · ${scope}`,
        admission:    '현장 확인 필요',
        address:      addr + (it.addr2 ? ' ' + it.addr2 : ''),
        phone:        it.tel || '',
        thumbnail:    it.firstimage || it.firstimage2 || '',
        applyUrl:     detailUrl,
        source:       'KorService2',
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2순위: 공공데이터포털 전국문화축제 표준데이터 (폴백)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFestivalStd(apiKey, startDate, endDate, month) {
  const params = new URLSearchParams({
    serviceKey:     apiKey,
    pageNo:         '1',
    numOfRows:      '100',
    type:           'json',
    fstvlStartDate: startDate,
    fstvlEndDate:   endDate,
  });

  const url = `${FESTIVAL_STD_BASE}?${params.toString()}`;
  console.log(`[festival] 표준데이터 폴백 호출 (${startDate}~${endDate})`);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`표준데이터 HTTP ${res.status}`);

  const raw    = await res.json();
  const header = raw?.response?.header;
  if (header?.resultCode !== '00') {
    throw new Error(`표준데이터 에러 [${header?.resultCode}] ${header?.resultMsg}`);
  }

  const rawItems = raw?.response?.body?.items?.item ?? [];
  const itemList = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);

  return itemList
    .filter(it => it.fstvlNm)
    .map((it, i) => {
      const name   = it.fstvlNm || '';
      const addr   = it.rdnmadr || it.lnmadr || '';
      const start  = fmtDate(it.fstvlStartDate);
      const end    = fmtDate(it.fstvlEndDate);
      const period = (start && end) ? `${start} ~ ${end}` : start || '일정 확인 필요';

      const scope = extractScope(addr);
      return {
        id:           `std-${i}-${name.replace(/\s/g, '')}`,
        eventType:    'festival-api',
        badge:        `${month}월 축제`,
        badgeColor:   '#db2777',
        badgeBg:      '#fdf2f8',
        categoryIcon: guessIcon(name),
        category:     '축제',
        scope,
        title:        name,
        institution:  it.signguNm || '지자체',
        amount:       it.fstvlCo ? it.fstvlCo.slice(0, 80) : '현장 방문',
        period,
        highlight:    `${period} · ${scope}`,
        admission:    '현장 확인 필요',
        address:      addr,
        phone:        it.phoneNumber || '',
        thumbnail:    '',
        applyUrl:     it.homepageUrl || 'https://www.visitkorea.or.kr',
        source:       'StandardData',
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const korKey = process.env.KORSERVICE_API_KEY;
  const stdKey = process.env.FESTIVAL_API_KEY;

  if (!korKey && (!stdKey || stdKey === '여기에_발급받은_키_입력')) {
    return res.status(503).json({
      ok:        false,
      error:     'KORSERVICE_API_KEY 또는 FESTIVAL_API_KEY 환경변수가 설정되지 않았습니다.',
      festivals: [],
    });
  }

  const now      = new Date();
  const year     = now.getFullYear();
  const month    = parseInt(req.query.month ?? String(now.getMonth() + 1), 10);
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;

  // 캐시 히트
  const cached = _cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[festival] 캐시 히트 (${cacheKey})`);
    return res.status(200).json({ ok: true, fromCache: true, festivals: cached.data });
  }

  // 날짜 범위
  const mm        = String(month).padStart(2, '0');
  const startDate = `${year}${mm}01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}${mm}${String(lastDay).padStart(2, '0')}`;

  let festivals = [];
  let usedSource = '';

  // 1순위: KorService2
  if (korKey) {
    try {
      festivals   = await fetchKorService(korKey, startDate, endDate, month);
      usedSource  = 'KorService2';
      console.log(`[festival] KorService2 → ${festivals.length}건`);
    } catch (e) {
      console.error(`[festival] KorService2 실패: ${e.message}`);
    }
  }

  // 2순위: 표준데이터 폴백
  if (festivals.length === 0 && stdKey && stdKey !== '여기에_발급받은_키_입력') {
    try {
      festivals  = await fetchFestivalStd(stdKey, startDate, endDate, month);
      usedSource = 'StandardData';
      console.log(`[festival] 표준데이터 폴백 → ${festivals.length}건`);
    } catch (e) {
      console.error(`[festival] 표준데이터 폴백도 실패: ${e.message}`);
    }
  }

  // 캐시 저장
  _cache[cacheKey] = { data: festivals, fetchedAt: Date.now() };

  return res.status(200).json({
    ok:         true,
    fromCache:  false,
    source:     usedSource,
    month:      cacheKey,
    count:      festivals.length,
    fetchedAt:  new Date().toISOString(),
    festivals,
  });
}
