import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';

export function JoinPending() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkJoinStatus();
  }, []);

  const checkJoinStatus = async () => {
    setChecking(true);
    try {
      // Get current user session from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No active session:', sessionError);
        navigate('/login');
        return;
      }

      const accessToken = session.access_token;
      console.log('✅ Got access token from session');

      // Check if user now has a family (approved)
      const userResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/users/${session.user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (userResponse.ok) {
        const userData = await userResponse.json();
        
        if (userData.familyId) {
          // Approved! Clear pending flag and redirect
          localStorage.removeItem('fgs_join_pending');
          localStorage.setItem('fgs_family_id', userData.familyId);
          // Don't need to store token - Supabase already has it
          toast.success('Your join request was approved! Welcome to the family! 🎉');
          navigate('/onboarding');
          return;
        }
      }

      // Still pending - get request details
      const requestsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/my-join-request`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (requestsResponse.ok) {
        const requestData = await requestsResponse.json();
        setRequest(requestData);
        
        if (requestData.status === 'denied') {
          toast.error('Your join request was denied');
        }
      } else {
        console.error('Failed to fetch join request:', await requestsResponse.text());
      }
      
    } catch (error) {
      console.error('Error checking join status:', error);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking request status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {request?.status === 'denied' ? (
              <div className="bg-red-100 p-4 rounded-full">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
            ) : (
              <div className="bg-purple-100 p-4 rounded-full animate-pulse">
                <Clock className="h-12 w-12 text-purple-600" />
              </div>
            )}
          </div>
          
          {request?.status === 'denied' ? (
            <>
              <CardTitle className="text-2xl text-red-600">Request Denied</CardTitle>
              <CardDescription>
                Your join request was denied by the family admin
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl">Waiting for Approval</CardTitle>
              <CardDescription>
                Your join request has been submitted
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {request?.status === 'denied' ? (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  The family administrator has denied your request to join. Please contact them directly if you believe this was an error.
                </p>
              </div>

              <Button 
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                Return to Login
              </Button>
            </>
          ) : (
            <>
              {request && (
                <div className="space-y-3">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-900 mb-2">Request Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><strong>Your Name:</strong> {request.requesterName}</p>
                      <p><strong>Email:</strong> {request.requesterEmail}</p>
                      <p><strong>Relationship:</strong> {request.relationship}</p>
                      <p><strong>Requested Role:</strong> {request.requestedRole}</p>
                      <p><strong>Submitted:</strong> {new Date(request.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>What happens next?</strong><br/>
                      The family administrator will receive your request and can approve or deny it. You'll be notified once a decision is made.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  onClick={checkJoinStatus}
                  disabled={checking}
                  className="flex-1"
                >
                  {checking ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Check Status
                    </>
                  )}
                </Button>

                <Button 
                  onClick={handleLogout}
                  variant="outline"
                >
                  Logout
                </Button>
              </div>

              <p className="text-xs text-center text-gray-500">
                Tip: The family admin can approve your request from their Settings page
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}