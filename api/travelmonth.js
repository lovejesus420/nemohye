// api/travelmonth.js — 한국관광공사 "여행가는 달" 혜택 수집 엔드포인트
//
// GET /api/travelmonth
//
// 동작:
//   1. Serper로 visitkorea 여행가는 달 + 블로그/뉴스 검색 (병렬)
//   2. Gemini로 혜택 정보 추출 (EventCard 호환 스키마)
//   3. 결과 캐싱 (6시간)
//   4. JSON 반환

import { GoogleGenerativeAI } from '@google/generative-ai';

const SERPER_URL     = 'https://google.serper.dev/search';
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── 인메모리 캐시 (Vercel 함수 재사용 인스턴스에서 유효)
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

// ── Serper 검색 헬퍼
async function searchGoogle(query, num = 10) {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  const data = await res.json();
  return data.organic ?? [];
}

// ── 카테고리 → 이모지 매핑
const CAT_ICON = {
  '숙박':     '🏨',
  '교통':     '🚆',
  '관광/레저': '🎡',
  '음식/카페': '🍽️',
  '쇼핑':     '🛍️',
  '기타':     '✨',
};
const CAT_COLOR = {
  '숙박':     { color: '#2563eb', bg: '#eff6ff' },
  '교통':     { color: '#059669', bg: '#ecfdf5' },
  '관광/레저': { color: '#d97706', bg: '#fffbeb' },
  '음식/카페': { color: '#db2777', bg: '#fdf2f8' },
  '쇼핑':     { color: '#7c3aed', bg: '#f5f3ff' },
  '기타':     { color: '#374151', bg: '#f9fafb' },
};

// ── Gemini 추출
async function extractWithGemini(items) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY ?? '');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const numbered = items
    .map((it, i) =>
      `[${i + 1}]\n제목: ${it.title ?? ''}\n내용: ${it.snippet ?? ''}` +
      (it.link ? `\n출처: ${it.link}` : '')
    )
    .join('\n\n');

  const year = new Date().getFullYear();
  const prompt = `당신은 한국관광공사 "여행가는 달(${year})" 캠페인 혜택 추출 전문 AI입니다.
아래 [검색 결과]에서 여행가는 달 혜택·할인 정보를 추출해 JSON 배열 하나만 출력하세요.

### 절대 금지
- JSON 배열 외 다른 텍스트 (설명, 마크다운 코드블록 포함)

### 추출 대상
숙박 할인(호텔·펜션·리조트), 교통 할인(KTX·항공·버스·선박), 관광지/테마파크 입장 할인,
식음료 할인, 쇼핑 혜택, 여행 패키지 할인 등 여행 관련 모든 혜택

### 출력 스키마 (배열, 모든 필드 필수)
- "category": "숙박" | "교통" | "관광/레저" | "음식/카페" | "쇼핑" | "기타"
- "title": "업체명 + 핵심 혜택 (예: 롯데호텔 최대 30% 할인)"
- "institution": "제공 업체·기관명"
- "amount": "할인율·금액 등 혜택 요약"
- "period": "이용 기간 (없으면 '${year}년 여행가는 달 기간')"
- "condition": "이용 조건 (없으면 '여행가는 달 페이지 쿠폰 사용')"
- "howToApply": "이용 방법"
- "applyUrl": "출처 URL (없으면 'https://korean.visitkorea.or.kr/travelmonth/main.do')"

### 출력 예시
[{"category":"숙박","title":"롯데호텔 최대 30% 할인","institution":"롯데호텔","amount":"전 객실 최대 30% 할인","period":"${year}년 4~5월","condition":"여행가는 달 쿠폰 코드 입력","howToApply":"롯데호텔 공식 홈페이지 예약 시 쿠폰 코드 입력","applyUrl":"https://korean.visitkorea.or.kr/travelmonth/main.do"}]

[검색 결과]
${numbered}`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text().trim();

  // 코드블록 제거 후 JSON 파싱
  const cleaned  = text.replace(/```[a-zA-Z]*\s*/g, '').trim();
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) return [];

  let parsed;
  try { parsed = JSON.parse(arrMatch[0]); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  // EventCard 호환 포맷으로 변환
  return parsed
    .filter(it => it.title)
    .map((it, i) => {
      const cat    = it.category || '기타';
      const colors = CAT_COLOR[cat] || CAT_COLOR['기타'];
      return {
        id:            `travelmonth-${Date.now()}-${i}`,
        eventType:     'travelmonth',
        badge:         `여행가는 달 · ${cat}`,
        badgeColor:    colors.color,
        badgeBg:       colors.bg,
        categoryIcon:  CAT_ICON[cat] || '✨',
        category:      cat,
        scope:         '전국',
        title:         it.title,
        institution:   it.institution || '한국관광공사',
        amount:        it.amount || '혜택 제공',
        period:        it.period || `${year}년 여행가는 달`,
        condition:     it.condition || '',
        howToApply:    it.howToApply || '',
        applyUrl:      it.applyUrl || 'https://korean.visitkorea.or.kr/travelmonth/main.do',
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

  // 캐시 유효하면 즉시 반환
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    console.log('[travelmonth] 캐시 히트');
    return res.status(200).json({ ok: true, fromCache: true, benefits: _cache });
  }

  if (!SERPER_API_KEY || !GEMINI_API_KEY) {
    return res.status(503).json({ ok: false, error: 'API 키 미설정', benefits: [] });
  }

  try {
    const year = new Date().getFullYear();

    // ── Serper 병렬 검색 (4개 쿼리)
    const queries = [
      `site:korean.visitkorea.or.kr/travelmonth ${year} 혜택 할인`,
      `여행가는 달 ${year} 숙박 교통 할인 혜택 참여업체`,
      `여행가는 달 ${year} 관광지 입장료 할인 이용방법`,
      `한국관광공사 여행가는 달 ${year} 후기 혜택 정리`,
    ];

    const results = await Promise.allSettled(
      queries.map(q => searchGoogle(q, 10))
    );

    // 수집 + URL 기준 중복 제거
    const seen = new Set();
    const items = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[travelmonth] 쿼리 ${i + 1} → ${r.value.length}건`);
        r.value.forEach(it => {
          if (it.link && !seen.has(it.link)) {
            seen.add(it.link);
            items.push(it);
          }
        });
      } else {
        console.error(`[travelmonth] 쿼리 ${i + 1} 실패: ${r.reason?.message}`);
      }
    });

    console.log(`[travelmonth] 중복 제거 후 ${items.length}건 → Gemini 전송`);

    if (items.length === 0) {
      return res.status(200).json({ ok: true, benefits: [], fetchedAt: new Date().toISOString() });
    }

    // Gemini 추출 (최대 20건)
    const benefits = await extractWithGemini(items.slice(0, 20));
    console.log(`[travelmonth] Gemini 추출 완료 → ${benefits.length}건`);

    // 캐시 저장
    _cache  = benefits;
    _cacheAt = Date.now();

    return res.status(200).json({
      ok:         true,
      fromCache:  false,
      count:      benefits.length,
      fetchedAt:  new Date().toISOString(),
      benefits,
    });

  } catch (e) {
    console.error(`[travelmonth] ❌ 오류: ${e?.message ?? e}`);
    return res.status(500).json({ ok: false, error: e?.message, benefits: [] });
  }
}
