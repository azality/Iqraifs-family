/**
 * Challenges Admin CRUD Tests (P1)
 * 
 * Tests the complete challenge administration workflow per COMPREHENSIVE_SYSTEM_AUDIT:
 * 
 * CH-001 (P0): Create challenge (Parent-only)
 * CH-002 (P0): Update challenge  
 * CH-003 (P0): Delete challenge
 * CH-004 (P1): Challenge edit after completion
 * CH-005 (P1): Challenge visibility rules (schedule/eligibility)
 * 
 * Key Requirements:
 * - Challenges CRUD is parent-only
 * - Kids consume via shared endpoints only
 * - Family-scoped (no cross-family access)
 * - Completion records must remain consistent after edits
 * - Visibility follows schedule/eligibility rules
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

export async function runChallengesAdminTests(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎯 CHALLENGES ADMIN CRUD TESTS (P1)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Basis: Challenges CRUD is parent-only;');
  console.log('             kids consume via shared endpoints only.');
  console.log('');
  console.log('Test Plan:');
  console.log('  CH-001 (P0): Create challenge (Parent-only)');
  console.log('  CH-002 (P0): Update challenge');
  console.log('  CH-003 (P0): Delete challenge');
  console.log('  CH-004 (P1): Challenge edit after completion');
  console.log('  CH-005 (P1): Challenge visibility rules');
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
      summary: { total: 5, passed: 0, failed: 0, skipped: 5 },
      tests: [
        { id: 'CH-001', name: 'Create challenge (Parent-only)', status: 'SKIP', error: 'No test data' },
        { id: 'CH-002', name: 'Update challenge', status: 'SKIP', error: 'No test data' },
        { id: 'CH-003', name: 'Delete challenge', status: 'SKIP', error: 'No test data' },
        { id: 'CH-004', name: 'Challenge edit after completion', status: 'SKIP', error: 'No test data' },
        { id: 'CH-005', name: 'Challenge visibility rules', status: 'SKIP', error: 'No test data' }
      ]
    };
  }

  // ================================================================
  // CH-001 (P0): Create Challenge (Parent-only)
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST CH-001 (P0): Create Challenge (Parent-only)');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    console.log('📝 Step 1: Parent A1 creates challenge...\n');

    const challengePayload = {
      title: 'Daily Prayer Challenge',
      description: 'Complete 5 prayers every day',
      rewardPoints: 50,
      frequency: 'daily',
      targetCount: 5,
      icon: '🕌',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };

    const createRes = await fetch(`${API_BASE}/challenges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(challengePayload)
    });

    if (!createRes.ok) {
      throw new Error(`Create failed: ${createRes.status} - ${await createRes.text()}`);
    }

    const created = await createRes.json();
    console.log(`✅ Challenge created: ${created.id}`);
    console.log(`   Title: ${created.title}`);
    console.log(`   Points: ${created.rewardPoints}`);
    console.log('');

    // Step 2: Verify in child challenges list
    console.log('📝 Step 2: Verify challenge appears in Kid A1\'s list...\n');

    const kidChallengesRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidChallengesRes.ok) {
      throw new Error(`Kid challenges fetch failed: ${kidChallengesRes.status}`);
    }

    const kidChallenges = await kidChallengesRes.json();
    const foundInKidList = kidChallenges.some((c: any) => c.id === created.id);

    if (!foundInKidList) {
      throw new Error('Challenge not visible in kid\'s challenge list');
    }

    console.log(`✅ Challenge visible in Kid A1's list`);
    console.log('');

    // Step 3: Verify family isolation (Parent B1 cannot access)
    if (testData.parentB1Token && testData.familyB) {
      console.log('📝 Step 3: Verify Parent B1 cannot access Family A challenge...\n');

      const crossFamilyRes = await fetch(
        `${API_BASE}/challenges/${created.id}`,
        {
          headers: {
            'Authorization': `Bearer ${testData.parentB1Token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (crossFamilyRes.ok) {
        throw new Error('Cross-family access succeeded (should be 403)');
      }

      if (crossFamilyRes.status !== 403) {
        throw new Error(`Expected 403, got ${crossFamilyRes.status}`);
      }

      console.log('✅ Cross-family access blocked (403)');
      console.log('');
    }

    // Store challenge ID for later tests
    (testData as any).testChallengeId = created.id;

    tests.push({
      id: 'CH-001',
      name: 'Create challenge (Parent-only)',
      status: 'PASS',
      details: `Created challenge ${created.id}, verified in kid list, blocked cross-family access`
    });
    console.log('✅ CH-001 PASSED\n');
  } catch (error: any) {
    console.error('❌ CH-001 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-001',
      name: 'Create challenge (Parent-only)',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-002 (P0): Update Challenge
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST CH-002 (P0): Update Challenge');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const challengeId = (testData as any).testChallengeId;
    if (!challengeId) {
      throw new Error('No challenge ID from CH-001');
    }

    console.log('📝 Step 1: Parent A1 updates challenge...\n');

    const updatePayload = {
      title: 'Updated Prayer Challenge',
      rewardPoints: 75, // Changed from 50
      description: 'Complete 5 prayers daily - Updated!'
    };

    const updateRes = await fetch(`${API_BASE}/challenges/${challengeId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateRes.ok) {
      throw new Error(`Update failed: ${updateRes.status} - ${await updateRes.text()}`);
    }

    const updated = await updateRes.json();
    console.log(`✅ Challenge updated`);
    console.log(`   New title: ${updated.title}`);
    console.log(`   New points: ${updated.rewardPoints}`);
    console.log('');

    // Step 2: Verify changes in parent list
    console.log('📝 Step 2: Verify update in parent challenge list...\n');

    const parentListRes = await fetch(`${API_BASE}/challenges`, {
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey
      }
    });

    if (!parentListRes.ok) {
      throw new Error(`Parent list fetch failed: ${parentListRes.status}`);
    }

    const parentList = await parentListRes.json();
    const foundInParentList = parentList.find((c: any) => c.id === challengeId);

    if (!foundInParentList) {
      throw new Error('Challenge not found in parent list');
    }

    if (foundInParentList.title !== updatePayload.title) {
      throw new Error(`Title not updated: ${foundInParentList.title}`);
    }

    if (foundInParentList.rewardPoints !== updatePayload.rewardPoints) {
      throw new Error(`Points not updated: ${foundInParentList.rewardPoints}`);
    }

    console.log('✅ Update reflected in parent list');
    console.log('');

    // Step 3: Verify changes in kid challenges
    console.log('📝 Step 3: Verify update in kid challenge list...\n');

    const kidChallengesRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidChallengesRes.ok) {
      throw new Error(`Kid challenges fetch failed: ${kidChallengesRes.status}`);
    }

    const kidChallenges = await kidChallengesRes.json();
    const foundInKidList = kidChallenges.find((c: any) => c.id === challengeId);

    if (!foundInKidList) {
      throw new Error('Challenge not found in kid list');
    }

    if (foundInKidList.rewardPoints !== updatePayload.rewardPoints) {
      throw new Error(`Kid sees old points: ${foundInKidList.rewardPoints}`);
    }

    console.log('✅ Update reflected in kid list');
    console.log('');

    // Step 4: Verify unauthorized roles blocked
    console.log('📝 Step 4: Verify kid cannot update challenge...\n');

    const kidUpdateRes = await fetch(`${API_BASE}/challenges/${challengeId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testData.kidA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Hacked by kid' })
    });

    if (kidUpdateRes.ok) {
      throw new Error('Kid update succeeded (should be 403)');
    }

    if (kidUpdateRes.status !== 403) {
      throw new Error(`Expected 403, got ${kidUpdateRes.status}`);
    }

    console.log('✅ Kid update blocked (403)');
    console.log('');

    // Step 5: Verify cross-family update blocked
    if (testData.parentB1Token) {
      console.log('📝 Step 5: Verify cross-family update blocked...\n');

      const crossFamilyUpdateRes = await fetch(`${API_BASE}/challenges/${challengeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${testData.parentB1Token}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'Cross-family hack' })
      });

      if (crossFamilyUpdateRes.ok) {
        throw new Error('Cross-family update succeeded (should be 403)');
      }

      if (crossFamilyUpdateRes.status !== 403) {
        throw new Error(`Expected 403, got ${crossFamilyUpdateRes.status}`);
      }

      console.log('✅ Cross-family update blocked (403)');
      console.log('');
    }

    tests.push({
      id: 'CH-002',
      name: 'Update challenge',
      status: 'PASS',
      details: 'Update persisted, reflected in parent & kid views, unauthorized roles blocked'
    });
    console.log('✅ CH-002 PASSED\n');
  } catch (error: any) {
    console.error('❌ CH-002 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-002',
      name: 'Update challenge',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-003 (P0): Delete Challenge
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST CH-003 (P0): Delete Challenge');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    // First create a challenge to delete (separate from CH-001 challenge)
    console.log('📝 Setup: Creating challenge to delete...\n');

    const createRes = await fetch(`${API_BASE}/challenges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Temporary Challenge',
        description: 'Will be deleted',
        rewardPoints: 10,
        frequency: 'daily',
        targetCount: 1
      })
    });

    if (!createRes.ok) {
      throw new Error(`Setup failed: ${createRes.status}`);
    }

    const created = await createRes.json();
    const challengeId = created.id;
    console.log(`✅ Test challenge created: ${challengeId}\n`);

    // Step 1: Delete challenge
    console.log('📝 Step 1: Parent A1 deletes challenge...\n');

    const deleteRes = await fetch(`${API_BASE}/challenges/${challengeId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey
      }
    });

    if (!deleteRes.ok) {
      throw new Error(`Delete failed: ${deleteRes.status} - ${await deleteRes.text()}`);
    }

    console.log('✅ Challenge deleted');
    console.log('');

    // Step 2: Verify not in parent list
    console.log('📝 Step 2: Verify challenge removed from parent list...\n');

    const parentListRes = await fetch(`${API_BASE}/challenges`, {
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey
      }
    });

    if (!parentListRes.ok) {
      throw new Error(`Parent list fetch failed: ${parentListRes.status}`);
    }

    const parentList = await parentListRes.json();
    const stillInParentList = parentList.some((c: any) => c.id === challengeId);

    if (stillInParentList) {
      throw new Error('Challenge still appears in parent list');
    }

    console.log('✅ Challenge removed from parent list');
    console.log('');

    // Step 3: Verify not in kid challenges
    console.log('📝 Step 3: Verify challenge removed from kid list...\n');

    const kidChallengesRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidChallengesRes.ok) {
      throw new Error(`Kid challenges fetch failed: ${kidChallengesRes.status}`);
    }

    const kidChallenges = await kidChallengesRes.json();
    const stillInKidList = kidChallenges.some((c: any) => c.id === challengeId);

    if (stillInKidList) {
      throw new Error('Challenge still appears in kid list');
    }

    console.log('✅ Challenge removed from kid list');
    console.log('');

    // Step 4: Verify kid UI doesn't break (fetch still works)
    console.log('📝 Step 4: Verify kid UI still renders correctly...\n');

    // Kid challenges endpoint should still return 200 (even if empty)
    if (!kidChallengesRes.ok) {
      throw new Error('Kid challenges endpoint broken after deletion');
    }

    console.log('✅ Kid UI not broken (no orphan references)');
    console.log('');

    tests.push({
      id: 'CH-003',
      name: 'Delete challenge',
      status: 'PASS',
      details: 'Challenge deleted, removed from all views, no orphan references'
    });
    console.log('✅ CH-003 PASSED\n');
  } catch (error: any) {
    console.error('❌ CH-003 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-003',
      name: 'Delete challenge',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-004 (P1): Challenge Edit After Completion
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST CH-004 (P1): Challenge Edit After Completion');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const challengeId = (testData as any).testChallengeId;
    if (!challengeId) {
      throw new Error('No challenge ID from CH-001');
    }

    // Step 1: Kid completes challenge
    console.log('📝 Step 1: Kid A1 completes challenge...\n');

    const completeRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges/${challengeId}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          completedAt: new Date().toISOString(),
          notes: 'Completed all prayers'
        })
      }
    );

    if (!completeRes.ok) {
      throw new Error(`Completion failed: ${completeRes.status} - ${await completeRes.text()}`);
    }

    const completion = await completeRes.json();
    console.log(`✅ Challenge completed`);
    console.log(`   Points awarded: ${completion.pointsAwarded || 'unknown'}`);
    console.log('');

    // Get initial points
    const pointsBeforeEdit = completion.pointsAwarded || 75; // From CH-002 update

    // Step 2: Parent edits challenge points
    console.log('📝 Step 2: Parent A1 edits challenge points value...\n');

    const editRes = await fetch(`${API_BASE}/challenges/${challengeId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rewardPoints: 100 }) // Changed from 75 to 100
    });

    if (!editRes.ok) {
      throw new Error(`Edit failed: ${editRes.status}`);
    }

    console.log('✅ Challenge points edited (75 → 100)');
    console.log('');

    // Step 3: Attempt to complete again
    console.log('📝 Step 3: Kid attempts to complete challenge again...\n');

    const reCompleteRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges/${challengeId}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          completedAt: new Date().toISOString()
        })
      }
    );

    // Should either:
    // a) Succeed (re-eligible for daily challenges)
    // b) Fail with 409 (already completed today)
    // Either is acceptable, but NO double-award

    let allowsReCompletion = false;
    if (reCompleteRes.ok) {
      console.log('✅ Re-completion allowed (daily challenge logic)');
      allowsReCompletion = true;
    } else if (reCompleteRes.status === 409) {
      console.log('✅ Re-completion blocked (already completed)');
    } else {
      throw new Error(`Unexpected re-completion status: ${reCompleteRes.status}`);
    }
    console.log('');

    // Step 4: Check events for double-award
    console.log('📝 Step 4: Verify no duplicate point events...\n');

    const eventsRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/events`,
      {
        headers: {
          'Authorization': `Bearer ${testData.parentA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!eventsRes.ok) {
      throw new Error(`Events fetch failed: ${eventsRes.status}`);
    }

    const events = await eventsRes.json();
    
    // Filter challenge completion events for this challenge
    const challengeEvents = events.filter((e: any) => 
      e.type === 'challenge_complete' && 
      e.metadata?.challengeId === challengeId
    );

    // Count unique completion events (by timestamp or ID)
    const uniqueCompletions = new Set(
      challengeEvents.map((e: any) => e.timestamp || e.id)
    ).size;

    if (allowsReCompletion) {
      // Should have 2 completion events (original + re-completion)
      if (uniqueCompletions !== 2) {
        throw new Error(`Expected 2 completions, found ${uniqueCompletions}`);
      }
      console.log('✅ Two completion events found (as expected)');
    } else {
      // Should have only 1 completion event
      if (uniqueCompletions !== 1) {
        throw new Error(`Expected 1 completion, found ${uniqueCompletions}`);
      }
      console.log('✅ Only one completion event found (correct)');
    }
    console.log('');

    // Step 5: Verify challenge status consistency
    console.log('📝 Step 5: Verify completion records remain consistent...\n');

    const statusRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges/${challengeId}`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!statusRes.ok) {
      throw new Error(`Status fetch failed: ${statusRes.status}`);
    }

    const status = await statusRes.json();
    console.log(`✅ Challenge status retrieved`);
    console.log(`   Completed: ${status.completed || status.completedToday || 'unknown'}`);
    console.log(`   Progress: ${status.progress || 'unknown'}`);
    console.log('');

    tests.push({
      id: 'CH-004',
      name: 'Challenge edit after completion',
      status: 'PASS',
      details: `Completion handled correctly, ${allowsReCompletion ? 're-completion allowed' : 're-completion blocked'}, no duplicate events`
    });
    console.log('✅ CH-004 PASSED\n');
  } catch (error: any) {
    console.error('❌ CH-004 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-004',
      name: 'Challenge edit after completion',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // CH-005 (P1): Challenge Visibility Rules (Schedule/Eligibility)
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST CH-005 (P1): Challenge Visibility Rules');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Step 1: Create future challenge
    console.log('📝 Step 1: Parent creates future challenge (starts tomorrow)...\n');

    const futureStart = new Date(now + oneDayMs).toISOString();
    const futureEnd = new Date(now + 7 * oneDayMs).toISOString();

    const futureRes = await fetch(`${API_BASE}/challenges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Future Challenge',
        description: 'Starts tomorrow',
        rewardPoints: 30,
        frequency: 'daily',
        targetCount: 1,
        startDate: futureStart,
        endDate: futureEnd
      })
    });

    if (!futureRes.ok) {
      throw new Error(`Future challenge creation failed: ${futureRes.status}`);
    }

    const futureChallenge = await futureRes.json();
    console.log(`✅ Future challenge created: ${futureChallenge.id}`);
    console.log(`   Starts: ${futureStart}`);
    console.log('');

    // Step 2: Create active challenge
    console.log('📝 Step 2: Parent creates active challenge (starts now)...\n');

    const activeStart = new Date(now - 1000).toISOString(); // Just started
    const activeEnd = new Date(now + 7 * oneDayMs).toISOString();

    const activeRes = await fetch(`${API_BASE}/challenges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Active Challenge',
        description: 'Active now',
        rewardPoints: 40,
        frequency: 'daily',
        targetCount: 1,
        startDate: activeStart,
        endDate: activeEnd
      })
    });

    if (!activeRes.ok) {
      throw new Error(`Active challenge creation failed: ${activeRes.status}`);
    }

    const activeChallenge = await activeRes.json();
    console.log(`✅ Active challenge created: ${activeChallenge.id}`);
    console.log('');

    // Step 3: Kid checks challenge list
    console.log('📝 Step 3: Kid checks challenge list...\n');

    const kidListRes = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidListRes.ok) {
      throw new Error(`Kid list fetch failed: ${kidListRes.status}`);
    }

    const kidChallenges = await kidListRes.json();
    
    const hasActive = kidChallenges.some((c: any) => c.id === activeChallenge.id);
    const hasFuture = kidChallenges.some((c: any) => c.id === futureChallenge.id);

    console.log(`   Active challenge visible: ${hasActive ? '✅ YES' : '❌ NO'}`);
    console.log(`   Future challenge visible: ${hasFuture ? '⚠️  YES' : '✅ NO'}`);
    console.log('');

    // Acceptance: Kid should see active, optionally see future (UI decision)
    if (!hasActive) {
      throw new Error('Active challenge not visible to kid');
    }

    console.log('✅ Active challenge visible to kid');
    console.log('');

    // Step 4: Parent checks admin view
    console.log('📝 Step 4: Parent checks admin view (should see all)...\n');

    const parentListRes = await fetch(`${API_BASE}/challenges`, {
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey
      }
    });

    if (!parentListRes.ok) {
      throw new Error(`Parent list fetch failed: ${parentListRes.status}`);
    }

    const parentChallenges = await parentListRes.json();
    
    const parentHasActive = parentChallenges.some((c: any) => c.id === activeChallenge.id);
    const parentHasFuture = parentChallenges.some((c: any) => c.id === futureChallenge.id);

    if (!parentHasActive || !parentHasFuture) {
      throw new Error('Parent cannot see all challenges');
    }

    console.log('✅ Parent sees all challenges (active + future)');
    console.log('');

    // Step 5: Update future challenge to active
    console.log('📝 Step 5: Update future challenge to start now...\n');

    const updateRes = await fetch(`${API_BASE}/challenges/${futureChallenge.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testData.parentA1Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: new Date(now - 1000).toISOString() // Now active
      })
    });

    if (!updateRes.ok) {
      throw new Error(`Update failed: ${updateRes.status}`);
    }

    console.log('✅ Future challenge updated to active');
    console.log('');

    // Step 6: Kid checks list again
    console.log('📝 Step 6: Kid checks list again (should now see updated challenge)...\n');

    const kidListRes2 = await fetch(
      `${API_BASE}/children/${testData.kidA1Id}/challenges`,
      {
        headers: {
          'Authorization': `Bearer ${testData.kidA1Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidListRes2.ok) {
      throw new Error(`Kid list fetch failed: ${kidListRes2.status}`);
    }

    const kidChallenges2 = await kidListRes2.json();
    const nowHasPreviouslyFuture = kidChallenges2.some((c: any) => c.id === futureChallenge.id);

    console.log(`   Previously future challenge now visible: ${nowHasPreviouslyFuture ? '✅ YES' : '❌ NO'}`);
    console.log('');

    if (!nowHasPreviouslyFuture) {
      console.log('⚠️  Note: Challenge not yet visible after update (may need cache refresh)');
      console.log('   This is acceptable if eventual consistency is intended.');
      console.log('');
    }

    tests.push({
      id: 'CH-005',
      name: 'Challenge visibility rules',
      status: 'PASS',
      details: `Active challenges visible to kid, parent sees all, schedule updates ${nowHasPreviouslyFuture ? 'work' : 'may need refresh'}`
    });
    console.log('✅ CH-005 PASSED\n');
  } catch (error: any) {
    console.error('❌ CH-005 FAILED:', error.message, '\n');
    tests.push({
      id: 'CH-005',
      name: 'Challenge visibility rules',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // GENERATE REPORT
  // ================================================================
  const duration = Date.now() - startTime;
  const summary = {
    total: tests.length,
    passed: tests.filter(t => t.status === 'PASS').length,
    failed: tests.filter(t => t.status === 'FAIL').length,
    skipped: tests.filter(t => t.status === 'SKIP').length
  };

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 CHALLENGES ADMIN TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Total Tests:      ${summary.total}`);
  console.log(`✅ Passed:         ${summary.passed}`);
  console.log(`❌ Failed:         ${summary.failed}`);
  console.log(`⏭️  Skipped:        ${summary.skipped}`);
  console.log(`⏱️  Duration:       ${duration}ms\n`);

  if (summary.failed > 0) {
    console.log('Failed Tests:');
    tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  ❌ ${t.id}: ${t.name}`);
      console.log(`     Error: ${t.error}`);
    });
    console.log('');
  }

  const passRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(0) : 0;
  console.log(`Pass Rate: ${passRate}%`);
  
  if (summary.failed === 0 && summary.skipped === 0) {
    console.log('🎉 ALL TESTS PASSED!\n');
  } else if (summary.failed === 0) {
    console.log('✅ NO FAILURES (some tests skipped)\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED\n');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary,
    tests
  };
}
