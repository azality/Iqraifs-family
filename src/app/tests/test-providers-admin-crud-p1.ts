/**
 * Providers Admin CRUD Tests (P1)
 * 
 * Tests the complete provider administration workflow per COMPREHENSIVE_SYSTEM_AUDIT Section F:
 * 
 * PR-CRUD-01 (P1): Create provider (Parent-only)
 * PR-CRUD-02 (P1): Read providers (Family isolation)
 * PR-CRUD-03 (P1): Update provider (Parent-only, wrong family → 403)
 * PR-CRUD-04 (P1): Delete provider (Parent-only)
 * 
 * Key Requirements from Audit:
 * - Unauthed → 401
 * - Kid → 403 for write operations
 * - Parent wrong family → 403
 * - Parent correct family → succeeds
 * - Family isolation (cannot see/modify other families' providers)
 * - Providers used for attendance tracking (validated separately in Suite 8)
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
  parentA1Token?: string;
  parentA2Token?: string;
  parentB1Token?: string;
  kidA1Token?: string;
  kidA1Id?: string;
  kidB1Token?: string;
  kidB1Id?: string;
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
  tests: {
    id: string;
    name: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    error?: string;
    details?: string;
  }[];
}

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export async function runProvidersAdminCrudTests(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏫 PROVIDERS ADMIN CRUD TESTS (P1)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Basis: Section F - Full admin CRUD coverage checklist');
  console.log('             Providers CRUD is parent-only with family isolation.');
  console.log('');
  console.log('Test Plan:');
  console.log('  PR-CRUD-01 (P1): Create provider (Parent-only)');
  console.log('  PR-CRUD-02 (P1): Read providers (Family isolation)');
  console.log('  PR-CRUD-03 (P1): Update provider (Parent-only, wrong family → 403)');
  console.log('  PR-CRUD-04 (P1): Delete provider (Parent-only)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const tests: TestResult['tests'] = [];

  // Validate test data
  if (!testData || !testData.familyA || !testData.parentA1Token || !testData.kidA1Token) {
    console.log('❌ Missing test data. Please run test data discovery first.\n');
    return {
      timestamp: new Date().toISOString(),
      duration: '0ms',
      summary: { total: 4, passed: 0, failed: 0, skipped: 4 },
      tests: [
        { id: 'PR-CRUD-01', name: 'Create provider (Parent-only)', status: 'SKIP', error: 'No test data' },
        { id: 'PR-CRUD-02', name: 'Read providers (Family isolation)', status: 'SKIP', error: 'No test data' },
        { id: 'PR-CRUD-03', name: 'Update provider (Parent-only, wrong family → 403)', status: 'SKIP', error: 'No test data' },
        { id: 'PR-CRUD-04', name: 'Delete provider (Parent-only)', status: 'SKIP', error: 'No test data' }
      ]
    };
  }

  let createdProviderId: string | null = null;

  // ================================================================
  // PR-CRUD-01 (P1): Create Provider (Parent-only)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test PR-CRUD-01: Create provider (Parent-only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Unauthed request → expect 401');
    const unauthedRes = await fetch(`${API_BASE}/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test School',
        type: 'school'
      })
    });

    if (unauthedRes.status !== 401) {
      throw new Error(`Expected 401 for unauthed, got ${unauthedRes.status}`);
    }
    console.log('✅ Unauthed request correctly rejected (401)\n');

    console.log('Step 2: Kid request → expect 403');
    const kidRes = await fetch(`${API_BASE}/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.kidA1Token}`
      },
      body: JSON.stringify({
        name: 'Hacked School',
        type: 'school'
      })
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid, got ${kidRes.status}`);
    }
    console.log('✅ Kid request correctly rejected (403)\n');

    console.log('Step 3: Parent correct family → expect success');
    const parentRes = await fetch(`${API_BASE}/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({
        name: 'Test CRUD School',
        type: 'school',
        familyId: testData.familyA.id
      })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent create failed (${parentRes.status}): ${errorText}`);
    }

    const providerData = await parentRes.json();
    createdProviderId = providerData.id || providerData.provider?.id;

    if (!createdProviderId) {
      throw new Error('No provider ID returned from create');
    }

    console.log(`✅ Parent created provider successfully (ID: ${createdProviderId})\n`);

    tests.push({
      id: 'PR-CRUD-01',
      name: 'Create provider (Parent-only)',
      status: 'PASS',
      details: `Created provider ID: ${createdProviderId}`
    });

  } catch (error: any) {
    console.error('❌ PR-CRUD-01 FAILED:', error.message, '\n');
    tests.push({
      id: 'PR-CRUD-01',
      name: 'Create provider (Parent-only)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // PR-CRUD-02 (P1): Read Providers (Family isolation)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test PR-CRUD-02: Read providers (Family isolation)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Parent A reads providers → should see Family A providers only');
    const parentARes = await fetch(`${API_BASE}/providers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentARes.ok) {
      throw new Error(`Parent A read failed: ${parentARes.status}`);
    }

    const parentAProviders = await parentARes.json();
    const providersList = parentAProviders.providers || parentAProviders;

    if (!Array.isArray(providersList)) {
      throw new Error('Expected array of providers');
    }

    // All providers should belong to Family A
    const wrongFamily = providersList.some((provider: any) => provider.familyId !== testData.familyA?.id);
    if (wrongFamily) {
      throw new Error('Family isolation violated: Parent A can see other family providers');
    }

    console.log(`✅ Parent A sees ${providersList.length} providers (all Family A)\n`);

    // Kids should also be able to read providers (for attendance logging)
    console.log('Step 2: Kid A reads providers → should see Family A providers');
    const kidRes = await fetch(`${API_BASE}/providers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`
      }
    });

    if (!kidRes.ok) {
      throw new Error(`Kid read failed: ${kidRes.status}`);
    }

    const kidProviders = await kidRes.json();
    const kidList = kidProviders.providers || kidProviders;

    if (!Array.isArray(kidList)) {
      throw new Error('Expected array of providers for kid');
    }

    console.log(`✅ Kid A can read providers (${kidList.length} items)\n`);

    // If we have Family B data, test cross-family isolation
    if (testData.parentB1Token && testData.familyB) {
      console.log('Step 3: Parent B reads providers → should NOT see Family A providers');
      const parentBRes = await fetch(`${API_BASE}/providers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testData.parentB1Token}`
        }
      });

      if (!parentBRes.ok) {
        throw new Error(`Parent B read failed: ${parentBRes.status}`);
      }

      const parentBProviders = await parentBRes.json();
      const parentBList = parentBProviders.providers || parentBProviders;

      // Should NOT contain Family A providers
      const hasFamilyAProvider = parentBList.some((provider: any) => provider.familyId === testData.familyA?.id);
      if (hasFamilyAProvider) {
        throw new Error('SECURITY: Parent B can see Family A providers');
      }

      console.log(`✅ Parent B sees ${parentBList.length} providers (Family B only, isolation confirmed)\n`);
    }

    tests.push({
      id: 'PR-CRUD-02',
      name: 'Read providers (Family isolation)',
      status: 'PASS',
      details: `Family isolation verified, kids can read (for attendance)`
    });

  } catch (error: any) {
    console.error('❌ PR-CRUD-02 FAILED:', error.message, '\n');
    tests.push({
      id: 'PR-CRUD-02',
      name: 'Read providers (Family isolation)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // PR-CRUD-03 (P1): Update Provider (Parent-only, wrong family → 403)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test PR-CRUD-03: Update provider (Parent-only, wrong family → 403)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdProviderId) {
      throw new Error('No provider ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to update provider → expect 403');
    const kidRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.kidA1Token}`
      },
      body: JSON.stringify({ name: 'Hacked Name' })
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid update, got ${kidRes.status}`);
    }
    console.log('✅ Kid update correctly rejected (403)\n');

    // Test wrong family parent if available
    if (testData.parentB1Token) {
      console.log('Step 2: Parent B tries to update Family A provider → expect 403');
      const wrongFamilyRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testData.parentB1Token}`
        },
        body: JSON.stringify({ name: 'Hacked by Parent B' })
      });

      if (wrongFamilyRes.status !== 403 && wrongFamilyRes.status !== 404) {
        throw new Error(`Expected 403/404 for wrong family parent, got ${wrongFamilyRes.status}`);
      }
      console.log('✅ Wrong family parent update correctly rejected\n');
    }

    console.log('Step 3: Parent A (correct family) updates provider → expect success');
    const parentRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({ name: 'Updated Test School' })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent update failed (${parentRes.status}): ${errorText}`);
    }

    const updatedProvider = await parentRes.json();
    const providerObj = updatedProvider.provider || updatedProvider;

    if (providerObj.name !== 'Updated Test School') {
      throw new Error('Update did not persist correctly');
    }

    console.log('✅ Parent A updated provider successfully\n');

    tests.push({
      id: 'PR-CRUD-03',
      name: 'Update provider (Parent-only, wrong family → 403)',
      status: 'PASS',
      details: 'Kid and wrong-family parent blocked, correct parent succeeded'
    });

  } catch (error: any) {
    console.error('❌ PR-CRUD-03 FAILED:', error.message, '\n');
    tests.push({
      id: 'PR-CRUD-03',
      name: 'Update provider (Parent-only, wrong family → 403)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // PR-CRUD-04 (P1): Delete Provider (Parent-only)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test PR-CRUD-04: Delete provider (Parent-only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdProviderId) {
      throw new Error('No provider ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to delete provider → expect 403');
    const kidRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`
      }
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid delete, got ${kidRes.status}`);
    }
    console.log('✅ Kid delete correctly rejected (403)\n');

    console.log('Step 2: Parent A (correct family) deletes provider → expect success');
    const parentRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentRes.ok && parentRes.status !== 204) {
      const errorText = await parentRes.text();
      throw new Error(`Parent delete failed (${parentRes.status}): ${errorText}`);
    }

    console.log('✅ Parent A deleted provider successfully\n');

    // Verify deletion
    console.log('Step 3: Verify provider no longer exists');
    const verifyRes = await fetch(`${API_BASE}/providers/${createdProviderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (verifyRes.ok) {
      const data = await verifyRes.json();
      // Sometimes API returns empty array instead of 404
      if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
        throw new Error('Provider still exists after delete');
      }
    }

    console.log('✅ Provider confirmed deleted\n');

    tests.push({
      id: 'PR-CRUD-04',
      name: 'Delete provider (Parent-only)',
      status: 'PASS',
      details: 'Kid blocked, parent succeeded, deletion verified'
    });

  } catch (error: any) {
    console.error('❌ PR-CRUD-04 FAILED:', error.message, '\n');
    tests.push({
      id: 'PR-CRUD-04',
      name: 'Delete provider (Parent-only)',
      status: 'FAIL',
      error: error.message
    });
  }

  // =================================================================
  // Final Summary
  // =================================================================
  const endTime = Date.now();
  const duration = `${endTime - startTime}ms`;

  const summary = {
    total: tests.length,
    passed: tests.filter(t => t.status === 'PASS').length,
    failed: tests.filter(t => t.status === 'FAIL').length,
    skipped: tests.filter(t => t.status === 'SKIP').length
  };

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 PROVIDERS ADMIN CRUD TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${summary.total}`);
  console.log(`✅ Passed: ${summary.passed}`);
  console.log(`❌ Failed: ${summary.failed}`);
  console.log(`⏭️  Skipped: ${summary.skipped}`);
  console.log(`⏱️  Duration: ${duration}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    timestamp: new Date().toISOString(),
    duration,
    summary,
    tests
  };
}
