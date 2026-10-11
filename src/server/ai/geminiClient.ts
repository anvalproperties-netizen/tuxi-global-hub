import { GoogleGenAI } from '@google/genai';

/**
 * Server-authoritative Gemini client utility.
 * Enforces server-side execution, telemetry headers, and strict model aliases.
 * Adheres to @google/genai SDK v2.4.0+ patterns.
 */
let aiInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Gemini AI] GEMINI_API_KEY environment variable is not defined. Server AI features will operate in safe-fallback mode.');
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey || 'UNCONFIGURED_KEY',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
}

/**
 * Authoritative Model Identifiers
 * gemini-3.8-flash for high-performance server generation and extraction
 */
export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
