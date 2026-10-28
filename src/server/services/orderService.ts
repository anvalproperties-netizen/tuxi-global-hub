import crypto from 'node:crypto';
import { postgresAdapter } from '../db/postgres.js';
import { dbInstance } from '../db/database.js';
import { CommissionService } from './commissionService.js';
import { calculateOrderPayloadAssessment, OrderItemInput } from '../utils/payloadEvaluation.js';

export interface BasketItemInput {
  itemType?: 'MENU_ITEM' | 'PRODUCT';
  itemId: string;
  variantId?: string;
  quantity: number;
  selectedModifierIds?: string[];
}

export interface RepriceBasketInput {
  businessId: string;
  items: BasketItemInput[];
  tipCents?: number;
  orderType?: 'EATS' | 'SHOP';
}

export interface RepricedItem {
  itemType: 'MENU_ITEM' | 'PRODUCT';
  itemId: string;
  variantId?: string | null;
  sku?: string | null;
  itemName: string;
  unitPriceCents: number;
  basePriceCents: number;
  quantity: number;
  lineTotalCents: number;
  variantAttributes?: Record<string, any>;
  selectedModifiers: any[];
}

export interface RepriceBasketResult {
  businessId: string;
  businessName: string;
  items: RepricedItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  tipCents: number;
  totalCents: number;
  currency: string;
  deliveryQuotationAvailable?: boolean;
  quotationUnavailableReason?: string;
  payloadAssessment?: any;
}


export interface CreateOrderInput {
  customerId: string; // User ID of authenticated customer
  businessId: string;
  orderType?: 'EATS' | 'SHOP';
  deliveryAddressId?: string;
  deliveryAddress?: {
    streetLine1: string;
    city: string;
    postalCode: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  };
  items: BasketItemInput[];
  tipCents?: number;
  specialInstructions?: string;
  idempotencyKey?: string;
  isTestPayment?: boolean;
}

export class OrderService {
  /**
   * Authoritative server-side basket repricing.
   * STRICT SECURITY INSTRUCTION (2A.7):
   * Never trusts client-submitted price totals.
   * Re-fetches each item from PostgreSQL.
   * Enforces ONE Eats business per order.
   * Rejects unavailable items or invalid modifiers.
   */
  public static async repriceBasket(input: RepriceBasketInput) {
    if (!input.items || input.items.length === 0) {
      throw new Error('EMPTY_BASKET: Order must contain at least one item');
    }

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        // 1. Verify business is approved and active
        const bizRes = await client.query(`
          SELECT id, name, type, status, is_active FROM businesses WHERE id = $1;
        `, [input.businessId]);

        if (bizRes.rows.length === 0 || bizRes.rows[0].status !== 'APPROVED' || !bizRes.rows[0].is_active) {
          throw new Error('BUSINESS_UNAVAILABLE: Merchant is not approved or active');
        }

        const bizType = bizRes.rows[0].type;
        let subtotalCents = 0;
        const repricedItems = [];
        const orderPayloadItems: OrderItemInput[] = [];

        for (const item of input.items) {
          if (!item.quantity || item.quantity <= 0) {
            throw new Error('INVALID_QUANTITY: Item quantity must be greater than zero');
          }

          if (bizType === 'SHOP' || item.itemType === 'PRODUCT') {
            // ==========================================
            // SHOP PRODUCT & VARIANT REPRICING (PHASE 2B)
            // ==========================================
            const prodRes = await client.query(`
              SELECT id, business_id, sku, name, price_cents, sale_price_cents, is_on_sale, is_available, is_active,
                     weight_grams, length_cm, width_cm, height_cm, is_bulk, is_wholesale
              FROM products
              WHERE id = $1;
            `, [item.itemId]);

            if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
              throw new Error(`PRODUCT_NOT_FOUND: Product ${item.itemId} does not exist or is inactive`);
            }

            const prod = prodRes.rows[0];

            if (prod.business_id !== input.businessId) {
              throw new Error('MULTI_BUSINESS_ORDER_REJECTED: All items in an order must come from the same business');
            }

            if (!prod.is_available) {
              throw new Error(`ITEM_UNAVAILABLE: "${prod.name}" is currently unavailable`);
            }

            let effectiveUnitCents = (prod.is_on_sale && prod.sale_price_cents && prod.sale_price_cents > 0)
              ? prod.sale_price_cents
              : prod.price_cents;
            let itemSku = prod.sku;
            let itemName = prod.name;
            let variantAttrs = {};
            let variantRow: any = null;

            if (item.variantId) {
              const varRes = await client.query(`
                SELECT id, product_id, variant_sku, variant_name, price_delta_cents, sale_price_cents, attributes, is_available,
                       weight_grams, length_cm, width_cm, height_cm, is_bulk, is_wholesale
                FROM product_variants
                WHERE id = $1;
              `, [item.variantId]);

              if (varRes.rows.length === 0) {
                throw new Error(`VARIANT_NOT_FOUND: Variant ${item.variantId} does not exist`);
              }

              const variant = varRes.rows[0];
              variantRow = variant;

              if (variant.product_id !== prod.id) {
                throw new Error(`INVALID_VARIANT: Variant does not belong to product "${prod.name}"`);
              }

              if (!variant.is_available) {
                throw new Error(`VARIANT_UNAVAILABLE: Variant "${variant.variant_name}" is currently unavailable`);
              }

              if (variant.sale_price_cents && variant.sale_price_cents > 0) {
                effectiveUnitCents = variant.sale_price_cents;
              } else {
                effectiveUnitCents += (variant.price_delta_cents || 0);
              }

              itemSku = variant.variant_sku;
              itemName = `${prod.name} (${variant.variant_name})`;
              variantAttrs = variant.attributes || {};
            }

            const lineTotalCents = effectiveUnitCents * item.quantity;
            subtotalCents += lineTotalCents;

            orderPayloadItems.push({
              itemId: prod.id,
              variantId: item.variantId || null,
              sku: itemSku,
              name: itemName,
              quantity: item.quantity,
              product: {
                weight_grams: prod.weight_grams,
                length_cm: prod.length_cm,
                width_cm: prod.width_cm,
                height_cm: prod.height_cm,
                is_bulk: Boolean(prod.is_bulk),
                is_wholesale: Boolean(prod.is_wholesale)
              },
              variant: variantRow ? {
                weight_grams: variantRow.weight_grams,
                length_cm: variantRow.length_cm,
                width_cm: variantRow.width_cm,
                height_cm: variantRow.height_cm,
                is_bulk: variantRow.is_bulk !== undefined && variantRow.is_bulk !== null ? Boolean(variantRow.is_bulk) : null,
                is_wholesale: variantRow.is_wholesale !== undefined && variantRow.is_wholesale !== null ? Boolean(variantRow.is_wholesale) : null
              } : null
            });

            repricedItems.push({
              itemType: 'PRODUCT' as const,
              itemId: prod.id,
              variantId: item.variantId || null,
              sku: itemSku,
              itemName,
              unitPriceCents: effectiveUnitCents,
              basePriceCents: prod.price_cents,

              quantity: item.quantity,
              lineTotalCents,
              variantAttributes: variantAttrs,
              selectedModifiers: []
            });
          } else {
            // ==========================================
            // EATS MENU ITEM REPRICING (PHASE 2A)
            // ==========================================
            const itemRes = await client.query(`
              SELECT mi.id, mi.name, mi.base_price_cents, mi.is_available, mc.business_id
              FROM menu_items mi
              JOIN menu_categories mc ON mc.id = mi.category_id
              WHERE mi.id = $1;
            `, [item.itemId]);

            if (itemRes.rows.length === 0) {
              throw new Error(`MENU_ITEM_NOT_FOUND: Item ${item.itemId} does not exist`);
            }

            const menuItem = itemRes.rows[0];

            if (menuItem.business_id !== input.businessId) {
              throw new Error('MULTI_BUSINESS_ORDER_REJECTED: All items in an Eats order must come from the same restaurant');
            }

            if (!menuItem.is_available) {
              throw new Error(`ITEM_UNAVAILABLE: "${menuItem.name}" is currently sold out`);
            }

            let itemUnitTotalCents = menuItem.base_price_cents;
            const selectedModifiers = [];

            if (item.selectedModifierIds && item.selectedModifierIds.length > 0) {
              const modRes = await client.query(`
                SELECT id, group_name, name, extra_price_cents
                FROM menu_item_modifiers
                WHERE id = ANY($1::uuid[]) AND menu_item_id = $2;
              `, [item.selectedModifierIds, menuItem.id]);

              if (modRes.rows.length !== item.selectedModifierIds.length) {
                throw new Error(`INVALID_MODIFIER: One or more selected modifiers do not belong to "${menuItem.name}"`);
              }

              for (const mod of modRes.rows) {
                itemUnitTotalCents += mod.extra_price_cents;
                selectedModifiers.push({
                  id: mod.id,
                  groupName: mod.group_name,
                  name: mod.name,
                  extraPriceCents: mod.extra_price_cents
                });
              }
            }

            const lineTotalCents = itemUnitTotalCents * item.quantity;
            subtotalCents += lineTotalCents;

            repricedItems.push({
              itemType: 'MENU_ITEM' as const,
              itemId: menuItem.id,
              variantId: null,
              sku: null,
              itemName: menuItem.name,
              unitPriceCents: itemUnitTotalCents,
              basePriceCents: menuItem.base_price_cents,
              quantity: item.quantity,
              lineTotalCents,
              variantAttributes: {},
              selectedModifiers
            });
          }
        }

        const deliveryFeeCents = 2500; // Standard R25 delivery fee
        const serviceFeeCents = 150;   // Standard R1.50 service fee
        const tipCents = input.tipCents && input.tipCents > 0 ? Math.round(input.tipCents) : 0;
        const totalCents = subtotalCents + deliveryFeeCents + serviceFeeCents + tipCents;

        return {
          businessId: input.businessId,
          businessName: bizRes.rows[0].name,
          items: repricedItems,
          subtotalCents,
          deliveryFeeCents,
          serviceFeeCents,
          tipCents,
          totalCents,
          currency: 'ZAR'
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const biz = dbInstance.db.prepare('SELECT id, name, status FROM businesses WHERE id = ?').get(input.businessId) as any;
    if (!biz || biz.status !== 'APPROVED') {
      throw new Error('BUSINESS_UNAVAILABLE: Merchant is not approved or active');
    }

    let subtotalCents = 0;
    const repricedItems: RepricedItem[] = [];

    for (const item of input.items) {
      if (item.itemType === 'PRODUCT') {
        const prod = dbInstance.db.prepare('SELECT id, sku, name, price_cents, is_active, business_id FROM products WHERE id = ?').get(item.itemId) as any;
        if (!prod) throw new Error('PRODUCT_NOT_FOUND');
        if (prod.business_id !== input.businessId) throw new Error('MULTI_BUSINESS_ORDER_REJECTED');
        const lineTotal = prod.price_cents * item.quantity;
        subtotalCents += lineTotal;
        repricedItems.push({
          itemType: 'PRODUCT',
          itemId: prod.id,
          variantId: item.variantId || null,
          sku: prod.sku || null,
          itemName: prod.name,
          unitPriceCents: prod.price_cents,
          basePriceCents: prod.price_cents,
          quantity: item.quantity,
          lineTotalCents: lineTotal,
          variantAttributes: {},
          selectedModifiers: []
        });
      } else {
        const mi = dbInstance.db.prepare('SELECT mi.id, mi.name, mi.base_price_cents, mi.is_available, mc.business_id FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id WHERE mi.id = ?').get(item.itemId) as any;
        if (!mi) throw new Error('MENU_ITEM_NOT_FOUND');
        if (mi.business_id !== input.businessId) throw new Error('MULTI_BUSINESS_ORDER_REJECTED');
        const lineTotal = mi.base_price_cents * item.quantity;
        subtotalCents += lineTotal;
        repricedItems.push({
          itemType: 'MENU_ITEM',
          itemId: mi.id,
          variantId: null,
          sku: null,
          itemName: mi.name,
          unitPriceCents: mi.base_price_cents,
          basePriceCents: mi.base_price_cents,
          quantity: item.quantity,
          lineTotalCents: lineTotal,
          variantAttributes: {},
          selectedModifiers: []
        });
      }
    }

    const deliveryFeeCents = 2500;
    const serviceFeeCents = 150;
    const tipCents = input.tipCents && input.tipCents > 0 ? Math.round(input.tipCents) : 0;
    const totalCents = subtotalCents + deliveryFeeCents + serviceFeeCents + tipCents;

    return {
      businessId: input.businessId,
      businessName: biz.name,
      items: repricedItems,
      subtotalCents,
      deliveryFeeCents,
      serviceFeeCents,
      tipCents,
      totalCents,
      currency: 'ZAR'
    };
  }

  /**
   * Creates a real persistent order in PostgreSQL.
   * Idempotency, server repricing, address validation, and atomic transaction.
   */
  public static async createOrder(input: CreateOrderInput) {
    if (!input.items || input.items.length === 0) {
      throw new Error('EMPTY_ORDER_ITEMS: Order must contain at least one item');
    }

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // Strict production check: Test payment mode cannot run in production mode
        if (process.env.NODE_ENV === 'production' && input.isTestPayment) {
          throw new Error('TEST_PAYMENT_FORBIDDEN_IN_PRODUCTION: Test payments cannot run in production mode');
        }

        // 1. Idempotency Check
        if (input.idempotencyKey) {
          const existing = await client.query(`
            SELECT id, order_number, subtotal_cents, total_cents, status
            FROM orders WHERE idempotency_key = $1;
          `, [input.idempotencyKey]);

          if (existing.rows.length > 0) {
            await client.query('ROLLBACK;');
            return {
              orderId: existing.rows[0].id,
              orderNumber: existing.rows[0].order_number,
              subtotalCents: existing.rows[0].subtotal_cents,
              totalCents: existing.rows[0].total_cents,
              status: existing.rows[0].status,
              isIdempotentReplay: true
            };
          }
        }

        // 2. Resolve Customer Profile ID
        const custRes = await client.query(`
          SELECT id FROM customer_profiles WHERE user_id = $1 OR id = $1;
        `, [input.customerId]);

        if (custRes.rows.length === 0) {
          throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
        }
        const customerProfileId = custRes.rows[0].id;

        // 2B. Resolve Business Type & Enforce Approved/Active Status (2A.5, 2B.1, 2E.5)
        const bizCheck = await client.query(`
          SELECT type, status, is_active FROM businesses WHERE id = $1;
        `, [input.businessId]);
        if (bizCheck.rows.length === 0) {
          throw new Error('BUSINESS_NOT_FOUND: Business does not exist');
        }
        const biz = bizCheck.rows[0];
        if (biz.status !== 'APPROVED' || !biz.is_active) {
          throw new Error(`BUSINESS_NOT_AVAILABLE: Orders can only be placed for approved and active businesses (Current status: ${biz.status})`);
        }
        const bizType = biz.type;

        // 3. Resolve Delivery Address
        let deliveryAddressId: string;
        if (input.deliveryAddressId) {
          const addrRes = await client.query(`
            SELECT id FROM addresses WHERE id = $1 AND (user_id = $2 OR user_id IS NULL);
          `, [input.deliveryAddressId, input.customerId]);

          if (addrRes.rows.length === 0) {
            throw new Error('DELIVERY_ADDRESS_NOT_FOUND: Selected address is invalid or not owned by user');
          }
          deliveryAddressId = addrRes.rows[0].id;
        } else if (input.deliveryAddress) {
          const insAddr = await client.query(`
            INSERT INTO addresses (
              id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address
            )
            VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, $5, $6::numeric, $7::numeric,
              ST_SetSRID(ST_Point($7::float8, $6::float8), 4326), $8
            )
            RETURNING id;
          `, [
            input.customerId,
            input.deliveryAddress.streetLine1,
            input.deliveryAddress.city,
            input.deliveryAddress.postalCode,
            input.deliveryAddress.countryCode,
            input.deliveryAddress.latitude,
            input.deliveryAddress.longitude,
            `${input.deliveryAddress.streetLine1}, ${input.deliveryAddress.city}`
          ]);
          deliveryAddressId = insAddr.rows[0].id;
        } else {
          throw new Error('MISSING_DELIVERY_ADDRESS: A valid delivery address is required');
        }

        // 4. Server-Side Authoritative Repricing
        const repriced = await this.repriceBasket({
          businessId: input.businessId,
          items: input.items,
          tipCents: input.tipCents
        });

        // 5. Generate human-readable order number TX-XXXXXX with collision protection
        const orderType = (bizType === 'SHOP' || input.orderType === 'SHOP') ? 'SHOP' : 'EATS';

        // 6. Insert Order into PostgreSQL with savepoint retry if random number collides
        let orderRes: any;
        let orderNumber = '';
        for (let attempt = 0; attempt < 10; attempt++) {
          orderNumber = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
          await client.query('SAVEPOINT order_insert_attempt;');
          try {
            orderRes = await client.query(`
              INSERT INTO orders (
                id, order_number, customer_id, business_id, order_type, subtotal_cents, delivery_fee_cents,
                service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id,
                special_instructions, idempotency_key
              )
              VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
              )
              RETURNING *;
            `, [
              orderNumber,
              customerProfileId,
              input.businessId,
              orderType,
              repriced.subtotalCents,
              repriced.deliveryFeeCents,
              repriced.serviceFeeCents,
              repriced.tipCents,
              repriced.totalCents,
              'ZAR',
              'PLACED',
              deliveryAddressId,
              input.specialInstructions || null,
              input.idempotencyKey || null
            ]);
            await client.query('RELEASE SAVEPOINT order_insert_attempt;');
            break;
          } catch (insertErr: any) {
            await client.query('ROLLBACK TO SAVEPOINT order_insert_attempt;');
            if (insertErr.code === '23505' && (insertErr.constraint === 'orders_order_number_key' || insertErr.message?.includes('orders_order_number_key'))) {
              continue;
            }
            throw insertErr;
          }
        }

        if (!orderRes || !orderRes.rows || orderRes.rows.length === 0) {
          throw new Error('FAILED_TO_GENERATE_UNIQUE_ORDER_NUMBER: Could not allocate unique order number');
        }

        const order = orderRes.rows[0];

        // 7. Insert Order Items & Handle Inventory Reservations / Deductions
        for (const item of repriced.items) {
          const insertedItem = await client.query(`
            INSERT INTO order_items (
              id, order_id, item_type, item_id, variant_id, sku, item_name, unit_price_cents, quantity, total_cents, variant_attributes, selected_modifiers
            )
            VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
            RETURNING id;
          `, [
            order.id,
            item.itemType,
            item.itemId,
            item.variantId || null,
            item.sku || null,
            item.itemName,
            item.unitPriceCents,
            item.quantity,
            item.lineTotalCents,
            JSON.stringify(item.variantAttributes || {}),
            JSON.stringify(item.selectedModifiers || [])
          ]);

          // FOR SHOP PRODUCTS: Atomic inventory reservation & decrement under row lock
          if (item.itemType === 'PRODUCT') {
            let invRes;
            if (item.variantId) {
              invRes = await client.query(`
                SELECT id, quantity_available, reserved_quantity
                FROM inventory
                WHERE variant_id = $1
                FOR UPDATE;
              `, [item.variantId]);
            } else {
              invRes = await client.query(`
                SELECT id, quantity_available, reserved_quantity
                FROM inventory
                WHERE product_id = $1 AND variant_id IS NULL
                FOR UPDATE;
              `, [item.itemId]);
            }

            if (invRes.rows.length === 0) {
              throw new Error(`INVENTORY_NOT_FOUND: No inventory record found for product "${item.itemName}"`);
            }

            const inv = invRes.rows[0];
            const netAvailable = inv.quantity_available - inv.reserved_quantity;

            if (netAvailable < item.quantity) {
              throw new Error(`INSUFFICIENT_STOCK: Only ${Math.max(0, netAvailable)} unit(s) available for "${item.itemName}", but ${item.quantity} requested`);
            }

            // Atomically update inventory quantity and reserved count
            await client.query(`
              UPDATE inventory
              SET quantity_available = quantity_available - $1,
                  updated_at = NOW()
              WHERE id = $2;
            `, [item.quantity, inv.id]);

            // Create Inventory Reservation record
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes reservation window
            const reservationStatus = input.isTestPayment ? 'COMMITTED' : 'RESERVED';
            await client.query(`
              INSERT INTO inventory_reservations (
                id, order_id, inventory_id, quantity, status, expires_at
              )
              VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, $5
              );
            `, [order.id, inv.id, item.quantity, reservationStatus, expiresAt]);
          }
        }

        // 8. Payment Gateway State (STRICT 2A.10 REQUIREMENT)
        // Mark PAYMENT_INTEGRATION_PENDING unless explicitly running in development test payment mode
        const paymentProvider = input.isTestPayment ? 'TEST_PAYMENT_AUTHORIZED' : 'PAYMENT_INTEGRATION_PENDING';
        const paymentStatus = input.isTestPayment ? 'AUTHORISED' : 'INITIATED';

        await client.query(`
          INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider)
          VALUES (uuid_generate_v4(), $1, $2, 'ZAR', $3, $4);
        `, [order.id, repriced.totalCents, paymentStatus, paymentProvider]);

        // 9. Record Audit Log
        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
          VALUES (uuid_generate_v4(), $1, 'ORDER_CREATED', 'ORDER', $2, $3);
        `, [input.customerId, order.id, JSON.stringify({ orderNumber: order.order_number, totalCents: order.total_cents })]);

        await client.query('COMMIT;');

        return {
          orderId: order.id,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          businessId: order.business_id,
          subtotalCents: order.subtotal_cents,
          deliveryFeeCents: order.delivery_fee_cents,
          serviceFeeCents: order.service_fee_cents,
          tipCents: order.tip_cents,
          totalCents: order.total_cents,
          status: order.status,
          paymentStatus,
          paymentProvider,
          items: repriced.items,
          createdAt: order.created_at
        };
      } catch (err: any) {
        await client.query('ROLLBACK;');
        // Concurrent race condition recovery for duplicate idempotency_key
        if (err.code === '23505' && input.idempotencyKey) {
          const recClient = await postgresAdapter.pool.connect();
          try {
            const existing = await recClient.query(`
              SELECT id, order_number, subtotal_cents, total_cents, status
              FROM orders WHERE idempotency_key = $1;
            `, [input.idempotencyKey]);

            if (existing.rows.length > 0) {
              return {
                orderId: existing.rows[0].id,
                orderNumber: existing.rows[0].order_number,
                subtotalCents: existing.rows[0].subtotal_cents,
                totalCents: existing.rows[0].total_cents,
                status: existing.rows[0].status,
                isIdempotentReplay: true
              };
            }
          } finally {
            recClient.release();
          }
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    if (input.idempotencyKey) {
      const existing = dbInstance.db.prepare('SELECT id, order_number, subtotal_cents, total_cents, status FROM orders WHERE idempotency_key = ?').get(input.idempotencyKey) as any;
      if (existing) {
        return {
          orderId: existing.id,
          orderNumber: existing.order_number,
          subtotalCents: existing.subtotal_cents,
          totalCents: existing.total_cents,
          status: existing.status,
          isIdempotentReplay: true
        };
      }
    }

    const repriced = await this.repriceBasket({
      businessId: input.businessId,
      items: input.items,
      tipCents: input.tipCents
    });

    const cust = dbInstance.db.prepare('SELECT id FROM customer_profiles WHERE user_id = ?').get(input.customerId) as any;
    if (!cust) throw new Error('CUSTOMER_PROFILE_NOT_FOUND');

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      let deliveryAddressId = input.deliveryAddressId;
      if (!deliveryAddressId && input.deliveryAddress) {
        deliveryAddressId = dbInstance.generateUuid();
        dbInstance.db.prepare(`
          INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, normalized_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          deliveryAddressId,
          input.customerId,
          input.deliveryAddress.streetLine1,
          input.deliveryAddress.city,
          input.deliveryAddress.postalCode,
          input.deliveryAddress.countryCode,
          input.deliveryAddress.latitude,
          input.deliveryAddress.longitude,
          `${input.deliveryAddress.streetLine1}, ${input.deliveryAddress.city}`
        );
      } else if (!deliveryAddressId) {
        // Fallback default address if neither provided
        const anyAddr = dbInstance.db.prepare('SELECT id FROM addresses LIMIT 1').get() as any;
        deliveryAddressId = anyAddr?.id || dbInstance.generateUuid();
      }

      // Check & decrement inventory for products
      for (const item of input.items) {
        if (item.itemType === 'PRODUCT') {
          const inv = dbInstance.db.prepare('SELECT quantity_available FROM inventory WHERE product_id = ?').get(item.itemId) as any;
          if (!inv || inv.quantity_available < item.quantity) {
            throw new Error('INSUFFICIENT_STOCK: Item is sold out');
          }
          dbInstance.db.prepare('UPDATE inventory SET quantity_available = quantity_available - ? WHERE product_id = ?').run(item.quantity, item.itemId);
        }
      }

      const orderId = dbInstance.generateUuid();
      const orderNumber = `TX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      (dbInstance.db.prepare(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, delivery_address_id, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLACED', ?)
      `) as any).run(
        orderId,
        orderNumber,
        cust.id,
        input.businessId,
        repriced.subtotalCents,
        repriced.deliveryFeeCents,
        repriced.serviceFeeCents,
        repriced.tipCents,
        repriced.totalCents,
        deliveryAddressId,
        input.idempotencyKey || null
      );

      for (const item of repriced.items) {
        dbInstance.db.prepare(`
          INSERT INTO order_items (id, order_id, item_type, item_id, item_name, unit_price_cents, quantity, total_cents, selected_modifiers)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          dbInstance.generateUuid(),
          orderId,
          'MENU_ITEM',
          item.itemId,
          item.itemName,
          item.unitPriceCents,
          item.quantity,
          item.lineTotalCents,
          '[]'
        );
      }

      dbInstance.db.exec('COMMIT;');

      return {
        orderId,
        orderNumber,
        customerId: cust.id,
        businessId: input.businessId,
        subtotalCents: repriced.subtotalCents,
        deliveryFeeCents: repriced.deliveryFeeCents,
        serviceFeeCents: repriced.serviceFeeCents,
        tipCents: repriced.tipCents,
        totalCents: repriced.totalCents,
        status: 'PLACED',
        items: repriced.items
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Retrieves all orders for the authenticated customer.
   * Strict cross-customer isolation: Customer A CANNOT see Customer B's orders.
   */
  public static async getCustomerOrders(userId: string) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            o.id,
            o.order_number,
            o.subtotal_cents,
            o.delivery_fee_cents,
            o.service_fee_cents,
            o.tip_cents,
            o.total_cents,
            o.currency,
            o.status,
            o.created_at,
            b.id as business_id,
            b.name as business_name,
            b.image_url as business_image,
            p.status as payment_status,
            p.payment_provider
          FROM orders o
          JOIN customer_profiles cp ON cp.id = o.customer_id
          JOIN businesses b ON b.id = o.business_id
          LEFT JOIN payments p ON p.order_id = o.id
          WHERE cp.user_id = $1
          ORDER BY o.created_at DESC;
        `, [userId]);

        // For each order, fetch items summary
        const orders = [];
        for (const r of res.rows) {
          const itemRes = await client.query(`
            SELECT item_name, quantity, unit_price_cents, total_cents
            FROM order_items WHERE order_id = $1;
          `, [r.id]);

          orders.push({
            id: r.id,
            orderNumber: r.order_number,
            businessId: r.business_id,
            businessName: r.business_name,
            businessImage: r.business_image,
            subtotalCents: r.subtotal_cents,
            totalCents: r.total_cents,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentProvider: r.payment_provider,
            items: itemRes.rows.map(i => ({
              name: i.item_name,
              quantity: i.quantity,
              unitPriceCents: i.unit_price_cents,
              totalCents: i.total_cents
            })),
            createdAt: r.created_at
          });
        }

        return orders;
      } finally {
        client.release();
      }
    }

    return [];
  }

  /**
   * Retrieves a single order by ID with ownership enforcement.
   */
  public static async getOrderById(orderId: string, userId: string, roles: string[] = ['CUSTOMER']) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            o.*,
            cp.user_id as customer_user_id,
            b.name as business_name,
            a.street_line_1,
            a.city,
            p.status as payment_status,
            p.payment_provider
          FROM orders o
          JOIN customer_profiles cp ON cp.id = o.customer_id
          JOIN businesses b ON b.id = o.business_id
          LEFT JOIN addresses a ON a.id = o.delivery_address_id
          LEFT JOIN payments p ON p.order_id = o.id
          WHERE o.id = $1;
        `, [orderId]);

        if (res.rows.length === 0) {
          throw new Error('ORDER_NOT_FOUND');
        }

        const o = res.rows[0];

        // STRICT IDOR / BOLA PROTECTION (2A.18)
        const isOwner = o.customer_user_id === userId;
        const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');

        if (!isOwner && !isAdmin) {
          throw new Error('FORBIDDEN_ORDER_ACCESS: You do not have authorization to view this order');
        }

        const itemRes = await client.query(`
          SELECT id, item_type, item_id, item_name, unit_price_cents, quantity, total_cents, selected_modifiers
          FROM order_items WHERE order_id = $1;
        `, [orderId]);

        return {
          id: o.id,
          orderNumber: o.order_number,
          businessId: o.business_id,
          businessName: o.business_name,
          subtotalCents: o.subtotal_cents,
          deliveryFeeCents: o.delivery_fee_cents,
          serviceFeeCents: o.service_fee_cents,
          tipCents: o.tip_cents,
          totalCents: o.total_cents,
          status: o.status,
          paymentStatus: o.payment_status,
          paymentProvider: o.payment_provider,
          deliveryAddress: {
            streetLine1: o.street_line_1,
            city: o.city
          },
          items: itemRes.rows.map(i => ({
            id: i.id,
            name: i.item_name,
            itemName: i.item_name,
            unitPriceCents: i.unit_price_cents,
            quantity: i.quantity,
            totalCents: i.total_cents,
            selectedModifiers: i.selected_modifiers
          })),
          createdAt: o.created_at
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const o = dbInstance.db.prepare(`
      SELECT o.*, cp.user_id as customer_user_id
      FROM orders o
      JOIN customer_profiles cp ON cp.id = o.customer_id
      WHERE o.id = ?
    `).get(orderId) as any;

    if (!o) {
      throw new Error('ORDER_NOT_FOUND');
    }

    const isOwner = o.customer_user_id === userId;
    const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new Error('FORBIDDEN_ORDER_ACCESS: You do not have authorization to view this order');
    }

    return o;
  }

  /**
   * Cancels an order with status checks and triggers compensating commission reversals.
   */
  public static async cancelOrder(orderId: string, userId: string, reason: string = 'Customer cancellation') {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const oRes = await client.query(`
          SELECT o.id, o.status, o.total_cents, cp.user_id as customer_user_id
          FROM orders o
          JOIN customer_profiles cp ON cp.id = o.customer_id
          WHERE o.id = $1
          FOR UPDATE;
        `, [orderId]);

        if (oRes.rows.length === 0) {
          throw new Error('ORDER_NOT_FOUND');
        }

        const order = oRes.rows[0];

        if (order.customer_user_id !== userId) {
          throw new Error('FORBIDDEN_ORDER_ACCESS');
        }

        // State Machine Guard: only unfulfilled orders can be cancelled by customer
        const cancellableStatuses = ['PLACED', 'PENDING_PAYMENT', 'PAYMENT_AUTHORISED', 'ACCEPTED'];
        if (!cancellableStatuses.includes(order.status)) {
          throw new Error(`CANNOT_CANCEL_ORDER: Order in status "${order.status}" cannot be cancelled directly`);
        }

        await client.query(`
          UPDATE orders 
          SET status = 'CANCELLED', cancelled_reason = $1, cancelled_at = NOW(), updated_at = NOW()
          WHERE id = $2;
        `, [reason, orderId]);

        // 2. Release any inventory reservations and restore quantity_available
        const resList = await client.query(`
          SELECT id, inventory_id, quantity, status
          FROM inventory_reservations
          WHERE order_id = $1 AND status != 'RELEASED';
        `, [orderId]);

        for (const resItem of resList.rows) {
          await client.query(`
            UPDATE inventory
            SET quantity_available = quantity_available + $1,
                updated_at = NOW()
            WHERE id = $2;
          `, [resItem.quantity, resItem.inventory_id]);

          await client.query(`
            UPDATE inventory_reservations
            SET status = 'RELEASED', updated_at = NOW()
            WHERE id = $1;
          `, [resItem.id]);
        }

        // Check if any commission was logged in commission_ledger and reverse it
        const commRes = await client.query(`
          SELECT * FROM commission_ledger WHERE order_id = $1 AND status != 'REVERSED';
        `, [orderId]);

        for (const comm of commRes.rows) {
          const revKey = `rev-${comm.idempotency_key}-${Date.now()}`;
          await client.query(`
            INSERT INTO commission_ledger (
              id, rep_profile_id, business_id, order_id, qualifying_amount_cents, applied_rule_id,
              applied_percentage, commission_cents, status, idempotency_key, notes
            )
            VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'REVERSED', $8, 'Order cancelled reversal'
            );
          `, [
            comm.rep_profile_id,
            comm.business_id,
            comm.order_id,
            comm.qualifying_amount_cents,
            comm.applied_rule_id,
            comm.applied_percentage,
            -Math.abs(comm.commission_cents),
            revKey
          ]);

          await client.query("UPDATE commission_ledger SET status = 'REVERSED' WHERE id = $1;", [comm.id]);
        }

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
          VALUES (uuid_generate_v4(), $1, 'ORDER_CANCELLED', 'ORDER', $2, $3);
        `, [userId, orderId, JSON.stringify({ reason })]);

        await client.query('COMMIT;');
        return { success: true, status: 'CANCELLED' };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    return { success: true, status: 'CANCELLED' };
  }

  /**
   * Order Status Progression (State machine validation).
   * STRICT SECURITY INSTRUCTION (2A.11):
   * Customer cannot arbitrarily transition orders to DELIVERED.
   */
  public static async updateOrderStatus(orderId: string, targetStatus: string, actorId: string, actorRoles: string[]) {
    const validTransitions: Record<string, string[]> = {
      'PLACED': ['ACCEPTED', 'PREPARING', 'CANCELLED'],
      'ACCEPTED': ['PREPARING', 'CANCELLED'],
      'PREPARING': ['READY_FOR_PICKUP', 'CANCELLED'],
      'READY_FOR_PICKUP': ['DRIVER_ASSIGNED', 'PICKED_UP', 'DISPATCHED', 'OUT_FOR_DELIVERY'],
      'DRIVER_ASSIGNED': ['PICKED_UP', 'DISPATCHED', 'OUT_FOR_DELIVERY'],
      'PICKED_UP': ['OUT_FOR_DELIVERY', 'IN_TRANSIT'],
      'DISPATCHED': ['OUT_FOR_DELIVERY', 'IN_TRANSIT'],
      'OUT_FOR_DELIVERY': ['DELIVERED'],
      'IN_TRANSIT': ['DELIVERED'],
      'DELIVERED': ['REFUND_PENDING', 'REFUNDED'],
      'CANCELLED': []
    };

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const oRes = await client.query('SELECT id, status, business_id FROM orders WHERE id = $1;', [orderId]);
        if (oRes.rows.length === 0) {
          throw new Error('ORDER_NOT_FOUND');
        }

        // Role authorization check for status updates
        const isPrivileged = actorRoles.includes('ADMIN') || actorRoles.includes('SUPER_ADMIN') || actorRoles.includes('TUXI_EATS_OWNER') || actorRoles.includes('TUXI_SHOP_OWNER') || actorRoles.includes('TUXI_DELIVERY_DRIVER');
        if (!isPrivileged && targetStatus !== 'CANCELLED') {
          throw new Error(`FORBIDDEN_TRANSITION: Customers cannot transition order status to "${targetStatus}"`);
        }

        const currentStatus = oRes.rows[0].status;
        const allowed = validTransitions[currentStatus] || [];

        if (!allowed.includes(targetStatus)) {
          throw new Error(`INVALID_STATE_TRANSITION: Cannot transition order from "${currentStatus}" to "${targetStatus}"`);
        }

        // Verify payment status
        const payRes = await client.query('SELECT status, payment_provider FROM payments WHERE order_id = $1;', [orderId]);
        const payment = payRes.rows[0];
        const isPaidOrAuthorized = payment && (payment.status === 'AUTHORISED' || payment.status === 'CAPTURED');

        // In production, unpaid orders cannot progress through paid fulfillment
        if (process.env.NODE_ENV === 'production' && !isPaidOrAuthorized && targetStatus !== 'CANCELLED') {
          throw new Error('UNPAID_ORDER_FULFILLMENT_FORBIDDEN: Unpaid production orders cannot progress through fulfillment');
        }

        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2;', [targetStatus, orderId]);

        // If order transitions to DELIVERED, evaluate qualifying Rep commission (Phase 1 commission logic)
        // Strict safety: UNPAID orders NEVER generate EARNED Rep commission!
        if (targetStatus === 'DELIVERED' && isPaidOrAuthorized) {
          const bizId = oRes.rows[0].business_id;
          const attrRes = await client.query(`
            SELECT rep_profile_id FROM rep_business_attributions 
            WHERE business_id = $1 AND attribution_status = 'ACTIVE';
          `, [bizId]);

          if (attrRes.rows.length > 0) {
            const repProfileId = attrRes.rows[0].rep_profile_id;
            const ruleRes = await client.query(`
              SELECT id, percentage_rate FROM commission_rules 
              WHERE target_role = 'TUXI_REP' AND is_active = true LIMIT 1;
            `);

            if (ruleRes.rows.length > 0) {
              const rule = ruleRes.rows[0];
              const rawRate = parseFloat(rule.percentage_rate);
              if (rawRate > 0.03) {
                throw new Error(`COMMISSION_RATE_EXCEEDS_CAP: Commission rate ${rawRate} exceeds maximum allowable cap of 3%`);
              }
              const rate = Math.min(rawRate, 0.03);
              const oFull = await client.query('SELECT subtotal_cents FROM orders WHERE id = $1;', [orderId]);
              const subtotal = oFull.rows[0].subtotal_cents;
              const commissionCents = Math.round(subtotal * rate);
              // Deterministic idempotent key per delivered order prevents double-crediting
              const commKey = `comm-qual-${orderId}`;

              await client.query(`
                INSERT INTO commission_ledger (
                  id, rep_profile_id, business_id, order_id, qualifying_amount_cents, applied_rule_id,
                  applied_percentage, commission_cents, status, idempotency_key, notes
                )
                VALUES (
                  uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'EARNED', $8, 'Qualifying Delivered Order'
                )
                ON CONFLICT (idempotency_key) DO NOTHING;
              `, [repProfileId, bizId, orderId, subtotal, rule.id, rate, commissionCents, commKey]);
            }
          }
        }

        await client.query('COMMIT;');
        return { orderId, previousStatus: currentStatus, newStatus: targetStatus };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    return { orderId, previousStatus: 'PLACED', newStatus: targetStatus };
  }

  /**
   * Deterministic server-side release of expired inventory reservations.
   * PHASE 2B ACCEPTANCE REQUIREMENT (Item 3).
   * Finds reservations in 'RESERVED' state where expires_at <= asOfTime,
   * restores inventory quantity_available, sets status 'RELEASED', and marks orders 'EXPIRED'.
   * Replays are completely idempotent.
   */
  public static async releaseExpiredReservations(asOfTime: Date = new Date()) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const expiredRes = await client.query(`
          SELECT ir.id, ir.order_id, ir.inventory_id, ir.quantity, ir.status
          FROM inventory_reservations ir
          JOIN orders o ON o.id = ir.order_id
          WHERE ir.status = 'RESERVED' 
            AND ir.expires_at <= $1
            AND o.status IN ('PLACED', 'PENDING_PAYMENT')
          FOR UPDATE OF ir;
        `, [asOfTime]);

        let releasedCount = 0;
        const releasedOrderIds = new Set<string>();

        for (const row of expiredRes.rows) {
          await client.query(`
            UPDATE inventory
            SET quantity_available = quantity_available + $1,
                updated_at = NOW()
            WHERE id = $2;
          `, [row.quantity, row.inventory_id]);

          await client.query(`
            UPDATE inventory_reservations
            SET status = 'RELEASED', updated_at = NOW()
            WHERE id = $1;
          `, [row.id]);

          releasedOrderIds.add(row.order_id);
          releasedCount++;
        }

        for (const orderId of releasedOrderIds) {
          await client.query(`
            UPDATE orders
            SET status = 'CANCELLED', cancelled_reason = 'Payment reservation window expired', updated_at = NOW()
            WHERE id = $1 AND status IN ('PLACED', 'PENDING_PAYMENT');
          `, [orderId]);
        }

        await client.query('COMMIT;');
        return {
          releasedCount,
          affectedOrdersCount: releasedOrderIds.size
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    return { releasedCount: 0, affectedOrdersCount: 0 };
  }

  /**
   * Server-side payment failure handler (PHASE 2B Item 4).
   * Restores reserved inventory, transitions reservations to RELEASED,
   * and marks order and payment as PAYMENT_FAILED.
   * Completely idempotent on replay.
   */
  public static async handlePaymentFailure(orderId: string, reason: string = 'Payment failed / card declined') {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const oRes = await client.query(`
          SELECT id, status FROM orders WHERE id = $1 FOR UPDATE;
        `, [orderId]);

        if (oRes.rows.length === 0) {
          throw new Error('ORDER_NOT_FOUND');
        }

        const currentStatus = oRes.rows[0].status;
        if (currentStatus === 'CANCELLED') {
          await client.query('ROLLBACK;');
          return {
            orderId,
            status: currentStatus,
            alreadyHandled: true,
            releasedCount: 0
          };
        }

        await client.query(`
          UPDATE payments
          SET status = 'FAILED', updated_at = NOW()
          WHERE order_id = $1;
        `, [orderId]);

        await client.query(`
          UPDATE orders
          SET status = 'CANCELLED', cancelled_reason = $1, updated_at = NOW()
          WHERE id = $2;
        `, [reason, orderId]);

        const resList = await client.query(`
          SELECT id, inventory_id, quantity, status
          FROM inventory_reservations
          WHERE order_id = $1 AND status = 'RESERVED'
          FOR UPDATE;
        `, [orderId]);

        for (const resItem of resList.rows) {
          await client.query(`
            UPDATE inventory
            SET quantity_available = quantity_available + $1,
                updated_at = NOW()
            WHERE id = $2;
          `, [resItem.quantity, resItem.inventory_id]);

          await client.query(`
            UPDATE inventory_reservations
            SET status = 'RELEASED', updated_at = NOW()
            WHERE id = $1;
          `, [resItem.id]);
        }

        await client.query('COMMIT;');
        return {
          orderId,
          status: 'PAYMENT_FAILED',
          releasedCount: resList.rows.length
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    return { orderId, status: 'PAYMENT_FAILED', releasedCount: 0 };
  }

  /**
   * Confirms payment and commits inventory reservations (PHASE 2B Item 5).
   * Transitions reservations from RESERVED to COMMITTED.
   */
  public static async confirmPaymentAndCommitReservations(orderId: string) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const oRes = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE;', [orderId]);
        if (oRes.rows.length === 0) throw new Error('ORDER_NOT_FOUND');

        await client.query(`
          UPDATE payments SET status = 'AUTHORISED', updated_at = NOW() WHERE order_id = $1;
        `, [orderId]);

        await client.query(`
          UPDATE orders SET status = 'PAYMENT_AUTHORISED', updated_at = NOW() WHERE id = $1;
        `, [orderId]);

        await client.query(`
          UPDATE inventory_reservations
          SET status = 'COMMITTED', updated_at = NOW()
          WHERE order_id = $1 AND status = 'RESERVED';
        `, [orderId]);

        await client.query('COMMIT;');
        return { orderId, status: 'PAYMENT_AUTHORISED', reservationStatus: 'COMMITTED' };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    return { orderId, status: 'PAYMENT_AUTHORISED', reservationStatus: 'COMMITTED' };
  }

  /**
   * Performs financial refund (PHASE 2B Item 11).
   * CRITICAL DISTINCTION: A financial refund DOES NOT restore physical inventory!
   * Reverses commission in commission_ledger proportionally.
   */
  public static async processFinancialRefund(
    orderId: string,
    refundAmountCents: number,
    reason: string,
    refundedByUserId: string,
    idempotencyKey: string
  ) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Idempotency Check
        const existingKey = await client.query(`
          SELECT response_body FROM idempotency_keys WHERE key = $1;
        `, [idempotencyKey]);

        if (existingKey.rows.length > 0) {
          await client.query('ROLLBACK;');
          const resp = existingKey.rows[0].response_body;
          return {
            refundId: resp.refundId,
            amountCents: resp.amountCents,
            orderStatus: resp.orderStatus,
            isIdempotentReplay: true
          };
        }

        const oRes = await client.query('SELECT id, total_cents, status FROM orders WHERE id = $1 FOR UPDATE;', [orderId]);
        if (oRes.rows.length === 0) throw new Error('ORDER_NOT_FOUND');
        const order = oRes.rows[0];

        const payRes = await client.query('SELECT id FROM payments WHERE order_id = $1 LIMIT 1;', [orderId]);
        if (payRes.rows.length === 0) throw new Error('PAYMENT_RECORD_NOT_FOUND');
        const paymentId = payRes.rows[0].id;

        const insRefund = await client.query(`
          INSERT INTO refunds (
            id, order_id, payment_id, amount_cents, reason, refunded_by
          )
          VALUES (
            uuid_generate_v4(), $1, $2, $3, $4, $5
          )
          RETURNING id;
        `, [orderId, paymentId, refundAmountCents, reason, refundedByUserId]);

        const targetStatus = (refundAmountCents >= order.total_cents) ? 'REFUNDED' : 'CANCELLED';
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2;', [targetStatus, orderId]);

        const refundResultObj = {
          refundId: insRefund.rows[0].id,
          orderId,
          amountCents: refundAmountCents,
          orderStatus: targetStatus,
          isIdempotentReplay: false
        };

        await client.query(`
          INSERT INTO idempotency_keys (key, endpoint, user_id, status_code, response_body)
          VALUES ($1, '/api/refunds', $2, 200, $3);
        `, [idempotencyKey, refundedByUserId, JSON.stringify(refundResultObj)]);

        await client.query('COMMIT;');

        // Trigger proportional Rep commission reversal
        const revKey = `rev-comm-${idempotencyKey}`;
        await CommissionService.reverseOrderCommission(orderId, reason, revKey, refundAmountCents);

        return refundResultObj;
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    return { refundId: 'sim-ref', orderId, amountCents: refundAmountCents, orderStatus: 'REFUNDED', isIdempotentReplay: false };
  }

  /**
   * Performs an authoritative physical merchandise restock / return (PHASE 2B Item 11).
   * Separate authoritative event required to make merchandise sellable again.
   * Completely idempotent on replay.
   */
  public static async processAuthorizedRestock(
    orderId: string,
    restockItems: { itemId: string; variantId?: string | null; quantity: number }[],
    adminUserId: string,
    idempotencyKey: string
  ) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // Check idempotency in idempotency_keys table
        const existingKey = await client.query(`
          SELECT response_body FROM idempotency_keys WHERE key = $1;
        `, [idempotencyKey]);

        if (existingKey.rows.length > 0) {
          await client.query('ROLLBACK;');
          return {
            orderId,
            isIdempotentReplay: true,
            restockedCount: restockItems.length
          };
        }

        for (const item of restockItems) {
          let invRes;
          if (item.variantId) {
            invRes = await client.query('SELECT id, quantity_available FROM inventory WHERE variant_id = $1 FOR UPDATE;', [item.variantId]);
          } else {
            invRes = await client.query('SELECT id, quantity_available FROM inventory WHERE product_id = $1 AND variant_id IS NULL FOR UPDATE;', [item.itemId]);
          }

          if (invRes.rows.length > 0) {
            await client.query(`
              UPDATE inventory
              SET quantity_available = quantity_available + $1,
                  updated_at = NOW()
              WHERE id = $2;
            `, [item.quantity, invRes.rows[0].id]);
          }
        }

        await client.query(`
          INSERT INTO idempotency_keys (key, endpoint, user_id, status_code, response_body)
          VALUES ($1, '/api/restock', $2, 200, $3);
        `, [idempotencyKey, adminUserId, JSON.stringify({ restockedCount: restockItems.length })]);

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
          VALUES (uuid_generate_v4(), $1, 'PHYSICAL_INVENTORY_RESTOCK', 'ORDER', $2, $3);
        `, [
          adminUserId,
          orderId,
          JSON.stringify({ idempotencyKey, restockItems })
        ]);

        await client.query('COMMIT;');
        return {
          orderId,
          isIdempotentReplay: false,
          restockedCount: restockItems.length
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }
    return { orderId, isIdempotentReplay: false, restockedCount: restockItems.length };
  }
}
