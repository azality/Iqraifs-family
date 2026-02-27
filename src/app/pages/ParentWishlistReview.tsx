import { useState, useEffect } from 'react';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Gift, Sparkles, TrendingUp, Star, Trash2, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface WishlistItem {
  id: string;
  childId: string;
  familyId: string;
  itemName: string;
  description: string;
  submittedAt: string;
  status: 'pending' | 'converted' | 'rejected';
  convertedToRewardId?: string;
}

export function ParentWishlistReview() {
  const { familyId, children } = useFamilyContext();
  const { accessToken } = useAuth();
  
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [converting, setConverting] = useState(false);
  
  // Reward form data
  const [rewardName, setRewardName] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState(50);

  useEffect(() => {
    if (familyId && accessToken) {
      loadWishlistItems();
    }
  }, [familyId, accessToken]);

  const loadWishlistItems = async () => {
    try {
      setLoading(true);
      console.log('📋 Loading wishlist items for family:', familyId);
      const response = await fetch(
        `${API_BASE}/families/${familyId}/wishlist-items`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      console.log('📋 Response status:', response.status);
      if (response.ok) {
        const items = await response.json();
        console.log('📋 Loaded wishlist items:', items);
        setWishlistItems(items);
      } else {
        const error = await response.json();
        console.error('❌ Failed to load wishlist items:', error);
      }
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const openConvertDialog = (item: WishlistItem) => {
    setSelectedItem(item);
    setRewardName(item.itemName);
    setRewardDescription(item.description);
    setRewardPoints(50);
    setConvertDialogOpen(true);
  };

  const handleConvertToReward = async () => {
    if (!selectedItem) return;

    if (!rewardName.trim()) {
      toast.error('Please enter a reward name');
      return;
    }

    if (rewardPoints <= 0) {
      toast.error('Points must be greater than 0');
      return;
    }

    try {
      setConverting(true);
      
      // Auto-categorize based on points
      const category = rewardPoints < 100 ? 'small' : rewardPoints < 500 ? 'medium' : 'large';
      
      const response = await fetch(
        `${API_BASE}/wishlist-items/${selectedItem.id}/convert`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            name: rewardName.trim(),
            description: rewardDescription.trim(),
            pointCost: rewardPoints,
            category
          })
        }
      );

      if (response.ok) {
        toast.success(`✨ Reward "${rewardName}" created!`);
        setConvertDialogOpen(false);
        loadWishlistItems();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create reward');
      }
    } catch (error) {
      console.error('Failed to convert wishlist item:', error);
      toast.error('Failed to create reward');
    } finally {
      setConverting(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this wishlist item?')) return;

    try {
      const response = await fetch(`${API_BASE}/wishlist-items/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        toast.success('Wishlist item deleted');
        loadWishlistItems();
      } else {
        toast.error('Failed to delete item');
      }
    } catch (error) {
      console.error('Failed to delete wishlist item:', error);
      toast.error('Failed to delete item');
    }
  };

  const getChildName = (childId: string) => {
    const child = children.find(c => c.id === childId);
    return child?.name || 'Unknown';
  };

  const pendingItems = wishlistItems.filter(item => item.status === 'pending');
  const convertedItems = wishlistItems.filter(item => item.status === 'converted');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kids' Wishlist</h1>
          <p className="text-gray-600 mt-1">
            Review wishes and convert them into rewards
          </p>
        </div>
        {pendingItems.length > 0 && (
          <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg font-medium">
            {pendingItems.length} new wish{pendingItems.length !== 1 ? 'es' : ''}
          </div>
        )}
      </div>

      {/* Pending Wishes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-semibold text-gray-900">
            Pending Wishes
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No pending wishes</p>
            <p className="text-sm text-gray-400 mt-1">
              When your kids submit wishes, they'll appear here
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{getChildName(item.childId) === 'Yusuf' ? '👦' : '👧'}</span>
                      <span className="font-medium text-sm text-gray-600">
                        {getChildName(item.childId)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {item.itemName}
                    </h3>
                    {item.description && item.description !== item.itemName && (
                      <p className="text-sm text-gray-600 mb-2">
                        {item.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {new Date(item.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => openConvertDialog(item)}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Create Reward
                  </Button>
                  <Button
                    onClick={() => handleDeleteItem(item.id)}
                    variant="outline"
                    size="icon"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Converted Wishes */}
      {convertedItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-xl font-semibold text-gray-900">
              Converted to Rewards
            </h2>
          </div>

          <div className="space-y-2">
            {convertedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900">{item.itemName}</p>
                    <p className="text-sm text-gray-600">
                      {getChildName(item.childId)} • {new Date(item.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Convert to Reward Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Reward from Wish</DialogTitle>
            <DialogDescription>
              Convert <strong>{selectedItem?.itemName}</strong> into a reward that{' '}
              {selectedItem && getChildName(selectedItem.childId)} can earn.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reward Name
              </label>
              <Input
                value={rewardName}
                onChange={(e) => setRewardName(e.target.value)}
                placeholder="Ice cream trip"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <Textarea
                value={rewardDescription}
                onChange={(e) => setRewardDescription(e.target.value)}
                placeholder="Trip to Al-Safa Ice Cream Shop"
                maxLength={200}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Point Cost
              </label>
              <Input
                type="number"
                value={rewardPoints}
                onChange={(e) => setRewardPoints(parseInt(e.target.value) || 0)}
                min={1}
                max={1000}
              />
              <p className="text-xs text-gray-500 mt-1">
                Auto-categorized: {rewardPoints < 100 ? 'Small' : rewardPoints < 500 ? 'Medium' : 'Large'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConvertDialogOpen(false)}
              disabled={converting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConvertToReward}
              disabled={converting || !rewardName.trim() || rewardPoints <= 0}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
            >
              {converting ? 'Creating...' : 'Create Reward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}