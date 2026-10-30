import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  Truck, 
  Briefcase, 
  User, 
  MapPin, 
  Calendar, 
  Phone, 
  Car, 
  Check, 
  X, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { ApiClient } from '../../services/apiClient';

interface ApplicantRecord {
  id: string;
  user_id: string;
  applicant_email: string;
  first_name?: string;
  last_name?: string;
  contact_phone?: string;
  status: 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
  submitted_at: string;
  rejection_reason?: string;
  review_notes?: string;
  // Rep-specific
  birth_date?: string;
  hub_street_line1?: string;
  hub_city?: string;
  hub_latitude?: number;
  hub_longitude?: number;
  territory_radius_km?: number;
  transport_details?: string;
  // Driver-specific
  transport_type?: string;
  license_number?: string;
  vehicle_plate?: string;
  vehicle_make_model?: string;
  id_document_number?: string;
  roadworthy_insurance_confirmed?: boolean;
}

export const ApplicantReviewPanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'DRIVER' | 'REP'>('DRIVER');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [repApplications, setRepApplications] = useState<ApplicantRecord[]>([]);
  const [driverApplications, setDriverApplications] = useState<ApplicantRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Review Action State
  const [selectedApp, setSelectedApp] = useState<ApplicantRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [decisionReason, setDecisionReason] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [verifiedDocs, setVerifiedDocs] = useState<{
    id_document: boolean;
    drivers_license: boolean;
    vehicle_roadworthy: boolean;
    proof_of_residence: boolean;
    banking_verification: boolean;
  }>({
    id_document: false,
    drivers_license: false,
    vehicle_roadworthy: false,
    proof_of_residence: false,
    banking_verification: false
  });
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  const fetchApplications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = ApiClient.getToken();
      if (!token) {
        setError('UNAUTHENTICATED: Admin credentials required');
        setIsLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/applications?status=${statusFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Failed to load applications: HTTP ${res.status}`);
      }

      const data = await res.json();
      setRepApplications(data.repApplications || []);
      setDriverApplications(data.driverApplications || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching applicant queue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [statusFilter]);

  const handleOpenReviewModal = (app: ApplicantRecord) => {
    setSelectedApp(app);
    setReviewDecision('APPROVED');
    setDecisionReason('');
    setReviewNotes('');
    setVerifiedDocs({
      id_document: app.status === 'APPROVED',
      drivers_license: app.status === 'APPROVED',
      vehicle_roadworthy: app.status === 'APPROVED',
      proof_of_residence: app.status === 'APPROVED',
      banking_verification: app.status === 'APPROVED'
    });
  };

  const handleExecuteReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setIsSubmittingReview(true);
    setError(null);
    setActionSuccess(null);

    try {
      const token = ApiClient.getToken();
      if (!token) throw new Error('UNAUTHENTICATED');

      const verifiedDocumentsPayload: Record<string, string> = {
        id_document: verifiedDocs.id_document ? 'VERIFIED' : 'UNVERIFIED',
        proof_of_residence: verifiedDocs.proof_of_residence ? 'VERIFIED' : 'UNVERIFIED'
      };

      if (activeCategory === 'DRIVER') {
        verifiedDocumentsPayload.drivers_license = verifiedDocs.drivers_license ? 'VERIFIED' : 'UNVERIFIED';
        verifiedDocumentsPayload.vehicle_roadworthy = verifiedDocs.vehicle_roadworthy ? 'VERIFIED' : 'UNVERIFIED';
      }

      const res = await fetch(`/api/admin/applications/${selectedApp.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roleType: activeCategory,
          decision: reviewDecision,
          reason: decisionReason,
          reviewNotes,
          verifiedDocuments: verifiedDocumentsPayload
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Review submission failed');
      }

      setActionSuccess(`Application #${selectedApp.id.slice(0, 8)} successfully updated to: ${reviewDecision}`);
      setSelectedApp(null);
      await fetchApplications();
    } catch (err: any) {
      setError(err.message || 'Review action rejected');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const currentList = activeCategory === 'DRIVER' ? driverApplications : repApplications;

  return (
    <div className="space-y-4">
      
      {/* Top Banner & Category Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Applicant Review &amp; Statutory Compliance Oversight</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Server-persisted queue for commercial driver and territory representative candidates.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Category Toggle */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveCategory('DRIVER')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeCategory === 'DRIVER'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Drivers ({driverApplications.length})</span>
            </button>
            <button
              onClick={() => setActiveCategory('REP')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeCategory === 'REP'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Reps ({repApplications.length})</span>
            </button>
          </div>

          <button
            onClick={fetchApplications}
            disabled={isLoading}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh application queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-slate-500">Filter Status:</span>
        {['ALL', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'].map(st => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-[11px] font-mono ${
              statusFilter === st
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
          Loading authenticated application records from database...
        </div>
      ) : currentList.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-500">
          No {activeCategory === 'DRIVER' ? 'driver' : 'rep'} applications matching filter "{statusFilter}".
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map(app => (
            <div 
              key={app.id} 
              className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-4 text-xs space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
                    {activeCategory === 'DRIVER' ? <Truck className="w-4 h-4 text-emerald-600" /> : <Briefcase className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{app.first_name ? `${app.first_name} ${app.last_name}` : app.applicant_email}</span>
                      <span className="text-[10px] text-slate-400 font-mono">#{app.id.slice(0, 8)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>{app.applicant_email}</span>
                      {app.contact_phone && <span>· {app.contact_phone}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                    app.status === 'APPROVED'
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200'
                      : app.status === 'CHANGES_REQUESTED'
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200'
                      : app.status === 'REJECTED'
                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200'
                      : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200'
                  }`}>
                    {app.status}
                  </span>

                  <button
                    onClick={() => handleOpenReviewModal(app)}
                    className="px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <span>Inspect &amp; Decide</span>
                  </button>
                </div>
              </div>

              {/* Application Details Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px]">
                {activeCategory === 'DRIVER' ? (
                  <>
                    <div>
                      <span className="text-slate-400 block">Transport Category:</span>
                      <span className="font-semibold text-slate-900 dark:text-white capitalize">
                        {app.transport_type === 'LIGHT_TRUCK' ? 'Suitable Light Truck' : app.transport_type}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Plate &amp; Make/Model:</span>
                      <span className="font-semibold font-mono text-slate-900 dark:text-white">
                        {app.vehicle_plate} · {app.vehicle_make_model}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Driver License &amp; ID:</span>
                      <span className="font-semibold font-mono text-slate-900 dark:text-white">
                        {app.license_number} ({app.id_document_number || 'National ID'})
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-slate-400 block">Birth Date (Age 18+):</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {app.birth_date} (Verified ≥18)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Designated Home Hub:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {app.hub_street_line1}, {app.hub_city}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Territory Perimeter:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        Strict 10.0 km Radius ({app.hub_latitude?.toFixed(4)}, {app.hub_longitude?.toFixed(4)})
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Review notes / Rejection reasons if present */}
              {app.rejection_reason && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-900 dark:text-amber-300">
                  <span className="font-bold block">Correction Requested / Rejection Reason:</span>
                  <span>{app.rejection_reason}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                <span>Submitted: {new Date(app.submitted_at).toLocaleString()}</span>
                <span>Audit Ref: rec-{app.id.slice(0, 12)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review & Decision Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
            
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Compliance Review: {activeCategory === 'DRIVER' ? 'Delivery Driver' : 'TUXI Rep'}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedApp(null)} 
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteReview} className="p-4 overflow-y-auto space-y-4 flex-1">
              
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>Applicant: <strong>{selectedApp.first_name ? `${selectedApp.first_name} ${selectedApp.last_name}` : selectedApp.applicant_email}</strong></p>
                <p>Email: <span className="font-mono">{selectedApp.applicant_email}</span></p>
                <p>Candidate ID: <span className="font-mono">{selectedApp.id}</span></p>
              </div>

              {/* Mandatory Verification Checkboxes */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
                  Statutory Document Verification Checklist
                </div>
                
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifiedDocs.id_document}
                    onChange={(e) => setVerifiedDocs(prev => ({ ...prev, id_document: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>National ID / Passport Verified &amp; Age 18+ Authenticated</span>
                </label>

                {activeCategory === 'DRIVER' && (
                  <>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.drivers_license}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, drivers_license: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Valid Driving License ({selectedApp.license_number}) Verified</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.vehicle_roadworthy}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, vehicle_roadworthy: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Vehicle Roadworthiness &amp; Goods-In-Transit Insurance Verified</span>
                    </label>
                  </>
                )}

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifiedDocs.proof_of_residence}
                    onChange={(e) => setVerifiedDocs(prev => ({ ...prev, proof_of_residence: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Proof of Residence &amp; Home Hub Boundary Verified</span>
                </label>

                <p className="text-[10px] text-slate-400 mt-1">
                  * Final approval is strictly blocked by the backend gate if mandatory verification evidence is unverified.
                </p>
              </div>

              {/* Decision Selector */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-900 dark:text-white">
                  Compliance Decision
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'APPROVED' as const, label: 'Approve Role', color: 'emerald' },
                    { id: 'CHANGES_REQUESTED' as const, label: 'Request Changes', color: 'amber' },
                    { id: 'REJECTED' as const, label: 'Reject', color: 'rose' }
                  ].map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setReviewDecision(d.id)}
                      className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        reviewDecision === d.id
                          ? d.id === 'APPROVED' 
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : d.id === 'CHANGES_REQUESTED'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Notes */}
              {(reviewDecision === 'CHANGES_REQUESTED' || reviewDecision === 'REJECTED') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Specific Reason / Applicant Instructions <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    required
                    rows={2}
                    placeholder="e.g. Please re-upload clearer driving licence photo; vehicle roadworthy disc expired."
                    className="w-full p-2.5 bg-white dark:bg-slate-800 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Internal Compliance Audit Notes (Optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  placeholder="Internal audit notes for compliance officers..."
                  className="w-full p-2.5 bg-white dark:bg-slate-800 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sticky Submit Footer inside Modal */}
              <div className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm pt-3 pb-1 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingReview ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording Decision...</span>
                    </>
                  ) : (
                    <span>Confirm Decision &amp; Save</span>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
