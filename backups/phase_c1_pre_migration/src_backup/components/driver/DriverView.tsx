import React, { useState, useEffect } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { Order, GPSTrackingMode } from '../../types';
import { InteractiveMap } from '../common/InteractiveMap';
import { MultiStopRouteOptimizer } from './MultiStopRouteOptimizer';
import { capturePhoto } from '../../utils/nativeCameraService';
import { getCurrentDevicePosition } from '../../utils/nativeGeolocationService';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';
import { 
  Truck, 
  Power, 
  Navigation, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  ShieldCheck, 
  MapPin, 
  Package, 
  Camera, 
  FileSignature, 
  PhoneCall,
  Check,
  AlertCircle,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  Radio,
  FileCode,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Activity,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const DriverView: React.FC = () => {
  const { 
    currentDriver, 
    toggleDriverOnline, 
    orders, 
    acceptJobOffer, 
    updateOrderStatus, 
    completeDriverDelivery, 
    config,
    formatPrice,
    simulateDriverStep,
    setDriverTrackingMode
  } = useTuxi();

  const [activeTab, setActiveTab] = useState<'cockpit' | 'route_optimizer' | 'analytics'>('cockpit');
  const [recipientName, setRecipientName] = useState<string>('Emma Watson');
  const [showSpecSheet, setShowSpecSheet] = useState<boolean>(false);
  const [autoSimulateRoute, setAutoSimulateRoute] = useState<boolean>(false);
  const [capturedPodPhoto, setCapturedPodPhoto] = useState<string | null>(null);
  const [isCapturingPod, setIsCapturingPod] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gpsSyncStatus, setGpsSyncStatus] = useState<string | null>(null);

  // Active assigned job for this driver
  const myActiveOrder = orders.find(o => 
    o.driverId === currentDriver.id && 
    (o.status === 'driver_assigned' || o.status === 'picked_up' || o.status === 'in_transit')
  );

  // Incoming job offers (orders ready with no driver)
  const incomingOffers = orders.filter(o => 
    o.status === 'ready' && !o.driverId
  );

  const currentJob = myActiveOrder || incomingOffers[0];

  const handleTriggerCameraCapture = async () => {
    setIsCapturingPod(true);
    setCameraError(null);
    try {
      const result = await capturePhoto({ quality: 80, source: 'camera' });
      if (result.success && result.dataUrl) {
        setCapturedPodPhoto(result.dataUrl);
      } else if (result.error && !result.error.includes('USER_CANCELLED')) {
        setCameraError(result.error);
      }
    } catch (err: any) {
      setCameraError(err.message || 'Failed to capture photo');
    } finally {
      setIsCapturingPod(false);
    }
  };

  const handleAcquireNativeGps = async () => {
    setGpsSyncStatus('Acquiring GPS fix...');
    try {
      const result = await getCurrentDevicePosition({ enableHighAccuracy: true });
      if (result.success && result.coords) {
        setGpsSyncStatus(`GPS Locked: ${result.coords.latitude.toFixed(4)}, ${result.coords.longitude.toFixed(4)} (±${Math.round(result.coords.accuracyMeters || 5)}m)`);
      } else {
        setGpsSyncStatus(`GPS Warning: ${result.error || 'Signal unavailable'}`);
      }
    } catch (err: any) {
      setGpsSyncStatus(`GPS Error: ${err.message}`);
    }
  };

  // Auto route coordinate simulation effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (autoSimulateRoute && myActiveOrder?.status === 'in_transit') {
      interval = setInterval(() => {
        simulateDriverStep();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoSimulateRoute, myActiveOrder?.status, simulateDriverStep]);

  const handleAccept = (orderId: string) => {
    acceptJobOffer(orderId);
  };

  const handleConfirmPickup = (orderId: string) => {
    updateOrderStatus(orderId, 'in_transit');
  };

  const handleCompleteDeliverySubmission = (orderId: string) => {
    completeDriverDelivery(orderId, {
      recipientName,
      photoUrl: capturedPodPhoto || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80',
      signatureUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><path d="M10 20 Q 30 5, 50 25 T 90 15" stroke="black" fill="none"/></svg>'
    });
    setAutoSimulateRoute(false);
    setCapturedPodPhoto(null);
  };

  // Recharts Driver Analytics Mock Data
  const weeklyEarningsData = [
    { day: 'Mon', earnings: 72, trips: 8 },
    { day: 'Tue', earnings: 88, trips: 10 },
    { day: 'Wed', earnings: 65, trips: 7 },
    { day: 'Thu', earnings: 95, trips: 12 },
    { day: 'Fri', earnings: 135, trips: 15 },
    { day: 'Sat', earnings: 160, trips: 18 },
    { day: 'Sun (Today)', earnings: 84.5, trips: 9 }
  ];

  const hoursBreakdownData = [
    { hour: '08:00', trips: 1 },
    { hour: '10:00', trips: 2 },
    { hour: '12:00', trips: 4 },
    { hour: '14:00', trips: 3 },
    { hour: '16:00', trips: 2 },
    { hour: '18:00', trips: 5 },
    { hour: '20:00', trips: 3 },
  ];

  // Battery and Tracking Mode computation
  const telemetry = currentDriver.telemetry;
  const isHighPrecision = telemetry.trackingMode === 'high_precision';
  const isDistanceBased = telemetry.trackingMode === 'distance_based';

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
      
      {/* Driver Cockpit Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <img
            src={currentDriver.avatar}
            alt={currentDriver.name}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-slate-100 shadow-xs shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">{currentDriver.name}</h1>
              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Driver (POPIA &amp; CCPA Compliant)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-500 mt-1">
              <span className="capitalize font-medium text-slate-700">{currentDriver.vehicleType}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{currentDriver.vehiclePlate}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-600 font-bold">★ {currentDriver.rating}</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-slate-700">{config.activeCityName} Market</span>
            </div>
          </div>
        </div>

        {/* Battery & Status Telemetry Strip */}
        <div className="flex flex-wrap items-center justify-between sm:justify-start lg:justify-end gap-3 sm:gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto">
          
          {/* Battery Status Indicator */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs shrink-0">
            <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
              <BatteryMedium className={`w-3.5 h-3.5 ${telemetry.batteryLevel > 20 ? 'text-emerald-600' : 'text-rose-600'}`} />
              <span>Device Battery</span>
            </div>
            <div className="font-bold text-slate-900 font-mono flex items-center gap-1 mt-0.5">
              <span>{Math.round(telemetry.batteryLevel)}%</span>
              {telemetry.isCharging && <span className="text-emerald-600 text-[10px]">(Charging)</span>}
            </div>
          </div>

          {/* Today's Payout */}
          <div className="shrink-0">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">Today&apos;s Earnings</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
              {formatPrice(currentDriver.todayEarnings)}
            </div>
          </div>

          <button
            onClick={toggleDriverOnline}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs shrink-0 ${
              currentDriver.isOnline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            <Power className="w-4 h-4 shrink-0" />
            <span>{currentDriver.isOnline ? 'Online (Accepting Jobs)' : 'Offline'}</span>
          </button>
        </div>
      </div>

      {/* Background GPS Safety Architecture Status Banner (Mandatory Spec 1) */}
      <div className={`p-3.5 sm:p-4 rounded-xl border transition-all text-xs ${
        !currentDriver.isOnline
          ? 'bg-slate-100 border-slate-200 text-slate-600'
          : isHighPrecision
          ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 ring-1 ring-indigo-500/20'
          : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
              !currentDriver.isOnline ? 'bg-slate-200 text-slate-600' : isHighPrecision ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
            }`}>
              <Radio className="w-4 h-4 animate-pulse" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="font-bold text-sm shrink-0">Background GPS Safety Mode:</span>
                <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase break-words leading-normal ${
                  !currentDriver.isOnline
                    ? 'bg-slate-200 text-slate-700'
                    : isHighPrecision
                    ? 'bg-indigo-600 text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {!currentDriver.isOnline 
                    ? 'State 1: App Closed / Driver Offline (Zero Tracking)' 
                    : isHighPrecision 
                    ? 'State 3: Trip Active (High-Precision 5s Ping)' 
                    : 'State 2: Looking for Orders (Distance-Based 50m / 30s Filter)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                {!currentDriver.isOnline 
                  ? 'Zero location tracking to ensure 100% user privacy and 0% battery consumption.'
                  : isHighPrecision
                  ? 'Active delivery in progress. Pings every 5 seconds for passenger/courier safety and precise fare calculation.'
                  : 'Power-preserving mode: shifts to 50-metre distance filter or 30s stationary interval to prevent battery drain.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSpecSheet(!showSpecSheet)}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shrink-0 self-start sm:self-auto"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>OS Consent Triggers (iOS &amp; Android Spec)</span>
            {showSpecSheet ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Technical Spec Sheet (iOS Info.plist & Android Manifest) */}
        {showSpecSheet && (
          <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-3 bg-white p-3 rounded-lg border">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span>Technical Architecture Spec Sheet (Apple App Store &amp; Google Play Safe)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block text-xs font-sans mb-1">iOS Configuration (Info.plist):</span>
                <div className="text-slate-600 space-y-1">
                  <div>&lt;key&gt;NSLocationAlwaysAndWhenInUseUsageDescription&lt;/key&gt;</div>
                  <div className="text-indigo-600">&lt;string&gt;TUXI needs background location to compute distance-based driver dispatch and precise customer delivery ETA.&lt;/string&gt;</div>
                  <div>&lt;key&gt;UIBackgroundModes&lt;/key&gt;</div>
                  <div>&lt;array&gt;&lt;string&gt;location&lt;/string&gt;&lt;/array&gt;</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block text-xs font-sans mb-1">Android Configuration (AndroidManifest.xml):</span>
                <div className="text-slate-600 space-y-1">
                  <div>&lt;uses-permission android:name=&quot;android.permission.ACCESS_FINE_LOCATION&quot; /&gt;</div>
                  <div>&lt;uses-permission android:name=&quot;android.permission.ACCESS_COARSE_LOCATION&quot; /&gt;</div>
                  <div className="text-indigo-600">&lt;uses-permission android:name=&quot;android.permission.ACCESS_BACKGROUND_LOCATION&quot; /&gt;</div>
                  <div className="text-slate-400 font-sans text-[10px] mt-1">Foreground service type set to &quot;location&quot;.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 text-xs font-semibold overflow-x-auto scrollbar-none flex-nowrap -mx-2 px-2 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab('cockpit')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            activeTab === 'cockpit' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Live Cockpit &amp; GPS Dispatch</span>
        </button>

        <button
          onClick={() => setActiveTab('route_optimizer')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            activeTab === 'route_optimizer' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>AI Route Optimizer</span>
          <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            MULTI-STOP (5)
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            activeTab === 'analytics' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span>Performance Analytics (Recharts)</span>
        </button>
      </div>

      {/* TAB 1: COCKPIT & LIVE REAL-TIME TRACKING */}
      {activeTab === 'cockpit' && (
        <div className="space-y-4">
          
          {/* AI Route Optimization Suggestion Callout Banner */}
          <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/50 rounded-xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0">
                <Sparkles className="w-4 h-4 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">AI Route Optimization Available</span>
                  <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                    SAVE 19% FUEL &amp; 14 MINS
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Live traffic heuristics detected heavy congestion along A10. AI can re-sequence your 5 multi-stop deliveries to maximize fuel efficiency and satisfy customer ETAs.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('route_optimizer')}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs rounded-lg shrink-0 transition-colors shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto"
            >
              <span>Optimize Multi-Stop Route</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Live Map Navigation */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 text-xs">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                  Real-Time GPS Tracking Map ({config.activeCityName})
                </span>
                
                {/* Simulated Movement Trigger Buttons */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={simulateDriverStep}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold text-[11px] flex items-center gap-1"
                    title="Simulate 5s location ping step"
                  >
                    <Play className="w-3 h-3 text-indigo-600" />
                    <span>Ping Step (5s)</span>
                  </button>

                  <button
                    onClick={() => setAutoSimulateRoute(!autoSimulateRoute)}
                    className={`px-2 py-1 rounded font-semibold text-[11px] flex items-center gap-1 ${
                      autoSimulateRoute
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{autoSimulateRoute ? 'Auto-Moving (3s)' : 'Start Auto-Track'}</span>
                  </button>
                </div>
              </div>

              <InteractiveMap
                center={currentDriver.currentLocation}
                drivers={[currentDriver]}
                routePoints={
                  currentJob
                    ? {
                        from: currentJob.businessCoords || { lat: 51.5205, lng: -0.0718 },
                        to: currentJob.customerCoords
                      }
                    : undefined
                }
                height="420px"
              />
            </div>
          </div>

          {/* Right Column: Active Job Card / Offers */}
          <div className="space-y-4">
            {myActiveOrder ? (
              // Active Trip In Progress Card
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="font-mono text-[10px] text-indigo-600 font-bold uppercase">
                      Order #{myActiveOrder.orderNumber}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900">{myActiveOrder.businessName}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {myActiveOrder.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">1. Pickup Location</span>
                    <span className="font-bold text-slate-800">{myActiveOrder.businessName}</span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">2. Drop-off Destination</span>
                    <span className="font-bold text-slate-800">{myActiveOrder.customerAddress}</span>
                    <div className="text-[11px] text-slate-500 mt-0.5">Recipient: {myActiveOrder.customerName}</div>
                  </div>
                </div>

                {/* Proof of delivery step */}
                {myActiveOrder.status === 'in_transit' && (
                  <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-2">
                    <span className="font-bold text-indigo-950 block">Mandatory Proof of Delivery (POD)</span>
                    <div className="flex items-center gap-2 text-indigo-900 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Doorstep / Storefront Photo Captured</span>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-900 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Customer Digital Signature Logged</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons based on status */}
                <div className="pt-2">
                  {myActiveOrder.status === 'driver_assigned' && (
                    <button
                      onClick={() => handleConfirmPickup(myActiveOrder.id)}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2"
                    >
                      <Package className="w-4 h-4" />
                      <span>Confirm Package Collected</span>
                    </button>
                  )}

                  {myActiveOrder.status === 'in_transit' && (
                    <div className="space-y-3">
                      {/* Native GPS Fix Banner */}
                      <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="text-[11px] text-slate-700 font-medium truncate max-w-[200px]">
                            {gpsSyncStatus || 'GPS Telemetry Active'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAcquireNativeGps}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md transition-colors"
                        >
                          Refresh Fix
                        </button>
                      </div>

                      {/* Native POD Camera Capture */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 text-[11px]">Proof of Delivery (POD) Photo</span>
                          {capturedPodPhoto && (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Photo Attached
                            </span>
                          )}
                        </div>

                        {capturedPodPhoto ? (
                          <div className="relative rounded-lg overflow-hidden border border-emerald-300 max-h-32 bg-slate-900 flex items-center justify-center">
                            <img src={capturedPodPhoto} alt="POD Preview" className="h-32 object-contain" />
                            <button
                              type="button"
                              onClick={() => setCapturedPodPhoto(null)}
                              className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full text-[10px]"
                              title="Retake Photo"
                            >
                              Retake
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleTriggerCameraCapture}
                            disabled={isCapturingPod}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>{isCapturingPod ? 'Opening Camera...' : 'Capture Photo with Camera'}</span>
                          </button>
                        )}

                        {cameraError && (
                          <p className="text-[11px] text-rose-600">{cameraError}</p>
                        )}
                      </div>

                      <button
                        onClick={() => handleCompleteDeliverySubmission(myActiveOrder.id)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Submit Proof &amp; Complete Delivery</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : incomingOffers.length > 0 ? (
              // Incoming Job Offer with Countdown
              <div className="bg-white border-2 border-indigo-500 rounded-xl p-5 shadow-md space-y-4 text-xs animate-pulse-subtle">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-indigo-600 font-bold uppercase block">
                      New Instant Dispatch Offer
                    </span>
                    <h3 className="font-bold text-sm text-slate-900">{incomingOffers[0].businessName}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">
                      +{formatPrice(incomingOffers[0].deliveryFee + incomingOffers[0].tip)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">Payout</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-slate-600">
                    <strong>Pickup:</strong> {incomingOffers[0].businessName} (~0.4 km)
                  </div>
                  <div className="text-slate-600">
                    <strong>Drop-off:</strong> {incomingOffers[0].customerAddress}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleAccept(incomingOffers[0].id)}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>Accept Job</span>
                  </button>
                  <button
                    onClick={() => updateOrderStatus(incomingOffers[0].id, 'ready')}
                    className="py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-lg text-xs"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs space-y-3">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto animate-pulse">
                  <Navigation className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800">Scanning for Nearby Deliveries</h3>
                <p className="text-slate-500">
                  AI automated dispatcher is matching ready orders in {config.activeCityName}.
                </p>
              </div>
            )}
          </div>

        </div>
        </div>
      )}

      {/* TAB: AI MULTI-STOP ROUTE OPTIMIZER */}
      {activeTab === 'route_optimizer' && (
        <MultiStopRouteOptimizer
          driverLocation={currentDriver.currentLocation}
        />
      )}

      {/* TAB 2: DRIVER PERFORMANCE ANALYTICS DASHBOARD (Recharts Implementation) */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Trip Completion Rate</span>
              <div className="text-2xl font-black text-emerald-600 tabular-nums mt-1">98.4%</div>
              <span className="text-[11px] text-slate-400 mt-1 block">648 total completed trips</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Driver Rating</span>
              <div className="text-2xl font-black text-amber-500 tabular-nums mt-1">★ 4.92</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Top 5% percentile</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Weekly Net Earnings</span>
              <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{formatPrice(692.50)}</div>
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">+12.4% vs last week</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Pending Tuesday Payout</span>
              <div className="text-2xl font-black text-indigo-600 tabular-nums mt-1">{formatPrice(currentDriver.pendingPayout)}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Direct bank transfer via Stripe</span>
            </div>
          </div>

          {/* Visual Recharts Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Weekly Earnings Area Chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">7-Day Earnings Trajectory</h3>
                  <p className="text-xs text-slate-500">Daily gross payouts ({config.currencySymbol})</p>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  {config.currencyCode}
                </span>
              </div>

              <div className="h-60 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyEarningsData}>
                    <defs>
                      <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(val: any) => [`${config.currencySymbol}${Number(val).toFixed(2)}`, 'Earnings']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="earnings" 
                      stroke="#4f46e5" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#earningsGrad)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hourly Trips Distribution Bar Chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Peak Demand Trips by Hour</h3>
                  <p className="text-xs text-slate-500">Trip density throughout active shift</p>
                </div>
                <span className="font-mono text-xs text-slate-500">Trips / Hr</span>
              </div>

              <div className="h-60 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursBreakdownData}>
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="trips" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
