import { postgresAdapter } from '../db/postgres.js';
import { dbInstance } from '../db/database.js';

export class CommissionService {
  /**
   * Evaluates and records commission for a qualifying completed order in PostgreSQL.
   * Fully idempotent using orderId-based unique key.
   */
  public static async processOrderCommissionPostgres(orderId: string, idempotencyKey: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Idempotency Check
      const existing = await client.query(`
        SELECT id, status, commission_cents FROM commission_ledger WHERE idempotency_key = $1;
      `, [idempotencyKey]);

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK;');
        return {
          ledgerId: existing.rows[0].id,
          status: existing.rows[0].status,
          commissionCents: existing.rows[0].commission_cents,
          isIdempotentReplay: true
        };
      }

      // 2. Fetch authoritative order details
      const orderRes = await client.query(`
        SELECT id, business_id, subtotal_cents, status, currency
        FROM orders WHERE id = $1;
      `, [orderId]);

      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('ORDER_NOT_FOUND');
      }

      const order = orderRes.rows[0];

      // Non-qualifying transactions (unpaid, cancelled, etc.) do NOT generate earned commission
      if (order.status !== 'DELIVERED' && order.status !== 'CONFIRMED') {
        await client.query('ROLLBACK;');
        return {
          status: 'NON_QUALIFYING_STATUS',
          commissionCents: 0
        };
      }

      // 3. Find originating Rep attribution
      const attrRes = await client.query(`
        SELECT rep_profile_id, attribution_status
        FROM rep_business_attributions
        WHERE business_id = $1 AND attribution_status = 'ACTIVE';
      `, [order.business_id]);

      if (attrRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        return {
          status: 'NO_ATTRIBUTED_REP',
          commissionCents: 0
        };
      }

      const attribution = attrRes.rows[0];

      // 4. Retrieve authoritative active commission rule (up to 3%)
      const ruleRes = await client.query(`
        SELECT id, percentage_rate
        FROM commission_rules
        WHERE target_role = 'TUXI_REP' AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1;
      `);

      if (ruleRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('NO_ACTIVE_COMMISSION_RULE');
      }

      const rule = ruleRes.rows[0];
      const rate = parseFloat(rule.percentage_rate);
      const qualifyingSubtotalCents = order.subtotal_cents;
      const commissionCents = Math.round(qualifyingSubtotalCents * rate);

      const insRes = await client.query(`
        INSERT INTO commission_ledger (
          id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
          applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'EARNED', $8, $9
        )
        RETURNING id;
      `, [
        attribution.rep_profile_id,
        order.business_id,
        order.id,
        qualifyingSubtotalCents,
        rule.id,
        rate,
        commissionCents,
        idempotencyKey,
        `Commission calculated from qualifying order #${order.id} at ${(rate * 100).toFixed(2)}%`
      ]);

      const ledgerId = insRes.rows[0].id;

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
        VALUES (uuid_generate_v4(), NULL, 'ACCRUE_REP_COMMISSION', 'COMMISSION_LEDGER', $1, $2);
      `, [
        ledgerId,
        JSON.stringify({ orderId, repProfileId: attribution.rep_profile_id, commissionCents })
      ]);

      await client.query('COMMIT;');

      return {
        ledgerId,
        repProfileId: attribution.rep_profile_id,
        commissionCents,
        percentageRate: rate,
        status: 'EARNED'
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Evaluates and records commission for a qualifying completed order.
   * Fully idempotent using orderId-based unique key.
   */
  public static processOrderCommission(orderId: string, idempotencyKey: string) {
    // 1. Idempotency Check
    const existing = dbInstance.db.prepare(`
      SELECT id, status, commission_cents FROM commission_ledger WHERE idempotency_key = ?
    `).get(idempotencyKey) as any;

    if (existing) {
      return {
        ledgerId: existing.id,
        status: existing.status,
        commissionCents: existing.commission_cents,
        isIdempotentReplay: true
      };
    }

    // 2. Fetch authoritative order details
    const order = dbInstance.db.prepare(`
      SELECT id, business_id, subtotal_cents, status, currency
      FROM orders WHERE id = ?
    `).get(orderId) as any;

    if (!order) {
      throw new Error('ORDER_NOT_FOUND');
    }

    // Non-qualifying transactions (unpaid, cancelled, etc.) do NOT generate earned commission
    if (order.status !== 'DELIVERED' && order.status !== 'CONFIRMED') {
      return {
        status: 'NON_QUALIFYING_STATUS',
        commissionCents: 0
      };
    }

    // 3. Find originating Rep attribution
    const attribution = dbInstance.db.prepare(`
      SELECT rep_profile_id, attribution_status
      FROM rep_business_attributions
      WHERE business_id = ? AND attribution_status = 'ACTIVE'
    `).get(order.business_id) as any;

    if (!attribution) {
      // No active Rep attributed to this merchant
      return {
        status: 'NO_ATTRIBUTED_REP',
        commissionCents: 0
      };
    }

    // 4. Retrieve authoritative active commission rule (up to 3%)
    const rule = dbInstance.db.prepare(`
      SELECT id, percentage_rate
      FROM commission_rules
      WHERE target_role = 'TUXI_REP' AND is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;

    if (!rule) {
      throw new Error('NO_ACTIVE_COMMISSION_RULE');
    }

    // Calculate commission amount in integer cents safely (e.g. 2.5% on 20,000 cents subtotal = 500 cents)
    const qualifyingSubtotalCents = order.subtotal_cents;
    const commissionCents = Math.round(qualifyingSubtotalCents * rule.percentage_rate);

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      const ledgerId = dbInstance.generateUuid();

      dbInstance.db.prepare(`
        INSERT INTO commission_ledger (
          id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
          applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EARNED', ?, ?)
      `).run(
        ledgerId,
        attribution.rep_profile_id,
        order.business_id,
        order.id,
        qualifyingSubtotalCents,
        rule.id,
        rule.percentage_rate,
        commissionCents,
        idempotencyKey,
        `Commission calculated from qualifying order #${order.id} at ${(rule.percentage_rate * 100).toFixed(2)}%`
      );

      // Audit log
      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, NULL, 'ACCRUE_REP_COMMISSION', 'COMMISSION_LEDGER', ?, NULL, ?)
      `).run(
        dbInstance.generateUuid(),
        ledgerId,
        JSON.stringify({ orderId, repProfileId: attribution.rep_profile_id, commissionCents })
      );

      dbInstance.db.exec('COMMIT;');

      return {
        ledgerId,
        repProfileId: attribution.rep_profile_id,
        commissionCents,
        percentageRate: rule.percentage_rate,
        status: 'EARNED'
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Reverses commission for a refunded or cancelled order using compensating ledger entries.
   * Historical rows are NEVER deleted.
   */
  public static async reverseOrderCommission(
    orderId: string,
    reason: string,
    reversalIdempotencyKey: string,
    refundAmountCents?: number
  ) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // Check idempotency replay
        const existingReversal = await client.query(`
          SELECT id, status, commission_cents FROM commission_ledger WHERE idempotency_key = $1;
        `, [reversalIdempotencyKey]);

        if (existingReversal.rows.length > 0) {
          await client.query('ROLLBACK;');
          return {
            ledgerId: existingReversal.rows[0].id,
            status: existingReversal.rows[0].status,
            isIdempotentReplay: true,
            reversedCents: Math.abs(existingReversal.rows[0].commission_cents)
          };
        }

        // Find original earned ledger entry
        const origRes = await client.query(`
          SELECT * FROM commission_ledger WHERE order_id = $1 AND status = 'EARNED';
        `, [orderId]);

        if (origRes.rows.length === 0) {
          await client.query('ROLLBACK;');
          return { status: 'NO_ORIGINAL_COMMISSION_TO_REVERSE' };
        }

        const original = origRes.rows[0];
        let reversalCommissionCents = original.commission_cents;
        if (refundAmountCents !== undefined && refundAmountCents > 0 && refundAmountCents < original.qualifying_amount_cents) {
          reversalCommissionCents = Math.round(refundAmountCents * parseFloat(original.applied_percentage));
        }
        const compensatingCommissionCents = -Math.abs(reversalCommissionCents);
        const reversalLedgerId = (await client.query('SELECT uuid_generate_v4() as id;')).rows[0].id;

        // Insert compensating negative entry
        await client.query(`
          INSERT INTO commission_ledger (
            id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
            applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'REVERSED', $9, $10);
        `, [
          reversalLedgerId,
          original.rep_profile_id,
          original.business_id,
          original.order_id,
          refundAmountCents || original.qualifying_amount_cents,
          original.applied_rule_id,
          original.applied_percentage,
          compensatingCommissionCents,
          reversalIdempotencyKey,
          `Compensating reversal for order #${orderId}. Reason: ${reason} (Refund: ${refundAmountCents ? refundAmountCents + ' cents' : 'Full'})`
        ]);

        const updatedStatus = (refundAmountCents && refundAmountCents < original.qualifying_amount_cents) 
          ? 'PARTIALLY_REVERSED' 
          : 'REVERSED';

        await client.query('UPDATE commission_ledger SET status = $1, updated_at = NOW() WHERE id = $2;', [updatedStatus, original.id]);

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
          VALUES (uuid_generate_v4(), NULL, 'REVERSE_REP_COMMISSION', 'COMMISSION_LEDGER', $1, $2, $3);
        `, [
          reversalLedgerId,
          JSON.stringify({ originalLedgerId: original.id, originalCents: original.commission_cents }),
          JSON.stringify({ compensatingCommissionCents, reason, refundAmountCents })
        ]);

        await client.query('COMMIT;');
        return {
          reversalLedgerId,
          reversedCents: Math.abs(compensatingCommissionCents),
          status: updatedStatus
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    const existingReversal = dbInstance.db.prepare(`
      SELECT id, status, commission_cents FROM commission_ledger WHERE idempotency_key = ?
    `).get(reversalIdempotencyKey) as any;

    if (existingReversal) {
      return { ledgerId: existingReversal.id, status: existingReversal.status, isIdempotentReplay: true, reversedCents: Math.abs(existingReversal.commission_cents) };
    }

    // Find original earned ledger entry
    const original = dbInstance.db.prepare(`
      SELECT * FROM commission_ledger
      WHERE order_id = ? AND status = 'EARNED'
    `).get(orderId) as any;

    if (!original) {
      return { status: 'NO_ORIGINAL_COMMISSION_TO_REVERSE' };
    }

    // Calculate reversal: partial refund vs full refund
    let reversalCommissionCents = original.commission_cents;
    if (refundAmountCents !== undefined && refundAmountCents > 0 && refundAmountCents < original.qualifying_amount_cents) {
      reversalCommissionCents = Math.round(refundAmountCents * original.applied_percentage);
    }
    const compensatingCommissionCents = -Math.abs(reversalCommissionCents);

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      const reversalLedgerId = dbInstance.generateUuid();

      // Insert compensating negative entry
      dbInstance.db.prepare(`
        INSERT INTO commission_ledger (
          id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
          applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REVERSED', ?, ?)
      `).run(
        reversalLedgerId,
        original.rep_profile_id,
        original.business_id,
        original.order_id,
        refundAmountCents || original.qualifying_amount_cents,
        original.applied_rule_id,
        original.applied_percentage,
        compensatingCommissionCents,
        reversalIdempotencyKey,
        `Compensating reversal for order #${orderId}. Reason: ${reason} (Refund: ${refundAmountCents ? refundAmountCents + ' cents' : 'Full'})`
      );

      // If full refund, update original status to REVERSED; if partial, mark PARTIALLY_REVERSED
      const updatedStatus = (refundAmountCents && refundAmountCents < original.qualifying_amount_cents) 
        ? 'PARTIALLY_REVERSED' 
        : 'REVERSED';

      dbInstance.db.prepare(`
        UPDATE commission_ledger SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(updatedStatus, original.id);

      // Audit log
      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, NULL, 'REVERSE_REP_COMMISSION', 'COMMISSION_LEDGER', ?, ?, ?)
      `).run(
        dbInstance.generateUuid(),
        reversalLedgerId,
        JSON.stringify({ originalLedgerId: original.id, originalCents: original.commission_cents }),
        JSON.stringify({ compensatingCommissionCents, reason, refundAmountCents })
      );

      dbInstance.db.exec('COMMIT;');

      return {
        reversalLedgerId,
        reversedCents: Math.abs(compensatingCommissionCents),
        status: updatedStatus
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Sets a new authoritative commission rate rule.
   * Maximum permitted rate is strictly 3.0% (0.0300).
   */
  public static createCommissionRule(adminUserId: string, name: string, rate: number) {
    if (rate < 0 || rate > 0.03) {
      throw new Error('INVALID_COMMISSION_RATE: TUXI Rep commission rate must be between 0.0% and 3.0% (0.0300)');
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      // Deactivate older active rules
      dbInstance.db.prepare(`
        UPDATE commission_rules SET is_active = 0, effective_to = datetime('now') WHERE target_role = 'TUXI_REP' AND is_active = 1
      `).run();

      const ruleId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
        VALUES (?, 1, ?, 'TUXI_REP', ?, datetime('now'), 1)
      `).run(ruleId, name, rate);

      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'UPDATE_COMMISSION_RULE', 'COMMISSION_RULE', ?, NULL, ?)
      `).run(
        dbInstance.generateUuid(),
        adminUserId,
        ruleId,
        JSON.stringify({ name, percentageRate: rate })
      );

      dbInstance.db.exec('COMMIT;');
      return { ruleId, percentageRate: rate };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }
}
