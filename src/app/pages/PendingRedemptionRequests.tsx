import { useState, useEffect } from 'react';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Gift, Clock, CheckCircle, XCircle, Package, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface RedemptionRequest {
  id: string;
  childId: string;
  rewardId: string;
  familyId: string;
  pointCost: number;
  rewardName: string;
  rewardDescription?: string;
  notes?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'declined' | 'delivered';
  approvedBy?: string;
  approvedAt?: string;
  declinedBy?: string;
  declinedAt?: string;
  declineReason?: string;
  deliveredAt?: string;
  deliveredBy?: string;
}

export function PendingRedemptionRequests() {
  const { familyId, children } = useFamilyContext();
  const { accessToken } = useAuth();
  
  const [requests, setRequests] = useState<RedemptionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  
  // Decline dialog state
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RedemptionRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => {
    if (familyId && accessToken) {
      loadRequests();
    }
  }, [familyId, accessToken]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/families/${familyId}/redemption-requests`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Failed to load redemption requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: RedemptionRequest) => {
    if (!confirm(`Approve "${request.rewardName}" for ${getChildName(request.childId)}?\n\nThis will deduct ${request.pointCost} points.`)) {
      return;
    }

    try {
      setActionInProgress(true);
      const response = await fetch(
        `${API_BASE}/redemption-requests/${request.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        toast.success(`✅ Approved! ${getChildName(request.childId)}'s new balance: ${result.newPoints} points`);
        loadRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Failed to approve request:', error);
      toast.error('Failed to approve request');
    } finally {
      setActionInProgress(false);
    }
  };

  const openDeclineDialog = (request: RedemptionRequest) => {
    setSelectedRequest(request);
    setDeclineReason('');
    setDeclineDialogOpen(true);
  };

  const handleDecline = async () => {
    if (!selectedRequest) return;

    if (declineReason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters)');
      return;
    }

    try {
      setActionInProgress(true);
      const response = await fetch(
        `${API_BASE}/redemption-requests/${selectedRequest.id}/decline`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ reason: declineReason.trim() })
        }
      );

      if (response.ok) {
        toast.success(`Declined request for ${getChildName(selectedRequest.childId)}`);
        setDeclineDialogOpen(false);
        loadRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to decline request');
      }
    } catch (error) {
      console.error('Failed to decline request:', error);
      toast.error('Failed to decline request');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleMarkDelivered = async (request: RedemptionRequest) => {
    if (!confirm(`Mark "${request.rewardName}" as delivered?`)) {
      return;
    }

    try {
      setActionInProgress(true);
      const response = await fetch(
        `${API_BASE}/redemption-requests/${request.id}/deliver`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.ok) {
        toast.success(`🎉 Marked as delivered!`);
        loadRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to mark as delivered');
      }
    } catch (error) {
      console.error('Failed to mark as delivered:', error);
      toast.error('Failed to mark as delivered');
    } finally {
      setActionInProgress(false);
    }
  };

  const getChildName = (childId: string) => {
    const child = children.find(c => c.id === childId);
    return child?.name || 'Unknown';
  };

  const getChildAvatar = (childId: string) => {
    const child = children.find(c => c.id === childId);
    return child?.avatar || '👶';
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const deliveredRequests = requests.filter(r => r.status === 'delivered');
  const declinedRequests = requests.filter(r => r.status === 'declined');

  const RequestCard = ({ request }: { request: RedemptionRequest }) => (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="text-3xl">{getChildAvatar(request.childId)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900">
                {getChildName(request.childId)}
              </span>
              <Badge variant="secondary" className="text-xs">
                {request.pointCost} pts
              </Badge>
            </div>
            <h3 className="font-semibold text-lg text-gray-900">
              {request.rewardName}
            </h3>
            {request.rewardDescription && (
              <p className="text-sm text-gray-600 mt-1">
                {request.rewardDescription}
              </p>
            )}
            {request.notes && (
              <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                <p className="text-sm text-blue-800 italic">
                  "{request.notes}"
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>Requested {new Date(request.requestedAt).toLocaleDateString()}</span>
      </div>

      {request.status === 'pending' && (
        <div className="flex gap-2">
          <Button
            onClick={() => handleApprove(request)}
            disabled={actionInProgress}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button
            onClick={() => openDeclineDialog(request)}
            disabled={actionInProgress}
            variant="outline"
            className="flex-1 text-red-600 hover:bg-red-50"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Decline
          </Button>
        </div>
      )}

      {request.status === 'approved' && (
        <div className="space-y-2">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-800 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">Approved</span>
            </div>
            <p className="text-xs text-green-700 mt-1">
              Approved on {new Date(request.approvedAt!).toLocaleDateString()}
            </p>
          </div>
          <Button
            onClick={() => handleMarkDelivered(request)}
            disabled={actionInProgress}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Package className="w-4 h-4 mr-2" />
            Mark as Delivered
          </Button>
        </div>
      )}

      {request.status === 'delivered' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-green-800 text-sm">
            <Package className="w-4 h-4" />
            <span className="font-medium">Delivered</span>
          </div>
          <p className="text-xs text-green-700 mt-1">
            Delivered on {new Date(request.deliveredAt!).toLocaleDateString()}
          </p>
        </div>
      )}

      {request.status === 'declined' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-800 text-sm mb-1">
            <XCircle className="w-4 h-4" />
            <span className="font-medium">Declined</span>
          </div>
          {request.declineReason && (
            <p className="text-xs text-red-700 italic">
              "{request.declineReason}"
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reward Requests</h1>
          <p className="text-gray-600 mt-1">
            Approve, decline, or track reward deliveries
          </p>
        </div>
        {pendingRequests.length > 0 && (
          <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {pendingRequests.length} pending
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingRequests.length > 0 && (
              <Badge className="ml-2 bg-amber-500">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            To Deliver ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="delivered">
            Delivered ({deliveredRequests.length})
          </TabsTrigger>
          <TabsTrigger value="declined">
            Declined ({declinedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No pending requests</p>
              <p className="text-sm text-gray-400 mt-1">
                When kids request rewards, they'll appear here
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pendingRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          {approvedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No rewards to deliver</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {approvedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="delivered" className="mt-6">
          {deliveredRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No delivered rewards yet</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {deliveredRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="declined" className="mt-6">
          {declinedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No declined requests</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {declinedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Request</DialogTitle>
            <DialogDescription>
              Please provide a gentle reason for declining this request.
              This will be shown to {selectedRequest && getChildName(selectedRequest.childId)}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Let's wait until the weekend, sweetie! 😊"
              rows={4}
              className="resize-none"
              maxLength={200}
            />
            <p className="text-xs text-gray-500 mt-2">
              {declineReason.length}/200 characters (min. 5)
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeclineDialogOpen(false)}
              disabled={actionInProgress}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDecline}
              disabled={actionInProgress || declineReason.trim().length < 5}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {actionInProgress ? 'Declining...' : 'Decline Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
