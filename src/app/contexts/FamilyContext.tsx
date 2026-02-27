import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Child, PointEvent, AttendanceRecord } from '../data/mockData';
import { 
  getChildren, 
  getChildEvents, 
  getChildAttendance, 
  logPointEvent, 
  createAttendance,
  updateChild,
  getFamily
} from '../../utils/api';
import { AuthContext } from './AuthContext';
import { getCurrentRole } from '../utils/authHelpers';
import { supabase } from '../../../utils/supabase/client';
import { projectId } from '../../../utils/supabase/info';

interface Family {
  id: string;
  name: string;
  parentIds: string[];
  inviteCode?: string;
  createdAt: string;
  timezone?: string; // IANA timezone (e.g., 'America/Toronto', 'Asia/Dubai')
}

interface FamilyContextType {
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null) => void;
  children: Child[];
  pointEvents: PointEvent[];
  attendanceRecords: AttendanceRecord[];
  addPointEvent: (event: Omit<PointEvent, 'id' | 'timestamp'>) => Promise<void>;
  addAdjustment: (childId: string, points: number, reason: string) => Promise<void>;
  submitRecovery: (childId: string, negativeEventId: string, recoveryAction: 'apology' | 'reflection' | 'correction', recoveryNotes: string) => Promise<void>;
  addAttendance: (record: Omit<AttendanceRecord, 'id' | 'timestamp'>) => Promise<void>;
  updateChildPoints: (childId: string, points: number) => Promise<void>;
  getCurrentChild: () => Child | undefined;
  familyId: string | null;
  family: Family | null;
  setFamilyId: (id: string) => void;
  loadFamilyData: () => Promise<void>;
  loading: boolean;
}

export const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children: reactChildren }: { children: ReactNode }) {
  // Safely access auth context
  const authContext = useContext(AuthContext);
  
  // CRITICAL: In kid mode, get token from localStorage instead of AuthContext
  const accessToken = (() => {
    const authToken = authContext?.accessToken;
    if (authToken) return authToken;
    
    // Check if we're in kid mode
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    
    if (userRole === 'child' || userMode === 'kid') {
      const kidToken = localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
      if (kidToken) {
        console.log('👶 FamilyContext: Using kid token from localStorage');
        return kidToken;
      }
    }
    
    return null;
  })();

  console.log('🏗️ FamilyProvider rendering:', { 
    hasAuthContext: !!authContext, 
    hasAccessToken: !!accessToken 
  });

  const [familyId, setFamilyIdState] = useState<string | null>(() => {
    // Try to load from localStorage
    const storedFamilyId = localStorage.getItem('fgs_family_id');
    console.log('🔍 FamilyContext: Initial familyId from localStorage:', storedFamilyId);
    return storedFamilyId;
  });
  
  const [family, setFamily] = useState<Family | null>(null);
  
  const setFamilyId = (id: string) => {
    console.log('FamilyContext - Setting familyId:', id);
    setFamilyIdState(id);
    localStorage.setItem('fgs_family_id', id);
  };
  
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(() => {
    // CRITICAL: Check if we're in kid mode first
    const currentRole = getCurrentRole();
    console.log('🔍 Initializing selectedChildId:', { currentRole });
    
    if (currentRole === 'child') {
      // In kid mode, auto-select the logged-in kid
      const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
      if (kidId) {
        console.log('✅ Kid mode - auto-selected child:', kidId);
        return kidId;
      }
    }
    
    if (currentRole === 'parent') {
      // FIXED: Don't clear selection on init - let it restore from localStorage
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      console.log('✅ Parent mode - initialized selectedChildId from localStorage:', storedChildId);
      return storedChildId;
    }
    
    // In child/unknown mode, could load from localStorage if needed
    console.log('✅ Child/unknown mode - initialized selectedChildId to null');
    return null;
  });
  
  // CRITICAL: Watch for kid login and auto-select the kid
  // This useEffect is triggered when accessToken changes (e.g., when kid logs in)
  // It ensures familyId and selectedChildId are properly set from localStorage
  useEffect(() => {
    const currentRole = getCurrentRole();
    
    if (currentRole === 'child') {
      const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
      
      if (kidId && kidId !== selectedChildId) {
        console.log('👶 Kid logged in, auto-selecting child:', kidId);
        setSelectedChildIdState(kidId);
      }
      
      // CRITICAL: Also load family ID when kid logs in
      // This is necessary because familyId state is initialized only once at mount,
      // but kid login happens after mount, so we need to update it here
      const storedFamilyId = localStorage.getItem('fgs_family_id');
      if (storedFamilyId && storedFamilyId !== familyId) {
        console.log('👶 Kid logged in, loading family ID from localStorage:', storedFamilyId);
        setFamilyIdState(storedFamilyId);
        // Note: Setting familyId will trigger the other useEffect to call loadFamilyData
      } else if (!storedFamilyId) {
        console.error('❌ CRITICAL: Kid logged in but fgs_family_id is missing from localStorage!');
        console.error('This will prevent FamilyContext from loading children data.');
        console.error('Verify that setKidMode() is setting fgs_family_id correctly.');
      }
    }
    // REMOVED: Don't clear selection when switching to parent mode - let ChildSelector handle it
  }, [accessToken]); // Only depend on accessToken to avoid loops
  
  const [children, setChildren] = useState<Child[]>([]);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Wrapper for setSelectedChildId that also clears when switching to parent mode
  const setSelectedChildId = (id: string | null) => {
    console.log('FamilyContext - Setting selectedChildId:', id);
    setSelectedChildIdState(id);
    
    // ✅ SEL-003: Update localStorage for persistence
    if (id) {
      localStorage.setItem('fgs_selected_child_id', id);
    } else {
      localStorage.removeItem('fgs_selected_child_id');
    }
  };

  // ✅ SEL-003: Restore selection from localStorage on mount (parent mode only)
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole === 'parent' && !selectedChildId && children.length > 0) {
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      if (storedChildId) {
        // Verify the child still exists
        const childExists = children.some(c => c.id === storedChildId);
        if (childExists) {
          console.log('✅ SEL-003: Restored child selection from localStorage:', storedChildId);
          setSelectedChildIdState(storedChildId);
        } else {
          console.log('⚠️ SEL-003: Stored child no longer exists, clearing localStorage');
          localStorage.removeItem('fgs_selected_child_id');
        }
      }
    }
  }, [children, selectedChildId]);

  // ✅ SEL-004: Handle 1→2+ children transition
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole === 'parent') {
      // If we had 1 child auto-selected, and now have 2+, keep the selection
      if (children.length >= 2 && selectedChildId) {
        // Verify current selection is still valid
        const childExists = children.some(c => c.id === selectedChildId);
        if (childExists) {
          console.log('✅ SEL-004: Keeping selection after 1→2+ transition:', selectedChildId);
          // Keep the current selection
        } else {
          console.log('⚠️ SEL-004: Current selection invalid, clearing');
          setSelectedChildIdState(null);
          localStorage.removeItem('fgs_selected_child_id');
        }
      }
    }
  }, [children.length, selectedChildId]);

  // Load family data from API
  const loadFamilyData = useCallback(async () => {
    if (!familyId) return;
    
    setLoading(true);
    try {
      // CRITICAL FIX: Refresh session before making API calls to avoid stale tokens
      console.log('🔄 Refreshing session before loading family data...');
      
      // Check if we're in kid mode
      const currentRole = getCurrentRole();
      
      if (currentRole === 'child') {
        // KID MODE: Don't call parent APIs, just load the logged-in kid's data
        console.log('👶 Kid mode detected - loading single child data from backend');
        
        const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
        const kidSessionToken = localStorage.getItem('kid_session_token');
        
        if (kidId && kidSessionToken) {
          try {
            // Fetch the actual child data from backend to get current points
            // Note: kidId already includes the "child:" prefix
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${kidId}`,
              {
                headers: {
                  'Authorization': `Bearer ${kidSessionToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            if (response.ok) {
              const childData = await response.json();
              console.log('✅ Kid child data loaded from backend:', childData);
              setChildren([childData]);
            } else {
              const errorText = await response.text();
              console.error('❌ Failed to fetch kid data from backend:', response.status, response.statusText, errorText);
              
              // If 401 Unauthorized, kid session has expired - clear session and redirect to login
              if (response.status === 401) {
                console.warn('🔐 Kid session expired, clearing session and redirecting to login');
                localStorage.removeItem('kid_access_token');
                localStorage.removeItem('kid_session_token');
                localStorage.removeItem('kid_token_expires_at');
                localStorage.removeItem('kid_id');
                localStorage.removeItem('kid_name');
                localStorage.removeItem('kid_avatar');
                localStorage.removeItem('kid_family_id');
                window.location.href = '/'; // Redirect to home/login
                return;
              }
              
              // Fallback to localStorage data with 0 points for other errors
              const kidName = localStorage.getItem('kid_name');
              const kidAvatar = localStorage.getItem('kid_avatar');
              const kidChild = {
                id: kidId,
                name: kidName || 'Kid',
                pin: '',
                avatar: kidAvatar || '👶',
                currentPoints: 0,
                targetRewardId: null,
                highestMilestone: 0,
                familyId: familyId,
                createdAt: new Date().toISOString(),
                streaks: {}
              };
              console.log('⚠️ Using fallback kid child data:', kidChild);
              setChildren([kidChild]);
            }
          } catch (error) {
            console.error('❌ Error fetching kid data:', error);
            // Fallback to localStorage data with 0 points
            const kidName = localStorage.getItem('kid_name');
            const kidAvatar = localStorage.getItem('kid_avatar');
            const kidChild = {
              id: kidId,
              name: kidName || 'Kid',
              pin: '',
              avatar: kidAvatar || '👶',
              currentPoints: 0,
              targetRewardId: null,
              highestMilestone: 0,
              familyId: familyId,
              createdAt: new Date().toISOString(),
              streaks: {}
            };
            console.log('⚠️ Using fallback kid child data after error:', kidChild);
            setChildren([kidChild]);
          }
        } else {
          console.error('❌ Kid data missing from localStorage:', { kidId, hasSessionToken: !!kidSessionToken });
        }
        
        setLoading(false);
        return;
      }
      
      // PARENT MODE: Continue with normal flow
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.getSession();
      
      if (refreshError || !refreshedSession?.access_token) {
        // Only log as error if there was an actual error (not just "no session")
        if (refreshError) {
          console.error('❌ Session refresh failed:', refreshError);
        } else {
          console.log('ℹ️ No active session - user needs to log in');
        }
        
        // Check if user account was deleted
        if (refreshError?.message?.includes('user_not_found') || 
            refreshError?.message?.includes('User from sub claim in JWT does not exist')) {
          console.error('🚨 CRITICAL: User account deleted but session still exists!');
          console.log('🔄 Auto-clearing invalid session...');
          
          // Clear all session data
          await supabase.auth.signOut();
          localStorage.removeItem('user_role');
          localStorage.removeItem('user_mode');
          localStorage.removeItem('fgs_family_id');
          localStorage.removeItem('fgs_selected_child_id');
          localStorage.removeItem('kid_access_token');
          localStorage.removeItem('kid_session_token');
          
          // Clear all Supabase session keys
          const allKeys = Object.keys(localStorage);
          const supabaseKeys = allKeys.filter(key => 
            key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token')
          );
          supabaseKeys.forEach(key => localStorage.removeItem(key));
          
          console.log('✅ Invalid session cleared. Redirecting to login...');
          window.location.href = '/login';
          return;
        }
        
        // Session expired - user needs to log in again
        if (refreshError?.message?.includes('refresh_token_not_found')) {
          console.log('ℹ️ Session expired - user needs to log in again');
          // Don't redirect here - let the auth flow handle it
          setLoading(false);
          return;
        }
        
        // No session at all - just return without error
        if (!refreshedSession) {
          console.log('ℹ️ No session found - user is logged out');
          setLoading(false);
          return;
        }
      } else {
        console.log('✅ Session refreshed successfully');
      }
      
      // Fetch family data (includes invite code)
      console.log('📡 Fetching family data for familyId:', familyId);
      const familyData = await getFamily(familyId);
      console.log('✅ Family data fetched:', familyData);
      setFamily(familyData);
      
      console.log('📡 Fetching children for familyId:', familyId);
      console.log('🔍 About to call getChildren API...');
      const childrenData = await getChildren(familyId);
      console.log('✅ Children fetched successfully:', childrenData.length, 'children');
      console.log('👶 Children data:', childrenData);
      setChildren(childrenData);
    } catch (error: any) {
      console.error('Error loading family data:', error);
      
      // Handle specific error cases
      const errorMessage = error?.message || String(error);
      
      // Access denied - user is not a member of this family
      if (errorMessage.includes('Access denied') || errorMessage.includes('403')) {
        console.error('🚨 CRITICAL: User does not have access to family:', familyId);
        console.log('🔄 Clearing stale family ID and session data...');
        
        // Clear family-related data
        localStorage.removeItem('fgs_family_id');
        localStorage.removeItem('fgs_selected_child_id');
        setFamilyIdState(null);
        setFamily(null);
        setChildren([]);
        
        console.log('✅ Stale family data cleared. User needs to create/join a family.');
        
        // Redirect to appropriate page based on user role
        const userRole = getCurrentRole();
        if (userRole === 'child') {
          console.log('📍 Redirecting to kid login (session invalid)');
          window.location.href = '/kid/login';
        } else {
          console.log('📍 Redirecting to onboarding (no family access)');
          window.location.href = '/onboarding';
        }
        return;
      }
      
      // Family not found
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        console.error('🚨 CRITICAL: Family does not exist:', familyId);
        console.log('🔄 Clearing stale family ID...');
        
        localStorage.removeItem('fgs_family_id');
        localStorage.removeItem('fgs_selected_child_id');
        setFamilyIdState(null);
        setFamily(null);
        setChildren([]);
        
        console.log('✅ Stale family data cleared. User needs to create/join a family.');
        window.location.href = '/onboarding';
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [familyId, accessToken]); // Removed selectedChildId from dependencies to avoid infinite loop

  // Load child-specific data when child is selected
  useEffect(() => {
    if (!selectedChildId) return;
    if (!accessToken) return; // Don't load without token

    // CRITICAL: Immediate role check - bail out if parent mode without explicit selection
    // This must happen BEFORE any other checks to prevent race conditions
    const currentRole = getCurrentRole();
    
    console.log('🔍 Child data load check (immediate):', {
      selectedChildId,
      currentRole,
      willCheck: true
    });
    
    // CRITICAL DEFENSIVE CHECK: If role is null or parent, be extremely cautious
    if (currentRole !== 'child') {
      console.log('⚠️ Not in child mode - checking for explicit parent selection');
      
      // If not in child mode, we must have explicit parent selection
      const storedChildId = localStorage.getItem('fgs_selected_child_id');
      
      if (!storedChildId || storedChildId !== selectedChildId) {
        console.log('🚫 BLOCKING child data load - not in child mode and no explicit selection:', {
          selectedChildId,
          storedChildId,
          currentRole,
          blocking: true
        });
        
        // Clear the stale selectedChildId from state
        console.log('🧹 Clearing stale selectedChildId');
        setSelectedChildIdState(null);
        
        // CRITICAL: Bail out immediately - do NOT proceed with data loading
        return;
      }
      
      console.log('✅ Parent mode with explicit selection - proceeding with load');
    } else {
      // In kid mode, always proceed with load
      console.log('✅ Kid mode - proceeding with load');
    }

    const loadChildData = async () => {
      try {
        console.log('📊 Loading child data for:', selectedChildId);
        const [events, attendance] = await Promise.all([
          getChildEvents(selectedChildId),
          getChildAttendance(selectedChildId)
        ]);
        
        setPointEvents(events);
        setAttendanceRecords(attendance);
        console.log('✅ Child data loaded successfully');
      } catch (error) {
        console.error('Error loading child data:', error);
        // Clear selectedChildId on error to prevent retry loops
        setSelectedChildIdState(null);
      }
    };

    loadChildData();
  }, [selectedChildId, accessToken]);

  // Load family data when familyId or accessToken changes
  useEffect(() => {
    console.log('🔄 FamilyContext useEffect triggered:', { 
      familyId, 
      hasAccessToken: !!accessToken,
      tokenPreview: accessToken ? accessToken.substring(0, 30) + '...' : 'null'
    });
    
    if (familyId) {
      localStorage.setItem('fgs_family_id', familyId);
      loadFamilyData();
    }
  }, [familyId, accessToken, loadFamilyData]);

  // POLLING: In kid mode, periodically refresh child data to get updated points
  useEffect(() => {
    const currentRole = getCurrentRole();
    
    if (currentRole === 'child' && familyId) {
      console.log('👶 Setting up polling for kid mode child data refresh (every 30 seconds)');
      
      const pollInterval = setInterval(() => {
        console.log('🔄 Polling: Refreshing kid child data...');
        loadFamilyData();
      }, 30000); // Refresh every 30 seconds
      
      return () => {
        console.log('🛑 Clearing kid mode polling interval');
        clearInterval(pollInterval);
      };
    }
  }, [familyId, loadFamilyData]);

  // Listen for roleChanged event to reload family data after parent login
  useEffect(() => {
    const handleRoleChange = () => {
      console.log('🔄 Role changed, checking if we need to reload family data...');
      const currentRole = getCurrentRole();
      const storedFamilyId = localStorage.getItem('fgs_family_id');
      
      if (currentRole === 'parent' && storedFamilyId) {
        console.log('👨‍👩‍👧‍👦 Parent logged in, updating familyId and loading family data:', storedFamilyId);
        // Update familyId state if it changed
        if (storedFamilyId !== familyId) {
          setFamilyIdState(storedFamilyId);
        } else {
          // Even if familyId is the same, reload the data
          loadFamilyData();
        }
      }
    };

    window.addEventListener('roleChanged', handleRoleChange);
    return () => window.removeEventListener('roleChanged', handleRoleChange);
  }, [familyId, loadFamilyData]);

  const addPointEvent = async (event: Omit<PointEvent, 'id' | 'timestamp'>) => {
    try {
      const newEvent = await logPointEvent(event);
      setPointEvents(prev => [newEvent, ...prev]);
      
      // Update local child state
      setChildren(prev => prev.map(child => {
        if (child.id === event.childId) {
          const newPoints = child.currentPoints + event.points;
          return {
            ...child,
            currentPoints: newPoints,
            highestMilestone: Math.max(child.highestMilestone, newPoints)
          };
        }
        return child;
      }));
    } catch (error) {
      console.error('Error adding point event:', error);
      throw error;
    }
  };

  const addAdjustment = async (childId: string, points: number, reason: string) => {
    const adjustment = {
      childId,
      trackableItemId: 'adjustment',
      points,
      loggedBy: 'parent', // Simplified - in real auth, use authenticated user ID
      isAdjustment: true,
      adjustmentReason: reason
    };
    
    await addPointEvent(adjustment);
  };

  const submitRecovery = async (
    childId: string,
    negativeEventId: string,
    recoveryAction: 'apology' | 'reflection' | 'correction',
    recoveryNotes: string
  ) => {
    const recoveryPoints = {
      'apology': 2,
      'reflection': 3,
      'correction': 5
    };

    const recovery = {
      childId,
      trackableItemId: 'recovery',
      points: recoveryPoints[recoveryAction],
      loggedBy: 'child', // Child-initiated
      isRecovery: true,
      recoveryFromEventId: negativeEventId,
      recoveryAction,
      recoveryNotes,
      notes: `Recovery: ${recoveryAction} - ${recoveryNotes}`
    };
    
    await addPointEvent(recovery);
  };

  const updateChildPoints = async (childId: string, points: number) => {
    const child = children.find(c => c.id === childId);
    if (!child) return;

    const newPoints = child.currentPoints + points;
    const newHighest = Math.max(child.highestMilestone, newPoints);

    try {
      await updateChild(childId, {
        currentPoints: newPoints,
        highestMilestone: newHighest
      });

      setChildren(prev => prev.map(c => 
        c.id === childId 
          ? { ...c, currentPoints: newPoints, highestMilestone: newHighest }
          : c
      ));
    } catch (error) {
      console.error('Error updating child points:', error);
      throw error;
    }
  };

  const addAttendance = async (record: Omit<AttendanceRecord, 'id' | 'timestamp'>) => {
    try {
      const newRecord = await createAttendance(record);
      setAttendanceRecords(prev => [newRecord, ...prev]);
    } catch (error) {
      console.error('Error adding attendance:', error);
      throw error;
    }
  };

  const getCurrentChild = () => {
    const child = children.find(c => c.id === selectedChildId);
    
    // Only log if there's an issue AND we're not currently loading data
    // (During loading, it's normal for children array to be empty)
    if (!child && selectedChildId && !loading && children.length === 0) {
      console.warn('⚠️ getCurrentChild: Child not found after data load:', {
        selectedChildId,
        childrenCount: children.length,
        loading,
        allChildrenIds: children.map(c => c.id)
      });
    }
    
    return child;
  };

  return (
    <FamilyContext.Provider
      value={{
        selectedChildId,
        setSelectedChildId,
        children,
        pointEvents,
        attendanceRecords,
        addPointEvent,
        addAdjustment,
        submitRecovery,
        addAttendance,
        updateChildPoints,
        getCurrentChild,
        familyId,
        family,
        setFamilyId,
        loadFamilyData,
        loading
      }}
    >
      {reactChildren}
    </FamilyContext.Provider>
  );
}

export function useFamilyContext() {
  const context = useContext(FamilyContext);
  if (!context) {
    // More helpful error with debugging info
    console.error('❌ useFamilyContext called outside FamilyProvider!', {
      location: new Error().stack,
      hasAuthProvider: !!useContext(AuthContext),
    });
    throw new Error('useFamilyContext must be used within FamilyProvider');
  }
  return context;
}

// Export alias for consistency
export const useFamily = useFamilyContext;