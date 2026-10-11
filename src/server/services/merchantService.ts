import { postgresAdapter } from '../db/postgres.js';
import crypto from 'crypto';

export interface MerchantAccessResult {
  authorized: boolean;
  role: 'OWNER' | 'MANAGER' | 'ORDER_STAFF' | 'CATALOGUE_STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  businessId: string;
  businessName: string;
  businessType: 'EATS' | 'SHOP' | 'COURIER_HUB';
}

export interface InventoryAdjustmentInput {
  inventoryId?: string;
  productId?: string;
  variantId?: string;
  adjustmentType: 'RESTOCK' | 'CORRECTION' | 'DAMAGE' | 'LOSS' | 'RETURN_TO_STOCK';
  quantityDelta: number;
  reason?: string;
  idempotencyKey?: string;
}

export interface CreatePromotionInput {
  code: string;
  title: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minOrderSubtotalCents?: number;
  maxDiscountCents?: number;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive?: boolean;
}

export class MerchantService {
  /**
   * 1. AUTHORIZATION & MULTI-BUSINESS ISOLATION GATE (2E.1, 2E.9)
   * Enforces strict RBAC and multi-business isolation:
   * - System ADMIN / SUPER_ADMIN have overall operational authority
   * - Business Owners (in business_owners table)
   * - Staff members (in business_staff table with specific staff_role)
   * Blocks any unauthorized cross-business IDOR attempts.
   */
  public static async verifyMerchantAccess(
    userId: string,
    businessId: string,
    allowedRoles?: string[]
  ): Promise<MerchantAccessResult> {
    const client = await postgresAdapter.pool.connect();
    try {
      // 1. Verify business exists
      const bizRes = await client.query(`
        SELECT id, name, type, status, is_active FROM businesses WHERE id = $1;
      `, [businessId]);

      if (bizRes.rows.length === 0) {
        throw new Error('BUSINESS_NOT_FOUND: Specified business does not exist');
      }
      const biz = bizRes.rows[0];

      // 2. Check system admin / super admin
      const adminRes = await client.query(`
        SELECT role FROM user_roles 
        WHERE user_id = $1 AND role IN ('ADMIN', 'SUPER_ADMIN');
      `, [userId]);

      if (adminRes.rows.length > 0) {
        return {
          authorized: true,
          role: adminRes.rows[0].role as any,
          businessId: biz.id,
          businessName: biz.name,
          businessType: biz.type
        };
      }

      // 3. Check business_owners table
      const ownerRes = await client.query(`
        SELECT id, is_primary_owner FROM business_owners 
        WHERE business_id = $1 AND user_id = $2;
      `, [businessId, userId]);

      if (ownerRes.rows.length > 0) {
        return {
          authorized: true,
          role: 'OWNER',
          businessId: biz.id,
          businessName: biz.name,
          businessType: biz.type
        };
      }

      // 4. Check business_staff table
      const staffRes = await client.query(`
        SELECT staff_role FROM business_staff 
        WHERE business_id = $1 AND user_id = $2;
      `, [businessId, userId]);

      if (staffRes.rows.length > 0) {
        const staffRole = staffRes.rows[0].staff_role;
        if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(staffRole)) {
          throw new Error(`INSUFFICIENT_STAFF_PERMISSIONS: Role ${staffRole} not authorized for this operation`);
        }
        return {
          authorized: true,
          role: staffRole,
          businessId: biz.id,
          businessName: biz.name,
          businessType: biz.type
        };
      }

      // Check legacy user_roles for TUXI_EATS_OWNER / TUXI_SHOP_OWNER if linked
      const userBizRole = await client.query(`
        SELECT role FROM user_roles 
        WHERE user_id = $1 AND role IN ('TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER');
      `, [userId]);

      if (userBizRole.rows.length > 0) {
        // If they have the role, auto-link to business_owners if unassigned or verify
        const checkAnyOwner = await client.query(`SELECT 1 FROM business_owners WHERE business_id = $1;`, [businessId]);
        if (checkAnyOwner.rows.length === 0) {
          await client.query(`
            INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
            VALUES (uuid_generate_v4(), $1, $2, true)
            ON CONFLICT (business_id, user_id) DO NOTHING;
          `, [businessId, userId]);
          return {
            authorized: true,
            role: 'OWNER',
            businessId: biz.id,
            businessName: biz.name,
            businessType: biz.type
          };
        }
      }

      throw new Error('FORBIDDEN_MERCHANT_ACCESS: User has no operational authority over this business');
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all businesses the user has authority to manage.
   */
  public static async getMerchantBusinesses(userId: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        SELECT DISTINCT 
          b.id, b.name, b.type, b.status, b.operational_status, 
          b.operational_notes, b.prep_time_minutes, b.is_active,
          b.contact_email, b.contact_phone,
          COALESCE(bo.is_primary_owner, false) as is_owner,
          bs.staff_role
        FROM businesses b
        LEFT JOIN business_owners bo ON bo.business_id = b.id AND bo.user_id = $1
        LEFT JOIN business_staff bs ON bs.business_id = b.id AND bs.user_id = $1
        LEFT JOIN user_roles ur ON ur.user_id = $1 AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        WHERE bo.user_id = $1 OR bs.user_id = $1 OR ur.role IS NOT NULL
        ORDER BY b.name ASC;
      `, [userId]);

      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * 2. OPERATIONAL DASHBOARD & STATUS (2E.2)
   */
  public static async getDashboard(userId: string, businessId: string) {
    const access = await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      // 1. Business basic info
      const bizRes = await client.query(`
        SELECT 
          b.id, b.name, b.type, b.status, b.operational_status, 
          b.operational_notes, b.prep_time_minutes, b.version,
          a.street_line_1, a.city, a.postal_code
        FROM businesses b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.id = $1;
      `, [businessId]);
      const biz = bizRes.rows[0];

      // 2. Active orders breakdown
      const ordersRes = await client.query(`
        SELECT status, COUNT(*)::int as count
        FROM orders
        WHERE business_id = $1
        GROUP BY status;
      `, [businessId]);

      const counts: Record<string, number> = {
        PLACED: 0,
        ACCEPTED: 0,
        PREPARING: 0,
        READY_FOR_PICKUP: 0,
        DRIVER_ASSIGNED: 0,
        OUT_FOR_DELIVERY: 0,
        IN_TRANSIT: 0,
        DELIVERED: 0,
        CANCELLED: 0
      };

      for (const row of ordersRes.rows) {
        counts[row.status] = row.count;
      }

      // 3. Today's sales performance
      const salesRes = await client.query(`
        SELECT 
          COALESCE(SUM(subtotal_cents), 0)::int as gross_subtotal_cents,
          COALESCE(SUM(total_cents), 0)::int as gross_total_cents,
          COUNT(*)::int as total_orders
        FROM orders
        WHERE business_id = $1 
          AND status = 'DELIVERED'
          AND created_at >= CURRENT_DATE;
      `, [businessId]);

      // 4. Low stock count for shops
      let lowStockCount = 0;
      if (biz.type === 'SHOP') {
        const invRes = await client.query(`
          SELECT COUNT(*)::int as low_stock_count
          FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE p.business_id = $1 AND i.quantity_available <= 5;
        `, [businessId]);
        lowStockCount = invRes.rows[0]?.low_stock_count || 0;
      }

      // 5. Active promotions count
      const promoRes = await client.query(`
        SELECT COUNT(*)::int as active_promos
        FROM promotions
        WHERE business_id = $1 AND is_active = true AND starts_at <= NOW() AND ends_at >= NOW();
      `, [businessId]);

      return {
        business: {
          id: biz.id,
          name: biz.name,
          type: biz.type,
          status: biz.status,
          operationalStatus: biz.operational_status,
          operationalNotes: biz.operational_notes,
          prepTimeMinutes: biz.prep_time_minutes,
          version: biz.version,
          address: `${biz.street_line_1}, ${biz.city}`
        },
        userRole: access.role,
        orderCounts: {
          incomingPlaced: counts.PLACED,
          inPreparation: counts.ACCEPTED + counts.PREPARING,
          readyForPickup: counts.READY_FOR_PICKUP,
          outForDelivery: counts.DRIVER_ASSIGNED + counts.OUT_FOR_DELIVERY + counts.IN_TRANSIT,
          deliveredToday: counts.DELIVERED,
          cancelledToday: counts.CANCELLED,
          totalActive: counts.PLACED + counts.ACCEPTED + counts.PREPARING + counts.READY_FOR_PICKUP + counts.DRIVER_ASSIGNED + counts.OUT_FOR_DELIVERY + counts.IN_TRANSIT
        },
        todaySales: {
          grossSubtotalCents: salesRes.rows[0]?.gross_subtotal_cents || 0,
          grossTotalCents: salesRes.rows[0]?.gross_total_cents || 0,
          completedOrdersCount: salesRes.rows[0]?.total_orders || 0,
          averageOrderValueCents: salesRes.rows[0]?.total_orders > 0 
            ? Math.round(salesRes.rows[0].gross_subtotal_cents / salesRes.rows[0].total_orders) 
            : 0
        },
        lowStockItemsCount: lowStockCount,
        activePromotionsCount: promoRes.rows[0]?.active_promos || 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Updates merchant operational status (OPEN, PAUSED, CLOSED), prep time, notes.
   */
  public static async updateOperationalStatus(
    userId: string,
    businessId: string,
    input: {
      operationalStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
      operationalNotes?: string;
      prepTimeMinutes?: number;
    },
    ipAddress?: string,
    userAgent?: string
  ) {
    const access = await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      const curBiz = await client.query('SELECT operational_status, version FROM businesses WHERE id = $1 FOR UPDATE;', [businessId]);
      if (curBiz.rows.length === 0) {
        throw new Error('BUSINESS_NOT_FOUND');
      }

      const beforeState = curBiz.rows[0];

      const updateRes = await client.query(`
        UPDATE businesses
        SET 
          operational_status = $1,
          operational_notes = COALESCE($2, operational_notes),
          prep_time_minutes = COALESCE($3, prep_time_minutes),
          version = version + 1,
          updated_at = NOW()
        WHERE id = $4
        RETURNING operational_status, operational_notes, prep_time_minutes, version;
      `, [
        input.operationalStatus,
        input.operationalNotes !== undefined ? input.operationalNotes : null,
        input.prepTimeMinutes !== undefined ? input.prepTimeMinutes : null,
        businessId
      ]);

      const afterState = updateRes.rows[0];

      // Audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, ip_address, user_agent, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'MERCHANT_OPERATIONAL_STATUS_UPDATE', 'BUSINESS', $2, $3, $4, $5, $6);
      `, [
        userId,
        businessId,
        ipAddress || '127.0.0.1',
        userAgent || 'tuxi-merchant-ops',
        JSON.stringify(beforeState),
        JSON.stringify(afterState)
      ]);

      await client.query('COMMIT;');

      return {
        businessId,
        ...afterState
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 3. MENU MANAGEMENT & OPTIMISTIC CONCURRENCY FOR EATS (2E.3)
   */
  public static async getMenu(userId: string, businessId: string) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      const catsRes = await client.query(`
        SELECT id, name, sort_order, is_active
        FROM menu_categories
        WHERE business_id = $1
        ORDER BY sort_order ASC, name ASC;
      `, [businessId]);

      const itemsRes = await client.query(`
        SELECT 
          mi.id, mi.category_id, mi.name, mi.description, mi.base_price_cents,
          mi.currency, mi.is_available, mi.dietary_flags, mi.allergens,
          mi.image_url, mi.version, mi.updated_at
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mc.business_id = $1
        ORDER BY mi.name ASC;
      `, [businessId]);

      const modsRes = await client.query(`
        SELECT 
          mim.id, mim.menu_item_id, mim.group_name, mim.name, mim.extra_price_cents
        FROM menu_item_modifiers mim
        JOIN menu_items mi ON mi.id = mim.menu_item_id
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mc.business_id = $1
        ORDER BY mim.group_name ASC, mim.name ASC;
      `, [businessId]);

      const modifiersByItem: Record<string, any[]> = {};
      for (const m of modsRes.rows) {
        if (!modifiersByItem[m.menu_item_id]) modifiersByItem[m.menu_item_id] = [];
        modifiersByItem[m.menu_item_id].push({
          id: m.id,
          groupName: m.group_name,
          name: m.name,
          extraPriceCents: m.extra_price_cents
        });
      }

      const itemsByCategory: Record<string, any[]> = {};
      for (const item of itemsRes.rows) {
        if (!itemsByCategory[item.category_id]) itemsByCategory[item.category_id] = [];
        itemsByCategory[item.category_id].push({
          id: item.id,
          categoryId: item.category_id,
          name: item.name,
          description: item.description,
          basePriceCents: item.base_price_cents,
          currency: item.currency,
          isAvailable: item.is_available,
          dietaryFlags: item.dietary_flags || [],
          allergens: item.allergens || [],
          imageUrl: item.image_url,
          version: item.version,
          updatedAt: item.updated_at,
          modifiers: modifiersByItem[item.id] || []
        });
      }

      return catsRes.rows.map(cat => ({
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sort_order,
        isActive: cat.is_active,
        items: itemsByCategory[cat.id] || []
      }));
    } finally {
      client.release();
    }
  }

  public static async createMenuCategory(
    userId: string,
    businessId: string,
    input: { name: string; sortOrder?: number }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        INSERT INTO menu_categories (id, business_id, name, sort_order, is_active)
        VALUES (uuid_generate_v4(), $1, $2, COALESCE($3, 0), true)
        RETURNING id, business_id, name, sort_order, is_active;
      `, [businessId, input.name, input.sortOrder || 0]);
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  public static async updateMenuCategory(
    userId: string,
    businessId: string,
    categoryId: string,
    input: { name?: string; sortOrder?: number; isActive?: boolean }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        UPDATE menu_categories
        SET 
          name = COALESCE($1, name),
          sort_order = COALESCE($2, sort_order),
          is_active = COALESCE($3, is_active)
        WHERE id = $4 AND business_id = $5
        RETURNING id, business_id, name, sort_order, is_active;
      `, [
        input.name !== undefined ? input.name : null,
        input.sortOrder !== undefined ? input.sortOrder : null,
        input.isActive !== undefined ? input.isActive : null,
        categoryId,
        businessId
      ]);

      if (res.rows.length === 0) {
        throw new Error('CATEGORY_NOT_FOUND: Category not found for this business');
      }
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  public static async deleteMenuCategory(userId: string, businessId: string, categoryId: string) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        DELETE FROM menu_categories WHERE id = $1 AND business_id = $2 RETURNING id;
      `, [categoryId, businessId]);
      if (res.rows.length === 0) {
        throw new Error('CATEGORY_NOT_FOUND');
      }
      return { success: true, deletedCategoryId: categoryId };
    } finally {
      client.release();
    }
  }

  public static async createMenuItem(
    userId: string,
    businessId: string,
    input: {
      categoryId: string;
      name: string;
      description?: string;
      basePriceCents: number;
      currency?: string;
      isAvailable?: boolean;
      dietaryFlags?: string[];
      allergens?: string[];
      imageUrl?: string;
      modifiers?: Array<{ groupName: string; name: string; extraPriceCents: number }>;
    }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // Verify category belongs to business
      const catCheck = await client.query(`SELECT id FROM menu_categories WHERE id = $1 AND business_id = $2;`, [input.categoryId, businessId]);
      if (catCheck.rows.length === 0) {
        throw new Error('CATEGORY_NOT_FOUND: Category does not belong to this business');
      }

      const itemRes = await client.query(`
        INSERT INTO menu_items (
          id, category_id, name, description, base_price_cents, currency,
          is_available, dietary_flags, allergens, image_url, version, updated_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW()
        )
        RETURNING *;
      `, [
        input.categoryId,
        input.name,
        input.description || null,
        input.basePriceCents,
        input.currency || 'ZAR',
        input.isAvailable !== false,
        input.dietaryFlags || [],
        input.allergens || [],
        input.imageUrl || null
      ]);

      const item = itemRes.rows[0];

      if (input.modifiers && input.modifiers.length > 0) {
        for (const mod of input.modifiers) {
          await client.query(`
            INSERT INTO menu_item_modifiers (id, menu_item_id, group_name, name, extra_price_cents)
            VALUES (uuid_generate_v4(), $1, $2, $3, $4);
          `, [item.id, mod.groupName, mod.name, mod.extraPriceCents || 0]);
        }
      }

      await client.query('COMMIT;');
      return item;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Updates menu item with OPTIMISTIC CONCURRENCY LOCKING (2E.10).
   * If expectedVersion is specified and does not match current version,
   * rejects with CONCURRENT_MODIFICATION_DETECTED.
   */
  public static async updateMenuItem(
    userId: string,
    businessId: string,
    menuItemId: string,
    input: {
      name?: string;
      description?: string;
      basePriceCents?: number;
      isAvailable?: boolean;
      dietaryFlags?: string[];
      allergens?: string[];
      imageUrl?: string;
      categoryId?: string;
      expectedVersion?: number;
    }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      // 1. Fetch item with lock to verify business ownership & version
      const itemCheck = await client.query(`
        SELECT mi.id, mi.version, mc.business_id
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mi.id = $1 FOR UPDATE;
      `, [menuItemId]);

      if (itemCheck.rows.length === 0 || itemCheck.rows[0].business_id !== businessId) {
        throw new Error('MENU_ITEM_NOT_FOUND: Item not found for this business');
      }

      const currentVersion = itemCheck.rows[0].version;

      // Optimistic concurrency check
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new Error(`CONCURRENT_MODIFICATION_DETECTED: Menu item version mismatch. Expected ${input.expectedVersion}, but found ${currentVersion}`);
      }

      // 2. Perform atomic update and increment version
      const updateRes = await client.query(`
        UPDATE menu_items
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          base_price_cents = COALESCE($3, base_price_cents),
          is_available = COALESCE($4, is_available),
          dietary_flags = COALESCE($5, dietary_flags),
          allergens = COALESCE($6, allergens),
          image_url = COALESCE($7, image_url),
          category_id = COALESCE($8, category_id),
          version = version + 1,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *;
      `, [
        input.name !== undefined ? input.name : null,
        input.description !== undefined ? input.description : null,
        input.basePriceCents !== undefined ? input.basePriceCents : null,
        input.isAvailable !== undefined ? input.isAvailable : null,
        input.dietaryFlags !== undefined ? input.dietaryFlags : null,
        input.allergens !== undefined ? input.allergens : null,
        input.imageUrl !== undefined ? input.imageUrl : null,
        input.categoryId !== undefined ? input.categoryId : null,
        menuItemId
      ]);

      await client.query('COMMIT;');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 86 Toggle: Immediately toggle item availability on or off.
   */
  public static async toggleMenuItemAvailability(
    userId: string,
    businessId: string,
    menuItemId: string,
    isAvailable: boolean
  ) {
    return this.updateMenuItem(userId, businessId, menuItemId, { isAvailable });
  }

  public static async deleteMenuItem(userId: string, businessId: string, menuItemId: string) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        DELETE FROM menu_items mi
        USING menu_categories mc
        WHERE mi.id = $1 AND mi.category_id = mc.id AND mc.business_id = $2
        RETURNING mi.id;
      `, [menuItemId, businessId]);

      if (res.rows.length === 0) {
        throw new Error('MENU_ITEM_NOT_FOUND');
      }
      return { success: true, deletedMenuItemId: menuItemId };
    } finally {
      client.release();
    }
  }

  /**
   * 4. PRODUCT & INVENTORY MANAGEMENT FOR SHOP (2E.3, 2E.4)
   */
  public static async getProducts(userId: string, businessId: string) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        SELECT 
          p.id, p.sku, p.name, p.description, p.price_cents, p.sale_price_cents,
          p.is_on_sale, p.is_available, p.category, p.image_url, p.version,
          p.is_active, p.created_at, p.updated_at,
          COALESCE(i.quantity_available, 0) as stock,
          COALESCE(i.reserved_quantity, 0) as reserved_stock,
          i.id as inventory_id
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
        WHERE p.business_id = $1
        ORDER BY p.name ASC;
      `, [businessId]);

      const variantsRes = await client.query(`
        SELECT 
          pv.id, pv.product_id, pv.variant_sku, pv.variant_name, pv.price_delta_cents,
          pv.sale_price_cents, pv.is_available, pv.attributes,
          COALESCE(i.quantity_available, 0) as stock,
          COALESCE(i.reserved_quantity, 0) as reserved_stock,
          i.id as inventory_id
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN inventory i ON i.variant_id = pv.id
        WHERE p.business_id = $1
        ORDER BY pv.variant_name ASC;
      `, [businessId]);

      const variantsByProd: Record<string, any[]> = {};
      for (const v of variantsRes.rows) {
        if (!variantsByProd[v.product_id]) variantsByProd[v.product_id] = [];
        variantsByProd[v.product_id].push(v);
      }

      return res.rows.map(prod => ({
        ...prod,
        variants: variantsByProd[prod.id] || []
      }));
    } finally {
      client.release();
    }
  }

  public static async createProduct(
    userId: string,
    businessId: string,
    input: {
      sku: string;
      name: string;
      description?: string;
      priceCents: number;
      salePriceCents?: number;
      isOnSale?: boolean;
      isAvailable?: boolean;
      category?: string;
      initialStock?: number;
      imageUrl?: string;
      variants?: Array<{
        variantSku: string;
        variantName: string;
        priceDeltaCents: number;
        initialStock?: number;
        attributes?: any;
      }>;
    }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      const prodRes = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, price_cents, sale_price_cents,
          is_on_sale, is_available, category, image_url, version, is_active, created_at, updated_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, true, NOW(), NOW()
        )
        RETURNING *;
      `, [
        businessId,
        input.sku,
        input.name,
        input.description || null,
        input.priceCents,
        input.salePriceCents || null,
        !!input.isOnSale,
        input.isAvailable !== false,
        input.category || 'General',
        input.imageUrl || null
      ]);

      const product = prodRes.rows[0];

      // Insert base inventory
      const initialStock = Math.max(0, input.initialStock || 0);
      const invRes = await client.query(`
        INSERT INTO inventory (id, product_id, variant_id, quantity_available, reserved_quantity, updated_at)
        VALUES (uuid_generate_v4(), $1, NULL, $2, 0, NOW())
        RETURNING id;
      `, [product.id, initialStock]);

      // If initial stock was added, log initial adjustment
      if (initialStock > 0) {
        await client.query(`
          INSERT INTO inventory_adjustments (
            id, inventory_id, business_id, actor_id, adjustment_type, quantity_delta,
            previous_quantity, new_quantity, reason
          )
          VALUES (uuid_generate_v4(), $1, $2, $3, 'RESTOCK', $4, 0, $4, 'Initial stock entry');
        `, [invRes.rows[0].id, businessId, userId, initialStock]);
      }

      // Insert variants if provided
      if (input.variants && input.variants.length > 0) {
        for (const v of input.variants) {
          const varRes = await client.query(`
            INSERT INTO product_variants (
              id, product_id, variant_sku, variant_name, price_delta_cents, attributes, is_available
            )
            VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, true)
            RETURNING id;
          `, [product.id, v.variantSku, v.variantName, v.priceDeltaCents || 0, JSON.stringify(v.attributes || {})]);

          const varStock = Math.max(0, v.initialStock || 0);
          const varInvRes = await client.query(`
            INSERT INTO inventory (id, product_id, variant_id, quantity_available, reserved_quantity, updated_at)
            VALUES (uuid_generate_v4(), $1, $2, $3, 0, NOW())
            RETURNING id;
          `, [product.id, varRes.rows[0].id, varStock]);

          if (varStock > 0) {
            await client.query(`
              INSERT INTO inventory_adjustments (
                id, inventory_id, business_id, actor_id, adjustment_type, quantity_delta,
                previous_quantity, new_quantity, reason
              )
              VALUES (uuid_generate_v4(), $1, $2, $3, 'RESTOCK', $4, 0, $4, 'Initial variant stock entry');
            `, [varInvRes.rows[0].id, businessId, userId, varStock]);
          }
        }
      }

      await client.query('COMMIT;');
      return product;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async updateProduct(
    userId: string,
    businessId: string,
    productId: string,
    input: {
      name?: string;
      description?: string;
      priceCents?: number;
      salePriceCents?: number;
      isOnSale?: boolean;
      isAvailable?: boolean;
      category?: string;
      imageUrl?: string;
      expectedVersion?: number;
    }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      const curProd = await client.query(`
        SELECT id, version, business_id FROM products WHERE id = $1 FOR UPDATE;
      `, [productId]);

      if (curProd.rows.length === 0 || curProd.rows[0].business_id !== businessId) {
        throw new Error('PRODUCT_NOT_FOUND: Product not found for this business');
      }

      const currentVersion = curProd.rows[0].version;
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new Error(`CONCURRENT_MODIFICATION_DETECTED: Product version mismatch. Expected ${input.expectedVersion}, but found ${currentVersion}`);
      }

      const updateRes = await client.query(`
        UPDATE products
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          price_cents = COALESCE($3, price_cents),
          sale_price_cents = COALESCE($4, sale_price_cents),
          is_on_sale = COALESCE($5, is_on_sale),
          is_available = COALESCE($6, is_available),
          category = COALESCE($7, category),
          image_url = COALESCE($8, image_url),
          version = version + 1,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *;
      `, [
        input.name !== undefined ? input.name : null,
        input.description !== undefined ? input.description : null,
        input.priceCents !== undefined ? input.priceCents : null,
        input.salePriceCents !== undefined ? input.salePriceCents : null,
        input.isOnSale !== undefined ? input.isOnSale : null,
        input.isAvailable !== undefined ? input.isAvailable : null,
        input.category !== undefined ? input.category : null,
        input.imageUrl !== undefined ? input.imageUrl : null,
        productId
      ]);

      await client.query('COMMIT;');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async toggleProductAvailability(
    userId: string,
    businessId: string,
    productId: string,
    isAvailable: boolean
  ) {
    return this.updateProduct(userId, businessId, productId, { isAvailable });
  }

  /**
   * 5. AUDITABLE INVENTORY ADJUSTMENTS & RESTOCK (2E.4, 2E.10)
   * Enforces:
   * - Strict atomic row lock on inventory record
   * - Idempotency protection via idempotency_key
   * - Cannot adjust stock below zero
   * - Full audit log in inventory_adjustments table
   */
  public static async adjustInventory(
    userId: string,
    businessId: string,
    input: InventoryAdjustmentInput
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'CATALOGUE_STAFF', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      // 1. Idempotency Check
      if (input.idempotencyKey) {
        const existingAdj = await client.query(`
          SELECT * FROM inventory_adjustments WHERE idempotency_key = $1;
        `, [input.idempotencyKey]);

        if (existingAdj.rows.length > 0) {
          await client.query('COMMIT;');
          return {
            ...existingAdj.rows[0],
            isIdempotentReplay: true
          };
        }
      }

      // 2. Resolve and Lock inventory record
      let invRes: any;
      if (input.inventoryId) {
        invRes = await client.query(`
          SELECT i.id, i.product_id, i.quantity_available, i.reserved_quantity, p.business_id
          FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE i.id = $1 FOR UPDATE;
        `, [input.inventoryId]);
      } else if (input.variantId) {
        invRes = await client.query(`
          SELECT i.id, i.product_id, i.quantity_available, i.reserved_quantity, p.business_id
          FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE i.variant_id = $1 FOR UPDATE;
        `, [input.variantId]);
      } else if (input.productId) {
        invRes = await client.query(`
          SELECT i.id, i.product_id, i.quantity_available, i.reserved_quantity, p.business_id
          FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE i.product_id = $1 AND i.variant_id IS NULL FOR UPDATE;
        `, [input.productId]);
      } else {
        throw new Error('INVALID_INVENTORY_TARGET: Must specify inventoryId, productId, or variantId');
      }

      if (invRes.rows.length === 0 || invRes.rows[0].business_id !== businessId) {
        throw new Error('INVENTORY_NOT_FOUND: Inventory record not found for this business');
      }

      const inv = invRes.rows[0];
      const prevQty = inv.quantity_available;
      const newQty = prevQty + input.quantityDelta;

      if (newQty < 0) {
        throw new Error(`INSUFFICIENT_STOCK_TO_ADJUST: Cannot reduce stock by ${Math.abs(input.quantityDelta)}. Available stock is only ${prevQty}`);
      }

      // 3. Update inventory
      await client.query(`
        UPDATE inventory
        SET quantity_available = $1, updated_at = NOW()
        WHERE id = $2;
      `, [newQty, inv.id]);

      // 4. Record audit ledger entry
      const adjRes = await client.query(`
        INSERT INTO inventory_adjustments (
          id, inventory_id, business_id, actor_id, adjustment_type, quantity_delta,
          previous_quantity, new_quantity, reason, idempotency_key, created_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
        RETURNING *;
      `, [
        inv.id,
        businessId,
        userId,
        input.adjustmentType,
        input.quantityDelta,
        prevQty,
        newQty,
        input.reason || null,
        input.idempotencyKey || null
      ]);

      await client.query('COMMIT;');
      return adjRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves auditable inventory adjustment history.
   */
  public static async getInventoryAuditLedger(userId: string, businessId: string, limit: number = 50) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        SELECT 
          ia.id, ia.adjustment_type, ia.quantity_delta, ia.previous_quantity, ia.new_quantity,
          ia.reason, ia.idempotency_key, ia.created_at,
          p.name as product_name, p.sku as product_sku,
          u.first_name, u.last_name, u.email as actor_email
        FROM inventory_adjustments ia
        JOIN inventory i ON i.id = ia.inventory_id
        JOIN products p ON p.id = i.product_id
        JOIN users u ON u.id = ia.actor_id
        WHERE ia.business_id = $1
        ORDER BY ia.created_at DESC
        LIMIT $2;
      `, [businessId, limit]);

      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Identifies low stock items for reordering alerts.
   */
  public static async getLowStockAlerts(userId: string, businessId: string, threshold: number = 5) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        SELECT 
          p.id as product_id, p.name, p.sku, p.price_cents,
          i.id as inventory_id, i.quantity_available as current_stock,
          i.reserved_quantity,
          CASE 
            WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
            WHEN i.quantity_available <= 2 THEN 'CRITICAL'
            ELSE 'LOW_STOCK'
          END as urgency
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE p.business_id = $1 AND i.quantity_available <= $2
        ORDER BY i.quantity_available ASC;
      `, [businessId, threshold]);

      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * 6. ORDER WORKFLOWS & STATE MACHINE (2E.5, 2E.6)
   */
  public static async getOrders(
    userId: string,
    businessId: string,
    filters?: { status?: string; limit?: number }
  ) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      let query = `
        SELECT 
          o.id, o.order_number, o.order_type, o.status,
          o.subtotal_cents, o.delivery_fee_cents, o.service_fee_cents, o.tip_cents, o.total_cents,
          o.special_instructions, o.cancelled_reason, o.cancelled_at,
          o.ready_at, o.handoff_at, o.pickup_code, o.packed_item_ids,
          o.created_at, o.updated_at,
          a.street_line_1 as delivery_street, a.city as delivery_city,
          d.id as delivery_id, d.status as delivery_status,
          u_driver.first_name as driver_name, u_driver.phone_number as driver_phone
        FROM orders o
        LEFT JOIN addresses a ON a.id = o.delivery_address_id
        LEFT JOIN deliveries d ON d.order_id = o.id
        LEFT JOIN driver_profiles dp ON dp.id = d.driver_id
        LEFT JOIN users u_driver ON u_driver.id = dp.user_id
        WHERE o.business_id = $1
      `;
      const params: any[] = [businessId];

      if (filters?.status) {
        params.push(filters.status);
        query += ` AND o.status = $${params.length}`;
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1};`;
      params.push(filters?.limit || 50);

      const ordersRes = await client.query(query, params);

      // Fetch items for these orders
      const orderIds = ordersRes.rows.map(o => o.id);
      let itemsByOrder: Record<string, any[]> = {};

      if (orderIds.length > 0) {
        const itemsRes = await client.query(`
          SELECT 
            oi.id, oi.order_id, oi.item_type, oi.item_id, oi.quantity,
            oi.unit_price_cents, oi.total_cents as total_price_cents, oi.sku,
            COALESCE(oi.item_name, mi.name, p.name, 'Item') as item_name
          FROM order_items oi
          LEFT JOIN menu_items mi ON mi.id = oi.item_id AND oi.item_type = 'MENU_ITEM'
          LEFT JOIN products p ON p.id = oi.item_id AND oi.item_type = 'PRODUCT'
          WHERE oi.order_id = ANY($1)
          ORDER BY oi.id ASC;
        `, [orderIds]);

        for (const item of itemsRes.rows) {
          if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
          itemsByOrder[item.order_id].push(item);
        }
      }

      return ordersRes.rows.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        orderType: o.order_type,
        status: o.status,
        subtotalCents: o.subtotal_cents,
        deliveryFeeCents: o.delivery_fee_cents,
        tipCents: o.tip_cents,
        totalCents: o.total_cents,
        specialInstructions: o.special_instructions,
        cancelledReason: o.cancelled_reason,
        cancelledAt: o.cancelled_at,
        readyAt: o.ready_at,
        handoffAt: o.handoff_at,
        pickupCode: o.pickup_code,
        packedItemIds: o.packed_item_ids || [],
        createdAt: o.created_at,
        deliveryAddress: o.delivery_street ? `${o.delivery_street}, ${o.delivery_city}` : 'Delivery',
        deliveryStatus: o.delivery_status,
        driver: o.driver_name ? { name: o.driver_name, phone: o.driver_phone } : null,
        items: itemsByOrder[o.id] || []
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Merchant accepts incoming order: PLACED -> ACCEPTED / PREPARING.
   */
  public static async acceptOrder(
    userId: string,
    businessId: string,
    orderId: string,
    prepTimeMinutes?: number
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      // Business operational validation (2E.5)
      const bizRes = await client.query('SELECT status, is_active FROM businesses WHERE id = $1;', [businessId]);
      if (bizRes.rows.length === 0 || bizRes.rows[0].status !== 'APPROVED' || !bizRes.rows[0].is_active) {
        throw new Error(`BUSINESS_NOT_OPERATIONAL: Cannot operate on non-approved or inactive business (Status: ${bizRes.rows[0]?.status || 'UNKNOWN'})`);
      }

      const orderRes = await client.query(`
        SELECT id, status, business_id FROM orders WHERE id = $1 FOR UPDATE;
      `, [orderId]);

      if (orderRes.rows.length === 0 || orderRes.rows[0].business_id !== businessId) {
        throw new Error('ORDER_NOT_FOUND: Order not found for this business');
      }

      const currentStatus = orderRes.rows[0].status;
      if (currentStatus !== 'PLACED') {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot accept order from current status "${currentStatus}"`);
      }

      await client.query(`
        UPDATE orders
        SET status = 'PREPARING', updated_at = NOW()
        WHERE id = $1;
      `, [orderId]);

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'ORDER_ACCEPTED_FOR_PREP', 'ORDER', $2, '{"status":"PLACED"}', '{"status":"PREPARING"}');
      `, [userId, orderId]);

      await client.query('COMMIT;');
      return { success: true, orderId, status: 'PREPARING', prepTimeMinutes: prepTimeMinutes || 20 };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Merchant marks order as READY FOR PICKUP: PREPARING -> READY_FOR_PICKUP.
   * Generates secure Phase 2C cryptographic pickup proof code.
   */
  public static async markOrderReady(
    userId: string,
    businessId: string,
    orderId: string
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      // Business operational validation (2E.5)
      const bizRes = await client.query('SELECT status, is_active FROM businesses WHERE id = $1;', [businessId]);
      if (bizRes.rows.length === 0 || bizRes.rows[0].status !== 'APPROVED' || !bizRes.rows[0].is_active) {
        throw new Error(`BUSINESS_NOT_OPERATIONAL: Cannot operate on non-approved or inactive business`);
      }

      const orderRes = await client.query(`
        SELECT id, status, business_id FROM orders WHERE id = $1 FOR UPDATE;
      `, [orderId]);

      if (orderRes.rows.length === 0 || orderRes.rows[0].business_id !== businessId) {
        throw new Error('ORDER_NOT_FOUND: Order not found for this business');
      }

      const currentStatus = orderRes.rows[0].status;
      if (currentStatus !== 'PREPARING' && currentStatus !== 'ACCEPTED' && currentStatus !== 'PLACED') {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot mark ready from status "${currentStatus}"`);
      }

      // Unpaid production order fulfillment block (2B.6, 2E.5)
      if (process.env.NODE_ENV === 'production') {
        const payRes = await client.query('SELECT status FROM payments WHERE order_id = $1;', [orderId]);
        const payment = payRes.rows[0];
        const isPaid = payment && (payment.status === 'AUTHORISED' || payment.status === 'CAPTURED');
        if (!isPaid) {
          throw new Error('UNPAID_ORDER_FULFILLMENT_FORBIDDEN: Unpaid production orders cannot progress through fulfillment');
        }
      }

      // Cryptographically secure Phase 2C 6-digit pickup proof (2C.20, 2E.6)
      const pickupCode = String(crypto.randomInt(100000, 1000000));
      const pickupCodeHash = crypto.createHash('sha256').update(pickupCode).digest('hex');

      await client.query(`
        UPDATE orders
        SET 
          status = 'READY_FOR_PICKUP',
          ready_at = NOW(),
          pickup_code = $1,
          updated_at = NOW()
        WHERE id = $2;
      `, [pickupCode, orderId]);

      // If associated delivery exists, bind Phase 2C pickup_code_hash
      const delivCheck = await client.query(`
        SELECT id, pickup_code_hash FROM deliveries WHERE order_id = $1;
      `, [orderId]);

      if (delivCheck.rows.length > 0) {
        await client.query(`
          UPDATE deliveries 
          SET pickup_code_hash = $1, updated_at = NOW()
          WHERE order_id = $2;
        `, [pickupCodeHash, orderId]);
      }

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'ORDER_MARKED_READY', 'ORDER', $2, $3, $4);
      `, [userId, orderId, JSON.stringify({ status: currentStatus }), JSON.stringify({ status: 'READY_FOR_PICKUP', pickup_code: pickupCode })]);

      await client.query('COMMIT;');
      return { success: true, orderId, status: 'READY_FOR_PICKUP', pickupCode };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delivery handoff verification (2E.6):
   * Enforces cryptographic Phase 2C pickup proof validation: READY_FOR_PICKUP -> PICKED_UP / OUT_FOR_DELIVERY.
   */
  public static async handoffToCourier(
    userId: string,
    businessId: string,
    orderId: string,
    verification?: { pickupCode?: string; driverId?: string }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      // Business operational validation
      const bizRes = await client.query('SELECT status, is_active FROM businesses WHERE id = $1;', [businessId]);
      if (bizRes.rows.length === 0 || bizRes.rows[0].status !== 'APPROVED' || !bizRes.rows[0].is_active) {
        throw new Error(`BUSINESS_NOT_OPERATIONAL: Cannot operate on non-approved or inactive business`);
      }

      const orderRes = await client.query(`
        SELECT id, status, business_id, pickup_code FROM orders WHERE id = $1 FOR UPDATE;
      `, [orderId]);

      if (orderRes.rows.length === 0 || orderRes.rows[0].business_id !== businessId) {
        throw new Error('ORDER_NOT_FOUND: Order not found for this business');
      }

      const order = orderRes.rows[0];
      if (order.status !== 'READY_FOR_PICKUP' && order.status !== 'DRIVER_ASSIGNED') {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot handoff order in status "${order.status}"`);
      }

      // Unpaid production order fulfillment block
      if (process.env.NODE_ENV === 'production') {
        const payRes = await client.query('SELECT status FROM payments WHERE order_id = $1;', [orderId]);
        const payment = payRes.rows[0];
        const isPaid = payment && (payment.status === 'AUTHORISED' || payment.status === 'CAPTURED');
        if (!isPaid) {
          throw new Error('UNPAID_ORDER_FULFILLMENT_FORBIDDEN: Unpaid production orders cannot progress through fulfillment');
        }
      }

      // Phase 2C Cryptographic Pickup Proof Validation (2C.20, 2E.6)
      const delivRes = await client.query(`
        SELECT id, status, driver_id, pickup_code_hash, pickup_code_consumed
        FROM deliveries
        WHERE order_id = $1 FOR UPDATE;
      `, [orderId]);

      if (delivRes.rows.length > 0) {
        const deliv = delivRes.rows[0];
        if (deliv.pickup_code_consumed) {
          throw new Error('PROOF_ALREADY_CONSUMED: Pickup proof has already been verified and consumed');
        }
        if (verification?.pickupCode) {
          const providedHash = crypto.createHash('sha256').update(verification.pickupCode.trim()).digest('hex');
          if (deliv.pickup_code_hash && providedHash !== deliv.pickup_code_hash) {
            throw new Error('INVALID_PICKUP_PROOF: The provided pickup code does not match');
          }
        }
        await client.query(`
          UPDATE deliveries
          SET status = 'IN_TRANSIT', picked_up_at = NOW(), pickup_code_consumed = true, updated_at = NOW()
          WHERE id = $1;
        `, [deliv.id]);
      } else if (verification?.pickupCode && order.pickup_code) {
        if (verification.pickupCode.trim() !== order.pickup_code.trim()) {
          throw new Error('INVALID_PICKUP_PROOF: The provided pickup code does not match');
        }
      }

      await client.query(`
        UPDATE orders
        SET status = 'OUT_FOR_DELIVERY', handoff_at = NOW(), updated_at = NOW()
        WHERE id = $1;
      `, [orderId]);

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'ORDER_HANDOFF_TO_COURIER', 'ORDER', $2, $3, $4);
      `, [userId, orderId, JSON.stringify({ status: order.status }), JSON.stringify({ status: 'OUT_FOR_DELIVERY' })]);

      await client.query('COMMIT;');
      return { success: true, orderId, status: 'OUT_FOR_DELIVERY' };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Merchant rejects or cancels an order with mandatory reason code (2E.5).
   * Restores any reserved stock if applicable.
   */
  public static async rejectOrCancelOrder(
    userId: string,
    businessId: string,
    orderId: string,
    input: {
      reasonCode: 'OUT_OF_STOCK' | 'KITCHEN_OVERLOADED' | 'STORE_CLOSED' | 'SPECIAL_REQUEST_UNAVAILABLE' | 'OTHER';
      reasonText: string;
      onlyIfPlaced?: boolean;
    }
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ORDER_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      await client.query('BEGIN;');

      const orderRes = await client.query(`
        SELECT id, status, business_id, order_type FROM orders WHERE id = $1 FOR UPDATE;
      `, [orderId]);

      if (orderRes.rows.length === 0 || orderRes.rows[0].business_id !== businessId) {
        throw new Error('ORDER_NOT_FOUND: Order not found for this business');
      }

      const order = orderRes.rows[0];
      if (order.status === 'DELIVERED') {
        throw new Error('CANNOT_CANCEL_DELIVERED_ORDER: Completed order cannot be cancelled by merchant');
      }
      if (order.status === 'CANCELLED') {
        throw new Error('ORDER_ALREADY_CANCELLED: Order has already been cancelled');
      }
      if (input.onlyIfPlaced && order.status !== 'PLACED') {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot reject order from current status "${order.status}"`);
      }
      if (order.status !== 'PLACED' && order.status !== 'ACCEPTED' && order.status !== 'PREPARING') {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot cancel order in status "${order.status}"`);
      }

      const cancelReason = `[${input.reasonCode}] ${input.reasonText}`;

      await client.query(`
        UPDATE orders
        SET 
          status = 'CANCELLED',
          cancelled_reason = $1,
          cancelled_at = NOW(),
          updated_at = NOW()
        WHERE id = $2;
      `, [cancelReason, orderId]);

      // Release any inventory reservations
      const resvRes = await client.query(`
        SELECT id, inventory_id, quantity FROM inventory_reservations
        WHERE order_id = $1 AND status = 'RESERVED' FOR UPDATE;
      `, [orderId]);

      for (const r of resvRes.rows) {
        await client.query(`
          UPDATE inventory SET quantity_available = quantity_available + $1 WHERE id = $2;
        `, [r.quantity, r.inventory_id]);

        await client.query(`
          UPDATE inventory_reservations SET status = 'RELEASED', updated_at = NOW() WHERE id = $1;
        `, [r.id]);
      }

      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'ORDER_CANCELLED_BY_MERCHANT', 'ORDER', $2, $3, $4);
      `, [userId, orderId, JSON.stringify({ status: order.status }), JSON.stringify({ status: 'CANCELLED', reason: cancelReason })]);

      await client.query('COMMIT;');
      return { success: true, orderId, status: 'CANCELLED', reason: cancelReason };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Pick and pack checklist update for Shop orders.
   */
  public static async updatePickPackChecklist(
    userId: string,
    businessId: string,
    orderId: string,
    packedItemIds: string[]
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ORDER_STAFF', 'CATALOGUE_STAFF', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        UPDATE orders
        SET packed_item_ids = $1::jsonb, updated_at = NOW()
        WHERE id = $2 AND business_id = $3
        RETURNING id, packed_item_ids;
      `, [JSON.stringify(packedItemIds), orderId, businessId]);

      if (res.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND: Order not found for this business');
      }

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * 7. PROMOTIONS & MARKETING CAMPAIGNS (2E.7)
   */
  public static async getPromotions(userId: string, businessId: string) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        SELECT 
          id, business_id, code, title, description, discount_type, discount_value,
          min_order_subtotal_cents, max_discount_cents, starts_at, ends_at, is_active,
          created_at, updated_at,
          CASE 
            WHEN NOT is_active THEN 'INACTIVE'
            WHEN NOW() < starts_at THEN 'SCHEDULED'
            WHEN NOW() > ends_at THEN 'EXPIRED'
            ELSE 'ACTIVE'
          END as campaign_status
        FROM promotions
        WHERE business_id = $1
        ORDER BY created_at DESC;
      `, [businessId]);

      return res.rows;
    } finally {
      client.release();
    }
  }

  public static async createPromotion(
    userId: string,
    businessId: string,
    input: CreatePromotionInput
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const normCode = input.code.trim().toUpperCase();

      if (input.discountType === 'PERCENTAGE' && (input.discountValue <= 0 || input.discountValue > 100)) {
        throw new Error('INVALID_DISCOUNT_VALUE: Percentage discount must be between 1 and 100');
      }
      if (input.discountType === 'FIXED_AMOUNT' && input.discountValue <= 0) {
        throw new Error('INVALID_DISCOUNT_VALUE: Fixed amount discount must be greater than 0');
      }

      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      if (endsAt <= startsAt) {
        throw new Error('INVALID_DATE_RANGE: Promo end date must be after start date');
      }

      const res = await client.query(`
        INSERT INTO promotions (
          id, business_id, code, title, description, discount_type, discount_value,
          min_order_subtotal_cents, max_discount_cents, starts_at, ends_at, is_active, created_at, updated_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
        )
        RETURNING *;
      `, [
        businessId,
        normCode,
        input.title,
        input.description || null,
        input.discountType,
        input.discountValue,
        input.minOrderSubtotalCents || 0,
        input.maxDiscountCents || null,
        startsAt,
        endsAt,
        input.isActive !== false
      ]);

      return res.rows[0];
    } catch (err: any) {
      if (err.code === '23505' && err.constraint === 'uq_business_promo_code') {
        throw new Error(`DUPLICATE_PROMO_CODE: Promotion code "${input.code}" already exists for this business`);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public static async togglePromotion(
    userId: string,
    businessId: string,
    promotionId: string,
    isActive: boolean
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        UPDATE promotions
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2 AND business_id = $3
        RETURNING *;
      `, [isActive, promotionId, businessId]);

      if (res.rows.length === 0) {
        throw new Error('PROMOTION_NOT_FOUND: Promotion not found for this business');
      }
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Server-authoritative promotion evaluator for checkout & repricing.
   */
  public static async evaluatePromotion(
    businessId: string,
    code: string,
    subtotalCents: number
  ) {
    const client = await postgresAdapter.pool.connect();
    try {
      const normCode = code.trim().toUpperCase();
      const res = await client.query(`
        SELECT * FROM promotions
        WHERE business_id = $1 AND code = $2;
      `, [businessId, normCode]);

      if (res.rows.length === 0) {
        return { valid: false, reason: 'PROMO_CODE_NOT_FOUND' };
      }

      const p = res.rows[0];
      const now = new Date();

      if (!p.is_active) {
        return { valid: false, reason: 'PROMO_CODE_INACTIVE' };
      }
      if (new Date(p.starts_at) > now) {
        return { valid: false, reason: 'PROMO_NOT_STARTED' };
      }
      if (new Date(p.ends_at) < now) {
        return { valid: false, reason: 'PROMO_EXPIRED' };
      }
      if (subtotalCents < p.min_order_subtotal_cents) {
        return {
          valid: false,
          reason: `MIN_ORDER_SUBTOTAL_NOT_MET: Minimum order subtotal is R${(p.min_order_subtotal_cents / 100).toFixed(2)}`
        };
      }

      let discountCents = 0;
      if (p.discount_type === 'PERCENTAGE') {
        discountCents = Math.round((subtotalCents * p.discount_value) / 100);
        if (p.max_discount_cents && discountCents > p.max_discount_cents) {
          discountCents = p.max_discount_cents;
        }
      } else {
        discountCents = p.discount_value;
      }

      discountCents = Math.min(discountCents, subtotalCents);

      return {
        valid: true,
        code: p.code,
        title: p.title,
        discountType: p.discount_type,
        discountValue: p.discount_value,
        discountCents
      };
    } finally {
      client.release();
    }
  }

  /**
   * 8. ANALYTICS & PERFORMANCE REPORTING (2E.8)
   */
  public static async getAnalytics(
    userId: string,
    businessId: string,
    period: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL_TIME' = 'WEEK'
  ) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      let intervalSql = "INTERVAL '7 days'";
      if (period === 'TODAY') intervalSql = "INTERVAL '1 day'";
      else if (period === 'MONTH') intervalSql = "INTERVAL '30 days'";
      else if (period === 'ALL_TIME') intervalSql = "INTERVAL '10 years'";

      // Overall aggregates
      const aggRes = await client.query(`
        SELECT 
          COUNT(*)::int as total_orders,
          COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END)::int as completed_orders,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END)::int as cancelled_orders,
          COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN subtotal_cents ELSE 0 END), 0)::int as gross_sales_cents,
          COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN total_cents ELSE 0 END), 0)::int as gross_revenue_cents
        FROM orders
        WHERE business_id = $1 AND created_at >= (NOW() - ${intervalSql});
      `, [businessId]);

      const agg = aggRes.rows[0];
      const aovCents = agg.completed_orders > 0 
        ? Math.round(agg.gross_sales_cents / agg.completed_orders) 
        : 0;
      const cancellationRate = agg.total_orders > 0 
        ? parseFloat(((agg.cancelled_orders / agg.total_orders) * 100).toFixed(2)) 
        : 0;

      // Top selling items
      const topItemsRes = await client.query(`
        SELECT 
          COALESCE(oi.item_name, mi.name, p.name, 'Item') as item_name,
          SUM(oi.quantity)::int as units_sold,
          SUM(oi.total_cents)::int as total_revenue_cents
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON mi.id = oi.item_id AND oi.item_type = 'MENU_ITEM'
        LEFT JOIN products p ON p.id = oi.item_id AND oi.item_type = 'PRODUCT'
        WHERE o.business_id = $1 AND o.status = 'DELIVERED' AND o.created_at >= (NOW() - ${intervalSql})
        GROUP BY COALESCE(oi.item_name, mi.name, p.name, 'Item')
        ORDER BY units_sold DESC
        LIMIT 5;
      `, [businessId]);

      // Daily breakdown
      const dailyRes = await client.query(`
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM-DD') as day,
          COUNT(*)::int as orders_count,
          COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN subtotal_cents ELSE 0 END), 0)::int as sales_cents
        FROM orders
        WHERE business_id = $1 AND created_at >= (NOW() - ${intervalSql})
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY day ASC;
      `, [businessId]);

      return {
        businessId,
        period,
        summary: {
          totalOrders: agg.total_orders,
          completedOrders: agg.completed_orders,
          cancelledOrders: agg.cancelled_orders,
          cancellationRatePct: cancellationRate,
          grossSalesCents: agg.gross_sales_cents,
          grossRevenueCents: agg.gross_revenue_cents,
          averageOrderValueCents: aovCents
        },
        topSellingItems: topItemsRes.rows,
        dailyBreakdown: dailyRes.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * 9. FINANCIAL VISIBILITY & MERCHANT PAYOUT LEDGER (2E.9)
   * Complete commercial transparency:
   * - Gross sales
   * - Platform commission fee (standard 15%)
   * - Attributed Rep commission visibility (preserves Rep banking privacy)
   * - Net merchant earnings
   * - Payout settlement status: PENDING_SETTLEMENT
   */
  public static async getFinancialSummary(userId: string, businessId: string) {
    await this.verifyMerchantAccess(userId, businessId);
    const client = await postgresAdapter.pool.connect();

    try {
      // 1. Total delivered sales
      const salesRes = await client.query(`
        SELECT 
          COUNT(*)::int as delivered_orders_count,
          COALESCE(SUM(subtotal_cents), 0)::int as gross_subtotal_cents,
          COALESCE(SUM(total_cents), 0)::int as gross_total_cents
        FROM orders
        WHERE business_id = $1 AND status = 'DELIVERED';
      `, [businessId]);

      const sales = salesRes.rows[0];
      const grossSubtotalCents = sales.gross_subtotal_cents;

      // 2. Explicit Commercial Platform Commission Configuration (2E.1, 2E.9)
      // Strictly avoid unauthorized hardcoded 15% rate; require explicit commercial rule or configuration
      const ruleRes = await client.query(`
        SELECT percentage_rate FROM commission_rules
        WHERE target_role IN ('MERCHANT', 'PLATFORM_MERCHANT', 'BUSINESS', 'TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER') AND is_active = true
        ORDER BY effective_from DESC LIMIT 1;
      `);

      let platformFeeRate: number | null = null;
      let platformFeeRatePct: number | null = null;
      let platformFeeCents: number | null = null;
      let commercialStatus = 'COMMERCIAL_CONFIGURATION_PENDING';
      let commercialNotice = 'EXPLICIT COMMERCIAL CONFIGURATION PENDING: No authorized platform commission rate has been configured for this merchant';

      if (ruleRes.rows.length > 0) {
        platformFeeRate = parseFloat(ruleRes.rows[0].percentage_rate);
        platformFeeRatePct = parseFloat((platformFeeRate * 100).toFixed(2));
        platformFeeCents = Math.round(grossSubtotalCents * platformFeeRate);
        commercialStatus = 'COMMERCIAL_RATE_CONFIGURED';
        commercialNotice = `Authorized commercial rate applied: ${platformFeeRatePct}%`;
      } else if (process.env.COMMERCIAL_PLATFORM_COMMISSION_RATE) {
        platformFeeRate = parseFloat(process.env.COMMERCIAL_PLATFORM_COMMISSION_RATE);
        platformFeeRatePct = parseFloat((platformFeeRate * 100).toFixed(2));
        platformFeeCents = Math.round(grossSubtotalCents * platformFeeRate);
        commercialStatus = 'COMMERCIAL_RATE_CONFIGURED';
        commercialNotice = `Environment commercial rate applied: ${platformFeeRatePct}%`;
      }

      // Check Rep Attribution
      const attrRes = await client.query(`
        SELECT 
          rba.id, rba.attribution_status, rba.created_at,
          cr.percentage_rate
        FROM rep_business_attributions rba
        LEFT JOIN commission_rules cr ON cr.target_role = 'TUXI_REP' AND cr.is_active = true
        WHERE rba.business_id = $1 AND rba.attribution_status = 'ACTIVE'
        LIMIT 1;
      `, [businessId]);

      let repAttributionNote = 'No Rep Attribution associated with this merchant account';
      let repRatePct = 0;

      if (attrRes.rows.length > 0) {
        repRatePct = parseFloat(attrRes.rows[0].percentage_rate || '0.025') * 100;
        repAttributionNote = `Acquired by verified TUXI Rep (${repRatePct.toFixed(2)}% qualifying sales allocation paid out of TUXI platform fee)`;
      }

      // Net merchant payout (gross sales minus platform fee if authorized, else gross sales with pending notice)
      const netEarningsCents = platformFeeCents !== null
        ? Math.max(0, grossSubtotalCents - platformFeeCents)
        : grossSubtotalCents;

      return {
        businessId,
        currency: 'ZAR',
        metrics: {
          deliveredOrdersCount: sales.delivered_orders_count,
          grossSalesCents: grossSubtotalCents,
          platformFeeCents,
          platformFeeRatePct,
          netEarningsCents
        },
        commercial: {
          status: commercialStatus,
          notice: commercialNotice,
          requiresExplicitConfiguration: platformFeeRate === null
        },
        repAttribution: {
          hasAttribution: attrRes.rows.length > 0,
          ratePct: repRatePct,
          description: repAttributionNote
        },
        settlement: {
          status: 'PENDING_SETTLEMENT',
          schedule: 'WEEKLY_WEDNESDAY',
          designatedBankAccountMask: 'Standard Bank Cheque (****4892)',
          disclaimer: 'EXTERNAL PAYMENT GATEWAY LIVE SETTLEMENTS PENDING'
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * 10. BUSINESS STAFF RBAC (2E.1, 2E.9)
   */
  public static async getStaff(userId: string, businessId: string) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const ownersRes = await client.query(`
        SELECT bo.id, bo.user_id, 'OWNER' as role, bo.is_primary_owner, bo.added_at,
               u.first_name, u.last_name, u.email
        FROM business_owners bo
        JOIN users u ON u.id = bo.user_id
        WHERE bo.business_id = $1;
      `, [businessId]);

      const staffRes = await client.query(`
        SELECT bs.id, bs.user_id, bs.staff_role as role, false as is_primary_owner, bs.created_at as added_at,
               u.first_name, u.last_name, u.email
        FROM business_staff bs
        JOIN users u ON u.id = bs.user_id
        WHERE bs.business_id = $1;
      `, [businessId]);

      return [...ownersRes.rows, ...staffRes.rows];
    } finally {
      client.release();
    }
  }

  public static async addStaff(
    userId: string,
    businessId: string,
    targetUserId: string,
    staffRole: 'MANAGER' | 'ORDER_STAFF' | 'CATALOGUE_STAFF'
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        INSERT INTO business_staff (id, business_id, user_id, staff_role, created_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, NOW())
        ON CONFLICT (business_id, user_id) 
        DO UPDATE SET staff_role = EXCLUDED.staff_role
        RETURNING *;
      `, [businessId, targetUserId, staffRole]);

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  public static async removeStaff(
    userId: string,
    businessId: string,
    targetUserId: string
  ) {
    await this.verifyMerchantAccess(userId, businessId, ['OWNER', 'ADMIN', 'SUPER_ADMIN']);
    const client = await postgresAdapter.pool.connect();

    try {
      const res = await client.query(`
        DELETE FROM business_staff WHERE business_id = $1 AND user_id = $2 RETURNING id;
      `, [businessId, targetUserId]);

      if (res.rows.length === 0) {
        throw new Error('STAFF_MEMBER_NOT_FOUND');
      }
      return { success: true, removedUserId: targetUserId };
    } finally {
      client.release();
    }
  }
}
