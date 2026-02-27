/**
 * Children Admin CRUD Tests (P0)
 * 
 * Tests the complete child administration workflow per COMPREHENSIVE_SYSTEM_AUDIT Section F:
 * 
 * CH-CRUD-01 (P0): Create child (Parent-only, 401/403 enforcement)
 * CH-CRUD-02 (P0): Read children (Family isolation)
 * CH-CRUD-03 (P0): Update child (Parent-only, wrong family → 403)
 * CH-CRUD-04 (P0): Delete child (Parent-only)
 * 
 * Key Requirements from Audit:
 * - Unauthed → 401
 * - Kid → 403
 * - Parent wrong family → 403
 * - Parent correct family → succeeds
 * - Family isolation (cannot see/modify other families' children)
 * - PIN security (hashed, never returned in responses)
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

export async function runChildrenAdminCrudTests(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('👶 CHILDREN ADMIN CRUD TESTS (P0)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Basis: Section F - Full admin CRUD coverage checklist');
  console.log('             Children CRUD is parent-only with family isolation.');
  console.log('');
  console.log('Test Plan:');
  console.log('  CH-CRUD-01 (P0): Create child (Parent-only, 401/403 enforcement)');
  console.log('  CH-CRUD-02 (P0): Read children (Family isolation)');
  console.log('  CH-CRUD-03 (P0): Update child (Parent-only, wrong family → 403)');
  console.log('  CH-CRUD-04 (P0): Delete child (Parent-only)');
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
        { id: 'CH-CRUD-01', name: 'Create child (Parent-only, 401/403)', status: 'SKIP', error: 'No test data' },
        { id: 'CH-CRUD-02', name: 'Read children (Family isolation)', status: 'SKIP', error: 'No test data' },
        { id: 'CH-CRUD-03', name: 'Update child (Parent-only, wrong family → 403)', status: 'SKIP', error: 'No test data' },
        { id: 'CH-CRUD-04', name: 'Delete child (Parent-only)', status: 'SKIP', error: 'No test data' }
      ]
    };
  }

  let createdChildId: string | null = null;

  // ================================================================
  // CH-CRUD-01 (P0): Create Child (Parent-only, 401/403 enforcement)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test CH-CRUD-01: Create child (Parent-only, 401/403 enforcement)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Unauthed request → expect 401');
    const unauthedRes = await fetch(`${API_BASE}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Child', pin: '1234' })
    });

    if (unauthedRes.status !== 401) {
      throw new Error(`Expected 401 for unauthed, got ${unauthedRes.status}`);
    }
    console.log('✅ Unauthed request correctly rejected (401)\n');

    console.log('Step 2: Kid request → expect 403');
    const kidRes = await fetch(`${API_BASE}/children`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.kidA1Token}`
      },
      body: JSON.stringify({ name: 'Test Child', pin: '1234' })
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid, got ${kidRes.status}`);
    }
    console.log('✅ Kid request correctly rejected (403)\n');

    console.log('Step 3: Parent correct family → expect success');
    const parentRes = await fetch(`${API_BASE}/children`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({
        name: 'Test CRUD Child',
        pin: '9876',
        familyId: testData.familyA.id
      })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent create failed (${parentRes.status}): ${errorText}`);
    }

    const childData = await parentRes.json();
    createdChildId = childData.id || childData.child?.id;

    if (!createdChildId) {
      throw new Error('No child ID returned from create');
    }

    // Verify PIN not in response
    if (childData.pin || childData.child?.pin) {
      throw new Error('SECURITY: PIN hash returned in response');
    }

    console.log(`✅ Parent created child successfully (ID: ${createdChildId})`);
    console.log('✅ PIN not exposed in response\n');

    tests.push({
      id: 'CH-CRUD-01',
      name: 'Create child (Parent-only, 401/403 enforcement)',
      status: 'PASS',
      details: `Created child ID: ${createdChildId}`
    });

  } catch (error: any) {
    console.error('❌ CH-CRUD-01 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-CRUD-01',
      name: 'Create child (Parent-only, 401/403 enforcement)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-CRUD-02 (P0): Read Children (Family isolation)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test CH-CRUD-02: Read children (Family isolation)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Parent A reads children → should see Family A children only');
    const parentARes = await fetch(`${API_BASE}/children`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentARes.ok) {
      throw new Error(`Parent A read failed: ${parentARes.status}`);
    }

    const parentAChildren = await parentARes.json();
    const childrenList = parentAChildren.children || parentAChildren;

    if (!Array.isArray(childrenList)) {
      throw new Error('Expected array of children');
    }

    // All children should belong to Family A
    const wrongFamily = childrenList.some((child: any) => child.familyId !== testData.familyA?.id);
    if (wrongFamily) {
      throw new Error('Family isolation violated: Parent A can see other family children');
    }

    console.log(`✅ Parent A sees ${childrenList.length} children (all Family A)\n`);

    // If we have Family B data, test cross-family isolation
    if (testData.parentB1Token && testData.familyB) {
      console.log('Step 2: Parent B reads children → should NOT see Family A children');
      const parentBRes = await fetch(`${API_BASE}/children`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testData.parentB1Token}`
        }
      });

      if (!parentBRes.ok) {
        throw new Error(`Parent B read failed: ${parentBRes.status}`);
      }

      const parentBChildren = await parentBRes.json();
      const parentBList = parentBChildren.children || parentBChildren;

      // Should NOT contain Family A children
      const hasFamilyAChild = parentBList.some((child: any) => child.familyId === testData.familyA?.id);
      if (hasFamilyAChild) {
        throw new Error('SECURITY: Parent B can see Family A children');
      }

      console.log(`✅ Parent B sees ${parentBList.length} children (Family B only, isolation confirmed)\n`);
    }

    tests.push({
      id: 'CH-CRUD-02',
      name: 'Read children (Family isolation)',
      status: 'PASS',
      details: `Family isolation verified`
    });

  } catch (error: any) {
    console.error('❌ CH-CRUD-02 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-CRUD-02',
      name: 'Read children (Family isolation)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-CRUD-03 (P0): Update Child (Parent-only, wrong family → 403)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test CH-CRUD-03: Update child (Parent-only, wrong family → 403)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdChildId) {
      throw new Error('No child ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to update child → expect 403');
    const kidRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
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
      console.log('Step 2: Parent B tries to update Family A child → expect 403');
      const wrongFamilyRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
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

    console.log('Step 3: Parent A (correct family) updates child → expect success');
    const parentRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({ name: 'Updated Test Child' })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent update failed (${parentRes.status}): ${errorText}`);
    }

    const updatedChild = await parentRes.json();
    const childObj = updatedChild.child || updatedChild;

    if (childObj.name !== 'Updated Test Child') {
      throw new Error('Update did not persist correctly');
    }

    console.log('✅ Parent A updated child successfully\n');

    tests.push({
      id: 'CH-CRUD-03',
      name: 'Update child (Parent-only, wrong family → 403)',
      status: 'PASS',
      details: 'Kid and wrong-family parent blocked, correct parent succeeded'
    });

  } catch (error: any) {
    console.error('❌ CH-CRUD-03 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-CRUD-03',
      name: 'Update child (Parent-only, wrong family → 403)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-CRUD-04 (P0): Delete Child (Parent-only)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test CH-CRUD-04: Delete child (Parent-only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdChildId) {
      throw new Error('No child ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to delete child → expect 403');
    const kidRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`
      }
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid delete, got ${kidRes.status}`);
    }
    console.log('✅ Kid delete correctly rejected (403)\n');

    console.log('Step 2: Parent A (correct family) deletes child → expect success');
    const parentRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentRes.ok && parentRes.status !== 204) {
      const errorText = await parentRes.text();
      throw new Error(`Parent delete failed (${parentRes.status}): ${errorText}`);
    }

    console.log('✅ Parent A deleted child successfully\n');

    // Verify deletion
    console.log('Step 3: Verify child no longer exists');
    const verifyRes = await fetch(`${API_BASE}/children/${createdChildId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (verifyRes.ok) {
      throw new Error('Child still exists after delete');
    }

    console.log('✅ Child confirmed deleted\n');

    tests.push({
      id: 'CH-CRUD-04',
      name: 'Delete child (Parent-only)',
      status: 'PASS',
      details: 'Kid blocked, parent succeeded, deletion verified'
    });

  } catch (error: any) {
    console.error('❌ CH-CRUD-04 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-CRUD-04',
      name: 'Delete child (Parent-only)',
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
  console.log('📊 CHILDREN ADMIN CRUD TEST RESULTS');
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
