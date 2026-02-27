/**
 * DATA FLOW TESTS (P0)
 * 
 * Tests core data flows to ensure correct user experience:
 * - FLOW-P0.1: Parent mode family load sequence
 * - FLOW-P0.2: Kid mode family load sequence
 * 
 * These tests verify that users never see errors and data loads correctly.
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
// HELPER: Simulate login and get token
// ============================================================================

async function loginParent(email: string, password: string): Promise<{ token: string; userId: string } | null> {
  try {
    // Import Supabase client
    const { supabase } = await import('../../../utils/supabase/client');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error || !data.session) {
      console.error('Parent login failed:', error);
      return null;
    }
    
    return {
      token: data.session.access_token,
      userId: data.user.id
    };
  } catch (error: any) {
    console.error('Exception during parent login:', error.message);
    return null;
  }
}

async function loginKid(familyCode: string, childId: string, pin: string): Promise<{ token: string } | null> {
  try {
    const response = await fetch(`${API_BASE}/kid/verify-pin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        familyCode,
        childId,
        pin
      })
    });
    
    if (!response.ok) {
      console.error('Kid login failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.kidToken) {
      console.error('Kid login succeeded but no token returned');
      return null;
    }
    
    return { token: data.kidToken };
  } catch (error: any) {
    console.error('Exception during kid login:', error.message);
    return null;
  }
}

// ============================================================================
// FLOW-P0.1: Parent Mode Family Load Sequence
// ============================================================================

async function testParentFamilyLoadSequence(
  parentEmail: string,
  parentPassword: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 FLOW-P0.1: Testing parent mode family load sequence...');

  // Step 1: Login as parent
  console.log('   Step 1: Login as parent...');
  const loginResult = await loginParent(parentEmail, parentPassword);
  
  if (!loginResult) {
    issues.push('Parent login failed');
    allPassed = false;
    return {
      passed: false,
      message: 'Parent login failed - cannot test family load sequence',
      issues
    };
  }
  
  details.parentToken = loginResult.token.substring(0, 20) + '...';
  console.log(`   ✓ Parent logged in`);

  // Step 2: Fetch family details
  console.log('   Step 2: Fetch family details...');
  try {
    const familyResponse = await fetch(`${API_BASE}/family`, {
      method: 'GET',
      headers: getHeaders(loginResult.token)
    });
    
    if (!familyResponse.ok) {
      issues.push(`Family fetch failed: ${familyResponse.status}`);
      allPassed = false;
      return { passed: false, message: 'Family fetch failed', issues };
    }
    
    const familyData = await familyResponse.json();
    
    // Verify family data structure
    if (!familyData.id) {
      issues.push('Family data missing id');
      allPassed = false;
    }
    
    if (!familyData.name) {
      issues.push('Family data missing name');
      allPassed = false;
    }
    
    if (!familyData.inviteCode) {
      issues.push('Family data missing inviteCode (required for display)');
      allPassed = false;
    }
    
    details.familyId = familyData.id;
    details.familyName = familyData.name;
    details.inviteCode = familyData.inviteCode;
    console.log(`   ✓ Family loaded: ${familyData.name} (${familyData.inviteCode})`);
  } catch (error: any) {
    issues.push(`Exception fetching family: ${error.message}`);
    allPassed = false;
    return { passed: false, message: 'Exception during family fetch', issues, details };
  }

  // Step 3: Fetch children list
  console.log('   Step 3: Fetch children list...');
  try {
    const childrenResponse = await fetch(`${API_BASE}/family/${details.familyId}/children`, {
      method: 'GET',
      headers: getHeaders(loginResult.token)
    });
    
    if (!childrenResponse.ok) {
      issues.push(`Children fetch failed: ${childrenResponse.status}`);
      allPassed = false;
      return { passed: false, message: 'Children fetch failed', issues, details };
    }
    
    const childrenData = await childrenResponse.json();
    
    if (!Array.isArray(childrenData)) {
      issues.push('Children data is not an array');
      allPassed = false;
      return { passed: false, message: 'Invalid children data structure', issues, details };
    }
    
    if (childrenData.length === 0) {
      issues.push('No children found (expected at least 1 for testing)');
      allPassed = false;
    }
    
    // Verify first child structure
    if (childrenData.length > 0) {
      const firstChild = childrenData[0];
      
      if (!firstChild.id) issues.push('First child missing id');
      if (!firstChild.name) issues.push('First child missing name');
      if (!firstChild.avatar) issues.push('First child missing avatar');
      if (firstChild.currentPoints === undefined) issues.push('First child missing currentPoints');
      
      details.childrenCount = childrenData.length;
      details.firstChild = {
        id: firstChild.id,
        name: firstChild.name,
        avatar: firstChild.avatar,
        points: firstChild.currentPoints
      };
      
      console.log(`   ✓ Children loaded: ${childrenData.length} children`);
      console.log(`   ✓ First child: ${firstChild.name} (${firstChild.currentPoints} points)`);
      
      // Step 4: Verify first child can be auto-selected
      console.log('   Step 4: Verify first child auto-selection logic...');
      // Note: Auto-selection happens in FamilyContext, we're verifying the data supports it
      if (firstChild.id && firstChild.name) {
        console.log(`   ✓ First child has required fields for auto-selection`);
      } else {
        issues.push('First child missing fields required for auto-selection');
        allPassed = false;
      }
      
      // Step 5: Fetch events for first child
      console.log('   Step 5: Fetch events for first child...');
      try {
        const eventsResponse = await fetch(
          `${API_BASE}/family/${details.familyId}/events?childId=${firstChild.id}`,
          {
            method: 'GET',
            headers: getHeaders(loginResult.token)
          }
        );
        
        if (!eventsResponse.ok) {
          issues.push(`Events fetch failed: ${eventsResponse.status}`);
          allPassed = false;
        } else {
          const eventsData = await eventsResponse.json();
          
          if (!Array.isArray(eventsData)) {
            issues.push('Events data is not an array');
            allPassed = false;
          } else {
            details.eventsCount = eventsData.length;
            console.log(`   ✓ Events loaded: ${eventsData.length} events`);
          }
        }
      } catch (error: any) {
        issues.push(`Exception fetching events: ${error.message}`);
        allPassed = false;
      }
      
      // Step 6: Fetch attendance for first child
      console.log('   Step 6: Fetch attendance for first child...');
      try {
        const attendanceResponse = await fetch(
          `${API_BASE}/family/${details.familyId}/attendance?childId=${firstChild.id}`,
          {
            method: 'GET',
            headers: getHeaders(loginResult.token)
          }
        );
        
        if (!attendanceResponse.ok) {
          issues.push(`Attendance fetch failed: ${attendanceResponse.status}`);
          allPassed = false;
        } else {
          const attendanceData = await attendanceResponse.json();
          
          if (!Array.isArray(attendanceData)) {
            issues.push('Attendance data is not an array');
            allPassed = false;
          } else {
            details.attendanceCount = attendanceData.length;
            console.log(`   ✓ Attendance loaded: ${attendanceData.length} records`);
          }
        }
      } catch (error: any) {
        issues.push(`Exception fetching attendance: ${error.message}`);
        allPassed = false;
      }
      
      // Step 7: Test switching to second child (if exists)
      if (childrenData.length > 1) {
        console.log('   Step 7: Test switching to second child...');
        const secondChild = childrenData[1];
        
        try {
          const secondChildEventsResponse = await fetch(
            `${API_BASE}/family/${details.familyId}/events?childId=${secondChild.id}`,
            {
              method: 'GET',
              headers: getHeaders(loginResult.token)
            }
          );
          
          if (!secondChildEventsResponse.ok) {
            issues.push(`Switching to second child failed: ${secondChildEventsResponse.status}`);
            allPassed = false;
          } else {
            const secondChildEvents = await secondChildEventsResponse.json();
            details.secondChildEventsCount = secondChildEvents.length;
            console.log(`   ✓ Child switching works: Second child has ${secondChildEvents.length} events`);
          }
        } catch (error: any) {
          issues.push(`Exception testing child switch: ${error.message}`);
          allPassed = false;
        }
      } else {
        console.log('   ⏭️ Skipping child switch test (only 1 child)');
      }
    }
  } catch (error: any) {
    issues.push(`Exception fetching children: ${error.message}`);
    allPassed = false;
    return { passed: false, message: 'Exception during children fetch', issues, details };
  }

  // Verify no issues that would cause "Please select a child" error
  console.log('   Step 8: Verify no "Please select a child" scenarios...');
  const selectChildIssues: string[] = [];
  
  if (!details.firstChild?.id) {
    selectChildIssues.push('No first child ID available for auto-selection');
  }
  if (details.childrenCount === 0) {
    selectChildIssues.push('No children in family (would show "Please select a child")');
  }
  
  if (selectChildIssues.length > 0) {
    issues.push(...selectChildIssues);
    allPassed = false;
    console.log('   ❌ "Please select a child" error would occur');
  } else {
    console.log('   ✓ No "Please select a child" scenarios detected');
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Parent family load sequence working correctly' 
      : 'Parent family load sequence has issues',
    issues,
    details
  };
}

// ============================================================================
// FLOW-P0.2: Kid Mode Family Load Sequence
// ============================================================================

async function testKidFamilyLoadSequence(
  familyCode: string,
  childId: string,
  childPin: string,
  childName: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 FLOW-P0.2: Testing kid mode family load sequence...');

  // Step 1: Login as kid (verify PIN)
  console.log('   Step 1: Login as kid...');
  const loginResult = await loginKid(familyCode, childId, childPin);
  
  if (!loginResult) {
    issues.push('Kid login failed');
    allPassed = false;
    return {
      passed: false,
      message: 'Kid login failed - cannot test kid mode sequence',
      issues
    };
  }
  
  details.kidToken = loginResult.token.substring(0, 20) + '...';
  console.log(`   ✓ Kid logged in`);

  // Step 2: Verify kid token works (fetch kid dashboard data)
  console.log('   Step 2: Fetch kid dashboard data...');
  try {
    const dashboardResponse = await fetch(`${API_BASE}/kid/dashboard`, {
      method: 'GET',
      headers: getHeaders(loginResult.token)
    });
    
    if (!dashboardResponse.ok) {
      issues.push(`Kid dashboard fetch failed: ${dashboardResponse.status}`);
      allPassed = false;
      return { passed: false, message: 'Kid dashboard fetch failed', issues, details };
    }
    
    const dashboardData = await dashboardResponse.json();
    
    // Verify dashboard structure
    if (dashboardData.points === undefined) {
      issues.push('Dashboard missing points');
      allPassed = false;
    }
    
    if (!Array.isArray(dashboardData.quests)) {
      issues.push('Dashboard missing or invalid quests array');
      allPassed = false;
    }
    
    if (!Array.isArray(dashboardData.trackables)) {
      issues.push('Dashboard missing or invalid trackables array');
      allPassed = false;
    }
    
    details.points = dashboardData.points;
    details.questsCount = dashboardData.quests?.length || 0;
    details.trackablesCount = dashboardData.trackables?.length || 0;
    
    console.log(`   ✓ Dashboard loaded: ${dashboardData.points} points, ${details.questsCount} quests, ${details.trackablesCount} trackables`);
  } catch (error: any) {
    issues.push(`Exception fetching kid dashboard: ${error.message}`);
    allPassed = false;
    return { passed: false, message: 'Exception during kid dashboard fetch', issues, details };
  }

  // Step 3: Verify auto-selection (kid should see their own data, no "select child" UI)
  console.log('   Step 3: Verify kid auto-selection...');
  
  // In kid mode, the selectedChildId should automatically be the logged-in child
  // We verify this by checking the dashboard returns data (which means auto-selection worked)
  if (details.points !== undefined && details.questsCount !== undefined) {
    console.log(`   ✓ Kid sees their own data (auto-selection working)`);
  } else {
    issues.push('Kid dashboard incomplete - auto-selection may have failed');
    allPassed = false;
  }

  // Step 4: Verify family context data (fetch family info)
  console.log('   Step 4: Fetch family info for kid...');
  try {
    const familyResponse = await fetch(`${API_BASE}/kid/family`, {
      method: 'GET',
      headers: getHeaders(loginResult.token)
    });
    
    if (!familyResponse.ok) {
      issues.push(`Kid family fetch failed: ${familyResponse.status}`);
      allPassed = false;
    } else {
      const familyData = await familyResponse.json();
      
      if (!familyData.id) {
        issues.push('Kid family data missing id');
        allPassed = false;
      }
      
      if (!familyData.name) {
        issues.push('Kid family data missing name');
        allPassed = false;
      }
      
      details.familyId = familyData.id;
      details.familyName = familyData.name;
      
      console.log(`   ✓ Family loaded: ${familyData.name}`);
    }
  } catch (error: any) {
    issues.push(`Exception fetching kid family: ${error.message}`);
    allPassed = false;
  }

  // Step 5: Verify no "select a child" UI scenarios
  console.log('   Step 5: Verify no "select a child" scenarios for kid...');
  
  const selectChildIssues: string[] = [];
  
  // Kids should NEVER see "select a child" UI
  // They should automatically be viewing their own data
  if (details.points === undefined) {
    selectChildIssues.push('Kid cannot see points (may see "select a child" error)');
  }
  
  if (details.questsCount === undefined) {
    selectChildIssues.push('Kid cannot see quests (may see "select a child" error)');
  }
  
  if (selectChildIssues.length > 0) {
    issues.push(...selectChildIssues);
    allPassed = false;
    console.log('   ❌ Kid may see "select a child" UI (CRITICAL BUG)');
  } else {
    console.log('   ✓ Kid auto-selection working (no "select a child" UI)');
  }

  // Step 6: Verify kid session persistence
  console.log('   Step 6: Verify kid session data...');
  
  // Check localStorage for kid session markers
  const fgsKidMode = localStorage.getItem('fgs_kid_mode');
  const fgsFamilyId = localStorage.getItem('fgs_family_id');
  const fgsSelectedChildId = localStorage.getItem('fgs_selected_child_id');
  
  details.localStorage = {
    kidMode: fgsKidMode,
    familyId: fgsFamilyId,
    selectedChildId: fgsSelectedChildId
  };
  
  if (fgsKidMode !== 'true') {
    issues.push('Kid mode not set in localStorage (session may not persist)');
    allPassed = false;
  } else {
    console.log('   ✓ Kid mode flag set in localStorage');
  }
  
  if (!fgsFamilyId) {
    issues.push('Family ID not set in localStorage (may break on refresh)');
    allPassed = false;
  } else {
    console.log('   ✓ Family ID set in localStorage');
  }
  
  if (!fgsSelectedChildId) {
    issues.push('Selected child ID not set in localStorage (may show "select a child" on refresh)');
    allPassed = false;
  } else {
    console.log('   ✓ Selected child ID set in localStorage');
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Kid family load sequence working correctly' 
      : 'Kid family load sequence has issues',
    issues,
    details
  };
}

// ============================================================================
// MAIN DATA FLOWS AUDIT RUNNER
// ============================================================================

interface TestData {
  familyA?: {
    id: string;
    code: string;
  };
  parentA?: {
    email: string;
    password: string;
  };
  childA1?: {
    id: string;
    name: string;
    pin: string;
  };
}

export async function runDataFlowsAudit(existingTestData?: TestData) {
  console.log('🔍 ========================================');
  console.log('🔍 DATA FLOWS AUDIT (P0)');
  console.log('🔍 ========================================\n');

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 2,
      passed: 0,
      failed: 0,
      warnings: 0,
      skipped: 0
    }
  };

  // Check if we have test data
  let testData = existingTestData;
  
  if (!testData?.parentA?.email || !testData?.familyA?.code) {
    console.log('⚠️  No test data provided. Attempting to discover existing test data...\n');
    
    try {
      const { getOrDiscoverTestData } = await import('./discover-test-data');
      const discovered = await getOrDiscoverTestData();
      
      if (discovered && discovered.familyA && discovered.parentA) {
        testData = discovered;
        console.log('✅ Test data discovered successfully!\n');
      } else {
        console.log('❌ Could not discover test data.\n');
      }
    } catch (error: any) {
      console.log(`❌ Error discovering test data: ${error.message}\n`);
    }
  }
  
  if (!testData?.parentA?.email || !testData?.familyA?.code) {
    console.log('⚠️  No test data available. Skipping data flow tests.');
    console.log('   Use "Discover Test Data" or "Reset & Recreate" to setup test environment.\n');
    
    results.summary.skipped = 2;
    results.tests.push({
      id: 'FLOW-P0.1',
      category: 'Data Flows',
      name: 'Parent mode family load sequence',
      passed: false,
      message: 'Skipped - no test data',
      issues: ['Click "Discover Test Data" to find existing families, or "Reset & Recreate" to create new ones']
    });
    results.tests.push({
      id: 'FLOW-P0.2',
      category: 'Data Flows',
      name: 'Kid mode family load sequence',
      passed: false,
      message: 'Skipped - no test data',
      issues: ['Click "Discover Test Data" to find existing families, or "Reset & Recreate" to create new ones']
    });
    
    console.log('═'.repeat(60));
    console.log('📊 DATA FLOWS AUDIT SUMMARY (P0)');
    console.log('═'.repeat(60));
    console.log(`Total Tests:     ${results.summary.total}`);
    console.log(`⏭️  Skipped:      ${results.summary.skipped}`);
    console.log('═'.repeat(60) + '\n');
    
    return results;
  }

  // Test 1: Parent mode family load sequence
  console.log('');
  const parentResult = await testParentFamilyLoadSequence(
    testData.parentA.email,
    testData.parentA.password || 'TestPassword123!'
  );
  
  results.tests.push({
    id: 'FLOW-P0.1',
    category: 'Data Flows',
    name: 'Parent mode family load sequence',
    ...parentResult
  });
  
  if (parentResult.passed) results.summary.passed++;
  else results.summary.failed++;

  // Test 2: Kid mode family load sequence
  if (testData.childA1?.id && testData.childA1?.pin) {
    console.log('');
    const kidResult = await testKidFamilyLoadSequence(
      testData.familyA.code,
      testData.childA1.id,
      testData.childA1.pin,
      testData.childA1.name
    );
    
    results.tests.push({
      id: 'FLOW-P0.2',
      category: 'Data Flows',
      name: 'Kid mode family load sequence',
      ...kidResult
    });
    
    if (kidResult.passed) results.summary.passed++;
    else results.summary.failed++;
  } else {
    console.log('\n⚠️  No child test data - skipping kid mode test');
    results.summary.skipped++;
    results.tests.push({
      id: 'FLOW-P0.2',
      category: 'Data Flows',
      name: 'Kid mode family load sequence',
      passed: false,
      message: 'Skipped - no child test data',
      issues: []
    });
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 DATA FLOWS AUDIT SUMMARY (P0)');
  console.log('═'.repeat(60));
  console.log(`Total Tests:     ${results.summary.total}`);
  console.log(`✅ Passed:        ${results.summary.passed}`);
  console.log(`❌ Failed:        ${results.summary.failed}`);
  console.log(`⚠️  Warnings:     ${results.summary.warnings}`);
  console.log(`⏭️  Skipped:      ${results.summary.skipped}`);
  console.log('═'.repeat(60) + '\n');

  // Detailed results
  console.log('📋 DETAILED RESULTS:\n');
  
  for (const test of results.tests) {
    const icon = test.passed ? '✅' : (test.message.includes('Skipped') ? '⏭️' : '❌');
    console.log(`${icon} ${test.id}: ${test.name}`);
    console.log(`   ${test.message}`);
    
    if (test.issues && test.issues.length > 0) {
      console.log('   Issues:');
      test.issues.forEach((issue: string) => {
        console.log(`     - ${issue}`);
      });
    }
    
    if (test.details) {
      console.log('   Details:');
      Object.keys(test.details).forEach(key => {
        if (key !== 'localStorage' && test.details[key] !== undefined) {
          console.log(`     - ${key}: ${JSON.stringify(test.details[key])}`);
        }
      });
    }
    
    console.log('');
  }

  return results;
}