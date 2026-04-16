
import { exploreBenefits } from './services/benefit-explorer.js';
import 'dotenv/config';

async function runTest() {
  console.log('🚀 [테스트] 실시간 수집 로직 검증 시작...');
  console.log('검색 쿼리: "2026년 서울 지원금 혜택 site:blog.naver.com"');
  
  const startTime = Date.now();
  try {
    const benefits = await exploreBenefits('2026년 서울 지원금 혜택 site:blog.naver.com');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n📊 [수집 결과 요약]');
    console.log(`- 총 수집된 혜택 수: ${benefits.length}건`);
    console.log(`- 소요 시간: ${elapsed}초`);
    
    if (benefits.length > 0) {
      console.log('\n📋 [수집된 데이터 샘플 (상위 3건)]');
      benefits.slice(0, 3).forEach((b, i) => {
        console.log(`[${i + 1}] ${b.혜택명}`);
        console.log(`   - 지원내용: ${b.지원내용?.slice(0, 50)}...`);
        console.log(`   - 카테고리: ${b.카테고리}`);
      });
    }
  } catch (e) {
    console.error('❌ 테스트 중 오류 발생:', e.message);
    if (e.message.includes('API_KEY')) {
      console.log('💡 힌트: 환경변수에 SERPER_API_KEY와 GEMINI_API_KEY가 설정되어 있어야 합니다.');
    }
  }
}

runTest();
