import { Pool } from '@neondatabase/serverless';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

async function checkDb() {
  if (!POSTGRES_URL) {
    console.error('❌ POSTGRES_URL이 설정되지 않았습니다.');
    return;
  }

  const pool = new Pool({ connectionString: POSTGRES_URL });
  const client = await pool.connect();

  try {
    console.log('🔍 DB 내 최근 수집된 할인 행사 조회 중...');
    
    // 최근 24시간 이내의 '할인행사' 그룹 데이터 조회
    const { rows } = await client.query(
      `SELECT id, target_region, target_group, collected_at, expires_at, (benefit_data->>'혜택명') as title
       FROM scraped_benefits 
       WHERE target_group = '할인행사'
       ORDER BY collected_at DESC 
       LIMIT 10`
    );

    if (rows.length === 0) {
      console.log('⚠️ DB에 "할인행사" 그룹으로 저장된 데이터가 없습니다.');
      
      // 전체 카운트 확인
      const countRes = await client.query('SELECT count(*) FROM scraped_benefits');
      console.log(`📊 현재 DB 총 데이터 수: ${countRes.rows[0].count}건`);
      
      // 어떤 그룹들이 있는지 확인
      const groupsRes = await client.query('SELECT DISTINCT target_group FROM scraped_benefits');
      console.log(`🏷️ 현재 존재하는 그룹: ${groupsRes.rows.map(r => r.target_group).join(', ')}`);
    } else {
      console.log(`✅ 최근 수집된 할인 행사 ${rows.length}건 발견:`);
      rows.forEach(r => {
        console.log(`- [${r.id}] ${r.title} (수집: ${r.collected_at.toLocaleString()})`);
      });
    }

  } catch (e) {
    console.error('❌ DB 조회 에러:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDb();
