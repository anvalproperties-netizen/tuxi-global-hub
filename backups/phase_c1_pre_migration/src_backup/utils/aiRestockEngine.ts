// TUXI AI Predictive Inventory & Smart Restock Engine
// Analyzes sales velocity, predicts stockout thresholds, and generates automated purchase order recommendations

import { ProductItem, Order } from '../types';

export interface RestockItemAlert {
  id: string;
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  predictedSafetyThreshold: number;
  salesVelocityPerDay: number;
  hoursUntilStockout: number;
  urgency: 'critical' | 'warning' | 'optimal';
  suggestedReorderQuantity: number;
  supplierWholesalePrice: number;
  estimatedCost: number;
  projectedRevenue: number;
  projectedProfit: number;
  supplierName: string;
  supplierLeadTimeHours: number;
  aiRecommendationText: string;
  status: 'alert_triggered' | 'po_dispatched' | 'received';
  dispatchedAt?: string;
  poNumber?: string;
}

const STORAGE_KEY = 'tuxi_shop_restock_alerts';

type RestockListener = (alerts: RestockItemAlert[]) => void;
const restockListeners = new Set<RestockListener>();

export function onRestockAlertsUpdate(listener: RestockListener): () => void {
  restockListeners.add(listener);
  return () => {
    restockListeners.delete(listener);
  };
}

export function notifyRestockListeners(alerts: RestockItemAlert[]) {
  restockListeners.forEach(fn => fn(alerts));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.warn('[AIRestock] Could not cache alerts', e);
  }
}

/**
 * Evaluates shop catalog products against live velocity & orders to generate AI restocking alerts
 */
export function evaluateShopInventoryAlerts(
  products: ProductItem[] = [],
  orders: Order[] = []
): RestockItemAlert[] {
  // Count frequency in orders to derive velocity
  const itemOrderCounts = new Map<string, number>();
  orders.forEach(order => {
    order.items?.forEach(i => {
      const current = itemOrderCounts.get(i.name.toLowerCase()) || 0;
      itemOrderCounts.set(i.name.toLowerCase(), current + i.quantity);
    });
  });

  const alerts: RestockItemAlert[] = [];

  products.forEach(prod => {
    const rawSales = itemOrderCounts.get(prod.name.toLowerCase()) || 2;
    // Estimated velocity: 4 to 22 units per day based on historical sales
    const salesVelocityPerDay = Math.max(4, Math.min(26, rawSales * 3.5 + (prod.price < 10 ? 8 : 4)));
    
    // Safety buffer formula: (Velocity per day * Supplier Lead Time (1.5 days)) + 25% safety variance
    const supplierLeadTimeHours = prod.category.toLowerCase().includes('fresh') || prod.category.toLowerCase().includes('produce') ? 12 : 24;
    const leadTimeDays = supplierLeadTimeHours / 24;
    const predictedSafetyThreshold = Math.max(5, Math.ceil(salesVelocityPerDay * leadTimeDays * 1.35));

    const isBelowThreshold = prod.stock <= predictedSafetyThreshold;
    const hoursUntilStockout = salesVelocityPerDay > 0 
      ? Math.max(0.5, Math.round((prod.stock / (salesVelocityPerDay / 24)) * 10) / 10)
      : 72;

    let urgency: 'critical' | 'warning' | 'optimal' = 'optimal';
    if (prod.stock <= 3 || hoursUntilStockout <= 6) {
      urgency = 'critical';
    } else if (isBelowThreshold) {
      urgency = 'warning';
    }

    if (isBelowThreshold || urgency !== 'optimal') {
      // Economic Order Quantity (EOQ) suggestion
      const suggestedReorderQuantity = Math.max(24, Math.ceil(salesVelocityPerDay * 3.5)); // 3.5 days of runway
      const supplierWholesalePrice = Math.round((prod.price * 0.58) * 100) / 100;
      const estimatedCost = Math.round((suggestedReorderQuantity * supplierWholesalePrice) * 100) / 100;
      const projectedRevenue = Math.round((suggestedReorderQuantity * prod.price) * 100) / 100;
      const projectedProfit = Math.round((projectedRevenue - estimatedCost) * 100) / 100;

      // Select supplier based on category
      let supplierName = 'Sysco Wholesale Direct';
      if (prod.category.toLowerCase().includes('fresh') || prod.category.toLowerCase().includes('bakery')) {
        supplierName = 'Covent Garden Fresh Produce Market';
      } else if (prod.category.toLowerCase().includes('pharma') || prod.category.toLowerCase().includes('health')) {
        supplierName = 'Alliance Healthcare Distribution';
      } else if (prod.category.toLowerCase().includes('dairy') || prod.category.toLowerCase().includes('organic')) {
        supplierName = 'Cotswold Organic Farms Cooperative';
      }

      let aiText = `Current stock (${prod.stock} units) dropped below predicted threshold of ${predictedSafetyThreshold}. High velocity (${salesVelocityPerDay} units/day) projects stockout in ~${hoursUntilStockout} hours. Recommended batch: ${suggestedReorderQuantity} units.`;
      if (urgency === 'critical') {
        aiText = `🚨 URGENT: Only ${prod.stock} units remaining! Stockout anticipated in ${hoursUntilStockout} hrs. Dispatch supplier PO immediately to avoid customer basket abandonment.`;
      }

      alerts.push({
        id: `alert-${prod.id}-${Date.now().toString(36)}`,
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        currentStock: prod.stock,
        predictedSafetyThreshold,
        salesVelocityPerDay: Math.round(salesVelocityPerDay),
        hoursUntilStockout,
        urgency,
        suggestedReorderQuantity,
        supplierWholesalePrice,
        estimatedCost,
        projectedRevenue,
        projectedProfit,
        supplierName,
        supplierLeadTimeHours,
        aiRecommendationText: aiText,
        status: 'alert_triggered'
      });
    }
  });

  // Sort by urgency: critical first, then warning
  return alerts.sort((a, b) => {
    if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
    if (b.urgency === 'critical' && a.urgency !== 'critical') return 1;
    return a.hoursUntilStockout - b.hoursUntilStockout;
  });
}

/**
 * Dispatches an automated Purchase Order to the supplier and updates product stock
 */
export async function dispatchSupplierPurchaseOrder(
  alert: RestockItemAlert,
  onSuccess: (updatedAlert: RestockItemAlert, newStock: number) => void
): Promise<RestockItemAlert> {
  const poNumber = `PO-${Math.floor(100000 + Math.random() * 900000)}`;
  
  // Simulate network EDI dispatch roundtrip
  await new Promise(resolve => setTimeout(resolve, 800));

  const updatedAlert: RestockItemAlert = {
    ...alert,
    status: 'po_dispatched',
    dispatchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    poNumber
  };

  const newStock = alert.currentStock + alert.suggestedReorderQuantity;
  onSuccess(updatedAlert, newStock);

  // Dispatch custom event for notifications
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tuxi-po-dispatched-success', {
        detail: {
          alert: updatedAlert,
          newStock
        }
      })
    );
  }

  return updatedAlert;
}
