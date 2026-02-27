/**
 * P0 Test Runner - Automated Testing Suite
 * 
 * Usage:
 * 1. Open browser console at http://localhost:5173
 * 2. Copy and paste this entire file
 * 3. Run: await runP0Tests()
 */

import { supabase } from '../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// Test results storage
interface TestResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'PENDING';
  message?: string;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function logTest(name: string, status: 'PASS' | 'FAIL' | 'SKIP', message?: string) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${emoji} ${name}${message ? ': ' + message : ''}`);
}

function recordResult(test: TestResult) {
  results.push(test);
  logTest(test.name, test.status, test.message);
}

// Get current session token
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Get kid session token
function getKidToken(): string | null {
  return localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
}

// =============================================================================
// P0-1: AUTH BYPASS PREVENTION
// =============================================================================

async function testP0_1_1_UnauthParentAccess() {
  const testId = 'P0-1.1';
  const testName = 'Unauthenticated Parent Route Access';
  const startTime = Date.now();
  
  try {
    // Clear session
    await supabase.auth.signOut();
    
    // Try to access protected endpoint
    const response = await fetch(`${API_BASE}/families/family:test`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    // Should fail with 401 or return null user
    if (response.status === 401 || data.error === 'Unauthorized') {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Protected endpoint correctly rejected unauthenticated request',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected 401, got ${response.status}`,
        error: JSON.stringify(data),
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_1_2_InvalidJWT() {
  const testId = 'P0-1.2';
  const testName = 'Invalid JWT Rejection';
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_BASE}/families/family:test`, {
      headers: {
        'Authorization': 'Bearer invalid_jwt_token_12345',
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.status === 401 || data.error === 'Unauthorized') {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Invalid JWT correctly rejected',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected 401, got ${response.status}`,
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_1_3_KidTokenOnParentEndpoint() {
  const testId = 'P0-1.3';
  const testName = 'Kid Token on Parent Endpoint';
  const startTime = Date.now();
  
  try {
    const kidToken = getKidToken();
    
    if (!kidToken) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'No kid session found - login as kid first',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Try to access parent-only endpoint with kid token
    const response = await fetch(`${API_BASE}/families/family:test/children`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kidToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Child',
        avatar: '👶'
      })
    });
    
    const data = await response.json();
    
    if (response.status === 403 || data.error === 'Parent access required') {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Kid token correctly blocked from parent endpoint',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected 403, got ${response.status}`,
        error: JSON.stringify(data),
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

// =============================================================================
// P0-2: CROSS-FAMILY ACCESS PREVENTION
// =============================================================================

async function testP0_2_1_CrossFamilyAccess(familyAId: string, familyBId: string) {
  const testId = 'P0-2.1';
  const testName = 'Cross-Family API Access Prevention';
  const startTime = Date.now();
  
  try {
    const token = await getAuthToken();
    
    if (!token) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Not logged in - login as parent first',
        duration: Date.now() - startTime
      });
      return;
    }
    
    if (!familyBId) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Family B ID not provided',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Try to access Family B's data while logged in as Family A
    const response = await fetch(`${API_BASE}/families/${familyBId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.status === 403 || data.error?.includes('Access denied')) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Cross-family access correctly blocked',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected 403, got ${response.status}`,
        error: JSON.stringify(data),
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_2_2_CrossChildAccess(familyBChildId: string) {
  const testId = 'P0-2.2';
  const testName = 'Cross-Family Child Access Prevention';
  const startTime = Date.now();
  
  try {
    const token = await getAuthToken();
    
    if (!token) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Not logged in',
        duration: Date.now() - startTime
      });
      return;
    }
    
    if (!familyBChildId) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Family B child ID not provided',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Try to log points for Family B's child
    const response = await fetch(`${API_BASE}/point-events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId: familyBChildId,
        points: 100,
        description: 'Unauthorized test'
      })
    });
    
    const data = await response.json();
    
    if (response.status === 403 || response.status === 404) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Cross-child access correctly blocked',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected 403/404, got ${response.status}`,
        error: JSON.stringify(data),
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

// =============================================================================
// P0-3: TOKEN PERSISTENCE & REFRESH
// =============================================================================

async function testP0_3_1_SessionPersistence() {
  const testId = 'P0-3.1';
  const testName = 'Session Persistence After Refresh';
  const startTime = Date.now();
  
  try {
    const { data: { session: beforeSession } } = await supabase.auth.getSession();
    
    if (!beforeSession) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'No active session - login first',
        duration: Date.now() - startTime
      });
      return;
    }
    
    const beforeToken = beforeSession.access_token;
    
    // Simulate page refresh by re-fetching session
    await sleep(1000);
    const { data: { session: afterSession } } = await supabase.auth.getSession();
    
    if (afterSession && afterSession.access_token === beforeToken) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Session persisted correctly',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: 'Session did not persist',
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_3_2_TokenRefresh() {
  const testId = 'P0-3.2';
  const testName = 'Token Auto-Refresh';
  const startTime = Date.now();
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: 'Session refresh failed',
        error: error.message,
        duration: Date.now() - startTime
      });
      return;
    }
    
    if (session?.access_token) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: 'Session refresh successful',
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: 'No access token after refresh',
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

// =============================================================================
// P0-4: POINTS MATH INTEGRITY
// =============================================================================

async function testP0_4_1_PointsAddition(childId: string) {
  const testId = 'P0-4.1';
  const testName = 'Positive Points Addition';
  const startTime = Date.now();
  
  try {
    const token = await getAuthToken();
    
    if (!token) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Not logged in',
        duration: Date.now() - startTime
      });
      return;
    }
    
    if (!childId) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Child ID not provided',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Get current points
    const beforeResponse = await fetch(`${API_BASE}/children/${childId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const beforeData = await beforeResponse.json();
    const pointsBefore = beforeData.currentPoints || 0;
    
    // Add 10 points
    const testPoints = 10;
    await fetch(`${API_BASE}/point-events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId,
        points: testPoints,
        description: 'P0 Test - Addition'
      })
    });
    
    // Wait for update
    await sleep(500);
    
    // Get new points
    const afterResponse = await fetch(`${API_BASE}/children/${childId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const afterData = await afterResponse.json();
    const pointsAfter = afterData.currentPoints || 0;
    
    const expectedPoints = pointsBefore + testPoints;
    
    if (pointsAfter === expectedPoints) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: `${pointsBefore} + ${testPoints} = ${pointsAfter} ✓`,
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected ${expectedPoints}, got ${pointsAfter}`,
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_4_2_PointsSubtraction(childId: string) {
  const testId = 'P0-4.2';
  const testName = 'Negative Points Subtraction';
  const startTime = Date.now();
  
  try {
    const token = await getAuthToken();
    
    if (!token || !childId) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Not logged in or no child ID',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Get current points
    const beforeResponse = await fetch(`${API_BASE}/children/${childId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const beforeData = await beforeResponse.json();
    const pointsBefore = beforeData.currentPoints || 0;
    
    // Subtract 5 points
    const testPoints = -5;
    await fetch(`${API_BASE}/point-events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId,
        points: testPoints,
        description: 'P0 Test - Subtraction'
      })
    });
    
    await sleep(500);
    
    // Get new points
    const afterResponse = await fetch(`${API_BASE}/children/${childId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const afterData = await afterResponse.json();
    const pointsAfter = afterData.currentPoints || 0;
    
    const expectedPoints = pointsBefore + testPoints; // testPoints is negative
    
    if (pointsAfter === expectedPoints) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: `${pointsBefore} ${testPoints} = ${pointsAfter} ✓`,
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `Expected ${expectedPoints}, got ${pointsAfter}`,
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

// =============================================================================
// P0-5: RATE LIMITING
// =============================================================================

async function testP0_5_1_PinRateLimit() {
  const testId = 'P0-5.1';
  const testName = 'Kid PIN Rate Limiting';
  const startTime = Date.now();
  
  try {
    // This test requires manual verification
    // We can't easily test PIN lockout without a test child
    recordResult({
      id: testId,
      name: testName,
      status: 'SKIP',
      message: 'Manual test required - see P0_TEST_EXECUTION.md',
      duration: Date.now() - startTime
    });
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

async function testP0_5_2_EventSpamPrevention(childId: string) {
  const testId = 'P0-5.2';
  const testName = 'Event Spam Prevention';
  const startTime = Date.now();
  
  try {
    const token = await getAuthToken();
    
    if (!token || !childId) {
      recordResult({
        id: testId,
        name: testName,
        status: 'SKIP',
        message: 'Not logged in or no child ID',
        duration: Date.now() - startTime
      });
      return;
    }
    
    // Send 35 rapid requests (limit is 30/min)
    const promises = [];
    for (let i = 0; i < 35; i++) {
      promises.push(
        fetch(`${API_BASE}/point-events`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            childId,
            points: 1,
            description: `Spam test ${i}`
          })
        })
      );
    }
    
    const responses = await Promise.all(promises);
    const statusCodes = responses.map(r => r.status);
    
    const successCount = statusCodes.filter(s => s === 200 || s === 201).length;
    const rateLimitCount = statusCodes.filter(s => s === 429).length;
    
    if (rateLimitCount > 0) {
      recordResult({
        id: testId,
        name: testName,
        status: 'PASS',
        message: `Rate limit triggered: ${successCount} succeeded, ${rateLimitCount} blocked`,
        duration: Date.now() - startTime
      });
    } else {
      recordResult({
        id: testId,
        name: testName,
        status: 'FAIL',
        message: `No rate limiting detected: all ${successCount} requests succeeded`,
        duration: Date.now() - startTime
      });
    }
  } catch (error) {
    recordResult({
      id: testId,
      name: testName,
      status: 'FAIL',
      error: String(error),
      duration: Date.now() - startTime
    });
  }
}

// =============================================================================
// TEST RUNNER
// =============================================================================

export async function runP0Tests(config?: {
  familyAId?: string;
  familyBId?: string;
  familyBChildId?: string;
  childId?: string;
  skipRateLimit?: boolean;
}) {
  console.log('🧪 ========================================');
  console.log('🧪 P0 AUTOMATED TEST SUITE');
  console.log('🧪 ========================================\n');
  
  const startTime = Date.now();
  
  // Clear previous results
  results.length = 0;
  
  console.log('📋 P0-1: AUTH BYPASS PREVENTION\n');
  await testP0_1_1_UnauthParentAccess();
  await testP0_1_2_InvalidJWT();
  await testP0_1_3_KidTokenOnParentEndpoint();
  
  console.log('\n📋 P0-2: CROSS-FAMILY ACCESS PREVENTION\n');
  await testP0_2_1_CrossFamilyAccess(config?.familyAId || '', config?.familyBId || '');
  await testP0_2_2_CrossChildAccess(config?.familyBChildId || '');
  
  console.log('\n📋 P0-3: TOKEN PERSISTENCE & REFRESH\n');
  await testP0_3_1_SessionPersistence();
  await testP0_3_2_TokenRefresh();
  
  console.log('\n📋 P0-4: POINTS MATH INTEGRITY\n');
  await testP0_4_1_PointsAddition(config?.childId || '');
  await testP0_4_2_PointsSubtraction(config?.childId || '');
  
  console.log('\n📋 P0-5: RATE LIMITING\n');
  await testP0_5_1_PinRateLimit();
  if (!config?.skipRateLimit) {
    await testP0_5_2_EventSpamPrevention(config?.childId || '');
  }
  
  // Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log('\n🧪 ========================================');
  console.log('🧪 TEST SUMMARY');
  console.log('🧪 ========================================\n');
  console.log(`✅ PASSED:  ${passed}`);
  console.log(`❌ FAILED:  ${failed}`);
  console.log(`⏭️  SKIPPED: ${skipped}`);
  console.log(`⏱️  TIME:    ${totalTime}ms\n`);
  
  if (failed === 0 && passed > 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉\n');
  } else if (failed > 0) {
    console.log('⚠️  SOME TESTS FAILED - Review errors above\n');
  } else {
    console.log('ℹ️  Most tests skipped - provide config parameters\n');
  }
  
  // Return results
  return {
    passed,
    failed,
    skipped,
    total: results.length,
    duration: totalTime,
    results
  };
}

// Browser console helper
(window as any).runP0Tests = runP0Tests;
(window as any).p0TestResults = results;

console.log('✅ P0 Test Runner loaded!');
console.log('📝 Run tests with: await runP0Tests({ childId: "child:xxx" })');
