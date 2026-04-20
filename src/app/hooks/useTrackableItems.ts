import { useState, useEffect } from 'react';
import { getTrackableItems, createTrackableItem, updateTrackableItem } from '../../utils/api';
import { TrackableItem } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import { getStorage } from '../../utils/storage';

export function useTrackableItems() {
  const [items, setItems] = useState<TrackableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { accessToken: authToken } = useAuth();

  // CRITICAL: Support kid mode tokens from storage.
  // Kid tokens live in the async storage abstraction (Capacitor Preferences on
  // native), so we resolve them in a useEffect and keep them in state.
  const [kidToken, setKidToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [userRole, userMode] = await Promise.all([
        getStorage('user_role'),
        getStorage('user_mode'),
      ]);
      if (userRole === 'child' || userMode === 'kid') {
        const token =
          (await getStorage('kid_access_token')) ||
          (await getStorage('kid_session_token'));
        if (!cancelled) setKidToken(token ?? null);
      } else if (!cancelled) {
        setKidToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accessToken = authToken || kidToken;

  const loadItems = async () => {
    // Don't try to load data if we don't have an access token
    if (!accessToken) {
      console.log('⏸️ Skipping trackable items load - no access token');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getTrackableItems();
      setItems(data);
    } catch (error: any) {
      console.error('Error loading trackable items:', error);
      // If it's a session error, the api utility will handle redirect to login
      // Just show a user-friendly message
      if (error.message?.includes('Session expired')) {
        console.log('⚠️ Session expired while loading items - user will be redirected');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [accessToken]); // Reload when accessToken becomes available

  const addItem = async (itemData: Omit<TrackableItem, 'id'>) => {
    try {
      await createTrackableItem(itemData);
      await loadItems(); // Reload to get the new item
    } catch (error) {
      console.error('Error adding trackable item:', error);
      throw error;
    }
  };

  const updateItem = async (itemId: string, updates: Partial<TrackableItem>) => {
    // Optimistic update so the UI reflects the new value immediately.
    const previous = items;
    setItems((current) =>
      current.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
    );
    try {
      const updated = await updateTrackableItem(itemId, updates);
      // Reconcile with server response (covers server-added fields like updatedAt).
      setItems((current) =>
        current.map((i) => (i.id === itemId ? { ...i, ...updated } : i)),
      );
      return updated;
    } catch (error) {
      console.error('Error updating trackable item:', error);
      // Roll back on failure.
      setItems(previous);
      throw error;
    }
  };

  return { items, loading, addItem, updateItem };
}