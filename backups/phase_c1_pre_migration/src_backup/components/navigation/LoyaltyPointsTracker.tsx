import React, { useState, useRef, useEffect } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Award, 
  Gift, 
  Sparkles, 
  Star, 
  ChevronDown, 
  User, 
  CheckCircle2, 
  ArrowUpRight, 
  TrendingUp, 
  Tag, 
  Clock, 
  Check, 
  X,
  Zap
} from 'lucide-react';

export const LoyaltyPointsTracker: React.FC = () => {
  const { loyaltyProfile, redeemReward, config, formatPrice } = useTuxi();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [rewardRedeemedFeedback, setRewardRedeemedFeedback] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleRedeem = (points: number, title: string) => {
    const success = redeemReward(points, title);
    if (success) {
      setRewardRedeemedFeedback(`Successfully redeemed "${title}"! Voucher applied to your checkout.`);
      setTimeout(() => setRewardRedeemedFeedback(''), 4000);
    }
  };

  const progressPercent = Math.min(
    100, 
    Math.round((loyaltyProfile.totalPoints / loyaltyProfile.nextTierPoints) * 100)
  );

  const pointsToNext = Math.max(0, loyaltyProfile.nextTierPoints - loyaltyProfile.totalPoints);

  const redeemableRewards = [
    {
      id: 'rew-1',
      title: `${config.currencySymbol}5.00 Off Any Order`,
      costPoints: 500,
      description: 'Instant discount deducted at checkout'
    },
    {
      id: 'rew-2',
      title: 'Free Courier Delivery',
      costPoints: 350,
      description: 'Zero delivery fee on next point-to-point dispatch'
    },
    {
      id: 'rew-3',
      title: `${config.currencySymbol}10.00 Off Eats Kitchen`,
      costPoints: 1000,
      description: 'Premium discount on orders above 25.00'
    }
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile & Loyalty Tracker Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all text-xs select-none ${
          isOpen
            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20 text-slate-900 shadow-xs'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
        }`}
        title="View Loyalty Points & Rewards Activity"
      >
        {/* User Avatar */}
        <div className="relative">
          <img
            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&h=80&q=80"
            alt="Emma Watson Profile"
            className="w-6 h-6 rounded-full object-cover border border-amber-300"
          />
          <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[7px] font-bold">
            ★
          </span>
        </div>

        {/* User Name & Tier Badge */}
        <div className="hidden md:flex flex-col text-left leading-tight">
          <span className="font-bold text-slate-900 text-[11px]">Emma W.</span>
          <span className="text-[9px] font-mono text-amber-700 font-semibold uppercase flex items-center gap-0.5">
            {loyaltyProfile.tier} Member
          </span>
        </div>

        {/* Live Points Badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/80 text-amber-900 border border-amber-200 font-mono font-bold text-[11px]">
          <Award className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
          <span>{loyaltyProfile.totalPoints.toLocaleString()} pts</span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-amber-600' : ''}`} />
      </button>

      {/* Loyalty Points Popover & Rewards Drawer */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-sm sm:w-96 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-3.5 sm:p-4 z-50 text-xs text-slate-800 dark:text-slate-100 space-y-3.5 sm:space-y-4 animate-fade-in max-h-[85dvh] overflow-y-auto">
          
          {/* Header Profile Area */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <img
                src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&h=120&q=80"
                alt="Emma Watson"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-amber-300 shadow-xs shrink-0"
              />
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">Emma Watson</h3>
                <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate block">emma.watson@example.com</span>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded-full font-mono text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>{loyaltyProfile.tier} Tier</span>
            </span>
          </div>

          {rewardRedeemedFeedback && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 animate-fade-in">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{rewardRedeemedFeedback}</span>
            </div>
          )}

          {/* Current Points Balance Card */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-50/50 to-orange-500/10 dark:from-amber-500/15 dark:via-slate-800/60 dark:to-orange-500/15 border border-amber-200/80 dark:border-amber-800/50 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase text-amber-800 dark:text-amber-300 font-bold block">
                  Current Points Balance
                </span>
                <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight flex items-baseline gap-1.5 mt-0.5">
                  <span>{loyaltyProfile.totalPoints.toLocaleString()}</span>
                  <span className="text-xs text-amber-800 dark:text-amber-300 font-normal">pts</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Redemption Value</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs sm:text-sm">
                  ~{config.currencySymbol}{(loyaltyProfile.totalPoints * 0.01).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Progress to Next Tier */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300">
                <span>Progress to <strong>Platinum</strong></span>
                <span className="font-mono font-bold text-amber-800 dark:text-amber-300">{pointsToNext} pts left</span>
              </div>
              <div className="w-full h-2 rounded-full bg-amber-200/60 dark:bg-amber-900/40 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                <span>Gold (1.5x)</span>
                <span>Platinum (2.0x)</span>
              </div>
            </div>
          </div>

          {/* Redeem Rewards Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Available Rewards to Redeem</span>
              </h4>
              <span className="text-[10px] text-slate-400">Instant discount</span>
            </div>

            <div className="space-y-2">
              {redeemableRewards.map(rew => {
                const canAfford = loyaltyProfile.totalPoints >= rew.costPoints;
                return (
                  <div
                    key={rew.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white block text-xs truncate">{rew.title}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight block">{rew.description}</span>
                    </div>

                    <button
                      onClick={() => handleRedeem(rew.costPoints, rew.title)}
                      disabled={!canAfford}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-[10px] sm:text-[11px] font-mono transition-all shrink-0 min-h-[32px] flex items-center justify-center cursor-pointer ${
                        canAfford
                          ? 'bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white shadow-xs'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      {rew.costPoints} pts
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Points Activity Stream */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Recent Points Activity</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Live Ledger</span>
            </div>

            <div className="max-h-36 sm:max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
              {loyaltyProfile.recentActivity.map(act => (
                <div key={act.id} className="pt-1.5 flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-200 block text-[11px] truncate">{act.title}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{act.date}</span>
                  </div>

                  <span className={`font-mono font-bold text-xs shrink-0 ${
                    act.pointsDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {act.pointsDelta > 0 ? `+${act.pointsDelta}` : act.pointsDelta} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Rule Tip */}
          <div className="p-2 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-[10px] text-indigo-950 dark:text-indigo-200 flex items-start gap-1.5">
            <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Earn <strong>10 points</strong> for every {config.currencySymbol}1.00 spent on Eats, Shop, and Courier. Gold members enjoy <strong>1.5x points acceleration</strong>!
            </p>
          </div>

        </div>
      )}
    </div>
  );
};
