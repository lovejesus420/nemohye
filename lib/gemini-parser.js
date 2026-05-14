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
 * @property {string|null} 신청URL - 실제 신청/예약/상세 페이지로 바로 연결되는 URL
 * @property {string|null} 마감일
 * @property {number} 실생활_유용도  - 1~10점
 */

const fallback = (v, def = '정보 없음') =>
  (v === null || v === undefined || v === '') ? def : v;

function normalize(raw, originalLink) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw['혜택명'] || raw['title'] || raw['제목'] || (raw['카테고리'] ? `${raw['카테고리']} 관련 혜택` : null);
  if (!name) return null;

  // 신청 URL이 없으면 출처 링크를 기본값으로 사용
  let applyUrl = raw['신청URL'] || raw['applyUrl'] || raw['url'] || null;
  if (!applyUrl && originalLink) {
    applyUrl = originalLink;
  }

  const normalized = {
    카테고리:      fallback(raw['카테고리'], '기타'),
    혜택명:        name,
    지원대상:      fallback(raw['지원대상']),
    지원내용:      fallback(raw['지원내용']),
    신청방법:      fallback(raw['신청방법']),
    신청URL:       applyUrl,
    마감일:        raw['마감일'] ?? null,
    실생활_유용도: typeof raw['실생활_유용도'] === 'number' ? Math.min(10, Math.max(1, Math.round(raw['실생활_유용도']))) : 5,
  };
  if (raw['출처'] || originalLink) normalized['출처'] = raw['출처'] || originalLink;
  return normalized;
}

export async function parseBenefitDataBatch(items) {
  if (!items || items.length === 0) return [];

  const numbered = items.map((it, i) =>
    `[${i + 1}]\n제목: ${it.title ?? '(제목 없음)'}\n내용: ${it.snippet ?? '(내용 없음)'}${it.link ? `\n출처: ${it.link}` : ''}`
  ).join('\n\n');

  const prompt = `당신은 대한민국 생활 혜택 데이터 추출 전문 AI입니다. 
아래 [검색 결과]에서 혜택 정보를 추출해 JSON 배열로 반환하세요.

**중요 지침:**
1. **"신청URL" 필드:** 검색 결과 본문이나 출처 링크를 분석하여, 사용자가 **직접 신청, 예약, 또는 상세 정보를 확인할 수 있는 가장 정확한 URL**을 추출하세요. 
2. **"신청방법" 필드:** 온라인 신청, 방문 신청 등 구체적인 절차를 요약하세요. 
3. 출력은 반드시 순수 JSON 배열만 하세요.

필드 리스트:
- 카테고리: (복지 | 지원금 | 교육 | 문화 | 이벤트 | 마트·식품 | 패션·뷰티 | 전자·가전 | 여행·레저 | 온라인쇼핑 | 기타)
- 혜택명
- 지원대상
- 지원내용
- 신청방법
- 신청URL: (실제 신청 페이지로 바로 이동 가능한 링크)
- 마감일: (YYYY-MM-DD 형식 또는 null)
- 실생활_유용도: (1~10 점수)
- 출처: (정보의 근거가 되는 링크)

[검색 결과]
${numbered}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\s*|```/g, '').trim();
      
      let parsed = null;
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) parsed = JSON.parse(arrMatch[0]);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((raw, i) => {
          const originalItem = items[i] || {};
          return normalize(raw, originalItem.link);
        }).filter(Boolean);
      }
    } catch (error) {
      if (error?.message?.includes('429')) break;
      await sleep(attempt * 5000);
    }
  }

  // 폴백
  return items.map(it => ({
    카테고리: "기타",
    혜택명: it.title?.replace(/<[^>]*>/g, '').slice(0, 50) || "신규 혜택",
    지원대상: "상세 내용 확인 필요",
    지원내용: it.snippet?.replace(/<[^>]*>/g, '').slice(0, 150) || "정보를 분석할 수 없습니다.",
    신청방법: "출처 링크 참조",
    신청URL: it.link,
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
