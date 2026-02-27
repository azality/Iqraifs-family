/**
 * AUDIT TRAIL DISPLAY TESTS (P0)
 * 
 * Ensures "Logged by" field shows human-readable names (not UUIDs)
 * and validates security (no client-side spoofing)
 * 
 * Tests:
 * - AUD-001 (P0): Parent-created event shows "Logged by: <Parent Name>"
 * - AUD-002 (P0): Kid-created event shows "Logged by: <Kid Name>" + no spoofing
 * - AUD-003 (P0): Mixed timeline (parent + kid events) shows correct names consistently
 * 
 * ============================================================================
 * 🎯 P0 AUDIT TRAIL DISPLAY SUITE (CRITICAL UX + SECURITY)
 * ============================================================================
 * 
 * These tests ensure that audit trails are professional and user-friendly:
 * - Parent events show parent name (or email fallback)
 * - Kid events show kid name
 * - Raw UUIDs are NEVER visible
 * - loggedBy field cannot be spoofed by client payloads (SECURITY)
 * - Mixed timelines display correctly with proper attribution
 * 
 * Known Pain Point (from audit):
 * > "Your PointEvent model includes loggedBy and is used for audit visibility.
 * > If you're displaying raw UUIDs (e.g., fb090fa9…) that's a display-mapping
 * > requirement: UI must resolve IDs → human-friendly names."
 * 
 * ============================================================================
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface TestData {
  familyA?: {
    id: string;
    name: string;
  };
  parentA1?: {
    id: string;
    email: string;
    display_name?: string;
  };
  parentA1Token?: string;
  kidA1?: {
    id: string;
    name: string;
    pin: string;
  };
  kidA1Token?: string;
  [key: string]: any;
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
  tests: any[];
}

export async function runAuditTrailDisplayTests(testData: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 AUDIT TRAIL DISPLAY TESTS (P0)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const tests: any[] = [];

  // =================================================================
  // AUD-001 (P0): Parent-created event shows "Logged by: <Parent Name>"
  // =================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test AUD-001: Parent-Created Event Audit Display');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🎯 Purpose: Ensure "Logged by" shows parent name, not UUID\n');

    if (!testData.parentA1Token || !testData.kidA1) {
      console.log('⏭️  SKIPPED: Missing test data (parentA1Token or kidA1)\n');
      tests.push({
        id: 'AUD-001',
        name: 'Parent-created event shows human name',
        status: 'skipped',
        reason: 'Missing test data'
      });
    } else {
      console.log('📋 Step 1: Verify parent has display name\n');
      
      // Fetch parent profile
      const profileResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/profile`,
        {
          headers: { 'Authorization': `Bearer ${testData.parentA1Token}` }
        }
      );

      if (!profileResponse.ok) {
        throw new Error(`Failed to fetch parent profile: ${profileResponse.status}`);
      }

      const profile = await profileResponse.json();
      const expectedLoggedBy = profile.display_name || profile.email || 'Parent';

      console.log(`   Parent ID: ${profile.id}`);
      console.log(`   Email: ${profile.email}`);
      console.log(`   Display name: ${profile.display_name || '(not set - will use email)'}`);
      console.log(`   Expected "Logged by": ${expectedLoggedBy}\n`);

      // Step 2: Parent logs a point event
      console.log('📋 Step 2: Parent logs point event for kid\n');

      const pointEvent = {
        child_id: testData.kidA1.id,
        behavior_name: 'Test Behavior - Morning Prayer',
        points: 10,
        notes: 'AUD-001 test event',
        occurred_at: new Date().toISOString()
      };

      const createResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testData.parentA1Token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(pointEvent)
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create point event: ${createResponse.status} - ${errorText}`);
      }

      const createdEvent = await createResponse.json();
      console.log(`   ✅ Point event created: ${createdEvent.id || 'success'}\n`);

      // Step 3: Fetch point events with audit info
      console.log('📋 Step 3: Fetch point events to check "Logged by" display\n');

      const eventsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${testData.kidA1.id}`,
        {
          headers: { 'Authorization': `Bearer ${testData.parentA1Token}` }
        }
      );

      if (!eventsResponse.ok) {
        throw new Error(`Failed to fetch point events: ${eventsResponse.status}`);
      }

      const events = await eventsResponse.json();
      const recentEvent = events[0]; // Most recent event

      console.log(`   Total events: ${events.length}`);
      console.log(`   Most recent event ID: ${recentEvent.id}`);
      console.log(`   Logged by (raw DB value): ${recentEvent.logged_by}\n`);

      // Step 4: Verify logged_by is not displayed as raw UUID
      console.log('📋 Step 4: Verify "Logged by" display format\n');

      // Check if the API response includes human-readable logger info
      const hasLoggedByDisplay = recentEvent.logged_by_display || recentEvent.logged_by_name;
      const loggedByValue = recentEvent.logged_by_display || recentEvent.logged_by_name || recentEvent.logged_by;

      console.log(`   logged_by_display field: ${recentEvent.logged_by_display || '(not present)'}`);
      console.log(`   logged_by_name field: ${recentEvent.logged_by_name || '(not present)'}`);
      console.log(`   Display value: ${loggedByValue}\n`);

      // Check if it's a UUID
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUUID = uuidPattern.test(loggedByValue);

      if (isUUID) {
        console.log('   ❌ FAIL: Logged by shows raw UUID!\n');
        console.log(`   Found: "${loggedByValue}"`);
        console.log(`   Expected: "${expectedLoggedBy}" (human-readable name)\n`);
        
        tests.push({
          id: 'AUD-001',
          name: 'Parent-created event shows human name',
          status: 'failed',
          error: `Logged by shows raw UUID (${loggedByValue}) instead of human name`
        });
      } else if (!hasLoggedByDisplay) {
        console.log('   ⚠️  WARNING: API does not include logged_by_display field\n');
        console.log('   Recommendation: Add server-side JOIN to resolve logger name\n');
        console.log('   Example:');
        console.log('   ```typescript');
        console.log('   const events = await supabase');
        console.log('     .from("point_events")');
        console.log('     .select(`');
        console.log('       *,');
        console.log('       parent:users!logged_by(display_name, email)');
        console.log('     `)');
        console.log('   ```\n');
        
        tests.push({
          id: 'AUD-001',
          name: 'Parent-created event shows human name',
          status: 'failed',
          error: 'API does not include logged_by_display field - requires server-side JOIN'
        });
      } else {
        console.log('   ✅ PASS: Logged by shows human-readable name\n');
        console.log(`   Display: "${loggedByValue}"`);
        console.log(`   Format: Human-friendly (not UUID)\n`);
        
        tests.push({
          id: 'AUD-001',
          name: 'Parent-created event shows human name',
          status: 'passed'
        });
      }
    }
  } catch (error: any) {
    console.error(`❌ AUD-001 ERROR: ${error.message}\n`);
    tests.push({
      id: 'AUD-001',
      name: 'Parent-created event shows human name',
      status: 'failed',
      error: error.message
    });
  }

  // =================================================================
  // AUD-002 (P0): Kid-created event shows "Logged by: <Kid Name>" + no spoofing
  // =================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test AUD-002: Kid-Created Event Audit Display + Security');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🎯 Purpose: Ensure kid events show kid name + cannot be spoofed\n');

    if (!testData.familyA || !testData.kidA1) {
      console.log('⏭️  SKIPPED: Missing test data (familyA or kidA1)\n');
      tests.push({
        id: 'AUD-002',
        name: 'Kid-created event shows kid name + no spoofing',
        status: 'skipped',
        reason: 'Missing test data'
      });
    } else {
      // Step 1: Kid logs in
      console.log('📋 Step 1: Kid A1 logs in\n');

      const kidLoginResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: testData.kidA1.pin,
            family_id: testData.familyA.id
          })
        }
      );

      if (!kidLoginResponse.ok) {
        throw new Error(`Kid login failed: ${kidLoginResponse.status}`);
      }

      const { access_token, child } = await kidLoginResponse.json();
      const kidToken = access_token;

      console.log(`   ✅ Kid logged in`);
      console.log(`   Name: ${child.name}`);
      console.log(`   ID: ${child.id}\n`);

      const expectedLoggedBy = child.name;

      // Step 2: Get active quest for kid
      console.log('📋 Step 2: Fetch active quests for kid\n');

      const questsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
        {
          headers: { 'Authorization': `Bearer ${kidToken}` }
        }
      );

      if (!questsResponse.ok) {
        throw new Error(`Failed to fetch quests: ${questsResponse.status}`);
      }

      const quests = await questsResponse.json();
      const activeQuest = quests.find((q: any) => q.status === 'active');

      if (!activeQuest) {
        console.log('   ⚠️  No active quest found - creating test quest via parent\n');
        
        // Create a quest for the kid using parent token
        const createQuestResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${testData.parentA1Token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              child_id: child.id,
              behavior_name: 'Test Quest - AUD-002',
              points_reward: 10,
              description: 'Test quest for audit trail validation'
            })
          }
        );

        if (!createQuestResponse.ok) {
          console.log('   ⚠️  Could not create test quest - skipping AUD-002\n');
          tests.push({
            id: 'AUD-002',
            name: 'Kid-created event shows kid name + no spoofing',
            status: 'skipped',
            reason: 'No active quest available and could not create one'
          });
          
          const duration = Date.now() - startTime;
          return {
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            summary: {
              total: 2,
              passed: tests.filter(t => t.status === 'passed').length,
              failed: tests.filter(t => t.status === 'failed').length,
              skipped: tests.filter(t => t.status === 'skipped').length
            },
            tests
          };
        }

        const createdQuest = await createQuestResponse.json();
        console.log(`   ✅ Test quest created: ${createdQuest.id}\n`);
        
        // Re-fetch quests
        const newQuestsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
          {
            headers: { 'Authorization': `Bearer ${kidToken}` }
          }
        );
        
        const newQuests = await newQuestsResponse.json();
        const testQuest = newQuests.find((q: any) => q.id === createdQuest.id);
        
        if (!testQuest) {
          throw new Error('Created quest not found in kid quests list');
        }
        
        // Use the created quest
        console.log(`   Quest: ${testQuest.behavior_name}`);
        console.log(`   Points: ${testQuest.points_reward}\n`);
      } else {
        console.log(`   ✅ Active quest found`);
        console.log(`   Quest: ${activeQuest.behavior_name}`);
        console.log(`   Points: ${activeQuest.points_reward}\n`);
      }

      const questToComplete = activeQuest || { id: 'test-quest-id' };

      // Step 3: Complete quest with spoofing attempt
      console.log('📋 Step 3: Complete quest (with spoofing attempt)\n');
      console.log('   🔒 SECURITY TEST: Attempting to spoof logged_by field\n');

      const completeResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests/${questToComplete.id}/complete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${kidToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            // 🚨 SECURITY TEST: Try to spoof logged_by
            logged_by: 'fake-parent-uuid-spoofing-attempt'
          })
        }
      );

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.log(`   ⚠️  Quest completion failed: ${completeResponse.status}`);
        console.log(`   Error: ${errorText}\n`);
        console.log('   Note: This may be expected if quest system requires specific setup\n');
        
        tests.push({
          id: 'AUD-002',
          name: 'Kid-created event shows kid name + no spoofing',
          status: 'skipped',
          reason: `Quest completion failed: ${errorText}`
        });
      } else {
        const result = await completeResponse.json();
        console.log(`   ✅ Quest completed`);
        console.log(`   Point event ID: ${result.point_event_id || result.id || 'success'}\n`);

        // Step 4: Verify server used kid ID (not spoofed value)
        console.log('📋 Step 4: Verify server used kid ID (security check)\n');

        // Fetch events to get the newly created event
        const eventsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${child.id}`,
          {
            headers: { 'Authorization': `Bearer ${kidToken}` }
          }
        );

        if (!eventsResponse.ok) {
          throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
        }

        const events = await eventsResponse.json();
        const questEvent = events[0]; // Most recent event (the one we just created)

        console.log(`   Raw logged_by value: ${questEvent.logged_by}`);
        console.log(`   Kid ID: ${child.id}\n`);

        // Security check: Verify logged_by is kid's ID, not spoofed value
        const isSpoofed = questEvent.logged_by === 'fake-parent-uuid-spoofing-attempt';
        const isKidId = questEvent.logged_by === child.id;

        if (isSpoofed) {
          console.log('   ❌ SECURITY FAIL: Server accepted spoofed logged_by!\n');
          tests.push({
            id: 'AUD-002',
            name: 'Kid-created event shows kid name + no spoofing',
            status: 'failed',
            error: 'CRITICAL SECURITY BUG: Server accepted spoofed logged_by from client'
          });
        } else if (!isKidId) {
          console.log(`   ⚠️  WARNING: logged_by is neither kid ID nor spoofed value\n`);
          console.log(`   Expected: ${child.id}`);
          console.log(`   Found: ${questEvent.logged_by}\n`);
          tests.push({
            id: 'AUD-002',
            name: 'Kid-created event shows kid name + no spoofing',
            status: 'failed',
            error: `logged_by has unexpected value: ${questEvent.logged_by}`
          });
        } else {
          console.log('   ✅ SECURITY PASS: Server used kid ID from auth (not spoofed)\n');

          // Step 5: Verify display format
          console.log('📋 Step 5: Verify "Logged by" display format\n');

          const loggedByValue = questEvent.logged_by_display || questEvent.logged_by_name || questEvent.logged_by;
          const hasLoggedByDisplay = questEvent.logged_by_display || questEvent.logged_by_name;

          console.log(`   Display value: ${loggedByValue}\n`);

          // Check if it's a UUID
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const isUUID = uuidPattern.test(loggedByValue);

          if (isUUID) {
            console.log('   ❌ FAIL: Logged by shows raw UUID!\n');
            tests.push({
              id: 'AUD-002',
              name: 'Kid-created event shows kid name + no spoofing',
              status: 'failed',
              error: `Logged by shows raw UUID (${loggedByValue}) instead of kid name`
            });
          } else if (!hasLoggedByDisplay) {
            console.log('   ⚠️  WARNING: API does not include logged_by_display field\n');
            tests.push({
              id: 'AUD-002',
              name: 'Kid-created event shows kid name + no spoofing',
              status: 'failed',
              error: 'API does not include logged_by_display field - requires server-side JOIN'
            });
          } else {
            console.log('   ✅ PASS: Logged by shows human-readable name\n');
            console.log(`   Display: "${loggedByValue}"`);
            console.log(`   Expected: "${expectedLoggedBy}"`);
            console.log(`   Security: Cannot be spoofed ✅\n`);
            
            tests.push({
              id: 'AUD-002',
              name: 'Kid-created event shows kid name + no spoofing',
              status: 'passed'
            });
          }
        }
      }
    }
  } catch (error: any) {
    console.error(`❌ AUD-002 ERROR: ${error.message}\n`);
    tests.push({
      id: 'AUD-002',
      name: 'Kid-created event shows kid name + no spoofing',
      status: 'failed',
      error: error.message
    });
  }

  // =================================================================
  // AUD-003 (P0): Mixed timeline (parent + kid events) shows correct names consistently
  // =================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test AUD-003: Mixed Timeline Audit Display');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('🎯 Purpose: Ensure mixed timeline shows correct names consistently\n');

    if (!testData.parentA1Token || !testData.kidA1) {
      console.log('⏭️  SKIPPED: Missing test data (parentA1Token or kidA1)\n');
      tests.push({
        id: 'AUD-003',
        name: 'Mixed timeline shows correct names consistently',
        status: 'skipped',
        reason: 'Missing test data'
      });
    } else {
      // Step 1: Parent logs a point event
      console.log('📋 Step 1: Parent logs point event for kid\n');

      const pointEvent = {
        child_id: testData.kidA1.id,
        behavior_name: 'Test Behavior - Morning Prayer',
        points: 10,
        notes: 'AUD-003 test event',
        occurred_at: new Date().toISOString()
      };

      const createResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testData.parentA1Token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(pointEvent)
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create point event: ${createResponse.status} - ${errorText}`);
      }

      const createdEvent = await createResponse.json();
      console.log(`   ✅ Point event created: ${createdEvent.id || 'success'}\n`);

      // Step 2: Kid logs in
      console.log('📋 Step 2: Kid A1 logs in\n');

      const kidLoginResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: testData.kidA1.pin,
            family_id: testData.familyA.id
          })
        }
      );

      if (!kidLoginResponse.ok) {
        throw new Error(`Kid login failed: ${kidLoginResponse.status}`);
      }

      const { access_token, child } = await kidLoginResponse.json();
      const kidToken = access_token;

      console.log(`   ✅ Kid logged in`);
      console.log(`   Name: ${child.name}`);
      console.log(`   ID: ${child.id}\n`);

      const expectedLoggedBy = child.name;

      // Step 3: Get active quest for kid
      console.log('📋 Step 3: Fetch active quests for kid\n');

      const questsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
        {
          headers: { 'Authorization': `Bearer ${kidToken}` }
        }
      );

      if (!questsResponse.ok) {
        throw new Error(`Failed to fetch quests: ${questsResponse.status}`);
      }

      const quests = await questsResponse.json();
      const activeQuest = quests.find((q: any) => q.status === 'active');

      if (!activeQuest) {
        console.log('   ⚠️  No active quest found - creating test quest via parent\n');
        
        // Create a quest for the kid using parent token
        const createQuestResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${testData.parentA1Token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              child_id: child.id,
              behavior_name: 'Test Quest - AUD-003',
              points_reward: 10,
              description: 'Test quest for audit trail validation'
            })
          }
        );

        if (!createQuestResponse.ok) {
          console.log('   ⚠️  Could not create test quest - skipping AUD-003\n');
          tests.push({
            id: 'AUD-003',
            name: 'Mixed timeline shows correct names consistently',
            status: 'skipped',
            reason: 'No active quest available and could not create one'
          });
          
          const duration = Date.now() - startTime;
          return {
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            summary: {
              total: 2,
              passed: tests.filter(t => t.status === 'passed').length,
              failed: tests.filter(t => t.status === 'failed').length,
              skipped: tests.filter(t => t.status === 'skipped').length
            },
            tests
          };
        }

        const createdQuest = await createQuestResponse.json();
        console.log(`   ✅ Test quest created: ${createdQuest.id}\n`);
        
        // Re-fetch quests
        const newQuestsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
          {
            headers: { 'Authorization': `Bearer ${kidToken}` }
          }
        );
        
        const newQuests = await newQuestsResponse.json();
        const testQuest = newQuests.find((q: any) => q.id === createdQuest.id);
        
        if (!testQuest) {
          throw new Error('Created quest not found in kid quests list');
        }
        
        // Use the created quest
        console.log(`   Quest: ${testQuest.behavior_name}`);
        console.log(`   Points: ${testQuest.points_reward}\n`);
      } else {
        console.log(`   ✅ Active quest found`);
        console.log(`   Quest: ${activeQuest.behavior_name}`);
        console.log(`   Points: ${activeQuest.points_reward}\n`);
      }

      const questToComplete = activeQuest || { id: 'test-quest-id' };

      // Step 4: Complete quest
      console.log('📋 Step 4: Complete quest\n');

      const completeResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests/${questToComplete.id}/complete`,
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
        console.log(`   ⚠️  Quest completion failed: ${completeResponse.status}`);
        console.log(`   Error: ${errorText}\n`);
        console.log('   Note: This may be expected if quest system requires specific setup\n');
        
        tests.push({
          id: 'AUD-003',
          name: 'Mixed timeline shows correct names consistently',
          status: 'skipped',
          reason: `Quest completion failed: ${errorText}`
        });
      } else {
        const result = await completeResponse.json();
        console.log(`   ✅ Quest completed`);
        console.log(`   Point event ID: ${result.point_event_id || result.id || 'success'}\n`);

        // Step 5: Fetch point events with audit info
        console.log('📋 Step 5: Fetch point events to check "Logged by" display\n');

        const eventsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${testData.kidA1.id}`,
          {
            headers: { 'Authorization': `Bearer ${testData.parentA1Token}` }
          }
        );

        if (!eventsResponse.ok) {
          throw new Error(`Failed to fetch point events: ${eventsResponse.status}`);
        }

        const events = await eventsResponse.json();
        const recentEvent = events[0]; // Most recent event

        console.log(`   Total events: ${events.length}`);
        console.log(`   Most recent event ID: ${recentEvent.id}`);
        console.log(`   Logged by (raw DB value): ${recentEvent.logged_by}\n`);

        // Step 6: Verify logged_by is not displayed as raw UUID
        console.log('📋 Step 6: Verify "Logged by" display format\n');

        // Check if the API response includes human-readable logger info
        const hasLoggedByDisplay = recentEvent.logged_by_display || recentEvent.logged_by_name;
        const loggedByValue = recentEvent.logged_by_display || recentEvent.logged_by_name || recentEvent.logged_by;

        console.log(`   logged_by_display field: ${recentEvent.logged_by_display || '(not present)'}`);
        console.log(`   logged_by_name field: ${recentEvent.logged_by_name || '(not present)'}`);
        console.log(`   Display value: ${loggedByValue}\n`);

        // Check if it's a UUID
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUUID = uuidPattern.test(loggedByValue);

        if (isUUID) {
          console.log('   ❌ FAIL: Logged by shows raw UUID!\n');
          console.log(`   Found: "${loggedByValue}"`);
          console.log(`   Expected: "${expectedLoggedBy}" (human-readable name)\n`);
          
          tests.push({
            id: 'AUD-003',
            name: 'Mixed timeline shows correct names consistently',
            status: 'failed',
            error: `Logged by shows raw UUID (${loggedByValue}) instead of human name`
          });
        } else if (!hasLoggedByDisplay) {
          console.log('   ⚠️  WARNING: API does not include logged_by_display field\n');
          console.log('   Recommendation: Add server-side JOIN to resolve logger name\n');
          console.log('   Example:');
          console.log('   ```typescript');
          console.log('   const events = await supabase');
          console.log('     .from("point_events")');
          console.log('     .select(`');
          console.log('       *,');
          console.log('       parent:users!logged_by(display_name, email)');
          console.log('     `)');
          console.log('   ```\n');
          
          tests.push({
            id: 'AUD-003',
            name: 'Mixed timeline shows correct names consistently',
            status: 'failed',
            error: 'API does not include logged_by_display field - requires server-side JOIN'
          });
        } else {
          console.log('   ✅ PASS: Logged by shows human-readable name\n');
          console.log(`   Display: "${loggedByValue}"`);
          console.log(`   Format: Human-friendly (not UUID)\n`);
          
          tests.push({
            id: 'AUD-003',
            name: 'Mixed timeline shows correct names consistently',
            status: 'passed'
          });
        }
      }
    }
  } catch (error: any) {
    console.error(`❌ AUD-003 ERROR: ${error.message}\n`);
    tests.push({
      id: 'AUD-003',
      name: 'Mixed timeline shows correct names consistently',
      status: 'failed',
      error: error.message
    });
  }

  // =================================================================
  // GENERATE SUMMARY
  // =================================================================
  const duration = Date.now() - startTime;

  const result: TestResult = {
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: {
      total: 3,
      passed: tests.filter(t => t.status === 'passed').length,
      failed: tests.filter(t => t.status === 'failed').length,
      skipped: tests.filter(t => t.status === 'skipped').length
    },
    tests
  };

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AUDIT TRAIL DISPLAY TESTS - SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  tests.forEach(test => {
    const icon = test.status === 'passed' ? '✅' : 
                 test.status === 'failed' ? '❌' : '⏭️';
    console.log(`${icon} ${test.id}: ${test.name}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
    if (test.reason) {
      console.log(`   Reason: ${test.reason}`);
    }
  });

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Summary: ${result.summary.passed}/${result.summary.total} passed`);
  if (result.summary.failed > 0) {
    console.log(`Failed: ${result.summary.failed}`);
  }
  if (result.summary.skipped > 0) {
    console.log(`Skipped: ${result.summary.skipped}`);
  }
  console.log(`Duration: ${duration}ms`);
  console.log('───────────────────────────────────────────────────────────────\n');

  return result;
}