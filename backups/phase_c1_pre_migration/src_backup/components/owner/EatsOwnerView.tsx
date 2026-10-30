import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { MenuItem, POSProvider } from '../../types';
import { 
  Store, 
  Clock, 
  ChefHat, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Sliders, 
  DollarSign, 
  TrendingUp, 
  Flame, 
  AlertCircle,
  Cpu,
  RefreshCw,
  Check,
  Printer,
  Wifi,
  Radio,
  FileText
} from 'lucide-react';

export const EatsOwnerView: React.FC = () => {
  const { 
    businesses, 
    updateBusiness, 
    orders, 
    updateOrderStatus, 
    config,
    syncStorePOS,
    connectStorePOS,
    togglePOS86Item
  } = useTuxi();

  // Find our live eats business (e.g. Artisan Woodfire & Bowls)
  const myRestaurant = businesses.find(b => b.type === 'eats' && b.status === 'live') || businesses.find(b => b.type === 'eats') || businesses[0];

  const [activeTab, setActiveTab] = useState<'live_orders' | 'menu_editor' | 'pos_integration' | 'analytics'>('live_orders');
  const [storeStatus, setStoreStatus] = useState<'open' | 'busy' | 'closed'>('open');
  const [selectedPOSProvider, setSelectedPOSProvider] = useState<POSProvider>('toast');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [posSyncFeedback, setPosSyncFeedback] = useState<string>('');

  const currentPos = myRestaurant?.posConfig || {
    provider: 'toast' as POSProvider,
    isConnected: true,
    merchantId: 'TOAST-LOC-88219',
    storeLocationId: 'REST-LDN-01',
    autoSyncInventory: true,
    auto86Items: true,
    autoSendOrdersToKitchenKDS: true,
    lastSyncTimestamp: new Date().toLocaleTimeString(),
    webhookStatus: 'active' as const
  };

  const handleRunPOSSync = () => {
    setIsSyncing(true);
    syncStorePOS(myRestaurant.id, selectedPOSProvider);
    setTimeout(() => {
      setIsSyncing(false);
      setPosSyncFeedback(`Successfully synchronized 14 menu items & live modifier stock with ${selectedPOSProvider.toUpperCase()} POS.`);
      setTimeout(() => setPosSyncFeedback(''), 4000);
    }, 1000);
  };

  // Filter incoming orders for this restaurant
  const liveKitchenOrders = orders.filter(o => 
    o.type === 'eats' && 
    (o.status === 'placed' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready')
  );

  const handleAcceptOrder = (orderId: string, prepMins: number) => {
    updateOrderStatus(orderId, 'preparing', {
      estimatedDeliveryTime: `${prepMins + 15} mins`
    });
  };

  const handleMarkReady = (orderId: string) => {
    updateOrderStatus(orderId, 'ready');
  };

  const handleToggleItemAvailability = (itemId: string) => {
    if (!myRestaurant.menuItems) return;
    const updated = myRestaurant.menuItems.map(item => 
      item.id === itemId ? { ...item, isAvailable: !item.isAvailable } : item
    );
    updateBusiness(myRestaurant.id, { menuItems: updated });
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
      
      {/* Restaurant Header & Status Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xl shrink-0">
            <ChefHat className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{myRestaurant.name}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                {myRestaurant.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate">{myRestaurant.category} · {myRestaurant.address}</p>
          </div>
        </div>

        {/* Kitchen Status Toggle */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto justify-between sm:justify-start shrink-0">
          <button
            onClick={() => setStoreStatus('open')}
            className={`flex-1 sm:flex-initial py-2 sm:py-1.5 px-2.5 sm:px-3 rounded-lg transition-colors text-center shrink-0 min-h-[36px] text-[11px] sm:text-xs ${
              storeStatus === 'open' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kitchen Open
          </button>
          <button
            onClick={() => setStoreStatus('busy')}
            className={`flex-1 sm:flex-initial py-2 sm:py-1.5 px-2.5 sm:px-3 rounded-lg transition-colors text-center shrink-0 min-h-[36px] text-[11px] sm:text-xs ${
              storeStatus === 'busy' ? 'bg-amber-500 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Busy (+15m)
          </button>
          <button
            onClick={() => setStoreStatus('closed')}
            className={`flex-1 sm:flex-initial py-2 sm:py-1.5 px-2.5 sm:px-3 rounded-lg transition-colors text-center shrink-0 min-h-[36px] text-[11px] sm:text-xs ${
              storeStatus === 'closed' ? 'bg-rose-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Paused
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto scrollbar-none pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 text-xs font-semibold min-w-max">
          <button
            onClick={() => setActiveTab('live_orders')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] ${
              activeTab === 'live_orders' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span>Live Kitchen Orders ({liveKitchenOrders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('menu_editor')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] ${
              activeTab === 'menu_editor' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Menu Items &amp; Availability</span>
          </button>
          <button
            onClick={() => setActiveTab('pos_integration')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] ${
              activeTab === 'pos_integration' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>POS Integration &amp; KDS</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] ${
              activeTab === 'analytics' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Sales &amp; Payouts</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE KITCHEN ORDERS */}
      {activeTab === 'live_orders' && (
        <div className="space-y-4">
          {liveKitchenOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center text-xs space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">Kitchen Queue is Clear</h3>
              <p className="text-slate-500">New customer orders placed on TUXI Eats will chime and display here instantly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveKitchenOrders.map(order => (
                <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="font-mono text-[10px] text-indigo-600 font-bold uppercase">
                        Order #{order.orderNumber}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900">{order.customerName}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      {order.status}
                    </span>
                  </div>

                  {/* Items to cook */}
                  <div className="space-y-2">
                    {order.items.map(item => (
                      <div key={item.id} className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800">{item.quantity}x {item.name}</span>
                          {item.selectedOptions && (
                            <span className="block text-[11px] text-indigo-600 font-medium">
                              + {item.selectedOptions.join(', ')}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-600 shrink-0">
                          {config.currencySymbol}{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.deliveryNotes && (
                    <div className="p-2 rounded bg-amber-50 text-amber-900 text-[11px]">
                      <strong>Customer Note:</strong> {order.deliveryNotes}
                    </div>
                  )}

                  {/* Prep Actions */}
                  <div className="pt-2 border-t border-slate-100">
                    {order.status === 'placed' && (
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={() => handleAcceptOrder(order.id, 15)}
                          className="flex-1 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors min-h-[38px]"
                        >
                          Accept (15m)
                        </button>
                        <button
                          onClick={() => handleAcceptOrder(order.id, 25)}
                          className="flex-1 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors min-h-[38px]"
                        >
                          Accept (25m)
                        </button>
                      </div>
                    )}

                    {order.status === 'preparing' && (
                      <button
                        onClick={() => handleMarkReady(order.id)}
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors min-h-[40px]"
                      >
                        <ChefHat className="w-4 h-4 text-emerald-400" />
                        <span>Mark Ready for Driver Pickup</span>
                      </button>
                    )}

                    {order.status === 'ready' && (
                      <div className="w-full text-center py-2.5 bg-slate-100 text-slate-600 rounded-lg font-medium">
                        Waiting for assigned courier arrival
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MENU EDITOR & AVAILABILITY */}
      {activeTab === 'menu_editor' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Menu Catalog &amp; 86-Item Quick Switch</h2>
              <p className="text-xs text-slate-500 mt-0.5">Toggle availability in real-time when kitchen ingredients run out.</p>
            </div>
          </div>

          <div className="space-y-3">
            {myRestaurant.menuItems?.map(item => (
              <div key={item.id} className="p-3 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 font-medium">{item.category}</span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">{item.description}</p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className="font-bold text-slate-900 tabular-nums">
                    {config.currencySymbol}{item.price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleToggleItemAvailability(item.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors min-h-[36px] min-w-[105px] text-center ${
                      item.isAvailable
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    {item.isAvailable ? 'Available' : 'Sold Out (86)'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: POS INTEGRATION SERVICE & KDS */}
      {activeTab === 'pos_integration' && (
        <div className="space-y-4 sm:space-y-6">
          
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600 shrink-0" />
                <h2 className="text-base font-bold text-slate-900">Eats Kitchen POS &amp; KDS Integration Service</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Direct two-way bridge connecting TUXI Eats with restaurant Point of Sale (POS) and Kitchen Display Systems (KDS).
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
              <span className="text-xs font-semibold text-slate-500">Live Webhook:</span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-mono font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ACTIVE (12ms)
              </span>
            </div>
          </div>

          {posSyncFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{posSyncFeedback}</span>
            </div>
          )}

          {/* Configuration Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {/* Left: POS Configuration */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5 text-xs">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">POS Provider &amp; API Credentials</h3>
                <p className="text-slate-500">Select your in-store POS hardware or cloud back-office.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'toast', label: 'Toast POS', desc: 'Restaurant & Kitchen KDS' },
                  { id: 'square', label: 'Square Restaurant', desc: 'Square Terminal & KDS' },
                  { id: 'clover', label: 'Clover Dining', desc: 'Station & Flex Devices' },
                  { id: 'lightspeed', label: 'Lightspeed O-Series', desc: 'Cloud Restaurant POS' },
                  { id: 'revel', label: 'Revel Systems', desc: 'Enterprise Hospitality' },
                  { id: 'custom_api', label: 'Custom REST API', desc: 'Direct Webhook Bridge' }
                ].map(provider => {
                  const isSelected = selectedPOSProvider === provider.id;
                  return (
                    <div
                      key={provider.id}
                      onClick={() => {
                        setSelectedPOSProvider(provider.id as POSProvider);
                        connectStorePOS(myRestaurant.id, { provider: provider.id as POSProvider });
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <span className="font-bold text-slate-900 block">{provider.label}</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">{provider.desc}</span>
                      {isSelected && (
                        <span className="inline-block mt-2 text-[10px] font-mono text-indigo-700 font-bold bg-indigo-100 px-1.5 py-0.2 rounded">
                          CONNECTED
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">POS Merchant / Franchise ID</label>
                  <input
                    type="text"
                    value={currentPos.merchantId}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50 text-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Store / Station Terminal ID</label>
                  <input
                    type="text"
                    value={currentPos.storeLocationId}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50 text-slate-700"
                  />
                </div>
              </div>

              {/* Automation Rules */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs">Real-Time POS Automation Engines:</h4>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-start gap-2.5">
                    <Printer className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">Auto-Send Orders Direct to Kitchen KDS</span>
                      <span className="text-slate-500 text-[11px]">
                        Orders placed on TUXI automatically appear on kitchen prep screens &amp; print to line ticket printers.
                      </span>
                    </div>
                  </div>
                  <span className="self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 shrink-0">
                    ENABLED
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-start gap-2.5">
                    <Radio className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">Instant 86-Item Stock Synchronization</span>
                      <span className="text-slate-500 text-[11px]">
                        When an ingredient or dish runs out at the physical till, TUXI instantly marks it unavailable.
                      </span>
                    </div>
                  </div>
                  <span className="self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 shrink-0">
                    ENABLED
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Sync Status & Actions */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col justify-between text-xs space-y-4">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 block mb-1">
                  POS Sync Operations
                </span>
                <h3 className="font-bold text-sm text-slate-900">Bidirectional Menu Bridge</h3>
                <p className="text-slate-500 mt-1 leading-relaxed">
                  Last successful sync with {selectedPOSProvider.toUpperCase()} occurred at{' '}
                  <strong className="text-slate-700">{currentPos.lastSyncTimestamp}</strong>.
                </p>

                <div className="mt-4 p-3 bg-white rounded-lg border border-slate-200 space-y-2 text-[11px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Mapped Menu Items:</span>
                    <strong className="text-slate-900 font-mono">14 dishes</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Modifier Groups:</span>
                    <strong className="text-slate-900 font-mono">6 sets</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Till Price Match:</span>
                    <strong className="text-emerald-600 font-semibold">100% Synced (5% Pickup Rate)</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <button
                  onClick={handleRunPOSSync}
                  disabled={isSyncing}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 min-h-[40px]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing POS Catalog...' : 'Sync Catalog from POS Now'}</span>
                </button>
                <p className="text-[10px] text-center text-slate-400">
                  Runs delta catalog comparison via webhooks.
                </p>
              </div>
            </div>

          </div>

          {/* Mapped POS Items Preview Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900">Live POS Item Mapping &amp; External IDs</h3>
            <div className="divide-y divide-slate-100">
              {myRestaurant.menuItems?.map(item => (
                <div key={item.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
                  <div>
                    <span className="font-bold text-slate-900">{item.name}</span>
                    <span className="text-slate-400 text-[11px] ml-2 font-mono">
                      POS SKU: {item.posSyncedId || `POS-${item.id.slice(-6).toUpperCase()}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="font-mono font-bold text-slate-800">
                      {config.currencySymbol}{item.price.toFixed(2)}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      item.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {item.isAvailable ? 'SYNCED / IN STOCK' : '86 / OUT OF STOCK'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
      {activeTab === 'analytics' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Merchant Financial Summary</h2>
            <p className="text-xs text-slate-500 mt-0.5">Automated settlement every Tuesday direct to business bank account.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 font-medium block">Total YTD Sales</span>
              <span className="text-2xl font-black text-slate-900 tabular-nums block mt-1">
                {config.currencySymbol}{myRestaurant.salesVolumeYtd.toLocaleString()}
              </span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 font-medium block">TUXI Platform Fee ({myRestaurant.commissionRate}%)</span>
              <span className="text-2xl font-black text-slate-700 tabular-nums block mt-1">
                {config.currencySymbol}{(myRestaurant.salesVolumeYtd * 0.15).toLocaleString()}
              </span>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-emerald-700 font-medium block">Net Payout Accrued</span>
              <span className="text-2xl font-black text-emerald-900 tabular-nums block mt-1">
                {config.currencySymbol}{(myRestaurant.salesVolumeYtd * 0.85).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
