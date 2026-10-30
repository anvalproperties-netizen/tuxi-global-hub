import { 
  VoiceSearchRequest, 
  VoiceSearchResponse, 
  fallbackVoiceSearch 
} from './aiVoiceSearchProcessor';

export interface SpeechRecognitionHookOptions {
  onTranscriptChange?: (text: string, isFinal: boolean) => void;
  onListeningStateChange?: (isListening: boolean) => void;
  onError?: (errorMessage: string) => void;
  lang?: string;
}

/**
 * Client service to execute semantic voice search against Gemini AI
 */
export async function executeVoiceSearch(
  query: string,
  activeCity: { city: string; country: string; currencySymbol: string; currencyCode: string },
  businesses: any[]
): Promise<VoiceSearchResponse> {
  const payload: VoiceSearchRequest = {
    query,
    activeCity,
    businesses: businesses.map(b => ({
      id: b.id,
      type: b.type,
      name: b.name,
      category: b.category,
      address: b.address,
      rating: b.rating,
      menuItems: b.menuItems,
      products: b.products
    }))
  };

  try {
    const res = await fetch('/api/ai/voice-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON but got ${contentType}`);
    }

    const data: VoiceSearchResponse = await res.json();
    return data;
  } catch (err: any) {
    console.warn('[AI Voice Search client fallback]', err?.message);
    return fallbackVoiceSearch(payload);
  }
}

/**
 * Text-to-Speech audio readout for Gemini's conversational voice answer
 */
export function speakAIResponse(text: string, lang = 'en-US'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech synthesis unavailable', e);
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if browser has native speech recognition support
 */
export function isBrowserSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}
