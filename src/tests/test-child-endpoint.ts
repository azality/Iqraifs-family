/**
 * Quick test to verify GET /children/:id endpoint
 */

import { supabase } from '../../utils/supabase/client';
import { projectId } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export async function testChildEndpoint() {
  console.log('🧪 ========================================');
  console.log('🧪 TESTING CHILD ENDPOINT');
  console.log('🧪 ========================================\n');
  
  // Get test environment
  const testEnvStr = localStorage.getItem('fgs_test_environment');
  if (!testEnvStr) {
    console.error('❌ No test environment found. Run setupTestEnvironment() first.');
    return { error: 'No test environment found' };
  }
  
  // Debug: Log RAW localStorage content
  console.log('🔍 RAW localStorage content:');
  console.log(testEnvStr.substring(0, 500) + '...\n');
  
  const testEnv = JSON.parse(testEnvStr);
  
  // Debug: Log PARSED structure
  console.log('🔍 PARSED test environment:');
  console.log('   Keys:', Object.keys(testEnv));
  console.log('   familyA:', testEnv.familyA);
  console.log('   familyA type:', typeof testEnv.familyA);
  console.log('   familyA keys:', testEnv.familyA ? Object.keys(testEnv.familyA) : 'N/A');
  console.log('   familyA.children:', testEnv.familyA?.children);
  console.log('   familyA.children type:', typeof testEnv.familyA?.children);
  console.log('   familyA.children is array:', Array.isArray(testEnv.familyA?.children));
  console.log('   familyA.children length:', testEnv.familyA?.children?.length);
  if (testEnv.familyA?.children?.[0]) {
    console.log('   familyA.children[0]:', testEnv.familyA.children[0]);
    console.log('   familyA.children[0] keys:', Object.keys(testEnv.familyA.children[0]));
  }
  console.log('');
  
  // Fix: Use childId instead of id
  if (!testEnv.familyA?.children?.[0]) {
    console.error('❌ Test environment is invalid or incomplete!');
    console.error('   Please click "Reset & Recreate" button first.');
    return { error: 'Invalid test environment structure' };
  }
  
  const childA1 = testEnv.familyA.children[0];
  
  // Try multiple possible field names
  const childId = childA1.childId || childA1.id || childA1.child_id;
  
  console.log('🔍 Child ID extraction:');
  console.log('   childA1.childId =', childA1.childId);
  console.log('   childA1.id =', childA1.id);
  console.log('   childA1.child_id =', childA1.child_id);
  console.log('   Final childId =', childId);
  console.log('');
  
  if (!childId) {
    console.error('❌ Child ID not found in any expected field!');
    console.error('   Child object:', childA1);
    console.error('   Available keys:', Object.keys(childA1));
    console.error('');
    console.error('🔧 ACTION REQUIRED:');
    console.error('   1. Click "Reset & Recreate" button');
    console.error('   2. Wait for "TEST ENVIRONMENT READY!" message');
    console.error('   3. Run this test again');
    return { error: 'Child ID not found - please reset test environment' };
  }
  
  console.log('📋 Test Setup:');
  console.log(`   Child ID: ${childId}`);
  console.log(`   Child Name: ${childA1.name}`);
  console.log(`   Family A Parent 1: ${testEnv.familyA.parents[0].email}\n`);
  
  // Sign in as Family A Parent 1
  console.log('🔐 Signing in as Family A Parent 1...');
  const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEnv.familyA.parents[0].email,
    password: 'TestPassword123!'
  });
  
  if (signInError || !session) {
    console.error('❌ Sign in failed:', signInError);
    return { error: 'Sign in failed' };
  }
  
  console.log('✅ Signed in successfully');
  console.log(`   User ID: ${session.user.id}`);
  console.log(`   Token preview: ${session.access_token.substring(0, 30)}...\n`);
  
  // Test 1: Call endpoint WITH auth token
  console.log('📡 Test 1: GET /children/:id WITH auth token');
  
  const requestHeaders = {
    'Authorization': `Bearer ${session.access_token}`,
    'X-Supabase-Auth': `Bearer ${session.access_token}`, // 🆕 Backup header for Supabase issue
    'Content-Type': 'application/json'
  };
  
  console.log('📤 OUTGOING REQUEST HEADERS:');
  console.log('   Authorization:', requestHeaders.Authorization.substring(0, 50) + '...');
  console.log('   X-Supabase-Auth:', requestHeaders['X-Supabase-Auth'].substring(0, 50) + '...');
  console.log('   Content-Type:', requestHeaders['Content-Type']);
  console.log('   Full headers object:', JSON.stringify(requestHeaders, null, 2));
  console.log('');
  
  const response1 = await fetch(`${API_BASE}/children/${childId}`, {
    headers: requestHeaders
  });
  
  console.log(`   Status: ${response1.status} ${response1.statusText}`);
  
  const data1 = await response1.json();
  console.log('   Response:', data1);
  
  if (response1.ok) {
    console.log('   ✅ Endpoint working correctly!');
    console.log(`   Child name: ${data1.name}`);
    console.log(`   Has PIN in response: ${!!data1.pin} (should be false)`);
  } else {
    console.log('   ❌ Request failed!');
    if (response1.status === 401) {
      console.log('   🚨 401 = Authentication failed');
      console.log('   Possible causes:');
      console.log('      1. "Verify JWT" is enabled in Supabase Edge Functions settings');
      console.log('      2. Edge Function not redeployed yet');
      console.log('      3. requireAuth middleware issue');
    } else if (response1.status === 403) {
      console.log('   🚨 403 = Authorization failed (no access to this child)');
    } else if (response1.status === 404) {
      console.log('   🚨 404 = Endpoint not found (not deployed yet?)');
    }
  }
  
  console.log('\n');
  
  // Test 2: Call endpoint WITHOUT auth token
  console.log('📡 Test 2: GET /children/:id WITHOUT auth token');
  const response2 = await fetch(`${API_BASE}/children/${childId}`, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`   Status: ${response2.status} ${response2.statusText}`);
  const data2 = await response2.json();
  console.log('   Response:', data2);
  console.log('   ✅ Correctly requires authentication (should be 401)\n');
  
  // Test 3: Check health endpoint
  console.log('📡 Test 3: GET /health (sanity check)');
  const response3 = await fetch(`${API_BASE}/health`);
  console.log(`   Status: ${response3.status} ${response3.statusText}`);
  const data3 = await response3.json();
  console.log('   Response:', data3);
  
  if (response3.ok) {
    console.log('   ✅ Edge Function is deployed and responding\n');
  } else {
    console.log('   ❌ Edge Function health check failed!\n');
  }
  
  console.log('🏁 ========================================');
  console.log('🏁 TEST COMPLETE');
  console.log('🏁 ========================================');
  
  // Summary
  console.log('\n📊 SUMMARY:');
  console.log(`   Health endpoint: ${response3.ok ? '✅ OK' : '❌ FAILED'}`);
  console.log(`   Auth required: ${response2.status === 401 ? '✅ YES' : '❌ NO'}`);
  console.log(`   Authenticated access: ${response1.ok ? '✅ SUCCESS' : '❌ FAILED'}`);
  
  if (!response1.ok && response1.status === 401) {
    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('   Go to Supabase Dashboard → Functions → make-server-f116e23f → Settings');
    console.log('   Disable "Verify JWT" toggle');
    console.log('   Then run this test again');
  }
  
  // Return test results
  return {
    childId,
    healthOk: response3.ok,
    authRequired: response2.status === 401,
    authenticatedSuccess: response1.ok,
    authenticatedStatus: response1.status,
    authenticatedData: data1
  };
}

// Make it globally available
(window as any).testChildEndpoint = testChildEndpoint;

console.log('💡 Test loaded! Run: testChildEndpoint()');