/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { browserLanguageFallback, detectLanguageFromLocation } from '../services/languageDetectionService';

const LanguageContext = createContext(null);
const LANGUAGE_STORAGE_KEY = 'papertok_language';
const LANGUAGE_MODE_STORAGE_KEY = 'papertok_language_mode';
const SUPPORTED_LANGUAGES = new Set(['es', 'en']);

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : 'es';
}

function readStoredManualLanguage() {
  try {
    const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const mode = window.localStorage.getItem(LANGUAGE_MODE_STORAGE_KEY);
    return mode === 'manual' && SUPPORTED_LANGUAGES.has(language) ? language : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }) {
  const { user, readingPreferences, updateReadingPreferences } = useAuth();
  const [guestManualLanguage, setGuestManualLanguage] = useState(readStoredManualLanguage);
  const [detectedLanguage, setDetectedLanguage] = useState(browserLanguageFallback);
  const accountManualLanguage = user
    && readingPreferences?.languagePreferenceSet === true
    && SUPPORTED_LANGUAGES.has(readingPreferences?.language)
    ? readingPreferences.language
    : null;
  const manualLanguage = accountManualLanguage || guestManualLanguage;
  const language = manualLanguage || detectedLanguage;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (manualLanguage) return undefined;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1_800);
    detectLanguageFromLocation({ signal: controller.signal })
      .then(nextLanguage => {
        if (!controller.signal.aborted) setDetectedLanguage(normalizeLanguage(nextLanguage));
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [manualLanguage]);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setGuestManualLanguage(normalized);

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      window.localStorage.setItem(LANGUAGE_MODE_STORAGE_KEY, 'manual');
    } catch {
      // Keep the session preference even if storage is unavailable.
    }

    if (user) {
      await updateReadingPreferences({ language: normalized, languagePreferenceSet: true });
    }
  }, [updateReadingPreferences, user]);

  const value = useMemo(() => ({
    language,
    locale: language === 'en' ? 'en-US' : 'es-ES',
    isEnglish: language === 'en',
    setLanguage,
  }), [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
