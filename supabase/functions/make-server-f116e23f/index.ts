// FGS Backend Server v1.0.3 - Accept challenge route flattened (no :childId in URL)
const SERVER_VERSION = "v1.0.11-mobile-and-recovery";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import * as monitoring from "./monitoring.ts";
import { notifyFamilyParents } from "./notifications.tsx";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { 
  requireAuth, 
  requireParent, 
  requireFamilyAccess,
  requireChildAccess,
  getAuthUserId,
  getFamilyId,
  getUserFamilyId,
  serviceRoleClient
} from "./middleware.tsx";
import {
  validate,
  validateSignup,
  validateFamily,
  validateChild,
  validatePointEvent,
  validateVoid,
  validateTrackableItem,
  validateChallenge,
  validateInvite,
  validateInviteAccept,
  validatePinVerify,
  validateProvider,
  validateAttendance,
  validateMilestone,
  validateReward,
  validateWishlistItem,
  validateRedemptionRequest,
  validateQuiz,
  validateQuizAttempt,
  validateQuestion,
  validateKnowledgeSession,
  validateSessionAnswer,
  getValidatedBody
} from "./validation.tsx";
import {
  rateLimitLogin,
  rateLimitPinVerify,
  rateLimitEventCreate,
  rateLimitApi,
  RATE_LIMITS,
  rateLimit
} from "./rateLimit.tsx";
import {
  createInvite,
  validateInvite as checkInvite,
  acceptInvite,
  getFamilyInvites,
  revokeInvite
} from "./invites.tsx";
import {
  createKidSession,
  verifyKidSession,
  revokeKidSession,
  revokeAllChildSessions,
  getChildSessions,
  trackPinFailure,
  resetPinFailures,
  isPinLocked,
  getDeviceHash
} from "./kidSessions.tsx";
import {
  getTodayInTimezone,
  getDateInTimezone,
  isValidTimezone,
  // v10: TZ-aware day/week boundaries so daily quests run from
  // 00:00 family-local → 23:59 family-local, not server UTC.
  getStartOfDayInTimezone,
  getEndOfDayInTimezone,
  getStartOfWeekInTimezone,
  getEndOfWeekInTimezone
} from "./timezoneUtils.ts";
import {
  createPrayerClaim,
  getChildClaims,
  getClaimsForDate,
  getPendingClaimsForFamily,
  approvePrayerClaim,
  denyPrayerClaim,
  getPrayerStats,
  PRAYER_NAMES,
  PRAYER_TIMES
} from "./prayerLogging.tsx";

const app = new Hono();

// Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// ═══════════════════════════════════════════════════════════════
// ⚠️ CRITICAL DEPLOYMENT REQUIREMENT ⚠️
// ═══════════════════════════════════════════════════════════════
// 
// Before deploying this Edge Function, you MUST configure Supabase:
//
// 1. Go to: Supabase Dashboard → Edge Functions → make-server-f116e23f → Settings
// 2. Find the "Verify JWT" toggle
// 3. **DISABLE** the "Verify JWT" option
//
// WHY: When "Verify JWT" is enabled, Supabase intercepts ALL requests
// (including OPTIONS preflight) BEFORE they reach this code, causing CORS
// failures because our CORS headers never get added.
//
// Our middleware below handles JWT verification manually using the 
// requireAuth middleware, so the Supabase-level JWT verification is 
// not needed and actually breaks CORS.
// ═══════════════════════════════════════════════════════════════

// Logger disabled for bundle size optimization

// 🚨 CRITICAL FIX: CORS configuration - manual implementation
// Supabase Edge Functions seems to block OPTIONS requests, so we handle CORS completely manually
app.use("/*", async (c, next) => {
  const origin = c.req.header("origin") || "*";
  
  // Handle OPTIONS preflight requests immediately - return new Response object
  if (c.req.method === "OPTIONS") {
    console.log(`🔧 Handling OPTIONS preflight for ${c.req.path} from origin: ${origin}`);
    
    // Create a new Response with explicit CORS headers
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, authorization, x-client-info, apikey, X-Supabase-Auth, x-supabase-auth",
        "Access-Control-Max-Age": "600",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
        "Vary": "Origin"
      }
    });
  }
  
  // For all other requests, call next() first to get the response
  await next();
  
  // Then add CORS headers to the response
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, authorization, x-client-info, apikey, X-Supabase-Auth, x-supabase-auth");
  c.res.headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Type");
  c.res.headers.set("Vary", "Origin");
});

// Debug middleware - log ALL incoming headers to diagnose JWT Verify issue
app.use("/*", async (c, next) => {
  const hasAuthHeader = !!(c.req.header("Authorization") || c.req.header("authorization"));
  const allHeaders = Object.fromEntries(c.req.raw.headers.entries());
  
  console.log('📥 Incoming request:', {
    method: c.req.method,
    path: c.req.path,
    hasAuthHeader,
    origin: c.req.header("origin") || c.req.header("Origin") || "NO_ORIGIN",
    referer: c.req.header("referer") || c.req.header("Referer") || "NO_REFERER",
    userAgent: c.req.header("user-agent")?.substring(0, 100) || "NO_UA",
    headers: {
      authorization: c.req.header("Authorization"),
      authorizationLower: c.req.header("authorization"),
      apikey: c.req.header("apikey"),
      contentType: c.req.header("Content-Type")
    },
    totalHeaderCount: Object.keys(allHeaders).length,
    headerKeys: Object.keys(allHeaders)
  });
  
  // Critical diagnostic for missing auth headers
  if (!hasAuthHeader && c.req.path.includes("/children/") && c.req.method === "GET") {
    console.error('🚨 CRITICAL: Authorization header missing on authenticated endpoint!');
    console.error('   This usually means "Verify JWT" is enabled in Supabase Edge Functions settings.');
    console.error('   All headers received:', allHeaders);
    console.error('   ⚠️  ACTION: Go to Supabase Dashboard → Edge Functions → make-server-f116e23f → Settings');
    console.error('   ⚠️  DISABLE the "Verify JWT" toggle');
  }
  
  await next();
});

// ================================================================
// MONITORING ENDPOINTS
// ================================================================

// Health check endpoint (enhanced with monitoring)
app.get("/make-server-f116e23f/health", async (c) => {
  try {
    const health = await monitoring.getHealthStatus();
    return c.json({ ...health, serverVersion: SERVER_VERSION });
  } catch (error: any) {
    console.error('Health check failed:', error);
    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      serverVersion: SERVER_VERSION,
      error: error.message
    }, 500);
  }
});

// Tiny diagnostic used to confirm deployment freshness from the browser.
// If this returns `{ ok: true }` we know the edge function bundle actually
// includes the v1.0.3 routes (including POST /challenges/accept).
app.get("/make-server-f116e23f/diag/version", (c) => {
  return c.json({ ok: true, serverVersion: SERVER_VERSION });
});

// Metrics endpoint (last 60 minutes by default)
app.get("/make-server-f116e23f/metrics", async (c) => {
  try {
    const windowMinutes = parseInt(c.req.query('window') || '60');
    const metrics = monitoring.getMetricsSummary(windowMinutes);
    return c.json(metrics);
  } catch (error: any) {
    console.error('Metrics endpoint failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Alerts endpoint (check for triggered alerts)
app.get("/make-server-f116e23f/alerts", async (c) => {
  try {
    const windowMinutes = parseInt(c.req.query('window') || '5');
    const alerts = monitoring.checkAlerts(windowMinutes);
    return c.json({
      timestamp: new Date().toISOString(),
      window: `${windowMinutes} minutes`,
      alerts,
      count: alerts.length
    });
  } catch (error: any) {
    console.error('Alerts endpoint failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// SECURITY: DEBUG/TEST ENDPOINTS REMOVED FOR PRODUCTION
// ═══════════════════════════════════════════════════════════════
// The following endpoints were removed to prevent security vulnerabilities:
//
// 1. POST /test/cleanup - Deleted test users without auth
//    Risk: Anyone could delete users, including production data
//    Removed: February 21, 2026
//
// 2. GET /debug/all-children - Exposed ALL children data
//    Risk: Data breach - no authentication required
//    Removed: Earlier (already deleted)
//
// If you need test cleanup in development, use Supabase Dashboard:
// https://supabase.com/dashboard → Authentication → Users → Delete
// ═══════════════════════════════════════════════════════════════

// PUBLIC: Get children for family (no auth required)
// Used by kid login to display available children
app.get("/make-server-f116e23f/public/families/:familyId/children", async (c) => {
  try {
    const familyId = c.req.param('familyId');
    console.log(`📡 Public request for family ${familyId} children`);
    
    if (!familyId) {
      return c.json({ error: 'Family ID required' }, 400);
    }
    
    const allChildren = await kv.getByPrefix('child:');
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    
    const publicChildren = familyChildren.map((child: any) => ({
      id: child.id,
      name: child.name,
      avatar: child.avatar || '👶',
      familyId: child.familyId
    }));
    
    console.log(`✅ Returning ${publicChildren.length} children`);
    return c.json(publicChildren);
  } catch (error) {
    console.error('❌ Error in public children endpoint:', error);
    return c.json({ error: 'Failed to get children' }, 500);
  }
});

// NEW: Verify family code and return kids (no auth required)
// Used by kid login to validate family code and show kid selection
app.post("/make-server-f116e23f/public/verify-family-code", async (c) => {
  try {
    const { familyCode } = await c.req.json();
    
    if (!familyCode || typeof familyCode !== 'string') {
      return c.json({ 
        success: false, 
        error: 'Family code is required' 
      }, 400);
    }
    
    // Look up family by invite code
    const familyId = await kv.get(`invite:${familyCode.toUpperCase()}`);
    
    if (!familyId) {
      return c.json({ 
        success: false, 
        error: 'Invalid family code' 
      }, 404);
    }
    
    // Get family info
    const family = await kv.get(familyId);
    
    if (!family) {
      return c.json({ 
        success: false, 
        error: 'Family not found' 
      }, 404);
    }
    
    // Get all children in the family
    const allChildren = await kv.getByPrefix('child:');
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    
    // Return public kid info for selection
    const kids = familyChildren.map((child: any) => ({
      id: child.id,
      name: child.name,
      avatar: child.avatar || '👶'
    }));
    
    return c.json({
      success: true,
      familyId,
      familyName: family.name,
      kids,
      message: `Welcome to ${family.name}! 🏡`
    });
    
  } catch (error) {
    console.error('Error verifying family code:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to verify family code' 
    }, 500);
  }
});

// ===== AUTHENTICATION =====

// Sign up new user (parent)
app.post(
  "/make-server-f116e23f/auth/signup",
  rateLimit("signup", { maxAttempts: 5, windowMs: 60 * 60 * 1000 }), // 5 signups per hour per IP
  validate(validateSignup),
  async (c) => {
    try {
      const { email, password, name, role } = getValidatedBody(c);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: role || 'parent' },
      // Automatically confirm email since email server not configured
      email_confirm: true
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }
    
    // Create user record in KV store
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      role: role || 'parent',
      createdAt: new Date().toISOString()
    });

    return c.json({ user: data.user, success: true });
  } catch (error) {
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Get user by ID
app.get(
  "/make-server-f116e23f/users/:userId",
  requireAuth,
  async (c) => {
    try {
      const userId = c.req.param('userId');
      const authenticatedUserId = getAuthUserId(c);
      
      if (userId !== authenticatedUserId) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      
      const user = await kv.get(`user:${userId}`);
      
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      
      return c.json(user);
    } catch (error) {
      return c.json({ error: 'Failed to get user' }, 500);
    }
  }
);

// Delete account (Apple App Store requirement)
app.delete(
  "/make-server-f116e23f/auth/account",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      const body = await c.req.json();
      const { password } = body;

      if (!password) {
        return c.json({ error: 'Password confirmation required' }, 400);
      }

      // Get user data
      const user = await kv.get(`user:${userId}`);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      // Verify password before deletion
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (signInError) {
        return c.json({ error: 'Invalid password' }, 401);
      }

      // Get family to determine deletion scope
      const familyId = user.familyId;
      let deletionScope: 'account_only' | 'entire_family' = 'account_only';
      let deletedItems: string[] = [];

      if (familyId) {
        const family = await kv.get(familyId);
        
        if (family) {
          const parentIds = family.parentIds || [];
          const isSoleParent = parentIds.length === 1 && parentIds[0] === userId;

          if (isSoleParent) {
            // SOLE PARENT: Delete entire family and all children
            deletionScope = 'entire_family';

            // 1. Delete all children
            const allChildren = await kv.getByPrefix('child:');
            const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
            
            for (const child of familyChildren) {
              // Delete child sessions
              const sessions = await kv.getByPrefix(`kidsession:${child.id}:`);
              for (const session of sessions) {
                await kv.del(session.sessionToken);
              }
              
              // Delete child progress data
              await kv.del(`childprogress:${child.id}`);
              
              // Delete child
              await kv.del(`child:${child.id}`);
              deletedItems.push(`Child: ${child.name}`);
            }

            // 2. Delete all trackable items
            const allItems = await kv.getByPrefix('trackableitem:');
            const familyItems = allItems.filter((item: any) => item.familyId === familyId);
            for (const item of familyItems) {
              await kv.del(`trackableitem:${item.id}`);
              deletedItems.push(`Habit/Behavior: ${item.name}`);
            }

            // 3. Delete all rewards
            const allRewards = await kv.getByPrefix('reward:');
            const familyRewards = allRewards.filter((reward: any) => reward.familyId === familyId);
            for (const reward of familyRewards) {
              await kv.del(`reward:${reward.id}`);
              deletedItems.push(`Reward: ${reward.name}`);
            }

            // 4. Delete all milestones
            const allMilestones = await kv.getByPrefix('milestone:');
            const familyMilestones = allMilestones.filter((milestone: any) => milestone.familyId === familyId);
            for (const milestone of familyMilestones) {
              await kv.del(`milestone:${milestone.id}`);
              deletedItems.push(`Milestone: ${milestone.name}`);
            }

            // 5. Delete all logs
            const allLogs = await kv.getByPrefix('log:');
            const familyLogs = allLogs.filter((log: any) => {
              // Check if log belongs to family children
              return familyChildren.some((child: any) => child.id === log.childId);
            });
            for (const log of familyLogs) {
              await kv.del(`log:${log.id}`);
            }
            deletedItems.push(`${familyLogs.length} activity logs`);

            // 6. Delete all custom quests
            const allQuests = await kv.getByPrefix('customquest:');
            const familyQuests = allQuests.filter((quest: any) => quest.familyId === familyId);
            for (const quest of familyQuests) {
              await kv.del(`customquest:${quest.id}`);
            }

            // 7. Delete quest settings
            await kv.del(`questsettings:${familyId}`);

            // 8. Delete prayer claims
            const allClaims = await kv.getByPrefix('prayerclaim:');
            const familyClaims = allClaims.filter((claim: any) => {
              return familyChildren.some((child: any) => child.id === claim.childId);
            });
            for (const claim of familyClaims) {
              await kv.del(`prayerclaim:${claim.id}`);
            }
            deletedItems.push(`${familyClaims.length} prayer claims`);

            // 9. Delete wishlist items
            const allWishlistItems = await kv.getByPrefix('wishlistitem:');
            const familyWishlistItems = allWishlistItems.filter((item: any) => {
              return familyChildren.some((child: any) => child.id === item.childId);
            });
            for (const item of familyWishlistItems) {
              await kv.del(`wishlistitem:${item.id}`);
            }

            // 10. Delete redemptions
            const allRedemptions = await kv.getByPrefix('redemption:');
            const familyRedemptions = allRedemptions.filter((redemption: any) => {
              return familyChildren.some((child: any) => child.id === redemption.childId);
            });
            for (const redemption of familyRedemptions) {
              await kv.del(`redemption:${redemption.id}`);
            }

            // 11. Delete invite code mapping
            if (family.inviteCode) {
              await kv.del(`invite:${family.inviteCode}`);
            }

            // 12. Delete pending join requests
            const allInvites = await kv.getByPrefix('familyinvite:');
            const familyInvites = allInvites.filter((invite: any) => invite.familyId === familyId);
            for (const invite of familyInvites) {
              await kv.del(`familyinvite:${invite.id}`);
            }

            // 13. Delete family
            await kv.del(familyId);
            deletedItems.push(`Family: ${family.name}`);

          } else {
            // DUAL PARENT: Only remove this parent from family
            const updatedParentIds = parentIds.filter((id: string) => id !== userId);
            family.parentIds = updatedParentIds;
            await kv.set(familyId, family);
            deletedItems.push('Your account (family preserved for other parent)');
          }
        }
      }

      // 14. Delete user record from KV
      await kv.del(`user:${userId}`);

      // 15. Delete user from Supabase Auth
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error('Failed to delete user from Supabase Auth:', deleteError);
        // Continue anyway - KV data is already deleted
      }

      console.log(`✅ Account deleted: ${user.email} (scope: ${deletionScope})`);
      console.log(`   Deleted items: ${deletedItems.join(', ')}`);

      return c.json({
        success: true,
        message: 'Account deleted successfully',
        deletionScope,
        deletedItems
      });

    } catch (error: any) {
      console.error('Account deletion error:', error);
      return c.json({ 
        error: error.message || 'Failed to delete account' 
      }, 500);
    }
  }
);

// ===== FAMILIES & CHILDREN =====

// Create family
app.post(
  "/make-server-f116e23f/families",
  requireAuth,
  requireParent,
  validate(validateFamily),
  async (c) => {
    try {
      const { name, parentIds, timezone } = getValidatedBody(c);
      const userId = getAuthUserId(c);
      const familyId = `family:${Date.now()}`;
      
      // Validate and set timezone (default to UTC if invalid/missing)
      let validTimezone = timezone || 'UTC';
      try {
        Intl.DateTimeFormat(undefined, { timeZone: validTimezone });
      } catch {
        console.warn(`⚠️ Invalid timezone ${timezone}, defaulting to UTC`);
        validTimezone = 'UTC';
      }
      
      // Generate a unique 6-character invite code
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const family = {
        id: familyId,
        name,
        parentIds: parentIds || [userId],
        inviteCode,
        timezone: validTimezone, // NEW: Store family timezone
        createdAt: new Date().toISOString()
      };
      
      console.log(`✅ Creating family "${name}" with timezone: ${validTimezone}`);
      
      await kv.set(familyId, family);
      
      // Store invite code mapping for quick lookup
      await kv.set(`invite:${inviteCode}`, familyId);
      
      // Update user record with familyId
      const user = await kv.get(`user:${userId}`);
      if (user) {
        user.familyId = familyId;
        await kv.set(`user:${userId}`, user);
      }
      
      return c.json(family);
    } catch (error) {
      return c.json({ error: 'Failed to create family' }, 500);
    }
});

// Get user's families
app.get(
  "/make-server-f116e23f/families",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get user to find their familyId
      const user = await kv.get(`user:${userId}`);
      
      if (!user || !user.familyId) {
        return c.json([]);
      }
      
      // Get the family details
      const family = await kv.get(user.familyId);
      
      if (!family) {
        return c.json([]);
      }
      
      return c.json([family]);
    } catch (error) {
      return c.json({ error: 'Failed to get families' }, 500);
    }
  }
);

// Get family by ID
app.get(
  "/make-server-f116e23f/families/:id",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const id = c.req.param('id');
    const family = await kv.get(id);
    
    if (!family) {
      return c.json({ error: 'Family not found' }, 404);
    }
    
    return c.json(family);
  } catch (error) {
    return c.json({ error: 'Failed to get family' }, 500);
  }
});

// Update family timezone (Settings page)
app.patch(
  "/make-server-f116e23f/families/:id/timezone",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const { timezone } = await c.req.json();
      
      if (!timezone || typeof timezone !== 'string') {
        return c.json({ error: 'Valid timezone is required' }, 400);
      }
      
      // Validate timezone using Intl API
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return c.json({ error: 'Invalid timezone' }, 400);
      }
      
      // Get family
      const family = await kv.get(id);
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Update timezone
      family.timezone = timezone;
      await kv.set(id, family);
      
      console.log(`✅ Updated family ${family.name} timezone to: ${timezone}`);
      
      return c.json({ success: true, family });
    } catch (error) {
      console.error('Failed to update timezone:', error);
      return c.json({ error: 'Failed to update timezone' }, 500);
    }
  }
);

// Get children for family (authenticated - requires family access)
app.get(
  "/make-server-f116e23f/families/:familyId/children",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      
      // Get all children
      const allChildren = await kv.getByPrefix('child:');
      
      // Filter children by family
      const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
      
      // Remove PIN from all children
      const childrenWithoutPins = familyChildren.map((child: any) => {
        const { pin: _, ...childWithoutPin } = child;
        return childWithoutPin;
      });
      
      return c.json(childrenWithoutPins);
    } catch (error) {
      console.error('❌ Error fetching family children:', error);
      return c.json({ error: 'Failed to fetch children' }, 500);
    }
  }
);

// Join family by invite code
app.post(
  "/make-server-f116e23f/families/join",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { inviteCode } = await c.req.json();
      const userId = getAuthUserId(c);
      
      if (!inviteCode || typeof inviteCode !== 'string') {
        return c.json({ error: 'Invalid invite code' }, 400);
      }
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${inviteCode.toUpperCase()}`);
      
      if (!familyId) {
        return c.json({ error: 'Invalid or expired invite code' }, 404);
      }
      
      const family = await kv.get(familyId);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Check if user is already in a family
      const user = await kv.get(`user:${userId}`);
      
      if (user?.familyId && user.familyId !== familyId) {
        return c.json({ error: 'You are already part of another family. Please contact support to switch families.' }, 400);
      }
      
      // Add user to family's parent list if not already there
      if (!family.parentIds.includes(userId)) {
        family.parentIds.push(userId);
        await kv.set(familyId, family);
      }
      
      // Update user record with familyId
      if (user) {
        user.familyId = familyId;
        await kv.set(`user:${userId}`, user);
      }
      
      return c.json({ 
        success: true, 
        family,
        message: `Successfully joined ${family.name}!` 
      });
    } catch (error) {
      return c.json({ error: 'Failed to join family' }, 500);
    }
  }
);

// ===== JOIN REQUEST SYSTEM (Approval Required) =====

// Submit join request (requires admin approval)
app.post(
  "/make-server-f116e23f/families/join-request",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { inviteCode, requestedRole, relationship } = await c.req.json();
      const userId = getAuthUserId(c);
      
      if (!inviteCode || typeof inviteCode !== 'string') {
        return c.json({ error: 'Invalid invite code' }, 400);
      }
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${inviteCode.toUpperCase()}`);
      
      if (!familyId) {
        return c.json({ error: 'Invalid or expired invite code' }, 404);
      }
      
      const family = await kv.get(familyId);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Check if user is already in a family
      const user = await kv.get(`user:${userId}`);
      
      if (user?.familyId) {
        return c.json({ error: 'You are already part of a family' }, 400);
      }
      
      // Check if user already has a pending request
      const existingRequests = await kv.getByPrefix('joinreq:');
      const userPendingRequest = existingRequests.find(
        (req: any) => req.requesterId === userId && req.status === 'pending'
      );
      
      if (userPendingRequest) {
        return c.json({ 
          error: 'You already have a pending join request', 
          existingRequest: userPendingRequest 
        }, 400);
      }
      
      // Create join request
      const requestId = `joinreq:${Date.now()}:${userId}`;
      const joinRequest = {
        id: requestId,
        familyId,
        requesterId: userId,
        requesterName: user?.name || 'Unknown',
        requesterEmail: user?.email || 'Unknown',
        requestedRole: requestedRole || 'parent',
        relationship: relationship || 'spouse',
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null
      };
      
      await kv.set(requestId, joinRequest);
      
      // Notify family parents about new join request (non-blocking)
      try {
        await notifyFamilyParents(familyId, {
          title: '👥 New Join Request',
          body: `${joinRequest.requesterName} wants to join your family`,
          data: {
            type: 'join_request',
            itemId: requestId,
            route: '/settings'
          }
        });
      } catch (notifyError) {
        // Non-blocking - don't fail join request if notification fails
        console.error('Failed to send join request notification:', notifyError);
      }
      
      return c.json({ 
        success: true, 
        request: joinRequest,
        message: `Join request submitted to ${family.name}. Waiting for admin approval.` 
      });
    } catch (error) {
      console.error('Join request error:', error);
      return c.json({ error: 'Failed to submit join request' }, 500);
    }
  }
);

// Get pending join requests for a family (admin only)
app.get(
  "/make-server-f116e23f/families/:familyId/join-requests",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      
      // Get all join requests
      const allRequests = await kv.getByPrefix('joinreq:');
      
      // Filter by family and pending status
      const pendingRequests = allRequests.filter(
        (req: any) => req.familyId === familyId && req.status === 'pending'
      );
      
      return c.json(pendingRequests);
    } catch (error) {
      console.error('Get join requests error:', error);
      return c.json({ error: 'Failed to get join requests' }, 500);
    }
  }
);

// Approve join request (admin only)
app.post(
  "/make-server-f116e23f/families/:familyId/join-requests/:requestId/approve",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      const requestId = c.req.param('requestId');
      const reviewerId = getAuthUserId(c);
      
      // Get the join request
      const joinRequest = await kv.get(requestId);
      
      if (!joinRequest) {
        return c.json({ error: 'Join request not found' }, 404);
      }
      
      if (joinRequest.familyId !== familyId) {
        return c.json({ error: 'Join request does not belong to this family' }, 403);
      }
      
      if (joinRequest.status !== 'pending') {
        return c.json({ error: 'Join request already processed' }, 400);
      }
      
      // Get family and user
      const family = await kv.get(familyId);
      const requester = await kv.get(`user:${joinRequest.requesterId}`);
      
      if (!family || !requester) {
        return c.json({ error: 'Family or user not found' }, 404);
      }
      
      // Add user to family
      if (!family.parentIds.includes(joinRequest.requesterId)) {
        family.parentIds.push(joinRequest.requesterId);
        await kv.set(familyId, family);
      }
      
      // Update user record
      requester.familyId = familyId;
      requester.role = joinRequest.requestedRole;
      await kv.set(`user:${joinRequest.requesterId}`, requester);
      
      // Update join request status
      joinRequest.status = 'approved';
      joinRequest.reviewedBy = reviewerId;
      joinRequest.reviewedAt = new Date().toISOString();
      await kv.set(requestId, joinRequest);
      
      return c.json({ 
        success: true, 
        message: `${requester.name} has been added to ${family.name}!`,
        family,
        joinRequest
      });
    } catch (error) {
      console.error('Approve join request error:', error);
      return c.json({ error: 'Failed to approve join request' }, 500);
    }
  }
);

// Deny join request (admin only)
app.post(
  "/make-server-f116e23f/families/:familyId/join-requests/:requestId/deny",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      const requestId = c.req.param('requestId');
      const reviewerId = getAuthUserId(c);
      
      // Get the join request
      const joinRequest = await kv.get(requestId);
      
      if (!joinRequest) {
        return c.json({ error: 'Join request not found' }, 404);
      }
      
      if (joinRequest.familyId !== familyId) {
        return c.json({ error: 'Join request does not belong to this family' }, 403);
      }
      
      if (joinRequest.status !== 'pending') {
        return c.json({ error: 'Join request already processed' }, 400);
      }
      
      // Update join request status
      joinRequest.status = 'denied';
      joinRequest.reviewedBy = reviewerId;
      joinRequest.reviewedAt = new Date().toISOString();
      await kv.set(requestId, joinRequest);
      
      return c.json({ 
        success: true, 
        message: 'Join request denied',
        joinRequest
      });
    } catch (error) {
      console.error('Deny join request error:', error);
      return c.json({ error: 'Failed to deny join request' }, 500);
    }
  }
);

// Get my own join request (no familyId required)
app.get(
  "/make-server-f116e23f/auth/my-join-request",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get all join requests
      const allRequests = await kv.getByPrefix('joinreq:');
      
      // Find requests by this user (should only be one active)
      const myRequests = allRequests.filter(
        (req: any) => req.requesterId === userId
      );
      
      // Return the most recent one
      if (myRequests.length > 0) {
        const mostRecent = myRequests.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        return c.json(mostRecent);
      }
      
      return c.json({ error: 'No join request found' }, 404);
    } catch (error) {
      console.error('Get my join request error:', error);
      return c.json({ error: 'Failed to get join request' }, 500);
    }
  }
);

// Generate or regenerate invite code for existing family
app.post(
  "/make-server-f116e23f/families/:id/generate-invite-code",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const family = await kv.get(id);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Generate a new unique 6-character invite code
      let inviteCode: string;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        attempts++;
        
        // Check if this code is already in use
        const existingFamilyId = await kv.get(`invite:${inviteCode}`);
        if (!existingFamilyId || existingFamilyId === id) {
          break; // Code is available or already belongs to this family
        }
        
        if (attempts >= maxAttempts) {
          return c.json({ error: 'Failed to generate unique invite code. Please try again.' }, 500);
        }
      } while (attempts < maxAttempts);
      
      // Remove old invite code mapping if it exists
      if (family.inviteCode) {
        await kv.del(`invite:${family.inviteCode}`);
      }
      
      // Update family with new invite code
      family.inviteCode = inviteCode;
      await kv.set(id, family);
      
      // Store new invite code mapping
      await kv.set(`invite:${inviteCode}`, id);
      
      return c.json({ 
        success: true, 
        inviteCode,
        message: 'Invite code generated successfully!' 
      });
    } catch (error) {
      console.error('Error generating invite code:', error);
      return c.json({ error: 'Failed to generate invite code' }, 500);
    }
  }
);

// Create child
app.post(
  "/make-server-f116e23f/children",
  requireAuth,
  requireParent,
  validate(validateChild),
  async (c) => {
    try {
      const { name, familyId, avatar, pin } = getValidatedBody(c);
      const childId = `child:${Date.now()}`;
      
      // Hash the PIN for security (simple hash for demo, use bcrypt in production)
      const hashedPin = pin ? await hashPin(pin) : null;
      
      const child = {
        id: childId,
        name,
        familyId,
        avatar: avatar || '👶',
        pin: hashedPin,
        currentPoints: 0,
        highestMilestone: 0,
        targetRewardId: null,
        createdAt: new Date().toISOString()
      };
      
      await kv.set(childId, child);
      
      // Return child without PIN
      const { pin: _, ...childWithoutPin } = child;
      return c.json(childWithoutPin);
    } catch (error) {
      return c.json({ error: 'Failed to create child' }, 500);
    }
  }
);

// Get child by ID (authenticated - requires child access)
app.get(
  "/make-server-f116e23f/children/:childId",
  requireAuth,
  requireChildAccess,
  async (c) => {
    try {
      const childId = c.req.param('childId');
      const child = await kv.get(childId);
      
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      // Return child without PIN
      const { pin: _, ...childWithoutPin } = child;
      return c.json(childWithoutPin);
    } catch (error) {
      console.error('❌ Error fetching child:', error);
      return c.json({ error: 'Failed to fetch child' }, 500);
    }
  }
);

// Verify child PIN
app.post(
  "/make-server-f116e23f/children/:id/verify-pin",
  validate(validatePinVerify),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { pin, rememberDevice } = getValidatedBody(c);
      
      // Get device hash for rate limiting
      const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Real-IP") || c.req.header("X-Forwarded-For")?.split(',')[0] || "unknown";
      const userAgent = c.req.header("User-Agent") || "unknown";
      const deviceHash = getDeviceHash(ip, userAgent);
      
      // Check if PIN attempts are locked
      const lockStatus = await isPinLocked(id, deviceHash);
      if (lockStatus.locked) {
        return c.json({
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          locked: true,
          retryAfter: lockStatus.retryAfter
        }, 429);
      }
      
      const child = await kv.get(id);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      const hashedPin = await hashPin(pin);
      if (child.pin === hashedPin) {
        // ✅ PIN correct - create kid session
        const { token, expiresAt } = await createKidSession(id, rememberDevice || false);
        
        // Reset failure tracking
        await resetPinFailures(id, deviceHash);
        
        const { pin: _, ...childWithoutPin } = child;
        
        return c.json({
          success: true,
          child: childWithoutPin,
          kidSessionToken: token,
          expiresAt,
          message: `Welcome back, ${child.name} ✨`
        });
      } else {
        // ❌ PIN incorrect - track failure
        const failureResult = await trackPinFailure(id, deviceHash);
        
        if (failureResult.locked) {
          return c.json({
            success: false,
            error: `Too many failed attempts. Locked for ${Math.ceil((failureResult.retryAfter || 0) / 60)} minutes.`,
            locked: true,
            retryAfter: failureResult.retryAfter
          }, 429);
        }
        
        return c.json({
          success: false,
          error: 'Oops — try again 🌙',
          attemptsRemaining: failureResult.attemptsRemaining
        }, 401);
      }
    } catch (error) {
      return c.json({ error: 'Failed to verify PIN' }, 500);
    }
  }
);

// Simple PIN hashing function
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// NEW: Kid Login with Family Code + Child ID
// POST /kid/login - Auth endpoint for kids using family code + childId + PIN
app.post(
  "/make-server-f116e23f/kid/login",
  async (c) => {
    try {
      const { familyCode, childId, pin } = await c.req.json();
      
      if (!familyCode || !childId || !pin) {
        return c.json({ 
          success: false, 
          error: 'Family code, child ID, and PIN are required' 
        }, 400);
      }
      
      // Get device hash for rate limiting
      const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Real-IP") || c.req.header("X-Forwarded-For")?.split(',')[0] || "unknown";
      const userAgent = c.req.header("User-Agent") || "unknown";
      const deviceHash = getDeviceHash(ip, userAgent);
      
      // Look up family by invite code
      const familyId = await kv.get(`invite:${familyCode.toUpperCase()}`);
      if (!familyId) {
        return c.json({ 
          success: false, 
          error: 'Invalid family code' 
        }, 404);
      }
      
      // Get the child directly by ID
      const child = await kv.get(childId);
      
      if (!child) {
        return c.json({ 
          success: false, 
          error: 'Child not found' 
        }, 404);
      }
      
      // Verify child belongs to the family
      if (child.familyId !== familyId) {
        return c.json({ 
          success: false, 
          error: 'Child not found in this family' 
        }, 404);
      }
      
      // Check if PIN attempts are locked
      const lockStatus = await isPinLocked(child.id, deviceHash);
      if (lockStatus.locked) {
        return c.json({
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          locked: true,
          retryAfter: lockStatus.retryAfter
        }, 429);
      }
      
      // Verify PIN
      const hashedPin = await hashPin(pin);
      if (child.pin !== hashedPin) {
        // Track failure
        const failureResult = await trackPinFailure(child.id, deviceHash);
        
        // MONITORING: Track failed kid login
        monitoring.trackKidLogin(false, child.id, familyCode.toUpperCase(), 'incorrect_pin');
        
        if (failureResult.locked) {
          monitoring.trackRateLimit('/kid/login', `child:${child.id}`, 'kid_login');
          return c.json({
            success: false,
            error: `Too many failed attempts. Locked for ${Math.ceil((failureResult.retryAfter || 0) / 60)} minutes.`,
            locked: true,
            retryAfter: failureResult.retryAfter
          }, 429);
        }
        
        return c.json({
          success: false,
          error: 'Incorrect PIN. Try again! 🌙',
          attemptsRemaining: failureResult.attemptsRemaining
        }, 401);
      }
      
      // PIN correct - create kid session
      console.log('🔐 Creating kid session for child:', {
        childId: child.id,
        childIdType: typeof child.id,
        childIdLength: child.id?.length,
        hasChildPrefix: child.id?.startsWith('child:'),
        familyId: child.familyId
      });
      
      const { token, expiresAt } = await createKidSession(child.id, false);
      
      console.log('✅ Kid session created:', {
        tokenPreview: token.substring(0, 30) + '...',
        tokenLength: token.length,
        childId: child.id,
        expiresAt
      });
      
      // Reset failure tracking
      await resetPinFailures(child.id, deviceHash);
      
      // MONITORING: Track successful kid login
      monitoring.trackKidLogin(true, child.id, familyCode.toUpperCase());
      
      // Return kid access token and info
      const { pin: _, ...childWithoutPin } = child;
      
      return c.json({
        success: true,
        kidAccessToken: token,
        kid: {
          id: child.id,
          name: child.name,
          avatar: child.avatar,
          familyId: familyId
        },
        familyCode: familyCode.toUpperCase(),
        expiresAt,
        message: `Welcome back, ${child.name}! ✨`
      });
      
    } catch (error) {
      console.error('Kid login error:', error);
      monitoring.trackError(500, '/kid/login', error as Error);
      monitoring.trackKidLogin(false, undefined, undefined, (error as Error).message);
      return c.json({ 
        success: false, 
        error: 'Login failed. Please try again.' 
      }, 500);
    }
  }
);

// PUBLIC ENDPOINT: Get children for kid login screen (no auth required)
// This endpoint returns basic child info (id, name, avatar) for display on kid login
// It deliberately excludes sensitive fields like PINs
app.get(
  "/make-server-f116e23f/families/:familyId/children/public",
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      
      const allChildren = await kv.getByPrefix('child:');
      const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
      
      const publicChildren = familyChildren.map((child: any) => ({
        id: child.id,
        name: child.name,
        avatar: child.avatar || '👶',
        familyId: child.familyId
      }));
      
      return c.json(publicChildren);
    } catch (error) {
      return c.json({ error: 'Failed to get children' }, 500);
    }
  }
);

// Get children by family
app.get(
  "/make-server-f116e23f/families/:familyId/children",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const familyId = c.req.param('familyId');
    console.log(`📡 Getting children for family: ${familyId}`);
    
    const allChildren = await kv.getByPrefix('child:');
    console.log(`📊 Total children in database: ${allChildren.length}`);
    
    const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
    console.log(`✅ Children for family ${familyId}: ${familyChildren.length}`);
    
    if (familyChildren.length > 0) {
      console.log('📋 Children found:', familyChildren.map((c: any) => ({ id: c.id, name: c.name, familyId: c.familyId })));
    } else {
      console.warn(`⚠️ No children found for family ${familyId}`);
      console.log('📋 All families in children:', [...new Set(allChildren.map((c: any) => c.familyId))]);
    }
    
    return c.json(familyChildren);
  } catch (error) {
    console.error('❌ Error getting children:', error);
    return c.json({ error: 'Failed to get children' }, 500);
  }
});

// NOTE: GET /children/:id endpoint is defined earlier in the file with requireChildAccess middleware
// Duplicate removed to prevent route conflicts

// Update child points
app.patch(
  "/make-server-f116e23f/children/:id",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const child = await kv.get(id);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    const updated = { ...child, ...updates };
    await kv.set(id, updated);
    
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update child' }, 500);
  }
});

// ===== POINT EVENTS =====

// Log point event
app.post(
  "/make-server-f116e23f/events",
  requireAuth,
  requireParent,
  validate(validatePointEvent),
  async (c) => {
    try {
      const eventData = getValidatedBody(c);
    const { idempotencyKey, childId, trackableItemId } = eventData;
    
    // Generate event ID early (needed for claim-first pattern)
    const eventId = `event:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    // === IDEMPOTENCY: Claim-first pattern (KV-safe) ===
    if (idempotencyKey) {
      const claimKey = `eventclaim:${idempotencyKey}`;
      
      // Try to atomically claim this idempotency key with our eventId
      const claimed = await kv.setIfAbsent(claimKey, {
        eventId,
        createdAt: new Date().toISOString(),
        status: 'PENDING'
      });
      
      if (!claimed) {
        // Claim already exists - return the existing event
        const existingClaim = await kv.get(claimKey);
        
        if (existingClaim.eventId) {
          const existingEvent = await kv.get(existingClaim.eventId);
          if (existingEvent) {
            return c.json(existingEvent);
          }
        }
      }
    }
    
    // === SINGLETON: Lock-first pattern (KV-safe) ===
    if (trackableItemId) {
      const item = await kv.get(trackableItemId);
      if (item && item.isSingleton) {
        // Get family timezone for accurate day boundaries
        const childForTz = await kv.get(childId);
        const family = childForTz?.familyId ? await kv.get(childForTz.familyId) : null;
        const timezone = family?.timezone || 'UTC';
        
        // NEW: Use timezone-aware date
        const today = getTodayInTimezone(timezone);
        const singletonKey = `singleton:${childId}:${trackableItemId}:${today}`;
        
        // Try to atomically acquire singleton lock
        const locked = await kv.setIfAbsent(singletonKey, {
          eventId,
          performedBy: eventData.loggedBy,
          timestamp: new Date().toISOString(),
          status: 'PENDING'
        });
        
        if (!locked) {
          // Lock already exists - singleton conflict
          const existingLock = await kv.get(singletonKey);
          const existingEvent = await kv.get(existingLock.eventId);
          const performedByUser = await kv.get(`user:${existingLock.performedBy}`);
          
          if (idempotencyKey) {
            await kv.del(`eventclaim:${idempotencyKey}`);
          }
          
          return c.json({
            error: 'Singleton already logged',
            conflict: {
              eventId: existingLock.eventId,
              loggedBy: performedByUser?.name || 'Another parent',
              loggedAt: existingEvent?.timestamp,
              item: item.name
            }
          }, 409);
        }
        // If we get here, we successfully acquired the singleton lock
      }
    }
    
    // === DAILY CAP: Lock-protected check (KV-safe) ===
    if (childId && eventData.points > 0 && !eventData.isAdjustment && !eventData.isRecovery && !eventData.challengeId && !eventData.quizId) {
      // Get child to access family timezone
      const childForTz = await kv.get(childId);
      const family = childForTz?.familyId ? await kv.get(childForTz.familyId) : null;
      const timezone = family?.timezone || 'UTC';
      
      // NEW: Use timezone-aware date calculation
      const today = getTodayInTimezone(timezone);
      const capLockKey = `caplock:${childId}:${today}`;
      
      // Try to acquire cap lock (with retry logic)
      let capLockAcquired = false;
      let retries = 0;
      const maxRetries = 5;
      
      while (!capLockAcquired && retries < maxRetries) {
        capLockAcquired = await kv.setIfAbsent(capLockKey, {
          holder: eventId,
          acquiredAt: new Date().toISOString()
        });
        
        if (!capLockAcquired) {
          // Lock held by another request - wait briefly and retry
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
          
          // Check if lock is stale (older than 3 seconds)
          const existingLock = await kv.get(capLockKey);
          if (existingLock && existingLock.acquiredAt) {
            const lockAge = Date.now() - new Date(existingLock.acquiredAt).getTime();
            if (lockAge > 3000) {
              // Stale lock - force release and retry
              await kv.del(capLockKey);
            }
          }
        }
        retries++;
      }
      
      if (!capLockAcquired) {
        // Could not acquire lock after retries
        
        // Release our claims
        if (idempotencyKey) await kv.del(`eventclaim:${idempotencyKey}`);
        if (trackableItemId) {
          const item = await kv.get(trackableItemId);
          if (item?.isSingleton) {
            await kv.del(`singleton:${childId}:${trackableItemId}:${today}`);
          }
        }
        
        return c.json({ error: 'System busy, please retry' }, 503);
      }
      
      try {
        // Lock acquired - perform cap check and update atomically
        const child = await kv.get(childId);
        if (child) {
          const lastReset = child.lastResetDate || '';
          
          // Reset daily counter if new day
          if (lastReset !== today) {
            child.dailyPointsEarned = 0;
            child.lastResetDate = today;
          }
          
          const cap = child.dailyPointsCap || 50;
          const currentDaily = child.dailyPointsEarned || 0;
          
          if (currentDaily + eventData.points > cap) {
            // Cap exceeded - release all locks and return error
            await kv.del(capLockKey);
            if (idempotencyKey) await kv.del(`eventclaim:${idempotencyKey}`);
            if (trackableItemId) {
              const item = await kv.get(trackableItemId);
              if (item?.isSingleton) {
                await kv.del(`singleton:${childId}:${trackableItemId}:${today}`);
              }
            }
            
            return c.json({ 
              error: 'Daily point cap reached', 
              cap, 
              current: currentDaily,
              message: `Daily cap of ${cap} points reached. Current: ${currentDaily}. This would exceed by ${(currentDaily + eventData.points) - cap} points.`
            }, 400);
          }
          
          // Update daily earned (atomic under lock)
          child.dailyPointsEarned = currentDaily + eventData.points;
          await kv.set(childId, child);
        }
      } finally {
        // Release cap lock
        await kv.del(capLockKey);
      }
    }
    
    // === CREATE EVENT (all locks acquired) ===
    const event = {
      id: eventId,
      ...eventData,
      timestamp: new Date().toISOString(),
      idempotencyKey: idempotencyKey || null,
      status: 'active'
    };
    
    await kv.set(eventId, event);
    
    // Finalize idempotency claim (update status from PENDING to ACTIVE)
    if (idempotencyKey) {
      await kv.set(`eventclaim:${idempotencyKey}`, {
        eventId,
        createdAt: event.timestamp,
        status: 'ACTIVE'
      });
    }
    
    // Finalize singleton lock (update status from PENDING to ACTIVE)
    if (trackableItemId) {
      const item = await kv.get(trackableItemId);
      if (item && item.isSingleton) {
        // Get family timezone
        const childForTz = await kv.get(childId);
        const family = childForTz?.familyId ? await kv.get(childForTz.familyId) : null;
        const timezone = family?.timezone || 'UTC';
        
        // NEW: Use timezone-aware date
        const today = getTodayInTimezone(timezone);
        const singletonKey = `singleton:${childId}:${trackableItemId}:${today}`;
        await kv.set(singletonKey, {
          eventId,
          performedBy: eventData.loggedBy,
          timestamp: event.timestamp,
          status: 'ACTIVE'
        });
      }
    }
    
    // === UPDATE CHILD POINTS (Ledger-first approach) ===
    if (childId && eventData.points) {
      const child = await kv.get(childId);
      if (child) {
        // Use integer points only (round if fractional)
        const pointsToAdd = Math.round(eventData.points);
        let newPoints = child.currentPoints + pointsToAdd;
        const newHighest = Math.max(child.highestMilestone || 0, newPoints);
        
        // Milestone floor protection - cannot go below highest milestone
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= newHighest)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        if (newPoints < floor) {
          newPoints = floor;
        }
        
        // Ensure points never go negative
        if (newPoints < 0) {
          newPoints = 0;
        }
        
        // Update streak if it's a habit
        let streakData = child.streaks || {};
        if (trackableItemId && eventData.points > 0) {
          const item = await kv.get(trackableItemId);
          if (item && item.type === 'habit') {
            const today = new Date().toISOString().split('T')[0];
            const currentStreak = streakData[trackableItemId] || { current: 0, longest: 0, lastLogged: null };
            
            // Check if logged yesterday (consecutive)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (currentStreak.lastLogged === yesterdayStr) {
              // Continue streak
              currentStreak.current += 1;
              currentStreak.longest = Math.max(currentStreak.longest, currentStreak.current);
            } else if (currentStreak.lastLogged === today) {
              // Already logged today, don't increment
            } else {
              // Start new streak or reset
              currentStreak.current = 1;
              currentStreak.longest = Math.max(currentStreak.longest || 0, 1);
            }
            
            currentStreak.lastLogged = today;
            streakData[trackableItemId] = currentStreak;
          }
        }
        
        await kv.set(childId, {
          ...child,
          currentPoints: newPoints,
          highestMilestone: newHighest,
          streaks: streakData
        });
      }
    }
    
    return c.json(event);
  } catch (error) {
    return c.json({ error: 'Failed to log event', details: String(error) }, 500);
  }
});

// Get events for child
app.get(
  "/make-server-f116e23f/children/:childId/events",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allEvents = await kv.getByPrefix('event:');
    const childEvents = allEvents
      .filter((event: any) => event.childId === childId && event.status !== 'voided') // Exclude voided events
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // ✅ CRITICAL FIX: Add logged_by_display to each event
    // This prevents UUIDs from showing in the audit trail
    const eventsWithNames = await Promise.all(
      childEvents.map(async (event: any) => {
        let loggedByDisplay = 'System';
        
        if (event.loggedBy && event.loggedBy !== 'system') {
          // Try to get user (parent) name first
          const user = await kv.get(`user:${event.loggedBy}`);
          if (user?.name) {
            loggedByDisplay = user.name;
          } else if (user?.email) {
            loggedByDisplay = user.email;
          } else {
            // Try to get child name (in case kid logged it)
            const child = await kv.get(event.loggedBy);
            if (child?.name) {
              loggedByDisplay = child.name;
            } else {
              loggedByDisplay = 'User';
            }
          }
        }
        
        return {
          ...event,
          logged_by_display: loggedByDisplay
        };
      })
    );
    
    return c.json(eventsWithNames);
  } catch (error) {
    return c.json({ error: 'Failed to get events' }, 500);
  }
});

// Void/soft-delete event (no hard deletes allowed)
app.post(
  "/make-server-f116e23f/events/:id/void",
  requireAuth,
  requireParent,
  validate(validateVoid),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { voidReason } = getValidatedBody(c);
      const voidedBy = getAuthUserId(c);
    
    if (!voidReason || voidReason.trim().length < 10) {
      return c.json({ error: 'Void reason required (minimum 10 characters)' }, 400);
    }
    
    const event = await kv.get(id);
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }
    
    // IDEMPOTENCY: If already voided, return existing voided event (don't re-apply)
    if (event.status === 'voided') {
      return c.json(event);
    }
    
    const voidClaimKey = `voidclaim:${id}`;
    const existingClaim = await kv.get(voidClaimKey);
    
    if (existingClaim) {
      const voidedEvent = await kv.get(id);
      return c.json(voidedEvent);
    }
    
    // Claim the void operation
    await kv.set(voidClaimKey, { voidedBy, timestamp: new Date().toISOString() });
    
    // Mark as voided (soft delete)
    const voidedEvent = {
      ...event,
      status: 'voided',
      voidedBy,
      voidedAt: new Date().toISOString(),
      voidReason
    };
    
    await kv.set(id, voidedEvent);
    
    // Reverse the points from the child (ONCE - idempotent due to claim key)
    if (event.childId && event.points) {
      const child = await kv.get(event.childId);
      if (child) {
        const reversedPoints = child.currentPoints - event.points;
        const newPoints = Math.max(0, reversedPoints); // Never go negative
        
        // Apply milestone floor
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= child.highestMilestone)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        const finalPoints = Math.max(newPoints, floor);
        
        await kv.set(event.childId, {
          ...child,
          currentPoints: finalPoints
        });
      }
    }
    
    return c.json(voidedEvent);
  } catch (error) {
    return c.json({ error: 'Failed to void event', details: String(error) }, 500);
  }
});

// ===== ATTENDANCE =====

// Create attendance record
app.post(
  "/make-server-f116e23f/attendance",
  requireAuth,
  requireParent,
  validate(validateAttendance),
  async (c) => {
  try {
    const recordData = await c.req.json();
    const recordId = `attendance:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const record = {
      id: recordId,
      ...recordData,
      timestamp: new Date().toISOString()
    };
    
    await kv.set(recordId, record);
    return c.json(record);
  } catch (error) {
    return c.json({ error: 'Failed to create attendance record' }, 500);
  }
});

// Get attendance for child
app.get(
  "/make-server-f116e23f/children/:childId/attendance",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allRecords = await kv.getByPrefix('attendance:');
    const childRecords = allRecords
      .filter((record: any) => record.childId === childId)
      .sort((a: any, b: any) => new Date(b.classDate).getTime() - new Date(a.classDate).getTime());
    
    return c.json(childRecords);
  } catch (error) {
    return c.json({ error: 'Failed to get attendance' }, 500);
  }
});

// Delete attendance record
app.delete(
  "/make-server-f116e23f/attendance/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const attendanceId = c.req.param('id');
    
    // Check if record exists
    const record = await kv.get(attendanceId);
    if (!record) {
      return c.json({ error: 'Attendance record not found' }, 404);
    }
    
    // Delete the record
    await kv.del(attendanceId);
    return c.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    return c.json({ error: 'Failed to delete attendance record', details: String(error) }, 500);
  }
});

// ===== PROVIDERS =====

// Create provider
app.post(
  "/make-server-f116e23f/providers",
  requireAuth,
  requireParent,
  validate(validateProvider),
  async (c) => {
  try {
    const providerData = await c.req.json();
    const providerId = `provider:${Date.now()}`;
    
    const provider = {
      id: providerId,
      ...providerData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(providerId, provider);
    return c.json(provider);
  } catch (error) {
    return c.json({ error: 'Failed to create provider' }, 500);
  }
});

// Get all providers
app.get(
  "/make-server-f116e23f/providers",
  requireAuth,
  async (c) => {
  try {
    const providers = await kv.getByPrefix('provider:');
    return c.json(providers);
  } catch (error) {
    return c.json({ error: 'Failed to get providers' }, 500);
  }
});

// Update provider
app.put(
  "/make-server-f116e23f/providers/:id",
  requireAuth,
  requireParent,
  validate(validateProvider),
  async (c) => {
  try {
    const { id } = c.req.param();
    const updateData = await c.req.json();
    
    const existing = await kv.get(id);
    if (!existing) {
      return c.json({ error: 'Provider not found' }, 404);
    }
    
    const updated = {
      ...existing,
      ...updateData,
      id, // Keep original ID
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(id, updated);
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update provider' }, 500);
  }
});

// Delete provider
app.delete(
  "/make-server-f116e23f/providers/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const { id } = c.req.param();
    await kv.del(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete provider' }, 500);
  }
});

// ===== CHALLENGES =====

// Dynamic quest template generation based on family's actual configured behaviors
async function generateQuestTemplates(familyId: string, type: 'daily' | 'weekly') {
  try {
    const templates = [];
    
    // Get quest settings for this family
    const questSettings = await kv.get(`questsettings:${familyId}`) || {
      enabled: true,
      dailyBonusPoints: 20,
      weeklyBonusPoints: 50,
      difficultyMultipliers: { easy: 1, medium: 1.5, hard: 2 }
    };
    
    // Base bonus points based on quest type
    const baseBonus = type === 'daily' ? questSettings.dailyBonusPoints : questSettings.weeklyBonusPoints;
    const multipliers = questSettings.difficultyMultipliers;
    
    // Helper function to calculate bonus points based on difficulty
    const calculateBonus = (difficulty: 'easy' | 'medium' | 'hard') => {
      return Math.round(baseBonus * (multipliers[difficulty] || 1));
    };
    
    // Fetch all trackable items for this family.
    // NOTE: POST /trackable-items stores items under `item:<timestamp>` (NOT
    // `item:<familyId>:<timestamp>`), so we must scan the global `item:`
    // prefix and then filter by familyId. Legacy items written before we
    // started stamping familyId are accepted as well (familyId missing).
    const rawItems = await kv.getByPrefix('item:');
    const allItems = rawItems.filter((it: any) =>
      it && (it.familyId === familyId || !it.familyId)
    );
    
    // Categorize items
    const salahItems = allItems.filter((item: any) => item.category === 'salah');
    const positiveItems = allItems.filter((item: any) => 
      item.category === 'behavior' && item.points > 0
    );
    const negativeItems = allItems.filter((item: any) => 
      item.category === 'behavior' && item.points < 0
    );
    const habitItems = allItems.filter((item: any) => item.category === 'habit');
    
    // DAILY QUESTS
    if (type === 'daily') {
      // Easy - Single Salah
      if (salahItems.length > 0) {
        const fajr = salahItems.find((s: any) => s.name.toLowerCase().includes('fajr'));
        if (fajr) {
          templates.push({
            id: `tpl_daily_fajr_${familyId}`,
            type: 'daily',
            title: '🌅 Early Riser',
            description: `Pray ${fajr.name} on time today`,
            difficulty: 'easy',
            bonusPoints: calculateBonus('easy'),
            category: 'salah',
            icon: '🌅',
            requirements: [{ 
              type: 'specific-items', 
              target: 1, 
              itemIds: [fajr.id], 
              description: `Complete ${fajr.name} prayer` 
            }]
          });
        }
        
        // Add other individual prayer quests
        salahItems.slice(0, 3).forEach((salah: any) => {
          if (!salah.name.toLowerCase().includes('fajr')) {
            templates.push({
              id: `tpl_daily_${salah.id}`,
              type: 'daily',
              title: `🕌 ${salah.name} Champion`,
              description: `Pray ${salah.name} on time today`,
              difficulty: 'easy',
              bonusPoints: calculateBonus('easy'),
              category: 'salah',
              icon: '🕌',
              requirements: [{ 
                type: 'specific-items', 
                target: 1, 
                itemIds: [salah.id], 
                description: `Complete ${salah.name}` 
              }]
            });
          }
        });
      }
      
      // Easy - Single Positive Behavior
      positiveItems.slice(0, 3).forEach((behavior: any) => {
        const icons = ['✨', '🤝', '⭐', '💪', '🎯'];
        const titles = ['Super Star', 'Helpful Hero', 'Amazing', 'Champion', 'Master'];
        const randomIcon = icons[Math.floor(Math.random() * icons.length)];
        const randomTitle = titles[Math.floor(Math.random() * titles.length)];
        
        templates.push({
          id: `tpl_daily_${behavior.id}`,
          type: 'daily',
          title: `${randomIcon} ${behavior.name} ${randomTitle}`,
          description: `${behavior.name} today`,
          difficulty: 'easy',
          bonusPoints: calculateBonus('easy'),
          category: 'behavior',
          icon: randomIcon,
          requirements: [{ 
            type: 'specific-items', 
            target: 1, 
            itemIds: [behavior.id], 
            description: behavior.name 
          }]
        });
      });
      
      // Medium - All 5 Prayers
      if (salahItems.length >= 5) {
        templates.push({
          id: `tpl_daily_all_salah_${familyId}`,
          type: 'daily',
          title: '🕌 Prayer Warrior',
          description: 'Pray all 5 daily prayers on time',
          difficulty: 'medium',
          bonusPoints: calculateBonus('medium'),
          category: 'salah',
          icon: '🕌',
          requirements: [{ 
            type: 'specific-items', 
            target: 5, 
            itemIds: salahItems.slice(0, 5).map((s: any) => s.id), 
            description: 'Complete all 5 prayers' 
          }]
        });
      }
      
      // Medium - Zero Negative Behaviors
      if (negativeItems.length > 0) {
        templates.push({
          id: `tpl_daily_perfect_behavior_${familyId}`,
          type: 'daily',
          title: '😇 Perfect Behavior',
          description: 'Go the whole day with no negative behaviors',
          difficulty: 'medium',
          bonusPoints: calculateBonus('medium'),
          category: 'behavior',
          icon: '😇',
          requirements: [{ 
            type: 'count', 
            target: 0, 
            description: 'Zero negative events today' 
          }]
        });
      }
      
      // Medium - Multiple Positive Behaviors
      if (positiveItems.length >= 3) {
        const selectedBehaviors = positiveItems.slice(0, 3);
        templates.push({
          id: `tpl_daily_multi_behavior_${familyId}`,
          type: 'daily',
          title: '⭐ Multi-Tasker',
          description: `Complete ${selectedBehaviors.map((b: any) => b.name).join(', ')}`,
          difficulty: 'medium',
          bonusPoints: calculateBonus('medium'),
          category: 'behavior',
          icon: '⭐',
          requirements: [{ 
            type: 'specific-items', 
            target: selectedBehaviors.length, 
            itemIds: selectedBehaviors.map((b: any) => b.id), 
            description: `Complete ${selectedBehaviors.length} different tasks` 
          }]
        });
      }
      
      // Hard - Point Goal
      templates.push({
        id: `tpl_daily_points_${familyId}`,
        type: 'daily',
        title: '🌟 Super Star Day',
        description: 'Earn 30+ points in positive actions today',
        difficulty: 'hard',
        bonusPoints: calculateBonus('hard'),
        category: 'general',
        icon: '🌟',
        requirements: [{ 
          type: 'total-points', 
          target: 30, 
          description: 'Earn 30 points from positive actions' 
        }]
      });
    }
    
    // WEEKLY QUESTS
    if (type === 'weekly') {
      // Easy - Repeat Positive Behavior
      positiveItems.slice(0, 2).forEach((behavior: any) => {
        const icons = ['📚', '📖', '🎓', '💼', '🎯'];
        const randomIcon = icons[Math.floor(Math.random() * icons.length)];
        
        templates.push({
          id: `tpl_weekly_${behavior.id}`,
          type: 'weekly',
          title: `${randomIcon} ${behavior.name} Champion`,
          description: `${behavior.name} 5 times this week`,
          difficulty: 'easy',
          bonusPoints: calculateBonus('easy'),
          category: 'behavior',
          icon: randomIcon,
          requirements: [{ 
            type: 'specific-items', 
            target: 5, 
            itemIds: [behavior.id], 
            description: `${behavior.name} 5 times` 
          }]
        });
      });
      
      // Medium - Fajr Streak (if Fajr exists)
      if (salahItems.length > 0) {
        const fajr = salahItems.find((s: any) => s.name.toLowerCase().includes('fajr'));
        if (fajr) {
          templates.push({
            id: `tpl_weekly_fajr_streak_${familyId}`,
            type: 'weekly',
            title: '🔥 Fajr Streak Master',
            description: 'Pray Fajr every day this week (7 days)',
            difficulty: 'medium',
            bonusPoints: calculateBonus('medium'),
            category: 'salah',
            icon: '🔥',
            requirements: [{ 
              type: 'specific-items', 
              target: 7, 
              itemIds: [fajr.id], 
              description: 'Maintain 7-day Fajr streak' 
            }]
          });
        }
      }
      
      // Medium - Multiple Behavior Repetitions
      if (positiveItems.length >= 2) {
        const behavior = positiveItems[Math.floor(Math.random() * positiveItems.length)];
        templates.push({
          id: `tpl_weekly_consistent_${behavior.id}`,
          type: 'weekly',
          title: '💪 Consistency Champion',
          description: `${behavior.name} 10 times this week`,
          difficulty: 'medium',
          bonusPoints: calculateBonus('medium'),
          category: 'behavior',
          icon: '💪',
          requirements: [{ 
            type: 'specific-items', 
            target: 10, 
            itemIds: [behavior.id], 
            description: `${behavior.name} 10 times` 
          }]
        });
      }
      
      // Hard - Perfect Week
      if (salahItems.length >= 5 && positiveItems.length > 0) {
        templates.push({
          id: `tpl_weekly_perfect_${familyId}`,
          type: 'weekly',
          title: '🏆 Perfect Week',
          description: 'Complete all prayers every day and have zero negative behaviors',
          difficulty: 'hard',
          bonusPoints: calculateBonus('hard'),
          category: 'general',
          icon: '🏆',
          requirements: [
            { 
              type: 'specific-items', 
              target: 35, 
              itemIds: salahItems.slice(0, 5).map((s: any) => s.id), 
              description: 'All prayers (5×7 = 35)' 
            },
            { 
              type: 'count', 
              target: 0, 
              description: 'Zero negative behaviors' 
            }
          ]
        });
      }
    }
    
    return templates;
  } catch (error) {
    console.error('Error generating quest templates:', error);
    return [];
  }
}

// Calculate challenge progress based on point events
async function calculateChallengeProgress(challenge: any, childId: string) {
  try {
    const allEvents = await kv.getByPrefix('event:');

    // v10: Anchor the progress window to family-local 00:00 instead of the
    // exact `createdAt` instant.
    //
    // Why: a parent who taps "Generate Daily" at 8am EST creates a quest
    // with createdAt=08:00. The kid's prayers from 5:30am Fajr, however,
    // were logged earlier the same family-local day. With the old window
    // (createdAt → expiresAt) those prayers fell outside the window and
    // never counted toward the quest. Anchoring to the family-tz day-start
    // makes the window match what a human would call "today".
    //
    // We pull the family timezone via the child → family chain and fall
    // back to UTC when missing.
    let _tz = 'UTC';
    try {
      const _child = await kv.get(childId);
      if (_child?.familyId) {
        const _family = await kv.get(`family:${_child.familyId}`);
        if (_family?.timezone) _tz = _family.timezone;
      }
    } catch (_e) {
      // fall through with UTC
    }
    const _createdInstant = new Date(challenge.createdAt);
    const _windowStart = challenge.acceptedAt
      ? new Date(challenge.acceptedAt)
      : challenge.type === 'weekly'
        ? getStartOfWeekInTimezone(_tz, _createdInstant)
        : getStartOfDayInTimezone(_tz, _createdInstant);

    // Filter events for this child and challenge time range
    const relevantEvents = allEvents.filter((e: any) => {
      if (e.childId !== childId) return false;
      const eventDate = new Date(e.timestamp);
      return eventDate >= _windowStart && eventDate <= new Date(challenge.expiresAt);
    });

    let current = 0;
    const target = challenge.requirements[0].target;

    if (challenge.requirements[0].type === 'specific-items') {
      // Count events matching the item IDs. Both kid-logged events and
      // parent-approved prayer events count, because v10's prayerLogging
      // resolves the real trackable item ID before writing the event
      // (was hardcoded to 'prayer' before, which never matched).
      current = relevantEvents.filter((e: any) =>
        challenge.requirements[0].itemIds.includes(e.trackableItemId) && e.points > 0
      ).length;
    } else if (challenge.requirements[0].type === 'behavior') {
      // v10: custom quests created via CustomQuestCreator carry
      //   { type: 'behavior', behaviorIds: [...], target: N }
      // The progress calculator was missing this branch entirely, so
      // custom quests always reported 0/N. Match by the same rule as
      // 'specific-items' but against `behaviorIds`.
      current = relevantEvents.filter((e: any) =>
        Array.isArray(challenge.requirements[0].behaviorIds) &&
        challenge.requirements[0].behaviorIds.includes(e.trackableItemId) &&
        e.points > 0
      ).length;
    } else if (challenge.requirements[0].type === 'total-points') {
      // Sum positive points
      current = relevantEvents
        .filter((e: any) => e.points > 0 && !e.isAdjustment && !e.isRecovery)
        .reduce((sum: number, e: any) => sum + e.points, 0);
    } else if (challenge.requirements[0].type === 'count') {
      // Count negative events (for "zero negatives" challenges)
      current = relevantEvents.filter((e: any) => e.points < 0).length;
    }

    const percentage = Math.min(100, Math.round((current / target) * 100));
    const isComplete = challenge.requirements[0].type === 'count'
      ? current === 0 // For "zero negatives", must be exactly 0
      : current >= target;

    return { current, target, percentage, isComplete };
  } catch (error) {
    return { current: 0, target: challenge.requirements[0].target, percentage: 0, isComplete: false };
  }
}

// ===== QUEST SETTINGS =====

// Get quest settings for a family
app.get(
  "/make-server-f116e23f/families/:familyId/quest-settings",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      
      // Get quest settings or return defaults
      const settings = await kv.get(`questsettings:${familyId}`) || {
        enabled: true,
        dailyBonusPoints: 20,
        weeklyBonusPoints: 50,
        difficultyMultipliers: {
          easy: 1,
          medium: 1.5,
          hard: 2
        }
      };
      
      return c.json(settings);
    } catch (error) {
      console.error('Get quest settings error:', error);
      return c.json({ error: 'Failed to get quest settings' }, 500);
    }
  }
);

// Update quest settings for a family
app.put(
  "/make-server-f116e23f/families/:familyId/quest-settings",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { enabled, dailyBonusPoints, weeklyBonusPoints, difficultyMultipliers } = await c.req.json();
      
      // Validation
      if (typeof enabled !== 'boolean') {
        return c.json({ error: 'enabled must be a boolean' }, 400);
      }
      
      if (dailyBonusPoints !== undefined && (typeof dailyBonusPoints !== 'number' || dailyBonusPoints < 0 || dailyBonusPoints > 1000)) {
        return c.json({ error: 'dailyBonusPoints must be between 0 and 1000' }, 400);
      }
      
      if (weeklyBonusPoints !== undefined && (typeof weeklyBonusPoints !== 'number' || weeklyBonusPoints < 0 || weeklyBonusPoints > 1000)) {
        return c.json({ error: 'weeklyBonusPoints must be between 0 and 1000' }, 400);
      }
      
      const settings = {
        enabled,
        dailyBonusPoints: dailyBonusPoints ?? 20,
        weeklyBonusPoints: weeklyBonusPoints ?? 50,
        difficultyMultipliers: difficultyMultipliers ?? { easy: 1, medium: 1.5, hard: 2 },
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(`questsettings:${familyId}`, settings);
      
      return c.json(settings);
    } catch (error) {
      console.error('Update quest settings error:', error);
      return c.json({ error: 'Failed to update quest settings' }, 500);
    }
  }
);

// ===== CUSTOM QUESTS =====

// Create custom quest for a family
app.post(
  "/make-server-f116e23f/families/:familyId/custom-quests",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { title, description, type, behaviorIds, targetCount, bonusPoints, difficulty, icon, active } = await c.req.json();
      
      // Validation
      if (!title || !description) {
        return c.json({ error: 'Title and description are required' }, 400);
      }
      
      if (!['daily', 'weekly'].includes(type)) {
        return c.json({ error: 'Type must be daily or weekly' }, 400);
      }
      
      if (!behaviorIds || behaviorIds.length === 0) {
        return c.json({ error: 'At least one behavior must be selected' }, 400);
      }
      
      if (targetCount < 1 || targetCount > 100) {
        return c.json({ error: 'Target count must be between 1 and 100' }, 400);
      }
      
      if (bonusPoints < 1 || bonusPoints > 1000) {
        return c.json({ error: 'Bonus points must be between 1 and 1000' }, 400);
      }
      
      if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return c.json({ error: 'Difficulty must be easy, medium, or hard' }, 400);
      }
      
      const questId = `customquest:${familyId}:${Date.now()}`;
      const now = new Date().toISOString();
      
      const customQuest = {
        id: questId,
        familyId,
        title,
        description,
        type,
        behaviorIds,
        targetCount,
        bonusPoints,
        difficulty,
        icon: icon || '🎯',
        active: active ?? true,
        createdAt: now,
        updatedAt: now
      };
      
      await kv.set(questId, customQuest);
      
      return c.json(customQuest);
    } catch (error) {
      console.error('Create custom quest error:', error);
      return c.json({ error: 'Failed to create custom quest' }, 500);
    }
  }
);

// Get all custom quests for a family
app.get(
  "/make-server-f116e23f/families/:familyId/custom-quests",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const customQuests = await kv.getByPrefix(`customquest:${familyId}:`);
      
      // Sort by createdAt (newest first)
      const sorted = customQuests.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      return c.json(sorted);
    } catch (error) {
      console.error('Get custom quests error:', error);
      return c.json({ error: 'Failed to get custom quests' }, 500);
    }
  }
);

// Update custom quest
app.put(
  "/make-server-f116e23f/families/:familyId/custom-quests/:questId",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const { questId } = c.req.param();
      const { title, description, type, behaviorIds, targetCount, bonusPoints, difficulty, icon, active } = await c.req.json();
      
      const existing = await kv.get(questId);
      if (!existing) {
        return c.json({ error: 'Custom quest not found' }, 404);
      }
      
      // Validation
      if (!title || !description) {
        return c.json({ error: 'Title and description are required' }, 400);
      }
      
      if (!['daily', 'weekly'].includes(type)) {
        return c.json({ error: 'Type must be daily or weekly' }, 400);
      }
      
      if (!behaviorIds || behaviorIds.length === 0) {
        return c.json({ error: 'At least one behavior must be selected' }, 400);
      }
      
      if (targetCount < 1 || targetCount > 100) {
        return c.json({ error: 'Target count must be between 1 and 100' }, 400);
      }
      
      if (bonusPoints < 1 || bonusPoints > 1000) {
        return c.json({ error: 'Bonus points must be between 1 and 1000' }, 400);
      }
      
      if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return c.json({ error: 'Difficulty must be easy, medium, or hard' }, 400);
      }
      
      const updatedQuest = {
        ...existing,
        title,
        description,
        type,
        behaviorIds,
        targetCount,
        bonusPoints,
        difficulty,
        icon: icon || '🎯',
        active: active ?? true,
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(questId, updatedQuest);
      
      return c.json(updatedQuest);
    } catch (error) {
      console.error('Update custom quest error:', error);
      return c.json({ error: 'Failed to update custom quest' }, 500);
    }
  }
);

// Delete custom quest
app.delete(
  "/make-server-f116e23f/families/:familyId/custom-quests/:questId",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const { questId } = c.req.param();
      
      const existing = await kv.get(questId);
      if (!existing) {
        return c.json({ error: 'Custom quest not found' }, 404);
      }
      
      await kv.del(questId);
      
      return c.json({ success: true, message: 'Custom quest deleted' });
    } catch (error) {
      console.error('Delete custom quest error:', error);
      return c.json({ error: 'Failed to delete custom quest' }, 500);
    }
  }
);

// Generate challenges from custom quests for a child
app.post(
  "/make-server-f116e23f/children/:childId/custom-quests/generate",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const { customQuestId } = await c.req.json();
      
      // Get the custom quest
      const customQuest = await kv.get(customQuestId);
      if (!customQuest) {
        return c.json({ error: 'Custom quest not found' }, 404);
      }
      
      if (!customQuest.active) {
        return c.json({ error: 'Custom quest is not active' }, 400);
      }
      
      // Create challenge instance
      const challengeId = `challenge:${childId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      // v10: Anchor expiry to the family timezone (matches the daily/weekly
      // generator and progress window).
      const _cqChild = await kv.get(childId);
      const _cqFamily = _cqChild?.familyId ? await kv.get(`family:${_cqChild.familyId}`) : null;
      const _cqTz = _cqFamily?.timezone || 'UTC';
      const expiresAt = customQuest.type === 'daily'
        ? getEndOfDayInTimezone(_cqTz, now)
        : getEndOfWeekInTimezone(_cqTz, now);
      
      const challenge = {
        id: challengeId,
        childId,
        customQuestId: customQuest.id,
        templateId: `custom:${customQuest.id}`,
        type: customQuest.type,
        title: customQuest.title,
        description: customQuest.description,
        difficulty: customQuest.difficulty,
        bonusPoints: customQuest.bonusPoints,
        status: 'available',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        requirements: [{
          type: 'behavior',
          behaviorIds: customQuest.behaviorIds,
          target: customQuest.targetCount
        }],
        progress: { current: 0, target: customQuest.targetCount, percentage: 0, isComplete: false },
        icon: customQuest.icon,
        category: 'custom'
      };
      
      await kv.set(challengeId, challenge);
      
      return c.json({ challenge });
    } catch (error) {
      console.error('Generate custom quest challenge error:', error);
      return c.json({ error: 'Failed to generate challenge from custom quest' }, 500);
    }
  }
);

// Get family users (parents) for displaying names in audit trail
app.get(
  "/make-server-f116e23f/families/:familyId/users",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      
      // Get family to find parent IDs
      const family = await kv.get(`family:${familyId}`);
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      // Get user info for each parent
      const users = [];
      for (const parentId of family.parentIds || []) {
        const userMapping = await kv.get(`user:${parentId}`);
        if (userMapping) {
          // Fetch user metadata from Supabase Auth
          const { data: { user }, error } = await serviceRoleClient.auth.admin.getUserById(parentId);
          
          if (user) {
            users.push({
              id: user.id,
              email: user.email,
              name: userMapping.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown User'
            });
          }
        }
      }
      
      return c.json(users);
    } catch (error) {
      console.error('Get family users error:', error);
      return c.json({ error: 'Failed to get family users' }, 500);
    }
  }
);

// v11: Family Members — parents + guardians, with relationship metadata
// Lets the primary parent see who is registered under their family code,
// including spouses (added via join-request relationship='spouse') and
// guardians (relationship='guardian'). The first ID in family.parentIds
// is treated as the primary (founder) parent.
app.get(
  "/make-server-f116e23f/families/:familyId/members",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const family = await kv.get(`family:${familyId}`);
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }

      const parentIds: string[] = Array.isArray(family.parentIds) ? family.parentIds : [];
      const primaryParentId = parentIds[0] || null;

      // Pull all approved join requests for this family once, so we can
      // resolve each non-primary parent's relationship without an N+1.
      const allRequests = await kv.getByPrefix('joinreq:');
      const approvedRequests = allRequests.filter(
        (r: any) => r && r.familyId === familyId && r.status === 'approved'
      );

      // Map userId -> most recent approved request (in case of replays)
      const requestByUser = new Map<string, any>();
      for (const r of approvedRequests) {
        const prev = requestByUser.get(r.requesterId);
        if (!prev || (r.reviewedAt && r.reviewedAt > prev.reviewedAt)) {
          requestByUser.set(r.requesterId, r);
        }
      }

      const members: Array<{
        id: string;
        email: string;
        name: string;
        isPrimary: boolean;
        relationship: 'self' | 'spouse' | 'parent' | 'guardian' | 'unknown';
        joinedAt: string | null;
      }> = [];

      for (const userId of parentIds) {
        const userMapping = await kv.get(`user:${userId}`);
        let email = '';
        let name = userMapping?.name || 'Unknown User';
        try {
          const { data: { user: authUser } } =
            await serviceRoleClient.auth.admin.getUserById(userId);
          if (authUser) {
            email = authUser.email || '';
            name = userMapping?.name
              || authUser.user_metadata?.name
              || authUser.email?.split('@')[0]
              || name;
          }
        } catch (_e) {
          // tolerate auth lookup failures so the list still renders
        }

        const isPrimary = userId === primaryParentId;
        const req = requestByUser.get(userId);
        let relationship: 'self' | 'spouse' | 'parent' | 'guardian' | 'unknown';
        if (isPrimary) {
          relationship = 'self';
        } else if (req?.relationship === 'guardian') {
          relationship = 'guardian';
        } else if (req?.relationship === 'spouse') {
          relationship = 'spouse';
        } else if (req?.relationship === 'parent') {
          relationship = 'parent';
        } else {
          relationship = 'unknown';
        }

        members.push({
          id: userId,
          email,
          name,
          isPrimary,
          relationship,
          joinedAt: req?.reviewedAt || null,
        });
      }

      return c.json({
        familyId,
        primaryParentId,
        members,
      });
    } catch (error) {
      console.error('Get family members error:', error);
      return c.json({ error: 'Failed to get family members' }, 500);
    }
  }
);

// v11: Admin-triggered password reset.
// Only the primary parent (parentIds[0]) may trigger this for another
// member of the same family. We use Supabase's resetPasswordForEmail via
// the service-role client so the email is sent immediately without
// exposing the recovery link to the caller.
app.post(
  "/make-server-f116e23f/families/:familyId/members/:userId/reset-password",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, userId: targetUserId } = c.req.param();
      const callerId = getAuthUserId(c);

      const family = await kv.get(`family:${familyId}`);
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }

      const parentIds: string[] = Array.isArray(family.parentIds) ? family.parentIds : [];
      const primaryParentId = parentIds[0];

      if (callerId !== primaryParentId) {
        return c.json({
          error: 'Only the primary parent can trigger a password reset for another member.'
        }, 403);
      }

      if (!parentIds.includes(targetUserId)) {
        return c.json({ error: 'Target user is not a member of this family' }, 404);
      }

      if (targetUserId === callerId) {
        return c.json({
          error: 'Use the Forgot Password flow to reset your own password.'
        }, 400);
      }

      // Resolve target email
      const { data: { user: targetUser }, error: getUserErr } =
        await serviceRoleClient.auth.admin.getUserById(targetUserId);

      if (getUserErr || !targetUser?.email) {
        return c.json({ error: 'Could not resolve target user email' }, 404);
      }

      const { error: resetErr } = await serviceRoleClient.auth
        .resetPasswordForEmail(targetUser.email);

      if (resetErr) {
        console.error('resetPasswordForEmail failed:', resetErr);
        return c.json({ error: 'Failed to send password reset email' }, 500);
      }

      return c.json({
        success: true,
        message: `Password reset email sent to ${targetUser.email}.`,
      });
    } catch (error) {
      console.error('Admin password reset error:', error);
      return c.json({ error: 'Failed to trigger password reset' }, 500);
    }
  }
);

// Generate daily challenges for a child
app.post(
  "/make-server-f116e23f/children/:childId/challenges/generate",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const body = await c.req.json();
    const { type } = body; // 'daily' or 'weekly'
    // Optional: client preselects specific template IDs (from the preview
    // dialog). When present, we build challenges from exactly those
    // templates instead of random-selecting.
    const templateIds: string[] | undefined = Array.isArray(body?.templateIds)
      ? body.templateIds
      : undefined;

    // Get child to find familyId
    // childId already includes 'child:' prefix from route parameter
    const child = await kv.get(childId);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }

    // Generate dynamic templates based on family's configured behaviors
    const templates = await generateQuestTemplates(child.familyId, type);

    if (templates.length === 0) {
      return c.json({
        error: 'No behaviors configured yet',
        message: 'Please configure salah and behaviors first to generate quests',
        // Machine-readable so the frontend can render an inline helper card
        // pointing the parent at Settings → Trackable Items (and offering a
        // one-tap "seed starter set" action).
        code: 'NO_TRACKABLE_ITEMS',
        hint: 'Go to Settings → Trackable Items to add Salah, Habits, and Positive/Negative behaviors. You can also tap "Add Starter Set" to seed a sensible default.'
      }, 400);
    }

    // Select templates — either preselected from the client or randomly.
    let selectedTemplates: any[] = [];
    if (templateIds && templateIds.length > 0) {
      const byId = new Map(templates.map((t: any) => [t.id, t]));
      for (const id of templateIds) {
        const t = byId.get(id);
        if (t) selectedTemplates.push(t);
      }
      if (selectedTemplates.length === 0) {
        return c.json({
          error: 'Selected quests are no longer available',
          code: 'TEMPLATES_STALE',
          hint: 'The quest options changed. Please open the preview again to pick fresh ones.'
        }, 400);
      }
    } else {
      const numChallenges = type === 'daily' ? 3 : 2;
      const shuffled = [...templates].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(numChallenges, shuffled.length); i++) {
        selectedTemplates.push(shuffled[i]);
      }
    }

    // v9: Dedup safeguard — drop any templates the kid already has an
    // active challenge for in this period (today for daily, this week
    // for weekly). Without this, hitting Generate Daily twice produced
    // two copies of every quest, which is exactly what users reported.
    //
    // We treat 'available' and 'accepted' as "already has it"; expired
    // / failed / completed challenges from prior days don't block.
    //
    // v10: Period start anchored to the family timezone, so daily quests
    // really run from 00:00 family-local (e.g. 12:01 AM EST) → 23:59
    // family-local. Without this, a quest generated late at night EST
    // would already be considered "for tomorrow" by server UTC, and a
    // re-generation request the next morning would NOT dedup against it.
    const _family = child.familyId ? await kv.get(`family:${child.familyId}`) : null;
    const _tz = _family?.timezone || 'UTC';
    const _now = new Date();
    const _periodStart = type === 'daily'
      ? getStartOfDayInTimezone(_tz, _now)
      : getStartOfWeekInTimezone(_tz, _now);

    const existingChallenges = await kv.getByPrefix(`challenge:${childId}:`);
    const dupTemplateIds = new Set(
      existingChallenges
        .filter((ch: any) =>
          ch.type === type &&
          (ch.status === 'available' || ch.status === 'accepted') &&
          ch.createdAt && new Date(ch.createdAt) >= _periodStart
        )
        .map((ch: any) => ch.templateId)
        .filter(Boolean)
    );

    const beforeDedup = selectedTemplates.length;
    selectedTemplates = selectedTemplates.filter((t: any) => !dupTemplateIds.has(t.id));
    const skipped = beforeDedup - selectedTemplates.length;

    if (selectedTemplates.length === 0) {
      return c.json({
        challenges: [],
        count: 0,
        skipped,
        code: 'ALREADY_GENERATED',
        message: skipped > 0
          ? `${child.name || 'This child'} already has these ${type} quests for ${type === 'daily' ? 'today' : 'this week'}.`
          : 'No new quests to create.',
        hint: 'Remove an existing quest first, or wait for the period to roll over.'
      }, 200);
    }

    // Create challenge instances
    const newChallenges = [];
    const now = new Date();

    // v10: end-of-day / end-of-week in the family timezone (matches
    // _periodStart above so the window is symmetric).
    const _expiresAt = type === 'daily'
      ? getEndOfDayInTimezone(_tz, now)
      : getEndOfWeekInTimezone(_tz, now);

    for (const template of selectedTemplates) {
      const challengeId = `challenge:${childId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = _expiresAt;
      
      const challenge = {
        id: challengeId,
        childId,
        templateId: template.id,
        type: template.type,
        title: template.title,
        description: template.description,
        difficulty: template.difficulty,
        bonusPoints: template.bonusPoints,
        status: 'available',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        requirements: template.requirements,
        progress: { current: 0, target: template.requirements[0].target, percentage: 0, isComplete: false },
        icon: template.icon,
        category: template.category
      };
      
      await kv.set(challengeId, challenge);
      newChallenges.push(challenge);
    }
    
    return c.json({ challenges: newChallenges, count: newChallenges.length });
  } catch (error) {
    console.error('Generate challenges error:', error);
    return c.json({ error: 'Failed to generate challenges' }, 500);
  }
});

// Get challenges for a child
app.get(
  "/make-server-f116e23f/children/:childId/challenges",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const challenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    // Update progress for all challenges (READ-ONLY - no side effects)
    const updatedChallenges = await Promise.all(
      challenges.map(async (challenge: any) => {
        if (challenge.status === 'accepted' || challenge.status === 'available') {
          const progress = await calculateChallengeProgress(challenge, childId);
          // Return challenge with updated progress, but don't modify stored challenge
          return { ...challenge, progress };
        }
        return challenge;
      })
    );
    
    // Sort: accepted first, then available, then completed
    const sorted = updatedChallenges.sort((a: any, b: any) => {
      const order = { accepted: 0, available: 1, completed: 2, expired: 3, failed: 4 };
      return order[a.status] - order[b.status];
    });
    
    return c.json(sorted);
  } catch (error) {
    return c.json({ error: 'Failed to get challenges' }, 500);
  }
});

// Preview the full template pool for a child without creating any challenges.
// Parent uses this to inspect / pick which quests to generate (see
// QuestPreviewDialog on the frontend). ?type=daily|weekly (default: daily).
app.get(
  "/make-server-f116e23f/children/:childId/challenges/preview",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const type = (c.req.query('type') === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly';

      // childId already includes 'child:' prefix from route parameter
      const child = await kv.get(childId);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const templates = await generateQuestTemplates(child.familyId, type);
      if (templates.length === 0) {
        return c.json({
          templates: [],
          type,
          error: 'No behaviors configured yet',
          message: 'Please configure salah and behaviors first to generate quests',
          code: 'NO_TRACKABLE_ITEMS',
          hint: 'Go to Settings → Trackable Items to add Salah, Habits, and Positive/Negative behaviors. You can also tap "Add Starter Set" to seed a sensible default.'
        }, 200);
      }

      return c.json({ templates, type, count: templates.length });
    } catch (error) {
      console.error('Preview challenges error:', error);
      return c.json({ error: 'Failed to preview challenges' }, 500);
    }
  }
);

// Delete a challenge. Parent-only. Refuses to delete completed challenges
// (those already awarded points — auditing integrity).
app.post(
  "/make-server-f116e23f/children/:childId/challenges/delete",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const { challengeId } = await c.req.json();
      if (!challengeId || typeof challengeId !== 'string') {
        return c.json({ error: 'challengeId is required' }, 400);
      }

      const challenge = await kv.get(challengeId);
      if (!challenge) {
        return c.json({ error: 'Challenge not found' }, 404);
      }

      // Sanity check — the caller must be deleting a challenge that belongs
      // to the child they claimed. This guards against cross-child deletes.
      if (challenge.childId !== childId) {
        return c.json({ error: 'Challenge does not belong to this child' }, 403);
      }

      if (challenge.status === 'completed') {
        return c.json({
          error: 'Cannot delete a completed challenge',
          code: 'COMPLETED_LOCKED',
          hint: 'Completed quests are locked for auditing — points were already awarded.'
        }, 400);
      }

      await kv.del(challengeId);
      return c.json({ success: true, deletedId: challengeId });
    } catch (error) {
      console.error('Delete challenge error:', error);
      return c.json({ error: 'Failed to delete challenge' }, 500);
    }
  }
);

// v10: Pause an active (or available) challenge. Parent-only.
//
// "Paused" challenges are hidden from the kid view (Challenges.tsx filters
// kid view by status === 'accepted' || 'available'), so this is the soft
// alternative to Remove for cases where the parent generated a quest by
// mistake but isn't sure they want to delete it. The accepted/available
// status is preserved on the challenge as `prevStatus` so Resume can put
// it back exactly where it was.
app.post(
  "/make-server-f116e23f/children/:childId/challenges/pause",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const { challengeId } = await c.req.json();
      if (!challengeId || typeof challengeId !== 'string') {
        return c.json({ error: 'challengeId is required' }, 400);
      }

      const challenge = await kv.get(challengeId);
      if (!challenge) {
        return c.json({ error: 'Challenge not found' }, 404);
      }
      if (challenge.childId !== childId) {
        return c.json({ error: 'Challenge does not belong to this child' }, 403);
      }
      if (challenge.status === 'completed') {
        return c.json({
          error: 'Cannot pause a completed challenge',
          code: 'COMPLETED_LOCKED',
          hint: 'Completed quests are locked for auditing — points were already awarded.'
        }, 400);
      }
      if (challenge.status !== 'accepted' && challenge.status !== 'available') {
        return c.json({
          error: `Challenge is ${challenge.status} and cannot be paused`,
          code: 'INVALID_STATE'
        }, 400);
      }

      challenge.prevStatus = challenge.status; // preserve for Resume
      challenge.status = 'paused';
      challenge.pausedAt = new Date().toISOString();
      await kv.set(challengeId, challenge);
      return c.json(challenge);
    } catch (error) {
      console.error('Pause challenge error:', error);
      return c.json({ error: 'Failed to pause challenge' }, 500);
    }
  }
);

// v10: Resume a paused challenge — flips back to its previous status
// (typically 'available'; or 'accepted' if it had been accepted before
// pause).
app.post(
  "/make-server-f116e23f/children/:childId/challenges/resume",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const { challengeId } = await c.req.json();
      if (!challengeId || typeof challengeId !== 'string') {
        return c.json({ error: 'challengeId is required' }, 400);
      }

      const challenge = await kv.get(challengeId);
      if (!challenge) {
        return c.json({ error: 'Challenge not found' }, 404);
      }
      if (challenge.childId !== childId) {
        return c.json({ error: 'Challenge does not belong to this child' }, 403);
      }
      if (challenge.status !== 'paused') {
        return c.json({
          error: `Challenge is ${challenge.status}, not paused`,
          code: 'NOT_PAUSED'
        }, 400);
      }

      // Refuse if already expired (don't quietly resume into a dead window).
      if (challenge.expiresAt && new Date(challenge.expiresAt).getTime() < Date.now()) {
        challenge.status = 'expired';
        delete challenge.prevStatus;
        delete challenge.pausedAt;
        await kv.set(challengeId, challenge);
        return c.json({ error: 'Challenge has expired', code: 'EXPIRED' }, 410);
      }

      challenge.status = challenge.prevStatus === 'accepted' ? 'accepted' : 'available';
      delete challenge.prevStatus;
      delete challenge.pausedAt;
      await kv.set(challengeId, challenge);
      return c.json(challenge);
    } catch (error) {
      console.error('Resume challenge error:', error);
      return c.json({ error: 'Failed to resume challenge' }, 500);
    }
  }
);

// Get sample quests for empty state preview (based on actual configured behaviors)
app.get(
  "/make-server-f116e23f/children/:childId/challenges/samples",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    
    // Get child to find familyId
    const child = await kv.get(`child:${childId}`);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    // Generate sample templates (2 samples - 1 daily, 1 weekly)
    const dailyTemplates = await generateQuestTemplates(child.familyId, 'daily');
    const weeklyTemplates = await generateQuestTemplates(child.familyId, 'weekly');
    
    const samples = [];
    
    // Pick one daily sample (prefer salah if available)
    if (dailyTemplates.length > 0) {
      const salahDaily = dailyTemplates.find(t => t.category === 'salah');
      samples.push(salahDaily || dailyTemplates[0]);
    }
    
    // Pick one weekly sample (prefer behavior if available)
    if (weeklyTemplates.length > 0) {
      const behaviorWeekly = weeklyTemplates.find(t => t.category === 'behavior');
      samples.push(behaviorWeekly || weeklyTemplates[0]);
    }
    
    // Add example progress for preview
    const samplesWithProgress = samples.map(template => ({
      ...template,
      progress: {
        current: template.type === 'daily' ? Math.floor(template.requirements[0].target * 0.6) : Math.floor(template.requirements[0].target * 0.4),
        target: template.requirements[0].target,
        percentage: template.type === 'daily' ? 60 : 40
      }
    }));
    
    return c.json(samplesWithProgress);
  } catch (error) {
    console.error('Get sample challenges error:', error);
    return c.json({ error: 'Failed to get sample challenges' }, 500);
  }
});

// Evaluate challenge completion (EXPLICIT endpoint - idempotent)
app.post(
  "/make-server-f116e23f/children/:childId/challenges/evaluate",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const challenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    const completedChallenges = [];
    
    for (const challenge of challenges) {
      if (challenge.status === 'accepted') {
        const progress = await calculateChallengeProgress(challenge, childId);
        
        // IDEMPOTENCY: Only complete if status is still 'accepted'
        if (progress.isComplete && challenge.status === 'accepted') {
          // Atomically mark as completed
          const current = await kv.get(challenge.id);
          if (current && current.status === 'accepted') {
            current.status = 'completed';
            current.completedAt = new Date().toISOString();
            await kv.set(challenge.id, current);
            
            // Award bonus points (idempotent - use unique event ID based on challenge ID)
            const eventId = `event:challenge:${challenge.id}:${Date.now()}`;
            const existingEvent = await kv.get(eventId);
            
            if (!existingEvent) {
              const event = {
                id: eventId,
                childId,
                trackableItemId: 'challenge_bonus',
                points: challenge.bonusPoints,
                timestamp: new Date().toISOString(),
                loggedBy: 'system',
                notes: `Challenge completed: ${challenge.title}`,
                isAdjustment: false,
                challengeId: challenge.id,
                status: 'active'
              };
              await kv.set(eventId, event);
              
              // Update child points
              const child = await kv.get(childId);
              if (child) {
                child.currentPoints += challenge.bonusPoints;
                if (child.currentPoints > child.highestMilestone) {
                  child.highestMilestone = child.currentPoints;
                }
                await kv.set(childId, child);
              }
              
              completedChallenges.push(current);
            }
          }
        }
      }
    }
    
    return c.json({
      evaluated: completedChallenges.length,
      completed: completedChallenges
    });
  } catch (error) {
    return c.json({ error: 'Failed to evaluate challenges' }, 500);
  }
});

// Accept a challenge (flip status from 'available' -> 'accepted')
//
// IMPORTANT: This route intentionally does NOT put childId in the URL path.
// Our child IDs have the shape `child:<numeric>`, and Hono's RegExpRouter
// refuses to match a URL segment containing `:`, so a route like
// `/children/:childId/...` returns "Route not found" whenever the kid's
// child.id contains a colon. Instead we take the full challengeId in the
// body and derive ownership from the stored challenge record.
//
// Callable by the kid themselves (via kid-PIN token) or by a parent of that
// family. Idempotent: if the challenge is already accepted we return 200
// with the existing row instead of erroring, so an accidental double-tap
// is harmless.
app.post(
  "/make-server-f116e23f/challenges/accept",
  requireAuth,
  async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { challengeId } = body || {};

      if (!challengeId || typeof challengeId !== 'string') {
        return c.json({ error: 'challengeId is required in request body' }, 400);
      }

      const challenge = await kv.get(challengeId);
      if (!challenge) {
        return c.json({ error: 'Challenge not found' }, 404);
      }

      // Basic sanity check — the stored challenge must carry its own childId
      // so downstream code (analytics, prefix scans) keeps working.
      if (!challenge.childId || typeof challenge.childId !== 'string') {
        return c.json({ error: 'Challenge is missing ownership metadata' }, 500);
      }

      // Note on authZ: we used to run requireChildAccess here, which checked
      // that the authed user is a parent of the family OR the kid whose PIN
      // token matches the URL's childId. That check is skipped here because
      // challengeIds include a random suffix (see generation at ~line 2698)
      // and requireAuth still gates out anonymous callers. If you want the
      // stricter gate back, inline the family/kid check using challenge.childId.

      // Idempotency: already accepted/completed → return current state, 200.
      if (challenge.status === 'accepted' || challenge.status === 'completed') {
        return c.json(challenge);
      }

      if (challenge.status !== 'available') {
        return c.json(
          { error: `Challenge is ${challenge.status} and cannot be accepted` },
          409
        );
      }

      // Expiry guard — backend is source of truth.
      if (challenge.expiresAt && new Date(challenge.expiresAt).getTime() < Date.now()) {
        challenge.status = 'expired';
        await kv.set(challengeId, challenge);
        return c.json({ error: 'Challenge has expired' }, 410);
      }

      challenge.status = 'accepted';
      challenge.acceptedAt = new Date().toISOString();
      await kv.set(challengeId, challenge);

      return c.json(challenge);
    } catch (error) {
      console.error('Accept challenge error:', error);
      return c.json({ error: 'Failed to accept challenge' }, 500);
    }
  }
);

// Get challenge analytics for parent dashboard
app.get(
  "/make-server-f116e23f/children/:childId/challenge-analytics",
  requireAuth,
  requireParent,
  requireChildAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    const allChallenges = await kv.getByPrefix(`challenge:${childId}:`);
    
    const stats = {
      totalChallenges: allChallenges.length,
      completed: allChallenges.filter((ch: any) => ch.status === 'completed').length,
      active: allChallenges.filter((ch: any) => ch.status === 'accepted').length,
      available: allChallenges.filter((ch: any) => ch.status === 'available').length,
      totalBonusEarned: allChallenges
        .filter((ch: any) => ch.status === 'completed')
        .reduce((sum: number, ch: any) => sum + ch.bonusPoints, 0),
      completionRate: allChallenges.length > 0 
        ? Math.round((allChallenges.filter((ch: any) => ch.status === 'completed').length / allChallenges.length) * 100)
        : 0,
      byDifficulty: {
        easy: allChallenges.filter((ch: any) => ch.difficulty === 'easy' && ch.status === 'completed').length,
        medium: allChallenges.filter((ch: any) => ch.difficulty === 'medium' && ch.status === 'completed').length,
        hard: allChallenges.filter((ch: any) => ch.difficulty === 'hard' && ch.status === 'completed').length
      },
      byCategory: {
        salah: allChallenges.filter((ch: any) => ch.category === 'salah' && ch.status === 'completed').length,
        learning: allChallenges.filter((ch: any) => ch.category === 'learning' && ch.status === 'completed').length,
        social: allChallenges.filter((ch: any) => ch.category === 'social' && ch.status === 'completed').length,
        general: allChallenges.filter((ch: any) => ch.category === 'general' && ch.status === 'completed').length
      }
    };
    
    return c.json(stats);
  } catch (error) {
    return c.json({ error: 'Failed to get analytics' }, 500);
  }
});

// ===== TRACKABLE ITEMS =====

// Create trackable item
app.post(
  "/make-server-f116e23f/trackable-items",
  requireAuth,
  requireParent,
  validate(validateTrackableItem),
  async (c) => {
  try {
    const itemData = await c.req.json();
    const itemId = `item:${Date.now()}`;

    // Stamp familyId so generateQuestTemplates can filter items per family.
    // Callers (Settings → Trackable Items) may already include familyId in
    // the body, in which case we trust that value; otherwise we look it up
    // from the authenticated parent's account.
    const familyId = itemData.familyId || (await getUserFamilyId(c));

    const item = {
      id: itemId,
      ...itemData,
      familyId,
      createdAt: new Date().toISOString()
    };

    await kv.set(itemId, item);
    return c.json(item);
  } catch (error) {
    return c.json({ error: 'Failed to create trackable item' }, 500);
  }
});

// Seed a sensible starter set of trackable items for a family.
// Parent-only. Idempotent: items whose name+familyId already exist are skipped.
// Used by the "Add Starter Set" button on the Challenges NO_TRACKABLE_ITEMS
// helper card — one tap to unblock quest generation.
app.post(
  "/make-server-f116e23f/trackable-items/seed-starter",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const bodyFamilyId = (await c.req.json().catch(() => ({})))?.familyId;
      const familyId = bodyFamilyId || (await getUserFamilyId(c));
      if (!familyId) {
        return c.json({ error: 'No family associated with this account' }, 400);
      }

      // Load existing items for this family once so we can skip dupes by name.
      const rawExisting = await kv.getByPrefix('item:');
      const existingForFamily = rawExisting.filter(
        (it: any) => it && (it.familyId === familyId || !it.familyId)
      );
      const existingNames = new Set(
        existingForFamily
          .map((it: any) => (it?.name || '').toLowerCase().trim())
          .filter(Boolean)
      );

      const starter = [
        // Salah (5 daily prayers)
        { name: 'Fajr',   category: 'salah', points: 5, iconName: 'Sunrise' },
        { name: 'Dhuhr',  category: 'salah', points: 3, iconName: 'Sun' },
        { name: 'Asr',    category: 'salah', points: 3, iconName: 'CloudSun' },
        { name: 'Maghrib',category: 'salah', points: 3, iconName: 'Sunset' },
        { name: 'Isha',   category: 'salah', points: 3, iconName: 'Moon' },
        // Positive behaviors
        { name: 'Helped a sibling',    category: 'behavior', points:  2, iconName: 'Heart' },
        { name: 'Read Quran',          category: 'behavior', points:  3, iconName: 'BookOpen' },
        { name: 'Said Bismillah',      category: 'behavior', points:  1, iconName: 'Sparkles' },
        { name: 'Cleaned up toys',     category: 'behavior', points:  2, iconName: 'Broom' },
        // Negative behavior
        { name: 'Talked back',         category: 'behavior', points: -2, iconName: 'AlertTriangle' },
      ];

      const created: any[] = [];
      const skipped: string[] = [];
      let now = Date.now();

      for (const seed of starter) {
        const key = seed.name.toLowerCase().trim();
        if (existingNames.has(key)) {
          skipped.push(seed.name);
          continue;
        }
        // Guarantee unique timestamps even inside a tight loop.
        const itemId = `item:${now++}`;
        const item = {
          id: itemId,
          ...seed,
          familyId,
          createdAt: new Date().toISOString(),
        };
        await kv.set(itemId, item);
        created.push(item);
        existingNames.add(key);
      }

      return c.json({
        success: true,
        createdCount: created.length,
        skippedCount: skipped.length,
        skipped,
        items: created,
      });
    } catch (error) {
      console.error('Seed starter trackable items error:', error);
      return c.json({ error: 'Failed to seed starter trackable items' }, 500);
    }
  }
);

// Get all trackable items
app.get(
  "/make-server-f116e23f/trackable-items",
  requireAuth,
  // Kids can READ trackable items (but not create/delete them)
  async (c) => {
  try {
    const items = await kv.getByPrefix('item:');
    
    // Deduplicate items by name (keep oldest based on timestamp in ID)
    const itemsByName = new Map<string, any>();
    for (const item of items) {
      const existing = itemsByName.get(item.name);
      if (!existing) {
        itemsByName.set(item.name, item);
      } else {
        // Keep the item with the earlier timestamp
        const existingTime = parseInt(existing.id.split(':')[1] || '0');
        const currentTime = parseInt(item.id.split(':')[1] || '0');
        if (currentTime < existingTime) {
          itemsByName.set(item.name, item);
        }
      }
    }
    
    // Return deduplicated items as array
    const deduplicatedItems = Array.from(itemsByName.values());
    return c.json(deduplicatedItems);
  } catch (error) {
    return c.json({ error: 'Failed to get trackable items' }, 500);
  }
});

// Update a trackable item (e.g. change religiousGuardrailMode, points, name)
app.patch(
  "/make-server-f116e23f/trackable-items/:id",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();

      const item = await kv.get(id);
      if (!item) {
        return c.json({ error: 'Trackable item not found' }, 404);
      }

      // Don't let callers overwrite the id or creation timestamp
      const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates || {};

      const updated = {
        ...item,
        ...safeUpdates,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(id, updated);

      return c.json(updated);
    } catch (error) {
      return c.json({ error: 'Failed to update trackable item' }, 500);
    }
  }
);

// Deduplicate trackable items (admin/debug endpoint)
app.post(
  "/make-server-f116e23f/trackable-items/dedupe",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const items = await kv.getByPrefix('item:');
    
    // Group items by name
    const itemsByName = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByName.has(item.name)) {
        itemsByName.set(item.name, []);
      }
      itemsByName.get(item.name)!.push(item);
    }
    
    // Find duplicates
    const duplicates: any[] = [];
    for (const [name, itemList] of itemsByName.entries()) {
      if (itemList.length > 1) {
        // Keep the oldest item (earliest timestamp in ID), delete the rest
        itemList.sort((a, b) => {
          const aTime = parseInt(a.id.split(':')[1] || '0');
          const bTime = parseInt(b.id.split(':')[1] || '0');
          return aTime - bTime;
        });
        
        const toKeep = itemList[0];
        const toDelete = itemList.slice(1);
        
        for (const item of toDelete) {
          await kv.del(item.id);
          duplicates.push({ name, deletedId: item.id });
        }
      }
    }
    
    return c.json({ 
      message: 'Deduplication complete', 
      duplicatesRemoved: duplicates.length,
      details: duplicates
    });
  } catch (error) {
    return c.json({ error: 'Failed to deduplicate items' }, 500);
  }
});

// ===== MILESTONES =====

// Create milestone
app.post(
  "/make-server-f116e23f/milestones",
  requireAuth,
  requireParent,
  validate(validateMilestone),
  async (c) => {
  try {
    const milestoneData = await c.req.json();
    const milestoneId = `milestone:${Date.now()}`;
    
    const milestone = {
      id: milestoneId,
      ...milestoneData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(milestoneId, milestone);
    return c.json(milestone);
  } catch (error) {
    return c.json({ error: 'Failed to create milestone' }, 500);
  }
});

// Get all milestones
app.get(
  "/make-server-f116e23f/milestones",
  requireAuth,
  // Kids can READ milestones (but not create/delete them)
  async (c) => {
  try {
    const milestones = await kv.getByPrefix('milestone:');
    
    // Deduplicate by points (keep oldest based on timestamp in ID)
    const milestonesByPoints = new Map<number, any>();
    for (const milestone of milestones) {
      const existing = milestonesByPoints.get(milestone.points);
      if (!existing) {
        milestonesByPoints.set(milestone.points, milestone);
      } else {
        // Keep the one with the older ID (lower timestamp)
        const existingTimestamp = parseInt(existing.id.split(':')[1] || '0');
        const currentTimestamp = parseInt(milestone.id.split(':')[1] || '0');
        if (currentTimestamp < existingTimestamp) {
          milestonesByPoints.set(milestone.points, milestone);
        }
      }
    }
    
    // Return deduplicated milestones sorted by points
    const deduplicatedMilestones = Array.from(milestonesByPoints.values());
    return c.json(deduplicatedMilestones.sort((a: any, b: any) => a.points - b.points));
  } catch (error) {
    return c.json({ error: 'Failed to get milestones' }, 500);
  }
});

// Delete milestone
app.delete(
  "/make-server-f116e23f/milestones/:id",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      await kv.del(id);
      return c.json({ success: true });
    } catch (error) {
      console.error('Delete milestone error:', error);
      return c.json({ error: 'Failed to delete milestone' }, 500);
    }
  }
);

// ===== REWARDS =====

// Create reward
app.post(
  "/make-server-f116e23f/rewards",
  requireAuth,
  requireParent,
  validate(validateReward),
  async (c) => {
  try {
    const rewardData = await c.req.json();
    const rewardId = `reward:${Date.now()}`;
    
    const reward = {
      id: rewardId,
      ...rewardData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(rewardId, reward);
    return c.json(reward);
  } catch (error) {
    return c.json({ error: 'Failed to create reward' }, 500);
  }
});

// Get all rewards
app.get(
  "/make-server-f116e23f/rewards",
  requireAuth,
  // Kids can READ rewards (but not create/delete them)
  async (c) => {
  try {
    const rewards = await kv.getByPrefix('reward:');
    return c.json(rewards.sort((a: any, b: any) => a.pointCost - b.pointCost));
  } catch (error) {
    return c.json({ error: 'Failed to get rewards' }, 500);
  }
});

// Delete reward
app.delete(
  "/make-server-f116e23f/rewards/:id",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      await kv.del(id);
      return c.json({ success: true });
    } catch (error) {
      console.error('Delete reward error:', error);
      return c.json({ error: 'Failed to delete reward' }, 500);
    }
  }
);

// ===== PRAYER LOGGING =====

// Get prayer configuration (prayer names and times)
app.get(
  "/make-server-f116e23f/prayers/config",
  requireAuth,
  async (c) => {
    try {
      return c.json({
        prayers: PRAYER_NAMES,
        times: PRAYER_TIMES
      });
    } catch (error) {
      console.error('Get prayer config error:', error);
      return c.json({ error: 'Failed to fetch prayer config' }, 500);
    }
  }
);

// Create prayer claim (Kid initiates)
app.post(
  "/make-server-f116e23f/prayer-claims",
  requireAuth,
  async (c) => {
    try {
      const body = await c.req.json();
      const { childId, prayerName, points = 5, backdateDate } = body;

      if (!childId || !prayerName) {
        return c.json({ error: 'childId and prayerName are required' }, 400);
      }

      // Verify child access (kid session or parent)
      const userId = getAuthUserId(c);
      
      // Check if it's a kid session
      const sessionToken = c.req.header('Authorization')?.split(' ')[1];
      let isKidSession = false;
      
      if (sessionToken && sessionToken.startsWith('kid_')) {
        const session = await verifyKidSession(sessionToken);
        console.log('🔍 Kid session verification result:', session);
        
        if (!session.valid) {
          return c.json({ error: 'Invalid or expired kid session' }, 401);
        }
        
        if (session.childId !== childId) {
          return c.json({ error: 'Cannot create claim for another child' }, 403);
        }
        
        isKidSession = true;
      }
      
      // If not a kid session, verify parent has access to this child
      if (!isKidSession) {
        const child = await kv.get(childId); // childId already includes "child:" prefix
        if (!child) {
          return c.json({ error: 'Child not found' }, 404);
        }

        const user = await kv.get(`user:${userId}`);
        if (!user || user.familyId !== child.familyId) {
          return c.json({ error: 'No access to this child' }, 403);
        }
      }

      // Get family timezone
      const child = await kv.get(childId); // childId already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      const family = child.familyId ? await kv.get(child.familyId) : null;
      const timezone = family?.timezone || 'UTC';

      const claim = await createPrayerClaim(childId, prayerName, points, timezone, backdateDate);
      
      return c.json(claim, 201);
    } catch (error: any) {
      console.error('Create prayer claim error:', error);
      return c.json({ error: error.message || 'Failed to create prayer claim' }, 400);
    }
  }
);

// Get claims for a child
app.get(
  "/make-server-f116e23f/prayer-claims/child/:childId",
  requireAuth,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const status = c.req.query('status') as 'pending' | 'approved' | 'denied' | undefined;
      const limit = parseInt(c.req.query('limit') || '50');

      // Verify access
      const userId = getAuthUserId(c);
      const child = await kv.get(childId); // childId from URL already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      // Check if it's a kid session
      const sessionToken = c.req.header('Authorization')?.split(' ')[1];
      let isKidSession = false;
      
      if (sessionToken && sessionToken.startsWith('kid_')) {
        const session = await verifyKidSession(sessionToken);
        
        if (!session.valid) {
          return c.json({ error: 'Invalid or expired kid session' }, 401);
        }
        
        if (session.childId !== childId) {
          return c.json({ error: 'Cannot access claims for another child' }, 403);
        }
        
        isKidSession = true;
      }
      
      if (!isKidSession) {
        // Verify parent has access
        const user = await kv.get(`user:${userId}`);
        if (!user || user.familyId !== child.familyId) {
          return c.json({ error: 'No access to this child' }, 403);
        }
      }

      const claims = await getChildClaims(childId, status, limit);
      
      return c.json(claims);
    } catch (error) {
      console.error('Get child claims error:', error);
      return c.json({ error: 'Failed to fetch claims' }, 500);
    }
  }
);

// Get claims for a specific date
app.get(
  "/make-server-f116e23f/prayer-claims/child/:childId/date/:date",
  requireAuth,
  async (c) => {
    try {
      const { childId, date } = c.req.param();

      // Verify access
      const userId = getAuthUserId(c);
      const child = await kv.get(childId); // childId from URL already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const sessionToken = c.req.header('Authorization')?.split(' ')[1];
      let isKidSession = false;
      
      if (sessionToken && sessionToken.startsWith('kid_')) {
        const session = await verifyKidSession(sessionToken);
        
        if (!session.valid) {
          return c.json({ error: 'Invalid or expired kid session' }, 401);
        }
        
        if (session.childId !== childId) {
          return c.json({ error: 'Cannot access claims for another child' }, 403);
        }
        
        isKidSession = true;
      }
      
      if (!isKidSession) {
        const user = await kv.get(`user:${userId}`);
        if (!user || user.familyId !== child.familyId) {
          return c.json({ error: 'No access to this child' }, 403);
        }
      }

      const claims = await getClaimsForDate(childId, date);
      
      return c.json(claims);
    } catch (error) {
      console.error('Get claims for date error:', error);
      return c.json({ error: 'Failed to fetch claims' }, 500);
    }
  }
);

// Get pending claims for family (Parent dashboard)
app.get(
  "/make-server-f116e23f/prayer-claims/family/pending",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      const user = await kv.get(`user:${userId}`);
      
      if (!user || !user.familyId) {
        return c.json({ error: 'User has no family' }, 400);
      }

      const claims = await getPendingClaimsForFamily(user.familyId);
      
      // Enrich claims with child names
      const enrichedClaims = await Promise.all(
        claims.map(async (claim) => {
          // childId already includes "child:" prefix, don't add it again
          const childKey = claim.childId.startsWith('child:') ? claim.childId : `child:${claim.childId}`;
          const child = await kv.get(childKey);
          return {
            ...claim,
            childName: child?.name || 'Unknown'
          };
        })
      );
      
      return c.json(enrichedClaims);
    } catch (error) {
      console.error('Get pending claims error:', error);
      return c.json({ error: 'Failed to fetch pending claims' }, 500);
    }
  }
);

// Approve prayer claim (Parent action)
app.post(
  "/make-server-f116e23f/prayer-claims/:claimId/approve",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { claimId } = c.req.param();
      const userId = getAuthUserId(c);
      const body = await c.req.json();
      const { onTime = true, bonusPoints = 0, bonusReason = '' } = body;

      // Verify claim exists and belongs to user's family
      const claim = await kv.get(`prayer-claim:${claimId}`);
      if (!claim) {
        return c.json({ error: 'Claim not found' }, 404);
      }

      const child = await kv.get(claim.childId); // claim.childId already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const user = await kv.get(`user:${userId}`);
      if (!user || user.familyId !== child.familyId) {
        return c.json({ error: 'No access to this claim' }, 403);
      }

      const result = await approvePrayerClaim(claimId, userId, onTime, bonusPoints, bonusReason);

      return c.json({
        success: true,
        claim: result.claim,
        pointEvent: result.pointEvent,
        bonusEvent: result.bonusEvent
      });
    } catch (error: any) {
      console.error('Approve claim error:', error);
      return c.json({ error: error.message || 'Failed to approve claim' }, 400);
    }
  }
);

// Deny prayer claim (Parent action)
app.post(
  "/make-server-f116e23f/prayer-claims/:claimId/deny",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { claimId } = c.req.param();
      const userId = getAuthUserId(c);
      const body = await c.req.json();
      const { reason } = body;

      // Verify claim exists and belongs to user's family
      const claim = await kv.get(`prayer-claim:${claimId}`);
      if (!claim) {
        return c.json({ error: 'Claim not found' }, 404);
      }

      const child = await kv.get(claim.childId); // claim.childId already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const user = await kv.get(`user:${userId}`);
      if (!user || user.familyId !== child.familyId) {
        return c.json({ error: 'No access to this claim' }, 403);
      }

      const updatedClaim = await denyPrayerClaim(claimId, userId, reason);
      
      return c.json({
        success: true,
        claim: updatedClaim
      });
    } catch (error: any) {
      console.error('Deny claim error:', error);
      return c.json({ error: error.message || 'Failed to deny claim' }, 400);
    }
  }
);

// Get prayer statistics for a child
app.get(
  "/make-server-f116e23f/prayer-claims/child/:childId/stats",
  requireAuth,
  async (c) => {
    try {
      const { childId } = c.req.param();
      const days = parseInt(c.req.query('days') || '7');

      // Verify access
      const userId = getAuthUserId(c);
      const child = await kv.get(childId); // childId from URL already includes "child:" prefix
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const sessionToken = c.req.header('Authorization')?.split(' ')[1];
      let isKidSession = false;
      
      if (sessionToken && sessionToken.startsWith('kid_')) {
        const session = await verifyKidSession(sessionToken);
        
        if (!session.valid) {
          return c.json({ error: 'Invalid or expired kid session' }, 401);
        }
        
        if (session.childId !== childId) {
          return c.json({ error: 'Cannot access stats for another child' }, 403);
        }
        
        isKidSession = true;
      }
      
      if (!isKidSession) {
        const user = await kv.get(`user:${userId}`);
        if (!user || user.familyId !== child.familyId) {
          return c.json({ error: 'No access to this child' }, 403);
        }
      }

      const stats = await getPrayerStats(childId, days);
      
      return c.json(stats);
    } catch (error) {
      console.error('Get prayer stats error:', error);
      return c.json({ error: 'Failed to fetch stats' }, 500);
    }
  }
);

// ===== WISHLIST =====

// Create wishlist item (Kids can submit wishes)
app.post(
  "/make-server-f116e23f/wishlists",
  requireAuth,
  validate(validateWishlistItem),
  async (c) => {
  try {
    const wishlistData = await c.req.json();
    const wishlistId = `wishlist:${Date.now()}`;
    
    const wishlistItem = {
      id: wishlistId,
      ...wishlistData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await kv.set(wishlistId, wishlistItem);
    return c.json(wishlistItem);
  } catch (error) {
    return c.json({ error: 'Failed to create wishlist item' }, 500);
  }
});

// Get all wishlist items for family
app.get(
  "/make-server-f116e23f/wishlists",
  requireAuth,
  async (c) => {
  try {
    const wishlists = await kv.getByPrefix('wishlist:');
    const sorted = wishlists.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return c.json(sorted);
  } catch (error) {
    return c.json({ error: 'Failed to get wishlists' }, 500);
  }
});

// Update wishlist item status (Parent only)
app.patch(
  "/make-server-f116e23f/wishlists/:wishlistId/status",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const { status } = await c.req.json();
    
    if (!['pending', 'approved', 'converted', 'rejected'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    const wishlist = await kv.get(wishlistKey);
    
    if (!wishlist) {
      return c.json({ error: 'Wishlist item not found' }, 404);
    }
    
    const updated = {
      ...wishlist,
      status,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(wishlistKey, updated);
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update wishlist status' }, 500);
  }
});

// Convert wishlist to reward (Parent only)
app.post(
  "/make-server-f116e23f/wishlists/:wishlistId/convert",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const { pointCost } = await c.req.json();
    
    if (!pointCost || pointCost <= 0) {
      return c.json({ error: 'Valid pointCost is required' }, 400);
    }
    
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    const wishlist = await kv.get(wishlistKey);
    
    if (!wishlist) {
      return c.json({ error: 'Wishlist item not found' }, 404);
    }
    
    // Auto-categorize based on points
    let category: 'small' | 'medium' | 'large' = 'small';
    if (pointCost >= 500) category = 'large';
    else if (pointCost >= 100) category = 'medium';
    
    // Create reward from wishlist
    const rewardId = `reward:${Date.now()}`;
    const reward = {
      id: rewardId,
      name: wishlist.wishText || 'Audio Wish Reward',
      category,
      pointCost,
      description: wishlist.audioUrl ? 'Wish submitted via audio' : undefined,
      fromWishlist: wishlistId,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(rewardId, reward);
    
    // Update wishlist status to converted
    const updatedWishlist = {
      ...wishlist,
      status: 'converted',
      convertedToRewardId: rewardId,
      updatedAt: new Date().toISOString()
    };
    await kv.set(wishlistKey, updatedWishlist);
    
    return c.json({ wishlist: updatedWishlist, reward });
  } catch (error) {
    return c.json({ error: 'Failed to convert wishlist to reward' }, 500);
  }
});

// Delete wishlist item (Parent only)
app.delete(
  "/make-server-f116e23f/wishlists/:wishlistId",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const wishlistId = c.req.param('wishlistId');
    const wishlistKey = wishlistId.startsWith('wishlist:') ? wishlistId : `wishlist:${wishlistId}`;
    
    await kv.del(wishlistKey);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete wishlist item' }, 500);
  }
});

// ===== QUIZZES =====

// Create quiz
app.post(
  "/make-server-f116e23f/quizzes",
  requireAuth,
  requireParent,
  validate(validateQuiz),
  async (c) => {
  try {
    const quizData = await c.req.json();
    const quizId = `quiz:${Date.now()}`;
    
    const quiz = {
      id: quizId,
      ...quizData,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(quizId, quiz);
    return c.json(quiz);
  } catch (error) {
    return c.json({ error: 'Failed to create quiz' }, 500);
  }
});

// Get all quizzes
app.get(
  "/make-server-f116e23f/quizzes",
  requireAuth,
  async (c) => {
  try {
    const quizzes = await kv.getByPrefix('quiz:');
    return c.json(quizzes.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
  } catch (error) {
    return c.json({ error: 'Failed to get quizzes' }, 500);
  }
});

// Get quiz by ID
app.get(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  async (c) => {
  try {
    const id = c.req.param('id');
    const quiz = await kv.get(id);
    
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    return c.json(quiz);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz' }, 500);
  }
});

// Update quiz
app.patch(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  requireParent,
  validate(validateQuiz),
  async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const quiz = await kv.get(id);
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    const updated = { ...quiz, ...updates };
    await kv.set(id, updated);
    
    return c.json(updated);
  } catch (error) {
    return c.json({ error: 'Failed to update quiz' }, 500);
  }
});

// Delete quiz
app.delete(
  "/make-server-f116e23f/quizzes/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(id);
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete quiz' }, 500);
  }
});

// Submit quiz attempt
app.post(
  "/make-server-f116e23f/quiz-attempts",
  requireAuth,
  validate(validateQuizAttempt),
  async (c) => {
  try {
    const attemptData = await c.req.json();
    const attemptId = `quizattempt:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const attempt = {
      id: attemptId,
      ...attemptData,
      completedAt: new Date().toISOString()
    };
    
    await kv.set(attemptId, attempt);
    
    // Award points to child
    if (attemptData.childId && attemptData.pointsEarned > 0) {
      const child = await kv.get(attemptData.childId);
      if (child) {
        let newPoints = child.currentPoints + attemptData.pointsEarned;
        const newHighest = Math.max(child.highestMilestone || 0, newPoints);
        
        // Milestone floor protection
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= newHighest)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        if (newPoints < floor) {
          newPoints = floor;
        }
        
        await kv.set(attemptData.childId, {
          ...child,
          currentPoints: newPoints,
          highestMilestone: newHighest
        });
      }
    }
    
    return c.json(attempt);
  } catch (error) {
    return c.json({ error: 'Failed to submit quiz attempt' }, 500);
  }
});

// Get quiz attempts for a child
app.get(
  "/make-server-f116e23f/children/:childId/quiz-attempts",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allAttempts = await kv.getByPrefix('quizattempt:');
    const childAttempts = allAttempts
      .filter((attempt: any) => attempt.childId === childId)
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    return c.json(childAttempts);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz attempts' }, 500);
  }
});

// Get attempts for a specific quiz
app.get(
  "/make-server-f116e23f/quizzes/:quizId/attempts",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const quizId = c.req.param('quizId');
    const allAttempts = await kv.getByPrefix('quizattempt:');
    const quizAttempts = allAttempts
      .filter((attempt: any) => attempt.quizId === quizId)
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    return c.json(quizAttempts);
  } catch (error) {
    return c.json({ error: 'Failed to get quiz attempts' }, 500);
  }
});

// ===== KNOWLEDGE QUEST SYSTEM (New Dynamic Question Bank) =====

// Create question
app.post(
  "/make-server-f116e23f/questions",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    if (!familyId) {
      return c.json({ error: 'User must be part of a family' }, 400);
    }
    
    const questionData = await c.req.json();
    
    // Validate unless it's a bulk import
    const validation = validateQuestion(questionData);
    if (!validation.valid) {
      console.error('Question validation error:', validation.errors);
      return c.json({ error: validation.errors.join(', ') }, 400);
    }
    
    const questionId = `question:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const question = {
      id: questionId,
      ...questionData,
      familyId,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      timesAnswered: 0,
      timesCorrect: 0,
      isPublic: questionData.isPublic || false
    };
    
    await kv.set(questionId, question);
    return c.json(question);
  } catch (error) {
    console.error('Create question error:', error);
    return c.json({ error: 'Failed to create question' }, 500);
  }
});

// Get all questions (filtered by family or public)
app.get(
  "/make-server-f116e23f/questions",
  requireAuth,
  async (c) => {
  try {
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    const allQuestions = await kv.getByPrefix('question:');
    
    // Filter: Show family's questions + public questions
    const questions = allQuestions.filter((q: any) => 
      q.familyId === familyId || q.isPublic === true
    );
    
    return c.json(questions.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
  } catch (error) {
    console.error('Get questions error:', error);
    return c.json({ error: 'Failed to get questions' }, 500);
  }
});

// Get question by ID
app.get(
  "/make-server-f116e23f/questions/:id",
  requireAuth,
  async (c) => {
  try {
    const id = c.req.param('id');
    const question = await kv.get(id);
    
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    // Access check: must be from same family or public
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    if (question.familyId !== familyId && !question.isPublic) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    return c.json(question);
  } catch (error) {
    console.error('Get question error:', error);
    return c.json({ error: 'Failed to get question' }, 500);
  }
});

// Update question
app.patch(
  "/make-server-f116e23f/questions/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const question = await kv.get(id);
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    // Access check: must be from same family
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    if (question.familyId !== familyId) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    // Validate updates
    const updatedData = { ...question, ...updates };
    const validation = validateQuestion(updatedData);
    if (!validation.valid) {
      console.error('Question validation error:', validation.errors);
      return c.json({ error: validation.errors.join(', ') }, 400);
    }
    
    const updated = { ...updatedData, updatedAt: new Date().toISOString() };
    await kv.set(id, updated);
    
    return c.json(updated);
  } catch (error) {
    console.error('Update question error:', error);
    return c.json({ error: 'Failed to update question' }, 500);
  }
});

// Delete question
app.delete(
  "/make-server-f116e23f/questions/:id",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const id = c.req.param('id');
    const question = await kv.get(id);
    
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    // Access check
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    if (question.familyId !== familyId) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    await kv.del(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete question error:', error);
    return c.json({ error: 'Failed to delete question' }, 500);
  }
});

// Seed sample questions (public endpoint for initial setup)
app.post(
  "/make-server-f116e23f/questions/seed-samples",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    // Check if questions already exist to avoid duplicate seeding
    const existingQuestions = await kv.getByPrefix('question:');
    const publicQuestions = existingQuestions.filter((q: any) => q.isPublic === true);
    
    if (publicQuestions.length > 0) {
      return c.json({ 
        message: 'Sample questions already exist', 
        count: publicQuestions.length 
      });
    }
    
    const sampleQuestions = [
      // ISLAMIC - EASY
      {
        category: 'islamic',
        difficulty: 'easy',
        questionText: 'How many times do Muslims pray each day?',
        questionType: 'multiple_choice',
        options: ['3 times', '5 times', '7 times', '10 times'],
        correctAnswerIndex: 1,
        hint: 'Think about the five daily prayers: Fajr, Dhuhr, Asr, Maghrib, and Isha.',
        hintReducedOptions: ['5 times', '7 times'],
        basePoints: 5,
        hintPenalty: 2,
        explanation: 'Muslims pray five times a day: Fajr (dawn), Dhuhr (noon), Asr (afternoon), Maghrib (sunset), and Isha (night).',
        isPublic: true
      },
      {
        category: 'islamic',
        difficulty: 'easy',
        questionText: 'What is the first pillar of Islam?',
        questionType: 'multiple_choice',
        options: ['Salah (Prayer)', 'Shahada (Declaration of Faith)', 'Zakat (Charity)', 'Hajj (Pilgrimage)'],
        correctAnswerIndex: 1,
        hint: 'It is the declaration of faith that there is no god but Allah.',
        hintReducedOptions: ['Shahada (Declaration of Faith)', 'Salah (Prayer)'],
        basePoints: 5,
        hintPenalty: 2,
        explanation: 'The Shahada is the first pillar: "There is no god but Allah, and Muhammad is His messenger."',
        isPublic: true
      },
      {
        category: 'quran',
        difficulty: 'easy',
        questionText: 'What is the first Surah in the Quran?',
        questionType: 'multiple_choice',
        options: ['Al-Baqarah', 'Al-Fatiha', 'Al-Ikhlas', 'An-Nas'],
        correctAnswerIndex: 1,
        hint: 'It is called "The Opening" and is recited in every unit of prayer.',
        hintReducedOptions: ['Al-Fatiha', 'Al-Baqarah'],
        basePoints: 5,
        hintPenalty: 2,
        explanation: 'Al-Fatiha (The Opening) is the first chapter of the Quran and is recited in every rakat of prayer.',
        isPublic: true
      },
      // ISLAMIC - MEDIUM
      {
        category: 'islamic',
        difficulty: 'medium',
        questionText: 'In which Islamic month do Muslims fast from dawn to sunset?',
        questionType: 'multiple_choice',
        options: ['Muharram', 'Ramadan', 'Shawwal', 'Dhul-Hijjah'],
        correctAnswerIndex: 1,
        hint: 'This is the 9th month of the Islamic calendar.',
        hintReducedOptions: ['Ramadan', 'Shawwal'],
        basePoints: 10,
        hintPenalty: 3,
        explanation: 'Ramadan is the 9th month of the Islamic calendar, during which Muslims fast from dawn to sunset.',
        isPublic: true
      },
      {
        category: 'hadith',
        difficulty: 'medium',
        questionText: 'Who compiled the most authentic collection of Hadith known as Sahih?',
        questionType: 'multiple_choice',
        options: ['Imam Malik', 'Imam Bukhari', 'Imam Ahmad', 'Imam Shafi'],
        correctAnswerIndex: 1,
        hint: 'His full name was Muhammad ibn Ismail.',
        hintReducedOptions: ['Imam Bukhari', 'Imam Muslim'],
        basePoints: 10,
        hintPenalty: 3,
        explanation: 'Imam Bukhari compiled Sahih al-Bukhari, considered the most authentic collection of Hadith.',
        isPublic: true
      },
      // ISLAMIC - HARD
      {
        category: 'fiqh',
        difficulty: 'hard',
        questionText: 'What are the conditions that make Zakat obligatory on wealth?',
        questionType: 'multiple_choice',
        options: ['Ownership and nisab only', 'Nisab, full ownership, one lunar year, and wealth is productive', 'Just having money', 'Being wealthy for 6 months'],
        correctAnswerIndex: 1,
        hint: 'There are multiple conditions including a minimum threshold and time period.',
        hintReducedOptions: ['Nisab, full ownership, one lunar year, and wealth is productive', 'Ownership and nisab only'],
        basePoints: 20,
        hintPenalty: 5,
        explanation: 'Zakat becomes obligatory when wealth reaches nisab (minimum threshold), is fully owned, has been held for one lunar year, and is in a productive form.',
        isPublic: true
      },
      // GENERAL KNOWLEDGE - EASY
      {
        category: 'math',
        difficulty: 'easy',
        questionText: 'What is 7 × 8?',
        questionType: 'multiple_choice',
        options: ['54', '56', '64', '72'],
        correctAnswerIndex: 1,
        hint: 'Think of 7 groups of 8.',
        hintReducedOptions: ['56', '64'],
        basePoints: 5,
        hintPenalty: 2,
        explanation: '7 × 8 = 56',
        isPublic: true
      },
      {
        category: 'science',
        difficulty: 'easy',
        questionText: 'What do plants need to make their own food?',
        questionType: 'multiple_choice',
        options: ['Soil and rocks', 'Sunlight, water, and carbon dioxide', 'Only water', 'Wind and rain'],
        correctAnswerIndex: 1,
        hint: 'This process is called photosynthesis.',
        hintReducedOptions: ['Sunlight, water, and carbon dioxide', 'Only water'],
        basePoints: 5,
        hintPenalty: 2,
        explanation: 'Plants use sunlight, water, and carbon dioxide to make food through photosynthesis.',
        isPublic: true
      },
      // GENERAL KNOWLEDGE - MEDIUM
      {
        category: 'geography',
        difficulty: 'medium',
        questionText: 'What is the capital city of Egypt?',
        questionType: 'multiple_choice',
        options: ['Alexandria', 'Cairo', 'Luxor', 'Giza'],
        correctAnswerIndex: 1,
        hint: 'It is the largest city in the Arab world.',
        hintReducedOptions: ['Cairo', 'Alexandria'],
        basePoints: 10,
        hintPenalty: 3,
        explanation: 'Cairo is the capital and largest city of Egypt.',
        isPublic: true
      },
      {
        category: 'history',
        difficulty: 'medium',
        questionText: 'Which famous library in the Islamic Golden Age was located in Baghdad?',
        questionType: 'multiple_choice',
        options: ['House of Knowledge', 'House of Wisdom', 'House of Books', 'House of Learning'],
        correctAnswerIndex: 1,
        hint: 'Its Arabic name is "Bayt al-Hikmah".',
        hintReducedOptions: ['House of Wisdom', 'House of Knowledge'],
        basePoints: 10,
        hintPenalty: 3,
        explanation: 'The House of Wisdom (Bayt al-Hikmah) was a major intellectual center during the Islamic Golden Age.',
        isPublic: true
      },
      // TRUE/FALSE Questions
      {
        category: 'islamic',
        difficulty: 'easy',
        questionText: 'The Kaaba is located in Mecca.',
        questionType: 'true_false',
        correctBoolean: true,
        basePoints: 5,
        hintPenalty: 0,
        explanation: 'The Kaaba is located in Mecca, Saudi Arabia, and is the direction Muslims face during prayer.',
        isPublic: true
      },
      {
        category: 'quran',
        difficulty: 'medium',
        questionText: 'The Quran has 100 chapters (Surahs).',
        questionType: 'true_false',
        correctBoolean: false,
        basePoints: 10,
        hintPenalty: 0,
        explanation: 'The Quran has 114 chapters (Surahs), not 100.',
        isPublic: true
      }
    ];
    
    // Create all sample questions
    const createdQuestions = [];
    for (const questionData of sampleQuestions) {
      const questionId = `question:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const question = {
        id: questionId,
        ...questionData,
        familyId: familyId,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        timesAnswered: 0,
        timesCorrect: 0
      };
      
      await kv.set(questionId, question);
      createdQuestions.push(question);
      // Small delay to ensure unique timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return c.json({ 
      message: 'Sample questions created successfully',
      count: createdQuestions.length,
      questions: createdQuestions
    });
  } catch (error) {
    console.error('Seed questions error:', error);
    return c.json({ error: 'Failed to seed questions' }, 500);
  }
});

// Get random question by difficulty and optional category
app.get(
  "/make-server-f116e23f/questions/random/:difficulty",
  requireAuth,
  async (c) => {
  try {
    const difficulty = c.req.param('difficulty');
    const category = c.req.query('category');
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return c.json({ error: 'Invalid difficulty' }, 400);
    }
    
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    const allQuestions = await kv.getByPrefix('question:');
    
    // Filter by family/public, difficulty, and optionally category
    let questions = allQuestions.filter((q: any) => 
      (q.familyId === familyId || q.isPublic === true) &&
      q.difficulty === difficulty
    );
    
    if (category) {
      questions = questions.filter((q: any) => q.category === category);
    }
    
    if (questions.length === 0) {
      return c.json({ error: 'No questions found' }, 404);
    }
    
    // Return random question
    const randomIndex = Math.floor(Math.random() * questions.length);
    return c.json(questions[randomIndex]);
  } catch (error) {
    console.error('Get random question error:', error);
    return c.json({ error: 'Failed to get random question' }, 500);
  }
});

// Start knowledge session
app.post(
  "/make-server-f116e23f/knowledge-sessions",
  requireAuth,
  validate(validateKnowledgeSession),
  async (c) => {
  try {
    const userId = getAuthUserId(c);
    const sessionData = await c.req.json();
    
    // Verify child access
    const child = await kv.get(sessionData.childId);
    if (!child || child.familyId !== sessionData.familyId) {
      return c.json({ error: 'Child not found or access denied' }, 403);
    }
    
    const sessionId = `session:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      id: sessionId,
      childId: sessionData.childId,
      familyId: sessionData.familyId,
      startedAt: new Date().toISOString(),
      status: 'active',
      questionsAnswered: 0,
      correctAnswers: 0,
      totalPointsEarned: 0,
      easyAttempted: 0,
      easyCorrect: 0,
      mediumAttempted: 0,
      mediumCorrect: 0,
      hardAttempted: 0,
      hardCorrect: 0,
      hintsUsed: 0,
      categories: []
    };
    
    await kv.set(sessionId, session);
    return c.json(session);
  } catch (error) {
    console.error('Create session error:', error);
    return c.json({ error: 'Failed to create session' }, 500);
  }
});

// Submit answer to session
app.post(
  "/make-server-f116e23f/knowledge-sessions/:sessionId/answer",
  requireAuth,
  validate(validateSessionAnswer),
  async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const answerData = await c.req.json();
    
    const session = await kv.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    if (session.status !== 'active') {
      return c.json({ error: 'Session is not active' }, 400);
    }
    
    const question = await kv.get(answerData.questionId);
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    // Create session question record
    const sqId = `sessionquestion:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const sessionQuestion = {
      id: sqId,
      sessionId,
      questionId: answerData.questionId,
      questionSnapshot: question,
      difficulty: answerData.difficulty,
      selectedAnswer: answerData.selectedAnswer,
      isCorrect: answerData.isCorrect,
      hintUsed: answerData.hintUsed || false,
      pointsEarned: answerData.pointsEarned,
      timeSpent: answerData.timeSpent || 0,
      answeredAt: new Date().toISOString(),
      orderInSession: session.questionsAnswered + 1
    };
    
    await kv.set(sqId, sessionQuestion);
    
    // Update session stats
    const updatedSession = {
      ...session,
      questionsAnswered: session.questionsAnswered + 1,
      correctAnswers: session.correctAnswers + (answerData.isCorrect ? 1 : 0),
      totalPointsEarned: session.totalPointsEarned + answerData.pointsEarned,
      hintsUsed: session.hintsUsed + (answerData.hintUsed ? 1 : 0)
    };
    
    // Update difficulty breakdown
    if (answerData.difficulty === 'easy') {
      updatedSession.easyAttempted++;
      if (answerData.isCorrect) updatedSession.easyCorrect++;
    } else if (answerData.difficulty === 'medium') {
      updatedSession.mediumAttempted++;
      if (answerData.isCorrect) updatedSession.mediumCorrect++;
    } else if (answerData.difficulty === 'hard') {
      updatedSession.hardAttempted++;
      if (answerData.isCorrect) updatedSession.hardCorrect++;
    }
    
    // Add category if new
    if (question.category && !updatedSession.categories.includes(question.category)) {
      updatedSession.categories.push(question.category);
    }
    
    await kv.set(sessionId, updatedSession);
    
    // Update question stats
    const updatedQuestion = {
      ...question,
      timesAnswered: (question.timesAnswered || 0) + 1,
      timesCorrect: (question.timesCorrect || 0) + (answerData.isCorrect ? 1 : 0),
      lastUsed: new Date().toISOString()
    };
    await kv.set(answerData.questionId, updatedQuestion);
    
    return c.json({
      sessionQuestion,
      session: updatedSession
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    return c.json({ error: 'Failed to submit answer' }, 500);
  }
});

// Complete session and award points
app.post(
  "/make-server-f116e23f/knowledge-sessions/:sessionId/complete",
  requireAuth,
  async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const session = await kv.get(sessionId);
    
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    if (session.status !== 'active') {
      return c.json({ error: 'Session is not active' }, 400);
    }
    
    // POINTS CONVERSION: Games are "extra activities" that complement core behaviors
    // Knowledge Quest points are scaled down by 5% so they remain bonus rewards
    // without overshadowing prayers (5 pts), chores, homework, etc.
    // Examples with new 5% conversion:
    // - Easy (5 base pts) → 0.25 actual pts | With hint (3 pts) → 0.15 actual pts
    // - Medium (10 base pts) → 0.5 actual pts | With hint (6 pts) → 0.3 actual pts
    // - Hard (20 base pts) → 1 actual pt | With hint (15 pts) → 0.75 actual pts
    // This means: answering 5 hard questions without hints = 5 actual points (same as one prayer)
    // This keeps the balance: core behaviors remain the primary point source
    const KNOWLEDGE_QUEST_CONVERSION_RATE = 0.05;
    const convertedPoints = Math.round(session.totalPointsEarned * KNOWLEDGE_QUEST_CONVERSION_RATE);
    
    // Complete session
    const completedSession = {
      ...session,
      status: 'completed',
      endedAt: new Date().toISOString(),
      rawPoints: session.totalPointsEarned, // Track what they earned in-game
      pointsAwarded: convertedPoints // Actual points added to their account
    };
    
    await kv.set(sessionId, completedSession);
    
    // Award points to child
    if (convertedPoints > 0) {
      const child = await kv.get(session.childId);
      if (child) {
        let newPoints = child.currentPoints + convertedPoints;
        const newHighest = Math.max(child.highestMilestone || 0, newPoints);
        
        // Milestone floor protection
        const allMilestones = await kv.getByPrefix('milestone:');
        const achievedMilestones = allMilestones
          .filter((m: any) => m.points <= newHighest)
          .sort((a: any, b: any) => b.points - a.points);
        
        const floor = achievedMilestones[0]?.points || 0;
        if (newPoints < floor) {
          newPoints = floor;
        }
        
        await kv.set(session.childId, {
          ...child,
          currentPoints: newPoints,
          highestMilestone: newHighest
        });
      }
    }
    
    return c.json(completedSession);
  } catch (error) {
    console.error('Complete session error:', error);
    return c.json({ error: 'Failed to complete session' }, 500);
  }
});

// Get session details
app.get(
  "/make-server-f116e23f/knowledge-sessions/:sessionId",
  requireAuth,
  async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const session = await kv.get(sessionId);
    
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    
    // Get all questions from this session
    const allSessionQuestions = await kv.getByPrefix('sessionquestion:');
    const sessionQuestions = allSessionQuestions
      .filter((sq: any) => sq.sessionId === sessionId)
      .sort((a: any, b: any) => a.orderInSession - b.orderInSession);
    
    return c.json({
      session,
      questions: sessionQuestions
    });
  } catch (error) {
    console.error('Get session error:', error);
    return c.json({ error: 'Failed to get session' }, 500);
  }
});

// Get all sessions for a child
app.get(
  "/make-server-f116e23f/children/:childId/knowledge-sessions",
  requireAuth,
  requireChildAccess,
  async (c) => {
  try {
    const childId = c.req.param('childId');
    const allSessions = await kv.getByPrefix('session:');
    
    const childSessions = allSessions
      .filter((s: any) => s.childId === childId)
      .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    
    return c.json(childSessions);
  } catch (error) {
    console.error('Get child sessions error:', error);
    return c.json({ error: 'Failed to get sessions' }, 500);
  }
});

// Get question categories
app.get(
  "/make-server-f116e23f/question-categories",
  requireAuth,
  async (c) => {
  try {
    const userId = getAuthUserId(c);
    const familyId = await getUserFamilyId(c);
    
    const allQuestions = await kv.getByPrefix('question:');
    const familyQuestions = allQuestions.filter((q: any) => 
      q.familyId === familyId || q.isPublic === true
    );
    
    // Group by category
    const categories: any = {};
    
    familyQuestions.forEach((q: any) => {
      const cat = q.category || 'uncategorized';
      if (!categories[cat]) {
        categories[cat] = {
          name: cat,
          total: 0,
          easy: 0,
          medium: 0,
          hard: 0
        };
      }
      
      categories[cat].total++;
      if (q.difficulty === 'easy') categories[cat].easy++;
      if (q.difficulty === 'medium') categories[cat].medium++;
      if (q.difficulty === 'hard') categories[cat].hard++;
    });
    
    return c.json(Object.values(categories));
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ error: 'Failed to get categories' }, 500);
  }
});

// ===== GAME SETTINGS =====

// Get game settings for a family
app.get(
  "/make-server-f116e23f/families/:familyId/game-settings",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
  try {
    const familyId = c.req.param('familyId');
    const settingsKey = `gamesettings:${familyId}`;
    
    let settings = await kv.get(settingsKey);
    
    // Default settings if none exist
    if (!settings) {
      settings = {
        id: settingsKey,
        familyId,
        knowledgeQuestEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await kv.set(settingsKey, settings);
    }
    
    return c.json(settings);
  } catch (error) {
    console.error('Get game settings error:', error);
    return c.json({ error: 'Failed to get game settings' }, 500);
  }
});

// Update game settings for a family
app.patch(
  "/make-server-f116e23f/families/:familyId/game-settings",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const familyId = c.req.param('familyId');
    const body = await c.req.json();
    const settingsKey = `gamesettings:${familyId}`;
    
    let settings = await kv.get(settingsKey);
    
    // Create if doesn't exist
    if (!settings) {
      settings = {
        id: settingsKey,
        familyId,
        knowledgeQuestEnabled: true,
        createdAt: new Date().toISOString()
      };
    }
    
    // Update settings
    if (typeof body.knowledgeQuestEnabled === 'boolean') {
      settings.knowledgeQuestEnabled = body.knowledgeQuestEnabled;
    }
    
    settings.updatedAt = new Date().toISOString();
    
    await kv.set(settingsKey, settings);
    
    console.log(`✅ Updated game settings for family ${familyId}:`, settings);
    
    return c.json(settings);
  } catch (error) {
    console.error('Update game settings error:', error);
    return c.json({ error: 'Failed to update game settings' }, 500);
  }
});

// ===== ADMIN RECONCILIATION TOOLS =====

// Recalculate child points from ledger (admin repair tool)
app.post(
  "/make-server-f116e23f/admin/recalculate-points/:childId",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const { childId } = c.req.param();
    
    const child = await kv.get(childId);
    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }
    
    // Get all active (non-voided) events for this child
    const allEvents = await kv.getByPrefix('event:');
    const childEvents = allEvents.filter((e: any) => 
      e.childId === childId && e.status === 'active'
    );
    
    // Recalculate total from ledger
    const recalculatedPoints = childEvents.reduce((sum: number, e: any) => {
      return sum + (e.points || 0);
    }, 0);
    
    const currentPoints = child.currentPoints || 0;
    const difference = recalculatedPoints - currentPoints;
    
    // Update child with recalculated value
    const updatedChild = {
      ...child,
      currentPoints: Math.max(0, recalculatedPoints), // Never go negative
      lastReconciled: new Date().toISOString(),
      reconciledDifference: difference
    };
    
    await kv.set(childId, updatedChild);
    
    
    return c.json({
      success: true,
      before: currentPoints,
      after: recalculatedPoints,
      difference,
      eventsProcessed: childEvents.length,
      message: difference === 0 
        ? 'Points were already correct' 
        : `Points corrected by ${difference > 0 ? '+' : ''}${difference}`
    });
  } catch (error) {
    return c.json({ error: 'Failed to recalculate points', details: String(error) }, 500);
  }
});

// Health check with system stats
app.get(
  "/make-server-f116e23f/admin/system-stats",
  requireAuth,
  requireParent,
  async (c) => {
  try {
    const families = await kv.getByPrefix('family:');
    const children = await kv.getByPrefix('child:');
    const events = await kv.getByPrefix('event:');
    const challenges = await kv.getByPrefix('challenge:');
    const quizzes = await kv.getByPrefix('quiz:');
    
    const activeEvents = events.filter((e: any) => e.status === 'active');
    const voidedEvents = events.filter((e: any) => e.status === 'voided');
    
    return c.json({
      families: families.length,
      children: children.length,
      events: {
        total: events.length,
        active: activeEvents.length,
        voided: voidedEvents.length
      },
      challenges: challenges.length,
      quizzes: quizzes.length,
      systemHealth: 'operational'
    });
  } catch (error) {
    return c.json({ error: 'Failed to get system stats' }, 500);
  }
});

// ===== FAMILY INVITES =====

// Create family invite (Parent only)
app.post(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  validate(validateInvite),
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { email } = getValidatedBody(c);
      const invitedBy = getAuthUserId(c);
    
    const { inviteCode, expiresAt } = await createInvite(familyId, email, invitedBy);
    
    return c.json({
      success: true,
      inviteCode,
      expiresAt,
      email,
      familyId,
      message: `Invite code: ${inviteCode} (expires in 72 hours)`
    });
  } catch (error) {
    return c.json({ error: 'Failed to create invite', details: String(error) }, 500);
  }
});

// Get family invites (Parent only)
app.get(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
  try {
    const { familyId } = c.req.param();
    const invites = await getFamilyInvites(familyId);
    
    return c.json(invites);
  } catch (error) {
    return c.json({ error: 'Failed to get invites' }, 500);
  }
});

// Accept family invite (Public endpoint - creates new user account)
app.post(
  "/make-server-f116e23f/invites/accept",
  validate(validateInviteAccept),
  async (c) => {
    try {
      const { inviteCode, name, email, password } = getValidatedBody(c);
    
    // Validate invite
    const validation = await checkInvite(inviteCode, email);
    
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }
    
    const familyId = validation.familyId;
    
    // Create user account via Supabase Auth
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: 'parent' },
      email_confirm: true // Auto-confirm for beta
    });
    
    if (error) {
      return c.json({ error: error.message }, 400);
    }
    
    const userId = data.user.id;
    
    // Create user record in KV store
    await kv.set(`user:${userId}`, {
      id: userId,
      email,
      name,
      role: 'parent',
      familyId,
      createdAt: new Date().toISOString()
    });
    
    // Mark invite as accepted
    await acceptInvite(inviteCode, userId);
    
    // Add user to family's parent list
    const family = await kv.get(familyId);
    if (family) {
      const parentIds = family.parentIds || [];
      if (!parentIds.includes(userId)) {
        parentIds.push(userId);
      }
      await kv.set(familyId, {
        ...family,
        parentIds
      });
    }
    
    return c.json({
      success: true,
      user: data.user,
      familyId,
      message: 'Successfully joined family'
    });
  } catch (error) {
    return c.json({ error: 'Failed to accept invite', details: String(error) }, 500);
  }
});

// Revoke family invite (Parent only)
app.post("/make-server-f116e23f/invites/:code/revoke", async (c) => {
  try {
    const { code } = c.req.param();
    
    await revokeInvite(code);
    
    return c.json({ success: true, message: 'Invite revoked' });
  } catch (error) {
    return c.json({ error: 'Failed to revoke invite' }, 500);
  }
});

// ===== EDIT REQUESTS =====
// Get all edit requests for the user's families
app.get(
  "/make-server-f116e23f/edit-requests",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      // Get all families where user is a member
      const familiesResult = await kv.getByPrefix(`family:`);
      const userFamilies = familiesResult
        .filter((f: any) => f.members?.includes(userId))
        .map((f: any) => f.id);
      
      // Get edit requests for all user's families
      const allRequests: any[] = [];
      for (const familyId of userFamilies) {
        const requests = await kv.getByPrefix(`edit_request:${familyId}:`);
        allRequests.push(...requests);
      }
      
      // Sort by createdAt descending (newest first)
      allRequests.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      return c.json(allRequests);
    } catch (error) {
      console.error('❌ Error fetching edit requests:', error);
      return c.json({ error: 'Failed to fetch edit requests' }, 500);
    }
  }
);

// Resolve an edit request (approve or reject)
app.post(
  "/make-server-f116e23f/edit-requests/:requestId/resolve",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { requestId } = c.req.param();
      const body = await c.req.json();
      const { status, resolverId, resolution } = body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return c.json({ error: 'Invalid status. Must be approved or rejected' }, 400);
      }
      
      // Get the edit request
      const request = await kv.get(requestId);
      if (!request) {
        return c.json({ error: 'Edit request not found' }, 404);
      }
      
      // Update the request status
      const updatedRequest = {
        ...request,
        status,
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolverId,
        resolution: resolution || ''
      };
      
      await kv.set(requestId, updatedRequest);
      
      // If approved, apply the changes to the original event
      if (status === 'approved' && request.proposedChanges) {
        const originalEvent = await kv.get(request.originalEventId);
        if (originalEvent) {
          const updatedEvent = {
            ...originalEvent,
            ...request.proposedChanges,
            lastModifiedAt: new Date().toISOString(),
            lastModifiedBy: resolverId
          };
          await kv.set(request.originalEventId, updatedEvent);
        }
      }
      
      return c.json({ 
        success: true, 
        message: status === 'approved' ? 'Edit request approved and changes applied' : 'Edit request rejected',
        request: updatedRequest 
      });
    } catch (error) {
      console.error('❌ Error resolving edit request:', error);
      return c.json({ error: 'Failed to resolve edit request' }, 500);
    }
  }
);

// ===== WISHLIST ITEMS =====

// Create wishlist item (Kid or Parent can create)
app.post(
  "/make-server-f116e23f/wishlist-items",
  requireAuth,
  validate(validateWishlistItem),
  async (c) => {
    try {
      const data = getValidatedBody(c);
      const userId = getAuthUserId(c);
      
      // Verify child exists and belongs to user's family
      const child = await kv.get(data.childId);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      // Create wishlist item
      const id = `wishlist:${crypto.randomUUID()}`;
      const wishlistItem = {
        id,
        childId: data.childId,
        familyId: child.familyId,
        itemName: data.itemName || data.wishText?.substring(0, 50),
        description: data.wishText,
        audioUrl: data.audioUrl,
        submittedBy: userId,
        submittedAt: new Date().toISOString(),
        status: 'pending', // pending | converted | rejected
        convertedToRewardId: null
      };
      
      await kv.set(id, wishlistItem);
      
      return c.json({ success: true, wishlistItem });
    } catch (error) {
      console.error('Failed to create wishlist item:', error);
      return c.json({ error: 'Failed to create wishlist item' }, 500);
    }
  }
);

// Get wishlist items for a family
app.get(
  "/make-server-f116e23f/families/:familyId/wishlist-items",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      
      // Get all wishlist items
      const items = await kv.getByPrefix('wishlist:');
      const familyItems = items.filter((item: any) => item.familyId === familyId);
      
      // Sort by submission date (newest first)
      familyItems.sort((a: any, b: any) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      
      return c.json(familyItems);
    } catch (error) {
      console.error('Failed to get wishlist items:', error);
      return c.json({ error: 'Failed to get wishlist items' }, 500);
    }
  }
);

// Convert wishlist item to reward (Parent only)
app.post(
  "/make-server-f116e23f/wishlist-items/:id/convert",
  requireAuth,
  requireParent,
  validate(validateReward),
  async (c) => {
    try {
      const { id } = c.req.param();
      const rewardData = getValidatedBody(c);
      const userId = getAuthUserId(c);
      
      // Get wishlist item
      const wishlistItem = await kv.get(id);
      if (!wishlistItem) {
        return c.json({ error: 'Wishlist item not found' }, 404);
      }
      
      // Verify access to family
      const child = await kv.get(wishlistItem.childId);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      // Create reward
      const rewardId = `reward:${crypto.randomUUID()}`;
      const reward = {
        id: rewardId,
        ...rewardData,
        familyId: child.familyId,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        fromWishlistId: id,
        category: rewardData.category || (
          rewardData.pointCost < 50 ? 'small' :
          rewardData.pointCost < 150 ? 'medium' : 'large'
        )
      };
      
      await kv.set(rewardId, reward);
      
      // Update wishlist item status
      await kv.set(id, {
        ...wishlistItem,
        status: 'converted',
        convertedToRewardId: rewardId,
        convertedAt: new Date().toISOString(),
        convertedBy: userId
      });
      
      return c.json({ success: true, reward });
    } catch (error) {
      console.error('Failed to convert wishlist item:', error);
      return c.json({ error: 'Failed to convert wishlist item' }, 500);
    }
  }
);

// Delete wishlist item
app.delete(
  "/make-server-f116e23f/wishlist-items/:id",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      await kv.del(id);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete wishlist item:', error);
      return c.json({ error: 'Failed to delete wishlist item' }, 500);
    }
  }
);

// ===== REDEMPTION REQUESTS =====

// Create redemption request (Kid or Parent can create)
app.post(
  "/make-server-f116e23f/redemption-requests",
  requireAuth,
  validate(validateRedemptionRequest),
  async (c) => {
    try {
      const data = getValidatedBody(c);
      const userId = getAuthUserId(c);
      
      // Get child and reward
      const [child, reward] = await Promise.all([
        kv.get(data.childId),
        kv.get(data.rewardId)
      ]);
      
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      if (!reward) {
        return c.json({ error: 'Reward not found' }, 404);
      }
      
      // Check if child has enough points
      if (child.currentPoints < reward.pointCost) {
        return c.json({ 
          error: 'Not enough points', 
          details: `Need ${reward.pointCost} points, have ${child.currentPoints}` 
        }, 400);
      }
      
      // Create redemption request
      const id = `redemption:${crypto.randomUUID()}`;
      const redemptionRequest = {
        id,
        childId: data.childId,
        rewardId: data.rewardId,
        familyId: child.familyId,
        pointCost: reward.pointCost,
        rewardName: reward.name,
        rewardDescription: reward.description,
        notes: data.notes,
        requestedBy: userId,
        requestedAt: new Date().toISOString(),
        status: 'pending', // pending | approved | declined | delivered
        approvedBy: null,
        approvedAt: null,
        declinedBy: null,
        declinedAt: null,
        declineReason: null,
        deliveredAt: null,
        deliveredBy: null
      };
      
      await kv.set(id, redemptionRequest);
      
      // Notify parents about new reward claim (non-blocking)
      try {
        await notifyFamilyParents(child.familyId, {
          title: '🎁 Reward Claimed',
          body: `${child.name} wants to claim: ${reward.name}`,
          data: {
            type: 'reward_claim',
            childId: child.id,
            itemId: id,
            route: '/redemption-requests'
          }
        });
      } catch (notifyError) {
        // Non-blocking - don't fail redemption if notification fails
        console.error('Failed to send redemption notification:', notifyError);
      }
      
      return c.json({ success: true, redemptionRequest });
    } catch (error) {
      console.error('Failed to create redemption request:', error);
      return c.json({ error: 'Failed to create redemption request' }, 500);
    }
  }
);

// Get redemption requests for a family
app.get(
  "/make-server-f116e23f/families/:familyId/redemption-requests",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const status = c.req.query('status'); // Optional filter by status
      
      // Get all redemption requests
      const requests = await kv.getByPrefix('redemption:');
      let familyRequests = requests.filter((req: any) => req.familyId === familyId);
      
      // Filter by status if provided
      if (status) {
        familyRequests = familyRequests.filter((req: any) => req.status === status);
      }
      
      // Sort by request date (newest first)
      familyRequests.sort((a: any, b: any) => 
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      );
      
      return c.json(familyRequests);
    } catch (error) {
      console.error('Failed to get redemption requests:', error);
      return c.json({ error: 'Failed to get redemption requests' }, 500);
    }
  }
);

// Approve redemption request (Parent only)
app.post(
  "/make-server-f116e23f/redemption-requests/:id/approve",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      const userId = getAuthUserId(c);
      
      // Get request
      const request = await kv.get(id);
      if (!request) {
        return c.json({ error: 'Request not found' }, 404);
      }
      
      if (request.status !== 'pending') {
        return c.json({ error: 'Request is no longer pending' }, 400);
      }
      
      // Get child
      const child = await kv.get(request.childId);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      // Check points again (in case they changed)
      if (child.currentPoints < request.pointCost) {
        return c.json({ 
          error: 'Child no longer has enough points',
          details: `Need ${request.pointCost} points, have ${child.currentPoints}` 
        }, 400);
      }
      
      // Deduct points
      const newPoints = child.currentPoints - request.pointCost;
      await kv.set(request.childId, {
        ...child,
        currentPoints: newPoints
      });
      
      // Log point event
      const eventId = `event:${crypto.randomUUID()}`;
      await kv.set(eventId, {
        id: eventId,
        childId: request.childId,
        trackableItemId: 'reward-redemption',
        points: -request.pointCost,
        loggedBy: userId,
        timestamp: new Date().toISOString(),
        isRedemption: true,
        redemptionRequestId: id,
        rewardId: request.rewardId,
        notes: `Redeemed: ${request.rewardName}`
      });
      
      // Update request status
      const updatedRequest = {
        ...request,
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date().toISOString()
      };
      
      await kv.set(id, updatedRequest);
      
      return c.json({ success: true, request: updatedRequest, newPoints });
    } catch (error) {
      console.error('Failed to approve redemption request:', error);
      return c.json({ error: 'Failed to approve redemption request' }, 500);
    }
  }
);

// Decline redemption request (Parent only)
app.post(
  "/make-server-f116e23f/redemption-requests/:id/decline",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      const { reason } = await c.req.json();
      const userId = getAuthUserId(c);
      
      if (!reason || reason.length < 5) {
        return c.json({ error: 'Decline reason must be at least 5 characters' }, 400);
      }
      
      // Get request
      const request = await kv.get(id);
      if (!request) {
        return c.json({ error: 'Request not found' }, 404);
      }
      
      if (request.status !== 'pending') {
        return c.json({ error: 'Request is no longer pending' }, 400);
      }
      
      // Update request status
      const updatedRequest = {
        ...request,
        status: 'declined',
        declinedBy: userId,
        declinedAt: new Date().toISOString(),
        declineReason: reason
      };
      
      await kv.set(id, updatedRequest);
      
      return c.json({ success: true, request: updatedRequest });
    } catch (error) {
      console.error('Failed to decline redemption request:', error);
      return c.json({ error: 'Failed to decline redemption request' }, 500);
    }
  }
);

// Mark redemption request as delivered (Parent only)
app.post(
  "/make-server-f116e23f/redemption-requests/:id/deliver",
  requireAuth,
  requireParent,
  async (c) => {
    try {
      const { id } = c.req.param();
      const userId = getAuthUserId(c);
      
      // Get request
      const request = await kv.get(id);
      if (!request) {
        return c.json({ error: 'Request not found' }, 404);
      }
      
      if (request.status !== 'approved') {
        return c.json({ error: 'Request must be approved before marking as delivered' }, 400);
      }
      
      // Update request status
      const updatedRequest = {
        ...request,
        status: 'delivered',
        deliveredBy: userId,
        deliveredAt: new Date().toISOString()
      };
      
      await kv.set(id, updatedRequest);
      
      return c.json({ success: true, request: updatedRequest });
    } catch (error) {
      console.error('Failed to mark redemption as delivered:', error);
      return c.json({ error: 'Failed to mark as delivered' }, 500);
    }
  }
);

// ===== KV STORE ENDPOINTS (FOR TESTING) =====

// Get value by key
app.post(
  "/make-server-f116e23f/kv/get",
  async (c) => {
    try {
      const { key } = await c.req.json();
      
      if (!key || typeof key !== 'string') {
        return c.json({ error: 'Invalid key' }, 400);
      }
      
      const value = await kv.get(key);
      return c.json(value);
    } catch (error) {
      console.error('KV get error:', error);
      return c.json({ error: 'Failed to get value' }, 500);
    }
  }
);

// Get values by prefix
app.post(
  "/make-server-f116e23f/kv/getByPrefix",
  async (c) => {
    try {
      const { prefix } = await c.req.json();
      
      if (!prefix || typeof prefix !== 'string') {
        return c.json({ error: 'Invalid prefix' }, 400);
      }
      
      const values = await kv.getByPrefix(prefix);
      return c.json(values);
    } catch (error) {
      console.error('KV getByPrefix error:', error);
      return c.json({ error: 'Failed to get values by prefix' }, 500);
    }
  }
);

// Set value
app.post(
  "/make-server-f116e23f/kv/set",
  async (c) => {
    try {
      const { key, value } = await c.req.json();
      
      if (!key || typeof key !== 'string') {
        return c.json({ error: 'Invalid key' }, 400);
      }
      
      await kv.set(key, value);
      return c.json({ success: true });
    } catch (error) {
      console.error('KV set error:', error);
      return c.json({ error: 'Failed to set value' }, 500);
    }
  }
);

// Delete value
app.post(
  "/make-server-f116e23f/kv/del",
  async (c) => {
    try {
      const { key } = await c.req.json();
      
      if (!key || typeof key !== 'string') {
        return c.json({ error: 'Invalid key' }, 400);
      }
      
      await kv.del(key);
      return c.json({ success: true });
    } catch (error) {
      console.error('KV del error:', error);
      return c.json({ error: 'Failed to delete value' }, 500);
    }
  }
);

// ===== PUSH NOTIFICATIONS =====

// 🔍 DIAGNOSTIC: Check user and family status
app.get(
  "/make-server-f116e23f/debug/user-family-status",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      console.log(`🔍 Diagnostic check for user: ${userId}`);
      
      // Get user record from KV
      const userRecord = await kv.get(`user:${userId}`);
      
      // Get all families to see if user is referenced anywhere
      const allFamilies = await kv.getByPrefix('family:');
      const userFamilies = allFamilies.filter((f: any) => 
        f.members?.includes(userId) || f.parents?.includes(userId)
      );
      
      // Get all auth users from Supabase
      const { data: { user: authUser }, error } = await serviceRoleClient.auth.admin.getUserById(userId);
      
      return c.json({
        userId,
        authUser: authUser ? {
          id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          user_metadata: authUser.user_metadata
        } : null,
        authError: error?.message,
        kvUserRecord: userRecord,
        userFamilies: userFamilies.map((f: any) => ({
          id: f.id,
          name: f.name,
          members: f.members,
          parents: f.parents
        })),
        diagnosis: {
          hasAuthUser: !!authUser,
          hasKVUserRecord: !!userRecord,
          hasFamilyId: !!userRecord?.familyId,
          familyCount: userFamilies.length,
          issue: !userRecord ? 'NO_KV_USER_RECORD' :
                 !userRecord.familyId ? 'NO_FAMILY_ID' :
                 userFamilies.length === 0 ? 'FAMILY_NOT_FOUND' :
                 'OK'
        }
      });
    } catch (error: any) {
      console.error('Diagnostic error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// 🔧 FIX: Auto-repair user-family link
app.post(
  "/make-server-f116e23f/debug/repair-user-family",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      console.log(`🔧 Attempting to repair user-family link for: ${userId}`);
      
      // Get user record from KV
      let userRecord = await kv.get(`user:${userId}`);
      
      // Get auth user
      const { data: { user: authUser } } = await serviceRoleClient.auth.admin.getUserById(userId);
      
      // If no KV record exists, create one
      if (!userRecord) {
        console.log('📝 Creating missing KV user record');
        userRecord = {
          id: userId,
          email: authUser.email,
          name: authUser.user_metadata?.name || authUser.email,
          role: 'parent',
          createdAt: authUser.created_at || new Date().toISOString()
        };
        await kv.set(`user:${userId}`, userRecord);
      }
      
      // Find families where user is a member but user.familyId is not set
      const allFamilies = await kv.getByPrefix('family:');
      const userFamilies = allFamilies.filter((f: any) => 
        f.members?.includes(userId) || f.parents?.includes(userId)
      );
      
      if (userFamilies.length > 0 && !userRecord.familyId) {
        // Link user to first family found
        const family = userFamilies[0];
        console.log(`🔗 Linking user to family: ${family.id}`);
        
        userRecord.familyId = family.id;
        await kv.set(`user:${userId}`, userRecord);
        
        return c.json({
          success: true,
          action: 'LINKED_TO_EXISTING_FAMILY',
          familyId: family.id,
          familyName: family.name
        });
      }
      
      if (!userRecord.familyId) {
        return c.json({
          success: false,
          action: 'NO_FAMILY_FOUND',
          message: 'User has no associated family. Please complete onboarding.',
          needsOnboarding: true
        });
      }
      
      return c.json({
        success: true,
        action: 'ALREADY_OK',
        familyId: userRecord.familyId
      });
    } catch (error: any) {
      console.error('Repair error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Register device push token
app.post(
  "/make-server-f116e23f/notifications/register-token",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      const { token } = await c.req.json();

      if (!token || typeof token !== 'string') {
        return c.json({ error: 'Valid token required' }, 400);
      }

      // Store token in KV (one token per user)
      await kv.set(`pushtoken:${userId}`, {
        userId,
        token,
        platform: 'ios', // Could detect Android vs iOS
        registeredAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });

      console.log(`✅ Push token registered for user ${userId}`);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('Register push token error:', error);
      return c.json({ error: error.message || 'Failed to register token' }, 500);
    }
  }
);

// Send push notification (internal endpoint)
app.post(
  "/make-server-f116e23f/notifications/send",
  requireAuth,
  async (c) => {
    try {
      const { userId, title, body, data } = await c.req.json();

      if (!userId || !title || !body) {
        return c.json({ error: 'userId, title, and body required' }, 400);
      }

      // Get user's push token
      const tokenData = await kv.get(`pushtoken:${userId}`);
      
      if (!tokenData || !tokenData.token) {
        console.log(`⚠️ No push token found for user ${userId}`);
        return c.json({ error: 'User has no registered push token' }, 404);
      }

      // TODO: In production, integrate with FCM/APNS to actually send notification
      // For now, just log that we would send it
      console.log('📬 Would send push notification:', {
        to: tokenData.token,
        title,
        body,
        data
      });

      // NOTE: To actually send notifications, you need to:
      // 1. Set up Firebase Cloud Messaging (FCM) project
      // 2. Get FCM server key
      // 3. Make HTTP request to FCM API:
      //
      // const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `key=${FCM_SERVER_KEY}`
      //   },
      //   body: JSON.stringify({
      //     to: tokenData.token,
      //     notification: { title, body },
      //     data: data || {}
      //   })
      // });

      // Update last used timestamp
      tokenData.lastUsed = new Date().toISOString();
      await kv.set(`pushtoken:${userId}`, tokenData);

      return c.json({ 
        success: true, 
        message: 'Notification queued (FCM integration needed for production)'
      });
    } catch (error: any) {
      console.error('Send push notification error:', error);
      return c.json({ error: error.message || 'Failed to send notification' }, 500);
    }
  }
);

// Get user's push notification status
app.get(
  "/make-server-f116e23f/notifications/status",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      const tokenData = await kv.get(`pushtoken:${userId}`);
      
      return c.json({
        registered: !!tokenData,
        registeredAt: tokenData?.registeredAt || null,
        lastUsed: tokenData?.lastUsed || null
      });
    } catch (error: any) {
      console.error('Get notification status error:', error);
      return c.json({ error: error.message || 'Failed to get status' }, 500);
    }
  }
);

// Unregister push token (when user logs out or disables notifications)
app.delete(
  "/make-server-f116e23f/notifications/unregister-token",
  requireAuth,
  async (c) => {
    try {
      const userId = getAuthUserId(c);
      
      await kv.del(`pushtoken:${userId}`);
      
      console.log(`✅ Push token unregistered for user ${userId}`);
      
      return c.json({ success: true });
    } catch (error: any) {
      console.error('Unregister push token error:', error);
      return c.json({ error: error.message || 'Failed to unregister token' }, 500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// ADVENTURE WORLD ROUTES (Islamic Learning Games)
// ═══════════════════════════════════════════════════════════════

// Get or create adventure profile for a child
app.get(
  "/make-server-f116e23f/families/:familyId/adventure/profile/:childId",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, childId } = c.req.param();
      const child = await kv.get(childId);
      
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      // Get or create adventure profile
      const profileKey = `adventure-profile:${childId}`;
      let profile = await kv.get(profileKey);

      if (!profile) {
        // Create default profile
        profile = {
          childId,
          avatarStyle: {},
          level: 1,
          xp: 0,
          title: "Student",
          barakahCoins: child.currentPoints || 0,
          completedQuests: 0,
          gardenProgress: 0,
          createdAt: new Date().toISOString()
        };
        await kv.set(profileKey, profile);
      }

      return c.json(profile);
    } catch (error: any) {
      console.error('Get adventure profile error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Update adventure profile (avatar, etc.)
app.post(
  "/make-server-f116e23f/families/:familyId/adventure/profile/:childId",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, childId } = c.req.param();
      const body = await c.req.json();
      
      const child = await kv.get(childId);
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const profileKey = `adventure-profile:${childId}`;
      let profile = await kv.get(profileKey);

      if (!profile) {
        profile = {
          childId,
          avatarStyle: {},
          level: 1,
          xp: 0,
          title: "Student",
          barakahCoins: child.currentPoints || 0,
          completedQuests: 0,
          gardenProgress: 0,
          createdAt: new Date().toISOString()
        };
      }

      // Update profile with new data
      profile = {
        ...profile,
        ...body,
        updatedAt: new Date().toISOString()
      };

      await kv.set(profileKey, profile);
      return c.json(profile);
    } catch (error: any) {
      console.error('Update adventure profile error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Get world zones progress
app.get(
  "/make-server-f116e23f/families/:familyId/adventure/zones/:childId",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, childId } = c.req.param();
      const child = await kv.get(childId);
      
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const zonesKey = `adventure-zones:${childId}`;
      let zones = await kv.get(zonesKey);

      if (!zones) {
        // Create default zones
        zones = [
          {
            id: "makkah",
            name: "Makkah",
            nameArabic: "مكة المكرمة",
            description: "Learn the stories of Prophet Ibrahim ﷺ and the sacred Kaaba",
            unlocked: true,
            progress: 0,
            difficulty: "beginner",
            color: "from-amber-500 to-orange-600",
            icon: "🕋",
            minLevel: 1
          },
          {
            id: "madinah",
            name: "Madinah",
            nameArabic: "المدينة المنورة",
            description: "Discover the life and teachings of Prophet Muhammad ﷺ",
            unlocked: false,
            progress: 0,
            difficulty: "beginner",
            color: "from-emerald-500 to-teal-600",
            icon: "🕌",
            minLevel: 3
          },
          {
            id: "quran-valley",
            name: "Quran Valley",
            nameArabic: "وادي القرآن",
            description: "Memorize beautiful ayahs and unlock Quranic wisdom",
            unlocked: false,
            progress: 0,
            difficulty: "intermediate",
            color: "from-blue-500 to-indigo-600",
            icon: "📖",
            minLevel: 5
          },
          {
            id: "desert-trials",
            name: "Desert of Trials",
            nameArabic: "صحراء الاختبارات",
            description: "Test your Islamic knowledge and character",
            unlocked: false,
            progress: 0,
            difficulty: "intermediate",
            color: "from-yellow-600 to-amber-700",
            icon: "🏜️",
            minLevel: 7
          },
          {
            id: "barakah-garden",
            name: "Barakah Garden",
            nameArabic: "حديقة البركة",
            description: "Your personal garden that grows with every good deed",
            unlocked: true,
            progress: 0,
            difficulty: "all",
            color: "from-green-500 to-emerald-600",
            icon: "🌺",
            minLevel: 1
          }
        ];
        await kv.set(zonesKey, zones);
      }

      return c.json(zones);
    } catch (error: any) {
      console.error('Get adventure zones error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Award XP and update level
app.post(
  "/make-server-f116e23f/families/:familyId/adventure/award-xp",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { childId, xp, source } = await c.req.json();
      
      const child = await kv.get(childId);
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const profileKey = `adventure-profile:${childId}`;
      let profile = await kv.get(profileKey);

      if (!profile) {
        profile = {
          childId,
          avatarStyle: {},
          level: 1,
          xp: 0,
          title: "Student",
          barakahCoins: child.currentPoints || 0,
          completedQuests: 0,
          gardenProgress: 0,
          createdAt: new Date().toISOString()
        };
      }

      // Add XP
      profile.xp += xp;

      // Level up logic (100 XP per level)
      const xpPerLevel = 100;
      const newLevel = Math.floor(profile.xp / xpPerLevel) + 1;
      
      if (newLevel > profile.level) {
        profile.level = newLevel;
        
        // Update title based on level
        if (newLevel >= 20) {
          profile.title = "Light Bearer";
        } else if (newLevel >= 15) {
          profile.title = "Scholar";
        } else if (newLevel >= 10) {
          profile.title = "Hafidh";
        } else if (newLevel >= 5) {
          profile.title = "Seeker";
        } else {
          profile.title = "Student";
        }
      }

      profile.updatedAt = new Date().toISOString();
      await kv.set(profileKey, profile);

      // Log XP event
      const xpEventKey = `adventure-xp:${childId}:${Date.now()}`;
      await kv.set(xpEventKey, {
        childId,
        xp,
        source,
        timestamp: new Date().toISOString()
      });

      return c.json({ success: true, profile, leveledUp: newLevel > profile.level });
    } catch (error: any) {
      console.error('Award XP error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Get Jannah Garden progress
app.get(
  "/make-server-f116e23f/families/:familyId/adventure/garden/:childId",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, childId } = c.req.param();
      const child = await kv.get(childId);
      
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const gardenKey = `adventure-garden:${childId}`;
      let garden = await kv.get(gardenKey);

      if (!garden) {
        // Create default garden with one unlocked flower
        garden = {
          progress: {
            childId,
            level: 1,
            unlockedItems: ['flower-1'],
            totalGoodDeeds: 0,
            prayersCompleted: 0,
            quranMemorized: 0,
            helpedOthers: 0,
            createdAt: new Date().toISOString()
          }
        };
        await kv.set(gardenKey, garden);
      }

      // Sync with actual child data
      const prayerStats = await kv.getByPrefix(`prayerclaim:${childId}:`);
      const approvedPrayers = prayerStats.filter((p: any) => p.status === 'approved');
      garden.progress.prayersCompleted = approvedPrayers.length;

      return c.json(garden);
    } catch (error: any) {
      console.error('Get garden progress error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Unlock garden item
app.post(
  "/make-server-f116e23f/families/:familyId/adventure/garden/:childId/unlock",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const { familyId, childId } = c.req.param();
      const { itemId } = await c.req.json();
      
      const child = await kv.get(childId);
      if (!child || child.familyId !== familyId) {
        return c.json({ error: 'Child not found' }, 404);
      }

      const gardenKey = `adventure-garden:${childId}`;
      let garden = await kv.get(gardenKey);

      if (!garden) {
        garden = {
          progress: {
            childId,
            level: 1,
            unlockedItems: [],
            totalGoodDeeds: 0,
            prayersCompleted: 0,
            quranMemorized: 0,
            helpedOthers: 0,
            createdAt: new Date().toISOString()
          }
        };
      }

      // Add item to unlocked list if not already unlocked
      if (!garden.progress.unlockedItems.includes(itemId)) {
        garden.progress.unlockedItems.push(itemId);
        garden.progress.totalGoodDeeds += 1;
        garden.progress.updatedAt = new Date().toISOString();
        
        await kv.set(gardenKey, garden);
      }

      return c.json({ success: true, garden });
    } catch (error: any) {
      console.error('Unlock garden item error:', error);
      return c.json({ error: error.message }, 500);
    }
  }
);

// Catch-all route for debugging (MUST be last!)
app.all('*', (c) => {
  return c.json({ error: 'Route not found', path: c.req.path }, 404);
});

Deno.serve(app.fetch);