import React, { useState, useEffect } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Business, 
  MenuItem, 
  ProductItem, 
  OrderCartItem, 
  Order,
  SavedPaymentMethod,
  PreviouslyViewedItem
} from '../../types';
import { InteractiveMap } from '../common/InteractiveMap';
import { LiveOrderDeliveryMap } from './LiveOrderDeliveryMap';
import { AIChatAssistantWidget } from './AIChatAssistantWidget';
import { OrderToastNotifications } from './OrderToastNotifications';
import { GroupOrderModal } from './GroupOrderModal';
import { PredictiveSearchBar } from './PredictiveSearchBar';
import { AILocationIntelligenceModal } from '../common/AILocationIntelligenceModal';
import { BiometricAuthModal } from '../common/BiometricAuthModal';
import { BiometricSecurityManager } from './BiometricSecurityManager';
import { getBiometricSettings } from '../../utils/biometricAuthService';
import { isDeviceOnline, queueOfflineInquiry } from '../../utils/offlineQueueService';
import { 
  Utensils, 
  ShoppingBag, 
  Truck, 
  Search, 
  Star, 
  Clock, 
  MapPin, 
  Navigation,
  Plus, 
  Minus, 
  Trash2, 
  ArrowRight, 
  MessageSquare, 
  CheckCircle2, 
  PackageCheck,
  Send,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Lock,
  Wallet,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  Tag,
  Scan,
  Users,
  UserPlus,
  DollarSign,
  RefreshCw,
  Wifi,
  WifiOff,
  Fingerprint,
  Flame,
  Zap
} from 'lucide-react';

const INITIAL_VIEWED_ITEMS: PreviouslyViewedItem[] = [
  {
    id: 'viewed-1',
    itemId: 'item-pizza-truffle',
    name: 'Truffle & Wild Mushroom Woodfire Pizza',
    price: 16.50,
    category: 'Italian & Woodfired',
    businessId: 'biz-01',
    businessName: 'Artisan Woodfire & Bowls',
    businessType: 'eats',
    viewedAt: '12m ago'
  },
  {
    id: 'viewed-2',
    itemId: 'item-poke-salmon',
    name: 'Spicy Salmon & Edamame Crunch Bowl',
    price: 14.00,
    category: 'Italian & Woodfired',
    businessId: 'biz-01',
    businessName: 'Artisan Woodfire & Bowls',
    businessType: 'eats',
    viewedAt: '25m ago'
  },
  {
    id: 'viewed-3',
    itemId: 'prod-avocados',
    name: 'Organic Hass Avocados (Pack of 4)',
    price: 3.50,
    category: 'Produce',
    businessId: 'biz-02',
    businessName: 'Green Grocer & Organic Market',
    businessType: 'shop',
    viewedAt: '1h ago'
  }
];

export const CustomerView: React.FC = () => {
  const { 
    businesses, 
    orders, 
    cart, 
    cartBusinessId, 
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    clearCart, 
    placeOrder, 
    config, 
    formatPrice,
    currentDriver,
    paymentMethods,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    t,
    language,
    groupOrderSession,
    startGroupOrder,
    aiLocationStatus,
    triggerAILocationDetection,
    setActiveRole,
    currentUser,
    setIsRepApplicantModalOpen,
    setIsDriverApplicantModalOpen
  } = useTuxi();

  const [activeTab, setActiveTab] = useState<'eats' | 'shop' | 'courier' | 'tracking' | 'payments'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['eats', 'shop', 'courier', 'tracking', 'payments'].includes(tab)) {
        return tab as any;
      }
    }
    return 'eats';
  });
  const [showAILocationModal, setShowAILocationModal] = useState<boolean>(false);
  const [showGroupOrderModal, setShowGroupOrderModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  // Modal item customization for Eats
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  // Selected product variant state map (productId -> variantId)
  const [selectedVariantByProd, setSelectedVariantByProd] = useState<Record<string, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  // Checkout modal
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [deliveryAddress, setDeliveryAddress] = useState<string>('24 City Road, Central District');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('Ring bell on arrival.');
  const [isPickup, setIsPickup] = useState<boolean>(false);

  // New Payment Card State
  const [showAddCardModal, setShowAddCardModal] = useState<boolean>(false);
  const [newCardNumber, setNewCardNumber] = useState<string>('');
  const [newCardBrand, setNewCardBrand] = useState<'visa' | 'mastercard' | 'amex'>('visa');
  const [newCardExpiry, setNewCardExpiry] = useState<string>('12/28');
  const [newCardTitle, setNewCardTitle] = useState<string>('Personal Card');
  const [newCardType, setNewCardType] = useState<'credit_card' | 'debit_card'>('credit_card');

  // Active tracking order
  const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const [trackedOrderId, setTrackedOrderId] = useState<string>(activeOrders[0]?.id || orders[0]?.id || '');

  // Courier booking state
  const [courierPickup, setCourierPickup] = useState<string>('55 Great Eastern St, Hub');
  const [courierDropoff, setCourierDropoff] = useState<string>('24 City Road, Central District');
  const [parcelType, setParcelType] = useState<string>('Document & Blueprint Tube');
  const [parcelWeight, setParcelWeight] = useState<number>(1.5);
  const [isFragile, setIsFragile] = useState<boolean>(true);

  // AI Support Assistant modal
  const [showSupport, setShowSupport] = useState<boolean>(false);
  const [supportMessages, setSupportMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    {
      role: 'ai',
      text: "Hello! I'm the TUXI AI Assistant. How can I help you today with your orders, deliveries, or payments?"
    }
  ]);
  const [userSupportInput, setUserSupportInput] = useState<string>('');

  // Search History & Previously Viewed Items
  const [previouslyViewedItems, setPreviouslyViewedItems] = useState<PreviouslyViewedItem[]>(() => {
    try {
      const saved = localStorage.getItem('tuxi_viewed_items');
      return saved ? JSON.parse(saved) : INITIAL_VIEWED_ITEMS;
    } catch {
      return INITIAL_VIEWED_ITEMS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tuxi_viewed_items', JSON.stringify(previouslyViewedItems));
    } catch (e) {
      console.warn('Could not save viewed items', e);
    }
  }, [previouslyViewedItems]);

  const recordViewedItem = (item: MenuItem | ProductItem, biz: Business) => {
    const newItem: PreviouslyViewedItem = {
      id: `viewed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      businessId: biz.id,
      businessName: biz.name,
      businessType: biz.type,
      viewedAt: 'Just now'
    };

    setPreviouslyViewedItems(prev => {
      const filtered = prev.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());
      return [newItem, ...filtered].slice(0, 10);
    });
  };

  const liveEats = businesses.filter(b => b.type === 'eats' && b.status === 'live');
  const liveShops = businesses.filter(b => b.type === 'shop' && b.status === 'live');

  const filteredEats = liveEats.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.menuItems?.some(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const filteredShops = liveShops.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.products?.some(prod => 
      prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Cart calculations with AI dynamic surge pricing & grocery 5% fee support (Brief monetization specs)
  const cartBiz = businesses.find(b => b.id === cartBusinessId);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Biometric Authentication State
  const [showBiometricModal, setShowBiometricModal] = useState<boolean>(false);
  const [biometricVerifiedDetails, setBiometricVerifiedDetails] = useState<{
    verified: boolean;
    method: 'FaceID' | 'TouchID' | 'WindowsHello' | 'Passkey';
    credentialId: string;
    verifiedAt: string;
  } | null>(null);

  // Standard flat delivery fee (AI dynamic surge pricing removed)
  const deliveryFee = (subtotal > 0 && !isPickup) ? 2.99 : 0;
  const serviceFee = subtotal > 0 ? 1.50 : 0;
  // 5% grocery service fee on Shop subtotals
  const groceryCustomerFee = (cartBiz?.type === 'shop' && subtotal > 0) 
    ? (subtotal * (config.monetization.groceryCustomerServiceFeePercent / 100)) 
    : 0;

  const grandTotal = subtotal + deliveryFee + serviceFee + groceryCustomerFee;

  const handleAddItemToCart = (item: MenuItem | ProductItem, biz: Business, selectedVariant?: any) => {
    let finalPrice = item.price;
    let displayName = item.name;
    let variantSku = (item as ProductItem).sku;
    let variantId = undefined;

    if (selectedVariant) {
      variantId = selectedVariant.id;
      finalPrice = item.price + (selectedVariant.priceDelta || 0);
      displayName = `${item.name} (${selectedVariant.name})`;
      variantSku = selectedVariant.sku || variantSku;
    }

    const cartItem: OrderCartItem = {
      id: `cart-${Date.now()}-${Math.random()}`,
      itemId: item.id,
      variantId,
      sku: variantSku,
      name: displayName,
      price: finalPrice,
      quantity: 1,
      selectedOptions: selectedModifiers.length > 0 ? selectedModifiers : undefined
    };
    addToCart(cartItem, biz.id);
    setCustomizingItem(null);
    setSelectedModifiers([]);
    recordViewedItem(item, biz);
  };

  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState<boolean>(false);

  const handleRefreshOrderStatusTelemetry = (targetOrder: Order) => {
    setIsRefreshingTelemetry(true);
    if (!isDeviceOnline()) {
      queueOfflineInquiry({
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        inquiryType: 'status_refresh',
        promptText: `Status & ETA inquiry for Order #${targetOrder.orderNumber}`
      });
      setTimeout(() => {
        setIsRefreshingTelemetry(false);
      }, 500);
      return;
    }

    setTimeout(() => {
      setIsRefreshingTelemetry(false);
    }, 700);
  };

  const handleCheckoutSubmit = (authDetailsOverride?: {
    verified: boolean;
    method: 'FaceID' | 'TouchID' | 'WindowsHello' | 'Passkey';
    credentialId: string;
    verifiedAt: string;
  }) => {
    const selectedPm = paymentMethods.find(p => p.id === selectedPaymentMethodId) || paymentMethods[0];
    const finalTip = isPickup ? 0 : 2.50;
    const finalTotal = grandTotal + finalTip;

    // Biometric Security Policy Enforcement for Large Payments
    const bioSettings = getBiometricSettings();
    const isLargePayment = bioSettings.isEnabled && bioSettings.requireForLargePayments && (finalTotal >= bioSettings.largePaymentThreshold);

    if (isLargePayment && !authDetailsOverride && !biometricVerifiedDetails) {
      setShowBiometricModal(true);
      return;
    }

    const appliedBioAuth = authDetailsOverride || biometricVerifiedDetails;

    let groupDetails = undefined;
    if (groupOrderSession) {
      const memberCount = groupOrderSession.members.length;
      const memberShares = groupOrderSession.members.map(member => {
        const memberItems = cart.filter(i => i.addedByMemberId === member.id);
        const memberItemSubtotal = memberItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

        let amountPaid = 0;
        if (groupOrderSession.splitMode === 'equal') {
          amountPaid = finalTotal / memberCount;
        } else if (groupOrderSession.splitMode === 'host_pays') {
          amountPaid = member.isHost ? finalTotal : 0;
        } else {
          const feesAndTip = deliveryFee + serviceFee + groceryCustomerFee + finalTip;
          const proportion = subtotal > 0 ? memberItemSubtotal / subtotal : 0;
          amountPaid = memberItemSubtotal + (feesAndTip * proportion);
        }

        return {
          id: member.id,
          name: member.name,
          email: member.email,
          amountPaid,
          paymentMethodTitle: member.paymentMethodTitle || (member.isHost ? selectedPm.title : 'Apple Pay'),
          status: 'charged' as const
        };
      });

      groupDetails = {
        code: groupOrderSession.code,
        splitMode: groupOrderSession.splitMode,
        members: memberShares
      };
    }

    const newOrder = placeOrder({
      customerId: 'cust-01',
      customerName: 'Emma Watson',
      customerPhone: '+44 7700 900111',
      customerAddress: isPickup ? `Pickup: ${cartBiz?.name}` : deliveryAddress,
      customerCoords: { lat: 51.5250, lng: -0.0870 },
      type: cartBiz?.type || 'eats',
      businessId: cartBiz?.id,
      businessName: cartBiz?.name,
      businessCoords: cartBiz?.location || { lat: 51.5205, lng: -0.0718 },
      items: [...cart],
      subtotal,
      deliveryFee,
      serviceFee,
      groceryFee: groceryCustomerFee,
      tip: finalTip,
      total: finalTotal,
      estimatedDeliveryTime: isPickup ? '15-20 min (Pickup)' : '30-40 min',
      deliveryNotes,
      isPickupOrder: isPickup,
      fulfillmentType: cartBiz?.shopFulfillmentType || 'merchant_pack',
      isGroupOrder: !!groupOrderSession,
      groupOrderDetails: groupDetails,
      biometricAuthDetails: appliedBioAuth ? {
        ...appliedBioAuth,
        thresholdApplied: bioSettings.largePaymentThreshold
      } : undefined
    });

    setBiometricVerifiedDetails(null);
    setShowCheckout(false);
    setTrackedOrderId(newOrder.id);
    setActiveTab('tracking');
  };

  const handleBookCourier = () => {
    const courierFee = 16.50;
    const newOrder = placeOrder({
      customerId: 'cust-01',
      customerName: 'Emma Watson',
      customerPhone: '+44 7700 900111',
      customerAddress: courierDropoff,
      customerCoords: { lat: 51.5250, lng: -0.0870 },
      type: 'courier',
      businessName: 'TUXI Direct Courier Service',
      businessCoords: { lat: 51.5242, lng: -0.0815 },
      items: [
        {
          id: `item-${Date.now()}`,
          itemId: 'courier-parcel',
          name: `${parcelType} (${parcelWeight} kg)`,
          price: courierFee,
          quantity: 1
        }
      ],
      subtotal: courierFee,
      deliveryFee: 3.50,
      serviceFee: 1.00,
      tip: 2.00,
      total: courierFee + 3.50 + 1.00 + 2.00,
      estimatedDeliveryTime: '20-30 min',
      courierDetails: {
        packageType: parcelType,
        weightKg: parcelWeight,
        isFragile,
        pickupNotes: `Collect from: ${courierPickup}`,
        dropoffNotes: `Deliver to: ${courierDropoff}`
      }
    });

    setTrackedOrderId(newOrder.id);
    setActiveTab('tracking');
  };

  const handleAddNewCard = (e: React.FormEvent) => {
    e.preventDefault();
    const lastFour = newCardNumber.replace(/\s+/g, '').slice(-4) || '9901';
    addPaymentMethod({
      type: newCardType,
      title: `${newCardTitle} (••• ${lastFour})`,
      lastFour,
      brand: newCardBrand,
      expiry: newCardExpiry,
      isDefault: false
    });
    setNewCardNumber('');
    setShowAddCardModal(false);
  };

  const handleSendSupportMessage = () => {
    if (!userSupportInput.trim()) return;
    const query = userSupportInput;
    const newMessages = [...supportMessages, { role: 'user' as const, text: query }];
    setSupportMessages(newMessages);
    setUserSupportInput('');

    setTimeout(() => {
      let reply = `I've checked the live dispatch network in ${config.activeCityName}. Driver Alex Turner is active and your order is on track.`;
      if (query.toLowerCase().includes('cash')) {
        reply = "TUXI enforces a strict 100% Cashless Policy across all Eats, Shop, and Courier services to protect couriers and streamline contactless dropoffs.";
      } else if (query.toLowerCase().includes('pos')) {
        reply = "Orders placed on TUXI are automatically injected into the merchant's POS (Toast, Square, Clover, Lightspeed) kitchen display system.";
      }
      setSupportMessages(prev => [...prev, { role: 'ai', text: reply }]);
    }, 600);
  };

  const trackedOrder = orders.find(o => o.id === trackedOrderId) || orders[0];
  const activePaymentMethod = paymentMethods.find(p => p.id === selectedPaymentMethodId) || paymentMethods[0];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
      
      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setActiveTab('eats'); setSelectedBusiness(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'eats' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>TUXI {t('eats', 'Eats')}</span>
          </button>
          <button
            onClick={() => { setActiveTab('shop'); setSelectedBusiness(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'shop' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>TUXI {t('shop', 'Shop')}</span>
          </button>
          <button
            onClick={() => { setActiveTab('courier'); setSelectedBusiness(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'courier' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>TUXI {t('courier', 'Courier')}</span>
          </button>
          <button
            onClick={() => { setActiveTab('tracking'); setSelectedBusiness(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'tracking' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-rose-500" />
            <span>Track My Order (Google Maps)</span>
            {orders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-indigo-100 text-indigo-800">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('payments'); setSelectedBusiness(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'payments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
            <span>{t('payments', 'Payment Methods')}</span>
          </button>

          {/* TUXI Delivery Driver Direct Access Button */}
          <button
            onClick={() => {
              if (currentUser?.roles?.includes('TUXI_DELIVERY_DRIVER')) {
                setActiveRole('driver');
              } else {
                setIsDriverApplicantModalOpen(true);
              }
            }}
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs ml-auto sm:ml-0 cursor-pointer"
            title="TUXI Delivery Driver & Courier Portal"
          >
            <Truck className="w-3.5 h-3.5 text-emerald-200" />
            <span>🚚 TUXI Driver</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/20 font-mono font-bold text-emerald-100 uppercase">
              {currentUser?.roles?.includes('TUXI_DELIVERY_DRIVER') ? 'COCKPIT' : 'APPLY'}
            </span>
          </button>

          {/* TUXI Rep Direct Access Button */}
          <button
            onClick={() => {
              if (currentUser?.roles?.includes('TUXI_REP')) {
                setActiveRole('rep');
              } else {
                setIsRepApplicantModalOpen(true);
              }
            }}
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-xs cursor-pointer"
            title="Open TUXI Rep Portal (Field Sales & Merchant Acquisition)"
          >
            <Users className="w-3.5 h-3.5 text-cyan-200" />
            <span>💼 TUXI Rep</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/20 font-mono font-bold text-cyan-100 uppercase">
              {currentUser?.roles?.includes('TUXI_REP') ? 'PORTAL' : 'APPLY'}
            </span>
          </button>
        </div>

        {/* Search & Support Button */}
        <div className="flex items-center gap-3">
          {(activeTab === 'eats' || activeTab === 'shop') && (
            <PredictiveSearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              activeTab={activeTab}
              onSelectBusiness={(biz) => {
                setSelectedBusiness(biz);
                if (activeTab !== biz.type) {
                  setActiveTab(biz.type);
                }
              }}
              onAddItemToCart={handleAddItemToCart}
              previouslyViewedItems={previouslyViewedItems}
              onClearViewedItems={() => setPreviouslyViewedItems([])}
              className="w-full sm:w-80 md:w-96"
            />
          )}

          <button
            onClick={() => setShowGroupOrderModal(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition-colors border ${
              groupOrderSession
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
            title="Start or manage a group order with friends"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              {groupOrderSession 
                ? `Group (${groupOrderSession.members.length})` 
                : 'Group Order'}
            </span>
          </button>

          <button
            onClick={() => setShowSupport(true)}
            className="px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-medium rounded-lg flex items-center gap-1.5 shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">AI Support</span>
          </button>
        </div>
      </div>


      {/* AI Autonomous Location & Country Intelligence Banner */}
      <div className="mb-4 p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/60 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-cyan-300 shadow-xs border border-indigo-500/50 shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-indigo-300 font-semibold uppercase tracking-wider">AI Detected Location:</span>
              <span className="font-black text-sm text-white tracking-tight">
                {config.activeCityName}, {config.activeCountry}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                {config.activeCountryCode}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {config.currencySymbol} ({config.currencyCode})
              </span>
              <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                GEMINI 3.8 FLASH
              </span>
              {aiLocationStatus.lastResult?.aiConfidenceScore && (
                <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {Math.round(aiLocationStatus.lastResult.aiConfidenceScore * 100)}% CONFIDENCE
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 mt-1 line-clamp-1">
              {aiLocationStatus.lastResult?.aiReasoning || `Autonomously synthesized device network, GPS, and timezone signals to localize marketplace stores, couriers, and currency.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            onClick={() => triggerAILocationDetection()}
            disabled={aiLocationStatus.isDetecting}
            className="px-3 py-1.5 bg-indigo-900/80 hover:bg-indigo-800 disabled:opacity-50 text-indigo-100 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 border border-indigo-700/60"
            title="Re-run Gemini AI Geospatial Detection"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-300 ${aiLocationStatus.isDetecting ? 'animate-spin' : ''}`} />
            <span>{aiLocationStatus.isDetecting ? 'Detecting...' : 'Re-Detect'}</span>
          </button>
          <button
            onClick={() => setShowAILocationModal(true)}
            className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-slate-950" />
            <span>AI Signals &amp; Intel</span>
          </button>
        </div>
      </div>

      {/* Live Order Active Google Maps Quick Tracking Banner */}
      {trackedOrder && trackedOrder.status !== 'delivered' && trackedOrder.status !== 'cancelled' && activeTab !== 'tracking' && (
        <div className="mb-4 p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/60 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <MapPin className="w-4 h-4 text-cyan-300 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs">Live Order in Progress: #{trackedOrder.orderNumber}</span>
                <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {trackedOrder.status.replace('_', ' ')}
                </span>
                <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  GOOGLE MAPS
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {trackedOrder.businessName} courier en route to {trackedOrder.customerAddress}. View real-time satellite radar and turn-by-turn ETA.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('tracking');
                setSelectedBusiness(null);
              }}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Track on Google Maps</span>
            </button>
          </div>
        </div>
      )}

      {/* Group Order Active Sticky Notification Banner */}
      {groupOrderSession && (activeTab === 'eats' || activeTab === 'shop') && (
        <div className="mb-6 p-3.5 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-700/60 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs">Group Order Active: {groupOrderSession.businessName}</span>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                  CODE: {groupOrderSession.code}
                </span>
                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                  Split: {groupOrderSession.splitMode.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {groupOrderSession.members.length} member{groupOrderSession.members.length > 1 ? 's' : ''} in shared cart · Everyone pays their share automatically at checkout.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowGroupOrderModal(true)}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              Manage Group &amp; Split
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: TUXI EATS */}
      {activeTab === 'eats' && (
        <div className="space-y-6">
          

          {!selectedBusiness ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {searchQuery ? `Search Results for "${searchQuery}"` : `Featured Kitchens in ${config.activeCityName}`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {searchQuery 
                      ? `Found ${filteredEats.length} matching restaurants & dishes` 
                      : 'Direct delivery & pickup from top-rated restaurants with synced POS menus'}
                  </p>
                </div>
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg"
                  >
                    <span>Clear Filter</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">{filteredEats.length} open restaurants</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredEats.map(biz => (
                  <div
                    key={biz.id}
                    onClick={() => setSelectedBusiness(biz)}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="relative h-44 overflow-hidden bg-slate-100">
                      <img
                        src={biz.bannerImage}
                        alt={biz.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded text-[11px] font-bold text-slate-900 flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span>{biz.rating}</span>
                        <span className="text-slate-400 font-normal">({biz.reviewCount})</span>
                      </div>

                      {/* POS Synced Badge */}
                      {biz.posConfig?.isConnected && (
                        <div className="absolute bottom-3 left-3 bg-slate-950/80 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 backdrop-blur-xs">
                          <Check className="w-2.5 h-2.5" />
                          <span>{biz.posConfig.provider.toUpperCase()} POS Synced</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {biz.name}
                        </h3>
                        <span className="text-[11px] text-slate-500 font-medium">{biz.prepTimeMinutes} mins</span>
                      </div>
                      <p className="text-xs text-slate-500">{biz.category} · {biz.address}</p>
                      
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-mono">
                          Delivery: {formatPrice(2.99)}
                        </span>
                        <span className="font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                          View Menu <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Restaurant Menu View
            <div className="space-y-6">
              <button
                onClick={() => setSelectedBusiness(null)}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
              >
                ← Back to all restaurants
              </button>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{selectedBusiness.name}</h1>
                  <p className="text-xs text-slate-500 mt-1">{selectedBusiness.category} · {selectedBusiness.address}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-600 mt-3 font-medium">
                    <span className="flex items-center gap-1 text-amber-600 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-500" />
                      {selectedBusiness.rating} ({selectedBusiness.reviewCount} reviews)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {selectedBusiness.openingHours}
                    </span>
                    {selectedBusiness.posConfig?.isConnected && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono text-[10px]">
                          Live {selectedBusiness.posConfig.provider.toUpperCase()} KDS Integrated
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Monetization Plan</span>
                  <span className="font-semibold text-xs text-slate-800 capitalize">
                    {selectedBusiness.eatsPlan || 'Premium'} ({selectedBusiness.commissionRate}% Commission)
                  </span>
                </div>
              </div>

              {/* Menu Categories */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Menu Selections</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedBusiness.menuItems?.map(item => (
                    <div
                      key={item.id}
                      className={`bg-white border rounded-xl p-4 flex justify-between gap-4 shadow-xs ${
                        item.isAvailable ? 'border-slate-200' : 'border-rose-200 bg-rose-50/20 opacity-75'
                      }`}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{item.name}</span>
                          {!item.isAvailable && (
                            <span className="text-[10px] font-mono text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-bold">
                              86 / Sold Out
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                        <div className="text-sm font-bold text-slate-900 pt-2 tabular-nums">
                          {formatPrice(item.price)}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end justify-end">
                        <button
                          disabled={!item.isAvailable}
                          onClick={() => {
                            if (item.modifiers && item.modifiers.length > 0) {
                              setCustomizingItem(item);
                              recordViewedItem(item, selectedBusiness);
                            } else {
                              handleAddItemToCart(item, selectedBusiness);
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{item.isAvailable ? 'Add' : 'Unavailable'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TUXI SHOP */}
      {activeTab === 'shop' && (
        <div className="space-y-6">
          

          {!selectedBusiness ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {searchQuery ? `Search Results for "${searchQuery}"` : `Retailers, Grocers & Pharmacies in ${config.activeCityName}`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {searchQuery 
                      ? `Found ${filteredShops.length} matching stores & grocery items` 
                      : 'Everyday essentials delivered in under 45 minutes'}
                  </p>
                </div>
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg"
                  >
                    <span>Clear Filter</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">{filteredShops.length} stores active</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredShops.map(biz => (
                  <div
                    key={biz.id}
                    onClick={() => setSelectedBusiness(biz)}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="relative h-44 overflow-hidden bg-slate-100">
                      <img
                        src={biz.bannerImage}
                        alt={biz.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded text-[11px] font-bold text-slate-900 flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span>{biz.rating}</span>
                      </div>
                      
                      <div className="absolute bottom-3 left-3 bg-slate-950/80 text-cyan-300 px-2 py-0.5 rounded text-[10px] font-mono backdrop-blur-xs">
                        {biz.shopFulfillmentType === 'shop_and_deliver' ? 'Aisle Shop & Deliver' : 'Merchant Pick & Pack'}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {biz.name}
                      </h3>
                      <p className="text-xs text-slate-500">{biz.category} · {biz.address}</p>
                      
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">5% Grocery Fee on Items</span>
                        <span className="font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                          Shop Products <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Shop Catalog View
            <div className="space-y-6">
              <button
                onClick={() => setSelectedBusiness(null)}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
              >
                ← Back to all shops
              </button>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{selectedBusiness.name}</h1>
                  <p className="text-xs text-slate-500 mt-1">{selectedBusiness.category} · {selectedBusiness.address}</p>
                </div>
                <div className="text-xs text-slate-500">
                  Hours: <strong>{selectedBusiness.openingHours}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedBusiness.products?.map(prod => {
                  const hasVariants = prod.variants && prod.variants.length > 0;
                  const currentVariantId = selectedVariantByProd[prod.id] || (hasVariants ? prod.variants![0].id : '');
                  const currentVariant = hasVariants ? prod.variants!.find(v => v.id === currentVariantId) || prod.variants![0] : null;

                  const effectivePrice = currentVariant 
                    ? prod.price + (currentVariant.priceDelta || 0)
                    : prod.price;
                  const effectiveStock = (currentVariant ? (currentVariant.stockCount ?? currentVariant.stock) : (prod.stockCount ?? prod.stock)) ?? 0;
                  const isAvailable = Boolean(currentVariant ? currentVariant.inStock : prod.inStock);

                  return (
                    <div key={prod.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">{prod.name}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                            isAvailable && effectiveStock > 0 
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' 
                              : 'text-rose-700 bg-rose-50 border border-rose-200'
                          }`}>
                            {isAvailable && effectiveStock > 0 ? `${effectiveStock} in stock` : 'Out of Stock'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{prod.description}</p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] font-mono text-slate-400">
                            SKU: {currentVariant?.sku || prod.sku}
                          </span>
                          {prod.isOnSale && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-500 text-white rounded">
                              ON SALE
                            </span>
                          )}
                        </div>

                        {/* Product Variant Selector */}
                        {hasVariants && (
                          <div className="mt-3">
                            <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                              Select Variant:
                            </label>
                            <select
                              value={currentVariantId}
                              onChange={(e) => setSelectedVariantByProd(prev => ({ ...prev, [prod.id]: e.target.value }))}
                              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            >
                              {prod.variants!.map(v => {
                                const vStock = (v.stockCount ?? v.stock ?? 0);
                                const vDelta = (v.priceDelta ?? 0);
                                return (
                                  <option key={v.id} value={v.id} disabled={!v.inStock || vStock <= 0}>
                                    {v.name} {vDelta !== 0 ? `(${vDelta > 0 ? '+' : ''}${formatPrice(vDelta)})` : ''} {!v.inStock || vStock <= 0 ? '(Sold Out)' : `[${vStock} left]`}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-sm font-bold text-slate-900 tabular-nums">
                          {formatPrice(effectivePrice)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddItemToCart(prod, selectedBusiness, currentVariant)}
                            disabled={!isAvailable || effectiveStock <= 0}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors ${
                              isAvailable && effectiveStock > 0
                                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAvailable && effectiveStock > 0 ? 'Add' : 'Sold Out'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TUXI COURIER */}
      {activeTab === 'courier' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">TUXI Courier: Point-to-Point Instant Delivery</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Send parcels, documents, or keys across {config.activeCityName} with real-time GPS tracking and digital signature proof.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pickup Address *</label>
                <input
                  type="text"
                  value={courierPickup}
                  onChange={e => setCourierPickup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Drop-off Destination Address *</label>
                <input
                  type="text"
                  value={courierDropoff}
                  onChange={e => setCourierDropoff(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Parcel Contents Description</label>
                <input
                  type="text"
                  value={parcelType}
                  onChange={e => setParcelType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estimated Weight (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={parcelWeight}
                    onChange={e => setParcelWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isFragile}
                      onChange={e => setIsFragile(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span>Fragile / High-Priority Handling</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Live Pricing Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between text-xs space-y-4">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 block mb-1">
                  Guaranteed Instant Dispatch
                </span>
                <h3 className="font-bold text-sm text-slate-900">Estimated Delivery: 25 - 35 mins</h3>
                <p className="text-slate-500 mt-1">Direct courier with GPS telemetry and mandatory signature.</p>

                <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Courier Rate:</span>
                    <span className="font-mono">{formatPrice(16.50)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Priority Surcharge:</span>
                    <span className="font-mono">{formatPrice(3.50)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Service &amp; Insurance:</span>
                    <span className="font-mono">{formatPrice(1.00)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-slate-200">
                    <span>Total Courier Fee:</span>
                    <span className="font-mono">{formatPrice(21.00)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleBookCourier}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <Truck className="w-4 h-4" />
                <span>Confirm Courier Booking</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TRACK ORDERS */}
      {activeTab === 'tracking' && (
        <div className="space-y-6">
          {/* Multi-Order Switcher Bar */}
          {orders.length > 1 && (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap flex items-center gap-1.5">
                <PackageCheck className="w-4 h-4 text-indigo-600" />
                <span>Select Order ({orders.length}):</span>
              </span>
              <div className="flex items-center gap-1.5">
                {orders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setTrackedOrderId(o.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
                      o.id === trackedOrder?.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    #{o.orderNumber} · {o.businessName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {trackedOrder ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
              
              {/* Header: Order info, payment method & Inquiry Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Order #{trackedOrder.orderNumber}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {trackedOrder.status.replace('_', ' ')}
                    </span>
                    {!isDeviceOnline() && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <WifiOff className="w-3 h-3 text-amber-600" />
                        <span>Offline Queuing Ready</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {trackedOrder.businessName} → {trackedOrder.customerAddress}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Order Status & Telemetry Inquiry Trigger */}
                  <button
                    onClick={() => handleRefreshOrderStatusTelemetry(trackedOrder)}
                    disabled={isRefreshingTelemetry}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                      !isDeviceOnline()
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 animate-pulse'
                        : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                    }`}
                    title={!isDeviceOnline() ? 'Queue inquiry in Service Worker while offline' : 'Refresh real-time driver telemetry'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTelemetry ? 'animate-spin' : ''}`} />
                    <span>
                      {isRefreshingTelemetry
                        ? 'Querying...'
                        : !isDeviceOnline()
                          ? 'Queue Offline Status Inquiry'
                          : 'Inquire Status & ETA'}
                    </span>
                  </button>

                  <div className="text-right pl-3 border-l border-slate-100 hidden sm:block">
                    <span className="text-[11px] text-slate-400 block">Payment Method</span>
                    <span className="text-xs font-bold text-slate-900 flex items-center justify-end gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{trackedOrder.paymentMethod?.title || 'Card Ending in 4242'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Offline Warning Notice if currently disconnected */}
              {!isDeviceOnline() && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0">
                      <WifiOff className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-bold block text-slate-900">Offline Dispatch Inquiry Protection</span>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Inquiries clicked while offline are saved to local Service Worker storage and will automatically synchronize when your network connection is restored.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded shrink-0">
                    SW STORAGE
                  </span>
                </div>
              )}

              {/* Stepper Lifecycle */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
                {[
                  { status: 'placed', label: '1. Placed' },
                  { status: 'preparing', label: '2. Kitchen / Packing' },
                  { status: 'driver_assigned', label: '3. Courier Dispatched' },
                  { status: 'in_transit', label: '4. In Transit' },
                  { status: 'delivered', label: '5. Delivered' },
                ].map((stepItem, idx) => {
                  const statuses = ['placed', 'preparing', 'driver_assigned', 'in_transit', 'delivered'];
                  const currentIdx = statuses.indexOf(trackedOrder.status === 'ready' ? 'preparing' : trackedOrder.status);
                  const isPassed = currentIdx >= idx;

                  return (
                    <div
                      key={stepItem.status}
                      className={`p-2.5 rounded-lg border font-semibold ${
                        isPassed
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {stepItem.label}
                    </div>
                  );
                })}
              </div>

              {/* Interactive Live Route Map with Moving Driver Telemetry & Geolocation */}
              <LiveOrderDeliveryMap
                order={trackedOrder}
                driver={currentDriver}
              />

              {/* Group Order Split Breakdown Receipt */}
              {trackedOrder.isGroupOrder && trackedOrder.groupOrderDetails && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-xs text-indigo-950">Group Order Split Settlement</span>
                      <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-indigo-200 text-indigo-900 uppercase">
                        Code: {trackedOrder.groupOrderDetails.code}
                      </span>
                      <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-slate-200 text-slate-800 uppercase">
                        {trackedOrder.groupOrderDetails.splitMode.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>All Member Splits Settled</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {trackedOrder.groupOrderDetails.members.map((mbr, idx) => (
                      <div key={idx} className="p-2.5 bg-white border border-indigo-100 rounded-lg text-xs space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{mbr.name}</span>
                          <span className="font-mono font-bold text-indigo-700">{formatPrice(mbr.amountPaid)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {mbr.paymentMethodTitle} · Token Charged
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 shadow-xs">
              <PackageCheck className="w-12 h-12 text-slate-300 mx-auto" />
              <div>
                <h3 className="text-base font-bold text-slate-900">No Orders in Tracking</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Browse kitchens or grocers to place an order, or send parcels point-to-point with TUXI Courier.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('eats')}
                  className="px-4 py-2 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
                >
                  Browse TUXI Eats
                </button>
                <button
                  onClick={() => setActiveTab('shop')}
                  className="px-4 py-2 bg-white text-slate-700 border border-slate-200 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Explore TUXI Shop
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PAYMENT METHOD MANAGEMENT (Mandatory Brief Section) */}
      {activeTab === 'payments' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Payment Methods &amp; Digital Wallets</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Save credit cards, debit cards, and digital wallets for instantaneous checkout across TUXI.
              </p>
            </div>

            <button
              onClick={() => setShowAddCardModal(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Card</span>
            </button>
          </div>

          {/* Cashless Policy Banner (Safety Clause) */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-start gap-3 text-amber-950">
            <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-sm">100% Cashless Platform Policy (No-Cash Safety Enforcement)</span>
              <p className="text-amber-900 mt-1 leading-relaxed">
                To guarantee driver security against robbery and ensure sanitary contactless handoffs, TUXI operates on a strictly cashless basis. All orders are authorized digitally via tokenized credit/debit cards, Apple Pay, Google Pay, or PayPal. Couriers carry zero cash floats.
              </p>
            </div>
          </div>

          {/* Saved Payment Methods Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentMethods.map(pm => {
              const isSelected = pm.id === selectedPaymentMethodId;
              return (
                <div
                  key={pm.id}
                  onClick={() => setSelectedPaymentMethodId(pm.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className={`w-5 h-5 ${isSelected ? 'text-indigo-600' : 'text-slate-600'}`} />
                      <span className="font-bold text-sm text-slate-900">{pm.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {pm.isDefault && (
                        <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          DEFAULT
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-mono bg-indigo-600 text-white px-2 py-0.5 rounded font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200/60">
                    <span className="font-mono text-[11px]">
                      {pm.lastFour ? `Card ending in •••• ${pm.lastFour}` : 'Digital Token'}
                    </span>
                    {pm.expiry && <span>Expires {pm.expiry}</span>}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    {!pm.isDefault ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDefaultPaymentMethod(pm.id);
                        }}
                        className="text-indigo-600 hover:underline font-semibold text-[11px]"
                      >
                        Set as Default
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Default checkout payment</span>
                    )}

                    {paymentMethods.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePaymentMethod(pm.id);
                        }}
                        className="text-rose-500 hover:text-rose-700 p-1"
                        title="Delete payment method"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Biometric Authentication (Face ID / Touch ID) & Passkey Settings */}
          <BiometricSecurityManager className="mt-6" />
        </div>
      )}

      {/* Floating Basket Drawer / Bar */}
      {cart.length > 0 && !showCheckout && (
        <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 z-40 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between sm:justify-start gap-3 sm:gap-6 max-w-md animate-fade-in pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">Your Current Basket</div>
            <div className="text-xs sm:text-sm font-bold truncate">{cart.length} item{cart.length > 1 ? 's' : ''} · {formatPrice(grandTotal)}</div>
          </div>
          <button
            onClick={() => setShowCheckout(true)}
            className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
            aria-label={`Checkout: ${formatPrice(grandTotal)}`}
          >
            <span>Checkout</span>
            <span className="hidden sm:inline">({formatPrice(grandTotal)})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs max-h-[92vh] sm:max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Confirm Order &amp; Payment</h2>
              <button onClick={() => setShowCheckout(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Delivery vs Pickup Toggle */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setIsPickup(false)}
                className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                  !isPickup ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setIsPickup(true)}
                className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                  isPickup ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Store Pickup (Save Delivery Fee)
              </button>
            </div>

            {/* Order Items */}
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <div>
                    <span className="font-bold text-slate-800">{item.name}</span>
                    {item.selectedOptions && (
                      <span className="block text-[11px] text-slate-400">{item.selectedOptions.join(', ')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{formatPrice(item.price * item.quantity)}</span>
                    <button onClick={() => removeFromCart(item.id)} className="text-rose-500 hover:text-rose-700 p-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Method Selector for Checkout */}
            <div className="space-y-1.5 border-t border-slate-100 pt-3">
              <label className="block font-semibold text-slate-700">Payment Method (Cashless Only):</label>
              <select
                value={selectedPaymentMethodId}
                onChange={e => setSelectedPaymentMethodId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium"
              >
                {paymentMethods.map(pm => (
                  <option key={pm.id} value={pm.id}>
                    {pm.title} {pm.lastFour ? `(•••• ${pm.lastFour})` : ''} {pm.isDefault ? '- Default' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Total breakdown */}
            <div className="space-y-1.5 border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">{formatPrice(subtotal)}</span>
              </div>
              {!isPickup && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee:</span>
                  <span className="font-mono font-semibold text-slate-900">{formatPrice(deliveryFee)}</span>
                </div>
              )}
              {groceryCustomerFee > 0 && (
                <div className="flex justify-between text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                  <span>5% Grocery Subtotal Service Fee:</span>
                  <span className="font-mono font-bold">+{formatPrice(groceryCustomerFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Platform Service Fee:</span>
                <span className="font-mono">{formatPrice(serviceFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-100">
                <span>Total Amount:</span>
                <span className="font-mono">{formatPrice(grandTotal)}</span>
              </div>
            </div>

            {/* Group Order Automated Split Breakdown */}
            {groupOrderSession && (
              <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Group Order Automated Split</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-200 text-indigo-900 uppercase">
                    {groupOrderSession.splitMode.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  Code: <span className="font-mono font-bold text-indigo-700">{groupOrderSession.code}</span> · {groupOrderSession.members.length} members sharing total
                </p>

                <div className="space-y-1 pt-1 border-t border-indigo-100">
                  {groupOrderSession.members.map(mbr => {
                    const mbrItems = cart.filter(i => i.addedByMemberId === mbr.id);
                    const mbrSub = mbrItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
                    let share = 0;
                    if (groupOrderSession.splitMode === 'equal') {
                      share = grandTotal / groupOrderSession.members.length;
                    } else if (groupOrderSession.splitMode === 'host_pays') {
                      share = mbr.isHost ? grandTotal : 0;
                    } else {
                      const fees = deliveryFee + serviceFee + groceryCustomerFee;
                      share = mbrSub + (subtotal > 0 ? fees * (mbrSub / subtotal) : 0);
                    }

                    return (
                      <div key={mbr.id} className="flex items-center justify-between text-[11px] py-0.5">
                        <span className="text-slate-700 flex items-center gap-1">
                          <span>{mbr.name}</span>
                          {mbr.isHost && <span className="text-[9px] font-bold text-indigo-600">(Host)</span>}
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatPrice(share)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[10px] text-indigo-900 flex items-center gap-1 pt-1 border-t border-indigo-100/60">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Members automatically charged to saved tokens upon authorization.</span>
                </div>
              </div>
            )}

            {(() => {
              const bioSettings = getBiometricSettings();
              const isBiometricEligible = bioSettings.isEnabled && bioSettings.requireForLargePayments && (grandTotal >= bioSettings.largePaymentThreshold);

              return (
                <button
                  onClick={() => handleCheckoutSubmit()}
                  className={`w-full py-2.5 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm ${
                    isBiometricEligible
                      ? 'bg-gradient-to-r from-indigo-600 to-slate-900 hover:from-indigo-700 hover:to-slate-800'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isBiometricEligible ? (
                    <>
                      <Scan className="w-4 h-4 text-cyan-300" />
                      <span>
                        {groupOrderSession
                          ? `Verify Face ID / Touch ID & Split (${formatPrice(grandTotal)})`
                          : `Confirm with Face ID / Touch ID (${formatPrice(grandTotal)})`}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {groupOrderSession 
                          ? `Authorize Group Order & Split Payment (${formatPrice(grandTotal)})` 
                          : `Authorize & Place Order (${formatPrice(grandTotal)})`}
                      </span>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add New Card Modal */}
      {showAddCardModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-4 sm:p-6 space-y-4 text-xs max-h-[92vh] sm:max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Add Credit / Debit Card</h3>
              <button onClick={() => setShowAddCardModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewCard} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Card Nickname</label>
                <input
                  type="text"
                  required
                  value={newCardTitle}
                  onChange={e => setNewCardTitle(e.target.value)}
                  placeholder="e.g. Work Card or Personal Chase"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Card Number *</label>
                <input
                  type="text"
                  required
                  value={newCardNumber}
                  onChange={e => setNewCardNumber(e.target.value)}
                  placeholder="4000 1234 5678 9010"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expiration (MM/YY)</label>
                  <input
                    type="text"
                    required
                    value={newCardExpiry}
                    onChange={e => setNewCardExpiry(e.target.value)}
                    placeholder="12/28"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Card Type</label>
                  <select
                    value={newCardType}
                    onChange={e => setNewCardType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Card data is tokenized securely via Stripe/PayPal PCI-DSS Level 1 vaults.</span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Save Payment Card
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI Customer Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-4 sm:p-5 flex flex-col max-h-[92vh] sm:max-h-[90vh] h-[520px] my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">TUXI AI Support Assistant</h3>
              </div>
              <button onClick={() => setShowSupport(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3 text-xs">
              {supportMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-xl leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-3 flex gap-2 shrink-0">
              <input
                type="text"
                value={userSupportInput}
                onChange={e => setUserSupportInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendSupportMessage()}
                placeholder="Ask about payments, POS, or delivery..."
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendSupportMessage}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Order Toast Notifications Stack */}
      <OrderToastNotifications />

      {/* Floating AI Chat Assistant Widget */}
      <AIChatAssistantWidget />


      {/* Group Order Modal & Automated Payment Split */}
      <GroupOrderModal
        isOpen={showGroupOrderModal}
        onClose={() => setShowGroupOrderModal(false)}
        onProceedToCheckout={() => {
          setShowGroupOrderModal(false);
          setShowCheckout(true);
        }}
      />

      {/* Biometric Verification Modal for Large Payments */}
      <BiometricAuthModal
        isOpen={showBiometricModal}
        onClose={() => setShowBiometricModal(false)}
        mode="payment"
        amount={grandTotal + (isPickup ? 0 : 2.50)}
        formattedAmount={formatPrice(grandTotal + (isPickup ? 0 : 2.50))}
        recipientName={cartBiz?.name || 'TUXI Merchant'}
        onSuccess={(authDetails) => {
          setShowBiometricModal(false);
          setBiometricVerifiedDetails(authDetails);
          handleCheckoutSubmit(authDetails);
        }}
      />

      {/* AI Geolocation Intelligence Modal */}
      <AILocationIntelligenceModal
        isOpen={showAILocationModal}
        onClose={() => setShowAILocationModal(false)}
      />

    </div>
  );
};
