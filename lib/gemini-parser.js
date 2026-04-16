'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn('[gemini-parser] GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
}

const genAI = new GoogleGenerativeAI(API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * @typedef {Object} BenefitData
 * @property {string} 혜택명
 * @property {string} 지원대상
 * @property {string} 지원내용
 * @property {string} 신청방법
 * @property {string|null} 마감일
 * @property {number} 실생활_유용도  - 1~10점
 */

// ── 빈 값 폴백 헬퍼 ────────────────────────────────────────────────────────────
const fallback = (v, def = '정보 없음') =>
  (v === null || v === undefined || v === '') ? def : v;

/**
 * 파싱된 raw 객체를 안전한 BenefitData로 정규화합니다.
 * 어떤 필드도 undefined/null/빈 문자열 상태로 DB에 들어가지 않도록 보정합니다.
 *
 * @param {object} raw
 * @param {number} index - 원본 배열 인덱스 (로깅용)
 * @returns {BenefitData|null} 혜택명조차 없으면 null
 */
function normalize(raw, index) {
  if (!raw || typeof raw !== 'object') {
    console.log(`[gemini-parser]   [${index + 1}] ❌ 폐기 — 객체가 아님 (${JSON.stringify(raw)})`);
    return null;
  }

  // 혜택명이 없으면 제목·카테고리로 대체 시도, 그래도 없으면 폐기
  const name =
    raw['혜택명'] ||
    raw['title'] ||
    raw['제목'] ||
    (raw['카테고리'] ? `${raw['카테고리']} 관련 혜택` : null);

  if (!name) {
    console.log(`[gemini-parser]   [${index + 1}] ❌ 폐기 — 혜택명 없음: ${JSON.stringify(raw).slice(0, 120)}`);
    return null;
  }

  const normalized = {
    카테고리:      fallback(raw['카테고리'], '기타'),
    혜택명:        name,
    지원대상:      fallback(raw['지원대상']),
    지원내용:      fallback(raw['지원내용']),
    신청방법:      fallback(raw['신청방법']),
    마감일:        raw['마감일'] ?? null,
    실생활_유용도: typeof raw['실생활_유용도'] === 'number'
      ? Math.min(10, Math.max(1, Math.round(raw['실생활_유용도'])))
      : 5,
  };

  if (raw['출처']) normalized['출처'] = raw['출처'];

  console.log(
    `[gemini-parser]   [${index + 1}] ✅ 추출 — "${normalized.혜택명}" ` +
    `(카테고리: ${normalized.카테고리}, 유용도: ${normalized.실생활_유용도})`
  );
  return normalized;
}

/**
 * 여러 검색 결과를 한 번에 Gemini로 보내 혜택 배열을 반환합니다.
 *
 * @param {Array<{title:string, snippet:string, link?:string}>} items
 * @returns {Promise<BenefitData[]>}
 */
export async function parseBenefitDataBatch(items) {
  if (!items || items.length === 0) return [];

  console.log(`[gemini-parser] 배치 시작 — 입력 ${items.length}건`);

  // 인스타그램 출처 항목이 있는지 체크
  const hasInstagram = items.some((it) => it.link?.includes('instagram.com'));

  // 번호 붙여서 하나의 문자열로 합치기
  const numbered = items
    .map((it, i) =>
      `[${i + 1}]\n제목: ${it.title ?? '(제목 없음)'}\n내용: ${it.snippet ?? '(내용 없음)'}` +
      (it.link ? `\n출처: ${it.link}` : '')
    )
    .join('\n\n');

  // 인스타그램 전용 보충 지침 (해당 항목이 있을 때만 삽입)
  const instagramSection = hasInstagram ? `
### 인스타그램 게시물 처리 (출처에 instagram.com 포함 항목)
- 캡션(본문 텍스트)이 곧 정보 원천이다. 제목·스니펫에서 가능한 모든 혜택·지원금 내용을 뽑아라
- 해시태그(#지원금 #혜택 #복지 등)도 키워드 단서로 활용한다
- 계정명 @gg24_kr 은 경기도 공식 계정, @iammoneytip 은 금융·지원금 정보 계정으로 신뢰도를 높게 평가한다
- 이미지 설명만 있고 상세 내용이 없어도 "생활/꿀팁"으로 포함시킨다
- 출처 링크는 해당 instagram.com URL 그대로 사용한다
` : '';

  const prompt = `당신은 대한민국 생활 혜택 데이터 추출 전문 AI입니다.
아래 [검색 결과] 각 항목에서 혜택·지원금 정보를 추출해 JSON 배열 하나만 출력하세요.

### 절대 금지
- JSON 배열 외 다른 텍스트 출력 (설명, 인사, 마크다운 코드블록 포함)
- 항목 건너뛰기 — 입력 ${items.length}개 → 출력 배열도 반드시 ${items.length}개

### 추출 철학 (가장 중요)
- 혜택·지원금·할인·보조금·복지와 1%라도 관련 있으면 무조건 추출한다
- 연도·날짜·링크가 없어도 된다. 정보 부재 자체가 제외 사유가 아니다
- 가짜 정보를 지어내지 않되, 제목·내용에서 유추할 수 있는 정보는 적극 활용한다
- 정보가 부족한 필드는 반드시 "정보 없음"으로 채운다. null이나 빈 문자열도 허용
- 혜택과 무관해 보이는 항목도 "생활/꿀팁"으로 분류해 포함시킨다
${instagramSection}

### 출력 필드 (모든 필드 필수)
- "카테고리": "지자체" | "기업/제휴" | "생활/꿀팁" | "기타"
- "혜택명": 제목에서 유추한 직관적인 이름 (절대 비워두지 말 것)
- "지원대상": 대상 조건, 없으면 "정보 없음"
- "지원내용": 핵심 혜택 내용, 없으면 "정보 없음"
- "신청방법": 신청 방법·URL, 없으면 "정보 없음"
- "마감일": "YYYY-MM-DD" 형식 또는 null
- "실생활_유용도": 1~10 정수 (판단 불가 시 5)
- "출처": 링크가 있으면 포함, 없으면 이 필드 생략

### 출력 예시
[
  {
    "카테고리": "지자체",
    "혜택명": "서울시 청년 월세 지원",
    "지원대상": "서울 거주 만 19~39세 청년",
    "지원내용": "월 최대 20만원, 최대 12개월 지원",
    "신청방법": "서울시 복지포털 온라인 신청",
    "마감일": null,
    "실생활_유용도": 9,
    "출처": "https://example.com"
  },
  {
    "카테고리": "생활/꿀팁",
    "혜택명": "에너지 절약 캐시백 신청 방법",
    "지원대상": "정보 없음",
    "지원내용": "에너지 절약량에 따른 캐시백 지급",
    "신청방법": "정보 없음",
    "마감일": null,
    "실생활_유용도": 5
  }
]

[검색 결과]
${numbered}`;

  let text = '';
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text().trim();

    // ── Gemini 원문 전체 로깅
    console.log('[gemini-parser] ── Gemini Raw 시작 ──────────────────────');
    console.log(text);
    console.log('[gemini-parser] ── Gemini Raw 끝 ────────────────────────');

    // ── 코드블록 펜스 제거
    const fencePattern = new RegExp('\u0060{3}[a-zA-Z]*\\s*', 'g');
    const cleaned = text.replace(fencePattern, '').trim();

    // ── JSON 파싱 시도 1: 배열
    let parsed = null;
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch (jsonErr) {
        console.warn(`[gemini-parser] 배열 JSON 파싱 실패: ${jsonErr.message}`);
      }
    }

    // ── JSON 파싱 시도 2: 단일 객체 → 배열로 래핑
    if (!Array.isArray(parsed)) {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const obj = JSON.parse(objMatch[0]);
          parsed = [obj];
          console.warn('[gemini-parser] ⚠️  배열 대신 단일 객체로 응답 — 배열로 래핑');
        } catch (jsonErr) {
          console.warn(`[gemini-parser] 단일 객체 JSON 파싱도 실패: ${jsonErr.message}`);
        }
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error(
        `[gemini-parser] ❌ JSON 파싱 완전 실패 — 입력 ${items.length}건, 추출 0건\n` +
        `  cleaned 앞부분: ${cleaned.slice(0, 400)}`
      );
      return [];
    }

    console.log(`[gemini-parser] Gemini 응답 파싱 완료 — 원본 ${parsed.length}개 객체`);

    // ── 정규화 + 로깅
    const benefits = parsed
      .map((raw, i) => normalize(raw, i))
      .filter(Boolean);

    console.log(
      `[gemini-parser] 배치 완료 — 입력 ${items.length}건 → ` +
      `Gemini 응답 ${parsed.length}건 → 최종 저장 ${benefits.length}건`
    );

    return benefits;

  } catch (error) {
    const msg = error?.message ?? String(error);
    console.error(`[gemini-parser] ❌ 배치 처리 예외: ${msg}`);
    if (text) {
      console.error(`[gemini-parser] Gemini 원문 앞 500자:\n${text.slice(0, 500)}`);
    }
    return [];
  }
}

/**
 * 단일 텍스트를 분석합니다 (기존 API 호환용).
 *
 * @param {string} rawContent
 * @returns {Promise<BenefitData|null>}
 */
export async function parseBenefitData(rawContent) {
  if (!rawContent || rawContent.trim().length === 0) return null;
  const results = await parseBenefitDataBatch([{ title: '', snippet: rawContent }]);
  return results[0] ?? null;
}
