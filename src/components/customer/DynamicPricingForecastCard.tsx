import React, { useState, useEffect } from 'react';
import { 
  DynamicPricingTelemetry, 
  HourlySurgeForecast, 
  WeatherCondition,
  onDynamicPricingUpdate, 
  setSimulatedWeather, 
  setSimulatedDemandBoost, 
  resetDynamicPricingSimulation 
} from '../../utils/dynamicPricingEngine';
import { useTuxi } from '../../context/TuxiContext';
import { 
  TrendingUp, 
  Zap, 
  CloudRain, 
  Sun, 
  CloudLightning, 
  Clock, 
  DollarSign, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Users, 
  Bike, 
  Info,
  RefreshCw,
  SlidersHorizontal,
  Flame
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';

interface DynamicPricingForecastCardProps {
  className?: string;
}

export const DynamicPricingForecastCard: React.FC<DynamicPricingForecastCardProps> = ({
  className = ''
}) => {
  const { formatPrice } = useTuxi();
  const [telemetry, setTelemetry] = useState<DynamicPricingTelemetry | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [forecastView, setForecastView] = useState<'next6h' | '24h'>('next6h');
  const [showSimulator, setShowSimulator] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onDynamicPricingUpdate(data => {
      setTelemetry(data);
    });
    return () => unsub();
  }, []);

  if (!telemetry) return null;

  const isSurging = telemetry.currentMultiplier > 1.05;
  const isHighSurge = telemetry.currentMultiplier >= 1.5;

  const chartData = forecastView === 'next6h' ? telemetry.forecastNext6h : telemetry.forecast24h;

  const weatherIcons: Record<WeatherCondition, React.ReactNode> = {
    clear: <Sun className="w-3.5 h-3.5 text-amber-500" />,
    light_rain: <CloudRain className="w-3.5 h-3.5 text-blue-400" />,
    heavy_rain: <CloudRain className="w-3.5 h-3.5 text-indigo-400" />,
    storm: <CloudLightning className="w-3.5 h-3.5 text-purple-400" />
  };

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-xs ${
      isHighSurge
        ? 'bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950 border-purple-500/40 text-white'
        : isSurging
          ? 'bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border-amber-500/30 text-white'
          : 'bg-white border-slate-200 text-slate-800'
    } ${className}`}>
      
      {/* Primary Bar */}
      <div className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Left Side: Status & Metric */}
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div className={`p-2 sm:p-2.5 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
            isHighSurge
              ? 'bg-gradient-to-tr from-purple-600 to-rose-600 text-white shadow-md shadow-purple-900/40 animate-pulse'
              : isSurging
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}>
            {isHighSurge ? (
              <Flame className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : isSurging ? (
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className={`font-bold text-xs sm:text-sm ${
                isSurging || isHighSurge ? 'text-white' : 'text-slate-900'
              }`}>
                AI Dynamic Delivery Fee
              </span>

              {/* Multiplier Badge */}
              <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-xs shrink-0 ${
                isHighSurge
                  ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40 animate-pulse'
                  : isSurging
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}>
                {isSurging && <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />}
                <span>{telemetry.currentMultiplier.toFixed(2)}x {isSurging ? 'Surge Active' : 'Standard Rate'}</span>
              </span>

              {/* Dynamic Fee Amount */}
              <div className="flex flex-wrap items-baseline gap-1 font-mono font-bold text-xs shrink-0">
                <span className={isSurging || isHighSurge ? 'text-emerald-300' : 'text-slate-700'}>
                  {formatPrice(telemetry.dynamicDeliveryFee)}
                </span>
                {isSurging && (
                  <span className="text-[10px] font-normal opacity-80">
                    (Base {formatPrice(telemetry.baseDeliveryFee)} + {formatPrice(telemetry.surgeAmount)})
                  </span>
                )}
              </div>
            </div>

            <p className={`text-[11px] leading-tight max-w-xl truncate ${
              isSurging || isHighSurge ? 'text-slate-300' : 'text-slate-500'
            }`}>
              {telemetry.surgeReason}
            </p>
          </div>
        </div>

        {/* Right Side: Quick Stats & Toggle */}
        <div className="flex items-center gap-2 self-stretch md:self-center shrink-0 w-full md:w-auto justify-between md:justify-end">
          
          {/* Weather Tag */}
          <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
            isSurging || isHighSurge 
              ? 'bg-white/10 border-white/10 text-slate-200' 
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            {weatherIcons[telemetry.weather]}
            <span className="capitalize">{telemetry.weather.replace('_', ' ')}</span>
          </div>

          {/* Supply/Demand Tag */}
          <div className={`hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${
            isSurging || isHighSurge 
              ? 'bg-white/10 border-white/10 text-slate-200' 
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`} title="Active customer orders vs nearby active couriers">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-indigo-400" />
              <span>{telemetry.activeOrders} orders</span>
            </span>
            <span>/</span>
            <span className="flex items-center gap-1">
              <Bike className="w-3 h-3 text-emerald-400" />
              <span>{telemetry.availableDrivers} drivers</span>
            </span>
          </div>

          {/* Simulator Toggle */}
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-colors min-h-[36px] ${
              showSimulator
                ? 'bg-indigo-600 text-white border-indigo-600'
                : isSurging || isHighSurge
                  ? 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Simulate weather, rush hour & demand spikes"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Simulate</span>
          </button>

          {/* Expand/Collapse Forecast Chart */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs min-h-[36px] ${
              isExpanded
                ? 'bg-white text-slate-900 border-white'
                : isSurging || isHighSurge
                  ? 'bg-white/15 hover:bg-white/25 text-white border-white/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{isExpanded ? 'Hide' : 'Forecast'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

      </div>

      {/* Simulator Control Drawer */}
      {showSimulator && (
        <div className={`p-3 sm:p-4 border-t text-xs space-y-3.5 ${
          isSurging || isHighSurge 
            ? 'bg-black/30 border-white/10 text-white' 
            : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
            <span className="font-bold flex items-center gap-1.5 text-xs sm:text-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="leading-snug">Real-Time Demand Pricing Simulator (AI Engine Test Bench)</span>
            </span>
            <button
              onClick={resetDynamicPricingSimulation}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 self-start sm:self-auto py-1 shrink-0 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset to Live Feeds</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Weather Simulator */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5 opacity-75">
                Simulate Weather Condition
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(['clear', 'light_rain', 'heavy_rain', 'storm'] as WeatherCondition[]).map(w => (
                  <button
                    key={w}
                    onClick={() => setSimulatedWeather(w)}
                    className={`py-2 px-1.5 rounded-lg border text-[10px] sm:text-[11px] font-semibold capitalize flex items-center justify-center gap-1 transition-colors min-h-[36px] ${
                      telemetry.weather === w
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                        : isSurging || isHighSurge
                          ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {weatherIcons[w]}
                    <span className="truncate">{w.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Demand Spike Simulator */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5 opacity-75">
                Simulate Order Volume Spike
              </span>
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                {[
                  { label: 'Normal (1x)', boost: 0 },
                  { label: 'Lunch Rush', boost: 1 },
                  { label: 'Dinner Peak', boost: 2 }
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => setSimulatedDemandBoost(item.boost)}
                    className={`py-2 px-1 rounded-lg border text-[10px] sm:text-[11px] font-semibold transition-colors min-h-[36px] text-center flex items-center justify-center ${
                      telemetry.activeOrders > 70 && item.boost === 2
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                        : isSurging || isHighSurge
                          ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span className="truncate block leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Explanatory notice */}
            <div className="sm:col-span-2 lg:col-span-1 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-[10px] opacity-80 leading-relaxed">
                TUXI dynamic pricing calculates real-time fees using localized driver-to-order density, meteorological radar, and historical kitchen prep times.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Visual Surge Forecast Chart Drawer */}
      {isExpanded && (
        <div className={`p-3 sm:p-4 border-t space-y-3.5 sm:space-y-4 ${
          isSurging || isHighSurge
            ? 'bg-slate-950/90 border-white/10 text-white'
            : 'bg-slate-50/70 border-slate-200 text-slate-900'
        }`}>
          
          {/* Header Controls for Forecast Range */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-200">
                <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Predictive Surge &amp; Delivery Fee Curve</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                AI model forecasts hourly demand peaks to help you choose the lowest fee ordering window.
              </p>
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-black/20 rounded-xl border border-white/10 self-stretch sm:self-auto justify-between sm:justify-start">
              <button
                onClick={() => setForecastView('next6h')}
                className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
                  forecastView === 'next6h'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Next 6 Hours
              </button>
              <button
                onClick={() => setForecastView('24h')}
                className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
                  forecastView === '24h'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                24-Hour Cycle
              </button>
            </div>
          </div>

          {/* AI Savings Recommendation Banner */}
          <div className={`p-2.5 sm:p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
            isSurging
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}>
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span className="leading-tight text-[11px] sm:text-xs">{telemetry.recommendedOrderWindow.message}</span>
            </div>

            {telemetry.recommendedOrderWindow.savingsAmount > 0 && (
              <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 self-start sm:self-auto">
                SAVE ${telemetry.recommendedOrderWindow.savingsAmount.toFixed(2)}
              </span>
            )}
          </div>

          {/* Recharts Area Chart */}
          <div className="h-48 sm:h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="surgeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isHighSurge ? '#c084fc' : '#f59e0b'} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={isHighSurge ? '#9333ea' : '#3b82f6'} stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <XAxis 
                  dataKey="hourLabel" 
                  stroke="#94a3b8" 
                  fontSize={9} 
                  tickLine={false}
                  axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                  interval="preserveStartEnd"
                />
                
                <YAxis 
                  width={34}
                  stroke="#94a3b8" 
                  fontSize={9} 
                  domain={[0.8, 2.6]} 
                  tickFormatter={(val) => `${val.toFixed(1)}x`}
                  tickLine={false}
                  axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                />

                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as HourlySurgeForecast;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1 text-white pointer-events-none z-50 max-w-[220px]">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1">
                            <span className="font-bold text-slate-300">{data.hourLabel}</span>
                            <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                              data.multiplier >= 1.6
                                ? 'bg-rose-500/30 text-rose-300'
                                : data.multiplier > 1.1
                                  ? 'bg-amber-500/30 text-amber-300'
                                  : 'bg-emerald-500/30 text-emerald-300'
                            }`}>
                              {data.multiplier.toFixed(2)}x
                            </span>
                          </div>

                          <div className="flex justify-between gap-3 text-slate-400">
                            <span>Predicted Fee:</span>
                            <span className="font-mono font-bold text-emerald-400">${data.fee.toFixed(2)}</span>
                          </div>

                          <div className="flex justify-between gap-3 text-slate-400">
                            <span>Demand Intensity:</span>
                            <span className="font-mono text-cyan-300">{data.demandIntensity}%</span>
                          </div>

                          {data.eventAnnotation && (
                            <div className="pt-1 text-[10px] text-amber-300 font-semibold">
                              ★ {data.eventAnnotation}
                            </div>
                          )}

                          {data.isOptimal && (
                            <div className="pt-0.5 text-[10px] text-emerald-400 font-semibold">
                              ✓ Best Price Window
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* 1.0x Baseline Reference Line */}
                <ReferenceLine y={1.0} stroke="#10b981" strokeDasharray="3 3" opacity={0.6} />

                <Area 
                  type="monotone" 
                  dataKey="multiplier" 
                  stroke={isHighSurge ? '#e879f9' : '#f59e0b'} 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#surgeGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend and Guidance */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-800 text-[10px] sm:text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Standard (1.0x - 1.1x)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span>Moderate Surge (1.2x - 1.4x)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                <span>Peak Rush (1.5x - 2.5x)</span>
              </div>
            </div>

            <span className="font-mono text-[10px] text-slate-500">
              Real-time dispatch neural mesh
            </span>
          </div>

        </div>
      )}

    </div>
  );
};
