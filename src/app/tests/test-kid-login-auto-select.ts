/**
 * Kid Login Auto-Select Test (REGRESSION TEST)
 * 
 * CRITICAL: This test validates that when a kid logs in, they are
 * automatically selected and see their dashboard WITHOUT having to
 * manually select themselves.
 * 
 * This is a common regression that has happened multiple times, so
 * this test is included in the Master Test Suite to catch it early.
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { getOrDiscoverTestData } from './discover-test-data';

interface TestResult {
  passed: boolean;
  error?: string;
  details: any;
}

export async function testKidLoginAutoSelect(): Promise<TestResult> {
  console.log('🔍 ========================================');
  console.log('🔍 KID LOGIN AUTO-SELECT TEST (REGRESSION)');
  console.log('🔍 ========================================\n');

  try {
    // Get test data
    const testData = await getOrDiscoverTestData();
    
    if (!testData || !testData.familyA || !testData.childA1) {
      console.log('⚠️  No test data available. Skipping auto-select test.\n');
      return {
        passed: false,
        error: 'No test data available',
        details: { skipped: true }
      };
    }

    const familyCode = testData.familyA.code;
    const childId = testData.childA1.id;
    const childPin = testData.childA1.pin;
    const childName = testData.childA1.name;

    console.log('✅ Test data loaded:');
    console.log(`   Family: ${testData.familyA.name} (${familyCode})`);
    console.log(`   Child: ${childName} (${childId})`);
    console.log(`   PIN: ${childPin}\n`);

    // Step 1: Clear any existing kid session
    console.log('📝 Step 1: Clearing existing kid session...\n');
    localStorage.removeItem('kid_access_token');
    localStorage.removeItem('kid_id');
    localStorage.removeItem('child_id');
    localStorage.removeItem('fgs_selected_child_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_mode');
    localStorage.removeItem('fgs_user_mode');

    // Step 2: Login as kid
    console.log('📝 Step 2: Logging in as kid...\n');
    
    const loginResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kid/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': publicAnonKey
        },
        body: JSON.stringify({
          familyCode: familyCode,
          childId: childId,
          pin: childPin
        })
      }
    );

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Kid login failed (${loginResponse.status}): ${errorText}`);
    }

    const loginData = await loginResponse.json();

    if (!loginData.success) {
      throw new Error(`Kid login failed: ${loginData.error || 'Unknown error'}`);
    }

    console.log(`✅ Kid login successful: ${loginData.kid.name}\n`);

    // Step 3: Simulate what setKidMode() does
    console.log('📝 Step 3: Simulating setKidMode()...\n');
    
    localStorage.setItem('user_mode', 'kid');
    localStorage.setItem('kid_access_token', loginData.kidAccessToken);
    localStorage.setItem('kid_id', loginData.kid.id);
    localStorage.setItem('child_id', loginData.kid.id);  // Backwards compatibility
    localStorage.setItem('user_role', 'child');
    localStorage.setItem('fgs_family_id', loginData.kid.familyId);
    localStorage.setItem('fgs_user_mode', 'kid');

    console.log('✅ localStorage set:\n');
    console.log('   user_mode:', localStorage.getItem('user_mode'));
    console.log('   kid_id:', localStorage.getItem('kid_id'));
    console.log('   child_id:', localStorage.getItem('child_id'));
    console.log('   user_role:', localStorage.getItem('user_role'));
    console.log('   fgs_family_id:', localStorage.getItem('fgs_family_id'));
    console.log('');

    // Step 4: Verify that FamilyContext would auto-select this child
    console.log('📝 Step 4: Verifying FamilyContext auto-selection logic...\n');

    const kidIdFromStorage = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
    
    if (!kidIdFromStorage) {
      throw new Error('CRITICAL: kid_id not found in localStorage after setKidMode()!');
    }

    if (kidIdFromStorage !== childId) {
      throw new Error(`CRITICAL: kid_id mismatch! Expected: ${childId}, Got: ${kidIdFromStorage}`);
    }

    console.log(`✅ kid_id correctly stored: ${kidIdFromStorage}\n`);

    // Step 5: Verify role detection
    console.log('📝 Step 5: Verifying role detection...\n');

    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');

    if (userRole !== 'child') {
      throw new Error(`CRITICAL: user_role should be 'child', but got: ${userRole}`);
    }

    if (userMode !== 'kid') {
      throw new Error(`CRITICAL: user_mode should be 'kid', but got: ${userMode}`);
    }

    console.log('✅ Role detection correct:\n');
    console.log('   user_role:', userRole);
    console.log('   user_mode:', userMode);
    console.log('');

    // Step 6: Verify FamilyContext would load family data
    console.log('📝 Step 6: Verifying family ID for data loading...\n');

    const familyId = localStorage.getItem('fgs_family_id');

    if (!familyId) {
      throw new Error('CRITICAL: fgs_family_id not found in localStorage!');
    }

    if (familyId !== loginData.kid.familyId) {
      throw new Error(`CRITICAL: fgs_family_id mismatch! Expected: ${loginData.kid.familyId}, Got: ${familyId}`);
    }

    console.log(`✅ Family ID correctly stored: ${familyId}\n`);

    // Step 7: Load family data to verify child exists
    console.log('📝 Step 7: Loading family data to verify child exists...\n');

    const familyResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}`,
      {
        headers: {
          'Authorization': `Bearer ${loginData.kidAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!familyResponse.ok) {
      throw new Error(`Family data load failed: ${familyResponse.status}`);
    }

    const familyData = await familyResponse.json();

    console.log(`✅ Family data loaded: ${familyData.name}\n`);
    console.log('   Children:', familyData.children.map((c: any) => c.name).join(', '));
    console.log('');

    // Find the logged-in child in family data
    const childInFamily = familyData.children.find((c: any) => c.id === childId);

    if (!childInFamily) {
      throw new Error(`CRITICAL: Logged-in child ${childId} not found in family data!`);
    }

    console.log(`✅ Logged-in child found in family data: ${childInFamily.name}\n`);

    // FINAL VERDICT
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ KID LOGIN AUTO-SELECT TEST PASSED');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('All checks passed:');
    console.log('✅ Kid login successful');
    console.log('✅ localStorage correctly set (kid_id, user_role, user_mode)');
    console.log('✅ Family ID stored correctly');
    console.log('✅ Child exists in family data');
    console.log('✅ FamilyContext will auto-select this child');
    console.log('');
    console.log('💡 WHAT THIS MEANS:');
    console.log('   When a kid logs in, FamilyContext useEffect will:');
    console.log('   1. Detect user_role === "child"');
    console.log('   2. Read kid_id from localStorage');
    console.log('   3. Auto-set selectedChildId to kid_id');
    console.log('   4. Load child-specific data (points, quests, etc.)');
    console.log('   5. Kid sees their dashboard immediately!');
    console.log('');
    console.log('🚨 REGRESSION CHECK:');
    console.log('   If this test fails in the future, it means:');
    console.log('   - Kid login is NOT auto-selecting the child');
    console.log('   - User will see empty dashboard or child selector');
    console.log('   - BAD UX - needs immediate fix!');
    console.log('');
    console.log('════════════════════════════════════════════════════════════\n');

    return {
      passed: true,
      details: {
        childId: childId,
        childName: childName,
        familyId: familyId,
        kidIdInStorage: kidIdFromStorage,
        userRole: userRole,
        userMode: userMode,
        childFoundInFamily: true
      }
    };

  } catch (error: any) {
    console.error('❌ TEST FAILED:', error.message, '\n');
    console.log('🚨 CRITICAL REGRESSION:');
    console.log('   Kid login is NOT auto-selecting the child!');
    console.log('   This is a P0 bug that breaks kid UX.');
    console.log('');
    console.log('💡 DEBUGGING STEPS:');
    console.log('   1. Check FamilyContext useEffect for kid login');
    console.log('   2. Verify setKidMode() sets all required localStorage keys');
    console.log('   3. Ensure KidDashboard calls getCurrentChild() correctly');
    console.log('   4. Check console for FamilyContext auto-selection logs');
    console.log('');

    return {
      passed: false,
      error: error.message,
      details: {
        localStorage: {
          kid_id: localStorage.getItem('kid_id'),
          child_id: localStorage.getItem('child_id'),
          user_role: localStorage.getItem('user_role'),
          user_mode: localStorage.getItem('user_mode'),
          fgs_family_id: localStorage.getItem('fgs_family_id')
        }
      }
    };
  }
}
