/**
 * Redemption Flow Test Suite
 * 
 * Tests the complete kid reward redemption workflow:
 * 1. Kid requests reward
 * 2. Parent approves/declines
 * 3. Points deducted correctly
 * 4. Delivery tracking
 * 
 * Usage in browser console:
 * import('/src/tests/test-redemption-flow').then(m => m.testRedemptionFlow())
 */

import { supabase } from '../../utils/supabase/client';
import { projectId } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL';
  message: string;
  error?: string;
}

const results: TestResult[] = [];

function logTest(name: string, status: 'PASS' | 'FAIL', message: string) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${name}: ${message}`);
  results.push({ testName: name, status, message });
}

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Helper to create test data
async function createTestData() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not logged in');

  const familyId = localStorage.getItem('fgs_family_id');
  if (!familyId) throw new Error('No family ID found');

  // Create test child
  const childRes = await fetch(`${API_BASE}/families/${familyId}/children`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Redemption Child',
      pin: '9999',
      avatar: '👧'
    })
  });

  if (!childRes.ok) {
    throw new Error(`Failed to create child: ${await childRes.text()}`);
  }

  const child = await childRes.json();

  // Give child 100 points
  const pointRes = await fetch(`${API_BASE}/point-events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      childId: child.id,
      points: 100,
      description: 'Test redemption setup'
    })
  });

  if (!pointRes.ok) {
    throw new Error(`Failed to add points: ${await pointRes.text()}`);
  }

  // Get a reward from family
  const rewardsRes = await fetch(`${API_BASE}/families/${familyId}/rewards`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!rewardsRes.ok) {
    throw new Error(`Failed to fetch rewards: ${await rewardsRes.text()}`);
  }

  const rewards = await rewardsRes.json();
  const affordableReward = rewards.find((r: any) => r.pointCost <= 100 && r.pointCost >= 20);

  if (!affordableReward) {
    throw new Error('No affordable reward found (need 20-100 point reward)');
  }

  return {
    child,
    reward: affordableReward,
    familyId,
    token
  };
}

// Test 1: Create redemption request
async function testCreateRequest(data: any) {
  const testName = 'Create Redemption Request';
  
  try {
    const response = await fetch(`${API_BASE}/redemption-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId: data.child.id,
        rewardId: data.reward.id,
        notes: 'Test request - please approve!'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      logTest(testName, 'FAIL', `Request creation failed: ${error.error}`);
      return null;
    }

    const result = await response.json();
    const request = result.redemptionRequest;

    // Validate request structure
    if (!request.id || !request.childId || !request.status) {
      logTest(testName, 'FAIL', 'Invalid request structure');
      return null;
    }

    if (request.status !== 'pending') {
      logTest(testName, 'FAIL', `Expected status 'pending', got '${request.status}'`);
      return null;
    }

    if (request.pointCost !== data.reward.pointCost) {
      logTest(testName, 'FAIL', `Point cost mismatch: ${request.pointCost} vs ${data.reward.pointCost}`);
      return null;
    }

    logTest(testName, 'PASS', `Request created: ${request.id}`);
    return request;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return null;
  }
}

// Test 2: Verify request appears in family list
async function testFetchRequest(data: any, requestId: string) {
  const testName = 'Fetch Family Redemption Requests';
  
  try {
    const response = await fetch(
      `${API_BASE}/families/${data.familyId}/redemption-requests`,
      {
        headers: { 'Authorization': `Bearer ${data.token}` }
      }
    );

    if (!response.ok) {
      logTest(testName, 'FAIL', 'Failed to fetch requests');
      return false;
    }

    const requests = await response.json();
    const foundRequest = requests.find((r: any) => r.id === requestId);

    if (!foundRequest) {
      logTest(testName, 'FAIL', 'Request not found in family list');
      return false;
    }

    logTest(testName, 'PASS', `Found ${requests.length} request(s)`);
    return true;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return false;
  }
}

// Test 3: Approve request and verify points deduction
async function testApproveRequest(data: any, requestId: string) {
  const testName = 'Approve Request & Deduct Points';
  
  try {
    // Get child's points before approval
    const beforeRes = await fetch(`${API_BASE}/children/${data.child.id}`, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const beforeChild = await beforeRes.json();
    const pointsBefore = beforeChild.currentPoints;

    // Approve request
    const approveRes = await fetch(
      `${API_BASE}/redemption-requests/${requestId}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!approveRes.ok) {
      const error = await approveRes.json();
      logTest(testName, 'FAIL', `Approval failed: ${error.error}`);
      return null;
    }

    const approveResult = await approveRes.json();
    
    // Wait for points to update
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get child's points after approval
    const afterRes = await fetch(`${API_BASE}/children/${data.child.id}`, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const afterChild = await afterRes.json();
    const pointsAfter = afterChild.currentPoints;

    const expectedPoints = pointsBefore - data.reward.pointCost;
    
    if (pointsAfter !== expectedPoints) {
      logTest(
        testName, 
        'FAIL', 
        `Points incorrect: expected ${expectedPoints}, got ${pointsAfter}`
      );
      return null;
    }

    // Verify request status changed
    const requestRes = await fetch(
      `${API_BASE}/families/${data.familyId}/redemption-requests`,
      {
        headers: { 'Authorization': `Bearer ${data.token}` }
      }
    );
    const requests = await requestRes.json();
    const updatedRequest = requests.find((r: any) => r.id === requestId);

    if (updatedRequest.status !== 'approved') {
      logTest(testName, 'FAIL', `Status not updated: ${updatedRequest.status}`);
      return null;
    }

    logTest(
      testName, 
      'PASS', 
      `Points: ${pointsBefore} → ${pointsAfter} (-${data.reward.pointCost})`
    );
    return updatedRequest;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return null;
  }
}

// Test 4: Mark as delivered
async function testMarkDelivered(data: any, requestId: string) {
  const testName = 'Mark Request as Delivered';
  
  try {
    const response = await fetch(
      `${API_BASE}/redemption-requests/${requestId}/deliver`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      logTest(testName, 'FAIL', `Delivery marking failed: ${error.error}`);
      return false;
    }

    const result = await response.json();
    
    if (result.request.status !== 'delivered') {
      logTest(testName, 'FAIL', `Status not 'delivered': ${result.request.status}`);
      return false;
    }

    if (!result.request.deliveredAt || !result.request.deliveredBy) {
      logTest(testName, 'FAIL', 'Delivery metadata missing');
      return false;
    }

    logTest(testName, 'PASS', 'Request marked as delivered');
    return true;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return false;
  }
}

// Test 5: Test decline workflow
async function testDeclineRequest(data: any) {
  const testName = 'Decline Request with Reason';
  
  try {
    // Create another request
    const createRes = await fetch(`${API_BASE}/redemption-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId: data.child.id,
        rewardId: data.reward.id,
        notes: 'Another test request'
      })
    });

    if (!createRes.ok) {
      logTest(testName, 'FAIL', 'Failed to create request for decline test');
      return false;
    }

    const createResult = await createRes.json();
    const requestId = createResult.redemptionRequest.id;

    // Decline with reason
    const declineRes = await fetch(
      `${API_BASE}/redemption-requests/${requestId}/decline`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'Test decline reason - wait until weekend!'
        })
      }
    );

    if (!declineRes.ok) {
      const error = await declineRes.json();
      logTest(testName, 'FAIL', `Decline failed: ${error.error}`);
      return false;
    }

    const declineResult = await declineRes.json();
    
    if (declineResult.request.status !== 'declined') {
      logTest(testName, 'FAIL', `Status not 'declined': ${declineResult.request.status}`);
      return false;
    }

    if (!declineResult.request.declineReason) {
      logTest(testName, 'FAIL', 'Decline reason not saved');
      return false;
    }

    logTest(testName, 'PASS', 'Request declined with reason');
    return true;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return false;
  }
}

// Test 6: Insufficient points handling
async function testInsufficientPoints(data: any) {
  const testName = 'Insufficient Points Validation';
  
  try {
    // Find a reward that costs more than child has
    const rewardsRes = await fetch(
      `${API_BASE}/families/${data.familyId}/rewards`,
      {
        headers: { 'Authorization': `Bearer ${data.token}` }
      }
    );
    const rewards = await rewardsRes.json();
    
    // Get child's current points
    const childRes = await fetch(`${API_BASE}/children/${data.child.id}`, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const child = await childRes.json();
    
    const expensiveReward = rewards.find((r: any) => r.pointCost > child.currentPoints);

    if (!expensiveReward) {
      logTest(testName, 'FAIL', 'No expensive reward found for test');
      return false;
    }

    // Try to create request for expensive reward
    const createRes = await fetch(`${API_BASE}/redemption-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId: data.child.id,
        rewardId: expensiveReward.id
      })
    });

    if (createRes.ok) {
      logTest(testName, 'FAIL', 'Request created despite insufficient points!');
      return false;
    }

    const error = await createRes.json();
    
    if (!error.error || !error.error.includes('Not enough points')) {
      logTest(testName, 'FAIL', `Wrong error message: ${error.error}`);
      return false;
    }

    logTest(testName, 'PASS', 'Insufficient points correctly rejected');
    return true;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return false;
  }
}

// Test 7: Decline with short reason (should fail)
async function testShortDeclineReason(data: any) {
  const testName = 'Short Decline Reason Validation';
  
  try {
    // Create request
    const createRes = await fetch(`${API_BASE}/redemption-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        childId: data.child.id,
        rewardId: data.reward.id
      })
    });

    if (!createRes.ok) {
      logTest(testName, 'FAIL', 'Failed to create request');
      return false;
    }

    const createResult = await createRes.json();
    const requestId = createResult.redemptionRequest.id;

    // Try to decline with short reason
    const declineRes = await fetch(
      `${API_BASE}/redemption-requests/${requestId}/decline`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'No' // Too short
        })
      }
    );

    if (declineRes.ok) {
      logTest(testName, 'FAIL', 'Short reason accepted (should be rejected)');
      return false;
    }

    const error = await declineRes.json();
    
    if (!error.error || !error.error.includes('at least 5 characters')) {
      logTest(testName, 'FAIL', `Wrong error message: ${error.error}`);
      return false;
    }

    logTest(testName, 'PASS', 'Short decline reason correctly rejected');
    return true;
  } catch (error) {
    logTest(testName, 'FAIL', String(error));
    return false;
  }
}

// Cleanup test data
async function cleanup(data: any) {
  console.log('\n🧹 Cleaning up test data...');
  
  // Note: We don't delete the test child to avoid breaking KV relationships
  // In production, you might want to implement a cleanup endpoint
  
  console.log('✅ Test complete - test child and requests remain for inspection');
  console.log(`   Child ID: ${data.child.id}`);
}

// Main test runner
export async function testRedemptionFlow() {
  console.log('🧪 ========================================');
  console.log('🧪 REDEMPTION FLOW TEST SUITE');
  console.log('🧪 ========================================\n');

  const startTime = Date.now();
  results.length = 0;

  try {
    // Setup
    console.log('📋 Setting up test data...\n');
    const data = await createTestData();
    console.log(`✅ Created test child: ${data.child.id}`);
    console.log(`✅ Using reward: ${data.reward.name} (${data.reward.pointCost} pts)`);
    console.log(`✅ Child has: 100 points\n`);

    // Test 1: Create request
    console.log('📋 Test 1: Create Redemption Request\n');
    const request = await testCreateRequest(data);
    if (!request) return;
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Fetch request
    console.log('\n📋 Test 2: Fetch Family Requests\n');
    const fetchOk = await testFetchRequest(data, request.id);
    if (!fetchOk) return;

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Approve request
    console.log('\n📋 Test 3: Approve Request & Deduct Points\n');
    const approvedRequest = await testApproveRequest(data, request.id);
    if (!approvedRequest) return;

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: Mark delivered
    console.log('\n📋 Test 4: Mark as Delivered\n');
    const deliveredOk = await testMarkDelivered(data, request.id);
    if (!deliveredOk) return;

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 5: Decline workflow
    console.log('\n📋 Test 5: Decline Request\n');
    await testDeclineRequest(data);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 6: Insufficient points
    console.log('\n📋 Test 6: Insufficient Points Validation\n');
    await testInsufficientPoints(data);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 7: Short decline reason
    console.log('\n📋 Test 7: Short Decline Reason Validation\n');
    await testShortDeclineReason(data);

    // Cleanup
    await cleanup(data);

    // Summary
    const totalTime = Date.now() - startTime;
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log('\n🧪 ========================================');
    console.log('🧪 TEST SUMMARY');
    console.log('🧪 ========================================\n');
    console.log(`✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`⏱️  TIME:   ${totalTime}ms\n`);

    if (failed === 0) {
      console.log('🎉 ALL REDEMPTION FLOW TESTS PASSED! 🎉\n');
      console.log('✅ The redemption system is FULLY FUNCTIONAL');
    } else {
      console.log('⚠️  SOME TESTS FAILED - Review errors above\n');
    }

    return {
      passed,
      failed,
      total: results.length,
      duration: totalTime,
      results
    };
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: Date.now() - startTime,
      results: [{ testName: 'Setup', status: 'FAIL', message: String(error) }]
    };
  }
}

// Make available in browser console
(window as any).testRedemptionFlow = testRedemptionFlow;

console.log('✅ Redemption flow test suite loaded!');
console.log('📝 Run with: await testRedemptionFlow()');
