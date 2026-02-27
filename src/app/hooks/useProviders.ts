import { useState, useEffect } from 'react';
import { getProviders } from '../../utils/api';
import { Provider } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const { accessToken } = useAuth();

  useEffect(() => {
    const loadProviders = async () => {
      // Don't try to load data if we don't have an access token
      if (!accessToken) {
        console.log('⏸️ Skipping providers load - no access token');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await getProviders();
        setProviders(data);
      } catch (error) {
        console.error('Error loading providers:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProviders();
  }, [accessToken]); // Reload when accessToken becomes available

  return { providers, loading };
}