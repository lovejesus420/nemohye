
import { exploreBenefits } from './services/benefit-explorer.js';
import 'dotenv/config';

async function testInstagram() {
  console.log('📸 [테스트] 인스타그램 기반 혜택 수집 시작...');
  // 실제 크론에서 사용하는 인스타그램 쿼리 패턴
  const query = 'site:instagram.com "gg24_kr" 2026 혜택';
  
  const startTime = Date.now();
  try {
    const benefits = await exploreBenefits(query);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n📊 [인스타그램 수집 결과]');
    const instaBenefits = benefits.filter(b => b.출처?.includes('instagram.com'));
    
    console.log(`- 전체 수집 건수: ${benefits.length}건`);
    console.log(`- 인스타그램 출처 건수: ${instaBenefits.length}건`);
    console.log(`- 소요 시간: ${elapsed}초`);
    
    if (instaBenefits.length > 0) {
      console.log('\n📋 [인스타그램 수집 샘플]');
      instaBenefits.slice(0, 3).forEach((b, i) => {
        console.log(`[${i + 1}] ${b.혜택명}`);
        console.log(`   - 지원내용: ${b.지원내용?.slice(0, 50)}...`);
        console.log(`   - 링크: ${b.출처}`);
      });
    } else {
      console.log('\n⚠️ 현재 인스타그램에서 직접 추출된 혜택이 없습니다.');
      console.log('   (Serper 검색 결과에 해당 계정의 최근 게시물이 노출되지 않았거나, Gemini가 혜택 정보를 찾지 못했을 수 있습니다.)');
    }
  } catch (e) {
    console.error('❌ 테스트 오류:', e.message);
  }
}

testInstagram();
