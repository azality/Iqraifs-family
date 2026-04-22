/**
 * Rate Limiting Middleware
 * 
 * KV-based rate limiting to prevent:
 * - Brute force login attempts
 * - PIN guessing attacks
 * - Event spam
 * - API abuse
 */

import { Context } from "npm:hono@4";
import * as kv from "./kv_store.tsx";

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number; // Time window in milliseconds
  lockoutMs?: number; // Lockout duration after max attempts (optional)
}

/**
 * Rate limit presets
 */
export const RATE_LIMITS = {
  // Login attempts: 5 per 15 minutes per IP
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 30 * 60 * 1000, // 30 min lockout
  },
  
  // PIN verification: 3 per 5 minutes per child
  PIN_VERIFY: {
    maxAttempts: 3,
    windowMs: 5 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000, // 15 min lockout
  },
  
  // Event creation: 30 per minute per user
  EVENT_CREATE: {
    maxAttempts: 30,
    windowMs: 60 * 1000,
  },
  
  // General API: 100 per minute per user
  API_GENERAL: {
    maxAttempts: 100,
    windowMs: 60 * 1000,
  },
};

/**
 * Rate limit data structure
 */
interface RateLimitData {
  attempts: number;
  firstAttempt: number; // Timestamp
  lockedUntil?: number; // Timestamp
}

/**
 * Get client identifier (IP address or user ID)
 */
function getClientId(c: Context, useUserId = false): string {
  if (useUserId) {
    const userId = c.get("userId");
    if (userId) return userId;
  }
  
  // Get IP from various headers (CloudFlare, etc.)
  const forwardedFor = c.req.header("X-Forwarded-For");
  const realIp = c.req.header("X-Real-IP");
  const cfConnectingIp = c.req.header("CF-Connecting-IP");
  
  return cfConnectingIp || realIp || forwardedFor?.split(",")[0] || "unknown";
}

/**
 * Check and increment rate limit
 * Returns true if allowed, false if rate limited
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  
  // Get current rate limit data
  const data: RateLimitData | null = await kv.get(`ratelimit:${key}`);
  
  // Check if locked out
  if (data?.lockedUntil && now < data.lockedUntil) {
    const retryAfter = Math.ceil((data.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  // Check if window has expired (reset counter)
  if (!data || now - data.firstAttempt > config.windowMs) {
    await kv.set(`ratelimit:${key}`, {
      attempts: 1,
      firstAttempt: now,
    });
    return { allowed: true };
  }
  
  // Increment attempts
  const newAttempts = data.attempts + 1;
  
  // Check if over limit
  if (newAttempts > config.maxAttempts) {
    const lockoutUntil = config.lockoutMs ? now + config.lockoutMs : undefined;
    
    await kv.set(`ratelimit:${key}`, {
      ...data,
      attempts: newAttempts,
      lockedUntil: lockoutUntil,
    });
    
    const retryAfter = lockoutUntil 
      ? Math.ceil((lockoutUntil - now) / 1000)
      : Math.ceil((data.firstAttempt + config.windowMs - now) / 1000);
    
    return { allowed: false, retryAfter };
  }
  
  // Update attempts
  await kv.set(`ratelimit:${key}`, {
    ...data,
    attempts: newAttempts,
  });
  
  return { allowed: true };
}

/**
 * Middleware factory: Create rate limiter
 * 
 * Usage:
 *   app.post('/login', rateLimit('login', RATE_LIMITS.LOGIN), handler)
 */
export function rateLimit(identifier: string, config: RateLimitConfig, useUserId = false) {
  return async (c: Context, next: Function) => {
    const clientId = getClientId(c, useUserId);
    const key = `${identifier}:${clientId}`;
    
    const result = await checkRateLimit(key, config);
    
    if (!result.allowed) {
      console.warn(`Rate limit exceeded for ${key}`);
      
      return c.json(
        {
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: result.retryAfter,
        },
        429,
        {
          "Retry-After": String(result.retryAfter || 60),
        }
      );
    }
    
    await next();
  };
}

/**
 * Specific rate limiters (pre-configured)
 */

/**
 * Login rate limiter (by IP)
 */
export const rateLimitLogin = rateLimit("login", RATE_LIMITS.LOGIN, false);

/**
 * PIN verification rate limiter (by child ID + IP)
 */
export function rateLimitPinVerify(c: Context, next: Function) {
  const childId = c.req.param("childId") || "unknown";
  const clientIp = getClientId(c, false);
  const key = `pin:${childId}:${clientIp}`;
  
  return rateLimit(key, RATE_LIMITS.PIN_VERIFY, false)(c, next);
}

/**
 * Event creation rate limiter (by user ID)
 */
export const rateLimitEventCreate = rateLimit("event", RATE_LIMITS.EVENT_CREATE, true);

/**
 * General API rate limiter (by user ID)
 */
export const rateLimitApi = rateLimit("api", RATE_LIMITS.API_GENERAL, true);

/**
 * Manual rate limit check (for use in handlers)
 */
export async function checkLimit(
  identifier: string,
  clientId: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `${identifier}:${clientId}`;
  return checkRateLimit(key, config);
}

/**
 * Reset rate limit for a specific key (admin/testing use)
 */
export async function resetRateLimit(identifier: string, clientId: string): Promise<void> {
  const key = `ratelimit:${identifier}:${clientId}`;
  await kv.del(key);
}

/**
 * Get current rate limit status (for debugging)
 */
export async function getRateLimitStatus(
  identifier: string,
  clientId: string
): Promise<RateLimitData | null> {
  const key = `ratelimit:${identifier}:${clientId}`;
  return await kv.get(key);
}
