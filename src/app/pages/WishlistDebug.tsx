import { useState } from 'react';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export function WishlistDebug() {
  const { familyId, children, getCurrentChild } = useFamilyContext();
  const { accessToken, isParentMode } = useAuth();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const child = getCurrentChild();

  const testGetWishlistItems = async () => {
    setLoading(true);
    try {
      console.log('🔍 Testing GET /families/:familyId/wishlist-items');
      console.log('Family ID:', familyId);
      console.log('Access Token:', accessToken ? 'present' : 'missing');
      
      const response = await fetch(
        `${API_BASE}/families/${familyId}/wishlist-items`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', data);
      
      setResult({
        status: response.status,
        ok: response.ok,
        data: data
      });
    } catch (error) {
      console.error('Error:', error);
      setResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const testCreateWishlistItem = async () => {
    if (!child?.id) {
      alert('No child selected!');
      return;
    }

    setLoading(true);
    try {
      console.log('🔍 Testing POST /wishlist-items');
      console.log('Child ID:', child.id);
      console.log('Family ID:', familyId);
      console.log('Access Token:', accessToken ? 'present' : 'missing');
      
      const payload = {
        childId: child.id,
        wishText: 'Test wish from debug page - ' + new Date().toLocaleTimeString()
      };
      
      console.log('Payload:', payload);
      
      const response = await fetch(
        `${API_BASE}/wishlist-items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', data);
      
      setResult({
        status: response.status,
        ok: response.ok,
        data: data
      });
    } catch (error) {
      console.error('Error:', error);
      setResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const testGetAllWishlistsWithPrefix = async () => {
    setLoading(true);
    try {
      console.log('🔍 Testing backend KV store directly');
      console.log('This will show if ANY wishlist items exist in the database');
      
      // We'll just call the GET endpoint and log everything
      const response = await fetch(
        `${API_BASE}/families/${familyId}/wishlist-items`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      const data = await response.json();
      console.log('All wishlist items in family:', data);
      
      setResult({
        status: response.status,
        ok: response.ok,
        data: data,
        count: Array.isArray(data) ? data.length : 0
      });
    } catch (error) {
      console.error('Error:', error);
      setResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Wishlist API Debugger</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Debug Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>Family ID:</strong> {familyId || 'Not set'}</p>
          <p><strong>Access Token:</strong> {accessToken ? '✅ Present' : '❌ Missing'}</p>
          <p><strong>Is Parent Mode:</strong> {isParentMode ? 'Yes' : 'No'}</p>
          <p><strong>Current Child:</strong> {child?.name || 'None selected'} ({child?.id || 'N/A'})</p>
          <p><strong>Children Count:</strong> {children.length}</p>
          <p><strong>API Base:</strong> {API_BASE}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={testCreateWishlistItem} 
            disabled={loading || !child?.id}
            className="w-full"
          >
            {loading ? 'Testing...' : 'Test: Create Wishlist Item (Kid)'}
          </Button>
          
          <Button 
            onClick={testGetWishlistItems} 
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? 'Testing...' : 'Test: Get Family Wishlist Items'}
          </Button>

          <Button 
            onClick={testGetAllWishlistsWithPrefix} 
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? 'Testing...' : 'Test: Check Database for ANY Items'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Last Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
