import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';

export function NetworkTest() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const runTest = async (testName: string, testFn: () => Promise<any>) => {
    const startTime = Date.now();
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      setResults(prev => [...prev, {
        test: testName,
        status: 'SUCCESS',
        duration: `${duration}ms`,
        data: result
      }]);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      setResults(prev => [...prev, {
        test: testName,
        status: 'FAILED',
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      }]);
    }
  };

  const runAllTests = async () => {
    setLoading(true);
    setResults([]);

    // Test 1: Basic connectivity
    await runTest('Basic Supabase Connectivity', async () => {
      const response = await fetch(`https://${projectId}.supabase.co/rest/v1/`, {
        headers: {
          'apikey': publicAnonKey
        }
      });
      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    });

    // Test 2: Health endpoint
    await runTest('Edge Function Health Check', async () => {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/health`,
        {
          headers: {
            'apikey': publicAnonKey
          }
        }
      );
      const data = await response.json();
      return { status: response.status, data };
    });

    // Test 3: CORS preflight
    await runTest('CORS Preflight (OPTIONS)', async () => {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/health`,
        {
          method: 'OPTIONS',
          headers: {
            'apikey': publicAnonKey,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization, Content-Type'
          }
        }
      );
      return {
        ok: response.ok,
        status: response.status,
        corsHeaders: {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        }
      };
    });

    // Test 4: Network info
    await runTest('Network Information', async () => {
      return {
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        port: window.location.port,
        origin: window.location.origin
      };
    });

    // Test 5: Fetch with detailed error
    await runTest('Detailed Fetch Test', async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/health`,
          {
            signal: controller.signal,
            headers: {
              'apikey': publicAnonKey
            }
          }
        );

        clearTimeout(timeoutId);

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          type: response.type,
          url: response.url,
          redirected: response.redirected,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text()
        };
      } catch (error: any) {
        return {
          errorName: error.name,
          errorMessage: error.message,
          errorType: error.constructor.name,
          isAbortError: error.name === 'AbortError',
          isTypeError: error instanceof TypeError,
          isNetworkError: error.message.includes('Failed to fetch')
        };
      }
    });

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>🔬 Network Diagnostic Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runAllTests} 
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Running Tests...' : 'Run All Tests'}
            </Button>

            <div className="space-y-2">
              {results.map((result, index) => (
                <div 
                  key={index}
                  className={`p-4 rounded-lg border ${
                    result.status === 'SUCCESS' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">
                      {result.status === 'SUCCESS' ? '✅' : '❌'} {result.test}
                    </h3>
                    <span className="text-sm text-gray-600">{result.duration}</span>
                  </div>
                  
                  {/* Special diagnostic message for CORS preflight failure */}
                  {result.test === 'CORS Preflight (OPTIONS)' && result.status === 'FAILED' && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm">
                      <p className="font-semibold text-yellow-800 mb-2">🔧 How to Fix:</p>
                      <ol className="list-decimal list-inside space-y-1 text-yellow-900">
                        <li>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard</a></li>
                        <li>Navigate to: Edge Functions → <code className="bg-yellow-100 px-1 rounded">make-server-f116e23f</code> → Settings</li>
                        <li>Find the "Verify JWT" toggle</li>
                        <li><strong>DISABLE</strong> the "Verify JWT" option</li>
                        <li>Save and redeploy the function if needed</li>
                      </ol>
                      <p className="mt-2 text-xs text-yellow-700">
                        This is blocking CORS preflight OPTIONS requests from reaching your server code.
                      </p>
                    </div>
                  )}
                  
                  <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-96">
                    {JSON.stringify(result.status === 'SUCCESS' ? result.data : result.error, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}