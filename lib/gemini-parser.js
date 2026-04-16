'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn('[gemini-parser] GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
}

const genAI = new GoogleGenerativeAI(API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/** ms 대기 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {Object} BenefitData
 * @property {string} 혜택명
 * @property {string} 지원대상
 * @property {string} 지원내용
 * @property {string} 신청방법
 * @property {string|null} 마감일
 * @property {number} 실생활_유용도  - 1~10점
 */

const fallback = (v, def = '정보 없음') =>
  (v === null || v === undefined || v === '') ? def : v;

function normalize(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw['혜택명'] || raw['title'] || raw['제목'] || (raw['카테고리'] ? `${raw['카테고리']} 관련 혜택` : null);
  if (!name) return null;

  const normalized = {
    카테고리:      fallback(raw['카테고리'], '기타'),
    혜택명:        name,
    지원대상:      fallback(raw['지원대상']),
    지원내용:      fallback(raw['지원내용']),
    신청방법:      fallback(raw['신청방법']),
    마감일:        raw['마감일'] ?? null,
    실생활_유용도: typeof raw['실생활_유용도'] === 'number' ? Math.min(10, Math.max(1, Math.round(raw['실생활_유용도']))) : 5,
  };
  if (raw['출처']) normalized['출처'] = raw['출처'];
  return normalized;
}

/**
 * 여러 검색 결과를 한 번에 Gemini로 보내 혜택 배열을 반환합니다.
 * 429 에러 발생 시 최대 2회 재시도하며, 최종 실패 시 검색 결과 스니펫으로 기본 데이터를 생성합니다.
 */
export async function parseBenefitDataBatch(items) {
  if (!items || items.length === 0) return [];

  const numbered = items.map((it, i) =>
    `[${i + 1}]\n제목: ${it.title ?? '(제목 없음)'}\n내용: ${it.snippet ?? '(내용 없음)'}${it.link ? `\n출처: ${it.link}` : ''}`
  ).join('\n\n');

  const prompt = `당신은 대한민국 생활 혜택 데이터 추출 전문 AI입니다. 아래 [검색 결과] 각 항목에서 혜택 정보를 추출해 JSON 배열로만 출력하세요. 모든 필드(카테고리, 혜택명, 지원대상, 지원내용, 신청방법, 마감일, 실생활_유용도, 출처)를 포함하세요.\n\n[검색 결과]\n${numbered}`;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\s*|```/g, '').trim();
      
      let parsed = null;
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) parsed = JSON.parse(arrMatch[0]);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((raw, i) => normalize(raw, i)).filter(Boolean);
      }
    } catch (error) {
      lastError = error;
      const isQuotaError = error?.message?.includes('429') || error?.message?.toLowerCase().includes('quota');
      
      if (isQuotaError) {
        // 할당량 초과는 재시도해도 안 될 가능성이 높으므로(Daily Limit), 즉시 루프 탈출 후 폴백 실행
        console.warn(`[gemini-parser] ⚠️ API 할당량 초과 — 즉시 폴백 모드로 전환합니다.`);
        break;
      }
      
      const wait = attempt * 5000; 
      await sleep(wait);
    }
  }

  // 최종 실패 또는 할당량 초과 시 폴백
  // console.error(lastError) 를 제거하여 장황한 에러 로그가 사용자에게 노출되지 않게 함
  return items.map(it => ({
    카테고리: "기타",
    혜택명: it.title?.replace(/<[^>]*>/g, '').slice(0, 50) || "신규 혜택",
    지원대상: "상세 내용 확인 필요",
    지원내용: it.snippet?.replace(/<[^>]*>/g, '').slice(0, 150) || "정보를 분석할 수 없습니다.",
    신청방법: "출처 링크 참조",
    마감일: null,
    실생활_유용도: 5,
    출처: it.link
  }));
}

export async function parseBenefitData(rawContent) {
  if (!rawContent || rawContent.trim().length === 0) return null;
  const results = await parseBenefitDataBatch([{ title: '', snippet: rawContent }]);
  return results[0] ?? null;
}
