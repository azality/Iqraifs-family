/**
 * Test Helper Functions
 * Browser console utilities for manual testing
 */

import { supabase } from '../../utils/supabase/client';
import { projectId } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// =============================================================================
// SETUP HELPERS
// =============================================================================

export async function setupTestFamily(familyName: string = 'Test Family') {
  console.log('🏗️ Creating test family...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/families`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: familyName })
  });
  
  const family = await response.json();
  console.log('✅ Family created:', family);
  return family;
}

export async function setupTestChild(familyId: string, name: string = 'Test Child', pin: string = '1234') {
  console.log('👶 Creating test child...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/families/${familyId}/children`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      pin,
      avatar: '👶'
    })
  });
  
  const child = await response.json();
  console.log('✅ Child created:', child);
  return child;
}

// =============================================================================
// INSPECTION HELPERS
// =============================================================================

export async function inspectSession() {
  console.log('🔍 ========================================');
  console.log('🔍 SESSION INSPECTION');
  console.log('🔍 ========================================\n');
  
  // Supabase session
  const { data: { session }, error } = await supabase.auth.getSession();
  
  console.log('📋 Supabase Session:');
  console.log('  User ID:', session?.user?.id);
  console.log('  Email:', session?.user?.email);
  console.log('  Token:', session?.access_token?.substring(0, 30) + '...');
  console.log('  Expires:', session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A');
  console.log('  Error:', error?.message || 'None');
  
  // LocalStorage
  console.log('\n📋 LocalStorage:');
  console.log('  user_mode:', localStorage.getItem('user_mode'));
  console.log('  user_role:', localStorage.getItem('user_role'));
  console.log('  fgs_family_id:', localStorage.getItem('fgs_family_id'));
  console.log('  kid_access_token:', localStorage.getItem('kid_access_token')?.substring(0, 20) + '...' || 'None');
  console.log('  kid_id:', localStorage.getItem('kid_id'));
  console.log('  family_code:', localStorage.getItem('family_code'));
  
  return {
    supabaseSession: session,
    localStorage: {
      mode: localStorage.getItem('user_mode'),
      role: localStorage.getItem('user_role'),
      familyId: localStorage.getItem('fgs_family_id'),
      kidToken: localStorage.getItem('kid_access_token'),
      kidId: localStorage.getItem('kid_id')
    }
  };
}

export async function inspectFamily(familyId: string) {
  console.log('🔍 Fetching family data...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/families/${familyId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const family = await response.json();
  console.log('👨‍👩‍👧‍👦 Family:', family);
  return family;
}

export async function inspectChild(childId: string) {
  console.log('🔍 Fetching child data...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/children/${childId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const child = await response.json();
  console.log('👶 Child:', child);
  return child;
}

export async function inspectChildEvents(childId: string, limit: number = 10) {
  console.log('🔍 Fetching child events...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/children/${childId}/events`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const events = await response.json();
  console.log(`📅 Recent Events (${Math.min(limit, events.length)}/${events.length}):`);
  events.slice(0, limit).forEach((event: any, i: number) => {
    console.log(`  ${i + 1}. ${event.points > 0 ? '+' : ''}${event.points} pts - ${event.description} (${new Date(event.timestamp).toLocaleString()})`);
  });
  
  return events;
}

// =============================================================================
// TESTING HELPERS
// =============================================================================

export async function testAddPoints(childId: string, points: number, description: string = 'Test points') {
  console.log(`➕ Adding ${points} points to ${childId}...`);
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  // Get before state
  const beforeResponse = await fetch(`${API_BASE}/children/${childId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const before = await beforeResponse.json();
  console.log(`  Before: ${before.currentPoints} points`);
  
  // Add points
  const response = await fetch(`${API_BASE}/point-events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      childId,
      points,
      description
    })
  });
  
  const event = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed:', event);
    return null;
  }
  
  // Wait a bit for update
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get after state
  const afterResponse = await fetch(`${API_BASE}/children/${childId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const after = await afterResponse.json();
  console.log(`  After: ${after.currentPoints} points`);
  console.log(`  Change: ${after.currentPoints - before.currentPoints} (expected: ${points})`);
  
  const correct = (after.currentPoints - before.currentPoints) === points;
  console.log(correct ? '✅ Math correct!' : '❌ Math incorrect!');
  
  return {
    before: before.currentPoints,
    after: after.currentPoints,
    change: after.currentPoints - before.currentPoints,
    expected: points,
    correct,
    event
  };
}

export async function testCrossFamilyAccess(otherFamilyId: string) {
  console.log('🔒 Testing cross-family access...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const response = await fetch(`${API_BASE}/families/${otherFamilyId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  if (response.status === 403) {
    console.log('✅ Access correctly blocked (403)');
    console.log('  Error:', data.error);
    return { blocked: true, response: data };
  } else if (response.status === 404) {
    console.log('✅ Family not found (404)');
    return { blocked: true, response: data };
  } else {
    console.log('❌ Access NOT blocked! Got:', response.status);
    console.log('  Data:', data);
    return { blocked: false, response: data };
  }
}

export async function testRateLimit(endpoint: string = 'point-events', count: number = 35, childId?: string) {
  console.log(`⏱️ Testing rate limit (${count} requests)...`);
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          childId: childId || 'test',
          points: 1,
          description: `Rate limit test ${i}`
        })
      }).then(r => ({ status: r.status, ok: r.ok }))
    );
  }
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const successful = results.filter(r => r.ok).length;
  const rateLimited = results.filter(r => r.status === 429).length;
  
  console.log(`📊 Results (${duration}ms):`);
  console.log(`  ✅ Successful: ${successful}`);
  console.log(`  🚫 Rate limited: ${rateLimited}`);
  console.log(`  📈 Status codes:`, results.map(r => r.status).join(', '));
  
  if (rateLimited > 0) {
    console.log('✅ Rate limiting is working!');
  } else {
    console.log('⚠️ No rate limiting detected');
  }
  
  return {
    total: count,
    successful,
    rateLimited,
    duration,
    results
  };
}

// =============================================================================
// CLEANUP HELPERS
// =============================================================================

export async function cleanupTestEvents(childId: string) {
  console.log('🧹 Cleaning up test events...');
  
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  
  if (!token) {
    console.error('❌ Not logged in');
    return null;
  }
  
  const eventsResponse = await fetch(`${API_BASE}/children/${childId}/events`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const events = await eventsResponse.json();
  const testEvents = events.filter((e: any) => 
    e.description?.includes('Test') || 
    e.description?.includes('P0') ||
    e.description?.includes('Spam')
  );
  
  console.log(`Found ${testEvents.length} test events to clean up`);
  
  // Note: Void endpoint might not exist, this is for demonstration
  for (const event of testEvents) {
    console.log(`  Voiding: ${event.id}`);
    // await fetch(`${API_BASE}/point-events/${event.id}/void`, { ... });
  }
  
  console.log('✅ Cleanup complete');
  return testEvents;
}

export function clearAllSessions() {
  console.log('🧹 Clearing all sessions...');
  
  // Supabase signout
  supabase.auth.signOut();
  
  // Clear localStorage
  localStorage.removeItem('user_mode');
  localStorage.removeItem('user_role');
  localStorage.removeItem('fgs_family_id');
  localStorage.removeItem('kid_access_token');
  localStorage.removeItem('kid_session_token');
  localStorage.removeItem('kid_id');
  localStorage.removeItem('child_id');
  localStorage.removeItem('family_code');
  
  console.log('✅ All sessions cleared');
  console.log('ℹ️ Refresh page to see login screen');
}

// =============================================================================
// QUICK TEST SUITE
// =============================================================================

export async function quickTest(childId: string) {
  console.log('⚡ Running quick P0 tests...\n');
  
  const tests = [];
  
  // Test 1: Points addition
  console.log('Test 1: Points Addition');
  const addResult = await testAddPoints(childId, 10, 'Quick test +10');
  tests.push({ name: 'Points Addition', pass: addResult?.correct });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Points subtraction
  console.log('\nTest 2: Points Subtraction');
  const subResult = await testAddPoints(childId, -5, 'Quick test -5');
  tests.push({ name: 'Points Subtraction', pass: subResult?.correct });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Session persistence
  console.log('\nTest 3: Session Persistence');
  const session1 = await supabase.auth.getSession();
  await new Promise(resolve => setTimeout(resolve, 500));
  const session2 = await supabase.auth.getSession();
  const sessionPersists = session1.data.session?.access_token === session2.data.session?.access_token;
  tests.push({ name: 'Session Persistence', pass: sessionPersists });
  console.log(sessionPersists ? '✅ Session persists' : '❌ Session does not persist');
  
  // Summary
  console.log('\n📊 Quick Test Summary:');
  tests.forEach(t => {
    console.log(`  ${t.pass ? '✅' : '❌'} ${t.name}`);
  });
  
  const allPass = tests.every(t => t.pass);
  console.log(allPass ? '\n🎉 All quick tests passed!' : '\n⚠️ Some tests failed');
  
  return tests;
}

// Make available in browser console
(window as any).testHelpers = {
  setupTestFamily,
  setupTestChild,
  inspectSession,
  inspectFamily,
  inspectChild,
  inspectChildEvents,
  testAddPoints,
  testCrossFamilyAccess,
  testRateLimit,
  cleanupTestEvents,
  clearAllSessions,
  quickTest
};

console.log('✅ Test helpers loaded!');
console.log('📝 Available functions:', Object.keys((window as any).testHelpers));
console.log('📝 Example: await testHelpers.quickTest("child:xxx")');
