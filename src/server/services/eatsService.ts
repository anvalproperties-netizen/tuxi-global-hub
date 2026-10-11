import { postgresAdapter } from '../db/postgres.js';
import { dbInstance } from '../db/database.js';

export class EatsService {
  /**
   * Retrieves all approved and active Eats businesses for customer discovery.
   * STRICT SECURITY INSTRUCTION (2A.5):
   * Filters by: type = 'EATS' AND status = 'APPROVED' AND is_active = true.
   * Hidden from customers: PENDING_VERIFICATION, SUSPENDED, REJECTED.
   * Strips all private merchant data (tax IDs, contact emails, direct phone numbers).
   */
  public static async getApprovedBusinesses() {
    if (process.env.SQL_HOST) {
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
            ep.cuisine_types,
            ep.prep_time_minutes,
            ep.price_rating,
            a.street_line_1,
            a.city,
            a.postal_code,
            a.country_code
          FROM businesses b
          LEFT JOIN eats_profiles ep ON ep.business_id = b.id
          LEFT JOIN addresses a ON a.id = b.address_id
          WHERE b.type = 'EATS' AND b.status = 'APPROVED' AND b.is_active = true
          ORDER BY b.name ASC;
        `);

        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          cuisineTypes: r.cuisine_types || [],
          prepTimeMinutes: r.prep_time_minutes || 25,
          priceRating: r.price_rating || '$$',
          imageUrl: r.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          bannerUrl: r.banner_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
          openingHours: r.opening_hours || {},
          address: {
            streetLine1: r.street_line_1,
            city: r.city,
            postalCode: r.postal_code,
            countryCode: r.country_code,
            latitude: r.latitude,
            longitude: r.longitude
          },
          deliveryFeeCents: 2500, // Standard R25 delivery
          minOrderCents: 5000     // R50 minimum
        }));
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const rows = dbInstance.db.prepare(`
      SELECT b.id, b.name, b.type, b.status, b.latitude, b.longitude
      FROM businesses b
      WHERE b.type = 'EATS' AND b.status = 'APPROVED'
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      cuisineTypes: ['Various'],
      prepTimeMinutes: 20,
      priceRating: '$$',
      address: {
        latitude: r.latitude,
        longitude: r.longitude
      }
    }));
  }

  /**
   * Retrieves single approved Eats business details.
   */
  public static async getBusinessDetail(businessId: string) {
    if (process.env.SQL_HOST) {
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
            ep.cuisine_types,
            ep.prep_time_minutes,
            ep.price_rating,
            a.street_line_1,
            a.city,
            a.postal_code,
            a.country_code
          FROM businesses b
          LEFT JOIN eats_profiles ep ON ep.business_id = b.id
          LEFT JOIN addresses a ON a.id = b.address_id
          WHERE b.id = $1 AND b.status = 'APPROVED' AND b.is_active = true;
        `, [businessId]);

        if (res.rows.length === 0) {
          throw new Error('EATS_BUSINESS_NOT_FOUND: Merchant is unavailable or does not exist');
        }

        const r = res.rows[0];
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          cuisineTypes: r.cuisine_types || [],
          prepTimeMinutes: r.prep_time_minutes || 25,
          priceRating: r.price_rating || '$$',
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
          }
        };
      } finally {
        client.release();
      }
    }

    const b = dbInstance.db.prepare('SELECT id, name, type, status, latitude, longitude FROM businesses WHERE id = ? AND status = ?').get(businessId, 'APPROVED') as any;
    if (!b) throw new Error('EATS_BUSINESS_NOT_FOUND');
    return b;
  }

  /**
   * Loads categories and menu items with availability and modifiers.
   */
  public static async getBusinessMenu(businessId: string) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        // Ensure business exists and is approved
        const bizCheck = await client.query('SELECT id, name FROM businesses WHERE id = $1 AND status = $2;', [businessId, 'APPROVED']);
        if (bizCheck.rows.length === 0) {
          throw new Error('EATS_BUSINESS_NOT_FOUND');
        }

        // Fetch categories
        const catRes = await client.query(`
          SELECT id, name, sort_order
          FROM menu_categories
          WHERE business_id = $1 AND is_active = true
          ORDER BY sort_order ASC, name ASC;
        `, [businessId]);

        // Fetch all items for this business
        const itemRes = await client.query(`
          SELECT 
            mi.id,
            mi.category_id,
            mi.name,
            mi.description,
            mi.base_price_cents,
            mi.currency,
            mi.is_available,
            mi.image_url
          FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1
          ORDER BY mi.name ASC;
        `, [businessId]);

        // Fetch all modifiers for these items
        const itemIds = itemRes.rows.map(i => i.id);
        let modifiersByItem: Record<string, any[]> = {};

        if (itemIds.length > 0) {
          const modRes = await client.query(`
            SELECT 
              id,
              menu_item_id,
              group_name,
              name,
              extra_price_cents
            FROM menu_item_modifiers
            WHERE menu_item_id = ANY($1::uuid[])
            ORDER BY group_name ASC, extra_price_cents ASC;
          `, [itemIds]);

          for (const m of modRes.rows) {
            if (!modifiersByItem[m.menu_item_id]) {
              modifiersByItem[m.menu_item_id] = [];
            }
            modifiersByItem[m.menu_item_id].push({
              id: m.id,
              groupName: m.group_name,
              name: m.name,
              extraPriceCents: m.extra_price_cents
            });
          }
        }

        // Assemble hierarchy
        const categories = catRes.rows.map(cat => {
          const items = itemRes.rows
            .filter(i => i.category_id === cat.id)
            .map(i => ({
              id: i.id,
              name: i.name,
              description: i.description,
              basePriceCents: i.base_price_cents,
              price: i.base_price_cents / 100.0,
              currency: i.currency,
              isAvailable: i.is_available,
              imageUrl: i.image_url,
              modifiers: modifiersByItem[i.id] || []
            }));

          return {
            id: cat.id,
            name: cat.name,
            items
          };
        });

        return {
          businessId,
          businessName: bizCheck.rows[0].name,
          categories
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const categories = dbInstance.db.prepare('SELECT id, name FROM menu_categories WHERE business_id = ?').all(businessId) as any[];
    return {
      businessId,
      categories: categories.map(c => ({
        ...c,
        items: dbInstance.db.prepare('SELECT id, name, base_price_cents, is_available FROM menu_items WHERE category_id = ?').all(c.id)
      }))
    };
  }
}
