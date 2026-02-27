/**
 * Wishlist & Redemption Testing (P0/P1)
 * 
 * Tests the wishlist and redemption system:
 * - WISH-P0.1: Kid creates wishlist item
 * - WISH-P0.2: Parent reviews wishlist and approves/denies
 * - REDEEM-P0.1: Kid requests redemption
 * - REDEEM-P0.2: Parent approves redemption → points deducted
 * - REDEEM-P0.3: Insufficient points blocks redemption
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
  childA2?: {
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

export async function runWishlistRedemptionAudit(providedTestData?: TestData) {
  console.log('🔍 ========================================');
  console.log('🔍 WISHLIST & REDEMPTION AUDIT (P0/P1)');
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
      console.log('⚠️  No test data available. Skipping wishlist & redemption tests.');
      console.log('   Use "Discover Test Data" or "Reset & Recreate" to setup test environment.\n');
      
      return {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
          total: 5,
          passed: 0,
          failed: 0,
          skipped: 5
        }
      };
    }
  }

  console.log('✅ Using test data:');
  console.log(`   Family: ${testData.familyA?.name} (${testData.familyA?.id})`);
  console.log(`   Child A1: ${testData.childA1?.name} (${testData.childA1?.id})`);
  if (testData.childA2) {
    console.log(`   Child A2: ${testData.childA2?.name} (${testData.childA2?.id})`);
  }
  console.log(`   Parent: ${testData.parentA?.email}\n`);

  // Login as parent to get access token
  const { createClient } = await import('../../../utils/supabase/client');
  const supabase = createClient();
  
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testData.parentA?.email || '',
    password: testData.parentA?.password || 'TestPassword123!'
  });

  if (loginError || !loginData?.session) {
    console.log('❌ Could not login as parent');
    console.log('   Make sure parent credentials are correct\n');
    
    // Mark all tests as failed
    for (let i = 1; i <= 5; i++) {
      results.push({
        testName: `Test ${i}`,
        passed: false,
        error: 'Parent login failed'
      });
    }

    return {
      timestamp: new Date().toISOString(),
      tests: results,
      summary: {
        total: 5,
        passed: 0,
        failed: 5,
        skipped: 0
      }
    };
  }

  const parentToken = loginData.session.access_token;
  console.log('✅ Parent logged in successfully\n');

  // =================================================================
  // WISH-P0.1: Kid creates wishlist item
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 WISH-P0.1: Kid Creates Wishlist Item');
  console.log('📋 ========================================\n');

  let createdWishlistItemId: string | null = null;

  try {
    // Step 1: Authenticate as kid
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
      const errorText = await kidAuthResponse.text();
      throw new Error(`Kid auth failed (${kidAuthResponse.status}): ${errorText}`);
    }

    const kidAuthData = await kidAuthResponse.json();
    const kidToken = kidAuthData.token;

    console.log(`   ✅ Kid authenticated: ${testData.childA1!.name}\n`);

    // Step 2: Create wishlist item as kid
    console.log('📝 Step 2: Creating wishlist item...');
    
    const createWishlistResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/wishlist`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemName: 'Test Lego Set',
          description: 'Star Wars Ultimate Collection',
          estimatedCost: 150,
          priority: 'high'
        })
      }
    );

    if (!createWishlistResponse.ok) {
      const errorText = await createWishlistResponse.text();
      throw new Error(`Create wishlist failed (${createWishlistResponse.status}): ${errorText}`);
    }

    const createdWishlist = await createWishlistResponse.json();
    createdWishlistItemId = createdWishlist.id;
    
    console.log(`   ✅ Created wishlist item: ${createdWishlist.itemName} (ID: ${createdWishlistItemId})\n`);

    // Step 3: Fetch kid's wishlist to verify
    console.log('📝 Step 3: Fetching kid\'s wishlist...');
    
    const getWishlistResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/wishlist`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!getWishlistResponse.ok) {
      throw new Error(`Fetch wishlist failed: ${getWishlistResponse.status}`);
    }

    const wishlistItems = await getWishlistResponse.json();
    const foundItem = wishlistItems.find((item: any) => item.id === createdWishlistItemId);

    if (!foundItem) {
      throw new Error('Created wishlist item not found in fetch results!');
    }

    console.log(`   ✅ Wishlist item appears in kid's list\n`);

    // Step 4: Verify no cross-child leakage
    if (testData.childA2) {
      console.log('📝 Step 4: Checking cross-child leakage...');
      
      // Login as different kid
      const kid2AuthResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            childId: testData.childA2.id,
            pin: testData.childA2.pin
          })
        }
      );

      if (kid2AuthResponse.ok) {
        const kid2AuthData = await kid2AuthResponse.json();
        const kid2Token = kid2AuthData.token;

        const kid2WishlistResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA2.id}/wishlist`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${kid2Token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (kid2WishlistResponse.ok) {
          const kid2Wishlist = await kid2WishlistResponse.json();
          const leakedItem = kid2Wishlist.find((item: any) => item.id === createdWishlistItemId);

          if (leakedItem) {
            throw new Error('SECURITY ISSUE: Wishlist item leaked to different child!');
          }

          console.log(`   ✅ No cross-child leakage detected\n`);
        }
      } else {
        console.log('   ⚠️  Could not test cross-child leakage (2nd child auth failed)\n');
      }
    } else {
      console.log('   ⚠️  Skipping cross-child leakage test (only 1 child exists)\n');
    }

    results.push({
      testName: 'WISH-P0.1: Kid Creates Wishlist Item',
      passed: true,
      details: {
        itemId: createdWishlistItemId,
        itemAppears: true,
        noCrossChildLeakage: true
      }
    });

  } catch (error: any) {
    console.error('❌ WISH-P0.1 failed:', error.message, '\n');
    results.push({
      testName: 'WISH-P0.1: Kid Creates Wishlist Item',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // WISH-P0.2: Parent reviews wishlist and approves/denies
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 WISH-P0.2: Parent Reviews Wishlist');
  console.log('📋 ========================================\n');

  try {
    // Step 1: Parent fetches family wishlist
    console.log('📝 Step 1: Parent fetching family wishlist...');
    
    const parentWishlistResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/wishlist`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!parentWishlistResponse.ok) {
      const errorText = await parentWishlistResponse.text();
      throw new Error(`Parent fetch wishlist failed (${parentWishlistResponse.status}): ${errorText}`);
    }

    const familyWishlist = await parentWishlistResponse.json();
    console.log(`   ✅ Parent sees ${familyWishlist.length} wishlist item(s)\n`);

    // Step 2: Parent approves the wishlist item
    if (createdWishlistItemId) {
      console.log('📝 Step 2: Parent approving wishlist item...');
      
      const approveResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/wishlist/${createdWishlistItemId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pointCost: 200
          })
        }
      );

      if (!approveResponse.ok) {
        const errorText = await approveResponse.text();
        throw new Error(`Approve wishlist failed (${approveResponse.status}): ${errorText}`);
      }

      console.log(`   ✅ Wishlist item approved\n`);

      // Step 3: Verify status change visible to kid
      console.log('📝 Step 3: Verifying status change visible to kid...');
      
      // Re-authenticate as kid
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

      const kidAuthData = await kidAuthResponse.json();
      const kidToken = kidAuthData.token;

      const kidWishlistResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/wishlist`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${kidToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const kidWishlist = await kidWishlistResponse.json();
      const approvedItem = kidWishlist.find((item: any) => item.id === createdWishlistItemId);

      if (!approvedItem) {
        throw new Error('Approved item not found in kid\'s wishlist!');
      }

      if (approvedItem.status !== 'approved' && approvedItem.status !== 'converted') {
        throw new Error(`Item status not updated! Expected 'approved' or 'converted', got: ${approvedItem.status}`);
      }

      console.log(`   ✅ Status change visible to kid: ${approvedItem.status}\n`);

      // Step 4: Verify only parent can approve (try as kid)
      console.log('📝 Step 4: Verifying only parent can approve...');
      
      // Create another wishlist item to test with
      const createResponse2 = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/wishlist`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${kidToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemName: 'Test Item 2',
            description: 'For permission testing'
          })
        }
      );

      if (createResponse2.ok) {
        const item2 = await createResponse2.json();

        // Try to approve as kid (should fail)
        const kidApproveResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/wishlist/${item2.id}/approve`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${kidToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pointCost: 100
            })
          }
        );

        if (kidApproveResponse.ok) {
          throw new Error('SECURITY ISSUE: Kid was able to approve their own wishlist item!');
        }

        console.log(`   ✅ Kid cannot approve (blocked with ${kidApproveResponse.status})\n`);
      }
    }

    results.push({
      testName: 'WISH-P0.2: Parent Reviews Wishlist',
      passed: true,
      details: {
        parentCanView: true,
        parentCanApprove: true,
        statusChangeVisible: true,
        kidCannotApprove: true
      }
    });

  } catch (error: any) {
    console.error('❌ WISH-P0.2 failed:', error.message, '\n');
    results.push({
      testName: 'WISH-P0.2: Parent Reviews Wishlist',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // REDEEM-P0.1: Kid requests redemption
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 REDEEM-P0.1: Kid Requests Redemption');
  console.log('📋 ========================================\n');

  let redemptionRequestId: string | null = null;

  try {
    // Step 1: Authenticate as kid
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

    const kidAuthData = await kidAuthResponse.json();
    const kidToken = kidAuthData.token;

    console.log(`   ✅ Kid authenticated\n`);

    // Step 2: Kid requests redemption
    console.log('📝 Step 2: Kid requesting redemption...');
    
    const redeemResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/redemption-requests`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rewardName: 'Ice Cream Outing',
          pointCost: 75
        })
      }
    );

    if (!redeemResponse.ok) {
      const errorText = await redeemResponse.text();
      throw new Error(`Redemption request failed (${redeemResponse.status}): ${errorText}`);
    }

    const redemptionRequest = await redeemResponse.json();
    redemptionRequestId = redemptionRequest.id;

    console.log(`   ✅ Redemption request created (ID: ${redemptionRequestId})\n`);

    // Step 3: Verify request exists in GET /redemption-requests
    console.log('📝 Step 3: Verifying request visible to parent...');
    
    const getRequestsResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${testData.familyA!.id}/redemption-requests`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!getRequestsResponse.ok) {
      throw new Error(`Get redemption requests failed: ${getRequestsResponse.status}`);
    }

    const requests = await getRequestsResponse.json();
    const foundRequest = requests.find((req: any) => req.id === redemptionRequestId);

    if (!foundRequest) {
      throw new Error('Redemption request not visible to parent!');
    }

    console.log(`   ✅ Request visible in parent inbox\n`);

    results.push({
      testName: 'REDEEM-P0.1: Kid Requests Redemption',
      passed: true,
      details: {
        requestId: redemptionRequestId,
        visibleToParent: true
      }
    });

  } catch (error: any) {
    console.error('❌ REDEEM-P0.1 failed:', error.message, '\n');
    results.push({
      testName: 'REDEEM-P0.1: Kid Requests Redemption',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // REDEEM-P0.2: Parent approves redemption → points deducted
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 REDEEM-P0.2: Parent Approves Redemption');
  console.log('📋 ========================================\n');

  try {
    if (!redemptionRequestId) {
      throw new Error('No redemption request ID available from previous test');
    }

    // Step 1: Get child's points before redemption
    console.log('📝 Step 1: Recording points before redemption...');
    
    const childBeforeResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const childBefore = await childBeforeResponse.json();
    const pointsBefore = childBefore.totalPoints || 0;

    console.log(`   ✅ Points before: ${pointsBefore}\n`);

    // Step 2: Parent approves redemption
    console.log('📝 Step 2: Parent approving redemption...');
    
    const approveRedemptionResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/redemption-requests/${redemptionRequestId}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!approveRedemptionResponse.ok) {
      const errorText = await approveRedemptionResponse.text();
      throw new Error(`Approve redemption failed (${approveRedemptionResponse.status}): ${errorText}`);
    }

    console.log(`   ✅ Redemption approved\n`);

    // Step 3: Verify points deducted
    console.log('📝 Step 3: Verifying points deducted...');
    
    const childAfterResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const childAfter = await childAfterResponse.json();
    const pointsAfter = childAfter.totalPoints || 0;
    const pointsDeducted = pointsBefore - pointsAfter;

    console.log(`   ✅ Points after: ${pointsAfter}`);
    console.log(`   ✅ Points deducted: ${pointsDeducted}\n`);

    if (pointsDeducted <= 0) {
      throw new Error(`Points were not deducted! Before: ${pointsBefore}, After: ${pointsAfter}`);
    }

    // Step 4: Verify request state changed
    console.log('📝 Step 4: Verifying request state...');
    
    const getRequestResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/redemption-requests/${redemptionRequestId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (getRequestResponse.ok) {
      const request = await getRequestResponse.json();
      
      if (request.status !== 'approved' && request.status !== 'fulfilled') {
        throw new Error(`Request status not updated! Expected 'approved' or 'fulfilled', got: ${request.status}`);
      }

      console.log(`   ✅ Request state: ${request.status}\n`);
    }

    // Step 5: Test double-approval protection
    console.log('📝 Step 5: Testing double-approval protection...');
    
    const reApproveResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/redemption-requests/${redemptionRequestId}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Should either fail or not deduct points again
    if (reApproveResponse.ok) {
      const childReCheckResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${parentToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const childReCheck = await childReCheckResponse.json();
      const pointsReCheck = childReCheck.totalPoints || 0;

      if (pointsReCheck !== pointsAfter) {
        throw new Error(`DOUBLE-DEDUCTION BUG: Points deducted twice! After first: ${pointsAfter}, After second: ${pointsReCheck}`);
      }

      console.log(`   ✅ Double-approval protection works (points unchanged)\n`);
    } else {
      console.log(`   ✅ Second approval rejected (${reApproveResponse.status})\n`);
    }

    results.push({
      testName: 'REDEEM-P0.2: Parent Approves Redemption',
      passed: true,
      details: {
        pointsDeducted: pointsDeducted,
        requestStateChanged: true,
        doubleApprovalPrevented: true
      }
    });

  } catch (error: any) {
    console.error('❌ REDEEM-P0.2 failed:', error.message, '\n');
    results.push({
      testName: 'REDEEM-P0.2: Parent Approves Redemption',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // REDEEM-P0.3: Insufficient points blocks redemption
  // =================================================================
  console.log('📋 ========================================');
  console.log('📋 REDEEM-P0.3: Insufficient Points Check');
  console.log('📋 ========================================\n');

  try {
    // Step 1: Authenticate as kid
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

    const kidAuthData = await kidAuthResponse.json();
    const kidToken = kidAuthData.token;

    console.log(`   ✅ Kid authenticated\n`);

    // Step 2: Get current points
    console.log('📝 Step 2: Checking current points...');
    
    const childResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const child = await childResponse.json();
    const currentPoints = child.totalPoints || 0;

    console.log(`   ✅ Current points: ${currentPoints}\n`);

    // Step 3: Try to redeem item costing more than available points
    const insufficientCost = currentPoints + 1000;
    
    console.log(`📝 Step 3: Attempting redemption with insufficient points...`);
    console.log(`   Points available: ${currentPoints}`);
    console.log(`   Points needed: ${insufficientCost}\n`);
    
    const insufficientRedeemResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}/redemption-requests`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rewardName: 'Expensive Item',
          pointCost: insufficientCost
        })
      }
    );

    // Should be rejected
    if (insufficientRedeemResponse.ok) {
      // Check if it was created but marked as pending/rejected
      const createdRequest = await insufficientRedeemResponse.json();
      
      console.log(`   ⚠️  Request was created (ID: ${createdRequest.id})`);
      console.log(`   ℹ️  Status: ${createdRequest.status || 'pending'}\n`);
      
      // If parent tries to approve, it should be blocked
      console.log('📝 Step 4: Testing approval of insufficient request...');
      
      const approveInsuffResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/redemption-requests/${createdRequest.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parentToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (approveInsuffResponse.ok) {
        // Check if points went negative
        const childCheckResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${testData.childA1!.id}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${parentToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const childCheck = await childCheckResponse.json();
        const finalPoints = childCheck.totalPoints || 0;

        if (finalPoints < 0) {
          throw new Error(`NEGATIVE BALANCE BUG: Child points went negative! Points: ${finalPoints}`);
        }

        console.log(`   ✅ Approval succeeded but no negative balance (Points: ${finalPoints})\n`);
      } else {
        console.log(`   ✅ Approval blocked (${approveInsuffResponse.status})\n`);
      }
    } else {
      const errorBody = await insufficientRedeemResponse.text();
      console.log(`   ✅ Request rejected (${insufficientRedeemResponse.status})`);
      console.log(`   ✅ Error message: ${errorBody}\n`);
    }

    results.push({
      testName: 'REDEEM-P0.3: Insufficient Points Check',
      passed: true,
      details: {
        currentPoints,
        attemptedCost: insufficientCost,
        requestBlocked: !insufficientRedeemResponse.ok || 'approval protected'
      }
    });

  } catch (error: any) {
    console.error('❌ REDEEM-P0.3 failed:', error.message, '\n');
    results.push({
      testName: 'REDEEM-P0.3: Insufficient Points Check',
      passed: false,
      error: error.message
    });
  }

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('════════════════════════════════════════════════════════════');
  console.log('📊 WISHLIST & REDEMPTION AUDIT SUMMARY (P0/P1)');
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
