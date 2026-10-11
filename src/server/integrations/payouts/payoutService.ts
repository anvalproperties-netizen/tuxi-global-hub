// ============================================================================
// TUXI PHASE 2G — FINANCIAL RECONCILIATION & PAYOUT SERVICE
// Authoritative PostgreSQL transactional ledger for Driver Earnings,
// Merchant Settlements, and Rep Commissions (<= 3.0%).
// Enforces hold status gating, dual-authorization batch approval, and policy checks.
// ============================================================================

import crypto from 'node:crypto';
import { postgresAdapter } from '../../db/postgres.js';
import { NotificationService } from '../notifications/notificationService.js';

export interface PayoutHoldInput {
  payoutAccountId: string;
  holdStatus: boolean;
  holdReason?: string;
  adminUserId: string;
}

export interface PayoutEligibilityResult {
  beneficiaryUserId: string;
  beneficiaryRole: 'DRIVER' | 'MERCHANT' | 'REP';
  eligibleAmountCents: number;
  currency: string;
  isEligible: boolean;
  holdActive: boolean;
  holdReason?: string;
  reasonsBlocked?: string[];
  payoutAccountId?: string;
  bankNameMasked?: string;
}

export class PayoutService {
  /**
   * Registers or updates a payout destination bank account for a user.
   */
  public static async registerPayoutAccount(input: {
    userId: string;
    beneficiaryType: 'DRIVER' | 'MERCHANT' | 'REP';
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    branchCode: string;
  }) {
    if (!input.accountHolderName || !input.bankName || !input.accountNumber || !input.branchCode) {
      throw new Error('MISSING_FIELDS: All bank account details are required');
    }

    const maskedAccount = `***${input.accountNumber.slice(-4)}`;

    const res = await postgresAdapter.pool.query(`
      INSERT INTO payout_accounts (
        id, user_id, beneficiary_type, account_holder_name, bank_name,
        account_number_masked, branch_code, is_verified, is_active, hold_status
      ) VALUES (
        uuid_generate_v4(), $1, $2, $3, $4, $5, $6, TRUE, TRUE, FALSE
      )
      RETURNING *;
    `, [
      input.userId,
      input.beneficiaryType,
      input.accountHolderName,
      input.bankName,
      maskedAccount,
      input.branchCode
    ]);

    return res.rows[0];
  }

  /**
   * Toggles a payout hold on an account with auditable reason.
   */
  public static async setPayoutHold(input: PayoutHoldInput) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const accountRes = await client.query(
        'SELECT id, user_id, hold_status FROM payout_accounts WHERE id = $1 FOR UPDATE;',
        [input.payoutAccountId]
      );
      if (accountRes.rows.length === 0) throw new Error('PAYOUT_ACCOUNT_NOT_FOUND');

      await client.query(`
        UPDATE payout_accounts
        SET hold_status = $1, hold_reason = $2, updated_at = NOW()
        WHERE id = $3;
      `, [input.holdStatus, input.holdReason || null, input.payoutAccountId]);

      // Record administrative audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
        VALUES (uuid_generate_v4(), $1, $2, 'PAYOUT_ACCOUNT', $3, $4);
      `, [
        input.adminUserId,
        input.holdStatus ? 'PAYOUT_HOLD_APPLIED' : 'PAYOUT_HOLD_RELEASED',
        input.payoutAccountId,
        JSON.stringify({ holdStatus: input.holdStatus, holdReason: input.holdReason })
      ]);

      await client.query('COMMIT;');
      return { success: true, payoutAccountId: input.payoutAccountId, holdStatus: input.holdStatus };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Calculates Rep commission balance from PostgreSQL commission_ledger,
   * verifying the strict <= 3.0% cap on all entries.
   */
  public static async getRepCommissionBalance(userId: string): Promise<{
    repProfileId: string;
    totalEarnedCents: number;
    totalReversedCents: number;
    netBalanceCents: number;
    currency: string;
    rateCapVerified: boolean;
  }> {
    const repRes = await postgresAdapter.pool.query(
      'SELECT id FROM rep_profiles WHERE user_id = $1;',
      [userId]
    );
    if (repRes.rows.length === 0) {
      throw new Error('REP_PROFILE_NOT_FOUND');
    }
    const repProfileId = repRes.rows[0].id;

    const ledgerRes = await postgresAdapter.pool.query(`
      SELECT 
        status,
        applied_percentage,
        COALESCE(SUM(commission_cents), 0)::bigint as total_cents
      FROM commission_ledger
      WHERE rep_profile_id = $1
      GROUP BY status, applied_percentage;
    `, [repProfileId]);

    let totalEarnedCents = 0;
    let totalReversedCents = 0;
    let rateCapVerified = true;

    for (const row of ledgerRes.rows) {
      const rate = Number(row.applied_percentage);
      if (rate > 0.0300) {
        rateCapVerified = false; // Violation of 3% cap detected
      }
      if (row.status === 'EARNED') {
        totalEarnedCents += Number(row.total_cents);
      } else if (row.status === 'REVERSED') {
        totalReversedCents += Math.abs(Number(row.total_cents));
      }
    }

    return {
      repProfileId,
      totalEarnedCents,
      totalReversedCents,
      netBalanceCents: Math.max(0, totalEarnedCents - totalReversedCents),
      currency: 'ZAR',
      rateCapVerified
    };
  }

  /**
   * Calculates Driver earnings from PostgreSQL driver_earnings ledger.
   */
  public static async getDriverEarningsBalance(userId: string): Promise<{
    driverProfileId: string;
    grossDeliveryEarningsCents: number;
    totalTipsCents: number;
    netBalanceCents: number;
    currency: string;
  }> {
    const drvRes = await postgresAdapter.pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1;',
      [userId]
    );
    if (drvRes.rows.length === 0) throw new Error('DRIVER_PROFILE_NOT_FOUND');
    const driverProfileId = drvRes.rows[0].id;

    const earnRes = await postgresAdapter.pool.query(`
      SELECT 
        COALESCE(SUM(delivery_fee_cents), 0)::bigint as sum_fees,
        COALESCE(SUM(tip_cents), 0)::bigint as sum_tips,
        COALESCE(SUM(total_earned_cents), 0)::bigint as sum_total
      FROM driver_earnings
      WHERE driver_id = $1;
    `, [driverProfileId]);

    const row = earnRes.rows[0];
    return {
      driverProfileId,
      grossDeliveryEarningsCents: Number(row.sum_fees),
      totalTipsCents: Number(row.sum_tips),
      netBalanceCents: Number(row.sum_total),
      currency: 'ZAR'
    };
  }

  /**
   * Evaluates payout eligibility for a beneficiary, checking minimum threshold policy,
   * active bank account, verified status, and hold restrictions.
   */
  public static async checkPayoutEligibility(
    userId: string,
    role: 'DRIVER' | 'MERCHANT' | 'REP'
  ): Promise<PayoutEligibilityResult> {
    const reasonsBlocked: string[] = [];

    // 1. Check Payout Account
    const accRes = await postgresAdapter.pool.query(`
      SELECT id, bank_name, account_number_masked, is_verified, is_active, hold_status, hold_reason
      FROM payout_accounts
      WHERE user_id = $1 AND beneficiary_type = $2 AND is_active = TRUE
      LIMIT 1;
    `, [userId, role]);

    if (accRes.rows.length === 0) {
      reasonsBlocked.push('NO_PAYOUT_ACCOUNT_REGISTERED');
      return {
        beneficiaryUserId: userId,
        beneficiaryRole: role,
        eligibleAmountCents: 0,
        currency: 'ZAR',
        isEligible: false,
        holdActive: false,
        reasonsBlocked
      };
    }

    const account = accRes.rows[0];
    if (account.hold_status) {
      reasonsBlocked.push(`PAYOUT_HOLD_ACTIVE: ${account.hold_reason || 'Administrative hold'}`);
    }
    if (!account.is_verified) {
      reasonsBlocked.push('ACCOUNT_NOT_VERIFIED');
    }

    // 2. Query Balance
    let balanceCents = 0;
    if (role === 'REP') {
      const rep = await this.getRepCommissionBalance(userId);
      balanceCents = rep.netBalanceCents;
    } else if (role === 'DRIVER') {
      const drv = await this.getDriverEarningsBalance(userId);
      balanceCents = drv.netBalanceCents;
    } else if (role === 'MERCHANT') {
      // Merchant balance calculation
      const mRes = await postgresAdapter.pool.query(`
        SELECT COALESCE(SUM(total_cents), 0)::bigint as sum_sales
        FROM orders o
        JOIN business_owners bo ON bo.business_id = o.business_id
        WHERE bo.user_id = $1 AND o.status IN ('DELIVERED', 'COMPLETED');
      `, [userId]);
      balanceCents = Number(mRes.rows[0].sum_sales);
    }

    // 3. Minimum Threshold Check (from financial_policies, e.g. R50.00 = 5000 cents)
    const thresholdPolicyRes = await postgresAdapter.pool.query(`
      SELECT value_numeric FROM financial_policies
      WHERE policy_key = 'MINIMUM_PAYOUT_THRESHOLD_CENTS' AND status = 'ACTIVE'
      LIMIT 1;
    `);
    const minThresholdCents = thresholdPolicyRes.rows.length > 0
      ? Number(thresholdPolicyRes.rows[0].value_numeric)
      : 5000; // R50 default

    if (balanceCents < minThresholdCents) {
      reasonsBlocked.push(`BELOW_MINIMUM_THRESHOLD: Current balance R${(balanceCents / 100).toFixed(2)} is below minimum R${(minThresholdCents / 100).toFixed(2)}`);
    }

    const isEligible = reasonsBlocked.length === 0 && balanceCents > 0;

    return {
      beneficiaryUserId: userId,
      beneficiaryRole: role,
      eligibleAmountCents: balanceCents,
      currency: 'ZAR',
      isEligible,
      holdActive: Boolean(account.hold_status),
      holdReason: account.hold_reason,
      reasonsBlocked: reasonsBlocked.length > 0 ? reasonsBlocked : undefined,
      payoutAccountId: account.id,
      bankNameMasked: `${account.bank_name} (${account.account_number_masked})`
    };
  }

  /**
   * Creates a payout batch with dual-authorization workflow.
   * Draft -> Approved by second admin -> Processed.
   */
  public static async createPayoutBatch(input: {
    adminUserId: string;
    items: Array<{
      beneficiaryUserId: string;
      beneficiaryRole: 'DRIVER' | 'MERCHANT' | 'REP';
      amountCents: number;
      reference: string;
    }>;
    notes?: string;
  }) {
    if (!input.items || input.items.length === 0) {
      throw new Error('EMPTY_PAYOUT_BATCH: Batch must contain at least one payout item');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const batchRef = `PAYBATCH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      let totalAmountCents = 0;

      // 1. Verify all beneficiaries and eligibility
      for (const item of input.items) {
        if (item.amountCents <= 0 || !Number.isInteger(item.amountCents)) {
          throw new Error(`INVALID_ITEM_AMOUNT: Item for user ${item.beneficiaryUserId} must be a positive integer`);
        }
        totalAmountCents += item.amountCents;

        // Check hold status
        const accRes = await client.query(`
          SELECT id, hold_status FROM payout_accounts
          WHERE user_id = $1 AND beneficiary_type = $2 AND is_active = TRUE
          LIMIT 1;
        `, [item.beneficiaryUserId, item.beneficiaryRole]);

        if (accRes.rows.length === 0) {
          throw new Error(`MISSING_ACCOUNT: User ${item.beneficiaryUserId} has no registered payout account`);
        }
        if (accRes.rows[0].hold_status) {
          throw new Error(`PAYOUT_HOLD_BLOCKED: User ${item.beneficiaryUserId} is currently on administrative hold`);
        }
      }

      // 2. Insert Batch Header
      const batchRes = await client.query(`
        INSERT INTO payout_batches (
          id, batch_reference, provider_id, status, total_amount_cents, total_items,
          currency, created_by, notes
        ) VALUES (
          uuid_generate_v4(), $1, 'bank_eft_payouts', 'DRAFT', $2, $3, 'ZAR', $4, $5
        ) RETURNING id, batch_reference, status;
      `, [batchRef, totalAmountCents, input.items.length, input.adminUserId, input.notes]);

      const batchId = batchRes.rows[0].id;

      // 3. Insert Items
      for (const item of input.items) {
        const accRes = await client.query(`
          SELECT id FROM payout_accounts
          WHERE user_id = $1 AND beneficiary_type = $2 LIMIT 1;
        `, [item.beneficiaryUserId, item.beneficiaryRole]);
        const accountId = accRes.rows[0]?.id;

        await client.query(`
          INSERT INTO payout_items (
            id, batch_id, beneficiary_user_id, payout_account_id, beneficiary_role,
            amount_cents, currency, reference, status
          ) VALUES (
            uuid_generate_v4(), $1, $2, $3, $4, $5, 'ZAR', $6, 'PENDING'
          );
        `, [batchId, item.beneficiaryUserId, accountId, item.beneficiaryRole, item.amountCents, item.reference]);
      }

      await client.query('COMMIT;');

      return {
        batchId,
        batchReference: batchRef,
        totalAmountCents,
        totalItems: input.items.length,
        status: 'DRAFT'
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Dual-authorization approval of a payout batch by an independent second administrator.
   */
  public static async approvePayoutBatch(batchId: string, approvingAdminUserId: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const bRes = await client.query(
        'SELECT id, created_by, status, total_amount_cents, batch_reference FROM payout_batches WHERE id = $1 FOR UPDATE;',
        [batchId]
      );
      if (bRes.rows.length === 0) throw new Error('BATCH_NOT_FOUND');
      const batch = bRes.rows[0];

      if (batch.created_by === approvingAdminUserId) {
        throw new Error('DUAL_AUTHORIZATION_VIOLATION: Approving administrator must be distinct from the creating administrator');
      }

      if (batch.status !== 'DRAFT' && batch.status !== 'PENDING_APPROVAL') {
        throw new Error(`INVALID_BATCH_STATE: Cannot approve batch with status "${batch.status}"`);
      }

      // Check provider state (hold / sandbox safety)
      const provRes = await client.query(
        'SELECT state, is_production_authorized FROM integration_providers WHERE id = \'bank_eft_payouts\';'
      );
      const isProd = provRes.rows.length > 0 && provRes.rows[0].is_production_authorized;

      const newStatus = isProd ? 'SETTLED' : 'APPROVED';

      await client.query(`
        UPDATE payout_batches
        SET status = $1, approved_by = $2, executed_at = NOW(), updated_at = NOW()
        WHERE id = $3;
      `, [newStatus, approvingAdminUserId, batchId]);

      // Update all items in batch
      await client.query(`
        UPDATE payout_items
        SET status = 'PAID', updated_at = NOW()
        WHERE batch_id = $1;
      `, [batchId]);

      await client.query('COMMIT;');

      return {
        batchId,
        batchReference: batch.batch_reference,
        status: newStatus,
        approvedBy: approvingAdminUserId,
        isProductionTransmitted: isProd
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}
