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

/**
 * 여러 검색 결과를 한 번에 Gemini로 보내 혜택 배열을 반환합니다.
 *
 * @param {Array<{title:string, snippet:string, link?:string}>} items - Serper 검색 결과 목록
 * @returns {Promise<BenefitData[]>} 파싱된 혜택 배열 (실패 시 [])
 */
export async function parseBenefitDataBatch(items) {
  if (!items || items.length === 0) return [];

  // 번호 붙여서 하나의 문자열로 합치기
  const numbered = items
    .map((it, i) => `[${i + 1}]\n제목: ${it.title ?? ''}\n내용: ${it.snippet ?? ''}${it.link ? `\n출처: ${it.link}` : ''}`)
    .join('\n\n');

  const prompt = `
당신은 대한민국 생활 혜택 추출 봇입니다.
아래 검색 결과 목록을 보고, 각 항목에서 혜택 정보를 추출해 JSON 배열로만 응답하세요.

[절대 규칙 — 반드시 지킬 것]
1. 응답은 반드시 JSON 배열([...])만 출력하세요. 설명, 인사, 마크다운 코드블록 일절 금지.
2. 각 검색 결과마다 반드시 하나의 객체를 만들어 배열에 포함하세요. 건너뛰지 마세요.
3. 정보가 부족하면 "상세페이지 확인 요망"으로 채우세요. 절대 항목을 빠트리지 마세요.
4. 연도가 본문에 없어도 검색 결과에 나왔다면 최신 정보로 간주하고 무조건 추출하세요.
5. 조금이라도 혜택과 관련 있으면 추측해서라도 모든 필드를 채워 출력하세요.

[각 객체 필드]
- "카테고리": "지자체" | "기업/제휴" | "생활/꿀팁" 중 하나
- "혜택명": 제목에서 유추한 직관적인 혜택 이름
- "지원대상": 대상 조건 (불명확하면 "상세페이지 확인 요망")
- "지원내용": 할인 금액, 환급, 제공 물품 등 핵심 이득 (불명확하면 "상세페이지 확인 요망")
- "신청방법": URL, 방문 장소, 앱 등 (불명확하면 "상세페이지 확인 요망")
- "마감일": "YYYY-MM-DD" 또는 null
- "실생활_유용도": 1~10 정수
- "출처": 링크가 있으면 포함, 없으면 생략

[출력 형식 예시 — 이 형식 그대로]
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
  }
]

[검색 결과]
${numbered}
`;

  let text = '';
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text().trim();

    // 디버그: Gemini 원문 전체 출력
    console.log('[gemini-parser] Gemini Raw:', text);

    // 코드블록 펜스 제거
    const fencePattern = new RegExp('\u0060{3}[a-zA-Z]*\\s*', 'g');
    const cleaned = text.replace(fencePattern, '').trim();

    // JSON 배열 추출 (배열로 시작하는 가장 바깥쪽 블록)
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      // 배열이 없으면 단일 객체인지 시도
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!objMatch) {
        throw new Error(`JSON을 찾을 수 없습니다. 원문: ${cleaned.slice(0, 300)}`);
      }
      const obj = JSON.parse(objMatch[0]);
      return obj['혜택명'] ? [obj] : [];
    }

    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed)) return [];

    // 혜택명 없는 항목 제거, 유용도 범위 보정
    return parsed
      .filter((item) => item && item['혜택명'])
      .map((item) => {
        if (typeof item['실생활_유용도'] === 'number') {
          item['실생활_유용도'] = Math.min(10, Math.max(1, Math.round(item['실생활_유용도'])));
        }
        return item;
      });
  } catch (error) {
    console.error('[gemini-parser] 배치 분석 에러:', error.message ?? error);
    if (text) console.error('[gemini-parser] 원문 앞부분:', text.slice(0, 500));
    return [];
  }
}

/**
 * 단일 텍스트를 분석합니다 (기존 API 호환용).
 * 내부적으로 배치 함수를 1건짜리로 호출합니다.
 *
 * @param {string} rawContent
 * @returns {Promise<BenefitData|null>}
 */
export async function parseBenefitData(rawContent) {
  if (!rawContent || rawContent.trim().length === 0) return null;
  const results = await parseBenefitDataBatch([{ title: '', snippet: rawContent }]);
  return results[0] ?? null;
}
