import { postgresAdapter } from '../db/postgres.js';
import { dbInstance } from '../db/database.js';

export interface ShopProductVariant {
  id: string;
  productId: string;
  variantSku: string;
  variantName: string;
  priceDeltaCents: number;
  salePriceCents?: number | null;
  attributes: Record<string, any>;
  isAvailable: boolean;
  stockAvailable: number;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  isBulk?: boolean | null;
  isWholesale?: boolean | null;
}

export interface ShopProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  salePriceCents?: number | null;
  isOnSale: boolean;
  effectivePriceCents: number;
  isAvailable: boolean;
  imageUrl?: string | null;
  stockAvailable: number;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  isBulk?: boolean;
  isWholesale?: boolean;
  variants: ShopProductVariant[];
}

export class ShopService {
  /**
   * Retrieves all approved and active Shop businesses for customer discovery.
   * STRICT SECURITY INSTRUCTION (2B.1):
   * Filters by: type = 'SHOP' AND status = 'APPROVED' AND is_active = true.
   * Hidden from customers: PENDING_VERIFICATION, SUSPENDED, REJECTED.
   * Strips all private merchant data (tax IDs, contact emails, direct phone numbers).
   */
  public static async getApprovedShops() {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            b.id,
            b.name,
            b.type,
            b.status,
            b.latitude::float8,
            b.longitude::float8,
            b.image_url,
            b.banner_url,
            b.opening_hours,
            sp.store_category,
            sp.fulfillment_mode,
            a.street_line_1,
            a.city,
            a.postal_code,
            a.country_code
          FROM businesses b
          LEFT JOIN shop_profiles sp ON sp.business_id = b.id
          LEFT JOIN addresses a ON a.id = b.address_id
          WHERE b.type = 'SHOP' AND b.status = 'APPROVED' AND b.is_active = true
          ORDER BY b.name ASC;
        `);

        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          category: r.store_category || 'Retail & Goods',
          fulfillmentMode: r.fulfillment_mode || 'merchant_pack',
          imageUrl: r.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          bannerUrl: r.banner_url || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80',
          openingHours: r.opening_hours || {},
          address: {
            streetLine1: r.street_line_1,
            city: r.city,
            postalCode: r.postal_code,
            countryCode: r.country_code,
            latitude: r.latitude,
            longitude: r.longitude
          },
          rating: 4.8,
          deliveryFeeCents: 2500
        }));
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const rows = dbInstance.db.prepare(`
      SELECT b.id, b.name, b.type, b.status
      FROM businesses b
      WHERE b.type = 'SHOP' AND b.status = 'APPROVED'
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      category: 'Retail',
      fulfillmentMode: 'merchant_pack',
      rating: 4.8,
      deliveryFeeCents: 2500
    }));
  }

  /**
   * Retrieves single shop store details.
   */
  public static async getShopDetail(shopId: string) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            b.id,
            b.name,
            b.type,
            b.status,
            b.latitude::float8,
            b.longitude::float8,
            b.image_url,
            b.banner_url,
            b.opening_hours,
            sp.store_category,
            sp.fulfillment_mode,
            a.street_line_1,
            a.city,
            a.postal_code,
            a.country_code
          FROM businesses b
          LEFT JOIN shop_profiles sp ON sp.business_id = b.id
          LEFT JOIN addresses a ON a.id = b.address_id
          WHERE b.id = $1 AND b.type = 'SHOP' AND b.status = 'APPROVED' AND b.is_active = true;
        `, [shopId]);

        if (res.rows.length === 0) {
          throw new Error('SHOP_NOT_FOUND: Shop does not exist, is pending, or suspended');
        }

        const r = res.rows[0];
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          category: r.store_category || 'Retail & Goods',
          fulfillmentMode: r.fulfillment_mode || 'merchant_pack',
          imageUrl: r.image_url,
          bannerUrl: r.banner_url,
          openingHours: r.opening_hours || {},
          address: {
            streetLine1: r.street_line_1,
            city: r.city,
            postalCode: r.postal_code,
            countryCode: r.country_code,
            latitude: r.latitude,
            longitude: r.longitude
          },
          rating: 4.8,
          deliveryFeeCents: 2500
        };
      } finally {
        client.release();
      }
    }

    const b = dbInstance.db.prepare('SELECT id, name, type, status FROM businesses WHERE id = ? AND type = "SHOP"').get(shopId) as any;
    if (!b) throw new Error('SHOP_NOT_FOUND');
    return b;
  }

  /**
   * Retrieves product catalogue for an approved active shop.
   * Joins products, variants, and live inventory.
   */
  public static async getShopProducts(shopId: string): Promise<ShopProduct[]> {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        // Verify shop is approved & active
        const bizCheck = await client.query(`
          SELECT id, name, status, is_active FROM businesses WHERE id = $1 AND type = 'SHOP';
        `, [shopId]);

        if (bizCheck.rows.length === 0 || bizCheck.rows[0].status !== 'APPROVED' || !bizCheck.rows[0].is_active) {
          throw new Error('SHOP_NOT_FOUND: Shop does not exist, is pending, or suspended');
        }

        // Fetch products
        const prodRes = await client.query(`
          SELECT 
            p.id,
            p.business_id,
            p.sku,
            p.name,
            p.description,
            p.category,
            p.price_cents,
            p.sale_price_cents,
            p.is_on_sale,
            p.is_available,
            p.image_url,
            COALESCE(inv.quantity_available, 0) as raw_qty,
            COALESCE(inv.reserved_quantity, 0) as raw_reserved
          FROM products p
          LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          WHERE p.business_id = $1 AND p.is_active = true
          ORDER BY p.category ASC, p.name ASC;
        `, [shopId]);

        // Fetch all variants for these products
        const varRes = await client.query(`
          SELECT 
            pv.id,
            pv.product_id,
            pv.variant_sku,
            pv.variant_name,
            pv.price_delta_cents,
            pv.sale_price_cents,
            pv.attributes,
            pv.is_available,
            COALESCE(inv.quantity_available, 0) as raw_qty,
            COALESCE(inv.reserved_quantity, 0) as raw_reserved
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN inventory inv ON inv.variant_id = pv.id
          WHERE p.business_id = $1
          ORDER BY pv.variant_name ASC;
        `, [shopId]);

        const variantsByProdId: Record<string, ShopProductVariant[]> = {};
        for (const v of varRes.rows) {
          const availStock = Math.max(0, (v.raw_qty || 0) - (v.raw_reserved || 0));
          const variantObj: ShopProductVariant = {
            id: v.id,
            productId: v.product_id,
            variantSku: v.variant_sku,
            variantName: v.variant_name,
            priceDeltaCents: v.price_delta_cents,
            salePriceCents: v.sale_price_cents,
            attributes: v.attributes || {},
            isAvailable: Boolean(v.is_available && availStock > 0),
            stockAvailable: availStock
          };

          if (!variantsByProdId[v.product_id]) {
            variantsByProdId[v.product_id] = [];
          }
          variantsByProdId[v.product_id].push(variantObj);
        }

        return prodRes.rows.map(p => {
          const variants = variantsByProdId[p.id] || [];
          const prodDirectStock = Math.max(0, (p.raw_qty || 0) - (p.raw_reserved || 0));
          // If product has variants, total available stock is sum of variant stocks
          const totalStock = variants.length > 0 
            ? variants.reduce((sum, v) => sum + v.stockAvailable, 0)
            : prodDirectStock;

          const isOnSale = Boolean(p.is_on_sale && p.sale_price_cents && p.sale_price_cents > 0);
          const effectivePriceCents = isOnSale ? p.sale_price_cents : p.price_cents;

          return {
            id: p.id,
            businessId: p.business_id,
            sku: p.sku,
            name: p.name,
            description: p.description || '',
            category: p.category,
            priceCents: p.price_cents,
            salePriceCents: p.sale_price_cents,
            isOnSale,
            effectivePriceCents,
            isAvailable: Boolean(p.is_available && totalStock > 0),
            imageUrl: p.image_url,
            stockAvailable: totalStock,
            weightGrams: p.weight_grams ?? null,
            lengthCm: p.length_cm ?? null,
            widthCm: p.width_cm ?? null,
            heightCm: p.height_cm ?? null,
            isBulk: Boolean(p.is_bulk),
            isWholesale: Boolean(p.is_wholesale),
            variants
          };
        });
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const products = dbInstance.db.prepare('SELECT * FROM products WHERE business_id = ?').all(shopId) as any[];
    return products.map(p => ({
      id: p.id,
      businessId: p.business_id,
      sku: p.sku,
      name: p.name,
      description: p.description || '',
      category: p.category,
      priceCents: p.price_cents,
      isOnSale: false,
      effectivePriceCents: p.price_cents,
      isAvailable: Boolean(p.is_active),
      stockAvailable: 10,
      weightGrams: p.weight_grams ?? null,
      lengthCm: p.length_cm ?? null,
      widthCm: p.width_cm ?? null,
      heightCm: p.height_cm ?? null,
      isBulk: Boolean(p.is_bulk),
      isWholesale: Boolean(p.is_wholesale),
      variants: []
    }));
  }

  /**
   * Retrieves single product with variants and authoritative stock.
   */
  public static async getProductDetail(productId: string): Promise<ShopProduct> {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const prodRes = await client.query(`
          SELECT 
            p.id,
            p.business_id,
            p.sku,
            p.name,
            p.description,
            p.category,
            p.price_cents,
            p.sale_price_cents,
            p.is_on_sale,
            p.is_available,
            p.image_url,
            COALESCE(inv.quantity_available, 0) as raw_qty,
            COALESCE(inv.reserved_quantity, 0) as raw_reserved
          FROM products p
          LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          WHERE p.id = $1 AND p.is_active = true;
        `, [productId]);

        if (prodRes.rows.length === 0) {
          throw new Error('PRODUCT_NOT_FOUND: Product does not exist or is inactive');
        }

        const p = prodRes.rows[0];

        // Fetch variants
        const varRes = await client.query(`
          SELECT 
            pv.id,
            pv.product_id,
            pv.variant_sku,
            pv.variant_name,
            pv.price_delta_cents,
            pv.sale_price_cents,
            pv.attributes,
            pv.is_available,
            COALESCE(inv.quantity_available, 0) as raw_qty,
            COALESCE(inv.reserved_quantity, 0) as raw_reserved
          FROM product_variants pv
          LEFT JOIN inventory inv ON inv.variant_id = pv.id
          WHERE pv.product_id = $1
          ORDER BY pv.variant_name ASC;
        `, [productId]);

        const variants: ShopProductVariant[] = varRes.rows.map(v => {
          const availStock = Math.max(0, (v.raw_qty || 0) - (v.raw_reserved || 0));
          return {
            id: v.id,
            productId: v.product_id,
            variantSku: v.variant_sku,
            variantName: v.variant_name,
            priceDeltaCents: v.price_delta_cents,
            salePriceCents: v.sale_price_cents,
            attributes: v.attributes || {},
            isAvailable: Boolean(v.is_available && availStock > 0),
            stockAvailable: availStock
          };
        });

        const prodDirectStock = Math.max(0, (p.raw_qty || 0) - (p.raw_reserved || 0));
        const totalStock = variants.length > 0
          ? variants.reduce((sum, v) => sum + v.stockAvailable, 0)
          : prodDirectStock;

        const isOnSale = Boolean(p.is_on_sale && p.sale_price_cents && p.sale_price_cents > 0);
        const effectivePriceCents = isOnSale ? p.sale_price_cents : p.price_cents;

        return {
          id: p.id,
          businessId: p.business_id,
          sku: p.sku,
          name: p.name,
          description: p.description || '',
          category: p.category,
          priceCents: p.price_cents,
          salePriceCents: p.sale_price_cents,
          isOnSale,
          effectivePriceCents,
          isAvailable: Boolean(p.is_available && totalStock > 0),
          imageUrl: p.image_url,
          stockAvailable: totalStock,
          weightGrams: p.weight_grams ?? null,
          lengthCm: p.length_cm ?? null,
          widthCm: p.width_cm ?? null,
          heightCm: p.height_cm ?? null,
          isBulk: Boolean(p.is_bulk),
          isWholesale: Boolean(p.is_wholesale),
          variants
        };
      } finally {
        client.release();
      }
    }

    const p = dbInstance.db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!p) throw new Error('PRODUCT_NOT_FOUND');
    return {
      id: p.id,
      businessId: p.business_id,
      sku: p.sku,
      name: p.name,
      description: p.description || '',
      category: p.category,
      priceCents: p.price_cents,
      isOnSale: false,
      effectivePriceCents: p.price_cents,
      isAvailable: Boolean(p.is_active),
      stockAvailable: 10,
      weightGrams: p.weight_grams ?? null,
      lengthCm: p.length_cm ?? null,
      widthCm: p.width_cm ?? null,
      heightCm: p.height_cm ?? null,
      isBulk: Boolean(p.is_bulk),
      isWholesale: Boolean(p.is_wholesale),
      variants: []
    };
  }

  /**
   * Searches approved active shops and catalogue products.
   * Strictly respects merchant and item visibility rules.
   */
  public static async searchShopsAndProducts(query: string) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      return { shops: await this.getApprovedShops(), products: [] };
    }

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const searchPattern = `%${q}%`;

        // 1. Search Shops
        const shopRes = await client.query(`
          SELECT 
            b.id, b.name, b.type, b.status, b.latitude::float8, b.longitude::float8,
            b.image_url, b.banner_url, sp.store_category, a.street_line_1, a.city
          FROM businesses b
          LEFT JOIN shop_profiles sp ON sp.business_id = b.id
          LEFT JOIN addresses a ON a.id = b.address_id
          WHERE b.type = 'SHOP' AND b.status = 'APPROVED' AND b.is_active = true
            AND (LOWER(b.name) LIKE $1 OR LOWER(sp.store_category) LIKE $1)
          ORDER BY b.name ASC;
        `, [searchPattern]);

        // 2. Search Products
        const prodRes = await client.query(`
          SELECT 
            p.id, p.business_id, p.sku, p.name, p.description, p.category,
            p.price_cents, p.sale_price_cents, p.is_on_sale, p.is_available, p.image_url,
            b.name as shop_name
          FROM products p
          JOIN businesses b ON b.id = p.business_id
          WHERE b.type = 'SHOP' AND b.status = 'APPROVED' AND b.is_active = true
            AND p.is_active = true
            AND (LOWER(p.name) LIKE $1 OR LOWER(p.description) LIKE $1 OR LOWER(p.category) LIKE $1 OR LOWER(p.sku) LIKE $1)
          ORDER BY p.name ASC;
        `, [searchPattern]);

        return {
          shops: shopRes.rows.map(r => ({
            id: r.id,
            name: r.name,
            category: r.store_category || 'Retail & Goods',
            address: `${r.street_line_1 || ''}, ${r.city || ''}`
          })),
          products: prodRes.rows.map(p => ({
            id: p.id,
            businessId: p.business_id,
            shopName: p.shop_name,
            sku: p.sku,
            name: p.name,
            description: p.description,
            category: p.category,
            priceCents: p.is_on_sale && p.sale_price_cents ? p.sale_price_cents : p.price_cents,
            isOnSale: Boolean(p.is_on_sale),
            imageUrl: p.image_url
          }))
        };
      } finally {
        client.release();
      }
    }

    return { shops: [], products: [] };
  }
}
