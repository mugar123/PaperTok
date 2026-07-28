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

const LanguageContext = createContext(null);
const LANGUAGE_STORAGE_KEY = 'papertok_language';
const SUPPORTED_LANGUAGES = new Set(['es', 'en']);

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : 'es';
}

function readStoredLanguage() {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'es';
  }
}

export function LanguageProvider({ children }) {
  const { user, readingPreferences, updateReadingPreferences } = useAuth();
  const [guestLanguage, setGuestLanguage] = useState(readStoredLanguage);
  const language = normalizeLanguage(
    user ? readingPreferences?.language : guestLanguage,
  );

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The in-memory preference still works when storage is unavailable.
    }
  }, [language]);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setGuestLanguage(normalized);

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // Keep the session preference even if storage is unavailable.
    }

    if (user) {
      await updateReadingPreferences({ language: normalized });
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
