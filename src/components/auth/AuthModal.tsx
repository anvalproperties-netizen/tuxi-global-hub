import React, { useState } from 'react';
import { X, User, Lock, Mail, Phone, LogIn, UserPlus, LogOut, CheckCircle, AlertCircle, MapPin, Plus, Trash2 } from 'lucide-react';
import { ApiClient } from '../../services/apiClient.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onAuthSuccess: (user: any) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onLogout
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'profile'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Address Manager State inside profile
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newStreet, setNewStreet] = useState('');
  const [newCity, setNewCity] = useState('Cape Town');
  const [newPostal, setNewPostal] = useState('8001');
  const [newLabel, setNewLabel] = useState('Home');
  const [newLat, setNewLat] = useState(-33.9249);
  const [newLng, setNewLng] = useState(18.4241);

  React.useEffect(() => {
    if (currentUser) {
      setMode('profile');
      loadAddresses();
    } else {
      setMode('login');
    }
  }, [currentUser, isOpen]);

  const loadAddresses = async () => {
    try {
      const addrs = await ApiClient.getAddresses();
      setAddresses(addrs);
    } catch (err: any) {
      console.warn('[Address Load]', err.message);
    }
  };

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await ApiClient.login({ email, password });
      onAuthSuccess(res.user);
      setSuccess('Signed in successfully!');
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await ApiClient.register({
        email,
        password,
        firstName,
        lastName,
        phoneNumber
      });
      onAuthSuccess(res.user);
      setSuccess('Account created successfully! Role: Verified Customer');
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createAddress({
        streetLine1: newStreet,
        city: newCity,
        postalCode: newPostal,
        countryCode: 'ZAF',
        latitude: newLat,
        longitude: newLng,
        label: newLabel,
        isDefault: addresses.length === 0
      });
      setShowAddAddress(false);
      setNewStreet('');
      loadAddresses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await ApiClient.deleteAddress(id);
      loadAddresses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSetDefaultAddress = async (id: string) => {
    try {
      await ApiClient.setDefaultAddress(id);
      loadAddresses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {mode === 'profile' ? 'Customer Account' : mode === 'login' ? 'Customer Sign In' : 'Create Customer Account'}
              </h3>
              <p className="text-xs text-slate-500">
                {mode === 'profile' ? 'Persistent PostgreSQL Identity' : 'Secure Authenticated Access'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {mode === 'profile' && currentUser ? (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500">Name</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{currentUser.firstName} {currentUser.lastName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500">Email</span>
                  <span className="text-sm font-mono text-slate-800 dark:text-slate-200">{currentUser.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500">Phone</span>
                  <span className="text-sm text-slate-800 dark:text-slate-200">{currentUser.phoneNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500">Assigned Role</span>
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold rounded">
                    CUSTOMER (Immutable)
                  </span>
                </div>
              </div>

              {/* Saved Addresses Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Saved Delivery Addresses
                  </h4>
                  <button 
                    onClick={() => setShowAddAddress(!showAddAddress)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add New
                  </button>
                </div>

                {showAddAddress && (
                  <form onSubmit={handleCreateAddress} className="mb-3 p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-2 text-xs">
                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Street Address</label>
                      <input 
                        type="text" 
                        required 
                        value={newStreet} 
                        onChange={e => setNewStreet(e.target.value)} 
                        placeholder="e.g. 45 Kloof St, Apt 2"
                        className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border rounded"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-semibold text-slate-700 dark:text-slate-300">City</label>
                        <input 
                          type="text" 
                          required 
                          value={newCity} 
                          onChange={e => setNewCity(e.target.value)} 
                          className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border rounded"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Label</label>
                        <select 
                          value={newLabel} 
                          onChange={e => setNewLabel(e.target.value)}
                          className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border rounded"
                        >
                          <option value="Home">Home</option>
                          <option value="Work">Work</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="w-full py-1.5 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700">
                      Save to PostgreSQL
                    </button>
                  </form>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {addresses.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No saved addresses yet.</p>
                  ) : (
                    addresses.map(a => (
                      <div key={a.id} className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {a.label}
                            {a.isDefault && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded font-bold">Default</span>
                            )}
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px]">{a.streetLine1}, {a.city}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!a.isDefault && (
                            <button 
                              onClick={() => handleSetDefaultAddress(a.id)}
                              className="text-[11px] text-indigo-600 hover:underline"
                            >
                              Make Default
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteAddress(a.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  onLogout();
                  setMode('login');
                }}
                className="w-full py-2.5 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl font-bold text-xs hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="customer@tuxi-seed.dev"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : <><LogIn className="w-4 h-4" /> Sign In</>}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-500">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Create one now
                </button>
              </div>

              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                <strong>Seed Customer Login:</strong><br />
                Email: <code>customer@tuxi-seed.dev</code><br />
                Password: <code>SecurePassword123!</code>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+27 82 123 4567"
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Password (min 8 chars)</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Creating Account...' : <><UserPlus className="w-4 h-4" /> Complete Registration</>}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-500">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
