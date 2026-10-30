import pg from 'pg';

const { Pool } = pg;

export async function testMigrationRollback() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER,
    password: process.env.SQL_ADMIN_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();

  try {
    // 1. Begin transaction and create a canary table, then trigger intentional syntax failure
    await client.query('BEGIN;');
    await client.query('CREATE TABLE canary_rollback_test (id INT PRIMARY KEY);');
    // Intentional failure: invalid SQL
    await client.query('CREATE TABLE invalid_table_syntax (id INT PRIMARY KEY, broken SYNTAX ERROR);');
    await client.query('COMMIT;');
  } catch (err: any) {
    // Transaction rolled back
    await client.query('ROLLBACK;');

    // 2. Verify canary_rollback_test does NOT exist
    const check = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'canary_rollback_test';
    `);

    const wasRolledBack = check.rows.length === 0;
    return {
      forcedFailureCaptured: true,
      errorMessage: err.message,
      canaryTableCleanedUp: wasRolledBack,
      rollbackSuccessful: wasRolledBack
    };
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('testRollback.ts')) {
  testMigrationRollback().then(res => {
    console.log('[Rollback Verification Result]:', JSON.stringify(res, null, 2));
  }).catch(console.error);
}
