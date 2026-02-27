import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '../../../utils/supabase/info.tsx';
import { toast } from 'sonner';

interface DiagnosticResult {
  userId: string;
  authUser: any;
  kvUserRecord: any;
  userFamilies: any[];
  diagnosis: {
    hasAuthUser: boolean;
    hasKVUserRecord: boolean;
    hasFamilyId: boolean;
    familyCount: number;
    issue: string;
  };
}

export function DiagnosticPage() {
  const { accessToken, userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/user-family-status`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Diagnostic failed: ${errorText}`);
      }

      const result = await response.json();
      setDiagnosticResult(result);

      if (result.diagnosis.issue !== 'OK') {
        toast.warning(`Issue detected: ${result.diagnosis.issue}`);
      } else {
        toast.success('Everything looks good!');
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Diagnostic failed');
    } finally {
      setLoading(false);
    }
  };

  const repairUserFamily = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/debug/repair-user-family`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Repair failed: ${errorText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Repair completed: ${result.action}`);
        // Re-run diagnostic to show updated status
        await runDiagnostic();
        
        if (result.action === 'LINKED_TO_EXISTING_FAMILY') {
          toast.success('Family link restored! Please refresh the app.');
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        }
      } else if (result.needsOnboarding) {
        toast.info('No family found. Redirecting to onboarding...');
        setTimeout(() => {
          window.location.href = '/onboarding';
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Repair failed');
    } finally {
      setLoading(false);
    }
  };

  const getIssueColor = (issue: string) => {
    switch (issue) {
      case 'OK':
        return 'text-green-600';
      case 'NO_KV_USER_RECORD':
      case 'NO_FAMILY_ID':
        return 'text-orange-600';
      case 'FAMILY_NOT_FOUND':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">System Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Use this tool to diagnose and fix issues with your account and family data.
              </p>
              <div className="flex gap-4">
                <Button
                  onClick={runDiagnostic}
                  disabled={loading || !accessToken}
                  variant="outline"
                >
                  {loading ? 'Running...' : 'Run Diagnostic'}
                </Button>
                {diagnosticResult && diagnosticResult.diagnosis.issue !== 'OK' && (
                  <Button
                    onClick={repairUserFamily}
                    disabled={loading}
                  >
                    {loading ? 'Repairing...' : 'Auto-Repair'}
                  </Button>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-semibold">Error:</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            )}

            {!accessToken && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800">
                  ⚠️ No access token found. Please log in first.
                </p>
              </div>
            )}

            {accessToken && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm">
                  <strong>User ID:</strong> {userId}
                </p>
                <p className="text-blue-800 text-sm mt-1">
                  <strong>Token:</strong> {accessToken.substring(0, 30)}...
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {diagnosticResult && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Diagnosis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <span className={`text-sm font-bold ${getIssueColor(diagnosticResult.diagnosis.issue)}`}>
                      {diagnosticResult.diagnosis.issue}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Has Auth User:</span>
                    <span className={diagnosticResult.diagnosis.hasAuthUser ? 'text-green-600' : 'text-red-600'}>
                      {diagnosticResult.diagnosis.hasAuthUser ? '✅ Yes' : '❌ No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Has KV User Record:</span>
                    <span className={diagnosticResult.diagnosis.hasKVUserRecord ? 'text-green-600' : 'text-red-600'}>
                      {diagnosticResult.diagnosis.hasKVUserRecord ? '✅ Yes' : '❌ No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Has Family ID:</span>
                    <span className={diagnosticResult.diagnosis.hasFamilyId ? 'text-green-600' : 'text-red-600'}>
                      {diagnosticResult.diagnosis.hasFamilyId ? '✅ Yes' : '❌ No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Family Count:</span>
                    <span className={diagnosticResult.diagnosis.familyCount > 0 ? 'text-green-600' : 'text-gray-600'}>
                      {diagnosticResult.diagnosis.familyCount}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auth User</CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosticResult.authUser ? (
                  <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">
                    {JSON.stringify(diagnosticResult.authUser, null, 2)}
                  </pre>
                ) : (
                  <p className="text-red-600">No auth user found</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KV User Record</CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosticResult.kvUserRecord ? (
                  <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">
                    {JSON.stringify(diagnosticResult.kvUserRecord, null, 2)}
                  </pre>
                ) : (
                  <p className="text-red-600">No KV user record found</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Families</CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosticResult.userFamilies.length > 0 ? (
                  <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">
                    {JSON.stringify(diagnosticResult.userFamilies, null, 2)}
                  </pre>
                ) : (
                  <p className="text-gray-600">No families found</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
