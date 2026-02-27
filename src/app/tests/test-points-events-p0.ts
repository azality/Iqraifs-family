/**
 * POINTS & EVENTS TESTS (P0/P1)
 * 
 * Tests core behavior tracking and point management:
 * - POINT-P0.1: Log positive behavior (points increase)
 * - POINT-P0.2: Log negative behavior (points decrease)
 * - POINT-P0.3: Recovery action (isRecovery + recoveryAction)
 * - POINT-P1.1: Event create rate limiting (100/hour)
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
// HELPER: Login as parent
// ============================================================================

async function loginParent(email: string, password: string): Promise<{ token: string; userId: string } | null> {
  try {
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

// ============================================================================
// HELPER: Get parent's family ID
// ============================================================================

async function getParentFamilyId(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/families`, {
      method: 'GET',
      headers: getHeaders(token)
    });
    
    if (!response.ok) {
      console.error('Failed to fetch families:', response.status);
      return null;
    }
    
    const families = await response.json();
    
    if (!families || families.length === 0) {
      console.error('Parent has no families');
      return null;
    }
    
    // Return the first family's ID
    return families[0].id;
  } catch (error: any) {
    console.error('Exception getting family ID:', error.message);
    return null;
  }
}

// ============================================================================
// HELPER: Get child's current points
// ============================================================================

async function getChildPoints(familyId: string, childId: string, token: string): Promise<number | null> {
  try {
    const response = await fetch(`${API_BASE}/family/${familyId}/children`, {
      method: 'GET',
      headers: getHeaders(token)
    });
    
    if (!response.ok) {
      console.error('Failed to fetch children:', response.status);
      return null;
    }
    
    const children = await response.json();
    const child = children.find((c: any) => c.id === childId);
    
    if (!child) {
      console.error('Child not found in children list');
      return null;
    }
    
    return child.currentPoints || 0;
  } catch (error: any) {
    console.error('Exception getting child points:', error.message);
    return null;
  }
}

// ============================================================================
// POINT-P0.1: Log Positive Behavior (Points Increase)
// ============================================================================

async function testPositiveBehavior(
  familyId: string,
  childId: string,
  parentToken: string,
  parentUserId: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 POINT-P0.1: Testing positive behavior (points increase)...');

  // Step 1: Get initial points
  console.log('   Step 1: Get child initial points...');
  const initialPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (initialPoints === null) {
    issues.push('Could not fetch initial child points');
    return { passed: false, message: 'Failed to get initial points', issues };
  }
  
  details.initialPoints = initialPoints;
  console.log(`   ✓ Initial points: ${initialPoints}`);

  // Step 2: Log positive event (+10 points)
  console.log('   Step 2: Log positive behavior event (+10 points)...');
  const pointsToAdd = 10;
  
  try {
    const eventResponse = await fetch(`${API_BASE}/family/${familyId}/point-events`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId,
        points: pointsToAdd,
        behaviorType: 'positive',
        description: 'Completed homework on time',
        isRecovery: false
      })
    });
    
    if (!eventResponse.ok) {
      const errorText = await eventResponse.text();
      issues.push(`Event creation failed: ${eventResponse.status} - ${errorText}`);
      allPassed = false;
      return { passed: false, message: 'Failed to create positive event', issues };
    }
    
    const eventData = await eventResponse.json();
    details.eventId = eventData.id;
    details.eventCreated = eventData;
    
    console.log(`   ✓ Event created: ${eventData.id}`);
  } catch (error: any) {
    issues.push(`Exception creating event: ${error.message}`);
    return { passed: false, message: 'Exception during event creation', issues };
  }

  // Step 3: Wait a moment for points to update
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 4: Get updated points
  console.log('   Step 3: Get child updated points...');
  const updatedPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (updatedPoints === null) {
    issues.push('Could not fetch updated child points');
    allPassed = false;
  } else {
    details.updatedPoints = updatedPoints;
    details.expectedPoints = initialPoints + pointsToAdd;
    details.actualIncrease = updatedPoints - initialPoints;
    
    console.log(`   ✓ Updated points: ${updatedPoints}`);
    
    // Verify points increased correctly
    if (updatedPoints !== initialPoints + pointsToAdd) {
      issues.push(`Points mismatch: expected ${initialPoints + pointsToAdd}, got ${updatedPoints}`);
      allPassed = false;
    } else {
      console.log(`   ✓ Points increased correctly by ${pointsToAdd}`);
    }
  }

  // Step 5: Verify event was logged with correct metadata
  console.log('   Step 4: Verify event metadata...');
  try {
    const eventsResponse = await fetch(
      `${API_BASE}/family/${familyId}/events?childId=${childId}`,
      {
        method: 'GET',
        headers: getHeaders(parentToken)
      }
    );
    
    if (!eventsResponse.ok) {
      issues.push(`Could not fetch events: ${eventsResponse.status}`);
      allPassed = false;
    } else {
      const events = await eventsResponse.json();
      const latestEvent = events[0]; // Should be most recent
      
      if (!latestEvent) {
        issues.push('No events found after creation');
        allPassed = false;
      } else {
        details.latestEvent = latestEvent;
        
        // Verify loggedBy
        if (latestEvent.loggedBy !== parentUserId) {
          issues.push(`loggedBy mismatch: expected ${parentUserId}, got ${latestEvent.loggedBy}`);
          allPassed = false;
        } else {
          console.log(`   ✓ loggedBy correct: ${latestEvent.loggedBy}`);
        }
        
        // Verify points
        if (latestEvent.points !== pointsToAdd) {
          issues.push(`Event points mismatch: expected ${pointsToAdd}, got ${latestEvent.points}`);
          allPassed = false;
        } else {
          console.log(`   ✓ Event points correct: ${latestEvent.points}`);
        }
        
        // Verify timestamp exists
        if (!latestEvent.timestamp) {
          issues.push('Event missing timestamp');
          allPassed = false;
        } else {
          console.log(`   ✓ Event timestamp: ${latestEvent.timestamp}`);
        }
      }
    }
  } catch (error: any) {
    issues.push(`Exception verifying event: ${error.message}`);
    allPassed = false;
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Positive behavior logging works correctly' 
      : 'Positive behavior logging has issues',
    issues,
    details
  };
}

// ============================================================================
// POINT-P0.2: Log Negative Behavior (Points Decrease)
// ============================================================================

async function testNegativeBehavior(
  familyId: string,
  childId: string,
  parentToken: string,
  parentUserId: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 POINT-P0.2: Testing negative behavior (points decrease)...');

  // Step 1: Get initial points
  console.log('   Step 1: Get child initial points...');
  const initialPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (initialPoints === null) {
    issues.push('Could not fetch initial child points');
    return { passed: false, message: 'Failed to get initial points', issues };
  }
  
  details.initialPoints = initialPoints;
  console.log(`   ✓ Initial points: ${initialPoints}`);

  // Step 2: Log negative event (-5 points)
  console.log('   Step 2: Log negative behavior event (-5 points)...');
  const pointsToDeduct = -5;
  
  try {
    const eventResponse = await fetch(`${API_BASE}/family/${familyId}/point-events`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId,
        points: pointsToDeduct,
        behaviorType: 'negative',
        description: 'Forgot to clean room',
        isRecovery: false
      })
    });
    
    if (!eventResponse.ok) {
      const errorText = await eventResponse.text();
      issues.push(`Event creation failed: ${eventResponse.status} - ${errorText}`);
      allPassed = false;
      return { passed: false, message: 'Failed to create negative event', issues };
    }
    
    const eventData = await eventResponse.json();
    details.eventId = eventData.id;
    details.eventCreated = eventData;
    
    console.log(`   ✓ Event created: ${eventData.id}`);
  } catch (error: any) {
    issues.push(`Exception creating event: ${error.message}`);
    return { passed: false, message: 'Exception during event creation', issues };
  }

  // Step 3: Wait a moment for points to update
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 4: Get updated points
  console.log('   Step 3: Get child updated points...');
  const updatedPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (updatedPoints === null) {
    issues.push('Could not fetch updated child points');
    allPassed = false;
  } else {
    details.updatedPoints = updatedPoints;
    details.expectedPoints = initialPoints + pointsToDeduct;
    details.actualDecrease = initialPoints - updatedPoints;
    
    console.log(`   ✓ Updated points: ${updatedPoints}`);
    
    // Verify points decreased correctly
    if (updatedPoints !== initialPoints + pointsToDeduct) {
      issues.push(`Points mismatch: expected ${initialPoints + pointsToDeduct}, got ${updatedPoints}`);
      allPassed = false;
    } else {
      console.log(`   ✓ Points decreased correctly by ${Math.abs(pointsToDeduct)}`);
    }
    
    // Check if negative points are allowed
    if (updatedPoints < 0) {
      console.log(`   ℹ️  Note: Points can go negative (current: ${updatedPoints})`);
      details.allowsNegativePoints = true;
    } else {
      details.allowsNegativePoints = false;
    }
  }

  // Step 5: Verify event recorded with negative points
  console.log('   Step 4: Verify negative event recorded...');
  try {
    const eventsResponse = await fetch(
      `${API_BASE}/family/${familyId}/events?childId=${childId}`,
      {
        method: 'GET',
        headers: getHeaders(parentToken)
      }
    );
    
    if (!eventsResponse.ok) {
      issues.push(`Could not fetch events: ${eventsResponse.status}`);
      allPassed = false;
    } else {
      const events = await eventsResponse.json();
      const latestEvent = events[0]; // Should be most recent
      
      if (!latestEvent) {
        issues.push('No events found after creation');
        allPassed = false;
      } else {
        details.latestEvent = latestEvent;
        
        // Verify points are negative
        if (latestEvent.points !== pointsToDeduct) {
          issues.push(`Event points mismatch: expected ${pointsToDeduct}, got ${latestEvent.points}`);
          allPassed = false;
        } else {
          console.log(`   ✓ Event recorded with negative points: ${latestEvent.points}`);
        }
        
        // Verify behaviorType
        if (latestEvent.behaviorType !== 'negative') {
          issues.push(`behaviorType should be 'negative', got ${latestEvent.behaviorType}`);
          allPassed = false;
        } else {
          console.log(`   ✓ behaviorType correct: ${latestEvent.behaviorType}`);
        }
      }
    }
  } catch (error: any) {
    issues.push(`Exception verifying event: ${error.message}`);
    allPassed = false;
  }

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Negative behavior logging works correctly' 
      : 'Negative behavior logging has issues',
    issues,
    details
  };
}

// ============================================================================
// POINT-P0.3: Recovery Action (isRecovery + recoveryAction)
// ============================================================================

async function testRecoveryAction(
  familyId: string,
  childId: string,
  parentToken: string,
  parentUserId: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 POINT-P0.3: Testing recovery action (isRecovery + recoveryAction)...');

  // Step 1: Get initial points
  console.log('   Step 1: Get child initial points...');
  const initialPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (initialPoints === null) {
    issues.push('Could not fetch initial child points');
    return { passed: false, message: 'Failed to get initial points', issues };
  }
  
  details.initialPoints = initialPoints;
  console.log(`   ✓ Initial points: ${initialPoints}`);

  // Step 2: Log recovery event
  console.log('   Step 2: Log recovery action event...');
  
  // Recovery logic: Restore 50% of deducted points
  // If child lost 10 points, recovery gives back 5
  const recoveryPoints = 3; // Partial restoration
  const recoveryAction = 'apology';
  
  try {
    const eventResponse = await fetch(`${API_BASE}/family/${familyId}/point-events`, {
      method: 'POST',
      headers: getHeaders(parentToken),
      body: JSON.stringify({
        childId,
        points: recoveryPoints,
        behaviorType: 'recovery',
        description: 'Apologized and cleaned room',
        isRecovery: true,
        recoveryAction: recoveryAction
      })
    });
    
    if (!eventResponse.ok) {
      const errorText = await eventResponse.text();
      issues.push(`Recovery event creation failed: ${eventResponse.status} - ${errorText}`);
      allPassed = false;
      return { passed: false, message: 'Failed to create recovery event', issues };
    }
    
    const eventData = await eventResponse.json();
    details.eventId = eventData.id;
    details.eventCreated = eventData;
    
    console.log(`   ✓ Recovery event created: ${eventData.id}`);
  } catch (error: any) {
    issues.push(`Exception creating recovery event: ${error.message}`);
    return { passed: false, message: 'Exception during recovery event creation', issues };
  }

  // Step 3: Wait a moment for points to update
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 4: Get updated points
  console.log('   Step 3: Get child updated points...');
  const updatedPoints = await getChildPoints(familyId, childId, parentToken);
  
  if (updatedPoints === null) {
    issues.push('Could not fetch updated child points');
    allPassed = false;
  } else {
    details.updatedPoints = updatedPoints;
    details.expectedPoints = initialPoints + recoveryPoints;
    details.actualIncrease = updatedPoints - initialPoints;
    
    console.log(`   ✓ Updated points: ${updatedPoints}`);
    
    // Verify points restored correctly
    if (updatedPoints !== initialPoints + recoveryPoints) {
      issues.push(`Points mismatch: expected ${initialPoints + recoveryPoints}, got ${updatedPoints}`);
      allPassed = false;
    } else {
      console.log(`   ✓ Points restored correctly by ${recoveryPoints}`);
    }
  }

  // Step 5: Verify event has isRecovery=true and recoveryAction
  console.log('   Step 4: Verify recovery event metadata...');
  try {
    const eventsResponse = await fetch(
      `${API_BASE}/family/${familyId}/events?childId=${childId}`,
      {
        method: 'GET',
        headers: getHeaders(parentToken)
      }
    );
    
    if (!eventsResponse.ok) {
      issues.push(`Could not fetch events: ${eventsResponse.status}`);
      allPassed = false;
    } else {
      const events = await eventsResponse.json();
      const latestEvent = events[0]; // Should be most recent
      
      if (!latestEvent) {
        issues.push('No events found after creation');
        allPassed = false;
      } else {
        details.latestEvent = latestEvent;
        
        // Verify isRecovery flag
        if (latestEvent.isRecovery !== true) {
          issues.push(`isRecovery should be true, got ${latestEvent.isRecovery}`);
          allPassed = false;
        } else {
          console.log(`   ✓ isRecovery flag correct: true`);
        }
        
        // Verify recoveryAction exists
        if (!latestEvent.recoveryAction) {
          issues.push('recoveryAction missing from event');
          allPassed = false;
        } else if (latestEvent.recoveryAction !== recoveryAction) {
          issues.push(`recoveryAction mismatch: expected ${recoveryAction}, got ${latestEvent.recoveryAction}`);
          allPassed = false;
        } else {
          console.log(`   ✓ recoveryAction correct: ${latestEvent.recoveryAction}`);
        }
        
        // Verify points are positive (recovery adds points)
        if (latestEvent.points <= 0) {
          issues.push('Recovery event should have positive points');
          allPassed = false;
        } else {
          console.log(`   ✓ Recovery points correct: +${latestEvent.points}`);
        }
      }
    }
  } catch (error: any) {
    issues.push(`Exception verifying recovery event: ${error.message}`);
    allPassed = false;
  }

  // Document recovery logic
  console.log('   ℹ️  Recovery Logic: Partial restoration (+3 points for apology)');
  details.recoveryLogic = 'Partial restoration: +3 points for apology action';

  return {
    passed: allPassed,
    message: allPassed 
      ? 'Recovery action system works correctly' 
      : 'Recovery action system has issues',
    issues,
    details
  };
}

// ============================================================================
// POINT-P1.1: Event Create Rate Limiting (100/hour)
// ============================================================================

async function testEventRateLimiting(
  familyId: string,
  childId: string,
  parentToken: string
): Promise<{ passed: boolean; message: string; issues: string[]; details?: any }> {
  const issues: string[] = [];
  let allPassed = true;
  const details: any = {};

  console.log('📝 POINT-P1.1: Testing event creation rate limiting (100/hour)...');
  console.log('   ⚠️  This test creates many events rapidly...');

  // We'll create events until we hit rate limit or reach 105 attempts
  const MAX_ATTEMPTS = 105; // Should hit 100/hour limit
  let successCount = 0;
  let rateLimitHit = false;
  let rateLimitStatus = 0;
  
  details.attempts = [];

  console.log(`   Creating events rapidly (max ${MAX_ATTEMPTS} attempts)...`);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const eventResponse = await fetch(`${API_BASE}/family/${familyId}/point-events`, {
        method: 'POST',
        headers: getHeaders(parentToken),
        body: JSON.stringify({
          childId,
          points: 1,
          behaviorType: 'positive',
          description: `Rate limit test event ${i + 1}`,
          isRecovery: false
        })
      });
      
      if (eventResponse.ok) {
        successCount++;
        
        // Log progress every 20 events
        if ((i + 1) % 20 === 0) {
          console.log(`      Progress: ${i + 1} events created...`);
        }
      } else {
        // Check if it's a rate limit error
        if (eventResponse.status === 429) {
          rateLimitHit = true;
          rateLimitStatus = 429;
          console.log(`   ✓ Rate limit hit after ${successCount} successful events (status: 429)`);
          details.rateLimitHitAt = successCount;
          break;
        } else if (eventResponse.status === 503) {
          // Some systems use 503 for rate limiting
          rateLimitHit = true;
          rateLimitStatus = 503;
          console.log(`   ✓ Rate limit hit after ${successCount} successful events (status: 503)`);
          details.rateLimitHitAt = successCount;
          break;
        } else {
          // Other error
          console.log(`   ⚠️  Event ${i + 1} failed with status ${eventResponse.status}`);
          const errorText = await eventResponse.text();
          issues.push(`Event ${i + 1} failed: ${eventResponse.status} - ${errorText}`);
          
          // If we get consistent failures, stop
          if (i > 10 && successCount === 0) {
            issues.push('Could not create any events - test cannot proceed');
            return { passed: false, message: 'Event creation failed entirely', issues, details };
          }
        }
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 10));
      
    } catch (error: any) {
      console.log(`   ⚠️  Exception on event ${i + 1}: ${error.message}`);
      break;
    }
  }

  details.totalSuccessful = successCount;
  details.rateLimitHit = rateLimitHit;
  details.rateLimitStatus = rateLimitStatus;

  // Analyze results
  console.log('');
  console.log('   📊 Rate Limiting Test Results:');
  console.log(`      Successful events created: ${successCount}`);
  console.log(`      Rate limit hit: ${rateLimitHit ? 'Yes' : 'No'}`);
  
  if (rateLimitHit) {
    console.log(`      Rate limit status: ${rateLimitStatus}`);
    console.log(`      Threshold: ~${details.rateLimitHitAt} events`);
    
    // Verify threshold is reasonable (should be around 100)
    if (details.rateLimitHitAt < 80 || details.rateLimitHitAt > 120) {
      issues.push(`Rate limit threshold unexpected: ${details.rateLimitHitAt} (expected ~100)`);
      console.log(`      ⚠️  Threshold seems off (expected ~100)`);
    } else {
      console.log(`      ✓ Threshold reasonable (expected ~100/hour)`);
    }
  } else {
    console.log(`      ⚠️  No rate limit detected after ${successCount} events`);
    issues.push('Rate limiting may not be configured (100/hour expected)');
    allPassed = false;
  }

  // Note: This is a P1 test, so it's informational
  // Rate limiting not being configured is a warning, not a blocker
  return {
    passed: allPassed,
    message: rateLimitHit 
      ? 'Event rate limiting working correctly' 
      : 'Event rate limiting not detected (P1 - informational)',
    issues,
    details
  };
}

// ============================================================================
// MAIN POINTS & EVENTS AUDIT RUNNER
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

export async function runPointsEventsAudit(existingTestData?: TestData) {
  console.log('🔍 ========================================');
  console.log('🔍 POINTS & EVENTS AUDIT (P0/P1)');
  console.log('🔍 ========================================\n');

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 4,
      passed: 0,
      failed: 0,
      warnings: 0,
      skipped: 0
    }
  };

  // Check if we have test data
  let testData = existingTestData;
  
  if (!testData?.parentA?.email || !testData?.familyA?.id) {
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
  
  if (!testData?.parentA?.email || !testData?.familyA?.id || !testData?.childA1?.id) {
    console.log('⚠️  No test data available. Skipping points & events tests.');
    console.log('   Use "Discover Test Data" or "Reset & Recreate" to setup test environment.\n');
    
    results.summary.skipped = 4;
    results.tests.push(
      {
        id: 'POINT-P0.1',
        category: 'Points & Events',
        name: 'Log positive behavior (points increase)',
        passed: false,
        message: 'Skipped - no test data',
        issues: ['Click "Discover Test Data" or "Reset & Recreate"']
      },
      {
        id: 'POINT-P0.2',
        category: 'Points & Events',
        name: 'Log negative behavior (points decrease)',
        passed: false,
        message: 'Skipped - no test data',
        issues: ['Click "Discover Test Data" or "Reset & Recreate"']
      },
      {
        id: 'POINT-P0.3',
        category: 'Points & Events',
        name: 'Recovery action (isRecovery + recoveryAction)',
        passed: false,
        message: 'Skipped - no test data',
        issues: ['Click "Discover Test Data" or "Reset & Recreate"']
      },
      {
        id: 'POINT-P1.1',
        category: 'Points & Events',
        name: 'Event create rate limiting (100/hour)',
        passed: false,
        message: 'Skipped - no test data',
        issues: ['Click "Discover Test Data" or "Reset & Recreate"']
      }
    );
    
    console.log('═'.repeat(60));
    console.log('📊 POINTS & EVENTS AUDIT SUMMARY (P0/P1)');
    console.log('═'.repeat(60));
    console.log(`Total Tests:     ${results.summary.total}`);
    console.log(`⏭️  Skipped:      ${results.summary.skipped}`);
    console.log('═'.repeat(60) + '\n');
    
    return results;
  }

  // Login as parent
  console.log('🔐 Logging in as parent...\n');
  const parentAuth = await loginParent(testData.parentA.email, testData.parentA.password || 'TestPassword123!');
  
  if (!parentAuth) {
    console.log('❌ Could not login as parent. Skipping tests.\n');
    results.summary.skipped = 4;
    return results;
  }
  
  console.log('✅ Parent logged in\n');

  // Get parent's actual family ID (instead of using potentially corrupt localStorage data)
  console.log('🔍 Fetching parent\'s family ID...\n');
  const actualFamilyId = await getParentFamilyId(parentAuth.token);
  
  if (!actualFamilyId) {
    console.log('❌ Could not get family ID. Parent may not have a family.\n');
    results.summary.skipped = 4;
    return results;
  }
  
  console.log(`✅ Family ID: ${actualFamilyId}\n`);
  
  // Get children to find the first child
  let childId = testData.childA1.id;
  
  try {
    const childrenResponse = await fetch(`${API_BASE}/family/${actualFamilyId}/children`, {
      method: 'GET',
      headers: getHeaders(parentAuth.token)
    });
    
    if (childrenResponse.ok) {
      const children = await childrenResponse.json();
      if (children && children.length > 0) {
        childId = children[0].id;
        console.log(`✅ Using child: ${children[0].name} (${childId})\n`);
      }
    }
  } catch (error) {
    console.log('⚠️  Could not fetch children, using provided child ID\n');
  }

  // Test 1: Positive behavior
  console.log('');
  const positiveResult = await testPositiveBehavior(
    actualFamilyId,
    childId,
    parentAuth.token,
    parentAuth.userId
  );
  
  results.tests.push({
    id: 'POINT-P0.1',
    category: 'Points & Events',
    name: 'Log positive behavior (points increase)',
    ...positiveResult
  });
  
  if (positiveResult.passed) results.summary.passed++;
  else results.summary.failed++;

  // Test 2: Negative behavior
  console.log('');
  const negativeResult = await testNegativeBehavior(
    actualFamilyId,
    childId,
    parentAuth.token,
    parentAuth.userId
  );
  
  results.tests.push({
    id: 'POINT-P0.2',
    category: 'Points & Events',
    name: 'Log negative behavior (points decrease)',
    ...negativeResult
  });
  
  if (negativeResult.passed) results.summary.passed++;
  else results.summary.failed++;

  // Test 3: Recovery action
  console.log('');
  const recoveryResult = await testRecoveryAction(
    actualFamilyId,
    childId,
    parentAuth.token,
    parentAuth.userId
  );
  
  results.tests.push({
    id: 'POINT-P0.3',
    category: 'Points & Events',
    name: 'Recovery action (isRecovery + recoveryAction)',
    ...recoveryResult
  });
  
  if (recoveryResult.passed) results.summary.passed++;
  else results.summary.failed++;

  // Test 4: Rate limiting (P1 - informational)
  console.log('');
  const rateLimitResult = await testEventRateLimiting(
    actualFamilyId,
    childId,
    parentAuth.token
  );
  
  results.tests.push({
    id: 'POINT-P1.1',
    category: 'Points & Events',
    name: 'Event create rate limiting (100/hour)',
    ...rateLimitResult
  });
  
  if (rateLimitResult.passed) results.summary.passed++;
  else results.summary.warnings++; // P1 is warning, not failure

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 POINTS & EVENTS AUDIT SUMMARY (P0/P1)');
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
    const icon = test.passed ? '✅' : (test.message.includes('Skipped') ? '⏭️' : (test.id.includes('P1') ? '⚠️' : '❌'));
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
        if (typeof test.details[key] !== 'object') {
          console.log(`     - ${key}: ${test.details[key]}`);
        }
      });
    }
    
    console.log('');
  }

  return results;
}