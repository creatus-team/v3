// check-supabase.js
const https = require('https');

const SUPABASE_URL = 'https://gbbutzzuvlgdlixovteb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7wiuhxbJRjeo7-JC3eh3Pg_xjGHmqID';

// 테이블 존재 여부 확인
const tables = [
  'users',
  'coaches', 
  'coach_slots',
  'sessions',
  'postponements',
  'raw_webhooks',
  'ingestion_inbox',
  'sms_templates',
  'sms_logs',
  'system_logs',
  'settlement_locks',
  'user_activity_logs',
  'change_logs',
  'reminder_logs',
];

async function checkTable(table) {
  return new Promise((resolve) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?limit=1`;
    
    https.get(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    }, (res) => {
      resolve({ table, status: res.statusCode });
    }).on('error', (err) => {
      resolve({ table, status: 'ERROR', error: err.message });
    });
  });
}

async function main() {
  console.log('Supabase 연결 테스트...\n');
  console.log('URL:', SUPABASE_URL);
  console.log('');
  
  const results = await Promise.all(tables.map(checkTable));
  
  console.log('테이블 상태:');
  console.log('─'.repeat(40));
  
  let existCount = 0;
  let missingCount = 0;
  
  for (const r of results) {
    if (r.status === 200) {
      console.log(`✅ ${r.table}`);
      existCount++;
    } else if (r.status === 404) {
      console.log(`❌ ${r.table} (없음)`);
      missingCount++;
    } else {
      console.log(`⚠️  ${r.table} (상태: ${r.status})`);
      missingCount++;
    }
  }
  
  console.log('─'.repeat(40));
  console.log(`존재: ${existCount}개 / 없음: ${missingCount}개`);
}

main();
