import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../../utils/api";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface EditRequest {
  id: string;
  originalEventId: string;
  requestedBy: string;
  requestedByName?: string;
  originalOwner: string;
  originalOwnerName?: string;
  proposedChanges: any;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}

export function EditRequests() {
  const { user, isParentMode } = useAuth();
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const data = await api.getEditRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load edit requests:', error);
      toast.error('Failed to load edit requests');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (requestId: string, status: 'approved' | 'rejected', resolution?: string) => {
    if (!user) return;

    try {
      await api.resolveEditRequest(requestId, status, user.id, resolution);
      toast.success(status === 'approved' ? 'Edit request approved ✅' : 'Edit request rejected ❌');
      loadRequests();
    } catch (error) {
      console.error('Failed to resolve edit request:', error);
      toast.error('Failed to resolve edit request');
    }
  };

  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Only parents can review edit requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Edit Requests</h1>
        <p className="text-muted-foreground mt-1">
          Review and manage edit requests from parents
        </p>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Requests ({pendingRequests.length})
            </CardTitle>
            <CardDescription>Requests awaiting your approval</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingRequests.map(request => (
              <div key={request.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">Edit Request</p>
                    <p className="text-sm text-muted-foreground">
                      From {request.requestedByName || 'Parent'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.createdAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-yellow-100">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                </div>

                <div className="bg-gray-50 rounded p-3 space-y-2">
                  <p className="text-sm">
                    <strong>Reason:</strong> {request.reason}
                  </p>
                  {request.proposedChanges && (
                    <p className="text-sm">
                      <strong>Proposed Changes:</strong> {JSON.stringify(request.proposedChanges)}
                    </p>
                  )}
                </div>

                {user && request.originalOwner !== user.id && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleResolve(request.id, 'approved')}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleResolve(request.id, 'rejected', 'Not approved')}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                )}

                {user && request.originalOwner === user.id && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2">
                    <p className="text-sm text-blue-800">
                      ℹ️ This is your original entry. You can approve or reject this edit request.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Pending Requests */}
      {pendingRequests.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <div>
              <h3 className="font-semibold text-lg mb-2">All Clear!</h3>
              <p className="text-muted-foreground">
                No pending edit requests at this time.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolved Requests */}
      {resolvedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved Requests</CardTitle>
            <CardDescription>Previously reviewed edit requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resolvedRequests.slice(0, 10).map(request => (
              <div key={request.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      From {request.requestedByName || 'Parent'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Badge
                    variant={request.status === 'approved' ? 'default' : 'secondary'}
                    className={request.status === 'approved' ? 'bg-green-600' : 'bg-red-600'}
                  >
                    {request.status === 'approved' ? 'Approved' : 'Rejected'}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}