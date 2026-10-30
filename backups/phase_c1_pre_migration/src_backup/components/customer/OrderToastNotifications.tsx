import React, { useState, useEffect, useRef } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { Order, OrderStatus } from '../../types';
import { 
  ChefHat, 
  Truck, 
  PackageCheck, 
  ShoppingBag, 
  Bell, 
  X, 
  CheckCircle2, 
  Clock, 
  Navigation,
  Sparkles
} from 'lucide-react';

export interface OrderToast {
  id: string;
  orderId: string;
  orderNumber: string;
  title: string;
  message: string;
  status: OrderStatus | 'picked_up' | 'out_for_delivery';
  timestamp: string;
  driverName?: string;
  businessName?: string;
  eta?: string;
}

export const OrderToastNotifications: React.FC = () => {
  const { orders } = useTuxi();
  const [toasts, setToasts] = useState<OrderToast[]>([]);
  const previousStatusMap = useRef<Record<string, OrderStatus>>({});
  const initialLoadDone = useRef<boolean>(false);

  // Helper to push a new toast notification
  const addToast = (toast: Omit<OrderToast, 'id' | 'timestamp'>) => {
    const newToast: OrderToast = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setToasts(prev => [newToast, ...prev].slice(0, 4)); // keep max 4 toasts on screen
  };

  // Listen for offline queue reconciliation event from Service Worker sync
  useEffect(() => {
    const handleOfflineSyncEvent = (e: Event) => {
      const customEvt = e as CustomEvent;
      const count = customEvt.detail?.syncedCount || 1;
      addToast({
        orderId: 'sync-reconcile',
        orderNumber: 'SYNC-SW',
        title: 'Connectivity Restored',
        message: `Reconciled ${count} queued order status inquiry! Driver telemetry and live ETA updated.`,
        status: 'in_transit',
        driverName: 'Alex Turner',
        businessName: 'Service Worker Sync',
        eta: '6-8 mins'
      });
    };

    window.addEventListener('tuxi-offline-sync-completed', handleOfflineSyncEvent);
    return () => {
      window.removeEventListener('tuxi-offline-sync-completed', handleOfflineSyncEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Watch for status changes across all customer orders
  useEffect(() => {
    if (!initialLoadDone.current) {
      // Record initial statuses on first mount without triggering toasts
      orders.forEach(o => {
        previousStatusMap.current[o.id] = o.status;
      });
      initialLoadDone.current = true;

      // Add one introductory banner toast for active in-transit order if present
      const activeInTransit = orders.find(o => o.status === 'in_transit');
      if (activeInTransit) {
        addToast({
          orderId: activeInTransit.id,
          orderNumber: activeInTransit.orderNumber,
          title: 'Out for Delivery',
          message: `Courier ${activeInTransit.driverName || 'Alex Turner'} is in transit with your order from ${activeInTransit.businessName}.`,
          status: 'in_transit',
          driverName: activeInTransit.driverName || 'Alex Turner',
          businessName: activeInTransit.businessName,
          eta: activeInTransit.estimatedDeliveryTime || '8 mins'
        });
      }
      return;
    }

    // Inspect transitions
    orders.forEach(order => {
      const prevStatus = previousStatusMap.current[order.id];
      if (prevStatus && prevStatus !== order.status) {
        handleStatusTransition(order, prevStatus, order.status);
      }
      previousStatusMap.current[order.id] = order.status;
    });
  }, [orders]);

  const handleStatusTransition = (order: Order, oldStatus: OrderStatus, newStatus: OrderStatus) => {
    if (newStatus === 'accepted' || (oldStatus === 'placed' && newStatus === 'preparing')) {
      addToast({
        orderId: order.id,
        orderNumber: order.orderNumber,
        title: 'Order Accepted',
        message: `${order.businessName} has accepted your order and began kitchen preparation.`,
        status: 'accepted',
        businessName: order.businessName
      });
    } else if (newStatus === 'driver_assigned' || (newStatus === 'ready' && oldStatus === 'preparing')) {
      addToast({
        orderId: order.id,
        orderNumber: order.orderNumber,
        title: 'Courier Assigned',
        message: `Courier ${order.driverName || 'Alex Turner'} has been assigned and is heading to the store.`,
        status: 'driver_assigned',
        driverName: order.driverName || 'Alex Turner',
        businessName: order.businessName
      });
    } else if (newStatus === 'in_transit') {
      addToast({
        orderId: order.id,
        orderNumber: order.orderNumber,
        title: 'Out for Delivery (Picked Up)',
        message: `Your courier has picked up the package from ${order.businessName} and is en route!`,
        status: 'in_transit',
        driverName: order.driverName || 'Alex Turner',
        businessName: order.businessName,
        eta: order.estimatedDeliveryTime || '6-8 mins'
      });
    } else if (newStatus === 'delivered') {
      addToast({
        orderId: order.id,
        orderNumber: order.orderNumber,
        title: 'Order Delivered',
        message: `Your order from ${order.businessName} has arrived safely at your doorstep!`,
        status: 'delivered',
        businessName: order.businessName
      });
    }
  };

  // Toast item auto-dismiss timer
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(0, prev.length - 1));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // Demo status simulation triggers
  const triggerDemoAlert = (type: 'accepted' | 'picked_up' | 'out_for_delivery' | 'delivered') => {
    const activeOrder = orders[0];
    const orderNum = activeOrder?.orderNumber || 'TX-8921';
    const storeName = activeOrder?.businessName || 'Artisan Woodfire & Bowls';

    if (type === 'accepted') {
      addToast({
        orderId: activeOrder?.id || 'demo-1',
        orderNumber: orderNum,
        title: 'Order Accepted',
        message: `${storeName} has accepted your order and began kitchen preparation.`,
        status: 'accepted',
        businessName: storeName
      });
    } else if (type === 'picked_up') {
      addToast({
        orderId: activeOrder?.id || 'demo-2',
        orderNumber: orderNum,
        title: 'Order Picked Up',
        message: `Courier Alex Turner has collected your items from ${storeName}.`,
        status: 'ready',
        driverName: 'Alex Turner',
        businessName: storeName
      });
    } else if (type === 'out_for_delivery') {
      addToast({
        orderId: activeOrder?.id || 'demo-3',
        orderNumber: orderNum,
        title: 'Out for Delivery',
        message: `Courier Alex Turner (Toyota Prius, LD21 WKY) is now on the way to your address!`,
        status: 'in_transit',
        driverName: 'Alex Turner',
        businessName: storeName,
        eta: '6 mins'
      });
    } else if (type === 'delivered') {
      addToast({
        orderId: activeOrder?.id || 'demo-4',
        orderNumber: orderNum,
        title: 'Order Delivered',
        message: `Your delivery has arrived. Proof of drop-off verified at your front door.`,
        status: 'delivered',
        businessName: storeName
      });
    }
  };

  return (
    <>
      {/* Toast Notification Container (Top-Right Floating Stack) */}
      <aside 
        aria-label="Order Status Notifications" 
        className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map(toast => {
          let icon = <Bell className="w-5 h-5 text-indigo-400" />;
          let accentBorder = 'border-indigo-500/40 bg-slate-900/95';
          let badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

          if (toast.title.includes('Accepted')) {
            icon = <ChefHat className="w-5 h-5 text-emerald-400" />;
            accentBorder = 'border-emerald-500/40 bg-slate-900/95';
            badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
          } else if (toast.title.includes('Picked Up')) {
            icon = <ShoppingBag className="w-5 h-5 text-amber-400" />;
            accentBorder = 'border-amber-500/40 bg-slate-900/95';
            badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
          } else if (toast.title.includes('Out for Delivery')) {
            icon = <Truck className="w-5 h-5 text-sky-400 animate-pulse" />;
            accentBorder = 'border-sky-500/50 bg-slate-900/95 ring-1 ring-sky-500/20';
            badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/30';
          } else if (toast.title.includes('Delivered')) {
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
            accentBorder = 'border-emerald-500/50 bg-slate-900/95';
            badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-2xl border text-white shadow-2xl backdrop-blur-md transition-all duration-300 animate-fade-in ${accentBorder}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/80 shrink-0 mt-0.5">
                    {icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-100">{toast.title}</span>
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold border uppercase ${badgeColor}`}>
                        #{toast.orderNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      {toast.message}
                    </p>
                    {toast.eta && (
                      <div className="flex items-center gap-1.5 text-[10px] text-sky-300 font-mono pt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>Estimated Arrival: {toast.eta}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors shrink-0"
                  title="Dismiss Notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Countdown Progress Bar */}
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-3">
                <div 
                  className="h-full bg-indigo-500/80 rounded-full animate-shrink-progress"
                  style={{ animationDuration: '6s' }}
                />
              </div>
            </div>
          );
        })}
      </aside>

      {/* Global Interactive Simulation Controls (for user testing) */}
      <div className="fixed bottom-2 left-4 z-30 hidden sm:flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-full text-white text-[11px] shadow-lg">
        <span className="text-slate-400 font-medium flex items-center gap-1">
          <Bell className="w-3 h-3 text-indigo-400" />
          <span>Test Toast Alerts:</span>
        </span>
        <button
          onClick={() => triggerDemoAlert('accepted')}
          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 border border-slate-700 text-slate-300 transition-colors"
        >
          Accepted
        </button>
        <button
          onClick={() => triggerDemoAlert('picked_up')}
          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-amber-950 hover:text-amber-300 border border-slate-700 text-slate-300 transition-colors"
        >
          Picked Up
        </button>
        <button
          onClick={() => triggerDemoAlert('out_for_delivery')}
          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-sky-950 hover:text-sky-300 border border-slate-700 text-slate-300 transition-colors"
        >
          Out for Delivery
        </button>
        <button
          onClick={() => triggerDemoAlert('delivered')}
          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 border border-slate-700 text-slate-300 transition-colors"
        >
          Delivered
        </button>
      </div>
    </>
  );
};
