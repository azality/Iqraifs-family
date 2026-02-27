import { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { verifyKidSession as verifyKidSessionFromModule } from "./kidSessions.tsx";

// JWT Authentication Middleware - Fixed JWT verification (v3)
// CRITICAL: Create TWO separate clients
// 1. Service role client for admin operations (user management, bypassing RLS)
// 2. Anon key client for JWT verification (must use same key that issued the tokens)

const serviceRoleClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// CRITICAL FIX: Use anon key client for JWT verification
// User JWTs are signed with the project's secret and validated against the anon key
const anonClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

// Export the service role client for other parts of the server to use
export { serviceRoleClient };

// Get environment variables for JWT verification
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Kid session verification utility
 */
async function verifyKidSession(token: string) {
  // Use the proper module function
  return await verifyKidSessionFromModule(token);
}

/**
 * Extract and verify JWT from Authorization header
 * Also supports kid session tokens (kid_xxx)
 * Returns user object or null
 */
async function verifyToken(c: Context) {
  // 🆕 Check BOTH standard Authorization header AND custom X-Supabase-Auth header
  // Supabase Edge Functions may strip Authorization header even when "Verify JWT" is disabled
  const authHeader = 
    c.req.header("Authorization") || 
    c.req.header("authorization") ||
    c.req.header("X-Supabase-Auth") ||
    c.req.header("x-supabase-auth");
  
  console.log('🔍 verifyToken: Checking auth headers:', {
    hasAuthorization: !!(c.req.header("Authorization") || c.req.header("authorization")),
    hasXSupabaseAuth: !!(c.req.header("X-Supabase-Auth") || c.req.header("x-supabase-auth")),
    authHeaderSource: authHeader ? 
      (c.req.header("Authorization") || c.req.header("authorization") ? 'Authorization' : 'X-Supabase-Auth') : 
      'none',
    authHeaderPreview: authHeader?.substring(0, 30) + '...'
  });
  
  if (!authHeader || (!authHeader.startsWith("Bearer "))) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  
  if (!token) {
    return null;
  }

  // CRITICAL: If token is the anon key, return null (not an error, just no user)
  // This allows public endpoints to work without authentication
  if (token === SUPABASE_ANON_KEY) {
    console.log('🔓 Public request with anon key - no user authentication');
    return null;
  }

  // Check if this is a kid session token
  if (token.startsWith('kid_')) {
    console.log('🔍 Verifying kid session token:', {
      tokenPreview: token.substring(0, 20) + '...',
      tokenLength: token.length
    });
    
    const kidSession = await verifyKidSession(token);
    
    console.log('🔍 Kid session verification result:', {
      valid: kidSession.valid,
      childId: kidSession.childId,
      familyId: kidSession.familyId,
      error: kidSession.error
    });
    
    if (!kidSession.valid) {
      console.error('❌ Kid session invalid:', kidSession.error);
      return null;
    }
    
    // Return a pseudo-user object for kid sessions
    console.log('✅ Kid session verified successfully');
    return {
      id: kidSession.childId,
      role: 'kid',
      isKidSession: true,
      familyId: kidSession.familyId,
      user_metadata: { role: 'kid' }
    };
  }

  // Standard parent JWT verification using manual decode
  try {
    // First try using Supabase client (works for most valid tokens)
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    
    if (!error && user) {
      console.log('✅ JWT verified successfully via Supabase client', {
        userId: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'parent'
      });
      
      // Return verified user object
      return {
        id: user.id,
        email: user.email || '',
        role: user.user_metadata?.role || user.role || 'parent',
        user_metadata: user.user_metadata || { role: 'parent', name: user.email || '' },
        app_metadata: user.app_metadata || {},
        aud: user.aud || '',
        created_at: user.created_at || new Date().toISOString()
      };
    }
    
    // If Supabase client verification failed, log the detailed error and return null
    console.error('❌ Supabase JWT verification failed:', {
      errorMessage: error?.message,
      errorName: error?.name,
      errorStatus: error?.status,
      tokenPreview: token?.substring(0, 30) + '...',
      tokenLength: token?.length,
      hasToken: !!token,
      fullError: JSON.stringify(error)
    });
    return null;
  } catch (error) {
    console.error('❌ Error during JWT verification (exception):', {
      error,
      errorMessage: error?.message,
      errorStack: error?.stack,
      tokenPreview: token?.substring(0, 30) + '...'
    });
    return null;
  }
}

/**
 * Middleware: Require authentication
 */
export async function requireAuth(c: Context, next: () => Promise<void>) {
  try {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    
    // 🆕 COMPREHENSIVE HEADER DEBUGGING
    const allHeaders: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      allHeaders[key.toLowerCase()] = value;
    });
    
    console.log('🔐 requireAuth middleware - FULL HEADER DUMP:', {
      hasAuthHeader: !!authHeader,
      authHeaderValue: authHeader ? `${authHeader.substring(0, 50)}...` : 'MISSING',
      path: c.req.path,
      method: c.req.method,
      allHeaderKeys: Object.keys(allHeaders),
      hasAuthorizationInRaw: allHeaders.hasOwnProperty('authorization'),
      authorizationRawValue: allHeaders['authorization'] ? `${allHeaders['authorization'].substring(0, 50)}...` : 'N/A'
    });
    
    // Debug logging
    console.log('🔐 requireAuth middleware called:', {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20),
      path: c.req.path,
      method: c.req.method
    });
    
    const user = await verifyToken(c);
    
    if (!user) {
      const token = authHeader?.replace('Bearer ', '');
      const isKidToken = token?.startsWith('kid_');
      
      console.error('❌ requireAuth: Token verification failed', {
        hasAuthHeader: !!authHeader,
        authHeaderLength: authHeader?.length,
        tokenPrefix: token?.substring(0, 50),
        isKidToken,
        path: c.req.path
      });
      
      return c.json({ 
        error: "Unauthorized",
        code: 401,
        message: isKidToken ? "Kid session expired or invalid" : "Invalid JWT",
        debug: {
          hasAuthHeader: !!authHeader,
          authHeaderLength: authHeader?.length,
          tokenPrefix: token?.substring(0, 30),
          isKidSession: isKidToken
        }
      }, 401);
    }
    
    console.log('✅ requireAuth: User verified:', {
      userId: user.id,
      role: user.role,
      isKidSession: user.isKidSession
    });
    
    // Store user in context for downstream handlers
    c.set("user", user);
    await next();
  } catch (error) {
    console.error('❌ requireAuth: Authentication error:', error);
    return c.json({ 
      error: "Authentication error",
      details: String(error)
    }, 500);
  }
}

/**
 * Middleware: Require parent role
 */
export async function requireParent(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Allow if user is a parent (not a kid session)
  if (user.isKidSession) {
    return c.json({ error: "Parent access required" }, 403);
  }
  
  await next();
}

/**
 * Middleware: Require family access
 */
export async function requireFamilyAccess(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  // Handle both :familyId and :id parameter names
  const familyId = c.req.param("familyId") || c.req.param("id");
  
  if (!user || !familyId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // For kid sessions, verify family membership
  if (user.isKidSession) {
    if (user.familyId !== familyId) {
      return c.json({ error: "Access denied to this family" }, 403);
    }
    await next();
    return;
  }
  
  // For parent users, verify family membership via KV store
  try {
    const kv = await import("./kv_store.tsx");
    
    // Handle both "family:xxx" and "xxx" formats
    const familyKey = familyId.startsWith('family:') ? familyId : `family:${familyId}`;
    const family = await kv.get(familyKey);
    
    if (!family) {
      return c.json({ error: "Family not found" }, 404);
    }
    
    if (!family.parentIds.includes(user.id)) {
      return c.json({ error: "Access denied to this family" }, 403);
    }
    
    await next();
  } catch (error) {
    return c.json({ error: "Access verification failed" }, 500);
  }
}

/**
 * Middleware: Require child access
 * Verifies that the authenticated user (parent or kid) has access to the specified child
 */
export async function requireChildAccess(c: Context, next: () => Promise<void>) {
  const user = c.get("user");
  const childId = c.req.param("childId");
  
  if (!user || !childId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  try {
    const kv = await import("./kv_store.tsx");
    
    const childKey = childId.startsWith('child:') ? childId : `child:${childId}`;
    const child = await kv.get(childKey);
    
    if (!child) {
      return c.json({ error: "Child not found" }, 404);
    }
    
    // For kid sessions, verify this is their own profile
    if (user.isKidSession) {
      if (user.id !== childId && user.id !== childKey) {
        return c.json({ error: "Access denied" }, 403);
      }
      await next();
      return;
    }
    
    // For parent users, verify they belong to the child's family
    const familyKey = child.familyId.startsWith('family:') ? child.familyId : `family:${child.familyId}`;
    const family = await kv.get(familyKey);
    
    if (!family) {
      return c.json({ error: "Family not found" }, 404);
    }
    
    if (!family.parentIds.includes(user.id)) {
      return c.json({ error: "Access denied" }, 403);
    }
    
    await next();
  } catch (error) {
    return c.json({ error: "Access verification failed" }, 500);
  }
}

/**
 * Helper: Get authenticated user ID from context
 */
export function getAuthUserId(c: Context): string {
  const user = c.get("user");
  if (!user) {
    throw new Error("User not found in context - ensure requireAuth middleware is applied");
  }
  return user.id;
}

/**
 * Helper: Get family ID from route params
 */
export function getFamilyId(c: Context): string {
  const familyId = c.req.param("familyId");
  if (!familyId) {
    throw new Error("Family ID not found in route params");
  }
  return familyId;
}