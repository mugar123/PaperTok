/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useFollowing } from './FollowingContext';
import { useFollowingUpdates } from './FollowingUpdatesContext';
import {
  EmailNotificationServiceError,
  getEmailNotificationPreferences,
  getEmailNotificationHealth,
  saveEmailNotificationPreferences,
  sendEmailNotificationTest,
} from '../services/emailNotificationService';
import { getFollowingSignature } from '../utils/followingUpdates';

const EmailNotificationsContext = createContext(null);

const DEFAULT_PREFERENCES = {
  enabled: false,
  frequency: 'daily',
  maxPapers: 5,
  email: '',
  lastSentAt: null,
  lastTestAt: null,
};

export function EmailNotificationsProvider({ children }) {
  const { user } = useAuth();
  const userEmail = user?.email || '';
  const { followedEntities, loading: followsLoading } = useFollowing();
  const { items, loading: updatesLoading } = useFollowingUpdates();
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES, email: userEmail });
  const [loading, setLoading] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState({
    configured: false,
    available: false,
    provider: null,
    code: null,
    senderMode: null,
    permissionLimited: false,
  });
  const loadedForUser = useRef(null);
  const userId = user?.uid || null;
  const followSignature = useMemo(() => getFollowingSignature(followedEntities), [followedEntities]);
  const previewSignature = useMemo(() => items.slice(0, 20).map(item => item.updateKey || item.id || item.doi).join('|'), [items]);
  const notificationDataReady = !followsLoading;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    loadedForUser.current = userId;
    Promise.allSettled([getEmailNotificationPreferences(), getEmailNotificationHealth()])
      .then(([preferencesResult, healthResult]) => {
        if (cancelled) return;
        if (preferencesResult.status === 'fulfilled') {
          const next = preferencesResult.value;
          setPreferences({ ...DEFAULT_PREFERENCES, ...next, email: next.email || userEmail });
        } else {
          setError(preferencesResult.reason);
        }
        if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userEmail, userId]);

  const savePreferences = useCallback(async (nextPreferences) => {
    if (!notificationDataReady) throw new EmailNotificationServiceError('EMAIL_DATA_LOADING');
    setSaving(true);
    setError(null);
    try {
      const saved = await saveEmailNotificationPreferences(nextPreferences, followedEntities, items);
      const normalized = { ...DEFAULT_PREFERENCES, ...saved, email: saved.email || userEmail };
      setPreferences(normalized);
      return normalized;
    } catch (saveError) {
      setError(saveError);
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [followedEntities, items, notificationDataReady, userEmail]);

  const sendTest = useCallback(async (nextPreferences = preferences) => {
    if (!notificationDataReady) throw new EmailNotificationServiceError('EMAIL_DATA_LOADING');
    setTesting(true);
    setError(null);
    try {
      const saved = await saveEmailNotificationPreferences(
        { ...nextPreferences, enabled: true },
        followedEntities,
        items,
      );
      const normalized = { ...DEFAULT_PREFERENCES, ...saved, email: saved.email || userEmail };
      setPreferences(normalized);
      const result = await sendEmailNotificationTest();
      if (result.preferences) {
        setPreferences(current => ({ ...current, ...result.preferences }));
      }
      return { ...result, preferences: result.preferences || normalized };
    } catch (testError) {
      setError(testError);
      throw testError;
    } finally {
      setTesting(false);
    }
  }, [followedEntities, items, notificationDataReady, preferences, userEmail]);

  useEffect(() => {
    if (!preferences.enabled || !userId || followsLoading || updatesLoading || loadedForUser.current !== userId) return undefined;
    const syncTimeout = setTimeout(() => {
      saveEmailNotificationPreferences(preferences, followedEntities, items)
        .catch(syncError => console.warn('No se pudo sincronizar el digest de novedades', syncError));
    }, 1800);
    return () => clearTimeout(syncTimeout);
  }, [followSignature, followedEntities, followsLoading, items, preferences, previewSignature, updatesLoading, userId]);

  const value = useMemo(() => ({
    preferences,
    loading,
    saving,
    testing,
    error,
    health,
    notificationDataReady,
    savePreferences,
    sendTest,
  }), [error, health, loading, notificationDataReady, preferences, savePreferences, saving, sendTest, testing]);

  return <EmailNotificationsContext.Provider value={value}>{children}</EmailNotificationsContext.Provider>;
}

export function useEmailNotifications() {
  const context = useContext(EmailNotificationsContext);
  if (!context) throw new Error('useEmailNotifications must be used within an EmailNotificationsProvider');
  return context;
}
