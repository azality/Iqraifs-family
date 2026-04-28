import { useState, useEffect } from "react";
import { clearStorage, getStorage, setStorage, removeStorage } from '../../utils/storage';
import { useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { useAuth } from "../contexts/AuthContext";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useRewards } from "../hooks/useRewards";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useMilestones } from "../hooks/useMilestones";
import { createChild, generateInviteCode } from "../../utils/api";
import { toast } from "sonner";
import { Lock, Plus, X, Gift, Target, Award, Sparkles, TrendingUp, TrendingDown, Users, AlertTriangle, Heart, UserCheck, UserX, Trash2, Globe, Bell, BellOff, Gamepad2, Brain } from "lucide-react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { deduplicateTrackableItems } from "../../utils/api";
import { supabase } from "../../../utils/supabase/client";
import { QuestSettings } from "../components/QuestSettings";
import { COMMON_TIMEZONES } from "../utils/timezone";
import { isPushNotificationsSupported, checkPushPermissions, requestPushPermissions, initializePushNotifications } from "../utils/pushNotifications";

// v13: PINs that are trivially guessable. We don't block these (parents
// know their families best) but we surface a soft warning when one is
// chosen so the parent can reconsider. Anything in this list represents
// either a sequential, repeating, or top-of-mind value.
const WEAK_PINS = new Set([
  '1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555',
  '6666', '7777', '8888', '9999', '1212', '2121', '1122', '2211',
  '0123', '3210', '1010', '2020', '1234', '6789', '9876', '0001',
  '1000', '7777', '2580',
]);

const isWeakPin = (pin: string): boolean => {
  if (!/^\d{4}$/.test(pin)) return false;
  if (WEAK_PINS.has(pin)) return true;
  // All same digit (e.g. '5555') - covered above but defense in depth.
  if (pin[0] === pin[1] && pin[1] === pin[2] && pin[2] === pin[3]) return true;
  return false;
};

// Helper function to deduplicate items by name (client-side safety net)
const deduplicateByName = <T extends { id: string; name: string }>(items: T[]): T[] => {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.name)) {
      seen.set(item.name, item);
    }
  }
  return Array.from(seen.values());
};

export function Settings() {
  const navigate = useNavigate();
  const { isParentMode, accessToken, userId } = useAuth();
  const { rewards, addReward } = useRewards();
  const { items: trackableItems, addItem, updateItem: updateTrackableItem } = useTrackableItems();
  const { milestones, addMilestone } = useMilestones();
  const { children, familyId, family, loadFamilyData } = useFamilyContext();
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Join Requests State
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [loadingJoinRequests, setLoadingJoinRequests] = useState(false);

  // v11/v12: Family Members State
  // role added in v12 (owner | parent | guardian); relationship now also
  // includes the literal dropdown values caregiver/teacher/other.
  type FamilyMember = {
    id: string;
    email: string;
    name: string;
    role?: 'owner' | 'parent' | 'guardian';
    isPrimary: boolean;
    relationship:
      | 'self'
      | 'spouse'
      | 'parent'
      | 'caregiver'
      | 'teacher'
      | 'guardian'
      | 'other'
      | 'unknown';
    joinedAt: string | null;
  };
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [primaryParentId, setPrimaryParentId] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(null);
  // v12: owner-only role management state
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<FamilyMember | null>(null);
  // v13: child PIN reset dialog state
  const [pinResetChild, setPinResetChild] = useState<{ id: string; name: string } | null>(null);
  const [pinResetValue, setPinResetValue] = useState("");
  const [pinResetSubmitting, setPinResetSubmitting] = useState(false);
  const isPrimaryParent = !!userId && !!primaryParentId && userId === primaryParentId;
  // In v12, the owner is parentIds[0], same as primary. We keep a local
  // alias so the meaning is obvious at the call sites.
  const isOwner = isPrimaryParent;

  // Child Form State
  const [childName, setChildName] = useState("");
  const [childPin, setChildPin] = useState("");
  const [showChildDialog, setShowChildDialog] = useState(false);

  // Reward Form State
  const [rewardName, setRewardName] = useState("");
  const [rewardDescription, setRewardDescription] = useState("");
  const [rewardPointCost, setRewardPointCost] = useState("");
  const [showRewardDialog, setShowRewardDialog] = useState(false);

  // Auto-calculate category based on point cost
  const getRewardCategory = (pointCost: number): "small" | "medium" | "large" => {
    if (pointCost < 100) return "small";
    if (pointCost < 500) return "medium";
    return "large";
  };

  const autoCategory = rewardPointCost ? getRewardCategory(parseInt(rewardPointCost) || 0) : "small";

  // Trackable Item Form State
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState<"habit" | "behavior">("habit");
  const [itemCategory, setItemCategory] = useState("general");
  const [itemPoints, setItemPoints] = useState("");
  const [itemTier, setItemTier] = useState<"minor" | "moderate" | "major">("minor");
  const [itemDedupeWindow, setItemDedupeWindow] = useState("");
  const [itemIsSingleton, setItemIsSingleton] = useState(true);
  const [itemIsReligious, setItemIsReligious] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  // Quest Settings State
  const [questEnabled, setQuestEnabled] = useState(true);
  const [dailyBonus, setDailyBonus] = useState("20");
  const [weeklyBonus, setWeeklyBonus] = useState("50");
  const [easyMultiplier, setEasyMultiplier] = useState("1");
  const [mediumMultiplier, setMediumMultiplier] = useState("1.5");
  const [hardMultiplier, setHardMultiplier] = useState("2");
  const [questSettingsLoading, setQuestSettingsLoading] = useState(false);

  // Timezone State
  const [familyTimezone, setFamilyTimezone] = useState(family?.timezone || 'UTC');

  // Push Notification State
  const [pushPermissionStatus, setPushPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [pushSupported, setPushSupported] = useState(false);
  const [loadingPushStatus, setLoadingPushStatus] = useState(true);

  // Game Settings State
  const [knowledgeQuestEnabled, setKnowledgeQuestEnabled] = useState(true);
  const [gameSettingsLoading, setGameSettingsLoading] = useState(false);

  // Account Deletion State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Quick templates for common items
  const templates = {
    otherHabits: [
      { name: "Brush Teeth", points: 3, category: "general", isSingleton: true },
      { name: "Make Bed", points: 5, category: "general", isSingleton: true },
      { name: "Clean Room", points: 10, category: "general", isSingleton: true },
      { name: "Read Book 15min", points: 8, category: "general", isSingleton: false },
      { name: "Exercise", points: 10, category: "general", isSingleton: true },
      { name: "Drink 8 Glasses Water", points: 5, category: "general", isSingleton: true },
    ],
    positiveBehaviors: [
      { name: "Helped Sibling", points: 15, category: "general" },
      { name: "Did Chores Without Asking", points: 20, category: "general" },
      { name: "Shared Toys", points: 10, category: "general" },
      { name: "Said Thank You", points: 5, category: "general" },
      { name: "Cleaned Up After Self", points: 8, category: "general" },
      { name: "Showed Kindness", points: 12, category: "general" },
    ],
    negativeBehaviors: [
      { name: "Talking Back", points: -5, tier: "moderate" },
      { name: "Hitting/Fighting", points: -15, tier: "major" },
      { name: "Lying", points: -10, tier: "major" },
      { name: "Not Listening", points: -3, tier: "minor" },
      { name: "Whining/Complaining", points: -2, tier: "minor" },
      { name: "Breaking Rules", points: -8, tier: "moderate" },
    ],
  };

  const handleUseTemplate = (template: any, type: "habit" | "behavior") => {
    setItemName(template.name);
    setItemType(type);
    setItemCategory(template.category || "general");
    setItemPoints(template.points.toString());
    if (template.tier) setItemTier(template.tier);
    if (template.isSingleton !== undefined) setItemIsSingleton(template.isSingleton);
    setShowTemplates(false);
  };

  const resetItemForm = () => {
    setItemName("");
    setItemType("habit");
    setItemPoints("");
    setItemCategory("general");
    setItemTier("minor");
    setItemDedupeWindow("");
    setItemIsSingleton(true);
    setItemIsReligious(false);
    setShowTemplates(true);
  };

  // Milestone Form State
  const [milestoneName, setMilestoneName] = useState("");
  const [milestonePoints, setMilestonePoints] = useState("");
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);

  // SECURITY: Redirect kids away from Settings page
  useEffect(() => {
    if (!isParentMode) {
      console.log('🚨 SECURITY: Child tried to access Settings - redirecting to Dashboard');
      navigate('/');
      toast.error("Settings are for parents only! Redirecting to your dashboard...");
    }
  }, [isParentMode, navigate]);

  // Check push notification status on mount
  useEffect(() => {
    const checkPushStatus = async () => {
      setLoadingPushStatus(true);
      try {
        const supported = isPushNotificationsSupported();
        setPushSupported(supported);
        
        if (supported) {
          const status = await checkPushPermissions();
          setPushPermissionStatus(status);
          console.log('📬 Push notification status:', status);
        }
      } catch (error) {
        console.error('Failed to check push notification status:', error);
      } finally {
        setLoadingPushStatus(false);
      }
    };

    checkPushStatus();
  }, []);

  if (!isParentMode) {
    return null; // Don't render anything while redirecting
  }

  const handleAddReward = async () => {
    if (!rewardName || !rewardPointCost) {
      toast.error("Please fill in all required fields");
      return;
    }

    const pointCost = parseInt(rewardPointCost);
    if (isNaN(pointCost) || pointCost <= 0) {
      toast.error("Point cost must be a positive number");
      return;
    }

    try {
      await addReward({
        name: rewardName,
        category: autoCategory,
        pointCost,
        description: rewardDescription || undefined
      });

      toast.success(`Reward "${rewardName}" added successfully! 🎉`);
      setRewardName("");
      setRewardDescription("");
      setRewardPointCost("");
      setShowRewardDialog(false);
    } catch (error) {
      toast.error("Failed to add reward");
    }
  };

  const handleAddItem = async () => {
    if (!itemName || !itemPoints) {
      toast.error("Please fill in all required fields");
      return;
    }

    const points = parseInt(itemPoints);
    if (isNaN(points) || points === 0) {
      toast.error("Points must be a non-zero number");
      return;
    }

    const dedupeWindow = itemDedupeWindow ? parseInt(itemDedupeWindow) : undefined;
    if (itemDedupeWindow && (isNaN(dedupeWindow!) || dedupeWindow! <= 0)) {
      toast.error("Dedupe window must be a positive number");
      return;
    }

    try {
      await addItem({
        name: itemName,
        type: itemType,
        category: itemCategory === "general" ? undefined : itemCategory,
        points,
        tier: points < 0 ? itemTier : undefined,
        dedupeWindow,
        isSingleton: itemIsSingleton,
        isReligious: itemIsReligious
      });

      toast.success(`${itemType === 'habit' ? 'Habit' : 'Behavior'} "${itemName}" added successfully!`);
      resetItemForm();
      setShowItemDialog(false);
    } catch (error) {
      toast.error("Failed to add item");
    }
  };

  const handleAddMilestone = async () => {
    if (!milestoneName || !milestonePoints) {
      toast.error("Please fill in all required fields");
      return;
    }

    const points = parseInt(milestonePoints);
    if (isNaN(points) || points <= 0) {
      toast.error("Points must be a positive number");
      return;
    }

    try {
      await addMilestone({
        name: milestoneName,
        points
      });

      toast.success(`Milestone "${milestoneName}" added successfully! ⭐`);
      setMilestoneName("");
      setMilestonePoints("");
      setShowMilestoneDialog(false);
    } catch (error) {
      toast.error("Failed to add milestone");
    }
  };

  const handleAddChild = async () => {
    if (!childName || !childPin) {
      toast.error("Please fill in all required fields");
      return;
    }

    const pin = parseInt(childPin);
    if (isNaN(pin) || pin < 1000 || pin > 9999) {
      toast.error("PIN must be a 4-digit number");
      return;
    }

    // v13: warn (don't block) on common easy-to-guess PINs.
    if (isWeakPin(childPin)) {
      const proceed = window.confirm(
        `"${childPin}" is a very common PIN (like 1234 or 0000) and easy for ` +
        `siblings to guess. We recommend choosing a less obvious 4-digit number.\n\n` +
        `Continue with this PIN anyway?`
      );
      if (!proceed) return;
    }

    if (!familyId) {
      toast.error("No family ID found");
      return;
    }

    try {
      await createChild(childName, familyId, childPin);

      toast.success(`Child "${childName}" added successfully!`);
      setChildName("");
      setChildPin("");
      setShowChildDialog(false);
      
      console.log('🔄 Child added - calling loadFamilyData()...');
      await loadFamilyData(); // Reload children list
      console.log('✅ loadFamilyData() completed after adding child');
    } catch (error) {
      console.error('Error adding child:', error);
      toast.error("Failed to add child");
    }
  };

  const handleDedupeItems = async () => {
    setDedupeLoading(true);
    try {
      const result = await deduplicateTrackableItems();
      toast.success(`Successfully removed ${result.duplicatesRemoved} duplicate items!`);
      // Reload items to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('Dedupe error:', error);
      toast.error("Failed to deduplicate trackable items");
    } finally {
      setDedupeLoading(false);
    }
  };

  const handleGenerateInviteCode = async () => {
    if (!familyId) {
      toast.error("No family ID found");
      return;
    }

    setGeneratingInvite(true);
    try {
      const result = await generateInviteCode(familyId);
      console.log('✅ Invite code generated:', result);
      toast.success("Invite code generated successfully!");
      // Reload family data to get the new invite code
      await loadFamilyData();
    } catch (error) {
      console.error('Error generating invite code:', error);
      toast.error("Failed to generate invite code");
    } finally {
      setGeneratingInvite(false);
    }
  };

  // Fetch join requests
  const fetchJoinRequests = async () => {
    if (!familyId) return;
    
    setLoadingJoinRequests(true);
    try {
      // Get token from Supabase session (NOT localStorage)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('🔍 fetchJoinRequests - Session check:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length,
        tokenPreview: session?.access_token ? `${session.access_token.substring(0, 40)}...` : 'NO TOKEN',
        sessionError: sessionError?.message
      });
      
      if (sessionError || !session?.access_token) {
        console.error('❌ No valid session to fetch join requests - logging out');
        toast.error('Session expired. Please log in again.');
        // Clear all localStorage and redirect to login
        await clearStorage();
        navigate('/login');
        return;
      }
      
      const token = session.access_token;
      
      // Extra validation: make sure token is not the string "null"
      if (token === 'null' || token === 'undefined' || token.length < 20) {
        console.error('❌ Invalid token detected:', { token, length: token.length });
        toast.error('Invalid session. Please log in again.');
        // Force sign out to clear corrupted Supabase in-memory session
        await supabase.auth.signOut();
        await clearStorage();
        navigate('/login');
        return;
      }
      
      console.log('📋 Fetching join requests for family:', familyId);
      console.log('🔐 Token being sent:', {
        length: token.length,
        preview: `${token.substring(0, 50)}...`,
        isNull: token === 'null',
        type: typeof token
      });
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/join-requests`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Fetched join requests:', data);
        setJoinRequests(data);
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to fetch join requests:', response.status, errorData);
        
        // If we get a 401, session is invalid
        if (response.status === 401) {
          toast.error('Session expired. Please log in again.');
          await clearStorage();
          navigate('/login');
        }
      }
    } catch (error) {
      console.error('❌ Error fetching join requests:', error);
    } finally {
      setLoadingJoinRequests(false);
    }
  };

  // Approve join request
  const handleApproveJoinRequest = async (requestId: string) => {
    if (!familyId) return;

    try {
      // Get token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/join-requests/${requestId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message || 'Join request approved!');
        fetchJoinRequests(); // Refresh the list
        loadFamilyData(); // Refresh family data
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving join request:', error);
      toast.error('Failed to approve request');
    }
  };

  // Deny join request
  const handleDenyJoinRequest = async (requestId: string) => {
    if (!familyId) return;

    try {
      // Get token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/join-requests/${requestId}/deny`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        toast.success('Join request denied');
        fetchJoinRequests(); // Refresh the list
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to deny request');
      }
    } catch (error) {
      console.error('Error denying join request:', error);
      toast.error('Failed to deny request');
    }
  };

  // v11: Family Members — load + reset-password handlers
  const loadFamilyMembers = async () => {
    if (!familyId) return;
    setLoadingMembers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/members`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setFamilyMembers(Array.isArray(data?.members) ? data.members : []);
        setPrimaryParentId(data?.primaryParentId || null);
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load family members');
      }
    } catch (error) {
      console.error('Error loading family members:', error);
      toast.error('Failed to load family members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSendPasswordReset = async (memberId: string, memberEmail: string) => {
    if (!familyId) return;
    if (!window.confirm(`Send a password reset email to ${memberEmail}?`)) return;
    setResettingMemberId(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/members/${memberId}/reset-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey,
          },
        }
      );
      if (response.ok) {
        toast.success(`Password reset email sent to ${memberEmail}.`);
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to send password reset email');
      }
    } catch (error) {
      console.error('Error sending password reset:', error);
      toast.error('Failed to send password reset email');
    } finally {
      setResettingMemberId(null);
    }
  };

  // v12: Promote a guardian -> parent, or demote a parent -> guardian.
  // Owner-only on the backend; UI also gates the buttons by isOwner.
  const handleUpdateMemberRole = async (
    memberId: string,
    newRole: 'parent' | 'guardian',
    memberName: string
  ) => {
    if (!familyId) return;
    setRoleUpdatingId(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/members/${memberId}/role`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (response.ok) {
        toast.success(
          newRole === 'parent'
            ? `${memberName} is now a Parent.`
            : `${memberName} is now a Guardian.`
        );
        await loadFamilyMembers();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error('Failed to update role');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  // v12: Remove a member from the family. Auth account is preserved.
  const handleRemoveMember = async (member: FamilyMember) => {
    if (!familyId || !member?.id) return;
    setRemovingMemberId(member.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/members/${member.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey,
          },
        }
      );
      if (response.ok) {
        toast.success(`${member.name} was removed from the family.`);
        await loadFamilyMembers();
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    } finally {
      setRemovingMemberId(null);
      setMemberToRemove(null);
    }
  };

  // v13: Reset a child's PIN. Hits the new owner/parent-gated endpoint.
  // Open the dialog from the children grid; this handler validates the
  // entered value and submits.
  const handleResetChildPin = async () => {
    if (!familyId || !pinResetChild) return;
    const pin = pinResetValue.trim();
    if (!/^\d{4}$/.test(pin)) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }
    const pinNum = parseInt(pin, 10);
    if (pinNum < 1000 || pinNum > 9999) {
      toast.error('PIN must be between 1000 and 9999.');
      return;
    }
    setPinResetSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/children/${pinResetChild.id}/reset-pin`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ pin }),
        }
      );
      if (response.ok) {
        toast.success(`PIN updated for ${pinResetChild.name}.`);
        setPinResetChild(null);
        setPinResetValue("");
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || 'Failed to update PIN');
      }
    } catch (error) {
      console.error('Error resetting child PIN:', error);
      toast.error('Failed to update PIN');
    } finally {
      setPinResetSubmitting(false);
    }
  };

  // Fetch join requests on mount
  useEffect(() => {
    if (familyId) {
      fetchJoinRequests();
      loadQuestSettings();
      loadGameSettings();
      loadFamilyMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  // Sync timezone state when family data changes
  useEffect(() => {
    if (family?.timezone) {
      setFamilyTimezone(family.timezone);
    }
  }, [family?.timezone]);

  // Load quest settings
  const loadQuestSettings = async () => {
    if (!familyId || !accessToken) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const settings = await response.json();
        setQuestEnabled(settings.enabled ?? true);
        setDailyBonus(String(settings.dailyBonusPoints ?? 20));
        setWeeklyBonus(String(settings.weeklyBonusPoints ?? 50));
        setEasyMultiplier(String(settings.difficultyMultipliers?.easy ?? 1));
        setMediumMultiplier(String(settings.difficultyMultipliers?.medium ?? 1.5));
        setHardMultiplier(String(settings.difficultyMultipliers?.hard ?? 2));
      }
    } catch (error) {
      console.error('Load quest settings error:', error);
    }
  };

  // Load game settings
  const loadGameSettings = async () => {
    if (!familyId || !accessToken) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/game-settings`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const settings = await response.json();
        setKnowledgeQuestEnabled(settings.knowledgeQuestEnabled ?? true);
      }
    } catch (error) {
      console.error('Load game settings error:', error);
    }
  };

  // Save game settings
  const handleSaveGameSettings = async () => {
    if (!familyId || !accessToken) return;
    
    try {
      setGameSettingsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/game-settings`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            knowledgeQuestEnabled
          })
        }
      );

      if (response.ok) {
        toast.success('Game settings saved!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Save game settings error:', error);
      toast.error('Failed to save settings');
    } finally {
      setGameSettingsLoading(false);
    }
  };

  // Save quest settings
  const handleSaveQuestSettings = async () => {
    if (!familyId || !accessToken) return;
    
    try {
      setQuestSettingsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            enabled: questEnabled,
            dailyBonusPoints: parseInt(dailyBonus) || 20,
            weeklyBonusPoints: parseInt(weeklyBonus) || 50,
            difficultyMultipliers: {
              easy: parseFloat(easyMultiplier) || 1,
              medium: parseFloat(mediumMultiplier) || 1.5,
              hard: parseFloat(hardMultiplier) || 2
            }
          })
        }
      );

      if (response.ok) {
        toast.success('Quest settings saved!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save quest settings');
      }
    } catch (error) {
      console.error('Save quest settings error:', error);
      toast.error('Failed to save quest settings');
    } finally {
      setQuestSettingsLoading(false);
    }
  };

  // Handle timezone change
  const handleTimezoneChange = async (newTimezone: string) => {
    if (!familyId || !accessToken) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/timezone`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({ timezone: newTimezone }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update timezone');
      }
      
      setFamilyTimezone(newTimezone);
      toast.success('Timezone updated successfully');
      
      // Reload family data to get updated timezone
      await loadFamilyData();
    } catch (error) {
      console.error('Failed to update timezone:', error);
      toast.error('Failed to update timezone');
    }
  };

  // Handle enabling push notifications
  const handleEnablePushNotifications = async () => {
    if (!pushSupported) {
      toast.error('Push notifications are not supported on this device');
      return;
    }

    try {
      const granted = await requestPushPermissions();
      
      if (granted) {
        setPushPermissionStatus('granted');
        toast.success('Push notifications enabled! 🔔');
        
        // Initialize push notifications with user ID
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await initializePushNotifications(user.id);
        }
      } else {
        setPushPermissionStatus('denied');
        toast.error('Push notification permission denied');
      }
    } catch (error) {
      console.error('Failed to enable push notifications:', error);
      toast.error('Failed to enable push notifications');
    }
  };

  // Handle disabling push notifications
  const handleDisablePushNotifications = async () => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/notifications/unregister-token`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to unregister token');
      }

      setPushPermissionStatus('prompt');
      toast.success('Push notifications disabled');
    } catch (error) {
      console.error('Failed to disable push notifications:', error);
      toast.error('Failed to disable push notifications');
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    // Validate confirmation text
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    // Validate password
    if (!deletePassword || deletePassword.length < 6) {
      toast.error('Please enter your password');
      return;
    }

    setIsDeletingAccount(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        setIsDeletingAccount(false);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/account`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({ password: deletePassword }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }

      const result = await response.json();
      
      // Show success message
      toast.success(result.deletionScope === 'entire_family' 
        ? 'Account and family deleted successfully' 
        : 'Account deleted successfully'
      );

      // Sign out and redirect to login
      await supabase.auth.signOut();
      navigate('/login');
      
    } catch (error: any) {
      console.error('Account deletion error:', error);
      toast.error(error.message || 'Failed to delete account');
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteConfirmText("");
    }
  };

  // Detect duplicate rewards by name
  const duplicateRewards = rewards.reduce((acc, reward, index, arr) => {
    const duplicates = arr.filter(r => r.name.toLowerCase().trim() === reward.name.toLowerCase().trim());
    if (duplicates.length > 1 && !acc.some(d => d.name.toLowerCase().trim() === reward.name.toLowerCase().trim())) {
      acc.push({ name: reward.name, count: duplicates.length, ids: duplicates.map(d => d.id) });
    }
    return acc;
  }, [] as Array<{ name: string; count: number; ids: string[] }>);

  // Detect duplicate milestones by name
  const duplicateMilestones = milestones.reduce((acc, milestone, index, arr) => {
    const duplicates = arr.filter(m => m.name.toLowerCase().trim() === milestone.name.toLowerCase().trim());
    if (duplicates.length > 1 && !acc.some(d => d.name.toLowerCase().trim() === milestone.name.toLowerCase().trim())) {
      acc.push({ name: milestone.name, count: duplicates.length, ids: duplicates.map(d => d.id) });
    }
    return acc;
  }, [] as Array<{ name: string; count: number; ids: string[] }>);

  const handleBulkDeleteDuplicateRewards = async () => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      let deletedCount = 0;
      
      // For each duplicate group, keep the first one and delete the rest
      for (const dup of duplicateRewards) {
        const idsToDelete = dup.ids.slice(1); // Keep first, delete rest
        
        for (const id of idsToDelete) {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/rewards/${id}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          
          if (response.ok) {
            deletedCount++;
          }
        }
      }
      
      toast.success(`Removed ${deletedCount} duplicate reward${deletedCount === 1 ? '' : 's'}!`);
      // Reload rewards
      window.location.reload();
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Failed to remove duplicates');
    }
  };

  const handleBulkDeleteDuplicateMilestones = async () => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      let deletedCount = 0;
      
      // For each duplicate group, keep the first one and delete the rest
      for (const dup of duplicateMilestones) {
        const idsToDelete = dup.ids.slice(1); // Keep first, delete rest
        
        for (const id of idsToDelete) {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/milestones/${id}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          
          if (response.ok) {
            deletedCount++;
          }
        }
      }
      
      toast.success(`Removed ${deletedCount} duplicate milestone${deletedCount === 1 ? '' : 's'}!`);
      // Reload page
      window.location.reload();
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Failed to remove duplicates');
    }
  };

  const smallRewards = rewards.filter(r => r.category === 'small');
  const mediumRewards = rewards.filter(r => r.category === 'medium');
  const largeRewards = rewards.filter(r => r.category === 'large');

  // Deduplicate trackable items before filtering (client-side safety net)
  const uniqueItems = deduplicateByName(trackableItems);
  
  const salahItems = uniqueItems.filter(i => i.category === 'salah');
  const otherHabits = uniqueItems.filter(i => i.type === 'habit' && i.category !== 'salah');
  const positiveBehaviors = uniqueItems.filter(i => i.type === 'behavior' && i.points > 0);
  const negativeBehaviors = uniqueItems.filter(i => i.type === 'behavior' && i.points < 0);

  return (
    <div className="space-y-6" data-testid="page-parent-settings">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Family Settings</h1>
        <p className="text-muted-foreground mt-1">
          Customize rewards, habits, behaviors, and milestones for your family
        </p>
      </div>

      <Tabs defaultValue="rewards" className="w-full">
        {/* Mobile: horizontally-scrollable tab strip with labels (single row,
            user swipes). Desktop (md+): 9-column grid as before. */}
        <div className="-mx-4 px-4 overflow-x-auto md:mx-0 md:px-0 md:overflow-visible">
          <TabsList className="flex w-max gap-1 md:w-full md:gap-0 md:grid md:grid-cols-9">
            <TabsTrigger value="children" className="flex-none md:flex-1 px-3 md:px-2">
              <Users className="h-4 w-4 mr-2" />
              <span>Children</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-none md:flex-1 px-3 md:px-2">
              <Heart className="h-4 w-4 mr-2" />
              <span>Members</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex-none md:flex-1 px-3 md:px-2">
              <Bell className="h-4 w-4 mr-2" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="rewards" className="flex-none md:flex-1 px-3 md:px-2">
              <Gift className="h-4 w-4 mr-2" />
              <span>Rewards</span>
            </TabsTrigger>
            <TabsTrigger value="behaviors" className="flex-none md:flex-1 px-3 md:px-2">
              <Target className="h-4 w-4 mr-2" />
              <span>Behaviors</span>
            </TabsTrigger>
            <TabsTrigger value="quests" className="flex-none md:flex-1 px-3 md:px-2">
              <Sparkles className="h-4 w-4 mr-2" />
              <span>Quests</span>
            </TabsTrigger>
            <TabsTrigger value="games" className="flex-none md:flex-1 px-3 md:px-2">
              <Gamepad2 className="h-4 w-4 mr-2" />
              <span>Games</span>
            </TabsTrigger>
            <TabsTrigger value="milestones" className="flex-none md:flex-1 px-3 md:px-2">
              <Award className="h-4 w-4 mr-2" />
              <span>Milestones</span>
            </TabsTrigger>
            <TabsTrigger value="danger" className="flex-none md:flex-1 px-3 md:px-2 text-red-600">
              <AlertTriangle className="h-4 w-4 mr-2" />
              <span>Danger</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* CHILDREN TAB */}
        <TabsContent value="children" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Manage Children
                  </CardTitle>
                  <CardDescription>Add children to your family</CardDescription>
                </div>
                <Dialog open={showChildDialog} onOpenChange={setShowChildDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Child
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add New Child</DialogTitle>
                      <DialogDescription>
                        Create a new child profile in your family
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="child-name">Child Name *</Label>
                        <Input
                          id="child-name"
                          placeholder="e.g., Yusuf"
                          value={childName}
                          onChange={(e) => setChildName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="child-pin">PIN (4 digits) *</Label>
                        <Input
                          id="child-pin"
                          type="tel"
                          placeholder="1234"
                          value={childPin}
                          onChange={(e) => setChildPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4}
                        />
                        <p className="text-xs text-muted-foreground">
                          Each child needs a 4-digit PIN for Kid Mode login
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddChild} className="flex-1">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Child
                        </Button>
                        <Button variant="outline" onClick={() => setShowChildDialog(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {children.map(child => (
                  <div key={child.id} className="p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <div className="h-12 w-12 rounded-full bg-blue-200 flex items-center justify-center">
                          <Users className="h-6 w-6 text-blue-700" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{child.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {child.currentPoints || 0} points
                        </p>
                      </div>
                    </div>
                    {/* v13: Reset PIN action - parents only (guardians don't manage child credentials). */}
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                        onClick={() => {
                          setPinResetChild({ id: child.id, name: child.name });
                          setPinResetValue("");
                        }}
                      >
                        <Lock className="h-3 w-3 mr-1" />
                        Reset PIN
                      </Button>
                    </div>
                  </div>
                ))}
                {children.length === 0 && (
                  <div className="col-span-full p-8 text-center border-2 border-dashed rounded-lg">
                    <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm font-medium text-gray-900 mb-1">No children added yet</p>
                    <p className="text-xs text-muted-foreground">
                      Click "Add Child" to get started with your Family Growth System
                    </p>
                  </div>
                )}
              </div>

              {/* v13: Reset Child PIN dialog */}
              <Dialog
                open={!!pinResetChild}
                onOpenChange={(open) => {
                  if (!open && !pinResetSubmitting) {
                    setPinResetChild(null);
                    setPinResetValue("");
                  }
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-blue-600" />
                      Reset PIN for {pinResetChild?.name}
                    </DialogTitle>
                    <DialogDescription>
                      Enter a new 4-digit PIN. This will overwrite {pinResetChild?.name}'s
                      current PIN immediately. Make sure to share the new PIN with them
                      so they can sign back in.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div>
                      <Label htmlFor="reset-pin-input">New PIN (4 digits, 1000-9999)</Label>
                      <Input
                        id="reset-pin-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        placeholder="••••"
                        value={pinResetValue}
                        onChange={(e) => {
                          // Strip to digits only, cap at 4 chars
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setPinResetValue(digits);
                        }}
                        disabled={pinResetSubmitting}
                        className="mt-1 text-center text-2xl tracking-[0.5em] font-mono"
                      />
                    </div>
                    {pinResetValue.length === 4 && isWeakPin(pinResetValue) && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>
                          That PIN is easy to guess (e.g. 1234, 0000, repeating digits).
                          You can still use it, but a less obvious PIN keeps siblings out.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPinResetChild(null);
                        setPinResetValue("");
                      }}
                      disabled={pinResetSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleResetChildPin}
                      disabled={pinResetSubmitting || !/^\d{4}$/.test(pinResetValue)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {pinResetSubmitting ? 'Updating…' : 'Update PIN'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Family Invite Code */}
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Heart className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-purple-900 mb-1">Invite Your Spouse</h4>
                    <p className="text-sm text-purple-800 mb-3">
                      Share this code with your spouse so they can join your family and co-parent together!
                    </p>
                    
                    {family?.inviteCode ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white border-2 border-purple-300 rounded-lg px-4 py-3 font-mono text-2xl font-bold text-purple-900 text-center tracking-widest">
                            {family.inviteCode}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(family.inviteCode || '');
                              toast.success('Invite code copied to clipboard!');
                            }}
                            className="shrink-0"
                          >
                            Copy Code
                          </Button>
                        </div>
                        <p className="text-xs text-purple-700 mt-2">
                          📱 Your spouse should use this code during signup on the "Join Existing Family" step
                        </p>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-purple-700">
                          Your family doesn't have an invite code yet. Generate one to invite your spouse!
                        </p>
                        <Button
                          onClick={handleGenerateInviteCode}
                          disabled={generatingInvite}
                          className="w-full sm:w-auto"
                        >
                          {generatingInvite ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Generate Invite Code
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Family Timezone */}
              <div className="mt-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-900 mb-1">Family Timezone</h4>
                    <p className="text-sm text-blue-800 mb-3">
                      Controls when daily resets occur for prayer tracking, streaks, and daily caps
                    </p>
                    
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Current Timezone</Label>
                      <Select
                        value={familyTimezone}
                        onValueChange={handleTimezoneChange}
                      >
                        <SelectTrigger className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMON_TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label} ({tz.offset})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <p className="text-xs text-blue-700">
                        <strong>Current:</strong> {familyTimezone}
                      </p>
                      <p className="text-xs text-amber-600">
                        ⚠️ Changing timezone affects daily resets, prayer tracking, and streak calculations.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Join Requests */}
              {joinRequests.length > 0 && (
                <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-green-900 mb-1">Pending Join Requests ({joinRequests.length})</h4>
                      <p className="text-sm text-green-800 mb-3">
                        Review requests from people who want to join your family
                      </p>
                      
                      <div className="space-y-3">
                        {joinRequests.map((request) => (
                          <div key={request.id} className="bg-white border-2 border-green-200 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900">{request.requesterName}</h5>
                                <p className="text-sm text-gray-600">{request.requesterEmail}</p>
                                <div className="mt-2 flex gap-2 flex-wrap">
                                  <Badge variant="outline">{request.relationship}</Badge>
                                  <Badge variant="outline">{request.requestedRole}</Badge>
                                  <span className="text-xs text-gray-500">
                                    {new Date(request.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveJoinRequest(request.id)}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDenyJoinRequest(request.id)}
                                  className="border-red-300 text-red-600 hover:bg-red-50"
                                >
                                  <UserX className="h-4 w-4 mr-1" />
                                  Deny
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Kid Login Code */}
              <div className="mt-6 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-amber-900 mb-1">Kid Login Code</h4>
                    <p className="text-sm text-amber-800 mb-3">
                      Kids can use this family code to log in on their devices (iPad, phone, etc.)
                    </p>
                    
                    {family?.inviteCode ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white border-2 border-amber-300 rounded-lg px-4 py-3 font-mono text-2xl font-bold text-amber-900 text-center tracking-widest">
                            {family.inviteCode}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(family.inviteCode || '');
                              toast.success('Family code copied!');
                            }}
                            className="shrink-0"
                          >
                            Copy
                          </Button>
                        </div>
                        <div className="mt-3 space-y-1">
                          <p className="text-xs text-amber-700">
                            <strong>How kids login:</strong>
                          </p>
                          <ol className="text-xs text-amber-700 ml-4 space-y-1 list-decimal">
                            <li>Open the app and tap "Kid Login"</li>
                            <li>Enter this family code: <span className="font-mono font-semibold">{family.inviteCode}</span></li>
                            <li>Tap their name/avatar</li>
                            <li>Enter their 4-digit PIN</li>
                          </ol>
                          <p className="text-xs text-amber-700 mt-2">
                            <strong>You set each child's PIN</strong> when adding them above. Forgot a PIN? Tap <strong>Reset PIN</strong> on their card.
                          </p>
                          <p className="text-xs text-amber-600 mt-1">
                            ✨ No parent login required on their device!
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-amber-700">
                          Generate a family code first to enable kid login!
                        </p>
                        <Button
                          onClick={handleGenerateInviteCode}
                          disabled={generatingInvite}
                          className="w-full sm:w-auto"
                        >
                          {generatingInvite ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Generate Family Code
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Each child gets their own profile with points, rewards, and growth tracking. 
                  They'll use their PIN to log into Kid Mode!
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MEMBERS TAB (v11) */}
        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-pink-500" />
                    Family Members
                  </CardTitle>
                  <CardDescription>
                    Everyone registered under your family code. Parents have full access; guardians
                    (nannies, teachers, etc.) can mark prayers and approve behaviors but can't change family settings.
                    {isOwner && ' As the family owner, you can promote, demote, remove, or reset passwords for any member.'}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadFamilyMembers}
                  disabled={loadingMembers}
                >
                  {loadingMembers ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMembers && familyMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Loading members…</p>
              ) : familyMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No members found. Share your family invite code from the Children tab to add a spouse or guardian.
                </p>
              ) : (
                <div className="space-y-3">
                  {familyMembers.map((m) => {
                    // v12: prefer the new role field; fall back to relationship
                    // for back-compat with old payloads.
                    const role: 'owner' | 'parent' | 'guardian' =
                      m.role
                        ? m.role
                        : m.relationship === 'self'
                          ? 'owner'
                          : (m.relationship === 'spouse' || m.relationship === 'parent')
                            ? 'parent'
                            : 'guardian';

                    const roleLabel =
                      role === 'owner' ? 'Owner' :
                      role === 'parent' ? 'Parent' :
                      'Guardian';

                    const roleBadgeColor =
                      role === 'owner' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                      role === 'parent' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                      'bg-gray-100 text-gray-800 border-gray-300';

                    // Subtitle shows the original relationship the user picked
                    // at signup, when it adds info beyond the role badge.
                    const relationshipSubtitle =
                      m.relationship === 'spouse' ? 'spouse' :
                      m.relationship === 'caregiver' ? 'nanny / caregiver' :
                      m.relationship === 'teacher' ? 'teacher' :
                      m.relationship === 'guardian' ? 'guardian' :
                      m.relationship === 'other' ? 'other' :
                      m.relationship === 'parent' ? 'parent' :
                      '';

                    const isSelfRow = m.id === userId;
                    const showResetButton = isOwner && !isSelfRow;
                    const showOwnerActions = isOwner && !isSelfRow && role !== 'owner';
                    const isBusy =
                      roleUpdatingId === m.id || removingMemberId === m.id;

                    return (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 border rounded-lg bg-card"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium truncate">{m.name}</span>
                            <Badge variant="outline" className={roleBadgeColor}>
                              {roleLabel}
                            </Badge>
                            {isSelfRow && (
                              <Badge variant="outline" className="bg-gray-100 text-gray-700">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {m.email || '—'}
                            {relationshipSubtitle && role !== 'owner' && (
                              <span className="ml-2">• joined as {relationshipSubtitle}</span>
                            )}
                          </p>
                          {m.joinedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Joined {new Date(m.joinedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {showResetButton && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSendPasswordReset(m.id, m.email)}
                              disabled={resettingMemberId === m.id || !m.email || isBusy}
                            >
                              <Lock className="h-3.5 w-3.5 mr-1.5" />
                              {resettingMemberId === m.id ? 'Sending…' : 'Reset password'}
                            </Button>
                          )}
                          {showOwnerActions && role === 'guardian' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateMemberRole(m.id, 'parent', m.name)}
                              disabled={isBusy}
                              title="Give this member full parent-tier permissions"
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                              {roleUpdatingId === m.id ? 'Updating…' : 'Promote to Parent'}
                            </Button>
                          )}
                          {showOwnerActions && role === 'parent' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateMemberRole(m.id, 'guardian', m.name)}
                              disabled={isBusy}
                              title="Restrict this member to guardian-tier permissions"
                            >
                              <UserX className="h-3.5 w-3.5 mr-1.5" />
                              {roleUpdatingId === m.id ? 'Updating…' : 'Demote to Guardian'}
                            </Button>
                          )}
                          {showOwnerActions && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMemberToRemove(m)}
                              disabled={isBusy}
                              className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isOwner && familyMembers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-4">
                  Only the family owner can change roles or remove members.
                  If you've forgotten your own password, sign out and use "Forgot password?" on the login screen.
                </p>
              )}

              {/* v12: Confirm-remove dialog */}
              <AlertDialog
                open={!!memberToRemove}
                onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Remove {memberToRemove?.name} from the family?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      They will lose access to this family's children, prayers, and settings.
                      Their account is preserved — they can still sign in and join another family,
                      and you can re-add them later via your invite code.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={!!removingMemberId}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => memberToRemove && handleRemoveMember(memberToRemove)}
                      disabled={!!removingMemberId}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {removingMemberId ? 'Removing…' : 'Remove member'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* v14: Role Permissions reference card. Surfaces the same matrix
              that lives in the v12 design doc so a parent can see at a glance
              who can do what without having to dig through documentation. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-500" />
                What each role can do
              </CardTitle>
              <CardDescription>
                Anyone you approve from the join queue is automatically slotted into a role
                based on how they signed up. The owner can promote or demote any member at any time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 font-medium">Action</th>
                      <th className="text-center py-2 px-2 font-medium">Owner</th>
                      <th className="text-center py-2 px-2 font-medium">Parent</th>
                      <th className="text-center py-2 px-2 font-medium">Guardian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-3">View family dashboard &amp; kids</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Mark prayers, approve behaviors, give points</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Approve / decline join requests</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                      <td className="text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Add or edit children, set rules &amp; rewards</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                      <td className="text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Reset a child's PIN</td>
                      <td className="text-center">✓</td>
                      <td className="text-center">✓</td>
                      <td className="text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Promote / demote / remove members</td>
                      <td className="text-center">✓</td>
                      <td className="text-center text-muted-foreground">—</td>
                      <td className="text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">Reset another member's password</td>
                      <td className="text-center">✓</td>
                      <td className="text-center text-muted-foreground">—</td>
                      <td className="text-center text-muted-foreground">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                <strong>How roles get assigned:</strong> the first parent to sign up becomes the
                Owner. Anyone who joins as <em>spouse</em> becomes a Parent. Anyone who joins as
                <em> nanny / teacher / other</em> becomes a Guardian. The owner can change any
                member's role from this tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                <div>
                  <CardTitle>Push Notifications</CardTitle>
                  <CardDescription>
                    Get notified when your kids log prayers, claim rewards, or reach milestones
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!pushSupported && (
                <Alert>
                  <BellOff className="h-4 w-4" />
                  <AlertTitle>Not Available</AlertTitle>
                  <AlertDescription>
                    Push notifications are only available on iOS and Android devices.
                    You're currently using a web browser.
                  </AlertDescription>
                </Alert>
              )}

              {pushSupported && loadingPushStatus && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">Checking notification status...</p>
                </div>
              )}

              {pushSupported && !loadingPushStatus && (
                <>
                  {pushPermissionStatus === 'granted' && (
                    <Alert className="border-green-200 bg-green-50">
                      <Bell className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-900">Notifications Enabled</AlertTitle>
                      <AlertDescription className="text-green-800">
                        You'll receive notifications for important family events.
                      </AlertDescription>
                    </Alert>
                  )}

                  {pushPermissionStatus === 'denied' && (
                    <Alert variant="destructive">
                      <BellOff className="h-4 w-4" />
                      <AlertTitle>Notifications Blocked</AlertTitle>
                      <AlertDescription>
                        You've blocked notifications. To enable them, please go to your device's Settings → 
                        FGS Parent → Notifications and turn them on.
                      </AlertDescription>
                    </Alert>
                  )}

                  {pushPermissionStatus === 'prompt' && (
                    <Alert>
                      <Bell className="h-4 w-4" />
                      <AlertTitle>Enable Notifications</AlertTitle>
                      <AlertDescription>
                        Get notified when your kids need your attention. We promise not to spam you!
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">You'll be notified when:</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                        Kids log prayers (need your approval)
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                        Kids claim rewards (need your approval)
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                        Someone requests to join your family
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                        Kids reach new milestones
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {pushPermissionStatus === 'prompt' && (
                      <Button onClick={handleEnablePushNotifications} className="w-full">
                        <Bell className="h-4 w-4 mr-2" />
                        Enable Notifications
                      </Button>
                    )}

                    {pushPermissionStatus === 'granted' && (
                      <Button 
                        onClick={handleDisablePushNotifications} 
                        variant="outline"
                        className="w-full"
                      >
                        <BellOff className="h-4 w-4 mr-2" />
                        Disable Notifications
                      </Button>
                    )}

                    {pushPermissionStatus === 'denied' && (
                      <Button variant="outline" className="w-full" disabled>
                        <BellOff className="h-4 w-4 mr-2" />
                        Blocked in Settings
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* REWARDS TAB */}
        <TabsContent value="rewards" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Manage Rewards
                  </CardTitle>
                  <CardDescription>Add custom rewards that your children can work towards</CardDescription>
                </div>
                <Dialog open={showRewardDialog} onOpenChange={setShowRewardDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Reward
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add New Reward</DialogTitle>
                      <DialogDescription>
                        Create a custom reward that your children can redeem with points
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="reward-name">Reward Name *</Label>
                        <Input
                          id="reward-name"
                          placeholder="e.g., New Bike, Movie Night, etc."
                          value={rewardName}
                          onChange={(e) => setRewardName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reward-description">Description (Optional)</Label>
                        <Textarea
                          id="reward-description"
                          placeholder="Additional details about this reward..."
                          value={rewardDescription}
                          onChange={(e) => setRewardDescription(e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reward-points">Point Cost *</Label>
                        <Input
                          id="reward-points"
                          type="number"
                          min="1"
                          placeholder="e.g., 100"
                          value={rewardPointCost}
                          onChange={(e) => setRewardPointCost(e.target.value)}
                        />
                        {rewardPointCost && parseInt(rewardPointCost) > 0 && (
                          <div className={`p-2 rounded-md border ${ 
                            autoCategory === 'small' ? 'bg-green-50 border-green-200' :
                            autoCategory === 'medium' ? 'bg-blue-50 border-blue-200' :
                            'bg-purple-50 border-purple-200'
                          }`}>
                            <p className="text-xs font-medium">
                              {autoCategory === 'small' && '✨ Small Reward (1-99 points)'}
                              {autoCategory === 'medium' && '🎯 Medium Reward (100-499 points)'}
                              {autoCategory === 'large' && '🏆 Large Reward (500+ points)'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Category automatically assigned based on points
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddReward} className="flex-1">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Reward
                        </Button>
                        <Button variant="outline" onClick={() => setShowRewardDialog(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Duplicate Rewards Warning */}
              {duplicateRewards.length > 0 && (
                <Alert variant="destructive" className="border-orange-500 bg-orange-50 text-orange-900">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertTitle className="text-orange-900">Duplicate Rewards Detected</AlertTitle>
                  <AlertDescription className="text-orange-800">
                    <p className="mb-2">You have duplicate rewards with the same name. This may cause confusion:</p>
                    <ul className="list-disc list-inside space-y-1 mb-3">
                      {duplicateRewards.map(dup => (
                        <li key={dup.name}>
                          <strong>{dup.name}</strong> appears {dup.count} times
                        </li>
                      ))}
                    </ul>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 bg-white border-orange-300 text-orange-900 hover:bg-orange-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          Clean Up Duplicates
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove All Duplicate Rewards?</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              This will keep one copy of each reward and delete all duplicates. This action cannot be undone.
                              <div className="mt-3 p-3 bg-gray-50 rounded-md">
                                <p className="font-semibold text-sm mb-1">Will be removed:</p>
                                <ul className="text-sm space-y-1">
                                  {duplicateRewards.map(dup => (
                                    <li key={dup.name}>
                                      • {dup.count - 1} duplicate{dup.count - 1 > 1 ? 's' : ''} of <strong>{dup.name}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleBulkDeleteDuplicateRewards} className="bg-orange-600 hover:bg-orange-700">
                            Remove Duplicates
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Small Rewards */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-600" />
                  Small Rewards
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {smallRewards.map(reward => (
                    <div key={reward.id} className="p-3 border rounded-lg flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{reward.name}</p>
                        {reward.description && (
                          <p className="text-sm text-muted-foreground truncate">{reward.description}</p>
                        )}
                        <Badge variant="secondary" className="mt-2 text-xs">{reward.pointCost} points</Badge>
                      </div>
                    </div>
                  ))}
                  {smallRewards.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2">No small rewards yet</p>
                  )}
                </div>
              </div>

              {/* Medium Rewards */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Medium Rewards
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {mediumRewards.map(reward => (
                    <div key={reward.id} className="p-3 border rounded-lg flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{reward.name}</p>
                        {reward.description && (
                          <p className="text-sm text-muted-foreground truncate">{reward.description}</p>
                        )}
                        <Badge variant="secondary" className="mt-2 text-xs">{reward.pointCost} points</Badge>
                      </div>
                    </div>
                  ))}
                  {mediumRewards.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2">No medium rewards yet</p>
                  )}
                </div>
              </div>

              {/* Large Rewards */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Large Rewards
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {largeRewards.map(reward => (
                    <div key={reward.id} className="p-3 border rounded-lg flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{reward.name}</p>
                        {reward.description && (
                          <p className="text-sm text-muted-foreground truncate">{reward.description}</p>
                        )}
                        <Badge variant="secondary" className="mt-2 text-xs">{reward.pointCost} points</Badge>
                      </div>
                    </div>
                  ))}
                  {largeRewards.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2">No large rewards yet</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BEHAVIORS TAB */}
        <TabsContent value="behaviors" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Manage Habits & Behaviors
                  </CardTitle>
                  <CardDescription>
                    Add custom habits and behaviors to track for your children
                  </CardDescription>
                </div>
                <Dialog open={showItemDialog} onOpenChange={(open) => {
                  setShowItemDialog(open);
                  if (!open) resetItemForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add Habit or Behavior</DialogTitle>
                      <DialogDescription>
                        Create a trackable habit or behavior with point values
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {showTemplates && (
                        <div className="space-y-2">
                          <Label>Quick Templates</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowTemplates(false)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Custom
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[0], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Brush Teeth
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[1], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Make Bed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[2], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Clean Room
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[3], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Read Book 15min
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[4], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Exercise
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.otherHabits[5], "habit")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Drink 8 Glasses Water
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[0], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Helped Sibling
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[1], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Did Chores Without Asking
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[2], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Shared Toys
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[3], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Said Thank You
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[4], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Cleaned Up After Self
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.positiveBehaviors[5], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Showed Kindness
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[0], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Talking Back
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[1], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Hitting/Fighting
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[2], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Lying
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[3], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Not Listening
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[4], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Whining/Complaining
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUseTemplate(templates.negativeBehaviors[5], "behavior")}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Breaking Rules
                            </Button>
                          </div>
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="item-name">Name *</Label>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowTemplates(true)}
                              className="text-xs h-auto py-1"
                            >
                              ← Back to Templates
                            </Button>
                          </div>
                          <Input
                            id="item-name"
                            placeholder="e.g., Clean Room, Study Time, etc."
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                          />
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="space-y-2">
                          <Label htmlFor="item-type">Type *</Label>
                          <Select value={itemType} onValueChange={(value: any) => setItemType(value)}>
                            <SelectTrigger id="item-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="habit">Habit (Regular activity)</SelectItem>
                              <SelectItem value="behavior">Behavior (One-time action)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="space-y-2">
                          <Label htmlFor="item-category">Category</Label>
                          <Select value={itemCategory} onValueChange={setItemCategory}>
                            <SelectTrigger id="item-category">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="salah">Salah</SelectItem>
                              <SelectItem value="quran">Quran</SelectItem>
                              <SelectItem value="homework">Homework</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="space-y-2">
                          <Label htmlFor="item-points">Points *</Label>
                          <Input
                            id="item-points"
                            type="number"
                            placeholder="Positive for good, negative for bad (e.g., 5 or -3)"
                            value={itemPoints}
                            onChange={(e) => setItemPoints(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter positive points for rewards, negative for penalties
                          </p>
                        </div>
                      )}
                      {!showTemplates && itemPoints && parseInt(itemPoints) < 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="item-tier">Severity Tier</Label>
                          <Select value={itemTier} onValueChange={(value: any) => setItemTier(value)}>
                            <SelectTrigger id="item-tier">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minor">🟢 Minor</SelectItem>
                              <SelectItem value="moderate">🟡 Moderate</SelectItem>
                              <SelectItem value="major">🔴 Major</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {!showTemplates && itemType === 'behavior' && (
                        <div className="space-y-2">
                          <Label htmlFor="item-dedupe">Dedupe Window (minutes)</Label>
                          <Input
                            id="item-dedupe"
                            type="number"
                            min="1"
                            placeholder="e.g., 15"
                            value={itemDedupeWindow}
                            onChange={(e) => setItemDedupeWindow(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Prevents duplicate logging within this time window
                          </p>
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="item-religious"
                            checked={itemIsReligious}
                            onChange={(e) => setItemIsReligious(e.target.checked)}
                            className="rounded"
                          />
                          <Label htmlFor="item-religious" className="cursor-pointer">
                            Religious activity (positive reinforcement only)
                          </Label>
                        </div>
                      )}
                      {!showTemplates && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="item-singleton"
                            checked={itemIsSingleton}
                            onChange={(e) => setItemIsSingleton(e.target.checked)}
                            className="rounded"
                          />
                          <Label htmlFor="item-singleton" className="cursor-pointer">
                            Singleton (only one instance per day)
                          </Label>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={handleAddItem} className="flex-1">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Item
                        </Button>
                        <Button variant="outline" onClick={() => setShowItemDialog(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Salah */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  🕌 Salah (5 Daily Prayers)
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Configure how Salah tracking affects your child's emotional and spiritual growth
                </p>
                <div className="grid gap-3">
                  {salahItems.map(item => (
                    <Card key={item.id} className="border-l-4 border-l-green-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            <Badge variant="secondary" className="bg-green-100">+{item.points}</Badge>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-sm">Religious Sensitivity Mode</Label>
                          <Select
                            value={item.religiousGuardrailMode || 'full-tracking'}
                            onValueChange={async (value) => {
                              // Persist the new guardrail mode via the trackable-items PATCH endpoint.
                              // The hook updates local state optimistically and rolls back on failure.
                              try {
                                await updateTrackableItem(item.id, {
                                  religiousGuardrailMode: value as
                                    | 'positive-only'
                                    | 'streak-only'
                                    | 'full-tracking'
                                    | 'disabled',
                                });
                                toast.success(`Updated ${item.name} sensitivity mode`);
                              } catch (err) {
                                toast.error(`Couldn't update ${item.name}. Please try again.`);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="positive-only">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">✨ Positive Only</span>
                                  <span className="text-xs text-muted-foreground">Only track when prayed (no negatives)</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="streak-only">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">🔥 Streak Only</span>
                                  <span className="text-xs text-muted-foreground">Build streaks, no point deductions</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="full-tracking">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">📊 Full Tracking</span>
                                  <span className="text-xs text-muted-foreground">Track positive + negative (use with care)</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="disabled">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">🔇 Disabled</span>
                                  <span className="text-xs text-muted-foreground">Don't track this prayer</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <div className="p-2 bg-amber-50 rounded-md border border-amber-200">
                            <p className="text-xs text-amber-900">
                              {item.religiousGuardrailMode === 'positive-only' && (
                                <span>✨ Children can only earn points for praying. Missing prayer won't lose points - preventing spiritual transactionalization.</span>
                              )}
                              {item.religiousGuardrailMode === 'streak-only' && (
                                <span>🔥 Builds consistency through streaks without financial incentives. Pure habit building.</span>
                              )}
                              {item.religiousGuardrailMode === 'full-tracking' && (
                                <span>⚠️ Full tracking enabled. Use carefully - missing Salah will result in point loss.</span>
                              )}
                              {item.religiousGuardrailMode === 'disabled' && (
                                <span>🔇 This prayer is not being tracked in the system.</span>
                              )}
                              {!item.religiousGuardrailMode && (
                                <span>📊 Default mode: Full tracking with positive and negative events.</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {salahItems.length === 0 && (
                    <p className="text-sm text-muted-foreground">No salah items configured</p>
                  )}
                </div>
              </div>

              {/* Other Habits */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Other Habits
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {otherHabits.map(item => (
                    <div key={item.id} className="p-3 border rounded-lg">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <Badge variant="secondary" className="mt-1 text-xs bg-green-100">+{item.points}</Badge>
                    </div>
                  ))}
                  {otherHabits.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-3">No additional habits yet</p>
                  )}
                </div>
              </div>

              {/* Positive Behaviors */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Positive Behaviors
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {positiveBehaviors.map(item => (
                    <div key={item.id} className="p-3 border rounded-lg">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <Badge variant="secondary" className="mt-1 text-xs bg-green-100">+{item.points}</Badge>
                    </div>
                  ))}
                  {positiveBehaviors.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-3">No positive behaviors yet</p>
                  )}
                </div>
              </div>

              {/* Negative Behaviors */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Negative Behaviors
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {negativeBehaviors.map(item => (
                    <div key={item.id} className="p-3 border rounded-lg">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs bg-red-100">{item.points}</Badge>
                        {item.tier && (
                          <span className="text-xs">
                            {item.tier === 'minor' && '🟢'}
                            {item.tier === 'moderate' && '🟡'}
                            {item.tier === 'major' && '🔴'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {negativeBehaviors.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-3">No negative behaviors yet</p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Add custom behaviors based on what you want to encourage or discourage in your children. 
                  For example, add "Responsibility" as a positive behavior if that's what you're focusing on this month!
                </p>
              </div>

              {/* System Maintenance */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <p className="text-sm font-semibold text-amber-900">System Maintenance</p>
                    </div>
                    <p className="text-xs text-amber-800">
                      If you're seeing duplicate prayers (e.g., Fajr appearing multiple times), click this button to clean up the database.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDedupeItems}
                    disabled={dedupeLoading}
                    className="shrink-0"
                  >
                    {dedupeLoading ? "Cleaning..." : "Remove Duplicates"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUESTS TAB */}
        <TabsContent value="quests" className="space-y-4">
          <QuestSettings 
            familyId={familyId} 
            accessToken={accessToken}
            compact={false}
          />

          {/* Info Card */}
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-purple-900 mb-1">How Quests Work</h3>
                  <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
                    <li>Quests are automatically generated based on your configured behaviors</li>
                    <li>Kids can accept quests to earn <strong>bonus points</strong> on top of regular behavior points</li>
                    <li>Daily quests reset every day, weekly quests reset every week</li>
                    <li>Quest difficulty affects the bonus points awarded (Easy/Medium/Hard)</li>
                    <li>Kids see available quests on their Challenges page</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GAMES TAB */}
        <TabsContent value="games" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5" />
                Game Settings
              </CardTitle>
              <CardDescription>Control which educational games are visible to kids</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Game Toggles */}
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Brain className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-indigo-900 mb-1">Knowledge Quest</h4>
                        <p className="text-sm text-indigo-800 mb-2">
                          Dynamic quiz platform with Islamic knowledge, math, and more. Kids can select difficulty levels, use hints, and earn points.
                        </p>
                        <p className="text-xs text-indigo-700">
                          <strong>Points:</strong> Easy (5 pts → 0.25 actual), Medium (10 pts → 0.5 actual), Hard (20 pts → 1 actual). 5% conversion rate to keep focus on core behaviors like prayers (5 pts each).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor="knowledge-quest-toggle" className="cursor-pointer text-sm">
                        {knowledgeQuestEnabled ? 'Enabled' : 'Disabled'}
                      </Label>
                      <Switch
                        id="knowledge-quest-toggle"
                        checked={knowledgeQuestEnabled}
                        onCheckedChange={setKnowledgeQuestEnabled}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSaveGameSettings}
                  disabled={gameSettingsLoading}
                  className="min-w-32"
                >
                  {gameSettingsLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Game Settings'
                  )}
                </Button>
              </div>

              {/* Info Box */}
              <Alert>
                <AlertDescription>
                  <p className="text-sm font-semibold mb-2">💡 Why disable games?</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Questions can be repeated as kids play multiple times</li>
                    <li>• Games are always available, making them potentially distracting</li>
                    <li>• Some families prefer to focus purely on real-world behaviors</li>
                    <li>• Disabling removes them from the Kid Dashboard completely</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MILESTONES TAB */}
        <TabsContent value="milestones" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Manage Milestones
                  </CardTitle>
                  <CardDescription>Set achievement milestones for children to reach</CardDescription>
                </div>
                <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Milestone
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add New Milestone</DialogTitle>
                      <DialogDescription>
                        Create an achievement milestone for your children
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="milestone-name">Milestone Name *</Label>
                        <Input
                          id="milestone-name"
                          placeholder="e.g., Super Star, Ultimate Champion, etc."
                          value={milestoneName}
                          onChange={(e) => setMilestoneName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="milestone-points">Points Required *</Label>
                        <Input
                          id="milestone-points"
                          type="number"
                          min="1"
                          placeholder="e.g., 750"
                          value={milestonePoints}
                          onChange={(e) => setMilestonePoints(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddMilestone} className="flex-1">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Milestone
                        </Button>
                        <Button variant="outline" onClick={() => setShowMilestoneDialog(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Duplicate Milestones Warning */}
              {duplicateMilestones.length > 0 && (
                <Alert variant="destructive" className="border-orange-500 bg-orange-50 text-orange-900">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertTitle className="text-orange-900">Duplicate Milestones Detected</AlertTitle>
                  <AlertDescription className="text-orange-800">
                    <p className="mb-2">You have duplicate milestones with the same name. This may cause confusion:</p>
                    <ul className="list-disc list-inside space-y-1 mb-3">
                      {duplicateMilestones.map(dup => (
                        <li key={dup.name}>
                          <strong>{dup.name}</strong> appears {dup.count} times
                        </li>
                      ))}
                    </ul>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 bg-white border-orange-300 text-orange-900 hover:bg-orange-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          Clean Up Duplicates
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove All Duplicate Milestones?</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              This will keep one copy of each milestone and delete all duplicates. This action cannot be undone.
                              <div className="mt-3 p-3 bg-gray-50 rounded-md">
                                <p className="font-semibold text-sm mb-1">Will be removed:</p>
                                <ul className="text-sm space-y-1">
                                  {duplicateMilestones.map(dup => (
                                    <li key={dup.name}>
                                      • {dup.count - 1} duplicate{dup.count - 1 > 1 ? 's' : ''} of <strong>{dup.name}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleBulkDeleteDuplicateMilestones} className="bg-orange-600 hover:bg-orange-700">
                            Remove Duplicates
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {milestones.map(milestone => (
                  <div key={milestone.id} className="p-4 border rounded-lg text-center bg-gradient-to-br from-yellow-50 to-orange-50">
                    <Award className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
                    <p className="font-semibold text-sm">{milestone.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{milestone.points} points</p>
                  </div>
                ))}
                {milestones.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-4">No milestones configured yet</p>
                )}
              </div>

              <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-800">
                  <strong>🎯 Strategy:</strong> Create milestones at different point levels to give children 
                  short-term and long-term goals. This keeps them motivated throughout their journey!
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DANGER ZONE TAB */}
        <TabsContent value="danger" className="space-y-4">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <div>
                  <CardTitle className="text-red-900">Danger Zone</CardTitle>
                  <CardDescription className="text-red-700">
                    Irreversible actions that will permanently delete data
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Delete Account Section */}
              <div className="border-2 border-red-300 rounded-lg p-6 bg-white">
                <div className="flex items-start gap-4">
                  <Trash2 className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-red-900 text-lg">Delete Your Account</h3>
                      <p className="text-sm text-red-700 mt-1">
                        Once you delete your account, there is no going back. This action cannot be undone.
                      </p>
                    </div>

                    <Alert className="bg-amber-50 border-amber-300">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-900">What will be deleted?</AlertTitle>
                      <AlertDescription className="text-amber-800 text-sm space-y-2">
                        {family && family.parentIds && family.parentIds.length === 1 ? (
                          // Sole parent
                          <>
                            <p className="font-semibold">⚠️ You are the only parent in this family.</p>
                            <p>Deleting your account will delete:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>Your entire family ({family.name})</li>
                              <li>All children in the family ({children.length} {children.length === 1 ? 'child' : 'children'})</li>
                              <li>All habits, behaviors, rewards, and milestones</li>
                              <li>All activity logs and progress data</li>
                              <li>All prayer claims and wishlist items</li>
                              <li>All custom quests and settings</li>
                            </ul>
                            <p className="font-semibold text-red-600 mt-2">
                              This will permanently delete everything for your entire family.
                            </p>
                          </>
                        ) : (
                          // Dual parent
                          <>
                            <p>Since another parent exists in your family, deleting your account will:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>Remove ONLY your account</li>
                              <li>Preserve the family and all children</li>
                              <li>Preserve all family data (habits, rewards, logs, etc.)</li>
                              <li>The other parent will retain full access</li>
                            </ul>
                            <p className="font-semibold text-blue-600 mt-2">
                              Your family data will be preserved for the other parent.
                            </p>
                          </>
                        )}
                      </AlertDescription>
                    </Alert>

                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete My Account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Permanently Delete Account?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-4">
                            <p className="text-red-600 font-semibold">
                              This action cannot be undone. This will permanently delete your account
                              {family && family.parentIds && family.parentIds.length === 1
                                ? ' and your entire family with all data.'
                                : ', but your family will be preserved for the other parent.'}
                            </p>

                            <div className="space-y-3">
                              <div>
                                <Label htmlFor="delete-confirm" className="text-sm font-medium">
                                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                                </Label>
                                <Input
                                  id="delete-confirm"
                                  value={deleteConfirmText}
                                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                                  placeholder="Type DELETE here"
                                  className="mt-1"
                                  autoComplete="off"
                                />
                              </div>

                              <div>
                                <Label htmlFor="delete-password" className="text-sm font-medium">
                                  Enter your password to confirm
                                </Label>
                                <Input
                                  id="delete-password"
                                  type="password"
                                  value={deletePassword}
                                  onChange={(e) => setDeletePassword(e.target.value)}
                                  placeholder="Your password"
                                  className="mt-1"
                                  autoComplete="current-password"
                                />
                              </div>
                            </div>

                            <Alert className="bg-red-50 border-red-300">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-red-800 text-xs">
                                <strong>Final warning:</strong> All data will be permanently deleted from our servers.
                                You will be immediately logged out and cannot recover this account.
                              </AlertDescription>
                            </Alert>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => {
                              setDeletePassword("");
                              setDeleteConfirmText("");
                            }}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteAccount();
                            }}
                            disabled={isDeletingAccount || deleteConfirmText !== 'DELETE' || !deletePassword}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isDeletingAccount ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                Deleting...
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Account Permanently
                              </>
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>

              {/* Info about data privacy */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">🔒 Your Data Privacy</h4>
                <p className="text-sm text-blue-800">
                  We respect your right to delete your data. When you delete your account:
                </p>
                <ul className="text-sm text-blue-800 list-disc list-inside mt-2 space-y-1">
                  <li>All personal information is permanently removed from our servers</li>
                  <li>Your data cannot be recovered after deletion</li>
                  <li>We do not retain any copies or backups of deleted accounts</li>
                  <li>Deletion happens immediately upon confirmation</li>
                </ul>
              </div>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}