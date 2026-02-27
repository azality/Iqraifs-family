import { useState, useEffect } from 'react';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '../../../utils/supabase/info';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Gift, Sparkles, Star, ArrowRight, Check, X } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';

/**
 * Wishlist Widget
 * Shows pending wishlist items from kids that need parent review
 * Can be used on Dashboard with inline conversion
 */

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface WishlistItem {
  id: string;
  childId: string;
  familyId: string;
  itemName: string;
  description: string;
  audioUrl?: string;
  submittedAt: string;
  status: 'pending' | 'converted' | 'rejected';
  convertedToRewardId?: string;
}

interface WishlistWidgetProps {
  compact?: boolean; // For dashboard widget
  maxItems?: number; // Limit number of items shown
}

export function WishlistWidget({ compact = true, maxItems = 3 }: WishlistWidgetProps) {
  const { familyId, children } = useFamilyContext();
  const { accessToken, isParentMode } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Conversion dialog state
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [converting, setConverting] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(50);

  useEffect(() => {
    if (familyId && accessToken && isParentMode) {
      loadWishlistItems();
    }
  }, [familyId, accessToken, isParentMode]);

  const loadWishlistItems = async () => {
    try {
      setLoading(true);
      console.log('🎁 WishlistWidget: Loading wishlist items for family:', familyId);
      const response = await fetch(
        `${API_BASE}/families/${familyId}/wishlist-items`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      console.log('🎁 WishlistWidget: Response status:', response.status);
      if (response.ok) {
        const items = await response.json();
        console.log('🎁 WishlistWidget: Loaded wishlist items:', items);
        setWishlistItems(items);
      } else {
        const error = await response.json();
        console.error('❌ WishlistWidget: Failed to load wishlist items:', error);
      }
    } catch (error) {
      console.error('Failed to load wishlist items:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChildName = (childId: string) => {
    const child = children.find(c => c.id === childId);
    return child?.name || 'Unknown';
  };

  const openConvertDialog = (item: WishlistItem) => {
    setSelectedItem(item);
    setRewardPoints(50);
    setConvertDialogOpen(true);
  };

  const handleConvert = async () => {
    if (!selectedItem) return;

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
            name: selectedItem.itemName,
            description: selectedItem.description,
            pointCost: rewardPoints,
            category
          })
        }
      );

      if (response.ok) {
        toast.success(`✨ Reward "${selectedItem.itemName}" created!`);
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

  const handleReject = async (item: WishlistItem) => {
    if (!confirm(`Delete wish "${item.itemName}"?`)) return;

    try {
      const response = await fetch(`${API_BASE}/wishlist-items/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        toast.success('Wish removed');
        loadWishlistItems();
      } else {
        toast.error('Failed to delete wish');
      }
    } catch (error) {
      console.error('Failed to delete wishlist item:', error);
      toast.error('Failed to delete wish');
    }
  };

  const pendingItems = wishlistItems.filter(item => item.status === 'pending');
  const displayItems = maxItems ? pendingItems.slice(0, maxItems) : pendingItems;

  // Don't show widget if not in parent mode
  if (!isParentMode) {
    return null;
  }

  // Don't show if no pending items and in compact mode
  if (compact && pendingItems.length === 0) {
    return null;
  }

  return (
    <>
      <Card className={compact ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-900">
                Kids' Wishlist
              </CardTitle>
            </div>
            {pendingItems.length > 0 && (
              <div className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {pendingItems.length}
              </div>
            )}
          </div>
          {compact && (
            <CardDescription className="text-amber-700">
              {pendingItems.length === 0 
                ? "No pending wishes" 
                : `${pendingItems.length} wish${pendingItems.length !== 1 ? 'es' : ''} waiting for review`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-600"></div>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm">No pending wishes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getChildName(item.childId) === 'Yusuf' ? '👦' : '👧'}</span>
                        <span className="font-medium text-sm text-gray-600">
                          {getChildName(item.childId)}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900">
                        {item.itemName}
                      </p>
                      {item.description && item.description !== item.itemName && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => openConvertDialog(item)}
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(item)}
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {pendingItems.length > maxItems && (
                <Link to="/wishlist">
                  <Button
                    variant="outline"
                    className="w-full border-amber-400 text-amber-700 hover:bg-amber-100"
                  >
                    View All {pendingItems.length} Wishes
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}

              {compact && pendingItems.length > 0 && pendingItems.length <= maxItems && (
                <Link to="/wishlist">
                  <Button
                    variant="outline"
                    className="w-full border-amber-400 text-amber-700 hover:bg-amber-100"
                  >
                    View All Wishes
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Convert Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Approve & Create Reward</DialogTitle>
            <DialogDescription>
              Convert <strong>{selectedItem?.itemName}</strong> into a reward for{' '}
              {selectedItem && getChildName(selectedItem.childId)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How many points should this reward cost?
              </label>
              <Input
                type="number"
                value={rewardPoints}
                onChange={(e) => setRewardPoints(parseInt(e.target.value) || 0)}
                min={1}
                max={1000}
                className="text-lg"
              />
              <p className="text-xs text-gray-500 mt-2">
                Category: <strong>{rewardPoints < 100 ? 'Small' : rewardPoints < 500 ? 'Medium' : 'Large'}</strong>
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
              onClick={handleConvert}
              disabled={converting || rewardPoints <= 0}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
            >
              {converting ? 'Creating...' : 'Create Reward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}