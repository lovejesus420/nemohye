import { scrapeTravelmonthBenefits } from './services/travelmonth-benefit-scraper.js';
import { exploreBenefits } from './services/benefit-explorer.js';
import { saveBenefits } from './lib/db.js';

async function runTrial() {
  console.log('🚀 할인 행사 시범 수집 시작...');
  
  const allResults = [];

  // 1. 여행가는 달 스크래핑
  try {
    console.log('\n[1/2] 여행가는 달 혜택 스크래핑 중...');
    const travelBenefits = await scrapeTravelmonthBenefits();
    console.log(`✅ ${travelBenefits.length}건 발견`);
    allResults.push(...travelBenefits.map(b => ({ ...b, source: '여행가는달 스크래퍼' })));
    
    if (travelBenefits.length > 0) {
      await saveBenefits(travelBenefits, { targetRegion: '전국', targetGroup: '할인행사', sourceQuery: '스크래핑:여행가는달' });
    }
  } catch (e) {
    console.error('❌ 스크래핑 실패:', e.message);
  }

  // 2. 대형마트/편의점 검색 기반 수집
  const queries = [
    '이마트 롯데마트 홈플러스 이번주 전단지 할인 행사',
    'CU GS25 세븐일레븐 이달의 1+1 행사'
  ];

  console.log('\n[2/2] 대형마트 및 편의점 실시간 수집 중...');
  for (const query of queries) {
    try {
      console.log(`🔍 검색어: ${query}`);
      const searchBenefits = await exploreBenefits(query);
      console.log(`✅ ${searchBenefits.length}건 발견`);
      allResults.push(...searchBenefits.map(b => ({ ...b, source: `검색: ${query}` })));
      
      if (searchBenefits.length > 0) {
        await saveBenefits(searchBenefits, { targetRegion: '전국', targetGroup: '할인행사', sourceQuery: query });
      }
    } catch (e) {
      console.error(`❌ 검색 실패 (${query}):`, e.message);
    }
  }

  console.log('\n==================================================');
  console.log(`✨ 수집 완료! 총 ${allResults.length}개의 데이터가 DB에 저장되었습니다.`);
  console.log('실제 앱의 "전국 할인행사" 탭에서 지금 바로 확인하실 수 있습니다.');
  console.log('==================================================\n');
  
  // 샘플 출력
  allResults.slice(0, 5).forEach((item, idx) => {
    console.log(`${idx + 1}. [${item.카테고리 || '할인'}] ${item.혜택명 || item.title}`);
    console.log(`   - 업체: ${item.지원대상 || item.store}`);
    console.log(`   - 내용: ${String(item.지원내용 || item.discount).slice(0, 50)}...`);
    console.log('---');
  });
}

runTrial().catch(console.error);
