// Frontend/src/hooks/useAutoTranslate.ts
//
// Autonomous, per-viewer inline translation.
//
// For each rendered message the hook decides — with a cheap, network-free
// heuristic — whether the text is plausibly in a language other than the
// viewer's chosen language, and if so translates it automatically via the
// Translator agent (`/api/agents/translator/translate`). Results render inline
// under the original message, so every viewer sees foreign messages in THEIR
// language without clicking anything.
//
// Why the heuristic gate matters: the backend translation engine
// (deep-translator) reports `source_language: 'auto'` and the agent's own
// detector is only reliable for Roman Urdu, so we cannot ask the server "is
// this English?" cheaply. Instead we gate on Unicode script + a Roman-Urdu
// lexicon so English/ASCII messages never hit the network — only genuinely
// foreign text does. This keeps the free-tier translation API from being
// flooded when a channel is mostly English.

import { useCallback, useEffect, useRef, useState } from 'react';
import aiAgentService from '@/services/aiAgentService';
import type { Message } from '@/types';

/** Languages offered in the picker (mirrors backend SUPPORTED_LANGUAGES). */
export const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: 'English',
  ur: 'Urdu',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  'zh-CN': 'Chinese',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  tr: 'Turkish',
  id: 'Indonesian',
  bn: 'Bengali',
};

export function languageName(code?: string): string {
  if (!code) return '';
  return TRANSLATE_LANGUAGES[code] || TRANSLATE_LANGUAGES[code.split('-')[0]] || code;
}

export interface TranslationState {
  status: 'loading' | 'done' | 'skipped' | 'error';
  /** Translated text, present when status === 'done'. */
  text?: string;
  /** Best-effort source language guess (may be undefined). */
  sourceLang?: string;
}

// Persist across mounts and channel switches. Keyed by `${messageId}:${target}`
// so switching language keeps prior results and switching back is instant.
const CACHE = new Map<string, TranslationState>();

// Roman-Urdu lexicon — mirrors the backend heuristic in agents/translator.py.
const ROMAN_URDU =
  /\b(hai|hain|nahi|nahin|kya|kyun|kyon|main|mein|tum|aap|hum|kar|raha|rahi|rahe|kab|kahan|theek|thik|acha|achha|bhai|behen|haan|kuch|sab|abhi|baad|dost|pyar|pyaar|udaas|khush|khushi|gham|gussa|chalo|yaar|kaise|kaisa|kaisi|matlab|bahut|bohot|zyada|shukriya)\b/i;

/** Guess a source language from Unicode script; undefined when unsure. */
export function guessSourceLang(text: string): string | undefined {
  if (/[؀-ۿݐ-ݿ]/.test(text)) return 'ur'; // Arabic script → Urdu (app context)
  if (/[ऀ-ॿ]/.test(text)) return 'hi'; // Devanagari → Hindi
  if (/[一-鿿]/.test(text)) return 'zh-CN'; // Han → Chinese
  if (/[぀-ヿ]/.test(text)) return 'ja'; // Hiragana/Katakana → Japanese
  if (/[가-힯]/.test(text)) return 'ko'; // Hangul → Korean
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'; // Cyrillic → Russian
  if (ROMAN_URDU.test(text)) return 'ur'; // romanized Urdu
  return undefined;
}

function sameLang(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Cheap, network-free gate: might this text need translating to `target`? */
export function mightNeedTranslation(text: string, target: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  const src = guessSourceLang(t);
  if (src) return !sameLang(src, target);
  // Accented Latin (Spanish/French/German/Portuguese/Turkish…) for EN viewers.
  if (sameLang(target, 'en') && /[À-ÿĀ-ſ]/.test(t)) return true;
  return false;
}

export interface AutoTranslateResult {
  get: (id: number) => TranslationState | undefined;
  isCollapsed: (id: number) => boolean;
  toggleCollapsed: (id: number) => void;
}

type OnTranslated = (info: {
  messageId: number;
  original: string;
  translated: string;
  targetLang: string;
  sourceLang?: string;
}) => void;

export function useAutoTranslate(
  messages: Message[],
  targetLang: string,
  enabled: boolean,
  onTranslated?: OnTranslated,
): AutoTranslateResult {
  const [version, setVersion] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const inflight = useRef<Set<string>>(new Set());
  const cbRef = useRef<OnTranslated | undefined>(onTranslated);
  cbRef.current = onTranslated;

  useEffect(() => {
    if (!enabled || !targetLang || targetLang === 'off') return;
    let cancelled = false;

    (async () => {
      for (const msg of messages) {
        if (cancelled) return;
        // Skip optimistic (negative id), bot, and system messages.
        if (!msg || msg.id < 0) continue;
        if (msg.message_type === 'system' || msg.message_type === 'ai') continue;

        const content = (msg.content || '').trim();
        if (!content) continue;

        const key = `${msg.id}:${targetLang}`;
        if (CACHE.has(key) || inflight.current.has(key)) continue;

        if (!mightNeedTranslation(content, targetLang)) {
          CACHE.set(key, { status: 'skipped' });
          continue;
        }

        inflight.current.add(key);
        CACHE.set(key, { status: 'loading' });
        if (!cancelled) setVersion((v) => v + 1);

        try {
          const res = await aiAgentService.translateText(content, targetLang);
          const translated = (res?.translated_text || '').trim();
          const provider = res?.provider;
          if (!translated || provider === 'none' || sameText(translated, content)) {
            CACHE.set(key, { status: 'skipped' });
          } else {
            const state: TranslationState = {
              status: 'done',
              text: translated,
              sourceLang: guessSourceLang(content),
            };
            CACHE.set(key, state);
            cbRef.current?.({
              messageId: msg.id,
              original: content,
              translated,
              targetLang,
              sourceLang: state.sourceLang,
            });
          }
        } catch {
          CACHE.set(key, { status: 'error' });
        } finally {
          inflight.current.delete(key);
          if (!cancelled) setVersion((v) => v + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, targetLang, enabled]);

  const get = useCallback(
    (id: number) => CACHE.get(`${id}:${targetLang}`),
    // `version` forces a fresh read after the async cache updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetLang, version],
  );

  const isCollapsed = useCallback((id: number) => collapsed.has(id), [collapsed]);

  const toggleCollapsed = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { get, isCollapsed, toggleCollapsed };
}
