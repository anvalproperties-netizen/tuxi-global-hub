import React, { useState, useEffect } from 'react';
import { 
  RouteStopWaypoint, 
  MultiStopOptimizedRoute, 
  RouteOptimizationObjective,
  RouteLeg
} from '../../types';
import { 
  DEFAULT_STOPS_CATALOG, 
  optimizeMultiStopRoute, 
  setSimulatedTrafficIncident, 
  getSimulatedTrafficIncident 
} from '../../utils/routeOptimizerEngine';
import { InteractiveMap } from '../common/InteractiveMap';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Zap, 
  Leaf, 
  Cpu, 
  Navigation, 
  Clock, 
  MapPin, 
  Fuel, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  RefreshCw, 
  SlidersHorizontal, 
  Sparkles, 
  Check, 
  TrendingDown, 
  Phone, 
  Layers, 
  ShieldCheck, 
  Compass,
  ChevronsRight,
  Flame,
  Gauge
} from 'lucide-react';

interface MultiStopRouteOptimizerProps {
  driverLocation?: { lat: number; lng: number };
  onRouteApplied?: (route: MultiStopOptimizedRoute) => void;
  className?: string;
}

export const MultiStopRouteOptimizer: React.FC<MultiStopRouteOptimizerProps> = ({
  driverLocation = { lat: 51.5240, lng: -0.0760 },
  onRouteApplied,
  className = ''
}) => {
  const { currentDriver, formatPrice } = useTuxi();
  const [objective, setObjective] = useState<RouteOptimizationObjective>('balanced_ai');
  const [stops, setStops] = useState<RouteStopWaypoint[]>(DEFAULT_STOPS_CATALOG);
  const [optimizedRoute, setOptimizedRoute] = useState<MultiStopOptimizedRoute>(() => 
    optimizeMultiStopRoute(driverLocation, DEFAULT_STOPS_CATALOG, 'balanced_ai')
  );
  const [hasIncident, setHasIncident] = useState<boolean>(false);
  const [appliedFeedback, setAppliedFeedback] = useState<string>('');
  const [activeStopIndex, setActiveStopIndex] = useState<number>(0);

  // Recalculate route whenever objective, stops, or traffic incident changes
  useEffect(() => {
    const route = optimizeMultiStopRoute(driverLocation, stops, objective);
    setOptimizedRoute(route);
  }, [driverLocation, stops, objective, hasIncident]);

  const handleToggleStopCompleted = (stopId: string) => {
    setStops(prev => prev.map(s => s.id === stopId ? { ...s, completed: !s.completed } : s));
  };

  const handleToggleSimulatedIncident = () => {
    if (hasIncident) {
      setSimulatedTrafficIncident(null);
      setHasIncident(false);
    } else {
      setSimulatedTrafficIncident({
        roadName: 'A10 Shoreditch High St',
        severity: 'gridlock',
        delayMinutes: 14,
        description: 'Roadwork & Collision on A10 Shoreditch High St (+14m delay)'
      });
      setHasIncident(true);
    }
  };

  const handleApplyRoute = () => {
    if (onRouteApplied) {
      onRouteApplied(optimizedRoute);
    }
    setAppliedFeedback(`✓ AI Route Applied! GPS navigation synced for ${optimizedRoute.stops.length} stops.`);
    setTimeout(() => setAppliedFeedback(''), 4500);
  };

  const currentStop = optimizedRoute.stops[activeStopIndex] || optimizedRoute.stops[0];

  return (
    <div className={`space-y-4 sm:space-y-6 max-w-full overflow-x-hidden ${className}`}>
      
      {/* Feedback Banner */}
      {appliedFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-semibold flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-600 text-white rounded-xl">
              <Check className="w-4 h-4" />
            </div>
            <span>{appliedFeedback}</span>
          </div>
          <button onClick={() => setAppliedFeedback('')} className="text-emerald-700 hover:text-emerald-900 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/40 rounded-2xl p-4 sm:p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-indigo-600 text-white shadow-md shrink-0 mt-0.5 sm:mt-0">
              <Compass className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-base sm:text-lg font-bold">AI Multi-Stop Route Optimizer</h3>
                <span className="px-2 py-0.5 rounded font-mono text-[9px] sm:text-[10px] font-bold uppercase bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                  LIVE TRAFFIC HEURISTICS
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-1 max-w-xl">
                Calculates the most fuel-efficient and time-sensitive path across multi-order batches, rerouting around urban congestion bottlenecks.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0 w-full sm:w-auto">
            <button
              onClick={handleToggleSimulatedIncident}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 flex-1 sm:flex-initial min-h-[38px] ${
                hasIncident
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md animate-pulse'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/20'
              }`}
              title="Simulate sudden traffic incident to test dynamic reroute"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{hasIncident ? 'Clear Detour' : 'Simulate Jam (+14m)'}</span>
            </button>

            <button
              onClick={handleApplyRoute}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-colors flex-1 sm:flex-initial min-h-[38px]"
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>Apply Route</span>
            </button>
          </div>
        </div>

        {/* Objective Mode Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-indigo-800/50">
          {[
            {
              id: 'fastest_time' as const,
              label: 'Fastest / Time-Sensitive',
              desc: 'Minimizes travel minutes & avoids congestion',
              icon: Zap,
              color: 'text-amber-400'
            },
            {
              id: 'fuel_efficient' as const,
              label: 'Eco / Fuel-Efficient',
              desc: 'Minimizes stop-and-go & fuel consumption',
              icon: Leaf,
              color: 'text-emerald-400'
            },
            {
              id: 'balanced_ai' as const,
              label: 'AI Neural Dynamic (Recommended)',
              desc: 'Harmonizes on-time ETAs with fuel savings',
              icon: Sparkles,
              color: 'text-cyan-300'
            }
          ].map(m => {
            const isSelected = objective === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setObjective(m.id)}
                className={`p-3 rounded-xl border text-left transition-all min-h-[44px] ${
                  isSelected
                    ? 'bg-indigo-600/40 border-indigo-400 ring-2 ring-indigo-400/30 text-white'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${m.color} shrink-0`} />
                  <span className="font-bold text-xs">{m.label}</span>
                </div>
                <p className="text-[11px] opacity-80">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Route Metrics KPI Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-4 pt-4 border-t border-indigo-800/40 text-xs">
          <div className="bg-black/30 border border-white/10 rounded-xl p-3 min-w-0">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Total Route ETA</span>
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-white mt-0.5 block truncate">
              {optimizedRoute.totalDurationMinutes} mins
            </span>
            <span className="text-[10px] text-slate-400 font-mono block truncate">
              Finish by ~{optimizedRoute.estimatedArrivalAtFinalStop}
            </span>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-xl p-3 min-w-0">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Distance &amp; Stops</span>
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-white mt-0.5 block truncate">
              {optimizedRoute.totalDistanceKm} km
            </span>
            <span className="text-[10px] text-slate-400 font-mono block truncate">
              {optimizedRoute.stops.length} Deliveries &amp; Pickups
            </span>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-xl p-3 min-w-0">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Fuel className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Fuel &amp; Carbon Savings</span>
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400 mt-0.5 block truncate">
              -{optimizedRoute.fuelSavingsPercent}% ({optimizedRoute.fuelSavedLiters}L)
            </span>
            <span className="text-[10px] text-emerald-300 font-mono block truncate">
              -{optimizedRoute.co2SavedKg}kg CO₂ reduction
            </span>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-xl p-3 min-w-0">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Live Traffic Delay</span>
            </span>
            <span className={`text-lg sm:text-xl font-bold font-mono mt-0.5 block truncate ${
              optimizedRoute.totalTrafficDelayMinutes > 8 ? 'text-rose-400' : 'text-amber-400'
            }`}>
              +{optimizedRoute.totalTrafficDelayMinutes} mins
            </span>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block truncate">
              Traffic: {optimizedRoute.liveCongestionSeverity}
            </span>
          </div>
        </div>
      </div>

      {/* AI Intelligence Insights Quote Callout */}
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs space-y-2 text-indigo-950 shadow-xs">
        <div className="flex items-center gap-2 font-bold text-indigo-900">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>AI Routing Engine Dispatch Rationale:</span>
        </div>
        <ul className="space-y-1.5 pl-6 list-disc text-indigo-900/90 text-xs">
          {optimizedRoute.aiOptimizationInsights.map((insight, idx) => (
            <li key={idx} className="leading-relaxed font-medium">
              {insight}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Two-Column Layout: Visual Map + Waypoint Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Multi-Stop Map Visualizer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                <span>Multi-Stop Corridor Map Preview</span>
              </span>

              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Free Flow</span>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Moderate</span>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>Congested</span>
                </span>
              </div>
            </div>

            <InteractiveMap
              center={driverLocation}
              drivers={[currentDriver]}
              routePoints={{
                from: driverLocation,
                to: currentStop.coords
              }}
              height="380px"
            />

            {/* Current Active Leg Guidance Card */}
            <div className="p-3 sm:p-3.5 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs font-mono shrink-0">
                  {activeStopIndex + 1}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-indigo-300 block">
                    Next Stop: {currentStop.type.toUpperCase()}
                  </span>
                  <span className="font-bold text-sm text-white block truncate">{currentStop.title}</span>
                  <span className="text-[11px] text-slate-300 block truncate">{currentStop.address}</span>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-[10px] text-slate-400 block font-mono">Target Window</span>
                <span className="text-sm font-bold text-cyan-300 font-mono">
                  {currentStop.timeWindowDeadline}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sequenced Waypoints & Road Legs */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Optimized Waypoint Sequence</h4>
                <p className="text-slate-500 text-[11px]">
                  Pickups and dropoffs ordered for minimal transit time.
                </p>
              </div>

              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase shrink-0">
                {optimizedRoute.stops.length} Waypoints
              </span>
            </div>

            {/* Waypoints List */}
            <div className="space-y-3">
              {optimizedRoute.stops.map((stop, index) => {
                const leg = optimizedRoute.legs[index];
                const isSelected = activeStopIndex === index;

                return (
                  <div
                    key={stop.id}
                    onClick={() => setActiveStopIndex(index)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                        : stop.completed
                          ? 'border-slate-200 bg-slate-50 opacity-60'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {/* Header: Stop Number, Type, Title */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-mono text-xs shrink-0 ${
                          stop.completed
                            ? 'bg-emerald-600 text-white'
                            : isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                        }`}>
                          {stop.completed ? <Check className="w-3.5 h-3.5" /> : index + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 truncate">{stop.title}</span>
                            <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase shrink-0 ${
                              stop.type === 'pickup'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {stop.type}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 block truncate">{stop.address}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2">
                        <span className="text-[10px] text-slate-400 font-mono block">Deadline</span>
                        <span className="font-bold font-mono text-slate-800 text-xs">
                          {stop.timeWindowDeadline}
                        </span>
                      </div>
                    </div>

                    {/* Road Leg & Traffic Condition Details */}
                    {leg && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 font-mono">
                        <span className="truncate max-w-[170px]" title={leg.roadName}>
                          via {leg.roadName}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            leg.congestionLevel === 'gridlock' || leg.congestionLevel === 'heavy'
                              ? 'bg-rose-100 text-rose-800'
                              : leg.congestionLevel === 'moderate'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {leg.trafficSpeedKmh} km/h ({leg.congestionLevel})
                          </span>
                          <span>{leg.distanceKm} km · {leg.durationMinutes}m</span>
                        </div>
                      </div>
                    )}

                    {/* Incident Notice on Leg if any */}
                    {leg?.incidentAlert && (
                      <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[10px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                        <span className="truncate">{leg.incidentAlert}</span>
                      </div>
                    )}

                    {/* Contact & Mark Completed Controls */}
                    <div className="mt-2 pt-2 border-t border-slate-100/80 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400 truncate">
                        Package: {stop.packageSummary}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStopCompleted(stop.id);
                        }}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0 min-h-[30px] ${
                          stop.completed
                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {stop.completed ? '✓ Stop Completed' : 'Mark Completed'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
