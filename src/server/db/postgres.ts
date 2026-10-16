import pg from 'pg';

const { Pool } = pg;

export class PostgresAdapter {
  private static instance: PostgresAdapter;
  public pool: pg.Pool;

  private constructor() {
    this.pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err);
    });
  }

  public static getInstance(): PostgresAdapter {
    if (!PostgresAdapter.instance) {
      PostgresAdapter.instance = new PostgresAdapter();
    }
    return PostgresAdapter.instance;
  }

  /**
   * Authoritative PostGIS 20 km territory calculation directly in the database engine.
   * Strictly enforces geography ST_DWithin with a 20,000-metre radius limit.
   */
  public async validateTerritoryPostGIS(
    hubLat: number,
    hubLng: number,
    targetLat: number,
    targetLng: number,
    maxRadiusMeters: number = 20000.0
  ): Promise<{ isWithin: boolean; exactDistanceKm: number }> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          ST_DWithin(
            ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
            ST_SetSRID(ST_Point($4::float8, $3::float8), 4326)::geography,
            $5::float8
          ) AS is_within,
          (ST_Distance(
            ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
            ST_SetSRID(ST_Point($4::float8, $3::float8), 4326)::geography
          ) / 1000.0) AS exact_distance_km;
      `, [hubLat, hubLng, targetLat, targetLng, maxRadiusMeters]);

      if (!res.rows || res.rows.length === 0) {
        throw new Error('POSTGIS_CALCULATION_FAILED: Empty spatial response from engine');
      }

      return {
        isWithin: Boolean(res.rows[0].is_within),
        exactDistanceKm: parseFloat(res.rows[0].exact_distance_km),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Helper to run queries inside a transactional block with automatic rollback on error
   */
  public async withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      const result = await callback(client);
      await client.query('COMMIT;');
      return result;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Health and version check for live PostgreSQL & PostGIS
   */
  public async checkHealth(): Promise<{
    connected: boolean;
    postgresVersion: string;
    postgisVersion: string;
    tableCount: number;
    error?: string;
  }> {
    try {
      const client = await this.pool.connect();
      try {
        const vRes = await client.query('SELECT version();');
        const pgisRes = await client.query('SELECT postgis_full_version();');
        const tblRes = await client.query(`
          SELECT count(*)::int as count 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);

        return {
          connected: true,
          postgresVersion: vRes.rows[0]?.version || 'PostgreSQL',
          postgisVersion: pgisRes.rows[0]?.postgis_full_version || 'PostGIS',
          tableCount: tblRes.rows[0]?.count || 0,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      return {
        connected: false,
        postgresVersion: 'UNAVAILABLE',
        postgisVersion: 'UNAVAILABLE',
        tableCount: 0,
        error: err.message,
      };
    }
  }
}

export const postgresAdapter = PostgresAdapter.getInstance();
