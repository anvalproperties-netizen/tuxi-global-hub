import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

export async function runPostgreSqlMigrations() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER,
    password: process.env.SQL_ADMIN_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();
  console.log('[Migration] Connected to PostgreSQL successfully.');

  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const alreadyApplied = await client.query('SELECT version FROM schema_migrations WHERE version = $1;', [file]);
      if (alreadyApplied.rows.length > 0) {
        console.log(`[Migration] ${file} already applied, skipping.`);
        continue;
      }

      console.log(`[Migration] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Execute statements
      await client.query(sql);

      await client.query('INSERT INTO schema_migrations (version) VALUES ($1);', [file]);
      console.log(`[Migration] Applied ${file} successfully.`);
    }

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = res.rows.map(r => r.table_name);
    console.log(`[Migration] Verified ${tables.length} tables in PostgreSQL.`);

    return { success: true, tableCount: tables.length, tables };
  } catch (err: any) {
    console.error('[Migration Error]', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('runMigrations.ts') || process.argv[1]?.endsWith('runMigrations.js')) {
  runPostgreSqlMigrations().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
