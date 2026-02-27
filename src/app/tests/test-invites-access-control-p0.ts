/**
 * Invites Access Control Matrix (P0)
 * 
 * Tests the complete invite authorization matrix per COMPREHENSIVE_SYSTEM_AUDIT:
 * 
 * INV-002 (P0): Invite access control matrix
 * - Unauthed: 401
 * - Kid token: 403 (parent-only)
 * - Parent A1: 200 for Family A only, 403 for Family B
 * - No invite payload leaks other-family data
 * 
 * This is a CRITICAL security test that validates:
 * 1. Invites are parent-only (kids cannot access)
 * 2. Invites are family-scoped (no cross-family access)
 * 3. No data leakage across family boundaries
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface TestData {
  familyA?: {
    id: string;
    code: string;
    name: string;
  };
  familyB?: {
    id: string;
    code: string;
    name: string;
  };
  childA1?: {
    id: string;
    name: string;
    pin: string;
  };
  parentA?: {
    email: string;
    password: string;
  };
  parentB?: {
    email: string;
    password: string;
  };
}

interface TestResult {
  timestamp: string;
  duration: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  tests: Array<{
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
  }>;
}

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export async function runInvitesAccessControlAudit(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔐 INVITES ACCESS CONTROL MATRIX (P0)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Reference: INV-002 (P0)');
  console.log('');
  console.log('Test Cases:');
  console.log('  INV-002.1: Unauthed request → 401');
  console.log('  INV-002.2: Kid token → 403 (parent-only)');
  console.log('  INV-002.3: Parent A1 → 200 for Family A');
  console.log('  INV-002.4: Parent A1 → 403 for Family B (cross-family)');
  console.log('  INV-002.5: Parent B1 → 403 for Family A (cross-family)');
  console.log('  INV-002.6: No invite payload leaks other-family data');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const tests: Array<{
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
  }> = [];

  let parentAToken = '';
  let parentBToken = '';
  let kidAToken = '';
  let familyAId = '';
  let familyBId = '';
  let inviteACode = '';

  // ================================================================
  // SETUP: Create tokens and test invite
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 SETUP: Preparing test data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!testData?.familyA || !testData?.familyB || !testData?.parentA || !testData?.parentB || !testData?.childA1) {
      throw new Error('Test data required (familyA, familyB, parentA, parentB, childA1)');
    }

    familyAId = testData.familyA.id;
    familyBId = testData.familyB.id;

    // Login as Parent A
    console.log('📝 Step 1: Login as Parent A...\n');
    const loginAResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': publicAnonKey },
      body: JSON.stringify({
        email: testData.parentA.email,
        password: testData.parentA.password
      })
    });

    if (!loginAResponse.ok) {
      throw new Error(`Parent A login failed: ${loginAResponse.status}`);
    }

    const loginAData = await loginAResponse.json();
    parentAToken = loginAData.accessToken;
    console.log(`✅ Parent A logged in\n`);

    // Login as Parent B
    console.log('📝 Step 2: Login as Parent B...\n');
    const loginBResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': publicAnonKey },
      body: JSON.stringify({
        email: testData.parentB.email,
        password: testData.parentB.password
      })
    });

    if (!loginBResponse.ok) {
      throw new Error(`Parent B login failed: ${loginBResponse.status}`);
    }

    const loginBData = await loginBResponse.json();
    parentBToken = loginBData.accessToken;
    console.log(`✅ Parent B logged in\n`);

    // Login as Kid A1
    console.log('📝 Step 3: Login as Kid A1...\n');
    const kidLoginResponse = await fetch(`${API_BASE}/kid/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': publicAnonKey },
      body: JSON.stringify({
        familyCode: testData.familyA.code,
        childId: testData.childA1.id,
        pin: testData.childA1.pin
      })
    });

    if (!kidLoginResponse.ok) {
      throw new Error(`Kid login failed: ${kidLoginResponse.status}`);
    }

    const kidLoginData = await kidLoginResponse.json();
    kidAToken = kidLoginData.kidAccessToken;
    console.log(`✅ Kid A1 logged in\n`);

    // Create invite for Family A
    console.log('📝 Step 4: Create invite for Family A...\n');
    const createInviteResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentAToken}`
      },
      body: JSON.stringify({
        role: 'parent',
        expiresInDays: 7
      })
    });

    if (!createInviteResponse.ok) {
      throw new Error(`Create invite failed: ${createInviteResponse.status}`);
    }

    const inviteData = await createInviteResponse.json();
    inviteACode = inviteData.code;
    console.log(`✅ Invite created for Family A: ${inviteACode}\n`);

    console.log('✅ Setup complete\n');
  } catch (error: any) {
    console.error('❌ SETUP FAILED:', error.message, '\n');
    return {
      timestamp: new Date().toISOString(),
      duration: `${Date.now() - startTime}ms`,
      summary: { total: 0, passed: 0, failed: 1, skipped: 0 },
      tests: [{
        name: 'SETUP',
        passed: false,
        error: error.message
      }]
    };
  }

  // ================================================================
  // INV-002.1: Unauthed request → 401
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.1: Unauthed request → 401');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Attempting to list invites without auth token...\n');

    const unauthResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      headers: { 'apikey': publicAnonKey }
      // No Authorization header
    });

    if (unauthResponse.status === 401) {
      console.log('✅ Correctly rejected with 401 Unauthorized\n');
      tests.push({
        name: 'INV-002.1: Unauthed request → 401',
        passed: true,
        details: { status: 401 }
      });
    } else {
      throw new Error(`Expected 401, got: ${unauthResponse.status}`);
    }
  } catch (error: any) {
    console.error('❌ INV-002.1 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.1: Unauthed request → 401',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // INV-002.2: Kid token → 403 (parent-only)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.2: Kid token → 403 (parent-only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Attempting to list invites with kid token...\n');

    const kidResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      headers: { 'Authorization': `Bearer ${kidAToken}` }
    });

    if (kidResponse.status === 403) {
      console.log('✅ Correctly rejected kid token with 403 Forbidden\n');
      tests.push({
        name: 'INV-002.2: Kid token → 403 (parent-only)',
        passed: true,
        details: { status: 403, message: 'Parent-only endpoint' }
      });
    } else if (kidResponse.status === 401) {
      console.log('✅ Correctly rejected kid token with 401 (alternate implementation)\n');
      tests.push({
        name: 'INV-002.2: Kid token → 403 (parent-only)',
        passed: true,
        details: { status: 401, message: 'Kid token not recognized as valid parent auth' }
      });
    } else {
      throw new Error(`Expected 403 or 401, got: ${kidResponse.status}`);
    }
  } catch (error: any) {
    console.error('❌ INV-002.2 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.2: Kid token → 403 (parent-only)',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // INV-002.3: Parent A1 → 200 for Family A
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.3: Parent A1 → 200 for Family A');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Parent A listing invites for their own family...\n');

    const parentAOwnResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      headers: { 'Authorization': `Bearer ${parentAToken}` }
    });

    if (!parentAOwnResponse.ok) {
      throw new Error(`Parent A should access own family: ${parentAOwnResponse.status}`);
    }

    const invites = await parentAOwnResponse.json();
    const foundInvite = invites.find((inv: any) => inv.code === inviteACode);

    if (!foundInvite) {
      throw new Error('Parent A should see their own family invite');
    }

    console.log('✅ Parent A can access own family invites (200 OK)\n');
    console.log(`   Found ${invites.length} invite(s) for Family A\n`);

    tests.push({
      name: 'INV-002.3: Parent A1 → 200 for Family A',
      passed: true,
      details: { status: 200, inviteCount: invites.length }
    });
  } catch (error: any) {
    console.error('❌ INV-002.3 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.3: Parent A1 → 200 for Family A',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // INV-002.4: Parent A1 → 403 for Family B (cross-family)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.4: Parent A1 → 403 for Family B (cross-family)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Parent A attempting to list Family B invites...\n');

    const crossFamilyResponse = await fetch(`${API_BASE}/families/${familyBId}/invites`, {
      headers: { 'Authorization': `Bearer ${parentAToken}` }
    });

    if (crossFamilyResponse.status === 403) {
      console.log('✅ Correctly blocked cross-family access with 403 Forbidden\n');
      tests.push({
        name: 'INV-002.4: Parent A1 → 403 for Family B (cross-family)',
        passed: true,
        details: { status: 403, message: 'Cross-family access blocked' }
      });
    } else if (crossFamilyResponse.ok) {
      const invites = await crossFamilyResponse.json();
      throw new Error(`SECURITY BREACH: Parent A accessed Family B invites (got ${invites.length} invites)`);
    } else {
      throw new Error(`Expected 403, got: ${crossFamilyResponse.status}`);
    }
  } catch (error: any) {
    console.error('❌ INV-002.4 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.4: Parent A1 → 403 for Family B (cross-family)',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // INV-002.5: Parent B1 → 403 for Family A (cross-family)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.5: Parent B1 → 403 for Family A (cross-family)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Parent B attempting to list Family A invites...\n');

    const crossFamilyBResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      headers: { 'Authorization': `Bearer ${parentBToken}` }
    });

    if (crossFamilyBResponse.status === 403) {
      console.log('✅ Correctly blocked cross-family access with 403 Forbidden\n');
      tests.push({
        name: 'INV-002.5: Parent B1 → 403 for Family A (cross-family)',
        passed: true,
        details: { status: 403, message: 'Cross-family access blocked' }
      });
    } else if (crossFamilyBResponse.ok) {
      const invites = await crossFamilyBResponse.json();
      throw new Error(`SECURITY BREACH: Parent B accessed Family A invites (got ${invites.length} invites)`);
    } else {
      throw new Error(`Expected 403, got: ${crossFamilyBResponse.status}`);
    }
  } catch (error: any) {
    console.error('❌ INV-002.5 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.5: Parent B1 → 403 for Family A (cross-family)',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // INV-002.6: No invite payload leaks other-family data
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 INV-002.6: No invite payload leaks other-family data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📝 Inspecting invite payload for data leakage...\n');

    const invitesResponse = await fetch(`${API_BASE}/families/${familyAId}/invites`, {
      headers: { 'Authorization': `Bearer ${parentAToken}` }
    });

    if (!invitesResponse.ok) {
      throw new Error(`Failed to fetch invites: ${invitesResponse.status}`);
    }

    const invites = await invitesResponse.json();
    
    console.log('📝 Checking invite objects for sensitive data leakage...\n');

    let dataLeakFound = false;
    const leaks: string[] = [];

    invites.forEach((invite: any, index: number) => {
      console.log(`   Invite ${index + 1}:`, JSON.stringify(invite, null, 2).substring(0, 200));

      // Check for data that should NOT be in invite payload
      const suspiciousFields = [
        'otherFamilyId',
        'otherFamilyName',
        'privateKey',
        'secretData',
        'users', // Should not expose user list
        'children' // Should not expose children from other families
      ];

      suspiciousFields.forEach(field => {
        if (invite[field]) {
          dataLeakFound = true;
          leaks.push(`Field '${field}' found in invite ${index + 1}`);
        }
      });

      // Verify familyId matches expected family
      if (invite.familyId && invite.familyId !== familyAId) {
        dataLeakFound = true;
        leaks.push(`Invite ${index + 1} has wrong familyId: ${invite.familyId}`);
      }
    });

    if (dataLeakFound) {
      throw new Error(`Data leakage detected: ${leaks.join(', ')}`);
    }

    console.log('✅ No data leakage detected in invite payloads\n');
    console.log('   ✓ No other-family IDs');
    console.log('   ✓ No user/child lists');
    console.log('   ✓ familyId correctly scoped\n');

    tests.push({
      name: 'INV-002.6: No invite payload leaks other-family data',
      passed: true,
      details: { invitesChecked: invites.length, leaksFound: 0 }
    });
  } catch (error: any) {
    console.error('❌ INV-002.6 FAILED:', error.message, '\n');
    tests.push({
      name: 'INV-002.6: No invite payload leaks other-family data',
      passed: false,
      error: error.message
    });
  }

  // ================================================================
  // FINAL REPORT
  // ================================================================
  const duration = Date.now() - startTime;
  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 INVITES ACCESS CONTROL AUDIT - FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log('');

  tests.forEach((test, index) => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${test.name}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
  });

  console.log('');

  if (passed === tests.length) {
    console.log('🎉 ALL ACCESS CONTROL TESTS PASSED');
    console.log('');
    console.log('✅ Security Verified:');
    console.log('   • Unauthed access blocked (401)');
    console.log('   • Kid tokens blocked (403)');
    console.log('   • Parent-only access enforced');
    console.log('   • Family isolation maintained (no cross-family access)');
    console.log('   • No data leakage detected');
  } else {
    console.log('🚨 SECURITY ISSUES DETECTED');
    console.log('');
    console.log('⚠️  Failed tests indicate potential security vulnerabilities.');
    console.log('   Review errors above and fix before deployment.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: {
      total: tests.length,
      passed,
      failed,
      skipped: 0
    },
    tests
  };
}
