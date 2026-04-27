import { chromium } from 'playwright';
import { saveBenefits } from '../lib/db.js';

// Gemini Vision을 사용하여 이미지 분석 (이미지 URL 또는 Base64 전달)
async function analyzeFlyerWithGemini(screenshotBase64) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  const prompt = `이 이미지는 대형마트의 이번 주 전단지입니다. 
  이미지에 포함된 주요 할인 상품들을 추출하여 JSON 배열로 응답하세요.
  
  응답 형식:
  [
    {
      "title": "상품명 (예: 신선특란 30입)",
      "store": "마트명 (이마트/홈플러스)",
      "category": "마트·식품",
      "discount": "혜택 내용 (예: 2,000원 할인, 1+1, 농할할인 20%)",
      "price": "할인 후 가격 (숫자만)",
      "period": "전단지 유효 기간",
      "description": "간략한 상품 설명",
      "icon": "🍎"
    }
  ]
  
  반드시 순수 JSON 배열만 반환하세요.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/png', data: screenshotBase64 } }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleanJson = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanJson);
}

export async function scrapeMartFlyers() {
  console.log('🚀 마트 전단지 크롤링 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await context.newPage();
  
  const allResults = [];

  try {
    // 1. 홈플러스 전단지 뷰어
    console.log('🔍 홈플러스 전단지 접속 중...');
    await page.goto('https://front.homeplus.co.kr/exhibition/flyer', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // 렌더링 대기
    
    // 전단지 영역 캡처
    const flyerBuffer = await page.screenshot({ fullPage: false });
    const flyerBase64 = flyerBuffer.toString('base64');
    
    console.log('🤖 Gemini Vision 분석 중 (홈플러스)...');
    const homeplusItems = await analyzeFlyerWithGemini(flyerBase64);
    allResults.push(...homeplusItems.map(item => ({ ...item, store: '홈플러스' })));

    // 2. 이마트 전단지 (예시 URL)
    console.log('🔍 이마트 전단지 접속 중...');
    await page.goto('https://store.emart.com/main/flyer.do', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const emartBuffer = await page.screenshot({ fullPage: false });
    const emartBase64 = emartBuffer.toString('base64');

    console.log('🤖 Gemini Vision 분석 중 (이마트)...');
    const emartItems = await analyzeFlyerWithGemini(emartBase64);
    allResults.push(...emartItems.map(item => ({ ...item, store: '이마트' })));

  } catch (error) {
    console.error('❌ 크롤링 중 에러:', error);
  } finally {
    await browser.close();
  }

  if (allResults.length > 0) {
    console.log(`✅ 총 ${allResults.length}건 수집 완료. DB 저장 중...`);
    await saveBenefits(allResults, { targetRegion: '전국', targetGroup: '할인행사', sourceQuery: 'Playwright 전단지 스크래핑' });
  }
  
  return allResults;
}
