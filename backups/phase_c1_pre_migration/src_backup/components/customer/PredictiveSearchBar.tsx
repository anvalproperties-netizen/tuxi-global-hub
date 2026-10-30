import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  Business, 
  MenuItem, 
  ProductItem, 
  OrderCartItem, 
  PreviouslyViewedItem 
} from '../../types';
import { 
  Search, 
  X, 
  Clock, 
  RotateCcw, 
  Eye, 
  TrendingUp, 
  ArrowRight, 
  Utensils, 
  ShoppingBag, 
  Plus, 
  Check, 
  Sparkles, 
  Store, 
  Zap,
  Trash2
} from 'lucide-react';

interface PredictiveSearchBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeTab: 'eats' | 'shop';
  onSelectBusiness: (biz: Business) => void;
  onAddItemToCart: (item: MenuItem | ProductItem, biz: Business) => void;
  previouslyViewedItems: PreviouslyViewedItem[];
  onClearViewedItems: () => void;
  className?: string;
}

const DEFAULT_HISTORY_SEEDS = [
  'Truffle Woodfire Pizza',
  'Organic Hass Avocados',
  'Salmon Poke Bowl',
  'Artisan Sourdough Loaf',
  'Iced Matcha Oat Latte'
];

export const PredictiveSearchBar: React.FC<PredictiveSearchBarProps> = ({
  searchQuery,
  setSearchQuery,
  activeTab,
  onSelectBusiness,
  onAddItemToCart,
  previouslyViewedItems,
  onClearViewedItems,
  className = ''
}) => {
  const { businesses, orders, formatPrice } = useTuxi();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [reorderedItemIds, setReorderedItemIds] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search History from localStorage
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tuxi_search_history');
      return saved ? JSON.parse(saved) : DEFAULT_HISTORY_SEEDS;
    } catch {
      return DEFAULT_HISTORY_SEEDS;
    }
  });

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tuxi_search_history', JSON.stringify(searchHistory));
    } catch (e) {
      console.warn('Could not save search history', e);
    }
  }, [searchHistory]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle saving search term to history
  const handleCommitSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setSearchHistory(prev => {
      const filtered = prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase());
      return [trimmed, ...filtered].slice(0, 8); // Keep top 8
    });
  };

  const handleSelectSearchTerm = (term: string) => {
    setSearchQuery(term);
    handleCommitSearch(term);
    setIsOpen(false);
  };

  const handleRemoveHistoryItem = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory(prev => prev.filter(t => t !== termToRemove));
  };

  const handleClearAllHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory([]);
  };

  // Compile unique items from past orders for Quick Reorder
  const pastOrderedItems = useMemo(() => {
    const itemMap = new Map<string, {
      item: OrderCartItem;
      businessName: string;
      businessId?: string;
      orderNumber: string;
      orderDate: string;
      orderCount: number;
    }>();

    orders.forEach(order => {
      order.items?.forEach(cartItem => {
        const key = cartItem.name.toLowerCase().trim();
        const existing = itemMap.get(key);
        if (existing) {
          existing.orderCount += 1;
        } else {
          itemMap.set(key, {
            item: cartItem,
            businessName: order.businessName || 'TUXI Store',
            businessId: order.businessId,
            orderNumber: order.orderNumber,
            orderDate: new Date(order.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            orderCount: 1
          });
        }
      });
    });

    return Array.from(itemMap.values());
  }, [orders]);

  // Real-time Predictive Search Matches across menu items & products
  const predictiveResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return {
        matchedItems: [],
        matchedBusinesses: [],
        matchedPastOrders: [],
        matchingHistory: []
      };
    }

    // 1. Matched Dishes & Products across all businesses
    const itemsList: {
      item: MenuItem | ProductItem;
      business: Business;
      isProduct: boolean;
    }[] = [];

    businesses.forEach(biz => {
      // Menu items
      biz.menuItems?.forEach(item => {
        if (
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
        ) {
          itemsList.push({ item, business: biz, isProduct: false });
        }
      });

      // Grocery products
      biz.products?.forEach(prod => {
        if (
          prod.name.toLowerCase().includes(q) ||
          prod.category.toLowerCase().includes(q)
        ) {
          itemsList.push({ item: prod, business: biz, isProduct: true });
        }
      });
    });

    // 2. Matched Stores & Restaurants
    const matchedBiz = businesses.filter(b => 
      b.name.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q)
    );

    // 3. Matched Past Ordered Items
    const matchedPast = pastOrderedItems.filter(p => 
      p.item.name.toLowerCase().includes(q) ||
      p.businessName.toLowerCase().includes(q)
    );

    // 4. Matched Search History
    const matchedHist = searchHistory.filter(h => 
      h.toLowerCase().includes(q) && h.toLowerCase() !== q
    );

    return {
      matchedItems: itemsList.slice(0, 8),
      matchedBusinesses: matchedBiz.slice(0, 4),
      matchedPastOrders: matchedPast.slice(0, 4),
      matchingHistory: matchedHist.slice(0, 4)
    };
  }, [searchQuery, businesses, pastOrderedItems, searchHistory]);

  const handleInstantReorder = (itemData: typeof pastOrderedItems[0], e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Find the business if possible or create stub
    const matchedBiz = businesses.find(b => b.id === itemData.businessId || b.name === itemData.businessName) || businesses[0];
    
    // Convert to item format
    const itemToAdd: MenuItem = {
      id: itemData.item.itemId || `reorder-${Date.now()}`,
      name: itemData.item.name,
      description: `Previously ordered from ${itemData.businessName}`,
      price: itemData.item.price,
      category: 'Reorder',
      isAvailable: true
    };

    onAddItemToCart(itemToAdd, matchedBiz);
    
    // Feedback animation
    setReorderedItemIds(prev => ({ ...prev, [itemData.item.name]: true }));
    setTimeout(() => {
      setReorderedItemIds(prev => ({ ...prev, [itemData.item.name]: false }));
    }, 2000);
  };

  const handleQuickAddViewedItem = (viewed: PreviouslyViewedItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const matchedBiz = businesses.find(b => b.id === viewed.businessId) || businesses[0];
    const itemToAdd: MenuItem = {
      id: viewed.itemId,
      name: viewed.name,
      description: `Recently viewed item from ${viewed.businessName}`,
      price: viewed.price,
      category: viewed.category || 'General',
      isAvailable: true
    };
    onAddItemToCart(itemToAdd, matchedBiz);
    
    setReorderedItemIds(prev => ({ ...prev, [viewed.id]: true }));
    setTimeout(() => {
      setReorderedItemIds(prev => ({ ...prev, [viewed.id]: false }));
    }, 2000);
  };

  // Helper to highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.trim()})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-indigo-100 text-indigo-950 font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasHistory = searchHistory.length > 0;
  const hasPastOrders = pastOrderedItems.length > 0;
  const hasViewedItems = previouslyViewedItems.length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleCommitSearch(searchQuery);
              setIsOpen(false);
            } else if (e.key === 'Escape') {
              setIsOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={
            activeTab === 'eats'
              ? 'Search dishes, pizza, sushi, or restaurants...'
              : 'Search groceries, organic produce, or stores...'
          }
          className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-900 placeholder-slate-400 font-medium"
        />

        {searchQuery ? (
          <button
            onClick={() => {
              setSearchQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center gap-0.5 text-[10px] text-slate-400 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
            <span>↵</span>
          </div>
        )}
      </div>

      {/* Floating Predictive Search & History Drawer */}
      {isOpen && (
        <div className="absolute left-0 right-0 sm:right-auto sm:w-[480px] mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-fade-in text-xs max-h-[80vh] flex flex-col">
          
          {/* Header Strip with Context Filter */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium shrink-0">
            <span className="flex items-center gap-1.5 text-slate-700 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                {hasSearchQuery ? 'Predictive Suggestions' : 'Search & Quick Reorder'}
              </span>
            </span>
            <span className="text-[10px] text-slate-400">
              Press <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600">Esc</kbd> to close
            </span>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">

            {/* STATE A: ACTIVE QUERY RESULTS */}
            {hasSearchQuery ? (
              <div className="p-3 space-y-4">
                
                {/* 1. Direct Item Matches (Dishes & Groceries) */}
                {predictiveResults.matchedItems.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider block mb-2 px-1">
                      Matching Dishes &amp; Products ({predictiveResults.matchedItems.length})
                    </span>
                    <div className="space-y-1">
                      {predictiveResults.matchedItems.map(({ item, business, isProduct }) => (
                        <div
                          key={`${business.id}-${item.id}`}
                          onClick={() => {
                            onSelectBusiness(business);
                            setIsOpen(false);
                            handleCommitSearch(item.name);
                          }}
                          className="p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors flex items-center justify-between group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 font-bold">
                              {isProduct ? <ShoppingBag className="w-4 h-4" /> : <Utensils className="w-4 h-4" />}
                            </div>
                            <div className="truncate">
                              <span className="font-bold text-slate-900 block truncate group-hover:text-indigo-600 transition-colors">
                                {highlightMatch(item.name, searchQuery)}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate block">
                                {business.name} · <span className="font-mono font-semibold text-slate-700">{formatPrice(item.price)}</span>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                onAddItemToCart(item, business);
                                handleCommitSearch(item.name);
                              }}
                              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors flex items-center gap-1 text-[11px]"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Matched Businesses / Stores */}
                {predictiveResults.matchedBusinesses.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider block mb-2 px-1">
                      Matching Restaurants &amp; Stores
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {predictiveResults.matchedBusinesses.map(biz => (
                        <div
                          key={biz.id}
                          onClick={() => {
                            onSelectBusiness(biz);
                            setIsOpen(false);
                            handleCommitSearch(biz.name);
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex items-center gap-2.5 group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                            <img
                              src={biz.bannerImage}
                              alt={biz.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate group-hover:text-indigo-700">
                              {highlightMatch(biz.name, searchQuery)}
                            </span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              {biz.category} · {biz.prepTimeMinutes}m
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Matching Past Orders for Reorder */}
                {predictiveResults.matchedPastOrders.length > 0 && (
                  <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/80">
                    <span className="text-[10px] font-mono uppercase font-bold text-amber-900 flex items-center gap-1 mb-2">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reorder from Past Orders</span>
                    </span>
                    <div className="space-y-1.5">
                      {predictiveResults.matchedPastOrders.map((past, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200/60 text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-slate-900 block truncate">
                              {highlightMatch(past.item.name, searchQuery)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Ordered from {past.businessName} · <span className="font-mono">{formatPrice(past.item.price)}</span>
                            </span>
                          </div>

                          <button
                            onClick={e => handleInstantReorder(past, e)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 shrink-0"
                          >
                            {reorderedItemIds[past.item.name] ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3 h-3" />
                                <span>Reorder</span>
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State when no results matched */}
                {predictiveResults.matchedItems.length === 0 && 
                 predictiveResults.matchedBusinesses.length === 0 && 
                 predictiveResults.matchedPastOrders.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <Search className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-700 font-semibold">No direct matches for &quot;{searchQuery}&quot;</p>
                    <p className="text-slate-400 text-[11px]">
                      Try searching by general terms like &quot;Pizza&quot;, &quot;Pasta&quot;, &quot;Fruit&quot;, or &quot;Pharmacy&quot;.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* STATE B: EMPTY INPUT (History, Quick Reorder & Previously Viewed) */
              <div className="divide-y divide-slate-100">
                
                {/* 1. Quick Reorder from Past Orders */}
                {hasPastOrders && (
                  <div className="p-3.5 space-y-2.5 bg-gradient-to-b from-indigo-50/40 to-transparent">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-indigo-950 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>Quick Reorder (Past Favorites)</span>
                      </span>
                      <span className="text-[10px] text-indigo-600 font-medium">1-Click Basket Add</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {pastOrderedItems.slice(0, 4).map((past, idx) => {
                        const isJustAdded = reorderedItemIds[past.item.name];
                        return (
                          <div
                            key={idx}
                            className="p-2.5 bg-white border border-indigo-100 hover:border-indigo-300 rounded-xl transition-all flex items-center justify-between gap-2 shadow-2xs group"
                          >
                            <div className="min-w-0 pr-1">
                              <span className="font-bold text-slate-900 block truncate group-hover:text-indigo-600 transition-colors">
                                {past.item.name}
                              </span>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono font-bold text-slate-800">{formatPrice(past.item.price)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{past.businessName}</span>
                              </div>
                            </div>

                            <button
                              onClick={e => handleInstantReorder(past, e)}
                              className={`px-2.5 py-1.5 font-bold rounded-lg text-[11px] transition-all flex items-center gap-1 shrink-0 ${
                                isJustAdded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 hover:bg-indigo-600 text-white'
                              }`}
                              title="Add directly to cart"
                            >
                              {isJustAdded ? (
                                <>
                                  <Check className="w-3 h-3 text-white" />
                                  <span>Added!</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reorder</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Search History Section */}
                {hasHistory && (
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Recent Searches</span>
                      </span>
                      <button
                        onClick={handleClearAllHistory}
                        className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear All</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {searchHistory.map((term, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectSearchTerm(term)}
                          className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 rounded-xl text-slate-700 hover:text-indigo-900 transition-colors cursor-pointer text-xs"
                        >
                          <Search className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
                          <span className="font-medium">{term}</span>
                          <button
                            onClick={e => handleRemoveHistoryItem(term, e)}
                            className="p-0.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200/60"
                            title="Remove from history"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Previously Viewed Items */}
                {hasViewedItems && (
                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        <span>Previously Viewed Items</span>
                      </span>
                      <button
                        onClick={onClearViewedItems}
                        className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {previouslyViewedItems.slice(0, 4).map((viewed) => {
                        const isAdded = reorderedItemIds[viewed.id];
                        return (
                          <div
                            key={viewed.id}
                            className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between hover:bg-slate-100/60 transition-colors"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-900 block truncate">
                                {viewed.name}
                              </span>
                              <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span className="font-mono font-bold text-slate-800">{formatPrice(viewed.price)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{viewed.businessName}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-400">{viewed.viewedAt}</span>
                              </div>
                            </div>

                            <button
                              onClick={e => handleQuickAddViewedItem(viewed, e)}
                              className={`px-2 py-1 font-bold text-[10px] rounded-lg transition-colors flex items-center gap-1 shrink-0 ${
                                isAdded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 hover:bg-indigo-600 text-white'
                              }`}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-3 h-3 text-white" />
                                  <span>Added</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>Add</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. Trending & Category Suggestions */}
                <div className="p-3.5 space-y-2 bg-slate-50/50">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Popular Searches &amp; Categories</span>
                  </span>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Neapolitan Pizza',
                      'Artisan Burgers',
                      'Poke Bowls',
                      'Farm Fresh Eggs',
                      'Cold-Pressed Juice',
                      'Organic Sourdough'
                    ].map((cat, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSearchTerm(cat)}
                        className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-800 rounded-lg text-[11px] font-medium transition-colors"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer Note */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-1">
              <Store className="w-3 h-3 text-slate-400" />
              <span>Searching across {businesses.length} active stores in {businesses[0]?.city || 'London'}</span>
            </span>
            <span className="text-slate-400 font-mono text-[9px]">TUXI Instant Search Engine</span>
          </div>

        </div>
      )}
    </div>
  );
};
