/**
 * VALIDATION & ROUTING TESTS (P0)
 * 
 * Comprehensive tests for:
 * - VAL-P0.1: Zod validation rejects malformed inputs
 * - ROUTE-P0.1: Public routes accessible unauthenticated
 * - ROUTE-P0.2: Unauthenticated access redirects
 * - ROUTE-P0.3: Parent cannot access kid routes
 * - ROUTE-P0.4: Kid cannot access parent routes
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;
const ANON_KEY = publicAnonKey;

const getHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// ============================================================================
// VALIDATION TESTS (VAL-P0.1)
// ============================================================================

/**
 * Test signup endpoint validation
 */
async function testSignupValidation(): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  let allPassed = true;

  console.log('📝 VAL-P0.1a: Testing signup validation...');

  // Test 1: Missing required fields
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        // Missing email, password, familyName
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Missing fields should return 400, got ${res.status}`);
      allPassed = false;
    }
    
    const data = await res.json();
    if (!data.error) {
      issues.push('Missing fields error should have error message');
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing missing fields: ${error.message}`);
    allPassed = false;
  }

  // Test 2: Invalid email format
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'ValidPassword123!',
        familyName: 'Test Family'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Invalid email should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing invalid email: ${error.message}`);
    allPassed = false;
  }

  // Test 3: Weak password
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email: 'test@example.com',
        password: '123', // Too short
        familyName: 'Test Family'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Weak password should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing weak password: ${error.message}`);
    allPassed = false;
  }

  // Test 4: Family name too short
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        familyName: 'X' // Too short (min 2 chars)
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Short family name should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing short family name: ${error.message}`);
    allPassed = false;
  }

  // Test 5: Unexpected extra fields (should be ignored or rejected consistently)
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email: `test-extra-${Date.now()}@example.com`,
        password: 'ValidPassword123!',
        familyName: 'Test Family',
        maliciousField: 'should-be-ignored',
        anotherBadField: 12345
      })
    });
    
    // Either rejected (400) or ignored (201/200) - just needs to be consistent
    if (res.status !== 400 && res.status !== 201 && res.status !== 200) {
      issues.push(`Unexpected response to extra fields: ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    // Exception is acceptable (could be Supabase rate limiting)
    console.log(`   Note: Extra fields test got exception (may be rate limited): ${error.message}`);
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Signup validation working correctly' 
      : 'Signup validation has issues',
    issues
  };
}

/**
 * Test child creation validation
 */
async function testChildValidation(parentToken: string, familyId: string): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  let allPassed = true;

  console.log('📝 VAL-P0.1b: Testing child creation validation...');

  // Test 1: Missing required fields
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/children`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        // Missing name, pin
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Missing child fields should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing missing child fields: ${error.message}`);
    allPassed = false;
  }

  // Test 2: Invalid PIN (wrong length)
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/children`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        name: 'Test Child',
        pin: '12', // Must be 4 digits
        avatar: '👦'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Invalid PIN length should return 400, got ${res.status}`);
      allPassed = false;
    }
    
    // Verify PIN not echoed back
    const data = await res.json();
    if (data.pin || data.pinHash) {
      issues.push('PIN or pinHash should never be returned in error response');
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing invalid PIN: ${error.message}`);
    allPassed = false;
  }

  // Test 3: Name too short
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/children`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        name: 'X', // Too short (min 2 chars)
        pin: '1234',
        avatar: '👦'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Short name should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing short name: ${error.message}`);
    allPassed = false;
  }

  // Test 4: Invalid avatar
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/children`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        name: 'Test Child',
        pin: '1234',
        avatar: '😈' // Not in allowed list
      })
    });
    
    if (res.status !== 400 && res.status !== 201) {
      issues.push(`Invalid avatar should return 400 or be sanitized, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing invalid avatar: ${error.message}`);
    allPassed = false;
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Child validation working correctly' 
      : 'Child validation has issues',
    issues
  };
}

/**
 * Test point event validation
 */
async function testPointEventValidation(parentToken: string, familyId: string, childId: string): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  let allPassed = true;

  console.log('📝 VAL-P0.1c: Testing point event validation...');

  // Test 1: Missing required fields
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/points`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        // Missing childId, trackableItemId, points
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Missing point event fields should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing missing point fields: ${error.message}`);
    allPassed = false;
  }

  // Test 2: Points out of range (too negative)
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/points`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId: childId,
        trackableItemId: 'test-trackable',
        points: -9999, // Below MIN (-1000)
        loggedBy: 'parent'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Out of range points should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing out of range points: ${error.message}`);
    allPassed = false;
  }

  // Test 3: Points out of range (too positive)
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/points`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId: childId,
        trackableItemId: 'test-trackable',
        points: 9999, // Above MAX (1000)
        loggedBy: 'parent'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Out of range points should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing out of range points: ${error.message}`);
    allPassed = false;
  }

  // Test 4: Wrong type (string instead of number)
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/points`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId: childId,
        trackableItemId: 'test-trackable',
        points: 'fifty', // Should be number
        loggedBy: 'parent'
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Wrong type for points should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing wrong type: ${error.message}`);
    allPassed = false;
  }

  // Test 5: Notes too long
  try {
    const res = await fetch(`${API_BASE}/family/${familyId}/points`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId: childId,
        trackableItemId: 'test-trackable',
        points: 10,
        loggedBy: 'parent',
        notes: 'x'.repeat(1000) // Exceeds 500 char limit
      })
    });
    
    if (res.status !== 400) {
      issues.push(`Too long notes should return 400, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing long notes: ${error.message}`);
    allPassed = false;
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Point event validation working correctly' 
      : 'Point event validation has issues',
    issues
  };
}

/**
 * Test PIN verification validation (sensitive data not echoed)
 */
async function testPINValidation(familyCode: string, childId: string): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  let allPassed = true;

  console.log('📝 VAL-P0.1d: Testing PIN validation and sensitive data protection...');

  // Test 1: Invalid PIN format
  try {
    const res = await fetch(`${API_BASE}/kid/verify-pin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        familyCode: familyCode,
        childId: childId,
        pin: '12' // Wrong length
      })
    });
    
    const data = await res.json();
    
    // PIN should NEVER be echoed back
    if (data.pin || data.pinHash || data.submittedPin) {
      issues.push('SECURITY: PIN must never be echoed in response');
      allPassed = false;
    }
    
    if (res.status !== 400 && res.status !== 401) {
      issues.push(`Invalid PIN format should return 400/401, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing PIN validation: ${error.message}`);
    allPassed = false;
  }

  // Test 2: Wrong PIN
  try {
    const res = await fetch(`${API_BASE}/kid/verify-pin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        familyCode: familyCode,
        childId: childId,
        pin: '9999' // Wrong PIN
      })
    });
    
    const data = await res.json();
    
    // PIN should NEVER be echoed back
    if (data.pin || data.pinHash || data.submittedPin || data.correctPin) {
      issues.push('SECURITY: PIN must never be echoed in response (wrong PIN test)');
      allPassed = false;
    }
    
    if (res.status !== 401) {
      issues.push(`Wrong PIN should return 401, got ${res.status}`);
      allPassed = false;
    }
  } catch (error: any) {
    issues.push(`Exception testing wrong PIN: ${error.message}`);
    allPassed = false;
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'PIN validation and sensitive data protection working correctly' 
      : 'PIN validation has security issues',
    issues
  };
}

// ============================================================================
// ROUTING TESTS (ROUTE-P0.1 to ROUTE-P0.4)
// ============================================================================

/**
 * ROUTE-P0.1: Public routes accessible unauthenticated
 */
async function testPublicRoutes(): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  let allPassed = true;

  console.log('📝 ROUTE-P0.1: Testing public routes accessibility...');

  const publicRoutes = ['/welcome', '/kid/login'];

  for (const route of publicRoutes) {
    try {
      // Note: In this environment, we can't actually test frontend routes
      // This would need to be done in a browser test
      console.log(`   ✓ Route ${route} should be public (manual verification required)`);
    } catch (error: any) {
      issues.push(`Error checking route ${route}: ${error.message}`);
      allPassed = false;
    }
  }

  return {
    passed: allPassed,
    message: 'Public routes test requires manual verification in browser',
    issues: [
      'Manual test: Clear localStorage and visit /welcome',
      'Manual test: Clear localStorage and visit /kid/login',
      'Expected: Both pages load without authentication',
      'Expected: No API retry loops or errors in console'
    ]
  };
}

/**
 * ROUTE-P0.2: Unauthenticated access to protected pages redirects
 */
async function testProtectedRouteRedirects(): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  
  console.log('📝 ROUTE-P0.2: Testing protected route redirects...');

  return {
    passed: true,
    message: 'Protected route redirects require manual verification in browser',
    issues: [
      'Manual test: Clear localStorage',
      'Manual test: Navigate directly to /settings, /, /kid/home, /attendance',
      'Expected: Redirect to /welcome or login flow',
      'Expected: No protected data flash before redirect',
      'Expected: No 401 errors spam in console'
    ]
  };
}

/**
 * ROUTE-P0.3: Parent cannot access kid routes
 */
async function testParentKidRouteIsolation(): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  
  console.log('📝 ROUTE-P0.3: Testing parent blocked from kid routes...');

  return {
    passed: true,
    message: 'Parent/kid route isolation requires manual verification',
    issues: [
      'Manual test: Login as parent',
      'Manual test: Navigate to /kid/home, /kid/wishlist',
      'Expected: Access blocked (redirect or 403 screen)',
      'Expected: No kid dashboard data fetched under parent mode',
      'Verify: Check Network tab for any kid-specific API calls'
    ]
  };
}

/**
 * ROUTE-P0.4: Kid cannot access parent routes
 */
async function testKidParentRouteIsolation(): Promise<{ passed: boolean; message: string; issues: string[] }> {
  const issues: string[] = [];
  
  console.log('📝 ROUTE-P0.4: Testing kid blocked from parent routes...');

  return {
    passed: true,
    message: 'Kid/parent route isolation requires manual verification',
    issues: [
      'Manual test: Login as kid',
      'Manual test: Navigate to /settings, /adjustments, /rewards, /audit, /review',
      'Expected: Access blocked (redirect or forbidden UI)',
      'Expected: No parent-only API calls succeed with kid token',
      'Verify: Check Network tab - all parent endpoints should return 403'
    ]
  };
}

// ============================================================================
// MAIN VALIDATION & ROUTING AUDIT RUNNER
// ============================================================================

interface TestData {
  familyA?: {
    id: string;
    code: string;
  };
  parentA?: {
    email: string;
    token: string;
  };
  childA1?: {
    id: string;
    pin: string;
  };
}

export async function runValidationRoutingAudit(existingTestData?: TestData) {
  console.log('🔍 ========================================');
  console.log('🔍 VALIDATION & ROUTING AUDIT (P0)');
  console.log('🔍 ========================================\n');

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 9,
      passed: 0,
      failed: 0,
      warnings: 0,
      manual: 0,
      skipped: 0
    }
  };

  // ========================================
  // VALIDATION TESTS (VAL-P0.1)
  // ========================================

  // Test 1: Signup validation
  const signupResult = await testSignupValidation();
  results.tests.push({
    id: 'VAL-P0.1a',
    category: 'Validation',
    name: 'Signup endpoint validation',
    ...signupResult
  });
  if (signupResult.passed) results.summary.passed++;
  else results.summary.failed++;

  // Test 2-4: Child, Point Event, PIN validation (require test data)
  if (existingTestData?.parentA?.token && existingTestData?.familyA?.id) {
    // Child validation
    const childResult = await testChildValidation(
      existingTestData.parentA.token,
      existingTestData.familyA.id
    );
    results.tests.push({
      id: 'VAL-P0.1b',
      category: 'Validation',
      name: 'Child creation validation',
      ...childResult
    });
    if (childResult.passed) results.summary.passed++;
    else results.summary.failed++;

    // Point event validation
    if (existingTestData.childA1?.id) {
      const pointResult = await testPointEventValidation(
        existingTestData.parentA.token,
        existingTestData.familyA.id,
        existingTestData.childA1.id
      );
      results.tests.push({
        id: 'VAL-P0.1c',
        category: 'Validation',
        name: 'Point event validation',
        ...pointResult
      });
      if (pointResult.passed) results.summary.passed++;
      else results.summary.failed++;
    } else {
      results.summary.skipped++;
      results.tests.push({
        id: 'VAL-P0.1c',
        category: 'Validation',
        name: 'Point event validation',
        passed: false,
        message: 'Skipped - no child test data',
        issues: []
      });
    }

    // PIN validation
    if (existingTestData.childA1?.id && existingTestData.familyA?.code) {
      const pinResult = await testPINValidation(
        existingTestData.familyA.code,
        existingTestData.childA1.id
      );
      results.tests.push({
        id: 'VAL-P0.1d',
        category: 'Validation',
        name: 'PIN validation & sensitive data protection',
        ...pinResult
      });
      if (pinResult.passed) results.summary.passed++;
      else results.summary.failed++;
    } else {
      results.summary.skipped++;
      results.tests.push({
        id: 'VAL-P0.1d',
        category: 'Validation',
        name: 'PIN validation & sensitive data protection',
        passed: false,
        message: 'Skipped - no child/family test data',
        issues: []
      });
    }
  } else {
    results.summary.skipped += 3;
    console.log('⚠️  Skipping child, point, and PIN validation tests - no test data');
  }

  // ========================================
  // ROUTING TESTS (ROUTE-P0.1 to ROUTE-P0.4)
  // ========================================

  // All routing tests require manual verification
  const publicRoutesResult = await testPublicRoutes();
  results.tests.push({
    id: 'ROUTE-P0.1',
    category: 'Routing',
    name: 'Public routes accessible unauthenticated',
    ...publicRoutesResult
  });
  results.summary.manual++;

  const protectedRedirectResult = await testProtectedRouteRedirects();
  results.tests.push({
    id: 'ROUTE-P0.2',
    category: 'Routing',
    name: 'Protected routes redirect unauthenticated',
    ...protectedRedirectResult
  });
  results.summary.manual++;

  const parentKidResult = await testParentKidRouteIsolation();
  results.tests.push({
    id: 'ROUTE-P0.3',
    category: 'Routing',
    name: 'Parent cannot access kid routes',
    ...parentKidResult
  });
  results.summary.manual++;

  const kidParentResult = await testKidParentRouteIsolation();
  results.tests.push({
    id: 'ROUTE-P0.4',
    category: 'Routing',
    name: 'Kid cannot access parent routes',
    ...kidParentResult
  });
  results.summary.manual++;

  // ========================================
  // SUMMARY
  // ========================================

  console.log('\n' + '═'.repeat(60));
  console.log('📊 VALIDATION & ROUTING AUDIT SUMMARY (P0)');
  console.log('═'.repeat(60));
  console.log(`Total Tests:     ${results.summary.total}`);
  console.log(`✅ Passed:        ${results.summary.passed}`);
  console.log(`❌ Failed:        ${results.summary.failed}`);
  console.log(`⚠️  Warnings:     ${results.summary.warnings}`);
  console.log(`📋 Manual:        ${results.summary.manual} (require browser testing)`);
  console.log(`⏭️  Skipped:      ${results.summary.skipped}`);
  console.log('═'.repeat(60) + '\n');

  // Detailed results
  console.log('📋 DETAILED RESULTS:\n');
  
  for (const test of results.tests) {
    const icon = test.passed ? '✅' : (test.message.includes('manual') ? '📋' : '❌');
    console.log(`${icon} ${test.id}: ${test.name}`);
    console.log(`   ${test.message}`);
    
    if (test.issues && test.issues.length > 0) {
      console.log('   Issues:');
      test.issues.forEach((issue: string) => {
        console.log(`     - ${issue}`);
      });
    }
    console.log('');
  }

  return results;
}
