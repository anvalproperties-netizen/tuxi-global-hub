import React, { useState, useEffect, useRef } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  executeVoiceSearch, 
  speakAIResponse, 
  stopSpeaking, 
  isBrowserSpeechRecognitionSupported 
} from '../../utils/aiVoiceSearchService';
import { 
  VoiceSearchResponse, 
  MatchedItemResult, 
  MatchedBusinessResult,
  CourierBookingIntent 
} from '../../utils/aiVoiceSearchProcessor';
import { OrderCartItem } from '../../types';
import { 
  Mic, 
  MicOff, 
  X, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Search, 
  Utensils, 
  ShoppingBag, 
  Truck, 
  Plus, 
  Check, 
  ArrowRight, 
  Clock, 
  Star, 
  MapPin, 
  RefreshCw,
  Compass,
  Zap,
  CornerDownLeft
} from 'lucide-react';

interface AIVoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBusiness?: (businessId: string) => void;
  onSelectCourier?: (details?: CourierBookingIntent) => void;
}

export const AIVoiceSearchModal: React.FC<AIVoiceSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectBusiness,
  onSelectCourier
}) => {
  const { 
    businesses, 
    activeCity, 
    formatPrice, 
    addToCart, 
    setActiveRole, 
    activeRole 
  } = useTuxi();

  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<VoiceSearchResponse | null>(null);
  const [audioFeedbackEnabled, setAudioFeedbackEnabled] = useState<boolean>(true);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const samplePrompts = [
    { label: '🍕 Truffle woodfire pizza under £16', query: 'Find artisan truffle woodfired pizza under 16 pounds' },
    { label: '🥑 Organic sourdough & produce', query: 'Show me organic sourdough bread and fresh market groceries' },
    { label: '🍜 Japanese Tonkotsu Ramen bowls', query: 'Find hot ramen bowls and gyozas near me' },
    { label: '📦 Express Courier to City Road', query: 'Book urgent courier parcel dispatch to City Road' },
    { label: '⚡ Fast delivery under 20 mins', query: 'Quick takeaway meal with fast prep time' }
  ];

  // Initialize Speech Recognition when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopSpeaking();
      return;
    }

    // Auto-focus manual input fallback
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    // Auto-start listening on modal open if supported
    if (isBrowserSpeechRecognitionSupported() && !searchResults) {
      startListening();
    }

    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [isOpen]);

  const startAudioVisualizer = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e: any) {
      console.warn('[Microphone Visualizer Not Granted]', e.message);
    }
  };

  const stopAudioVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const startListening = () => {
    setErrorMessage(null);
    stopSpeaking();

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorMessage('Speech recognition is not supported in this browser. You can type or click the voice prompt pills below!');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        startAudioVisualizer();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += trans;
          } else {
            interim += trans;
          }
        }

        if (interim) setInterimTranscript(interim);
        if (final) {
          setTranscript(final);
          setInterimTranscript('');
          handleExecuteSearch(final);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[Speech Recognition Event]', event.error);
        setIsListening(false);
        stopAudioVisualizer();
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access was denied. Please allow microphone permissions or use the prompt pills below.');
        } else if (event.error === 'no-speech') {
          // Handled quietly
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        stopAudioVisualizer();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.warn('[Speech Start Error]', e);
      setIsListening(false);
      stopAudioVisualizer();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopAudioVisualizer();
  };

  const handleExecuteSearch = async (queryText: string) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    stopListening();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const results = await executeVoiceSearch(cleanQuery, activeCity, businesses);
      setSearchResults(results);
      setIsProcessing(false);

      if (audioFeedbackEnabled && results.aiSpokenSummary) {
        speakAIResponse(results.aiSpokenSummary);
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Error processing vocal query.');
    }
  };

  const handleAddToCart = (item: MatchedItemResult) => {
    const biz = businesses.find(b => b.id === item.businessId);
    if (!biz) return;

    const cartItem: OrderCartItem = {
      id: `cart-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemId: item.itemId,
      name: item.name,
      price: item.price,
      quantity: 1
    };

    addToCart(cartItem, biz.id);
    setRecentlyAddedId(item.itemId);
    setTimeout(() => setRecentlyAddedId(null), 2500);

    // If not in customer role, switch to customer
    if (activeRole !== 'customer') {
      setActiveRole('customer');
    }
  };

  const handleOpenBusiness = (bizId: string) => {
    if (activeRole !== 'customer') {
      setActiveRole('customer');
    }
    if (onSelectBusiness) {
      onSelectBusiness(bizId);
    }
    onClose();
  };

  const handleOpenCourier = () => {
    if (activeRole !== 'customer') {
      setActiveRole('customer');
    }
    if (onSelectCourier) {
      onSelectCourier(searchResults?.courierIntent);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] text-xs">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/90 text-cyan-300 shadow-md border border-indigo-500/50">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">AI Voice Search</h2>
                <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  GEMINI 3.8 FLASH
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-slate-300">
                  {activeCity.city}, {activeCity.countryCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Vocally search dishes, groceries, or courier dispatch in natural language
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const nextState = !audioFeedbackEnabled;
                setAudioFeedbackEnabled(nextState);
                if (!nextState) stopSpeaking();
              }}
              className={`p-2 rounded-xl border transition-colors ${
                audioFeedbackEnabled 
                  ? 'bg-indigo-600/60 border-indigo-400 text-cyan-300' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={audioFeedbackEnabled ? 'Voice readout enabled' : 'Voice readout muted'}
            >
              {audioFeedbackEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-700 flex-1">
          
          {/* Central Voice Recording Deck */}
          <div className="p-6 bg-gradient-to-b from-indigo-50/70 via-slate-50 to-white rounded-3xl border border-indigo-100 flex flex-col items-center text-center relative overflow-hidden">
            
            {/* Visualizer Pulsing Rings when listening */}
            <div className="relative mb-4 flex items-center justify-center">
              {isListening && (
                <>
                  <div 
                    className="absolute w-28 h-28 rounded-full bg-indigo-500/20 animate-ping"
                    style={{ animationDuration: '1.8s' }}
                  />
                  <div 
                    className="absolute w-24 h-24 rounded-full bg-cyan-400/25 animate-pulse"
                    style={{ transform: `scale(${1 + audioLevel / 120})` }}
                  />
                </>
              )}

              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isProcessing}
                className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                  isListening
                    ? 'bg-rose-600 text-white shadow-rose-500/40 ring-4 ring-rose-200'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
                title={isListening ? 'Click to stop listening' : 'Click to start voice search'}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8 animate-pulse text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>
            </div>

            {/* Status Label & Active Audio Wave */}
            <div className="space-y-1 max-w-md">
              <div className="flex items-center justify-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                  isListening 
                    ? 'bg-rose-500 animate-ping' 
                    : isProcessing 
                    ? 'bg-cyan-500 animate-spin' 
                    : 'bg-emerald-500'
                }`} />
                <span className="font-bold text-sm text-slate-900">
                  {isListening 
                    ? 'Listening... Speak your request now' 
                    : isProcessing 
                    ? 'Gemini 3.8 Flash is analyzing your request...' 
                    : 'Tap the microphone to speak'}
                </span>
              </div>

              {/* Dynamic interim transcript display */}
              <p className="text-xs text-slate-500 min-h-[22px] italic">
                {interimTranscript 
                  ? `"${interimTranscript}..."` 
                  : transcript 
                  ? `"${transcript}"` 
                  : 'e.g. "Find organic sourdough bread and artisanal woodfired pizza"'}
              </p>
            </div>

            {/* Audio frequency bars visualization */}
            {isListening && (
              <div className="flex items-center gap-1.5 mt-3 h-5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(bar => {
                  const height = Math.max(4, (audioLevel / 100) * 20 * ((bar % 3) + 1));
                  return (
                    <div 
                      key={bar} 
                      className="w-1 bg-indigo-600 rounded-full transition-all duration-75"
                      style={{ height: `${height}px` }}
                    />
                  );
                })}
              </div>
            )}

            {/* Manual text query fallback bar */}
            <div className="mt-4 w-full max-w-md flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleExecuteSearch(transcript);
                    }
                  }}
                  placeholder="Or type what you are looking for..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs bg-white text-slate-900 shadow-xs"
                />
                {transcript && (
                  <button 
                    onClick={() => setTranscript('')} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={() => handleExecuteSearch(transcript)}
                disabled={isProcessing || !transcript.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CornerDownLeft className="w-3.5 h-3.5" />
                )}
                <span>Search</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-1.5">
                <span>⚠️ {errorMessage}</span>
              </div>
            )}
          </div>

          {/* Quick Voice Prompt Pills */}
          {!searchResults && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Popular Voice Searches in {activeCity.city}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setTranscript(p.query);
                      handleExecuteSearch(p.query);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50/70 hover:border-indigo-300 text-slate-700 hover:text-indigo-900 transition-all text-[11px] font-medium shadow-2xs flex items-center gap-1.5"
                  >
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results Display */}
          {searchResults && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Gemini Conversational Audio Response Banner */}
              <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl text-white shadow-md space-y-2 border border-indigo-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      GEMINI AUDIO SUMMARY
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 font-bold">
                      {Math.round(searchResults.confidenceScore * 100)}% Match Confidence
                    </span>
                  </div>

                  <button
                    onClick={() => speakAIResponse(searchResults.aiSpokenSummary)}
                    className="text-xs text-cyan-300 hover:text-white flex items-center gap-1 font-semibold"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Replay Audio</span>
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed">
                  "{searchResults.aiSpokenSummary}"
                </p>

                {searchResults.suggestedActions?.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                    {searchResults.suggestedActions.map((action, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-lg bg-slate-800 text-[10px] text-slate-300 font-mono">
                        {action}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Matched Courier Dispatch Card */}
              {searchResults.courierIntent?.isCourierRequest && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-600 text-white shadow-xs">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-amber-950">
                        TUXI Express Courier Dispatch
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Parcel Type: <span className="font-semibold">{searchResults.courierIntent.suggestedParcelType || 'Standard Package'}</span> · Instant courier pickup available in {activeCity.city}.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleOpenCourier}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <span>Book Courier Dispatch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Matched Products / Dishes Grid */}
              {searchResults.matchedItems?.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Direct Item Recommendations ({searchResults.matchedItems.length})</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.matchedItems.map(item => (
                      <div 
                        key={item.itemId}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-900 text-xs">
                              {item.name}
                            </span>
                            <span className="font-black font-mono text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg shrink-0">
                              {formatPrice(item.price)}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                            <span>{item.businessName}</span>
                            <span>•</span>
                            <span className="capitalize">{item.businessType}</span>
                          </div>

                          {item.description && (
                            <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                          
                          <div className="pt-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 block truncate">
                              ✨ {item.highlightReason}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleAddToCart(item)}
                            className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                              recentlyAddedId === item.itemId
                                ? 'bg-emerald-600 text-white'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                            }`}
                          >
                            {recentlyAddedId === item.itemId ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Added!</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add to Cart</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenBusiness(item.businessId)}
                            className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl"
                            title="View Store"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Stores & Restaurants */}
              {searchResults.matchedBusinesses?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Matching Stores &amp; Kitchens ({searchResults.matchedBusinesses.length})</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.matchedBusinesses.map(biz => (
                      <div 
                        key={biz.businessId}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 transition-all shadow-xs flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">
                              {biz.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-indigo-50 text-indigo-700">
                              {biz.type}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              <span>{biz.rating || 4.8}</span>
                            </span>
                            <span>•</span>
                            <span className="truncate">{biz.category}</span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{biz.address}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleOpenBusiness(biz.businessId)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1"
                        >
                          <span>Explore</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No items or merchants found fallback */}
              {searchResults.matchedItems.length === 0 && searchResults.matchedBusinesses.length === 0 && !searchResults.courierIntent?.isCourierRequest && (
                <div className="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200">
                  <Compass className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="font-bold text-sm text-slate-900">No exact items found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Try asking for another dish, cuisine, or product (e.g. "Woodfired pizza", "Organic bread", "Ramen bowls").
                  </p>
                  <button
                    onClick={() => {
                      setSearchResults(null);
                      setTranscript('');
                      startListening();
                    }}
                    className="mt-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs"
                  >
                    Try Another Voice Search
                  </button>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Voice engine powered by Gemini AI with live catalog synthesis</span>
          </div>

          <div className="flex items-center gap-2">
            {searchResults && (
              <button
                onClick={() => {
                  setSearchResults(null);
                  setTranscript('');
                }}
                className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 font-semibold"
              >
                Clear Search
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl shadow-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
