import { useState, useEffect } from 'react';
import { clearStorage, getStorage, setStorage, removeStorage } from '../../../utils/storage';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Sparkles, Send, Gift, Clock, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { getKidInfo } from '../utils/auth';
import { useNavigate } from 'react-router';

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

export function KidWishlist() {
  const { getCurrentChild, familyId } = useFamilyContext();
  const { accessToken } = useAuth();
  const child = getCurrentChild();
  const kidInfo = getKidInfo();
  const navigate = useNavigate();
  
  const [wishText, setWishText] = useState('');
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load wishlist items
  useEffect(() => {
    if (familyId && accessToken) {
      loadWishlistItems();
    }
  }, [familyId, accessToken]);

  const loadWishlistItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/families/${familyId}/wishlist-items`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const items = await response.json();
        console.log('✅ Loaded wishlist items:', items);
        
        // Get kid info from localStorage
        const kidInfo = {
          id: await getStorage('kid_id') || await getStorage('child_id')
        };
        
        // Filter to show only current child's items if in kid mode
        const childId = kidInfo?.id || child?.id;
        const myItems = childId 
          ? items.filter((item: WishlistItem) => item.childId === childId)
          : items;
        setWishlistItems(myItems);
      } else {
        console.error('❌ Failed to load wishlist items:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWish = async () => {
    if (!wishText.trim()) {
      toast.error('Please write your wish!');
      return;
    }

    if (!child?.id) {
      toast.error('No child selected');
      return;
    }

    console.log('🎁 Submitting wishlist item:', {
      childId: child.id,
      wishText: wishText.trim(),
      itemName: wishText.trim().substring(0, 50),
      familyId,
      accessToken: accessToken ? 'present' : 'missing'
    });

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/wishlist-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          childId: child.id,
          wishText: wishText.trim(),
          itemName: wishText.trim().substring(0, 50)
        })
      });

      console.log('🎁 Response status:', response.status);
      const responseData = await response.json();
      console.log('🎁 Response data:', responseData);

      if (response.ok) {
        toast.success('Your wish has been sent to your parents! ✨');
        setWishText('');
        loadWishlistItems();
      } else {
        console.error('❌ Failed to submit wish:', responseData);
        toast.error(responseData.error || 'Failed to submit wish');
      }
    } catch (error) {
      console.error('Failed to submit wish:', error);
      toast.error('Failed to submit wish');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-sm">
            <Clock className="w-3 h-3" />
            <span>Waiting...</span>
          </div>
        );
      case 'converted':
        return (
          <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-sm">
            <CheckCircle2 className="w-3 h-3" />
            <span>Added to rewards!</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-1 text-gray-600 bg-gray-50 px-2 py-1 rounded-full text-sm">
            <XCircle className="w-3 h-3" />
            <span>Not this time</span>
          </div>
        );
    }
  };

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] text-white">
        <p>Please select a child to view wishlist! 🌙</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20" data-testid="page-kid-wishlist">
      {/* Back Button */}
      <Button
        onClick={() => navigate('/kid/home')}
        variant="ghost"
        className="mb-2 text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>

      {/* Header */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-[1.5rem] p-6 border border-purple-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--kid-midnight-blue)]">
              My Wishlist ✨
            </h1>
            <p className="text-gray-600 text-sm">
              Tell your parents what rewards you'd like!
            </p>
          </div>
        </div>
      </div>

      {/* Submit New Wish */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[1.5rem] p-6 border-2 border-purple-100 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Gift className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-800">
            Make a Wish
          </h2>
        </div>
        
        <Textarea
          value={wishText}
          onChange={(e) => setWishText(e.target.value)}
          placeholder="I wish for... (like: 'A trip to the ice cream shop' or 'Extra playtime on Saturday')"
          className="mb-4 min-h-[120px] text-base border-2 border-purple-100 focus:border-purple-300 rounded-xl"
          maxLength={500}
        />
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {wishText.length}/500 characters
          </span>
          <Button
            onClick={handleSubmitWish}
            disabled={submitting || !wishText.trim()}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
          >
            {submitting ? (
              'Sending...'
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to Parents
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Previous Wishes */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4 px-2">
          My Previous Wishes
        </h2>
        
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="bg-gray-50 rounded-[1.5rem] p-8 text-center">
            <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              You haven't made any wishes yet!
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Write your first wish above ☝️
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlistItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-800 flex-1">
                    {item.itemName}
                  </h3>
                  {getStatusBadge(item.status)}
                </div>
                
                {item.description && item.description !== item.itemName && (
                  <p className="text-sm text-gray-600 mb-2">
                    {item.description}
                  </p>
                )}
                
                <p className="text-xs text-gray-400">
                  Wished on {new Date(item.submittedAt).toLocaleDateString()}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}