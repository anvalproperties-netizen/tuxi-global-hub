import React, { useState, useEffect } from 'react';
import { 
  Map, 
  AdvancedMarker, 
  InfoWindow, 
  useMap, 
  useMapsLibrary 
} from '@vis.gl/react-google-maps';
import { GeoPoint, Business, Driver, Rep } from '../../types';
import { projectToMap, calculateDistanceKm } from '../../utils/geospatial';
import { 
  GOOGLE_MAPS_MAP_ID, 
  GMP_ATTRIBUTION_IDS, 
  DEFAULT_MAP_CENTER,
  getStoredGoogleMapsApiKey,
  isValidGoogleMapsKey,
  isGoogleMapsAuthFailed
} from '../../utils/googleMapsConfig';
import { 
  MapPin, 
  Navigation, 
  Store, 
  CheckCircle, 
  AlertOctagon, 
  User, 
  Truck, 
  Compass, 
  Layers 
} from 'lucide-react';

interface InteractiveMapProps {
  center?: GeoPoint;
  highlightRadiusKm?: number;
  reps?: Rep[];
  activeRep?: Rep;
  businesses?: Business[];
  drivers?: Driver[];
  routePoints?: { from: GeoPoint; to: GeoPoint; label?: string };
  selectedLocation?: GeoPoint | null;
  onSelectLocation?: (coords: GeoPoint) => void;
  height?: string;
  showLegend?: boolean;
}

// Polyline component for Google Maps
function PolylineOverlay({
  from,
  to,
  strokeColor = '#4f46e5'
}: {
  from: GeoPoint;
  to: GeoPoint;
  strokeColor?: string;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  React.useEffect(() => {
    if (!map || !maps) return;

    const polyline = new google.maps.Polyline({
      path: [
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng }
      ],
      strokeColor,
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, maps, from, to, strokeColor]);

  return null;
}

// 20km Territory Circle Overlay for Reps
function TerritoryCircle({
  center,
  radiusKm = 20
}: {
  center: GeoPoint;
  radiusKm?: number;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  React.useEffect(() => {
    if (!map || !maps) return;

    const circle = new google.maps.Circle({
      center: { lat: center.lat, lng: center.lng },
      radius: radiusKm * 1000,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.5,
      strokeWeight: 1.5,
      fillColor: '#3b82f6',
      fillOpacity: 0.08,
      map
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, maps, center, radiusKm]);

  return null;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  center = DEFAULT_MAP_CENTER,
  highlightRadiusKm,
  reps = [],
  activeRep,
  businesses = [],
  drivers = [],
  routePoints,
  selectedLocation,
  onSelectLocation,
  height = '420px',
  showLegend = true
}) => {
  const [apiKey, setApiKey] = useState<string>(() => getStoredGoogleMapsApiKey());
  const [authFailed, setAuthFailed] = useState<boolean>(() => isGoogleMapsAuthFailed());

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

  const [selectedEntity, setSelectedEntity] = useState<{
    title: string;
    description: string;
    coords: GeoPoint;
    type: string;
  } | null>(null);

  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');

  // Vector Radar calculations
  const svgWidth = 800;
  const svgMapHeight = 500;
  const svgScale = 5200;
  const radiusPx = highlightRadiusKm ? (highlightRadiusKm / 111) * svgScale : 0;
  const centerPos = projectToMap(center, center, svgWidth, svgMapHeight, svgScale);

  const handleSvgMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSelectLocation) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const clickY = ((e.clientY - rect.top) / rect.height) * svgMapHeight;

    const dX = clickX - svgWidth / 2;
    const dY = svgMapHeight / 2 - clickY;

    const lat = center.lat + dY / svgScale;
    const lng = center.lng + dX / (svgScale * Math.cos((center.lat * Math.PI) / 180));

    onSelectLocation({
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000
    });
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-300 shadow-md bg-slate-900" style={{ height }}>
      
      {isGoogleMapsActive ? (
        /* Google Maps Active Mode */
        <Map
          defaultCenter={{ lat: center.lat, lng: center.lng }}
          defaultZoom={13}
          mapId={GOOGLE_MAPS_MAP_ID}
          internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
          mapTypeId={mapType}
          gestureHandling="greedy"
          fullscreenControl={false}
          streetViewControl={false}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (onSelectLocation && e.detail.latLng) {
              onSelectLocation({
                lat: Number(e.detail.latLng.lat.toFixed(5)),
                lng: Number(e.detail.latLng.lng.toFixed(5))
              });
            }
          }}
        >
          {highlightRadiusKm && (
            <TerritoryCircle center={center} radiusKm={highlightRadiusKm} />
          )}

          {routePoints && (
            <PolylineOverlay from={routePoints.from} to={routePoints.to} />
          )}

          {businesses.map(biz => (
            <AdvancedMarker
              key={biz.id}
              position={{ lat: biz.location.lat, lng: biz.location.lng }}
              onClick={() => setSelectedEntity({
                title: biz.name,
                description: `${biz.type.toUpperCase()} · ${biz.category || ''}`,
                coords: biz.location,
                type: biz.type
              })}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white hover:scale-110 transition-transform">
                  <Store className="w-4 h-4" />
                </div>
              </div>
            </AdvancedMarker>
          ))}

          {drivers.map(drv => (
            <AdvancedMarker
              key={drv.id}
              position={{ lat: drv.currentLocation.lat, lng: drv.currentLocation.lng }}
              onClick={() => setSelectedEntity({
                title: drv.name,
                description: `Active Courier · ${drv.isOnline ? 'Online' : 'Offline'}`,
                coords: drv.currentLocation,
                type: 'driver'
              })}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="relative">
                  <span className="absolute -inset-1 rounded-full bg-emerald-500/40 animate-ping" />
                  <div className="relative w-8 h-8 rounded-full bg-slate-900 border-2 border-white text-emerald-400 flex items-center justify-center shadow-lg">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </AdvancedMarker>
          ))}

          {reps.map(rep => (
            <AdvancedMarker
              key={rep.id}
              position={{ lat: rep.hubLocation.lat, lng: rep.hubLocation.lng }}
              onClick={() => setSelectedEntity({
                title: rep.name,
                description: `Territory Rep (${rep.territoryRadiusKm}km)`,
                coords: rep.hubLocation,
                type: 'rep'
              })}
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white">
                <User className="w-3.5 h-3.5" />
              </div>
            </AdvancedMarker>
          ))}

          {selectedLocation && (
            <AdvancedMarker
              position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
            >
              <div className="flex flex-col items-center animate-bounce">
                <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl ring-2 ring-white">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
            </AdvancedMarker>
          )}

          {selectedEntity && (
            <InfoWindow
              position={{ lat: selectedEntity.coords.lat, lng: selectedEntity.coords.lng }}
              onCloseClick={() => setSelectedEntity(null)}
            >
              <div className="p-1 text-xs text-slate-800 space-y-0.5">
                <span className="font-bold block text-sm">{selectedEntity.title}</span>
                <p className="text-[11px] text-slate-500">{selectedEntity.description}</p>
                <div className="font-mono text-[10px] text-indigo-600 pt-0.5">
                  {selectedEntity.coords.lat.toFixed(4)}, {selectedEntity.coords.lng.toFixed(4)}
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      ) : (
        /* Vector Canvas Fallback Mode */
        <svg
          className="w-full h-full cursor-crosshair select-none"
          viewBox={`0 0 ${svgWidth} ${svgMapHeight}`}
          onClick={handleSvgMapClick}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
          </defs>

          <rect width={svgWidth} height={svgMapHeight} fill="#0f172a" />
          <rect width={svgWidth} height={svgMapHeight} fill="url(#grid)" />

          {highlightRadiusKm && (
            <g>
              <circle
                cx={centerPos.x}
                cy={centerPos.y}
                r={radiusPx}
                fill="#3b82f6"
                fillOpacity="0.08"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            </g>
          )}

          {/* Businesses */}
          {businesses.map(b => {
            const p = projectToMap(b.location, center, svgWidth, svgMapHeight, svgScale);
            return (
              <g key={b.id} transform={`translate(${p.x}, ${p.y})`} className="cursor-pointer">
                <circle r="12" fill="#4f46e5" stroke="#ffffff" strokeWidth="1.5" />
                <text textAnchor="middle" y="4" fill="#ffffff" fontSize="9" fontWeight="bold">S</text>
                <text textAnchor="middle" y="20" fill="#94a3b8" fontSize="9">{b.name}</text>
              </g>
            );
          })}

          {/* Drivers */}
          {drivers.map(d => {
            const p = projectToMap(d.currentLocation, center, svgWidth, svgMapHeight, svgScale);
            return (
              <g key={d.id} transform={`translate(${p.x}, ${p.y})`}>
                <circle r="14" fill="#10b981" fillOpacity="0.3" className="animate-ping" />
                <circle r="10" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                <text textAnchor="middle" y="3" fill="#ffffff" fontSize="8" fontWeight="bold">D</text>
              </g>
            );
          })}

          {/* Reps */}
          {reps.map(r => {
            const p = projectToMap(r.hubLocation, center, svgWidth, svgMapHeight, svgScale);
            return (
              <g key={r.id} transform={`translate(${p.x}, ${p.y})`}>
                <circle r="10" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                <text textAnchor="middle" y="3" fill="#ffffff" fontSize="8" fontWeight="bold">R</text>
              </g>
            );
          })}

          {/* Selected Location */}
          {selectedLocation && (
            <g transform={`translate(${projectToMap(selectedLocation, center, svgWidth, svgMapHeight, svgScale).x}, ${projectToMap(selectedLocation, center, svgWidth, svgMapHeight, svgScale).y})`}>
              <circle r="16" fill="#e11d48" fillOpacity="0.4" className="animate-ping" />
              <circle r="8" fill="#e11d48" stroke="#ffffff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {/* Floating Controls */}
      {isGoogleMapsActive && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700 text-xs text-white shadow-lg">
          <button
            onClick={() => setMapType('roadmap')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
              mapType === 'roadmap' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Street
          </button>
          <button
            onClick={() => setMapType('hybrid')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
              mapType === 'hybrid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Satellite
          </button>
        </div>
      )}

      {/* Floating Legend */}
      {showLegend && (
        <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur-md text-white px-3 py-2 rounded-xl border border-slate-700 text-[11px] shadow-lg flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Merchants</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Couriers</span>
          </div>
          {highlightRadiusKm && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-blue-400" />
              <span>{highlightRadiusKm}km Radius</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
