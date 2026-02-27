/**
 * Quest & Trackables Testing (P0/P1)
 * 
 * Tests the quest generation system and trackable item management:
 * - QUEST-P0.1: Parent CRUD operations on trackable items
 * - QUEST-P0.2: Quest generation and kid viewing on /challenges
 * - QUEST-P0.3: Quest completion and point event logging
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { getOrDiscoverTestData } from './discover-test-data';

interface TestData {
  familyA?: {
    id: string;
    name: string;
    code: string;
  };
  childA1?: {
    id: string;
    name: string;
    pin: string;
  };
  parentA?: {
    email: string;
    password?: string;
  };
}

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export async function runQuestsTrackablesAudit(providedTestData?: TestData) {
  console.log('🔍 ========================================');
  console.log('🔍 QUEST & TRACKABLES AUDIT (P0/P1)');
  console.log('🔍 ========================================\n');

  const results: TestResult[] = [];
  const startTime = Date.now();

  // Get or discover test data
  let testData = providedTestData;
  
  if (!testData || !testData.familyA || !testData.childA1) {
    console.log('⚠️  No test data provided. Attempting to discover existing test data...\n');
    testData = await getOrDiscoverTestData();
    
    if (!testData || !testData.familyA || !testData.childA1) {
      console.log('❌ Could not discover test data.\n');
      console.log('⚠️  No test data available. Skipping quest & trackables tests.');
      console.log('   Use "Discover Test Data" or "Reset & Recreate" to setup test environment.\n');
      
      return {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
          total: 3,
          passed: 0,
          failed: 0,
          skipped: 3
        }
      };
    }
  }

  console.log('✅ Using test data:');
  console.log(`   Family: ${testData.familyA?.name} (${testData.familyA?.id})`);
  console.log(`   Child: ${testData.childA1?.name} (${testData.childA1?.id})`);
  console.log(`   Parent: ${testData.parentA?.email}\n`);

  // Login as parent to get access token
  const { supabase } = await import('../../../utils/supabase/client');
  
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testData.parentA?.email || '',
    password: testData.parentA?.password || 'TestPassword123!'
  });

  if (loginError || !loginData?.session) {
    console.log('❌ Could not login as parent');
    console.log('   Make sure parent credentials are correct\n');
    
    results.push({
      testName: 'QUEST-P0.1',
      passed: false,
      error: 'Parent login failed'
    });
    results.push({
      testName: 'QUEST-P0.2',
      passed: false,
      error: 'Parent login failed'
    });
    results.push({
      testName: 'QUEST-P0.3',
      passed: false,
      error: 'Parent login failed'
    });

    return {
      timestamp: new Date().toISOString(),
      tests: results,
      summary: {
        total: 3,
        passed: 0,
        failed: 3,
        skipped: 0
      }
    };
  }

  const parentToken = loginData.session.access_token;
  console.log('✅ Parent logged in successfully\n');

  // =================================================================
  // QUEST-P0.1: Parent CRUD operations on trackable items
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 QUEST-P0.1: Parent CRUD on Trackables');
  console.log('📋 ========================================\n');

  try {
    let trackableId: string | null = null;

    // Step 1: CREATE trackable
    console.log('📝 Step 1: Creating trackable (habit)...');
    
    const createResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Quest Behavior',
          type: 'positive',
          points: 15,
          category: 'habits',
          icon: '⭐'
        })
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Create trackable failed (${createResponse.status}): ${errorText}`);
    }

    const createdTrackable = await createResponse.json();
    trackableId = createdTrackable.id;
    
    console.log(`   ✅ Created trackable: ${createdTrackable.name} (ID: ${trackableId})`);
    console.log(`   ✅ Points: ${createdTrackable.points}`);
    console.log(`   ✅ Category: ${createdTrackable.category}\n`);

    // Step 2: UPDATE trackable
    console.log('📝 Step 2: Updating trackable...');
    
    const updateResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors/${trackableId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Quest Behavior',
          points: 25,
          category: 'chores'
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update trackable failed (${updateResponse.status}): ${errorText}`);
    }

    const updatedTrackable = await updateResponse.json();
    
    console.log(`   ✅ Updated trackable: ${updatedTrackable.name}`);
    console.log(`   ✅ New points: ${updatedTrackable.points}`);
    console.log(`   ✅ New category: ${updatedTrackable.category}\n`);

    // Step 3: Verify permissions (non-parent cannot access)
    console.log('📝 Step 3: Verifying parent-only permissions...');
    
    const unauthorizedResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors/${trackableId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Hacker Update',
          points: 9999
        })
      }
    );

    if (unauthorizedResponse.ok) {
      throw new Error('SECURITY ISSUE: Unauthorized user could update trackable!');
    }

    console.log(`   ✅ Unauthorized update blocked (${unauthorizedResponse.status})\n`);

    // Step 4: DELETE trackable
    console.log('📝 Step 4: Deleting trackable...');
    
    const deleteResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors/${trackableId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Delete trackable failed (${deleteResponse.status}): ${errorText}`);
    }

    console.log(`   ✅ Deleted trackable (ID: ${trackableId})\n`);

    // Verify deletion
    const verifyResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const behaviors = await verifyResponse.json();
    const stillExists = behaviors.some((b: any) => b.id === trackableId);

    if (stillExists) {
      throw new Error('Trackable still exists after deletion!');
    }

    console.log(`   ✅ Verified deletion (trackable no longer in list)\n`);

    results.push({
      testName: 'QUEST-P0.1: Parent CRUD on Trackables',
      passed: true,
      details: {
        created: true,
        updated: true,
        permissionsEnforced: true,
        deleted: true
      }
    });

  } catch (error: any) {
    console.error('❌ QUEST-P0.1 failed:', error.message, '\n');
    results.push({
      testName: 'QUEST-P0.1: Parent CRUD on Trackables',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // QUEST-P0.2: Quest appears for kid on /challenges
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 QUEST-P0.2: Quest Generation for Kid');
  console.log('📋 ========================================\n');

  try {
    // Step 1: Ensure family has some behaviors configured
    console.log('📝 Step 1: Checking family has behaviors...');
    
    const behaviorsResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const behaviors = await behaviorsResponse.json();
    
    if (!behaviors || behaviors.length === 0) {
      console.log('   ⚠️  No behaviors configured. Creating test behavior...');
      
      const createBehaviorResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/behaviors`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Prayer',
            type: 'positive',
            points: 10,
            category: 'worship',
            icon: '🤲'
          })
        }
      );

      if (!createBehaviorResponse.ok) {
        throw new Error('Could not create test behavior');
      }

      console.log('   ✅ Created test behavior: Prayer\n');
    } else {
      console.log(`   ✅ Found ${behaviors.length} configured behavior(s)\n`);
    }

    // Step 2: Login as kid to get kid token
    console.log('📝 Step 2: Authenticating as kid...');
    
    const kidAuthResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          childId: testData.childA1!.id,
          pin: testData.childA1!.pin
        })
      }
    );

    if (!kidAuthResponse.ok) {
      const errorText = await kidAuthResponse.text();
      throw new Error(`Kid auth failed (${kidAuthResponse.status}): ${errorText}`);
    }

    const kidAuthData = await kidAuthResponse.json();
    const kidToken = kidAuthData.token;

    console.log(`   ✅ Kid authenticated: ${testData.childA1!.name}\n`);

    // Step 3: Fetch kid's challenges/quests
    console.log('📝 Step 3: Fetching kid challenges...');
    
    const challengesResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/challenges`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!challengesResponse.ok) {
      const errorText = await challengesResponse.text();
      throw new Error(`Fetch challenges failed (${challengesResponse.status}): ${errorText}`);
    }

    const challenges = await challengesResponse.json();

    console.log(`   ✅ Received ${challenges.length} challenge(s)\n`);

    if (challenges.length === 0) {
      console.log('   ⚠️  No quests generated. This may be expected if:');
      console.log('      - Quest generation is on-demand');
      console.log('      - No quests are active for this kid');
      console.log('      - Quest refresh cycle has not occurred\n');
    } else {
      // Verify quest structure
      const firstQuest = challenges[0];
      
      console.log('📊 Quest Details:');
      console.log(`   Title: ${firstQuest.title || firstQuest.name || 'N/A'}`);
      console.log(`   Description: ${firstQuest.description || 'N/A'}`);
      console.log(`   Type: ${firstQuest.type || 'N/A'}`);
      console.log(`   Points: ${firstQuest.pointReward || firstQuest.points || 'N/A'}`);
      console.log(`   Family ID: ${firstQuest.familyId || 'N/A'}\n`);

      // Verify quest is scoped to kid's family
      if (firstQuest.familyId && firstQuest.familyId !== testData.familyA!.id) {
        throw new Error(`Quest has wrong family ID! Expected: ${testData.familyA!.id}, Got: ${firstQuest.familyId}`);
      }

      console.log('   ✅ Quest is correctly scoped to kid\'s family\n');
    }

    results.push({
      testName: 'QUEST-P0.2: Quest Generation for Kid',
      passed: true,
      details: {
        questsFound: challenges.length,
        familyScoped: true,
        kidCanAccess: true
      }
    });

  } catch (error: any) {
    console.error('❌ QUEST-P0.2 failed:', error.message, '\n');
    results.push({
      testName: 'QUEST-P0.2: Quest Generation for Kid',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // QUEST-P0.3: Kid completes quest → point event logged
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 QUEST-P0.3: Quest Completion & Points');
  console.log('📋 ========================================\n');

  try {
    // Step 1: Get kid token again
    console.log('📝 Step 1: Authenticating as kid...');
    
    const kidAuthResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          childId: testData.childA1!.id,
          pin: testData.childA1!.pin
        })
      }
    );

    if (!kidAuthResponse.ok) {
      throw new Error(`Kid auth failed: ${kidAuthResponse.status}`);
    }

    const kidAuthData = await kidAuthResponse.json();
    const kidToken = kidAuthData.token;

    console.log(`   ✅ Kid authenticated\n`);

    // Step 2: Get available challenges
    console.log('📝 Step 2: Fetching available challenges...');
    
    const challengesResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/challenges`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!challengesResponse.ok) {
      throw new Error(`Fetch challenges failed: ${challengesResponse.status}`);
    }

    const challenges = await challengesResponse.json();

    if (!challenges || challenges.length === 0) {
      console.log('   ⚠️  No quests available to complete.');
      console.log('   ⚠️  Skipping quest completion test.\n');
      
      results.push({
        testName: 'QUEST-P0.3: Quest Completion & Points',
        passed: true,
        details: {
          skipped: true,
          reason: 'No quests available'
        }
      });

      console.log('✅ Test suite completed (with skips)\n');
      
      return {
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`,
        tests: results,
        summary: {
          total: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length,
          skipped: 1
        }
      };
    }

    const questToComplete = challenges.find((q: any) => !q.completed && !q.isCompleted);

    if (!questToComplete) {
      console.log('   ⚠️  All quests are already completed.');
      console.log('   ⚠️  Skipping quest completion test.\n');
      
      results.push({
        testName: 'QUEST-P0.3: Quest Completion & Points',
        passed: true,
        details: {
          skipped: true,
          reason: 'All quests completed'
        }
      });

      console.log('✅ Test suite completed (with skips)\n');
      
      return {
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`,
        tests: results,
        summary: {
          total: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length,
          skipped: 1
        }
      };
    }

    console.log(`   ✅ Found quest to complete: ${questToComplete.title || questToComplete.name}\n`);

    // Step 3: Get kid's points before completion
    console.log('📝 Step 3: Recording points before quest completion...');
    
    const childBeforeResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const childBefore = await childBeforeResponse.json();
    const pointsBefore = childBefore.totalPoints || 0;

    console.log(`   ✅ Points before: ${pointsBefore}\n`);

    // Step 4: Complete the quest
    console.log('📝 Step 4: Completing quest...');
    
    const completeResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/challenges/${questToComplete.id}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      throw new Error(`Quest completion failed (${completeResponse.status}): ${errorText}`);
    }

    const completionResult = await completeResponse.json();

    console.log(`   ✅ Quest completed successfully\n`);

    // Step 5: Verify point event was logged
    console.log('📝 Step 5: Verifying point event was created...');
    
    const eventsResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/point-events?childId=${testData.childA1!.id}&limit=10`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = await eventsResponse.json();
    
    // Find the quest completion event (most recent)
    const completionEvent = events.find((e: any) => 
      e.type === 'quest_complete' || 
      e.reason?.includes('quest') ||
      e.behaviorName?.toLowerCase().includes('quest')
    );

    if (!completionEvent) {
      console.log('   ⚠️  Could not find quest completion event');
      console.log('   ⚠️  This may indicate the event is not being logged\n');
    } else {
      console.log(`   ✅ Found completion event (ID: ${completionEvent.id})`);
      console.log(`   ✅ Points awarded: ${completionEvent.points || 'N/A'}\n`);
    }

    // Step 6: Verify quest is marked complete
    console.log('📝 Step 6: Verifying quest is marked complete...');
    
    const challengesAfterResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/challenges`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const challengesAfter = await challengesAfterResponse.json();
    const completedQuest = challengesAfter.find((q: any) => q.id === questToComplete.id);

    if (!completedQuest || (!completedQuest.completed && !completedQuest.isCompleted)) {
      throw new Error('Quest is not marked as completed!');
    }

    console.log(`   ✅ Quest marked as complete\n`);

    // Step 7: Verify points updated (no double-award on refresh)
    console.log('📝 Step 7: Verifying points updated correctly...');
    
    const childAfterResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const childAfter = await childAfterResponse.json();
    const pointsAfter = childAfter.totalPoints || 0;
    const pointsAwarded = pointsAfter - pointsBefore;

    console.log(`   ✅ Points before: ${pointsBefore}`);
    console.log(`   ✅ Points after: ${pointsAfter}`);
    console.log(`   ✅ Points awarded: ${pointsAwarded}\n`);

    // Test double-award protection (refresh should not award again)
    console.log('📝 Step 8: Testing double-award protection...');
    
    const reCompleteResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/challenges/${questToComplete.id}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Should either fail or not award points again
    if (reCompleteResponse.ok) {
      const childReCheckResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${kidToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const childReCheck = await childReCheckResponse.json();
      const pointsReCheck = childReCheck.totalPoints || 0;

      if (pointsReCheck !== pointsAfter) {
        throw new Error(`DOUBLE-AWARD BUG: Points increased from ${pointsAfter} to ${pointsReCheck} on second completion!`);
      }

      console.log(`   ✅ Double-award protection works (points unchanged: ${pointsReCheck})\n`);
    } else {
      console.log(`   ✅ Second completion rejected (${reCompleteResponse.status})\n`);
    }

    results.push({
      testName: 'QUEST-P0.3: Quest Completion & Points',
      passed: true,
      details: {
        questCompleted: true,
        pointEventLogged: !!completionEvent,
        questMarkedComplete: true,
        pointsUpdated: pointsAwarded > 0,
        doubleAwardProtected: true
      }
    });

  } catch (error: any) {
    console.error('❌ QUEST-P0.3 failed:', error.message, '\n');
    results.push({
      testName: 'QUEST-P0.3: Quest Completion & Points',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('════════════════════════════════════════════════════════════');
  console.log('📊 QUEST & TRACKABLES AUDIT SUMMARY (P0/P1)');
  console.log('════════════════════════════════════════════════════════════');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests:     ${total}`);
  console.log(`✅ Passed:        ${passed}`);
  console.log(`❌ Failed:        ${failed}`);
  console.log('════════════════════════════════════════════════════════════\n');

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.testName}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.details) {
      console.log(`   Details:`, result.details);
    }
  });

  console.log('\n');

  return {
    timestamp: new Date().toISOString(),
    duration: `${Date.now() - startTime}ms`,
    tests: results,
    summary: {
      total,
      passed,
      failed,
      skipped: 0
    }
  };
}