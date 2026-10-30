import React, { useState, useEffect } from 'react';
import { 
  ProductItem, 
  Order 
} from '../../types';
import { 
  RestockItemAlert, 
  evaluateShopInventoryAlerts, 
  dispatchSupplierPurchaseOrder 
} from '../../utils/aiRestockEngine';
import { useTuxi } from '../../context/TuxiContext';
import { 
  AlertTriangle, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Truck, 
  Send, 
  FileText, 
  DollarSign, 
  ArrowRight, 
  Check, 
  PackageCheck, 
  RefreshCw, 
  Building2,
  ShieldAlert,
  Zap
} from 'lucide-react';

interface AISmartRestockManagerProps {
  products: ProductItem[];
  orders: Order[];
  onStockUpdated: (productId: string, newStock: number) => void;
  className?: string;
}

export const AISmartRestockManager: React.FC<AISmartRestockManagerProps> = ({
  products,
  orders,
  onStockUpdated,
  className = ''
}) => {
  const { formatPrice, config } = useTuxi();
  const [alerts, setAlerts] = useState<RestockItemAlert[]>([]);
  const [dispatchingIds, setDispatchingIds] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'dispatched'>('all');
  const [dispatchedHistory, setDispatchedHistory] = useState<RestockItemAlert[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    const calculated = evaluateShopInventoryAlerts(products, orders);
    setAlerts(calculated);
  }, [products, orders]);

  const criticalCount = alerts.filter(a => a.urgency === 'critical' && a.status === 'alert_triggered').length;
  const warningCount = alerts.filter(a => a.urgency === 'warning' && a.status === 'alert_triggered').length;

  const handleApprovePO = async (alert: RestockItemAlert) => {
    setDispatchingIds(prev => ({ ...prev, [alert.id]: true }));

    await dispatchSupplierPurchaseOrder(alert, (updatedAlert, newStock) => {
      onStockUpdated(alert.productId, newStock);

      // Move to history
      setDispatchedHistory(prev => [updatedAlert, ...prev]);

      // Remove from pending alerts
      setAlerts(prev => prev.filter(a => a.id !== alert.id));

      setToastMessage(`✓ Purchase Order ${updatedAlert.poNumber} dispatched to ${updatedAlert.supplierName}! +${alert.suggestedReorderQuantity} units replenished.`);
      setTimeout(() => setToastMessage(''), 5000);
    });

    setDispatchingIds(prev => ({ ...prev, [alert.id]: false }));
  };

  const handleApproveAllPOs = async () => {
    const pending = alerts.filter(a => a.status === 'alert_triggered');
    for (const alert of pending) {
      await handleApprovePO(alert);
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (activeTab === 'critical') return a.urgency === 'critical';
    return true;
  });

  return (
    <div className={`space-y-6 ${className}`}>
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-semibold flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-600 text-white rounded-xl">
              <PackageCheck className="w-4 h-4" />
            </div>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage('')} className="text-emerald-700 hover:text-emerald-900 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Header Metric Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/40 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-md">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">AI Predictive Inventory &amp; Restock Engine</h3>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  REAL-TIME PREDICTOR
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1 max-w-xl">
                Monitors real-time sales velocity, lead times, and customer basket patterns to suggest automated supplier restocking before popular items sell out.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {alerts.length > 0 && (
              <button
                onClick={handleApproveAllPOs}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Approve All Recommended POs ({alerts.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-indigo-800/50 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] text-slate-300 block">Critical Stockout Risk</span>
            <span className="text-xl font-bold font-mono text-rose-400 mt-0.5 block">
              {criticalCount} SKUs
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] text-slate-300 block">Warning (Below Safety Threshold)</span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-0.5 block">
              {warningCount} SKUs
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] text-slate-300 block">Dispatched Purchase Orders</span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-0.5 block">
              {dispatchedHistory.length} POs
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] text-slate-300 block">Forecast Horizon</span>
            <span className="text-xl font-bold font-mono text-cyan-300 mt-0.5 block">
              72 Hours Runway
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-xs font-semibold">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'all' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>All Restock Alerts</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/20">
              {alerts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('critical')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'critical' 
                ? 'bg-rose-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span>Critical Risks</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-200 text-rose-900 font-bold">
              {criticalCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dispatched')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'dispatched' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
            <span>Dispatched Orders History</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-200 text-slate-800 font-bold">
              {dispatchedHistory.length}
            </span>
          </button>
        </div>

        <span className="text-xs text-slate-400 hidden sm:inline">
          Algorithms: Lead-Time Buffer &amp; Exponential Moving Average
        </span>
      </div>

      {/* Main Alerts List */}
      {activeTab !== 'dispatched' ? (
        filteredAlerts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h4 className="text-base font-bold text-slate-900">All Popular Products Above Safety Threshold</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Inventory velocity is healthy across all categories. AI will trigger automated notifications when any SKU approaches its replenishment threshold.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map(alert => {
              const isDispatching = dispatchingIds[alert.id];
              return (
                <div
                  key={alert.id}
                  className={`bg-white border rounded-2xl p-5 shadow-xs transition-all space-y-4 ${
                    alert.urgency === 'critical'
                      ? 'border-rose-300 ring-2 ring-rose-500/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Row: Product Name, Stock vs Threshold & Urgency */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{alert.productName}</span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                          {alert.category}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase flex items-center gap-1 ${
                          alert.urgency === 'critical'
                            ? 'bg-rose-100 text-rose-800 animate-pulse'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>{alert.urgency === 'critical' ? 'CRITICAL STOCKOUT' : 'THRESHOLD REACHED'}</span>
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-3">
                        <span>Current Stock: <strong className="text-rose-600 font-mono text-sm">{alert.currentStock} units</strong></span>
                        <span>•</span>
                        <span>Safety Threshold: <strong className="text-slate-800 font-mono">{alert.predictedSafetyThreshold} units</strong></span>
                        <span>•</span>
                        <span>Est. Stockout in: <strong className="text-amber-700 font-mono">{alert.hoursUntilStockout} hours</strong></span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleApprovePO(alert)}
                        disabled={isDispatching}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Send className={`w-3.5 h-3.5 ${isDispatching ? 'animate-spin' : ''}`} />
                        <span>{isDispatching ? 'Dispatching PO...' : 'Approve & Dispatch PO'}</span>
                      </button>
                    </div>
                  </div>

                  {/* AI Recommendation Quote Box */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-700">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-indigo-950 block mb-0.5">AI Inventory Recommendation &amp; Justification:</span>
                      <p className="text-slate-600 leading-relaxed">{alert.aiRecommendationText}</p>
                    </div>
                  </div>

                  {/* Commercial & Supplier Details Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/50 p-3 rounded-xl border border-slate-100 font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Supplier:</span>
                      <span className="font-bold text-slate-800 truncate block font-sans">
                        {alert.supplierName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans">Lead time: {alert.supplierLeadTimeHours}h</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Recommended Reorder:</span>
                      <span className="font-bold text-indigo-700">
                        {alert.suggestedReorderQuantity} Units
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans">@ {formatPrice(alert.supplierWholesalePrice)} wholesale</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Total PO Cost:</span>
                      <span className="font-bold text-slate-900">
                        {formatPrice(alert.estimatedCost)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans">Net invoice</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Projected Profit:</span>
                      <span className="font-bold text-emerald-600">
                        +{formatPrice(alert.projectedProfit)}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-sans font-bold">High margin item</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Dispatched Purchase Orders History */
        dispatchedHistory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 text-slate-400 text-xs">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-600">No Purchase Orders Dispatched in Current Session</p>
            <p className="text-[11px]">Approved restocking orders sent to suppliers will appear here with EDI confirmations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dispatchedHistory.map(item => (
              <div
                key={item.poNumber || item.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 font-mono">{item.poNumber}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-800">{item.productName}</span>
                      <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-100 text-emerald-800">
                        DISPATCHED TO SUPPLIER
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Supplier: {item.supplierName} · Dispatched at {item.dispatchedAt} · +{item.suggestedReorderQuantity} Units ({formatPrice(item.estimatedCost)})
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="px-2.5 py-1 rounded-lg text-emerald-800 bg-emerald-50 border border-emerald-200 font-mono font-bold text-[11px] flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Inbound Delivery: ~{item.supplierLeadTimeHours}h</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

    </div>
  );
};
