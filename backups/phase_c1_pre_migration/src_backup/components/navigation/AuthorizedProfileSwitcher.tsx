import React, { useState, useRef, useEffect } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { UserRole } from '../../types';
import { 
  ShoppingBag, 
  Store, 
  Truck, 
  MapPin, 
  ShieldCheck, 
  User, 
  ChevronDown, 
  LogOut, 
  Check, 
  PlusCircle, 
  ArrowUpRight,
  Sparkles
} from 'lucide-react';

export const AuthorizedProfileSwitcher: React.FC = () => {
  const { 
    currentUser, 
    activeRole, 
    setActiveRole, 
    logout,
    cart,
    setIsRepApplicantModalOpen,
    setIsDriverApplicantModalOpen,
    repApplication,
    driverApplication
  } = useTuxi();

  const [isOpen, setIsOpen] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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

  if (!currentUser) return null;

  // Resolve user's server-authorized roles
  const backendRoles: string[] = Array.isArray(currentUser.roles) ? currentUser.roles : ['CUSTOMER'];

  const allRoleConfigs: { 
    role: UserRole; 
    backendKey: string[]; 
    label: string; 
    icon: React.ReactNode; 
    description: string;
  }[] = [
    { 
      role: 'customer', 
      backendKey: ['CUSTOMER'], 
      label: 'Customer', 
      icon: <ShoppingBag className="w-3.5 h-3.5" />, 
      description: 'Order food, groceries & couriers' 
    },
    { 
      role: 'driver', 
      backendKey: ['TUXI_DELIVERY_DRIVER'], 
      label: 'Driver Cockpit', 
      icon: <Truck className="w-3.5 h-3.5" />, 
      description: 'Active vehicle deliveries & dispatch' 
    },
    { 
      role: 'eats_owner', 
      backendKey: ['TUXI_EATS_OWNER'], 
      label: 'Eats Kitchen', 
      icon: <Store className="w-3.5 h-3.5" />, 
      description: 'Restaurant kitchen prep & orders' 
    },
    { 
      role: 'shop_owner', 
      backendKey: ['TUXI_SHOP_OWNER'], 
      label: 'Shop Merchant', 
      icon: <Store className="w-3.5 h-3.5" />, 
      description: 'Retail inventory & catalog' 
    },
    { 
      role: 'rep', 
      backendKey: ['TUXI_REP'], 
      label: 'TUXI Rep (Field)', 
      icon: <MapPin className="w-3.5 h-3.5" />, 
      description: '10km merchant territory acquisition' 
    },
    { 
      role: 'admin', 
      backendKey: ['ADMIN', 'SUPER_ADMIN'], 
      label: 'Admin Portal', 
      icon: <ShieldCheck className="w-3.5 h-3.5" />, 
      description: 'Platform AI governance & financial oversight' 
    }
  ];

  // Filter to ONLY roles the user is authorized for
  const authorizedRoleConfigs = allRoleConfigs.filter(cfg => 
    cfg.backendKey.some(k => backendRoles.includes(k))
  );

  // Find unassigned roles for partner onboarding prompts
  const unassignedRoleConfigs = allRoleConfigs.filter(cfg => 
    !cfg.backendKey.some(k => backendRoles.includes(k)) && cfg.role !== 'admin'
  );

  const currentRoleConfig = allRoleConfigs.find(r => r.role === activeRole) || authorizedRoleConfigs[0] || allRoleConfigs[0];
  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handleRoleSelect = (role: UserRole) => {
    setActiveRole(role);
    setIsOpen(false);
  };

  const userInitials = `${currentUser.firstName?.[0] || 'U'}${currentUser.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      
      {/* Trigger Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all text-xs font-semibold shadow-2xs cursor-pointer"
        title="Switch profile role or manage account"
      >
        <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
          {userInitials}
        </div>
        
        <div className="hidden sm:flex flex-col text-left leading-tight">
          <span className="font-bold text-slate-900 dark:text-white truncate max-w-[110px]">
            {currentUser.firstName} {currentUser.lastName}
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
            {currentRoleConfig.icon}
            <span>{currentRoleConfig.label}</span>
          </span>
        </div>

        {activeRole === 'customer' && totalCartItems > 0 && (
          <span className="bg-indigo-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold shrink-0">
            {totalCartItems}
          </span>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Profile & Role Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2 z-50 text-xs animate-fade-in divide-y divide-slate-100 dark:divide-slate-800">
          
          {/* User Identity Header */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0">
                <span className="font-bold text-slate-900 dark:text-white block truncate">
                  {currentUser.firstName} {currentUser.lastName}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block truncate">
                  {currentUser.email}
                </span>
              </div>
            </div>
          </div>

          {/* Authorized Roles List */}
          <div className="py-2 px-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 pb-1.5 block">
              Authorized Profiles ({authorizedRoleConfigs.length})
            </span>

            <div className="space-y-1">
              {authorizedRoleConfigs.map(({ role, label, icon, description }) => {
                const isActive = activeRole === role;
                return (
                  <button
                    key={role}
                    onClick={() => handleRoleSelect(role)}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate">{label}</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 block truncate">
                          {description}
                        </span>
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Partner Role Onboarding Applications */}
          {unassignedRoleConfigs.length > 0 && (
            <div className="py-2 px-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 pb-1.5 block">
                Ecosystem &amp; Partner Roles
              </span>

              <div className="space-y-1">
                {unassignedRoleConfigs.map(({ role, label, icon }) => {
                  const isRep = role === 'rep';
                  const isDriver = role === 'driver';
                  const isRepPending = isRep && repApplication?.status === 'PENDING';
                  const isDriverPending = isDriver && driverApplication?.status === 'PENDING';

                  const handleRoleApplicationClick = () => {
                    setIsOpen(false);
                    if (isRep) {
                      setIsRepApplicantModalOpen(true);
                    } else if (isDriver) {
                      setIsDriverApplicantModalOpen(true);
                    } else {
                      setShowApplyModal(label);
                    }
                  };

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={handleRoleApplicationClick}
                      className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                          {icon}
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-xs">
                            {isRepPending
                              ? 'TUXI Rep (Application Pending)'
                              : isDriverPending
                              ? 'Delivery Driver (Application Pending)'
                              : `Apply as ${label}`}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">
                            {isRep
                              ? '10 km territory merchant acquisition'
                              : isDriver
                              ? 'Motorcycle, Car, Bakkie, Light Truck'
                              : 'Verified merchant onboarding'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isRepPending || isDriverPending ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                            IN REVIEW
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                            <span>APPLY</span>
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sign Out Button */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full px-2.5 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>

        </div>
      )}

      {/* Role Application Guidance Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Apply for {showApplyModal}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              TUXI ecosystem permissions require verified documentation and compliance approval. To become certified, please complete the official verification flow with your identity and licensing credentials.
            </p>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <strong>Requirement:</strong> Valid government ID, contact verification, and territory review (10 km hub for Reps).
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowApplyModal(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
