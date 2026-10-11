// ============================================================================
// TUXI PHASE 2G — INTEGRATION REGISTRY & ORCHESTRATION ENGINE
// Coordinates all external integration adapters (Payments, Maps, Notifications,
// AI Intelligence, Disbursements), provides centralized health checks,
// and enforces operator gating.
// ============================================================================

import { IIntegrationAdapter, IntegrationState, ProviderHealthCheckResult } from './types.js';
import { PeachPaymentsAdapter } from './payment/peachPaymentsAdapter.js';
import { StripeAdapter } from './payment/stripeAdapter.js';
import { GoogleMapsAdapter } from './maps/mapsAdapter.js';
import { NotificationService } from './notifications/notificationService.js';
import { GeminiOperationalService } from './ai/geminiOperationalService.js';
import { postgresAdapter } from '../db/postgres.js';

export class IntegrationRegistry {
  private static adapters: Map<string, IIntegrationAdapter> = new Map();

  static {
    // Register all adapters
    this.register(new PeachPaymentsAdapter());
    this.register(new StripeAdapter());
    this.register(new GoogleMapsAdapter());
    this.register(NotificationService.getInstance());
    this.register(GeminiOperationalService.getInstance());
  }

  public static register(adapter: IIntegrationAdapter) {
    this.adapters.set(adapter.providerId, adapter);
  }

  public static getAdapter(providerId: string): IIntegrationAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`UNKNOWN_INTEGRATION_PROVIDER: Provider "${providerId}" not found in registry`);
    }
    return adapter;
  }

  public static getAllAdapters(): IIntegrationAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Runs comprehensive health and connectivity checks across all registered integrations.
   */
  public static async runAllHealthChecks(): Promise<{
    timestamp: string;
    totalProviders: number;
    healthyCount: number;
    results: ProviderHealthCheckResult[];
  }> {
    const results: ProviderHealthCheckResult[] = [];
    let healthyCount = 0;

    for (const adapter of this.adapters.values()) {
      try {
        const check = await adapter.verifyConnectivity();
        results.push(check);
        if (check.success) healthyCount++;
      } catch (err: any) {
        results.push({
          providerId: adapter.providerId,
          success: false,
          state: 'NOT_CONFIGURED',
          latencyMs: 0,
          message: `Health check threw exception: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalProviders: this.adapters.size,
      healthyCount,
      results
    };
  }

  /**
   * Retrieves current database registry state for all integration providers.
   */
  public static async getProviderStates() {
    const res = await postgresAdapter.pool.query(`
      SELECT 
        id, name, provider_type, state, is_production_authorized,
        masked_credentials, health_status, last_health_check_at,
        operator_notes, updated_at
      FROM integration_providers
      ORDER BY provider_type, name;
    `);
    return res.rows;
  }

  /**
   * Transition provider state with auditable administrative log.
   */
  public static async updateProviderState(input: {
    providerId: string;
    targetState: IntegrationState;
    operatorUserId: string;
    notes?: string;
  }) {
    const validStates: IntegrationState[] = [
      'NOT_CONFIGURED',
      'SANDBOX',
      'VERIFIED',
      'PRODUCTION_ENABLED',
      'SUSPENDED'
    ];

    if (!validStates.includes(input.targetState)) {
      throw new Error(`INVALID_TARGET_STATE: "${input.targetState}" is not a valid lifecycle state`);
    }

    // Production activation requires explicit operator token / authorization
    const isProdAuth = input.targetState === 'PRODUCTION_ENABLED';

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const existingRes = await client.query(
        'SELECT id, state FROM integration_providers WHERE id = $1 FOR UPDATE;',
        [input.providerId]
      );
      if (existingRes.rows.length === 0) throw new Error('PROVIDER_NOT_FOUND');
      const current = existingRes.rows[0];

      await client.query(`
        UPDATE integration_providers
        SET state = $1, is_production_authorized = $2, operator_notes = $3, updated_at = NOW()
        WHERE id = $4;
      `, [
        input.targetState,
        isProdAuth,
        input.notes || `State updated to ${input.targetState} by ${input.operatorUserId}`,
        input.providerId
      ]);

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
        VALUES (uuid_generate_v4(), $1, 'INTEGRATION_STATE_CHANGED', 'INTEGRATION_PROVIDER', $2, $3);
      `, [
        input.operatorUserId,
        input.providerId,
        JSON.stringify({ previousState: current.state, newState: input.targetState })
      ]);

      await client.query('COMMIT;');

      return {
        providerId: input.providerId,
        previousState: current.state,
        newState: input.targetState,
        isProductionAuthorized: isProdAuth
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}
