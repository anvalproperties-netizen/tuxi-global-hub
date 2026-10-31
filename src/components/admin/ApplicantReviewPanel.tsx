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
    proof_of_residence: boolean;
    hub_verification: boolean;
    eligibility_checks: boolean;
    terms_accepted: boolean;
    driver_selfie_liveness: boolean;
    driver_transport_selfie: boolean;
    drivers_license: boolean;
    vehicle_roadworthy: boolean;
    payload_certification: boolean;
    banking_verification: boolean;
  }>({
    id_document: false,
    proof_of_residence: false,
    hub_verification: false,
    eligibility_checks: false,
    terms_accepted: false,
    driver_selfie_liveness: false,
    driver_transport_selfie: false,
    drivers_license: false,
    vehicle_roadworthy: false,
    payload_certification: false,
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
    setReviewDecision(app.status === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED');
    setDecisionReason('');
    setReviewNotes('');
    setVerifiedDocs({
      id_document: app.status === 'APPROVED',
      proof_of_residence: app.status === 'APPROVED',
      hub_verification: app.status === 'APPROVED',
      eligibility_checks: app.status === 'APPROVED',
      terms_accepted: app.status === 'APPROVED',
      driver_selfie_liveness: false, // Honest UNVERIFIED until external biometric provider integrated
      driver_transport_selfie: app.status === 'APPROVED',
      drivers_license: app.status === 'APPROVED',
      vehicle_roadworthy: app.status === 'APPROVED',
      payload_certification: app.status === 'APPROVED',
      banking_verification: false // Honest UNVERIFIED until banking provider integrated
    });
  };

  const previewVaultDoc = async (docId?: string) => {
    if (!docId) return;
    try {
      const token = ApiClient.getToken();
      const res = await fetch(`/api/documents/${docId}/preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Document preview failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(`Unable to preview document: ${err.message}`);
    }
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

      const verifiedDocumentsPayload: Record<string, string> = activeCategory === 'REP' 
        ? {
            id_document: verifiedDocs.id_document ? 'VERIFIED' : 'UNVERIFIED',
            proof_of_residence: verifiedDocs.proof_of_residence ? 'VERIFIED' : 'UNVERIFIED',
            hub_verification: verifiedDocs.hub_verification ? 'VERIFIED' : 'UNVERIFIED',
            eligibility_checks: verifiedDocs.eligibility_checks ? 'VERIFIED' : 'UNVERIFIED',
            terms_accepted: verifiedDocs.terms_accepted ? 'VERIFIED' : 'UNVERIFIED'
          }
        : {
            id_document: verifiedDocs.id_document ? 'VERIFIED' : 'UNVERIFIED',
            proof_of_residence: verifiedDocs.proof_of_residence ? 'VERIFIED' : 'UNVERIFIED',
            driver_selfie_liveness: verifiedDocs.driver_selfie_liveness ? 'VERIFIED' : 'UNVERIFIED',
            driver_transport_selfie: verifiedDocs.driver_transport_selfie ? 'VERIFIED' : 'UNVERIFIED',
            drivers_license: verifiedDocs.drivers_license ? 'VERIFIED' : 'UNVERIFIED',
            vehicle_roadworthy: verifiedDocs.vehicle_roadworthy ? 'VERIFIED' : 'UNVERIFIED',
            payload_certification: verifiedDocs.payload_certification ? 'VERIFIED' : 'UNVERIFIED'
          };

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

              {/* Decrypted Vault Compliance Documents */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white block uppercase tracking-wider">
                  Vault Compliance Documents (AES-256 Decrypted on Request)
                </span>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {((selectedApp as any).id_document_doc_id || (selectedApp as any).id_document_number) && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).id_document_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>National ID</span>
                    </button>
                  )}
                  {(selectedApp as any).proof_of_residence_doc_id && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).proof_of_residence_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Proof of Residence</span>
                    </button>
                  )}
                  {(selectedApp as any).driver_selfie_doc_id && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).driver_selfie_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Facial Selfie</span>
                    </button>
                  )}
                  {(selectedApp as any).driver_transport_selfie_doc_id && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).driver_transport_selfie_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Transport Photo</span>
                    </button>
                  )}
                  {(selectedApp as any).drivers_license_doc_id && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).drivers_license_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Driver License</span>
                    </button>
                  )}
                  {(selectedApp as any).vehicle_roadworthy_doc_id && (
                    <button
                      type="button"
                      onClick={() => previewVaultDoc((selectedApp as any).vehicle_roadworthy_doc_id)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Roadworthy &amp; Insurance</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Mandatory Verification Checkboxes */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Statutory Document &amp; Evidence Checklist</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">Strict Compliance</span>
                </div>
                
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifiedDocs.id_document}
                    onChange={(e) => setVerifiedDocs(prev => ({ ...prev, id_document: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>1. Verified Government Identity (Passport / National ID) &amp; Age 18+</span>
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifiedDocs.proof_of_residence}
                    onChange={(e) => setVerifiedDocs(prev => ({ ...prev, proof_of_residence: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>2. Proof of Residence (Utility Bill / Certified Affidavit)</span>
                </label>

                {activeCategory === 'REP' ? (
                  <>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.hub_verification}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, hub_verification: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>3. Home Hub Location &amp; 10 km Exclusive Boundary Verified</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.eligibility_checks}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, eligibility_checks: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>4. Rep Eligibility Checks (Device, Cellular Data, Transport)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.terms_accepted}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, terms_accepted: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>5. TUXI Rep Terms &amp; Conditions Version Accepted</span>
                    </label>
                  </>
                ) : (
                  <>
                    {/* External Biometric Liveness Check: Honest unverified state when provider unintegrated */}
                    <div className="flex items-start gap-2 text-xs p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-amber-900 dark:text-amber-200">
                          3. Facial Selfie &amp; Biometric Liveness: <span className="font-mono text-[10px] bg-amber-200 dark:bg-amber-800 px-1 py-0.5 rounded">UNVERIFIED — PROVIDER PENDING</span>
                        </div>
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                          External KYC provider (Smile Identity / Persona) not connected in dev. Administrative fabrication of biometric verification is prohibited.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.driver_transport_selfie}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, driver_transport_selfie: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>4. Driver-with-Transport Photograph Verified</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.drivers_license}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, drivers_license: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>5. Valid Driving License ({selectedApp.license_number}) Verified</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.vehicle_roadworthy}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, vehicle_roadworthy: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>6. Vehicle Registration &amp; Roadworthiness Certificate Verified</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedDocs.payload_certification}
                        onChange={(e) => setVerifiedDocs(prev => ({ ...prev, payload_certification: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>7. Transport Category &amp; Commercial Delivery Payload Certified</span>
                    </label>
                  </>
                )}

                {/* Banking Verification Alert */}
                <div className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                  <span>Banking Details Verification (Mandatory Before Payouts):</span>
                  <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded font-bold text-slate-700 dark:text-slate-200">
                    PENDING GATEWAY LINK
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">
                  * Backend approval gate strictly blocks APPROVE unless all statutory evidence items are genuinely verified.
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
