/**
 * Test Environment Audit
 * 
 * Audits test environment to verify:
 * - Invite codes map correctly to familyId
 * - Kid PINs are hashed server-side
 * - Family isolation
 * - Data integrity
 * 
 * Usage in browser console:
 * import('/src/tests/audit-test-environment').then(m => m.auditTestEnvironment())
 */

import { supabase } from '../../utils/supabase/client';
import { projectId } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface AuditResult {
  category: string;
  testName: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

const results: AuditResult[] = [];

function logResult(category: string, testName: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: any) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${emoji} [${category}] ${testName}: ${message}`);
  if (details) {
    console.log('   Details:', details);
  }
  results.push({ category, testName, status, message, details });
}

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

// ============================================
// TD-1.1: TEST FAMILIES
// ============================================

async function auditInviteCodeMapping(familyId: string, expectedInviteCode: string, familyName: string): Promise<void> {
  const category = 'TD-1.1';
  const testName = `Invite Code Mapping - ${familyName}`;

  try {
    const token = await getAuthToken();
    
    // Fetch family data
    const response = await fetch(`${API_BASE}/families/${familyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      logResult(category, testName, 'FAIL', 'Failed to fetch family');
      return;
    }

    const family = await response.json();

    // Check invite code exists
    if (!family.inviteCode) {
      logResult(category, testName, 'FAIL', 'Family has no invite code');
      return;
    }

    // Check invite code matches
    if (family.inviteCode !== expectedInviteCode) {
      logResult(
        category,
        testName,
        'FAIL',
        `Invite code mismatch`,
        { expected: expectedInviteCode, actual: family.inviteCode }
      );
      return;
    }

    // Check invite code format (6 alphanumeric characters)
    const inviteCodeRegex = /^[A-Z0-9]{6}$/;
    if (!inviteCodeRegex.test(family.inviteCode)) {
      logResult(
        category,
        testName,
        'WARN',
        'Invite code format unexpected',
        { inviteCode: family.inviteCode, expectedFormat: 'ABC123' }
      );
      return;
    }

    // Success
    logResult(
      category,
      testName,
      'PASS',
      `Invite code ${family.inviteCode} maps to ${familyId}`,
      { inviteCode: family.inviteCode, familyId }
    );
  } catch (error) {
    logResult(category, testName, 'FAIL', String(error));
  }
}

async function auditKidPINHashing(childId: string, expectedPin: string, childName: string): Promise<void> {
  const category = 'TD-1.1';
  const testName = `PIN Hashing - ${childName}`;

  try {
    const token = await getAuthToken();
    
    // Fetch child data
    const response = await fetch(`${API_BASE}/children/${childId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      logResult(category, testName, 'FAIL', 'Failed to fetch child');
      return;
    }

    const child = await response.json();

    // Check if PIN is exposed (SECURITY ISSUE)
    if (child.pin && child.pin === expectedPin) {
      logResult(
        category,
        testName,
        'FAIL',
        '🚨 SECURITY ISSUE: Plain PIN exposed in API response!',
        { exposedPin: child.pin }
      );
      return;
    }

    // Check if pinHash exists
    if (!child.pinHash) {
      logResult(category, testName, 'FAIL', 'Child has no pinHash field');
      return;
    }

    // Verify pinHash is actually hashed (not plain text)
    if (child.pinHash === expectedPin) {
      logResult(
        category,
        testName,
        'FAIL',
        'pinHash is plain text (not hashed)',
        { pinHash: child.pinHash }
      );
      return;
    }

    // Verify pinHash format (should be SHA-256 hex: 64 characters)
    const sha256Regex = /^[a-f0-9]{64}$/;
    if (!sha256Regex.test(child.pinHash)) {
      logResult(
        category,
        testName,
        'WARN',
        'pinHash format unexpected (not SHA-256)',
        { pinHash: child.pinHash, length: child.pinHash.length }
      );
      return;
    }

    // Verify PIN by computing hash
    const encoder = new TextEncoder();
    const data = encoder.encode(expectedPin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (child.pinHash !== computedHash) {
      logResult(
        category,
        testName,
        'FAIL',
        'pinHash does not match expected hash',
        { stored: child.pinHash, computed: computedHash }
      );
      return;
    }

    // Success
    logResult(
      category,
      testName,
      'PASS',
      `PIN correctly hashed (SHA-256)`,
      { pinHash: child.pinHash.substring(0, 16) + '...' }
    );
  } catch (error) {
    logResult(category, testName, 'FAIL', String(error));
  }
}

async function auditFamilyStructure(familyId: string, expectedParents: number, expectedChildren: number, familyName: string): Promise<void> {
  const category = 'TD-1.1';
  const testName = `Family Structure - ${familyName}`;

  try {
    const token = await getAuthToken();
    
    // Fetch family data
    const familyRes = await fetch(`${API_BASE}/families/${familyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!familyRes.ok) {
      logResult(category, testName, 'FAIL', 'Failed to fetch family');
      return;
    }

    const family = await familyRes.json();

    // Fetch children
    const childrenRes = await fetch(`${API_BASE}/families/${familyId}/children`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!childrenRes.ok) {
      logResult(category, testName, 'FAIL', 'Failed to fetch children');
      return;
    }

    const children = await childrenRes.json();

    // Check children count
    if (children.length !== expectedChildren) {
      logResult(
        category,
        testName,
        'FAIL',
        `Wrong number of children`,
        { expected: expectedChildren, actual: children.length }
      );
      return;
    }

    // Check parent count (from family.parentIds)
    const actualParents = family.parentIds ? family.parentIds.length : 0;
    if (actualParents !== expectedParents) {
      logResult(
        category,
        testName,
        'WARN',
        `Parent count mismatch`,
        { expected: expectedParents, actual: actualParents }
      );
    }

    // Success
    logResult(
      category,
      testName,
      'PASS',
      `Structure correct: ${actualParents} parent(s), ${children.length} child(ren)`
    );
  } catch (error) {
    logResult(category, testName, 'FAIL', String(error));
  }
}

// ============================================
// CROSS-FAMILY ISOLATION AUDIT
// ============================================

async function auditCrossFamilyIsolation(familyAId: string, familyBId: string): Promise<void> {
  const category = 'Security';
  const testName = 'Cross-Family Isolation';

  try {
    const token = await getAuthToken();
    
    // Try to access Family B's children from Family A's session
    const response = await fetch(`${API_BASE}/families/${familyBId}/children`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Should fail with 403
    if (response.ok) {
      logResult(
        category,
        testName,
        'FAIL',
        '🚨 SECURITY ISSUE: Can access other family\'s data!',
        { attemptedFamilyId: familyBId }
      );
      return;
    }

    if (response.status !== 403) {
      logResult(
        category,
        testName,
        'WARN',
        `Expected 403, got ${response.status}`,
        { status: response.status }
      );
      return;
    }

    // Success
    logResult(
      category,
      testName,
      'PASS',
      'Cross-family access correctly blocked (403)'
    );
  } catch (error) {
    logResult(category, testName, 'FAIL', String(error));
  }
}

// ============================================
// INVITE CODE UNIQUENESS
// ============================================

async function auditInviteCodeUniqueness(familyACode: string, familyBCode: string): Promise<void> {
  const category = 'TD-1.1';
  const testName = 'Invite Code Uniqueness';

  if (familyACode === familyBCode) {
    logResult(
      category,
      testName,
      'FAIL',
      '🚨 CRITICAL: Families have identical invite codes!',
      { familyACode, familyBCode }
    );
    return;
  }

  logResult(
    category,
    testName,
    'PASS',
    'Invite codes are unique',
    { familyA: familyACode, familyB: familyBCode }
  );
}

// ============================================
// DATA INTEGRITY CHECKS
// ============================================

async function auditDataIntegrity(familyId: string, familyName: string): Promise<void> {
  const category = 'Integrity';
  const testName = `Data Integrity - ${familyName}`;

  try {
    const token = await getAuthToken();
    
    // Fetch family
    const familyRes = await fetch(`${API_BASE}/families/${familyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const family = await familyRes.json();

    // Fetch children
    const childrenRes = await fetch(`${API_BASE}/families/${familyId}/children`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const children = await childrenRes.json();

    const issues: string[] = [];

    // Check family has required fields
    if (!family.id) issues.push('Missing family.id');
    if (!family.name) issues.push('Missing family.name');
    if (!family.inviteCode) issues.push('Missing family.inviteCode');
    if (!family.createdAt) issues.push('Missing family.createdAt');

    // Check each child has required fields
    for (const child of children) {
      if (!child.id) issues.push(`Child missing id`);
      if (!child.name) issues.push(`Child ${child.id} missing name`);
      if (!child.pinHash) issues.push(`Child ${child.id} missing pinHash`);
      if (!child.familyId) issues.push(`Child ${child.id} missing familyId`);
      if (child.familyId !== familyId) issues.push(`Child ${child.id} has wrong familyId`);
      if (child.currentPoints === undefined) issues.push(`Child ${child.id} missing currentPoints`);
    }

    if (issues.length > 0) {
      logResult(
        category,
        testName,
        'FAIL',
        `${issues.length} integrity issue(s) found`,
        { issues }
      );
      return;
    }

    logResult(
      category,
      testName,
      'PASS',
      'All required fields present and valid'
    );
  } catch (error) {
    logResult(category, testName, 'FAIL', String(error));
  }
}

// ============================================
// MAIN AUDIT FUNCTION
// ============================================

export async function auditTestEnvironment(): Promise<any> {
  console.log('🔍 ========================================');
  console.log('🔍 TEST ENVIRONMENT AUDIT');
  console.log('🔍 ========================================\n');

  const startTime = Date.now();
  results.length = 0;

  try {
    // Get test environment
    const envStr = localStorage.getItem('fgs_test_environment');
    if (!envStr) {
      console.log('❌ No test environment found');
      console.log('Run: await setupTestEnvironment()\n');
      return;
    }

    const env = JSON.parse(envStr);

    console.log('📋 Test Environment:\n');
    console.log(`   Setup: ${new Date(env.setupTimestamp).toLocaleString()}`);
    console.log(`   Family A: ${env.familyA.familyId}`);
    console.log(`   Family B: ${env.familyB.familyId}\n`);

    // Sign in as Family A Parent
    console.log('🔐 Signing in as Family A Parent 1...\n');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: env.familyA.parents[0].email,
      password: env.familyA.parents[0].password
    });

    if (signInError) {
      console.error('❌ Failed to sign in:', signInError.message);
      return;
    }

    // Wait for session to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // TD-1.1: Test Families
    console.log('📋 TD-1.1: TEST FAMILIES\n');

    // Audit invite code mappings
    await auditInviteCodeMapping(
      env.familyA.familyId,
      env.familyA.inviteCode,
      'Family A'
    );
    await auditInviteCodeMapping(
      env.familyB.familyId,
      env.familyB.inviteCode,
      'Family B'
    );

    console.log('');

    // Audit invite code uniqueness
    await auditInviteCodeUniqueness(
      env.familyA.inviteCode,
      env.familyB.inviteCode
    );

    console.log('');

    // Audit kid PIN hashing
    for (const child of env.familyA.children) {
      await auditKidPINHashing(child.childId, child.pin, child.name);
    }
    for (const child of env.familyB.children) {
      await auditKidPINHashing(child.childId, child.pin, child.name);
    }

    console.log('');

    // Audit family structures
    await auditFamilyStructure(
      env.familyA.familyId,
      env.familyA.parents.length,
      env.familyA.children.length,
      'Family A'
    );
    await auditFamilyStructure(
      env.familyB.familyId,
      env.familyB.parents.length,
      env.familyB.children.length,
      'Family B'
    );

    console.log('\n📋 SECURITY CHECKS\n');

    // Audit cross-family isolation
    await auditCrossFamilyIsolation(
      env.familyA.familyId,
      env.familyB.familyId
    );

    console.log('\n📋 DATA INTEGRITY\n');

    // Audit data integrity
    await auditDataIntegrity(env.familyA.familyId, 'Family A');
    await auditDataIntegrity(env.familyB.familyId, 'Family B');

    // Summary
    const duration = Date.now() - startTime;
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warnings = results.filter(r => r.status === 'WARN').length;

    console.log('\n🔍 ========================================');
    console.log('🔍 AUDIT SUMMARY');
    console.log('🔍 ========================================\n');
    
    console.log(`✅ PASSED:   ${passed}`);
    console.log(`❌ FAILED:   ${failed}`);
    console.log(`⚠️  WARNINGS: ${warnings}`);
    console.log(`⏱️  TIME:     ${duration}ms\n`);

    if (failed === 0 && warnings === 0) {
      console.log('🎉 ALL AUDIT CHECKS PASSED!\n');
      console.log('✅ Test environment is correctly configured');
      console.log('✅ Invite codes map to correct families');
      console.log('✅ PINs are properly hashed');
      console.log('✅ Cross-family isolation working');
      console.log('✅ Data integrity verified\n');
    } else if (failed === 0) {
      console.log('⚠️  ALL CRITICAL CHECKS PASSED (with warnings)\n');
      console.log('Review warnings above for non-critical issues.\n');
    } else {
      console.log('❌ AUDIT FAILED - Critical issues found!\n');
      console.log('Review failures above and fix before testing.\n');
    }

    return {
      passed,
      failed,
      warnings,
      total: results.length,
      duration,
      results
    };
  } catch (error) {
    console.error('❌ Audit failed:', error);
    return {
      passed: 0,
      failed: 1,
      warnings: 0,
      total: 1,
      duration: Date.now() - startTime,
      results: [{ category: 'Setup', testName: 'Audit', status: 'FAIL', message: String(error) }]
    };
  }
}

// ============================================
// EXPORT FOR GLOBAL ACCESS
// ============================================

(window as any).auditTestEnvironment = auditTestEnvironment;

console.log('✅ Test environment audit loaded!');
console.log('📝 Run: await auditTestEnvironment()');
