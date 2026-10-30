import React, { useState } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { SplitPaymentMode, GroupOrderMember } from '../../types';
import { 
  Users, 
  UserPlus, 
  Copy, 
  Check, 
  Share2, 
  DollarSign, 
  CreditCard, 
  Trash2, 
  X, 
  Sparkles, 
  ShieldCheck, 
  QrCode, 
  UserCheck, 
  Clock, 
  Sliders, 
  CheckCircle2,
  Lock,
  ArrowRight
} from 'lucide-react';

interface GroupOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout?: () => void;
}

export const GroupOrderModal: React.FC<GroupOrderModalProps> = ({
  isOpen,
  onClose,
  onProceedToCheckout
}) => {
  const {
    groupOrderSession,
    startGroupOrder,
    joinGroupOrder,
    addSimulatedGroupMember,
    removeGroupMember,
    updateSplitMode,
    cancelGroupOrder,
    activeGroupMemberId,
    setActiveGroupMemberId,
    cart,
    config,
    formatPrice,
    businesses
  } = useTuxi();

  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [friendNameInput, setFriendNameInput] = useState<string>('');
  const [friendEmailInput, setFriendEmailInput] = useState<string>('');
  const [showAddManualFriend, setShowAddManualFriend] = useState<boolean>(false);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string>('');

  if (!isOpen) return null;

  // Active target business
  const currentBusiness = businesses.find(b => b.id === groupOrderSession?.businessId) || businesses[0];

  const handleCopyInviteLink = () => {
    const inviteLink = `https://tuxi.global/group/${groupOrderSession?.code || 'GRP-9281'}`;
    navigator.clipboard?.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleAddManualFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendNameInput.trim()) return;

    addSimulatedGroupMember(
      friendNameInput.trim(),
      friendEmailInput.trim() || `${friendNameInput.trim().toLowerCase().replace(/\s+/g, '.')}@example.com`
    );

    setFriendNameInput('');
    setFriendEmailInput('');
    setShowAddManualFriend(false);
  };

  const handleJoinWithCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;

    const ok = joinGroupOrder(joinCodeInput.trim(), 'Alex Morgan', 'alex.m@example.com');
    if (ok) {
      setJoinError('');
      setJoinCodeInput('');
    } else {
      setJoinError('Invalid Group Order Code. Please verify the 4-digit code.');
    }
  };

  // Calculations for Split Payments
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = 2.99;
  const serviceFee = 1.50;
  const tip = 3.00;
  const total = subtotal > 0 ? subtotal + deliveryFee + serviceFee + tip : 0;

  const memberCount = groupOrderSession?.members.length || 1;

  // Calculate each member's item subtotal and split share
  const memberSplits = (groupOrderSession?.members || []).map(member => {
    const memberItems = cart.filter(i => i.addedByMemberId === member.id);
    const memberItemSubtotal = memberItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    
    let shareAmount = 0;
    if (groupOrderSession?.splitMode === 'equal') {
      shareAmount = total > 0 ? total / memberCount : 0;
    } else if (groupOrderSession?.splitMode === 'host_pays') {
      shareAmount = member.isHost ? total : 0;
    } else {
      // by_items: Member's item subtotal + proportional share of delivery, service & tip
      const feesAndTip = deliveryFee + serviceFee + tip;
      const proportion = subtotal > 0 ? memberItemSubtotal / subtotal : 0;
      shareAmount = memberItemSubtotal + (feesAndTip * proportion);
    }

    return {
      member,
      items: memberItems,
      itemSubtotal: memberItemSubtotal,
      shareAmount
    };
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">Group Order &amp; Automated Split</h3>
                {groupOrderSession && (
                  <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                    CODE: {groupOrderSession.code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Multiple users add items to a shared basket · Payments split automatically at checkout
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* If NO active group session: Prompt to Start or Join */}
          {!groupOrderSession ? (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <Users className="w-8 h-8" />
              </div>

              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-lg font-bold text-slate-900">Order Together, Pay Separately</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Start a group order for your office, friends, or family. Everyone selects their food on their own device, and TUXI automatically charges each person their exact share.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto pt-2">
                {/* Option 1: Start Group Order */}
                <div className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-left space-y-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-indigo-950">Host a New Group</span>
                  </div>
                  <p className="text-[11px] text-indigo-900 leading-snug">
                    Generate an invite link &amp; code for {currentBusiness.name}.
                  </p>
                  <button
                    onClick={() => startGroupOrder(currentBusiness.id, currentBusiness.name)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                  >
                    Start Group Order
                  </button>
                </div>

                {/* Option 2: Join Group Order */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-left space-y-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-slate-700" />
                    <span className="font-bold text-xs text-slate-900">Join with Code</span>
                  </div>
                  <form onSubmit={handleJoinWithCode} className="space-y-2">
                    <input
                      type="text"
                      placeholder="e.g. GRP-4821"
                      value={joinCodeInput}
                      onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg uppercase font-mono font-bold bg-white"
                    />
                    {joinError && <p className="text-[10px] text-rose-600">{joinError}</p>}
                    <button
                      type="submit"
                      disabled={!joinCodeInput.trim()}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors"
                    >
                      Join Order
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Group Order Active: Invite Header Strip */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase text-indigo-700 font-bold block">
                    Group Order Link for {groupOrderSession.businessName}
                  </span>
                  <div className="text-xs text-slate-700 flex items-center gap-2">
                    <span>Share code:</span>
                    <span className="font-mono font-black text-indigo-900 text-sm bg-white px-2 py-0.5 rounded border border-indigo-200">
                      {groupOrderSession.code}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyInviteLink}
                    className="px-3 py-2 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied Link!' : 'Copy Invite Link'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('Cancel group order and return to individual basket?')) {
                        cancelGroupOrder();
                      }
                    }}
                    className="px-2.5 py-2 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition-colors"
                    title="Cancel Group Order"
                  >
                    Leave
                  </button>
                </div>
              </div>

              {/* Persona Switcher / Active Ordering Member */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Ordering As (Active Device Persona):</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Select who is currently selecting items
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {groupOrderSession.members.map(mbr => {
                    const isSelected = mbr.id === activeGroupMemberId;
                    return (
                      <button
                        key={mbr.id}
                        onClick={() => setActiveGroupMemberId(mbr.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-slate-300'}`} />
                        <span>{mbr.name}</span>
                        {mbr.isHost && <span className="text-[9px] opacity-80">(Host)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Split Payment Strategy Mode Selector */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Automated Checkout Split Mode</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">100% Cashless Tokenized</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Mode 1: Split by Items */}
                  <button
                    onClick={() => updateSplitMode('by_items')}
                    className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                      groupOrderSession.splitMode === 'by_items'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Itemized Split</span>
                      {groupOrderSession.splitMode === 'by_items' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Each person pays for their own items + proportional fees.
                    </p>
                  </button>

                  {/* Mode 2: Equal Split */}
                  <button
                    onClick={() => updateSplitMode('equal')}
                    className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                      groupOrderSession.splitMode === 'equal'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Equal Split</span>
                      {groupOrderSession.splitMode === 'equal' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Total split evenly across all {memberCount} participants.
                    </p>
                  </button>

                  {/* Mode 3: Host Pays All */}
                  <button
                    onClick={() => updateSplitMode('host_pays')}
                    className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                      groupOrderSession.splitMode === 'host_pays'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Host Covers All</span>
                      {groupOrderSession.splitMode === 'host_pays' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Host pays 100% of the bill with group member cart items.
                    </p>
                  </button>
                </div>
              </div>

              {/* Members & Split Payment Breakdown Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Participants &amp; Payment Authorizations ({memberCount})</span>
                  </h4>

                  {/* Add Simulated Friend Quick Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        addSimulatedGroupMember(
                          'David Kim',
                          'david.k@example.com',
                          [
                            { itemId: 'item-02', name: 'Burrata Pugliese & Tomatoes', price: 11.00 }
                          ]
                        );
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                      title="Simulate coworker David Kim joining and adding items"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ David (+$11.00)</span>
                    </button>

                    <button
                      onClick={() => {
                        addSimulatedGroupMember(
                          'Sophie Laurent',
                          'sophie.l@example.com',
                          [
                            { itemId: 'item-03', name: 'Truffle Aioli Dip & Focaccia', price: 6.50 }
                          ]
                        );
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                      title="Simulate friend Sophie Laurent joining"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Sophie (+$6.50)</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {memberSplits.map(({ member, items, itemSubtotal, shareAmount }) => (
                    <div
                      key={member.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900">{member.name}</span>
                              {member.isHost && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  HOST
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Card: {member.paymentMethodTitle || 'Apple Pay'} · {items.length} items added
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Split Share</span>
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {formatPrice(shareAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Member Item Tags */}
                      {items.length > 0 ? (
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] space-y-1">
                          {items.map(i => (
                            <div key={i.id} className="flex items-center justify-between text-slate-600">
                              <span>{i.quantity}x {i.name}</span>
                              <span className="font-mono text-slate-800">{formatPrice(i.price * i.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">No items added yet by this member.</p>
                      )}

                      {/* Member Authorization Status */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                        <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Payment Pre-Authorized (Cashless PCI Vault)</span>
                        </span>

                        {!member.isHost && (
                          <button
                            onClick={() => removeGroupMember(member.id)}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Automated Cashless Settlement Guarantee */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-emerald-950 text-xs flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Zero manual IOUs:</strong> When the host completes checkout, TUXI automatically triggers individual tokenized card charges for each member&apos;s calculated share.
                </p>
              </div>
            </>
          )}

        </div>

        {/* Footer Actions */}
        {groupOrderSession && (
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Grand Total ({cart.length} items)</span>
              <span className="text-lg font-black font-mono text-slate-900">{formatPrice(total)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors"
              >
                Continue Adding Items
              </button>

              <button
                onClick={() => {
                  onClose();
                  if (onProceedToCheckout) {
                    onProceedToCheckout();
                  }
                }}
                disabled={cart.length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
              >
                <span>Checkout &amp; Split Payment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
