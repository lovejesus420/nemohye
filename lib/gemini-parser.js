'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

// Next.js App Router: process.env (서버 사이드)
// Vite: import.meta.env.GEMINI_API_KEY — 필요 시 아래 주석 교체
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn('[gemini-parser] GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
}

const genAI = new GoogleGenerativeAI(API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * 네모혜 Firestore 스키마에 맞는 혜택 데이터 형식
 * @typedef {Object} BenefitData
 * @property {string} 혜택명
 * @property {string} 지원대상
 * @property {string} 지원내용
 * @property {string} 신청방법
 * @property {string|null} 마감일
 * @property {number} 실생활_유용도  - 1~5점
 */

/**
 * 지자체 공고문 텍스트를 Gemini로 분석해 구조화된 JSON 객체로 반환합니다.
 *
 * @param {string} rawContent - 크롤링된 원문 텍스트
 * @returns {Promise<BenefitData|null>} 파싱된 혜택 객체, 실패 시 null
 */
export async function parseBenefitData(rawContent) {
  if (!rawContent || typeof rawContent !== 'string' || rawContent.trim().length === 0) {
    console.warn('[gemini-parser] rawContent가 비어 있습니다.');
    return null;
  }

  const prompt = `
당신은 대한민국 지자체 및 생활 혜택 분석 전문가이자 '네모혜' 서비스의 데이터 엔지니어입니다.
다음 텍스트에서 사용자가 실제로 혜택을 볼 수 있는 정보를 찾아 JSON으로만 응답하세요.

[추출 규칙]
1. 카테고리 분류: 혜택의 성격에 따라 '지자체', '기업/제휴', '생활/꿀팁' 중 하나로 분류할 것.
2. 필드 구성:
   - 혜택명: 직관적이고 매력적인 제목
   - 지원대상: 혜택을 받을 수 있는 구체적인 조건
   - 지원내용: 할인 금액, 환급 비율, 제공 물품 등 핵심 이득
   - 신청방법: 온라인 URL, 방문 장소, 앱 사용법 등
   - 마감일: YYYY-MM-DD 형식 (모를 경우 null)
   - 실생활_유용도: 1~10점 사이 정수 (절약 금액과 접근성이 높을수록 고점)
3. 텍스트에 구체적인 URL이나 출처가 언급되어 있다면 '출처' 필드에 포함할 것.
4. 반드시 JSON 객체 하나만 반환하고, 마크다운 코드블록(\`\`\`)이나 설명 텍스트는 절대 포함하지 말 것.

[출력 예시]
{
  "카테고리": "기업/제휴",
  "혜택명": "4월 T멤버십 파리바게뜨 50% 할인",
  "지원대상": "SKT T멤버십 모든 고객",
  "지원내용": "매주 수요일 전 품목 50% 할인 (최대 1만원)",
  "신청방법": "T멤버십 앱 내 바코드 제시",
  "마감일": "2026-04-30",
  "실생활_유용도": 9,
  "출처": "[https://www.skt.com/](https://www.skt.com/)..."
}

텍스트: ${rawContent}
`;

  let text = '';
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text().trim();

    // 1단계: 마크다운 코드블록 펜스 제거 (모델이 규칙을 어겼을 경우 대비)
    // 백틱(\u0060) 3개 조합으로 RegExp 생성 — 리터럴 백틱은 JS 파서 오류 유발
    const fencePattern = new RegExp('\u0060{3}[a-zA-Z]*\\s*', 'g');
    let cleaned = text.replace(fencePattern, '').trim();

    // 2단계: JSON 앞뒤 설명 텍스트 제거
    // 모델이 "다음은 추출된 결과입니다:\n{...}" 같은 문장을 붙일 때 대비
    // 가장 바깥쪽 중괄호 블록만 추출
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`JSON 객체를 찾을 수 없습니다. 원문: ${cleaned.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 필수 필드 검증
    const required = ['혜택명', '지원대상', '지원내용', '신청방법'];
    const missing = required.filter((k) => !parsed[k]);
    if (missing.length > 0) {
      console.warn(`[gemini-parser] 필수 필드 누락: ${missing.join(', ')}`);
    }

    // 실생활_유용도 범위 보정
    if (typeof parsed['실생활_유용도'] === 'number') {
      parsed['실생활_유용도'] = Math.min(5, Math.max(1, Math.round(parsed['실생활_유용도'])));
    }

    return parsed;
  } catch (error) {
    console.error('[gemini-parser] 분석 에러:', error.message ?? error);
    if (text) console.error('[gemini-parser] 모델 응답 원문:', text.slice(0, 500));
    return null;
  }
}
