/**
 * Trackables Admin CRUD Tests (P0)
 * 
 * Tests the complete trackable item administration workflow per COMPREHENSIVE_SYSTEM_AUDIT Section F:
 * 
 * TR-CRUD-01 (P0): Create trackable (Parent-only, kid → 403)
 * TR-CRUD-02 (P0): Read trackables (Family isolation)
 * TR-CRUD-03 (P0): Update trackable (Parent-only, wrong family → 403)
 * TR-CRUD-04 (P0): Delete trackable (Parent-only)
 * 
 * Key Requirements from Audit:
 * - Unauthed → 401
 * - Kid → 403
 * - Parent wrong family → 403
 * - Parent correct family → succeeds
 * - Family isolation (cannot see/modify other families' trackables)
 * - Trackables affect quest generation (validated separately)
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

export async function runTrackablesAdminCrudTests(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📝 TRACKABLES ADMIN CRUD TESTS (P0)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Basis: Section F - Full admin CRUD coverage checklist');
  console.log('             Trackables CRUD is parent-only with family isolation.');
  console.log('');
  console.log('Test Plan:');
  console.log('  TR-CRUD-01 (P0): Create trackable (Parent-only, kid → 403)');
  console.log('  TR-CRUD-02 (P0): Read trackables (Family isolation)');
  console.log('  TR-CRUD-03 (P0): Update trackable (Parent-only, wrong family → 403)');
  console.log('  TR-CRUD-04 (P0): Delete trackable (Parent-only)');
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
        { id: 'TR-CRUD-01', name: 'Create trackable (Parent-only, kid → 403)', status: 'SKIP', error: 'No test data' },
        { id: 'TR-CRUD-02', name: 'Read trackables (Family isolation)', status: 'SKIP', error: 'No test data' },
        { id: 'TR-CRUD-03', name: 'Update trackable (Parent-only, wrong family → 403)', status: 'SKIP', error: 'No test data' },
        { id: 'TR-CRUD-04', name: 'Delete trackable (Parent-only)', status: 'SKIP', error: 'No test data' }
      ]
    };
  }

  let createdTrackableId: string | null = null;

  // ================================================================
  // TR-CRUD-01 (P0): Create Trackable (Parent-only, kid → 403)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test TR-CRUD-01: Create trackable (Parent-only, kid → 403)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Unauthed request → expect 401');
    const unauthedRes = await fetch(`${API_BASE}/trackables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Trackable',
        category: 'chore',
        points: 10
      })
    });

    if (unauthedRes.status !== 401) {
      throw new Error(`Expected 401 for unauthed, got ${unauthedRes.status}`);
    }
    console.log('✅ Unauthed request correctly rejected (401)\n');

    console.log('Step 2: Kid request → expect 403');
    const kidRes = await fetch(`${API_BASE}/trackables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.kidA1Token}`
      },
      body: JSON.stringify({
        title: 'Hacked Trackable',
        category: 'chore',
        points: 1000
      })
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid, got ${kidRes.status}`);
    }
    console.log('✅ Kid request correctly rejected (403)\n');

    console.log('Step 3: Parent correct family → expect success');
    const parentRes = await fetch(`${API_BASE}/trackables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({
        title: 'Test CRUD Trackable',
        category: 'chore',
        points: 15,
        familyId: testData.familyA.id
      })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent create failed (${parentRes.status}): ${errorText}`);
    }

    const trackableData = await parentRes.json();
    createdTrackableId = trackableData.id || trackableData.trackable?.id;

    if (!createdTrackableId) {
      throw new Error('No trackable ID returned from create');
    }

    console.log(`✅ Parent created trackable successfully (ID: ${createdTrackableId})\n`);

    tests.push({
      id: 'TR-CRUD-01',
      name: 'Create trackable (Parent-only, kid → 403)',
      status: 'PASS',
      details: `Created trackable ID: ${createdTrackableId}`
    });

  } catch (error: any) {
    console.error('❌ TR-CRUD-01 FAILED:', error.message, '\n');
    tests.push({
      id: 'TR-CRUD-01',
      name: 'Create trackable (Parent-only, kid → 403)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // TR-CRUD-02 (P0): Read Trackables (Family isolation)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test TR-CRUD-02: Read trackables (Family isolation)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Parent A reads trackables → should see Family A trackables only');
    const parentARes = await fetch(`${API_BASE}/trackables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentARes.ok) {
      throw new Error(`Parent A read failed: ${parentARes.status}`);
    }

    const parentATrackables = await parentARes.json();
    const trackablesList = parentATrackables.trackables || parentATrackables;

    if (!Array.isArray(trackablesList)) {
      throw new Error('Expected array of trackables');
    }

    // All trackables should belong to Family A
    const wrongFamily = trackablesList.some((trackable: any) => trackable.familyId !== testData.familyA?.id);
    if (wrongFamily) {
      throw new Error('Family isolation violated: Parent A can see other family trackables');
    }

    console.log(`✅ Parent A sees ${trackablesList.length} trackables (all Family A)\n`);

    // Kids should also be able to read trackables (for quest system)
    console.log('Step 2: Kid A reads trackables → should see Family A trackables');
    const kidRes = await fetch(`${API_BASE}/trackables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`
      }
    });

    if (!kidRes.ok) {
      throw new Error(`Kid read failed: ${kidRes.status}`);
    }

    const kidTrackables = await kidRes.json();
    const kidList = kidTrackables.trackables || kidTrackables;

    if (!Array.isArray(kidList)) {
      throw new Error('Expected array of trackables for kid');
    }

    console.log(`✅ Kid A can read trackables (${kidList.length} items)\n`);

    // If we have Family B data, test cross-family isolation
    if (testData.parentB1Token && testData.familyB) {
      console.log('Step 3: Parent B reads trackables → should NOT see Family A trackables');
      const parentBRes = await fetch(`${API_BASE}/trackables`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testData.parentB1Token}`
        }
      });

      if (!parentBRes.ok) {
        throw new Error(`Parent B read failed: ${parentBRes.status}`);
      }

      const parentBTrackables = await parentBRes.json();
      const parentBList = parentBTrackables.trackables || parentBTrackables;

      // Should NOT contain Family A trackables
      const hasFamilyATrackable = parentBList.some((trackable: any) => trackable.familyId === testData.familyA?.id);
      if (hasFamilyATrackable) {
        throw new Error('SECURITY: Parent B can see Family A trackables');
      }

      console.log(`✅ Parent B sees ${parentBList.length} trackables (Family B only, isolation confirmed)\n`);
    }

    tests.push({
      id: 'TR-CRUD-02',
      name: 'Read trackables (Family isolation)',
      status: 'PASS',
      details: `Family isolation verified, kids can read (for quests)`
    });

  } catch (error: any) {
    console.error('❌ TR-CRUD-02 FAILED:', error.message, '\n');
    tests.push({
      id: 'TR-CRUD-02',
      name: 'Read trackables (Family isolation)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // TR-CRUD-03 (P0): Update Trackable (Parent-only, wrong family → 403)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test TR-CRUD-03: Update trackable (Parent-only, wrong family → 403)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdTrackableId) {
      throw new Error('No trackable ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to update trackable → expect 403');
    const kidRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.kidA1Token}`
      },
      body: JSON.stringify({ points: 9999 })
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid update, got ${kidRes.status}`);
    }
    console.log('✅ Kid update correctly rejected (403)\n');

    // Test wrong family parent if available
    if (testData.parentB1Token) {
      console.log('Step 2: Parent B tries to update Family A trackable → expect 403');
      const wrongFamilyRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testData.parentB1Token}`
        },
        body: JSON.stringify({ points: 9999 })
      });

      if (wrongFamilyRes.status !== 403 && wrongFamilyRes.status !== 404) {
        throw new Error(`Expected 403/404 for wrong family parent, got ${wrongFamilyRes.status}`);
      }
      console.log('✅ Wrong family parent update correctly rejected\n');
    }

    console.log('Step 3: Parent A (correct family) updates trackable → expect success');
    const parentRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testData.parentA1Token}`
      },
      body: JSON.stringify({
        title: 'Updated Test Trackable',
        points: 20
      })
    });

    if (!parentRes.ok) {
      const errorText = await parentRes.text();
      throw new Error(`Parent update failed (${parentRes.status}): ${errorText}`);
    }

    const updatedTrackable = await parentRes.json();
    const trackableObj = updatedTrackable.trackable || updatedTrackable;

    if (trackableObj.title !== 'Updated Test Trackable' || trackableObj.points !== 20) {
      throw new Error('Update did not persist correctly');
    }

    console.log('✅ Parent A updated trackable successfully\n');

    tests.push({
      id: 'TR-CRUD-03',
      name: 'Update trackable (Parent-only, wrong family → 403)',
      status: 'PASS',
      details: 'Kid and wrong-family parent blocked, correct parent succeeded'
    });

  } catch (error: any) {
    console.error('❌ TR-CRUD-03 FAILED:', error.message, '\n');
    tests.push({
      id: 'TR-CRUD-03',
      name: 'Update trackable (Parent-only, wrong family → 403)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // TR-CRUD-04 (P0): Delete Trackable (Parent-only)
  // ================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test TR-CRUD-04: Delete trackable (Parent-only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!createdTrackableId) {
      throw new Error('No trackable ID available (create test failed)');
    }

    console.log('Step 1: Kid tries to delete trackable → expect 403');
    const kidRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`
      }
    });

    if (kidRes.status !== 403) {
      throw new Error(`Expected 403 for kid delete, got ${kidRes.status}`);
    }
    console.log('✅ Kid delete correctly rejected (403)\n');

    console.log('Step 2: Parent A (correct family) deletes trackable → expect success');
    const parentRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (!parentRes.ok && parentRes.status !== 204) {
      const errorText = await parentRes.text();
      throw new Error(`Parent delete failed (${parentRes.status}): ${errorText}`);
    }

    console.log('✅ Parent A deleted trackable successfully\n');

    // Verify deletion
    console.log('Step 3: Verify trackable no longer exists');
    const verifyRes = await fetch(`${API_BASE}/trackables/${createdTrackableId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`
      }
    });

    if (verifyRes.ok) {
      const data = await verifyRes.json();
      // Sometimes API returns empty array instead of 404
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        throw new Error('Trackable still exists after delete');
      }
    }

    console.log('✅ Trackable confirmed deleted\n');

    tests.push({
      id: 'TR-CRUD-04',
      name: 'Delete trackable (Parent-only)',
      status: 'PASS',
      details: 'Kid blocked, parent succeeded, deletion verified'
    });

  } catch (error: any) {
    console.error('❌ TR-CRUD-04 FAILED:', error.message, '\n');
    tests.push({
      id: 'TR-CRUD-04',
      name: 'Delete trackable (Parent-only)',
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
  console.log('📊 TRACKABLES ADMIN CRUD TEST RESULTS');
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
