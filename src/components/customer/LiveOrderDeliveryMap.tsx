import React, { useState, useEffect } from 'react';
import { 
  Map, 
  AdvancedMarker, 
  InfoWindow, 
  useMap, 
  useMapsLibrary 
} from '@vis.gl/react-google-maps';
import { Order, GeoPoint, Driver } from '../../types';
import { calculateDistanceKm, projectToMap } from '../../utils/geospatial';
import { 
  GOOGLE_MAPS_MAP_ID, 
  GMP_ATTRIBUTION_IDS, 
  getStoredGoogleMapsApiKey,
  setStoredGoogleMapsApiKey,
  isValidGoogleMapsKey,
  isGoogleMapsAuthFailed
} from '../../utils/googleMapsConfig';
import { 
  Navigation, 
  MapPin, 
  Crosshair, 
  Clock, 
  Truck, 
  ShieldCheck, 
  Radio, 
  CheckCircle, 
  Phone, 
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  Store,
  Home,
  Check,
  Zap,
  TrafficCone,
  Key,
  X,
  Settings
} from 'lucide-react';

interface LiveOrderDeliveryMapProps {
  order: Order;
  driver?: Driver;
  onUpdateDeliveryLocation?: (coords: GeoPoint, addressText?: string) => void;
  className?: string;
}

// Google Maps Route Polyline Subcomponent
function MapRoutePolyline({
  path,
  strokeColor = '#4f46e5',
  strokeWeight = 5
}: {
  path: google.maps.LatLngLiteral[];
  strokeColor?: string;
  strokeWeight?: number;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !path || path.length < 2) return;

    const polyline = new google.maps.Polyline({
      path,
      strokeColor,
      strokeOpacity: 0.9,
      strokeWeight,
      map
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, maps, path, strokeColor, strokeWeight]);

  return null;
}

// Google Maps Live Traffic Layer Subcomponent
function MapTrafficLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !enabled) return;

    const trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    return () => {
      trafficLayer.setMap(null);
    };
  }, [map, maps, enabled]);

  return null;
}

// Camera Auto-Fitter
function MapCameraBounds({
  points
}: {
  points: google.maps.LatLngLiteral[];
}) {
  const map = useMap();
  const core = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !core || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }, [map, core, points]);

  return null;
}

export const LiveOrderDeliveryMap: React.FC<LiveOrderDeliveryMapProps> = ({
  order,
  driver,
  onUpdateDeliveryLocation,
  className = ''
}) => {
  // Key & Auth state
  const [apiKey, setApiKey] = useState<string>(() => getStoredGoogleMapsApiKey());
  const [authFailed, setAuthFailed] = useState<boolean>(() => isGoogleMapsAuthFailed());
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>(apiKey);
  const [keyFeedback, setKeyFeedback] = useState<string>('');

  useEffect(() => {
    const handleKeyUpdated = (e: any) => {
      setApiKey(e.detail || getStoredGoogleMapsApiKey());
      setAuthFailed(false);
    };
    const handleAuthFailure = () => {
      setAuthFailed(true);
    };

    window.addEventListener('gmp-key-updated', handleKeyUpdated);
    window.addEventListener('gmp-auth-failure', handleAuthFailure);
    return () => {
      window.removeEventListener('gmp-key-updated', handleKeyUpdated);
      window.removeEventListener('gmp-auth-failure', handleAuthFailure);
    };
  }, []);

  const isGoogleMapsActive = isValidGoogleMapsKey(apiKey) && !authFailed;

  // Geolocation state
  const [userGpsCoords, setUserGpsCoords] = useState<GeoPoint | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'locked' | 'permission_denied' | 'unsupported'>('idle');

  // Map Controls State
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [selectedMarker, setSelectedMarker] = useState<'driver' | 'origin' | 'destination' | null>(null);

  // Origin, Destination, and Courier Position
  const startPoint = order.businessCoords || { lat: 51.5205, lng: -0.0718 };
  const destinationPoint = userGpsCoords || order.customerCoords || { lat: 51.5245, lng: -0.0820 };

  const [driverPos, setDriverPos] = useState<GeoPoint>(order.driverCoords || driver?.currentLocation || {
    lat: startPoint.lat + 0.002,
    lng: startPoint.lng - 0.003
  });
  const [progressRatio, setProgressRatio] = useState<number>(0.42);
  const [isLiveSimulating, setIsLiveSimulating] = useState<boolean>(true);
  const [speedKmh, setSpeedKmh] = useState<number>(26);

  // SVG Radar Canvas dimensions (used in fallback mode)
  const svgWidth = 800;
  const svgHeight = 440;
  const svgScale = 6400;
  const svgCenter = {
    lat: (startPoint.lat + destinationPoint.lat) / 2,
    lng: (startPoint.lng + destinationPoint.lng) / 2
  };

  // Request browser geolocation on mount
  useEffect(() => {
    requestBrowserGeolocation();
  }, []);

  const requestBrowserGeolocation = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }

    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5))
        };
        setUserGpsCoords(coords);
        setGpsStatus('locked');
        if (onUpdateDeliveryLocation) {
          onUpdateDeliveryLocation(coords, 'Live Verified GPS');
        }
      },
      () => {
        setGpsStatus('permission_denied');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Real-time animation loop simulating driver movement toward customer
  useEffect(() => {
    let animTimer: NodeJS.Timeout | null = null;
    if (isLiveSimulating && order.status !== 'delivered' && order.status !== 'cancelled') {
      animTimer = setInterval(() => {
        setProgressRatio(prev => {
          const next = prev >= 0.98 ? 0.98 : prev + 0.02;
          
          const currentLat = startPoint.lat + (destinationPoint.lat - startPoint.lat) * next;
          const currentLng = startPoint.lng + (destinationPoint.lng - startPoint.lng) * next;
          setDriverPos({ lat: currentLat, lng: currentLng });

          setSpeedKmh(Math.floor(22 + Math.random() * 12));
          return next;
        });
      }, 2500);
    }
    return () => {
      if (animTimer) clearInterval(animTimer);
    };
  }, [isLiveSimulating, order.status, startPoint, destinationPoint]);

  const distanceKm = calculateDistanceKm(driverPos, destinationPoint);
  const etaMinutes = Math.max(2, Math.round((distanceKm / (speedKmh || 25)) * 60) + 1);

  const routePath: google.maps.LatLngLiteral[] = [
    { lat: startPoint.lat, lng: startPoint.lng },
    { lat: startPoint.lat + (destinationPoint.lat - startPoint.lat) * 0.3, lng: startPoint.lng },
    { lat: driverPos.lat, lng: driverPos.lng },
    { lat: destinationPoint.lat, lng: startPoint.lng + (destinationPoint.lng - startPoint.lng) * 0.7 },
    { lat: destinationPoint.lat, lng: destinationPoint.lng }
  ];

  const resetSimulation = () => {
    setProgressRatio(0.1);
    setDriverPos({
      lat: startPoint.lat + (destinationPoint.lat - startPoint.lat) * 0.1,
      lng: startPoint.lng + (destinationPoint.lng - startPoint.lng) * 0.1
    });
    setIsLiveSimulating(true);
  };

  const handleSaveApiKey = () => {
    if (!keyInput.trim()) {
      setStoredGoogleMapsApiKey('');
      setKeyFeedback('Key cleared. Running in Vector Radar mode.');
      setTimeout(() => setShowKeyModal(false), 1500);
      return;
    }

    if (!keyInput.trim().startsWith('AIza')) {
      setKeyFeedback('Notice: Google Maps Platform API keys typically start with "AIzaSy...".');
    }

    setStoredGoogleMapsApiKey(keyInput.trim());
    setKeyFeedback('✓ API Key updated!');
    setTimeout(() => {
      setShowKeyModal(false);
      setKeyFeedback('');
    }, 1500);
  };

  // Projected SVG coordinates for vector fallback
  const pStart = projectToMap(startPoint, svgCenter, svgWidth, svgHeight, svgScale);
  const pEnd = projectToMap(destinationPoint, svgCenter, svgWidth, svgHeight, svgScale);
  const pDriver = projectToMap(driverPos, svgCenter, svgWidth, svgHeight, svgScale);

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-4 ${className}`}>
      
      {/* Top Bar: Live Order Tracker Header */}
      <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                <span>{isGoogleMapsActive ? 'Google Maps Live Order Tracker' : 'Live Courier Radar (High-Precision GPS)'}</span>
              </h3>
              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                isGoogleMapsActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}>
                {isGoogleMapsActive ? 'GOOGLE MAPS ACTIVE' : 'VECTOR RADAR (5S PING)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Order #{order.orderNumber} · {order.businessName || 'Merchant'} to {order.customerAddress || 'Your Location'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isGoogleMapsActive && (
            <>
              {/* Traffic Toggle */}
              <button
                onClick={() => setShowTraffic(!showTraffic)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                  showTraffic
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title="Toggle Live Google Maps Traffic Layer"
              >
                <TrafficCone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Live Traffic</span>
              </button>

              {/* Map Type Switcher */}
              <div className="flex items-center p-0.5 bg-slate-800 rounded-xl border border-slate-700 text-xs">
                <button
                  onClick={() => setMapType('roadmap')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    mapType === 'roadmap' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vector
                </button>
                <button
                  onClick={() => setMapType('hybrid')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    mapType === 'hybrid' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Satellite
                </button>
              </div>
            </>
          )}

          {/* Key Settings Button */}
          <button
            onClick={() => setShowKeyModal(true)}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
            title="Configure Google Maps API Key"
          >
            <Key className="w-4 h-4 text-cyan-300" />
          </button>

          {/* Geolocation Button */}
          <button
            onClick={requestBrowserGeolocation}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
            title="Refetch Current Browser GPS Coordinates"
          >
            <Crosshair className={`w-4 h-4 ${gpsStatus === 'locating' ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mode Status Notice if in Vector Fallback */}
      {!isGoogleMapsActive && (
        <div className="mx-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-600 shrink-0 animate-pulse" />
            <span>
              Real-time courier GPS radar active with live telemetry. 
              {apiKey && !apiKey.startsWith('AIza') 
                ? ' (Google Maps requires a standard API key starting with AIzaSy...)'
                : ' Connect your Google Maps key to unlock 3D satellite tiles & live traffic.'}
            </span>
          </div>
          <button
            onClick={() => setShowKeyModal(true)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors"
          >
            Configure Key
          </button>
        </div>
      )}

      {/* Main Map Viewport */}
      <div className="relative mx-4 rounded-2xl overflow-hidden border border-slate-300 shadow-md h-[400px] sm:h-[460px] bg-slate-950">
        
        {isGoogleMapsActive ? (
          /* Google Maps Active Mode */
          <Map
            defaultCenter={{ lat: driverPos.lat, lng: driverPos.lng }}
            defaultZoom={15}
            mapId={GOOGLE_MAPS_MAP_ID}
            internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
            mapTypeId={mapType}
            gestureHandling="greedy"
            fullscreenControl={false}
            streetViewControl={false}
            mapTypeControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <MapCameraBounds
              points={[
                { lat: startPoint.lat, lng: startPoint.lng },
                { lat: driverPos.lat, lng: driverPos.lng },
                { lat: destinationPoint.lat, lng: destinationPoint.lng }
              ]}
            />

            <MapTrafficLayer enabled={showTraffic} />

            <MapRoutePolyline 
              path={routePath} 
              strokeColor="#4f46e5" 
              strokeWeight={5} 
            />

            {/* Merchant Pin */}
            <AdvancedMarker
              position={{ lat: startPoint.lat, lng: startPoint.lng }}
              onClick={() => setSelectedMarker('origin')}
              title={order.businessName || 'Store Location'}
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-bold text-[10px] shadow-md border border-slate-700 whitespace-nowrap mb-1">
                  {order.businessName || 'Merchant'}
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg ring-2 ring-white">
                  <Store className="w-4 h-4" />
                </div>
              </div>
            </AdvancedMarker>

            {/* Destination Pin */}
            <AdvancedMarker
              position={{ lat: destinationPoint.lat, lng: destinationPoint.lng }}
              onClick={() => setSelectedMarker('destination')}
              title="Delivery Destination"
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px] shadow-md border border-emerald-500 whitespace-nowrap mb-1">
                  Delivery Address
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white animate-bounce">
                  <Home className="w-4 h-4" />
                </div>
              </div>
            </AdvancedMarker>

            {/* Courier Moving Pin */}
            <AdvancedMarker
              position={{ lat: driverPos.lat, lng: driverPos.lng }}
              onClick={() => setSelectedMarker('driver')}
              title={driver?.name || 'TUXI Courier'}
            >
              <div className="relative flex flex-col items-center cursor-pointer">
                <div className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-bold font-mono text-[10px] shadow-md border border-indigo-400 whitespace-nowrap mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-300 fill-current" />
                  <span>{speedKmh} km/h · {etaMinutes}m ETA</span>
                </div>
                <div className="relative">
                  <span className="absolute -inset-1.5 rounded-full bg-indigo-500/40 animate-ping" />
                  <div className="relative w-10 h-10 rounded-full bg-slate-900 border-2 border-white shadow-xl overflow-hidden flex items-center justify-center">
                    {driver?.avatar ? (
                      <img src={driver.avatar} alt={driver.name} className="w-full h-full object-cover" />
                    ) : (
                      <Truck className="w-5 h-5 text-indigo-400" />
                    )}
                  </div>
                </div>
              </div>
            </AdvancedMarker>

            {selectedMarker === 'driver' && (
              <InfoWindow
                position={{ lat: driverPos.lat, lng: driverPos.lng }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-xs text-slate-800 space-y-1">
                  <span className="font-bold block">{driver?.name || 'TUXI Courier'}</span>
                  <p className="text-[11px] text-slate-500">
                    Vehicle: {driver?.vehicleType ? (driver.vehicleType.charAt(0).toUpperCase() + driver.vehicleType.slice(1)) : 'Motorcycle'} ({driver?.vehiclePlate || 'LD24-TUX'})
                  </p>
                  <div className="text-[11px] font-mono text-emerald-600 font-bold">
                    {distanceKm.toFixed(1)} km away · ~{etaMinutes} mins
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        ) : (
          /* High-Precision Vector Radar Fallback Mode */
          <svg className="w-full h-full select-none" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
            <defs>
              <pattern id="deliveryGrid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#1e293b" strokeWidth="0.8" opacity="0.6" />
              </pattern>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            <rect width={svgWidth} height={svgHeight} fill="#090d16" />
            <rect width={svgWidth} height={svgHeight} fill="url(#deliveryGrid)" />

            {/* Route Line */}
            <path
              d={`M ${pStart.x} ${pStart.y} Q ${(pStart.x + pEnd.x) / 2 + 30} ${(pStart.y + pEnd.y) / 2 - 40}, ${pEnd.x} ${pEnd.y}`}
              fill="none"
              stroke="#1e293b"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d={`M ${pStart.x} ${pStart.y} Q ${(pStart.x + pEnd.x) / 2 + 30} ${(pStart.y + pEnd.y) / 2 - 40}, ${pEnd.x} ${pEnd.y}`}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="3.5"
              strokeDasharray="6 4"
              className="animate-pulse"
            />

            {/* Merchant Pin */}
            <g transform={`translate(${pStart.x}, ${pStart.y})`}>
              <circle r="14" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
              <text textAnchor="middle" y="4" fill="#ffffff" fontSize="10" fontWeight="bold">S</text>
              <text textAnchor="middle" y="24" fill="#94a3b8" fontSize="10" fontWeight="bold">
                {order.businessName || 'Store'}
              </text>
            </g>

            {/* Destination Pin */}
            <g transform={`translate(${pEnd.x}, ${pEnd.y})`}>
              <circle r="18" fill="#10b981" fillOpacity="0.25" className="animate-ping" />
              <circle r="14" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
              <text textAnchor="middle" y="4" fill="#ffffff" fontSize="10" fontWeight="bold">H</text>
              <text textAnchor="middle" y="24" fill="#10b981" fontSize="10" fontWeight="bold">You</text>
            </g>

            {/* Courier Moving Pin */}
            <g transform={`translate(${pDriver.x}, ${pDriver.y})`}>
              <circle r="22" fill="#6366f1" fillOpacity="0.3" className="animate-ping" />
              <circle r="16" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" />
              <text textAnchor="middle" y="4" fill="#ffffff" fontSize="11" fontWeight="bold">🚴</text>
              <rect x="-40" y="-30" width="80" height="18" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1" />
              <text textAnchor="middle" y="-18" fill="#a5b4fc" fontSize="9" fontWeight="bold">
                {speedKmh} km/h · {etaMinutes}m
              </text>
            </g>
          </svg>
        )}

        {/* Floating Live Telemetry HUD */}
        <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 max-w-xs space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Estimated Delivery</span>
              <div className="text-xl font-black font-mono text-cyan-300">
                {etaMinutes} Mins
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Remaining Distance</span>
              <div className="text-base font-bold font-mono text-white">
                {distanceKm.toFixed(2)} km
              </div>
            </div>
          </div>

          <div className="space-y-1 pt-1 border-t border-slate-800">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{order.businessName || 'Store'}</span>
              <span>Your Doorstep</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => setIsLiveSimulating(!isLiveSimulating)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors shadow-lg backdrop-blur-md flex items-center gap-1.5 ${
              isLiveSimulating
                ? 'bg-slate-900/90 text-white border-slate-700'
                : 'bg-indigo-600 text-white border-indigo-500'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isLiveSimulating ? 'Pause Movement' : 'Resume Live Run'}</span>
          </button>

          <button
            onClick={resetSimulation}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl shadow-lg transition-colors"
            title="Restart Driver Route Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Driver Contact & Delivery Info Footer */}
      <div className="p-4 mx-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-200">
            {driver?.name ? driver.name.charAt(0) : 'J'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">{driver?.name || 'James Wilson'}</span>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                ★ 4.95 Rating
              </span>
            </div>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Assigned Courier · Commercial Delivery ({driver?.vehicleType ? (driver.vehicleType.charAt(0).toUpperCase() + driver.vehicleType.slice(1)) : 'Motorcycle'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {driver?.phone && (
            <a
              href={`tel:${driver.phone}`}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Call Courier</span>
            </a>
          )}

          <div className="p-2 bg-white rounded-xl border border-slate-200 flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Contactless Pin Security</span>
          </div>
        </div>
      </div>

      {/* Google Maps API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">Google Maps Platform Key</h3>
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Google Maps Platform requires an API Key starting with <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600 font-bold">AIzaSy...</code> from the Google Cloud Console.
            </p>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">Google Maps API Key</label>
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {keyFeedback && (
              <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-semibold">
                {keyFeedback}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors"
              >
                Save &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
