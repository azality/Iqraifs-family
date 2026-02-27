# 🚀 iOS BLOCKERS IMPLEMENTATION GUIDE
## Step-by-Step Implementation Plan

**Status:** ✅ 1/6 Complete | 🔨 In Progress  
**Last Updated:** February 22, 2026

---

## ✅ COMPLETED BLOCKERS

### ✅ BLOCKER #3: CORS Wildcard (FIXED)

**File Modified:** `/supabase/functions/server/index.tsx`

**Changes Made:**
```typescript
// OLD (Wildcard - Security Risk)
cors({ origin: "*" })

// NEW (Restricted Origins)
cors({
  origin: (origin) => {
    if (!origin) return true; // Mobile apps
    
    const allowedOrigins = [
      'capacitor://localhost',       // iOS Parent app
      'capacitor://kidapp',          // iOS Kid app
      'http://localhost:5173',       // Development
      'http://127.0.0.1:5173',
      'https://localhost:5173',
    ];
    
    if (allowedOrigins.includes(origin)) return true;
    
    console.warn(`⚠️ CORS: Blocked ${origin}`);
    return false;
  }
})
```

**Testing:**
- [x] Development server (localhost:5173) still works
- [ ] iOS apps work after Capacitor build
- [ ] Unauthorized origins are blocked
- [ ] Warning logged for blocked attempts

**Production Deployment:**
- [ ] Add production web domain to allowedOrigins if deploying web app
- [ ] Update iOS app schemes after Capacitor configuration

---

## 🔨 IN PROGRESS

### 🔴 BLOCKER #1: UTC Timezone Bug

**Impact:** Prayer streaks, daily caps, and "today only" claims break at wrong local time

**Files to Create:**
- ✅ `/src/app/utils/timezone.ts` (Created)

**Files to Modify:**

#### 1. Family Model (Add timezone field)
**File:** `/src/app/contexts/FamilyContext.tsx`
```typescript
// DONE ✅
interface Family {
  id: string;
  name: string;
  parentIds: string[];
  inviteCode?: string;
  createdAt: string;
  timezone?: string; // IANA timezone (e.g., 'America/Toronto')
}
```

#### 2. Backend Family Creation
**File:** `/supabase/functions/server/index.tsx`

**Find:**
```typescript
app.post("/make-server-f116e23f/families", requireAuth, requireParent, async (c) => {
  // ... existing code
  const familyData = {
    id: familyId,
    name: familyName,
    parentIds: [userId],
    inviteCode: code,
    createdAt: new Date().toISOString(),
  };
```

**Change to:**
```typescript
app.post("/make-server-f116e23f/families", requireAuth, requireParent, async (c) => {
  const body = await c.req.json();
  const { name, timezone } = body; // NEW: Accept timezone
  
  // Validate timezone (use Intl API)
  let validTimezone = timezone || 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: validTimezone });
  } catch {
    console.warn(`Invalid timezone ${timezone}, defaulting to UTC`);
    validTimezone = 'UTC';
  }
  
  const familyData = {
    id: familyId,
    name: name,
    parentIds: [userId],
    inviteCode: code,
    createdAt: new Date().toISOString(),
    timezone: validTimezone, // NEW: Store timezone
  };
```

#### 3. Frontend Family Creation Form
**File:** `/src/app/pages/ParentSignup.tsx` or `/src/app/pages/Onboarding.tsx`

**Add timezone selector to family creation form:**
```typescript
import { COMMON_TIMEZONES, getUserTimezone } from '../utils/timezone';

// In component state:
const [selectedTimezone, setSelectedTimezone] = useState(getUserTimezone());

// In form:
<div className="space-y-2">
  <Label htmlFor="timezone">Family Timezone</Label>
  <select
    id="timezone"
    value={selectedTimezone}
    onChange={(e) => setSelectedTimezone(e.target.value)}
    className="w-full px-3 py-2 border rounded-md"
  >
    {COMMON_TIMEZONES.map((tz) => (
      <option key={tz.value} value={tz.value}>
        {tz.label} ({tz.offset})
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500">
    Used for daily resets, prayer tracking, and streaks
  </p>
</div>

// In API call:
const response = await fetch(`${baseUrl}/families`, {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    name: familyName,
    timezone: selectedTimezone, // NEW: Send timezone
  }),
});
```

#### 4. Settings Page (Add Timezone Editor)
**File:** `/src/app/pages/Settings.tsx`

**Add to Family tab:**
```typescript
<div className="space-y-2">
  <Label>Family Timezone</Label>
  <select
    value={family?.timezone || 'UTC'}
    onChange={handleTimezoneChange}
    className="w-full px-3 py-2 border rounded-md"
  >
    {COMMON_TIMEZONES.map((tz) => (
      <option key={tz.value} value={tz.value}>
        {tz.label} ({tz.offset})
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500">
    Current: {family?.timezone || 'UTC'}. Changes affect daily resets and prayer tracking.
  </p>
</div>
```

**Add API endpoint:**
```typescript
app.patch("/make-server-f116e23f/families/:id/timezone", requireAuth, requireParent, requireFamilyAccess, async (c) => {
  const familyId = c.req.param("id");
  const { timezone } = await c.req.json();
  
  // Validate timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return c.json({ error: "Invalid timezone" }, 400);
  }
  
  const family = await kv.get(`family:${familyId}`);
  if (!family) return c.json({ error: "Family not found" }, 404);
  
  family.timezone = timezone;
  await kv.set(`family:${familyId}`, family);
  
  return c.json({ success: true, family });
});
```

#### 5. Daily Reset Logic (Use Timezone)
**File:** `/supabase/functions/server/index.tsx`

**Find all instances of:**
```typescript
// OLD UTC-based reset
const today = new Date().toISOString().split('T')[0];
if (child.lastResetDate !== today) {
  child.dailyPointsEarned = 0;
  child.lastResetDate = today;
}
```

**Replace with:**
```typescript
// NEW Timezone-aware reset
const family = await kv.get(`family:${child.familyId}`);
const timezone = family?.timezone || 'UTC';

// Helper function to get today in family timezone
function getTodayInTimezone(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // Returns YYYY-MM-DD in family timezone
}

const today = getTodayInTimezone(timezone);
if (child.lastResetDate !== today) {
  child.dailyPointsEarned = 0;
  child.lastResetDate = today;
}
```

**Files to update:**
- `/supabase/functions/server/index.tsx` - Event logging endpoint
- `/supabase/functions/server/prayerLogging.tsx` - Prayer claim validation
- Any endpoint checking daily caps or streaks

#### 6. Prayer "Today Only" Validation
**File:** `/supabase/functions/server/prayerLogging.tsx`

**Find:**
```typescript
// OLD UTC-based validation
const claimDate = new Date(claimedAt).toISOString().split('T')[0];
const today = new Date().toISOString().split('T')[0];
if (claimDate !== today) {
  return c.json({ error: "Can only claim prayers for today" }, 400);
}
```

**Replace with:**
```typescript
// NEW Timezone-aware validation
const family = await kv.get(`family:${child.familyId}`);
const timezone = family?.timezone || 'UTC';

function getTodayInTimezone(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

function getDateInTimezone(date: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

const claimDate = getDateInTimezone(new Date(claimedAt), timezone);
const today = getTodayInTimezone(timezone);

if (claimDate !== today) {
  return c.json({ error: "Can only claim prayers for today" }, 400);
}
```

#### 7. Streak Calculation (Consecutive Days)
**File:** Wherever streaks are calculated

**Find:**
```typescript
// OLD UTC-based consecutive day check
const lastDate = new Date(lastClaimDate);
const currentDate = new Date(claimedAt);
const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
if (dayDiff === 1) {
  streak++;
} else if (dayDiff > 1) {
  streak = 1;
}
```

**Replace with:**
```typescript
// NEW Timezone-aware consecutive day check
function getDaysDifference(date1: Date, date2: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const str1 = formatter.format(date1);
  const str2 = formatter.format(date2);
  
  const d1 = new Date(str1);
  const d2 = new Date(str2);
  
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

const dayDiff = getDaysDifference(
  new Date(lastClaimDate),
  new Date(claimedAt),
  timezone
);

if (dayDiff === 1) {
  streak++;
} else if (dayDiff > 1) {
  streak = 1;
}
```

**Testing Checklist:**
- [ ] Toronto family (-5): Daily reset happens at midnight EST, not 7pm
- [ ] Dubai family (+4): Daily reset happens at midnight GST, not 8pm
- [ ] Prayer claimed at 11:59 PM EST counts as "today" (not tomorrow)
- [ ] Streaks calculate correctly across timezone boundaries
- [ ] Weekly review shows correct date ranges in family timezone
- [ ] Audit trail timestamps display in family timezone

---

### 🔴 BLOCKER #2: No Notification Strategy

**Decision Required:** Push Notifications vs Polling

**Recommended: Push Notifications (APNS)**

**Implementation Steps:**

#### Step 1: Configure APNS

**Files to Create:**
- `/supabase/functions/server/pushNotifications.tsx`

```typescript
/**
 * Push Notification Service for iOS Apps
 * Sends notifications via Apple Push Notification Service (APNS)
 */

interface PushNotification {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

export async function sendPushNotification(notification: PushNotification): Promise<boolean> {
  // TODO: Implement APNS HTTP/2 API call
  // Requires:
  // - APNS auth key (.p8 file from Apple Developer)
  // - Team ID
  // - Key ID
  // - Bundle ID (com.familygrowth.parent or com.familygrowth.kids)
  
  const apnsUrl = Deno.env.get('APNS_PRODUCTION')
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
  
  const payload = {
    aps: {
      alert: {
        title: notification.title,
        body: notification.body,
      },
      badge: notification.badge || 0,
      sound: notification.sound || 'default',
    },
    ...notification.data,
  };
  
  try {
    // Send to APNS (requires JWT authentication)
    // Implementation: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/sending_notification_requests_to_apns
    
    console.log(`📲 Push notification sent to ${notification.deviceToken.substring(0, 10)}...`);
    return true;
  } catch (error) {
    console.error('Push notification failed:', error);
    return false;
  }
}

// Store device tokens
export async function registerDeviceToken(
  userId: string,
  deviceToken: string,
  platform: 'ios-parent' | 'ios-kids'
): Promise<void> {
  await kv.set(`deviceToken:${userId}:${platform}`, {
    token: deviceToken,
    platform,
    registeredAt: new Date().toISOString(),
  });
}

// Get user's device tokens
export async function getDeviceTokens(userId: string): Promise<string[]> {
  const tokens: string[] = [];
  
  // Get both parent and kids app tokens
  const parentToken = await kv.get(`deviceToken:${userId}:ios-parent`);
  const kidsToken = await kv.get(`deviceToken:${userId}:ios-kids`);
  
  if (parentToken?.token) tokens.push(parentToken.token);
  if (kidsToken?.token) tokens.push(kidsToken.token);
  
  return tokens;
}
```

#### Step 2: Add Device Token Registration Endpoint

**File:** `/supabase/functions/server/index.tsx`

```typescript
// POST /device-token - Register device for push notifications
app.post("/make-server-f116e23f/device-token", requireAuth, async (c) => {
  const userId = await getAuthUserId(c);
  const { deviceToken, platform } = await c.req.json();
  
  if (!deviceToken || !platform) {
    return c.json({ error: "Missing deviceToken or platform" }, 400);
  }
  
  if (!['ios-parent', 'ios-kids'].includes(platform)) {
    return c.json({ error: "Invalid platform" }, 400);
  }
  
  await registerDeviceToken(userId, deviceToken, platform);
  
  return c.json({ success: true });
});
```

#### Step 3: Send Notifications on Prayer Claims

**File:** `/supabase/functions/server/prayerLogging.tsx`

**Add to prayer claim endpoint:**
```typescript
// After successful prayer claim creation
const claim = await kv.set(`prayerClaim:${claimId}`, claimData);

// NEW: Send push notification to parents
const family = await kv.get(`family:${child.familyId}`);
for (const parentId of family.parentIds) {
  const deviceTokens = await getDeviceTokens(parentId);
  
  for (const token of deviceTokens) {
    await sendPushNotification({
      deviceToken: token,
      title: '🕌 Prayer Claim',
      body: `${child.name} claimed ${prayerType} prayer`,
      data: {
        type: 'prayer_claim',
        claimId: claimId,
        childId: child.id,
        prayerType: prayerType,
      },
      badge: await getPendingClaimsCount(parentId),
    });
  }
}
```

#### Step 4: Frontend Device Token Registration (iOS)

**File:** `/src/app/App.tsx` (for Capacitor)

```typescript
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect } from 'react';

// In App component (after auth check)
useEffect(() => {
  if (!user) return;
  
  // Request push notification permission
  const registerPushNotifications = async () => {
    // Check permission
    const permissionResult = await PushNotifications.requestPermissions();
    
    if (permissionResult.receive === 'granted') {
      // Register with APNS
      await PushNotifications.register();
    }
  };
  
  // Listen for registration success
  PushNotifications.addListener('registration', async (token) => {
    console.log('📲 Push registration success, token: ', token.value);
    
    // Send token to backend
    const appMode = import.meta.env.VITE_APP_MODE || 'parent';
    const platform = appMode === 'kids' ? 'ios-kids' : 'ios-parent';
    
    await fetch(`${baseUrl}/device-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceToken: token.value,
        platform: platform,
      }),
    });
  });
  
  // Listen for registration errors
  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
  });
  
  // Listen for incoming notifications
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('📬 Push received:', notification);
    // Refresh data or show in-app notification
  });
  
  // Listen for notification taps
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('📬 Push tapped:', notification);
    const data = notification.notification.data;
    
    // Deep link to relevant screen
    if (data.type === 'prayer_claim') {
      navigate(`/prayer-approvals?claimId=${data.claimId}`);
    }
  });
  
  registerPushNotifications();
}, [user]);
```

#### Step 5: Install Capacitor Push Plugin

```bash
npm install @capacitor/push-notifications
npx cap sync
```

#### Step 6: Configure APNS in Apple Developer

1. Create Push Notification key (.p8 file)
2. Get Team ID, Key ID
3. Configure in Xcode:
   - Enable Push Notifications capability
   - Add background modes (remote notification)
4. Store credentials in Supabase secrets:
   ```bash
   supabase secrets set APNS_KEY_ID=ABC123
   supabase secrets set APNS_TEAM_ID=XYZ789
   supabase secrets set APNS_KEY_FILE=<base64 encoded .p8 file>
   ```

**Testing Checklist:**
- [ ] Device token registers on app launch
- [ ] Prayer claim sends push to parent
- [ ] Push notification appears on lock screen
- [ ] Tap notification opens Prayer Approvals page
- [ ] Badge count shows pending claims
- [ ] Sound plays for new notification
- [ ] Works in background and killed app states

---

### 🔴 BLOCKER #4: No Account Deletion

**Impact:** Apple requirement - app will be rejected without this

**Implementation:**

#### Step 1: Backend Account Deletion Endpoint

**File:** `/supabase/functions/server/index.tsx`

```typescript
// DELETE /auth/account - Delete user account (Apple requirement)
app.delete("/make-server-f116e23f/auth/account", requireAuth, async (c) => {
  const userId = await getAuthUserId(c);
  const { password } = await c.req.json();
  
  // Re-verify password for security
  const user = await kv.get(`user:${userId}`);
  const { data: authData, error } = await serviceRoleClient.auth.signInWithPassword({
    email: user.email,
    password: password,
  });
  
  if (error || !authData.user) {
    return c.json({ error: "Password verification failed" }, 401);
  }
  
  console.log(`🗑️ Account deletion requested by user ${userId}`);
  
  // Get family membership
  const familyId = user.familyId;
  const family = familyId ? await kv.get(`family:${familyId}`) : null;
  
  // Check if sole parent
  const isSoleParent = family && family.parentIds.length === 1 && family.parentIds.includes(userId);
  
  if (isSoleParent) {
    // Delete entire family data
    console.log(`🗑️ Deleting family ${familyId} (sole parent)`);
    
    // Delete all family data
    const keysToDelete = [
      `family:${familyId}`,
      // Delete all children
      ...(await kv.getByPrefix(`child:*`)).filter(c => c.familyId === familyId).map(c => `child:${c.id}`),
      // Delete all events
      ...(await kv.getByPrefix(`event:*`)).filter(e => {
        const child = await kv.get(`child:${e.childId}`);
        return child?.familyId === familyId;
      }).map(e => `event:${e.id}`),
      // Delete all trackable items, rewards, challenges, etc.
      // ... (continue for all family-related keys)
    ];
    
    for (const key of keysToDelete) {
      await kv.del(key);
    }
  } else if (family) {
    // Remove from family but keep family intact
    console.log(`🗑️ Removing user from family ${familyId}`);
    family.parentIds = family.parentIds.filter(id => id !== userId);
    await kv.set(`family:${familyId}`, family);
  }
  
  // Delete user data
  await kv.del(`user:${userId}`);
  
  // Delete Supabase Auth user
  const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('Failed to delete Supabase user:', deleteError);
    return c.json({ error: "Failed to delete account" }, 500);
  }
  
  console.log(`✅ Account deleted for user ${userId}`);
  
  return c.json({ 
    success: true,
    deletedFamily: isSoleParent,
    message: isSoleParent 
      ? "Account and family data deleted" 
      : "Account deleted, family preserved"
  });
});
```

#### Step 2: Frontend Account Deletion UI

**File:** `/src/app/pages/Settings.tsx`

**Add to Family or Account tab:**

```typescript
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

// In component:
const [deletePassword, setDeletePassword] = useState('');
const [deleteConfirmText, setDeleteConfirmText] = useState('');
const [isDeleting, setIsDeleting] = useState(false);

const handleDeleteAccount = async () => {
  if (deleteConfirmText !== 'DELETE') {
    toast.error('Please type DELETE to confirm');
    return;
  }
  
  if (!deletePassword) {
    toast.error('Please enter your password');
    return;
  }
  
  setIsDeleting(true);
  
  try {
    const response = await fetch(`${baseUrl}/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password: deletePassword }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to delete account');
      return;
    }
    
    const result = await response.json();
    
    toast.success(result.message);
    
    // Sign out and redirect
    await logout();
    navigate('/welcome');
  } catch (error) {
    console.error('Delete account error:', error);
    toast.error('Failed to delete account');
  } finally {
    setIsDeleting(false);
  }
};

// In JSX (add to Settings page):
<Card className="border-red-200 bg-red-50">
  <CardHeader>
    <CardTitle className="text-red-700 flex items-center gap-2">
      <Trash2 className="w-5 h-5" />
      Danger Zone
    </CardTitle>
    <CardDescription className="text-red-600">
      Permanent actions that cannot be undone
    </CardDescription>
  </CardHeader>
  <CardContent>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete My Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p className="text-red-600 font-semibold">
              This action cannot be undone. This will permanently delete:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Your account and profile</li>
              <li>All family data (if you're the only parent)</li>
              <li>All children and their records</li>
              <li>All events, attendance, and history</li>
              <li>All challenges, rewards, and quizzes</li>
            </ul>
            <p className="text-sm text-gray-600">
              If another parent exists in your family, they will retain access and the family will continue.
            </p>
            
            <div className="space-y-3 mt-4">
              <div>
                <Label>Enter your password to confirm:</Label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Type <strong>DELETE</strong> to confirm:</Label>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="mt-1"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setDeletePassword('');
            setDeleteConfirmText('');
          }}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={isDeleting || deleteConfirmText !== 'DELETE' || !deletePassword}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? 'Deleting...' : 'Delete My Account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </CardContent>
</Card>
```

**Testing Checklist:**
- [ ] Solo parent deletion removes all family data
- [ ] Dual parent deletion removes only that parent
- [ ] Password verification works
- [ ] Typing "DELETE" is required
- [ ] Supabase Auth user is deleted
- [ ] User is logged out after deletion
- [ ] No orphaned data remains in KV store

---

### 🔴 BLOCKER #5: Route Isolation

**Impact:** Parent app can navigate to kid routes, kid app can access parent admin

**Implementation Strategy:** Create separate route configurations for Parent and Kid apps

#### Step 1: Create Environment Variable Detection

**File:** `/src/app/utils/appMode.ts`

```typescript
/**
 * App Mode Detection Utility
 * Determines if app is running as Parent or Kid app
 */

export type AppMode = 'parent' | 'kids';

export function getAppMode(): AppMode {
  // Check build-time environment variable (set by build script)
  const buildMode = import.meta.env.VITE_APP_MODE;
  
  if (buildMode === 'kids') {
    return 'kids';
  }
  
  // Default to parent mode
  return 'parent';
}

export const APP_MODE = getAppMode();
export const IS_PARENT_APP = APP_MODE === 'parent';
export const IS_KIDS_APP = APP_MODE === 'kids';
```

#### Step 2: Create Separate Route Files

**File:** `/src/app/routes.parent.tsx`

```typescript
/**
 * Parent App Routes
 * Only parent-accessible pages
 */

import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { ProvidersLayout } from './layouts/ProvidersLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireFamily } from './components/RequireFamily';

// Parent-only pages
import { ParentDashboard } from './pages/ParentDashboard';
import { LogBehavior } from './pages/LogBehavior';
import { WeeklyReview } from './pages/WeeklyReview';
import { Adjustments } from './pages/Adjustments';
import { AttendanceNew } from './pages/AttendanceNew';
import { Rewards } from './pages/Rewards';
import { AuditTrail } from './pages/AuditTrail';
import { Settings } from './pages/Settings';
import { EditRequests } from './pages/EditRequests';
import { Quizzes } from './pages/Quizzes';
import { Challenges } from './pages/Challenges';
import { PrayerApprovals } from './pages/PrayerApprovals';

// Public pages
import { Welcome } from './pages/Welcome';
import { ParentLogin } from './pages/ParentLogin';
import { ParentSignup } from './pages/ParentSignup';

export const parentRouter = createBrowserRouter([
  // Public routes
  { path: '/welcome', element: <Welcome /> },
  { path: '/login', element: <ParentLogin /> },
  { path: '/signup', element: <ParentSignup /> },
  
  // Protected routes
  {
    path: '/',
    element: <ProtectedRoute><RequireFamily><ProvidersLayout><RootLayout /></ProvidersLayout></RequireFamily></ProtectedRoute>,
    children: [
      { index: true, element: <ParentDashboard /> },
      { path: 'log', element: <LogBehavior /> },
      { path: 'review', element: <WeeklyReview /> },
      { path: 'adjustments', element: <Adjustments /> },
      { path: 'attendance', element: <AttendanceNew /> },
      { path: 'rewards', element: <Rewards /> },
      { path: 'audit', element: <AuditTrail /> },
      { path: 'settings', element: <Settings /> },
      { path: 'edit-requests', element: <EditRequests /> },
      { path: 'quizzes', element: <Quizzes /> },
      { path: 'challenges', element: <Challenges /> },
      { path: 'prayer-approvals', element: <PrayerApprovals /> },
      // 404 catch-all
      { path: '*', element: <div>Page not found</div> },
    ],
  },
]);
```

**File:** `/src/app/routes.kids.tsx`

```typescript
/**
 * Kids App Routes
 * Only kid-accessible pages
 */

import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { ProvidersLayout } from './layouts/ProvidersLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireFamily } from './components/RequireFamily';

// Kid-only pages
import { KidDashboard } from './pages/KidDashboard';
import { TitlesBadgesPage } from './pages/TitlesBadgesPage';
import { SadqaPage } from './pages/SadqaPage';
import { QuizPlay } from './pages/QuizPlay';
import { PrayerClaim } from './pages/PrayerClaim';
import { KidChallenges } from './pages/KidChallenges'; // Create kid-specific version
import { KidRewards } from './pages/KidRewards'; // Create kid-specific version
import { KidQuizzes } from './pages/KidQuizzes'; // Create kid-specific version

// Public pages
import { Welcome } from './pages/Welcome';
import { KidLogin } from './pages/KidLogin';

export const kidsRouter = createBrowserRouter([
  // Public routes
  { path: '/welcome', element: <Welcome /> },
  { path: '/kid-login', element: <KidLogin /> },
  { path: '/login', element: <KidLogin /> }, // Alias
  
  // Protected routes
  {
    path: '/',
    element: <ProtectedRoute><RequireFamily><ProvidersLayout><RootLayout /></ProvidersLayout></RequireFamily></ProtectedRoute>,
    children: [
      { index: true, element: <KidDashboard /> },
      { path: 'titles-badges', element: <TitlesBadgesPage /> },
      { path: 'sadqa', element: <SadqaPage /> },
      { path: 'challenges', element: <KidChallenges /> },
      { path: 'rewards', element: <KidRewards /> },
      { path: 'quizzes', element: <KidQuizzes /> },
      { path: 'quizzes/:id/play', element: <QuizPlay /> },
      { path: 'prayer-claim', element: <PrayerClaim /> },
      // Block all parent routes
      { path: 'log', element: <div>Access Denied</div> },
      { path: 'review', element: <div>Access Denied</div> },
      { path: 'adjustments', element: <div>Access Denied</div> },
      { path: 'attendance', element: <div>Access Denied</div> },
      { path: 'audit', element: <div>Access Denied</div> },
      { path: 'settings', element: <div>Access Denied</div> },
      { path: 'edit-requests', element: <div>Access Denied</div> },
      { path: 'prayer-approvals', element: <div>Access Denied</div> },
      // 404 catch-all
      { path: '*', element: <div>Page not found</div> },
    ],
  },
]);
```

#### Step 3: Update App.tsx to Use Correct Router

**File:** `/src/app/App.tsx`

```typescript
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { APP_MODE, IS_PARENT_APP } from './utils/appMode';
import { parentRouter } from './routes.parent';
import { kidsRouter } from './routes.kids';

function App() {
  const router = IS_PARENT_APP ? parentRouter : kidsRouter;
  
  console.log(`🚀 App loaded in ${APP_MODE.toUpperCase()} mode`);
  
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
```

#### Step 4: Update Navigation Components

**File:** `/src/app/components/Navigation.tsx`

```typescript
import { IS_PARENT_APP, IS_KIDS_APP } from '../utils/appMode';

export function Navigation() {
  if (IS_PARENT_APP) {
    return (
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/log">Log Behavior</Link>
        <Link to="/review">Weekly Review</Link>
        {/* ... other parent links */}
      </nav>
    );
  }
  
  if (IS_KIDS_APP) {
    return (
      <nav>
        <Link to="/">My Adventure</Link>
        <Link to="/challenges">Quests</Link>
        <Link to="/rewards">Rewards</Link>
        <Link to="/titles-badges">Badges</Link>
        {/* ... other kid links */}
      </nav>
    );
  }
  
  return null;
}
```

#### Step 5: Update Build Scripts

**File:** `/package.json`

```json
{
  "scripts": {
    "build:parent": "VITE_APP_MODE=parent vite build --outDir dist/parent",
    "build:kids": "VITE_APP_MODE=kids vite build --outDir dist/kids",
    "build": "npm run build:parent && npm run build:kids"
  }
}
```

**Testing Checklist:**
- [ ] Parent app cannot navigate to `/kid-dashboard`
- [ ] Kid app cannot navigate to `/log`
- [ ] Deep links to wrong app routes show "Access Denied"
- [ ] Navigation only shows relevant links
- [ ] Build creates separate parent and kids bundles
- [ ] No parent components imported in kids bundle
- [ ] No kids components imported in parent bundle

---

### 🔴 BLOCKER #6: Sign in with Apple

**Impact:** Required if any social login is enabled (Google, Facebook, etc.)

**Current Status:** Check if social login is enabled in Supabase dashboard

**If Social Login Enabled:**

#### Step 1: Enable Sign in with Apple in Supabase

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Apple" provider
3. Configure:
   - Services ID (from Apple Developer)
   - Key ID (from Apple Developer)
   - Team ID (from Apple Developer)
   - Private Key (.p8 file content)

#### Step 2: Configure in Apple Developer

1. Create Services ID:
   - Identifier: `com.familygrowth.signin`
   - Description: "Sign in with Apple for Family Growth"
2. Create Sign in with Apple key (.p8 file)
3. Configure Return URLs:
   - `https://ybrkbrrkcqpzpjnjdyib.supabase.co/auth/v1/callback`

#### Step 3: Add Apple Sign In Button to Login UI

**File:** `/src/app/pages/ParentLogin.tsx`

```typescript
import { supabase } from '../../utils/supabase/client';

const handleAppleSignIn = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  
  if (error) {
    console.error('Apple sign in error:', error);
    toast.error('Failed to sign in with Apple');
  }
};

// In JSX (MUST be first button per Apple guidelines):
<div className="space-y-3">
  {/* Apple Sign In FIRST */}
  <Button
    onClick={handleAppleSignIn}
    variant="outline"
    className="w-full bg-black text-white hover:bg-gray-800"
  >
    <AppleIcon className="mr-2 h-5 w-5" />
    Sign in with Apple
  </Button>
  
  {/* Other social logins after */}
  <Button onClick={handleGoogleSignIn} variant="outline" className="w-full">
    <GoogleIcon className="mr-2 h-5 w-5" />
    Sign in with Google
  </Button>
  
  {/* Or separator */}
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-background px-2 text-muted-foreground">Or</span>
    </div>
  </div>
  
  {/* Email/password form */}
  <form onSubmit={handleEmailLogin}>
    {/* ... */}
  </form>
</div>
```

**If Social Login NOT Enabled:**
- No action needed
- Apple requirement doesn't apply

**Testing Checklist:**
- [ ] Apple button appears first (Apple guideline)
- [ ] Apple sign in flow completes successfully
- [ ] User account created with Apple ID
- [ ] Email/name retrieved (if shared by user)
- [ ] Account linking works if email matches existing account
- [ ] Privacy-friendly (user can hide email)

---

## 📊 IMPLEMENTATION PROGRESS

| Blocker | Status | Estimated Time | Priority |
|---------|--------|----------------|----------|
| CORS Wildcard | ✅ Complete | 0.5 days | P0 |
| UTC Timezone Bug | 🔨 50% | 3 days | P0 |
| Notification Strategy | ❌ Not Started | 5 days | P0 |
| Account Deletion | ❌ Not Started | 2 days | P0 |
| Route Isolation | ❌ Not Started | 2 days | P0 |
| Sign in with Apple | ❌ Not Started | 3 days | P1 |

**Total Estimated Time:** 15.5 days (3 weeks)

---

## 🚀 RECOMMENDED IMPLEMENTATION ORDER

### Week 1 (Core Functionality Fixes):
1. ✅ CORS restriction (Day 1 AM)
2. 🔨 Timezone support (Days 1-3)
3. Account deletion (Days 4-5)

### Week 2 (High Priority UX):
4. Route isolation (Days 6-7)
5. Push notifications setup (Days 8-12)

### Week 3 (Polish & Testing):
6. Sign in with Apple (Days 13-15)
7. Integration testing (Days 16-18)
8. TestFlight beta (Days 19-21)

---

## 📝 NOTES

- **Timezone fix is CRITICAL** for prayer tracking integrity
- **Push notifications** are strongly recommended over polling for UX
- **Route isolation** prevents security/UX disasters
- **Account deletion** is non-negotiable for App Store
- **Sign in with Apple** only needed if social login enabled

---

**Last Updated:** February 22, 2026  
**Next Review:** After timezone implementation complete
