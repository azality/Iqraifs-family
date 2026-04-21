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
import { getCurrentRole, getCurrentRoleSync } from '../utils/authHelpers';
import { supabase } from '../../../utils/supabase/client';
import { projectId } from '../../../utils/supabase/info';
import { getStorageSync, setStorageSync, removeStorageSync } from '../../utils/storage';
import { logoutKid } from '../utils/auth';

interface FamilyContextType {
  children: Child[];
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null) => void;
  getCurrentChild: () => Child | null;
  refreshChildren: () => Promise<void>;
  refreshChild: (childId: string) => Promise<void>;
  getChildEvents: (childId: string) => Promise<PointEvent[]>;
  getChildAttendance: (childId: string) => Promise<AttendanceRecord[]>;
  logEvent: (childId: string, event: Omit<PointEvent, 'id' | 'timestamp'>) => Promise<void>;
  createAttendance: (childId: string, attendance: Omit<AttendanceRecord, 'id'>) => Promise<void>;
  updateChild: (childId: string, updates: Partial<Child>) => Promise<void>;
  familyId: string | null;
  familyName: string | null;
  isLoading: boolean;
}

export const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function useFamilyContext() {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamilyContext must be used within a FamilyProvider');
  }
  return context;
}

interface FamilyProviderProps {
  children: ReactNode;
}

export function FamilyProvider({ children: childrenProp }: FamilyProviderProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const auth = useContext(AuthContext);

  // Get the current user's role from AuthContext
  const currentRole = auth?.role || 'parent';

  // Wrapper for setSelectedChildId that persists to storage
  const setSelectedChildId = useCallback((id: string | null) => {
    console.log('💾 Setting selectedChildId:', id);
    setSelectedChildIdState(id);
    if (id) {
      void setStorageSync('fgs_selected_child_id', id); // fire-and-forget async call
    } else {
      void removeStorageSync('fgs_selected_child_id'); // fire-and-forget async call
    }
  }, []);

  // Initialize selectedChildId from storage on mount (parent mode only)
  useEffect(() => {
    const initializeChild = async () => {
      if (currentRole === 'parent') {
        const storedChildId = getStorageSync('fgs_selected_child_id');
        if (storedChildId) {
          console.log('📥 Restoring selectedChildId from storage:', storedChildId);
          setSelectedChildIdState(storedChildId);
        }
      }
    };
    initializeChild();
  }, [currentRole]);

  // Auto-select single child after children are loaded (parent mode only)
  useEffect(() => {
    if (currentRole === 'parent' && children.length === 1 && !selectedChildId) {
      const onlyChild = children[0];
      console.log('✨ Auto-selecting only child:', onlyChild.name, onlyChild.id);
      setSelectedChildId(onlyChild.id);
    }
  }, [children, selectedChildId, currentRole, setSelectedChildId]);

  // Load family data
  useEffect(() => {
    const loadFamilyData = async () => {
      try {
        setIsLoading(true);
        console.log('🏠 FamilyContext: Loading family data...');
        console.log('🔍 Current role from AuthContext:', currentRole);
        
        // Get family ID from localStorage with fallback to multiple keys
        const storedFamilyId = getStorageSync('fgs_family_id') || 
                               getStorageSync('family_id') ||
                               getStorageSync('fgs_family_id') ||
                               getStorageSync('family_id');
        
        console.log('🔍 Family ID from storage:', storedFamilyId);
        
        // DEBUG: Log ALL relevant localStorage values
        console.log('🔍 ALL STORAGE VALUES:', {
          fgs_family_id: getStorageSync('fgs_family_id'),
          family_id: getStorageSync('family_id'),
          user_id: getStorageSync('user_id'),
          user_role: getStorageSync('user_role'),
          user_mode: getStorageSync('user_mode'),
          user_name: getStorageSync('user_name'),
          authContextRole: currentRole,
          hasSupabaseSession: !!(await supabase.auth.getSession()).data.session
        });
        
        if (storedFamilyId) {
          setFamilyId(storedFamilyId);
          
          // Try to load family name
          try {
            const familyData = await getFamily(storedFamilyId);
            if (familyData?.name) {
              setFamilyName(familyData.name);
              console.log('✅ Family name loaded:', familyData.name);
            }
          } catch (error) {
            console.log('ℹ️ Could not load family name (non-critical):', error);
          }
        }

        // Load children based on user role
        if (currentRole === 'child') {
          // KID MODE: Don't call parent APIs, just load the logged-in kid's data
          console.log('👶 Kid mode detected - loading single child data from backend');
          
          // Get kid data from localStorage with detailed logging
          const kidId = getStorageSync('kid_id') || getStorageSync('child_id');
          const kidSessionToken = getStorageSync('kid_session_token') || getStorageSync('kid_access_token');
          const kidName = getStorageSync('kid_name');
          const kidAvatar = getStorageSync('kid_avatar');
          const userRole = getStorageSync('user_role');
          const userMode = getStorageSync('user_mode');
          
          console.log('🔍 Kid login data check (DETAILED):', {
            kidId,
            hasSessionToken: !!kidSessionToken,
            sessionTokenPreview: kidSessionToken?.substring(0, 20),
            familyId: storedFamilyId,
            kidName,
            kidAvatar,
            userRole,
            userMode,
            allLocalStorageKeys: Object.keys(localStorage).filter(k => 
              k.includes('kid') || k.includes('child') || k.includes('user') || k.includes('family')
            ),
            allKidKeys: {
              kid_id: getStorageSync('kid_id'),
              child_id: getStorageSync('child_id'),
              kid_session_token: getStorageSync('kid_session_token')?.substring(0, 20),
              kid_access_token: getStorageSync('kid_access_token')?.substring(0, 20),
              user_mode: getStorageSync('user_mode'),
              user_role: getStorageSync('user_role')
            }
          });
          
          if (kidId && kidSessionToken) {
            try {
              // Fetch the actual child data from backend to get current points
              // Note: kidId already includes the "child:" prefix
              const fetchUrl = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${kidId}`;
              console.log('🌐 Fetching kid data from:', fetchUrl);
              
              const response = await fetch(
                fetchUrl,
                {
                  headers: {
                    'Authorization': `Bearer ${kidSessionToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              console.log('📡 Kid data fetch response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
              });

              if (response.ok) {
                const childData = await response.json();
                console.log('✅ Kid child data loaded from backend:', childData);
                setChildren([childData]);
              } else {
                const errorText = await response.text();
                console.error('❌ Failed to fetch kid data from backend:', {
                  status: response.status,
                  statusText: response.statusText,
                  errorText,
                  kidId,
                  hasToken: !!kidSessionToken
                });
                
                // If 401 Unauthorized, kid session has expired - clear session and redirect to login
                if (response.status === 401) {
                  console.warn('🔐 Kid session expired, redirecting to login');
                  // Use the proper logout function to clear kid session
                  logoutKid();
                  
                  // Show a message
                  console.log('🔔 Session expired - please log in again');
                  
                  // Redirect to kid login
                  window.location.href = '/kid/login';
                  return;
                }
                
                // Fallback to localStorage data with 0 points for other errors
                const kidChild = {
                  id: kidId,
                  name: kidName || 'Kid',
                  pin: '',
                  avatar: kidAvatar || '👶',
                  currentPoints: 0,
                  targetRewardId: null,
                  highestMilestone: 0,
                  familyId: storedFamilyId,
                  createdAt: new Date().toISOString(),
                  streaks: {}
                };
                console.log('⚠️ Using fallback kid child data:', kidChild);
                setChildren([kidChild]);
              }
            } catch (error) {
              console.error('❌ Error fetching kid data:', error);
              // Fallback to localStorage data with 0 points
              const kidChild = {
                id: kidId,
                name: kidName || 'Kid',
                pin: '',
                avatar: kidAvatar || '👶',
                currentPoints: 0,
                targetRewardId: null,
                highestMilestone: 0,
                familyId: storedFamilyId,
                createdAt: new Date().toISOString(),
                streaks: {}
              };
              console.log('⚠️ Using fallback kid child data (error):', kidChild);
              setChildren([kidChild]);
            }
          } else {
            console.warn('⚠️ No kid ID or session token found, cannot load kid data');
            console.log('⚠️ This should not happen in kid mode - redirecting to login');
            // Redirect to kid login
            window.location.href = '/kid/login';
            return;
          }
        } else {
          // PARENT MODE: Load all children
          console.log('👨‍👩‍👧‍👦 Parent mode - loading all children');
          
          if (storedFamilyId) {
            try {
              const childrenData = await getChildren(storedFamilyId);
              console.log('✅ Children loaded from backend:', childrenData);
              setChildren(childrenData || []);
            } catch (error) {
              console.error('❌ Error loading children:', error);
              setChildren([]);
            }
          } else {
            console.log('ℹ️ No family ID available, skipping children load');
            setChildren([]);
          }
        }
      } catch (error) {
        console.error('❌ Error in loadFamilyData:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFamilyData();
  }, [currentRole]); // Re-run when role changes

  const refreshChildren = useCallback(async () => {
    if (!familyId) return;
    
    try {
      console.log('🔄 Refreshing children data...');
      const childrenData = await getChildren(familyId);
      setChildren(childrenData || []);
      console.log('✅ Children refreshed:', childrenData);
    } catch (error) {
      console.error('❌ Error refreshing children:', error);
    }
  }, [familyId]);

  const refreshChild = useCallback(async (childId: string) => {
    try {
      console.log('🔄 Refreshing single child:', childId);
      
      // For kid mode, use kid token
      const kidToken = getStorageSync('kid_session_token') || getStorageSync('kid_access_token');
      const token = kidToken || auth?.accessToken;
      
      if (!token) {
        console.error('❌ No auth token available for refreshChild');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const childData = await response.json();
        console.log('✅ Child refreshed:', childData);
        
        // Update the child in the children array
        setChildren(prev => {
          const index = prev.findIndex(c => c.id === childId);
          if (index >= 0) {
            const newChildren = [...prev];
            newChildren[index] = childData;
            return newChildren;
          }
          return prev;
        });
      } else {
        console.error('❌ Failed to refresh child:', response.status);
      }
    } catch (error) {
      console.error('❌ Error refreshing child:', error);
    }
  }, [auth?.accessToken]);

  const getCurrentChild = useCallback(() => {
    console.log('🔍 getCurrentChild called:', {
      currentRole,
      childrenCount: children.length,
      selectedChildId,
      children: children.map(c => ({ id: c.id, name: c.name }))
    });
    
    // In kid mode, there's only one child in the array
    if (currentRole === 'child' && children.length > 0) {
      console.log('✅ Returning child for kid mode:', children[0]);
      return children[0];
    }
    
    // In parent mode, use the selectedChildId
    if (!selectedChildId) {
      console.log('⚠️ No selectedChildId in parent mode, returning null');
      return null;
    }
    
    const found = children.find(child => child.id === selectedChildId);
    console.log(found ? '✅ Found child for parent mode' : '❌ Child not found for selectedChildId', {
      selectedChildId,
      found: found ? { id: found.id, name: found.name } : null
    });
    return found || null;
  }, [children, selectedChildId, currentRole]);

  // Wrapper for logEvent to match interface signature
  const logEventWrapper = async (childId: string, event: Omit<PointEvent, 'id' | 'timestamp'>) => {
    // The event object should already contain childId, but we ensure it's set
    return logPointEvent({ ...event, childId });
  };

  const value: FamilyContextType = {
    children,
    selectedChildId,
    setSelectedChildId,
    getCurrentChild,
    refreshChildren,
    refreshChild,
    getChildEvents,
    getChildAttendance,
    logEvent: logEventWrapper,
    createAttendance,
    updateChild,
    familyId,
    familyName,
    isLoading
  };

  return (
    <FamilyContext.Provider value={value}>
      {childrenProp}
    </FamilyContext.Provider>
  );
}