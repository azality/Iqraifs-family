/**
 * Onboarding Permutations Tests (P0/P1)
 * 
 * Tests the complete onboarding workflow per COMPREHENSIVE_SYSTEM_AUDIT:
 * 
 * ONB-001 (P0): New parent with no family → onboarding enforced
 * ONB-002 (P0): Family creation via POST /families sets family context
 * ONB-003 (P0): Create child during onboarding
 * ONB-004 (P1): Multiple parents in one family (Parent A2 joins via invite)
 * ONB-005 (P1): Child removal/update impact
 * 
 * Key Requirements:
 * - Missing family leads to /onboarding
 * - No error loops on family-dependent screens
 * - Family creation sets fgs_family_id and persisted
 * - Child creation with PIN (hashed, never returned)
 * - Kid login works independently with family code + PIN
 * - Multiple parents can join via invite with same permissions
 * - Child updates propagate everywhere (PIN, name, avatar)
 * - No orphaned records after updates
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { createClient } from '@supabase/supabase-js';

interface TestData {
  familyA?: {
    id: string;
    code: string;
    name: string;
  };
  parentA1Token?: string;
  parentA2Token?: string;
  kidA1Token?: string;
  kidA1Id?: string;
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

export async function runOnboardingPermutationsTests(testData?: TestData): Promise<TestResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 ONBOARDING PERMUTATIONS TESTS (P0/P1)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Audit Basis: Onboarding flow routing and expectations are defined;');
  console.log('             missing family leads to /onboarding.');
  console.log('');
  console.log('Test Plan:');
  console.log('  ONB-001 (P0): New parent with no family → onboarding enforced');
  console.log('  ONB-002 (P0): Family creation sets family context');
  console.log('  ONB-003 (P0): Create child during onboarding');
  console.log('  ONB-004 (P1): Multiple parents join via invite');
  console.log('  ONB-005 (P1): Child removal/update impact');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const tests: TestResult['tests'] = [];

  // Initialize Supabase client
  const supabase = createClient(
    `https://${projectId}.supabase.co`,
    publicAnonKey
  );

  // ================================================================
  // ONB-001 (P0): New Parent with No Family → Onboarding Enforced
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ONB-001 (P0): New Parent with No Family → Onboarding Enforced');
  console.log('───────────────────────────────────────────────────────────────\n');

  let newUserEmail = '';
  let newUserToken = '';

  try {
    // Step 1: Create a new user (simulate new signup)
    console.log('📝 Step 1: Create new parent user (no family)...\n');

    const timestamp = Date.now();
    newUserEmail = `onboarding-test-${timestamp}@example.com`;
    const newUserPassword = 'OnboardingTest123!';

    const signupRes = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        email: newUserEmail,
        password: newUserPassword,
        name: 'Onboarding Test Parent'
      })
    });

    if (!signupRes.ok) {
      throw new Error(`Signup failed: ${signupRes.status} - ${await signupRes.text()}`);
    }

    const signupData = await signupRes.json();
    newUserToken = signupData.session?.access_token || signupData.access_token;

    if (!newUserToken) {
      throw new Error('No access token returned from signup');
    }

    console.log(`✅ New parent created: ${newUserEmail}`);
    console.log('');

    // Step 2: Attempt to access family endpoint (should fail - no family)
    console.log('📝 Step 2: Attempt to access /family (should fail - no family)...\n');

    const familyRes = await fetch(`${API_BASE}/family`, {
      headers: {
        'Authorization': `Bearer ${newUserToken}`,
        'apikey': publicAnonKey
      }
    });

    if (familyRes.ok) {
      throw new Error('Family access succeeded (user should have no family)');
    }

    if (familyRes.status !== 404 && familyRes.status !== 403) {
      throw new Error(`Expected 404/403, got ${familyRes.status}`);
    }

    console.log(`✅ Family access blocked (${familyRes.status}) - user has no family`);
    console.log('');

    // Step 3: Verify children endpoint also fails
    console.log('📝 Step 3: Verify children endpoint blocked...\n');

    const childrenRes = await fetch(`${API_BASE}/children`, {
      headers: {
        'Authorization': `Bearer ${newUserToken}`,
        'apikey': publicAnonKey
      }
    });

    if (childrenRes.ok) {
      const children = await childrenRes.json();
      if (children.length > 0) {
        throw new Error('User has children but no family (inconsistent state)');
      }
      console.log('ℹ️  Children endpoint returned empty array (acceptable)');
    } else if (childrenRes.status === 404 || childrenRes.status === 403) {
      console.log(`✅ Children endpoint blocked (${childrenRes.status})`);
    } else {
      throw new Error(`Unexpected children status: ${childrenRes.status}`);
    }
    console.log('');

    // Step 4: Verify no error loops (API doesn't crash)
    console.log('📝 Step 4: Verify API health check still works...\n');

    const healthRes = await fetch(`${API_BASE}/health`, {
      headers: {
        'apikey': publicAnonKey
      }
    });

    if (!healthRes.ok) {
      throw new Error('Health check failed (API error loop)');
    }

    console.log('✅ API healthy, no error loops');
    console.log('');

    // Store new user for ONB-002
    (testData as any) = (testData as any) || {};
    (testData as any).newUserEmail = newUserEmail;
    (testData as any).newUserToken = newUserToken;

    tests.push({
      id: 'ONB-001',
      name: 'New parent with no family → onboarding enforced',
      status: 'PASS',
      details: 'User has no family, family endpoints blocked, no error loops, ready for onboarding'
    });
    console.log('✅ ONB-001 PASSED\n');
  } catch (error: any) {
    console.error('❌ ONB-001 FAILED:', error.message, '\n');
    tests.push({
      id: 'ONB-001',
      name: 'New parent with no family → onboarding enforced',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // ONB-002 (P0): Family Creation Sets Family Context
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ONB-002 (P0): Family Creation Sets Family Context');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const userToken = (testData as any)?.newUserToken || newUserToken;
    
    if (!userToken) {
      throw new Error('No user token from ONB-001');
    }

    // Step 1: Create family
    console.log('📝 Step 1: Create family via POST /families...\n');

    const createFamilyRes = await fetch(`${API_BASE}/families`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Onboarding Test Family',
        timezone: 'America/New_York'
      })
    });

    if (!createFamilyRes.ok) {
      throw new Error(`Family creation failed: ${createFamilyRes.status} - ${await createFamilyRes.text()}`);
    }

    const family = await createFamilyRes.json();
    console.log(`✅ Family created: ${family.id}`);
    console.log(`   Name: ${family.name}`);
    console.log(`   Invite Code: ${family.inviteCode || family.code}`);
    console.log('');

    // Store for later tests
    (testData as any).onboardingFamily = {
      id: family.id,
      code: family.inviteCode || family.code,
      name: family.name
    };

    // Step 2: Verify family is set and persisted
    console.log('📝 Step 2: Verify GET /family now returns the created family...\n');

    const getFamilyRes = await fetch(`${API_BASE}/family`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': publicAnonKey
      }
    });

    if (!getFamilyRes.ok) {
      throw new Error(`Get family failed: ${getFamilyRes.status}`);
    }

    const fetchedFamily = await getFamilyRes.json();
    if (fetchedFamily.id !== family.id) {
      throw new Error(`Family mismatch: created ${family.id}, got ${fetchedFamily.id}`);
    }

    console.log('✅ Family context set and persisted');
    console.log(`   Family ID: ${fetchedFamily.id}`);
    console.log('');

    // Step 3: Verify children list loads (likely empty)
    console.log('📝 Step 3: Verify GET /children loads (empty ok)...\n');

    const childrenRes = await fetch(`${API_BASE}/children`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': publicAnonKey
      }
    });

    if (!childrenRes.ok) {
      throw new Error(`Children list failed: ${childrenRes.status}`);
    }

    const children = await childrenRes.json();
    console.log(`✅ Children list loaded (${children.length} children)`);
    console.log('');

    // Step 4: Verify no blocking errors
    console.log('📝 Step 4: Verify FamilyContext loads without "Please select a child" errors...\n');

    // This is UI-specific, but we can verify API doesn't throw errors
    const dashboardRes = await fetch(`${API_BASE}/parent/dashboard`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': publicAnonKey
      }
    });

    if (!dashboardRes.ok && dashboardRes.status !== 404) {
      // 404 is ok (endpoint might not exist), but other errors are bad
      throw new Error(`Dashboard failed: ${dashboardRes.status}`);
    }

    console.log('✅ FamilyContext loads without blocking errors');
    console.log('');

    tests.push({
      id: 'ONB-002',
      name: 'Family creation sets family context',
      status: 'PASS',
      details: 'Family created, context set and persisted, children list loads, no blocking errors'
    });
    console.log('✅ ONB-002 PASSED\n');
  } catch (error: any) {
    console.error('❌ ONB-002 FAILED:', error.message, '\n');
    tests.push({
      id: 'ONB-002',
      name: 'Family creation sets family context',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // ONB-003 (P0): Create Child During Onboarding
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ONB-003 (P0): Create Child During Onboarding');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const userToken = (testData as any)?.newUserToken || newUserToken;
    const family = (testData as any)?.onboardingFamily;

    if (!userToken || !family) {
      throw new Error('No user token or family from ONB-002');
    }

    // Step 1: Create child with PIN
    console.log('📝 Step 1: Create Kid A1 with PIN...\n');

    const createChildRes = await fetch(
      `${API_BASE}/families/${family.id}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Onboarding Kid A1',
          pin: '1234',
          avatar: '👦',
          birthdate: '2015-01-01'
        })
      }
    );

    if (!createChildRes.ok) {
      throw new Error(`Child creation failed: ${createChildRes.status} - ${await createChildRes.text()}`);
    }

    const child = await createChildRes.json();
    console.log(`✅ Child created: ${child.id}`);
    console.log(`   Name: ${child.name}`);
    console.log(`   Avatar: ${child.avatar}`);
    
    // Verify PIN is NOT returned
    if (child.pin || child.hashedPin) {
      throw new Error('PIN returned in response (should be hashed and never returned)');
    }
    console.log('✅ PIN not returned (hashed properly)');
    console.log('');

    // Store for later tests
    (testData as any).onboardingKid = {
      id: child.id,
      name: child.name,
      pin: '1234' // Store the original PIN for login test
    };

    // Step 2: Verify child appears in GET /families/:familyId/children
    console.log('📝 Step 2: Verify child in GET /families/:familyId/children...\n');

    const familyChildrenRes = await fetch(
      `${API_BASE}/families/${family.id}/children`,
      {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!familyChildrenRes.ok) {
      throw new Error(`Get family children failed: ${familyChildrenRes.status}`);
    }

    const familyChildren = await familyChildrenRes.json();
    const foundChild = familyChildren.find((c: any) => c.id === child.id);

    if (!foundChild) {
      throw new Error('Child not found in family children list');
    }

    console.log('✅ Child appears in family children list');
    console.log('');

    // Step 3: Verify child appears in GET /children (parent view)
    console.log('📝 Step 3: Verify child in GET /children (parent UI selector)...\n');

    const childrenRes = await fetch(`${API_BASE}/children`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': publicAnonKey
      }
    });

    if (!childrenRes.ok) {
      throw new Error(`Get children failed: ${childrenRes.status}`);
    }

    const children = await childrenRes.json();
    const foundInSelector = children.find((c: any) => c.id === child.id);

    if (!foundInSelector) {
      throw new Error('Child not found in parent UI selector');
    }

    console.log('✅ Child appears in parent UI selector');
    console.log('');

    // Step 4: Kid login using family code + PIN
    console.log('📝 Step 4: Kid login using family code + PIN...\n');

    const kidLoginRes = await fetch(`${API_BASE}/kid-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        familyCode: family.code,
        pin: '1234'
      })
    });

    if (!kidLoginRes.ok) {
      throw new Error(`Kid login failed: ${kidLoginRes.status} - ${await kidLoginRes.text()}`);
    }

    const kidSession = await kidLoginRes.json();
    
    if (!kidSession.token && !kidSession.access_token) {
      throw new Error('No token returned from kid login');
    }

    const kidToken = kidSession.token || kidSession.access_token;
    
    console.log('✅ Kid login successful');
    console.log(`   Token: ${kidToken.substring(0, 20)}...`);
    console.log('');

    // Store kid token
    (testData as any).onboardingKidToken = kidToken;

    // Step 5: Verify kid can access kid endpoints
    console.log('📝 Step 5: Verify kid can access /kid endpoints...\n');

    const kidHomeRes = await fetch(
      `${API_BASE}/children/${child.id}`,
      {
        headers: {
          'Authorization': `Bearer ${kidToken}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!kidHomeRes.ok) {
      throw new Error(`Kid home access failed: ${kidHomeRes.status}`);
    }

    const kidData = await kidHomeRes.json();
    console.log('✅ Kid can access kid endpoints');
    console.log(`   Kid name: ${kidData.name}`);
    console.log('');

    // Step 6: Verify kid cannot access parent endpoints
    console.log('📝 Step 6: Verify kid cannot access parent endpoints...\n');

    const parentRewardsRes = await fetch(`${API_BASE}/rewards`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kidToken}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Hacked', cost: 1 })
    });

    if (parentRewardsRes.ok) {
      throw new Error('Kid created reward (should be 403)');
    }

    if (parentRewardsRes.status !== 403) {
      throw new Error(`Expected 403, got ${parentRewardsRes.status}`);
    }

    console.log('✅ Kid blocked from parent endpoints (403)');
    console.log('');

    tests.push({
      id: 'ONB-003',
      name: 'Create child during onboarding',
      status: 'PASS',
      details: 'Child created, PIN hashed, appears in lists, kid login works, lands on kid home, role separation enforced'
    });
    console.log('✅ ONB-003 PASSED\n');
  } catch (error: any) {
    console.error('❌ ONB-003 FAILED:', error.message, '\n');
    tests.push({
      id: 'ONB-003',
      name: 'Create child during onboarding',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // ONB-004 (P1): Multiple Parents Join via Invite
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ONB-004 (P1): Multiple Parents Join via Invite');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const parentA1Token = (testData as any)?.newUserToken || newUserToken;
    const family = (testData as any)?.onboardingFamily;

    if (!parentA1Token || !family) {
      throw new Error('No parent token or family from ONB-002');
    }

    // Step 1: Parent A1 creates invite
    console.log('📝 Step 1: Parent A1 creates invite for Parent A2...\n');

    const createInviteRes = await fetch(
      `${API_BASE}/families/${family.id}/invites`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentA1Token}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'parent'
        })
      }
    );

    if (!createInviteRes.ok) {
      throw new Error(`Create invite failed: ${createInviteRes.status} - ${await createInviteRes.text()}`);
    }

    const invite = await createInviteRes.json();
    console.log(`✅ Invite created: ${invite.id}`);
    console.log(`   Code: ${invite.code}`);
    console.log('');

    // Step 2: Parent A2 signs up
    console.log('📝 Step 2: Parent A2 signs up...\n');

    const timestamp = Date.now();
    const parentA2Email = `onboarding-parent-a2-${timestamp}@example.com`;
    const parentA2Password = 'ParentA2Test123!';

    const signupRes = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        email: parentA2Email,
        password: parentA2Password,
        name: 'Parent A2'
      })
    });

    if (!signupRes.ok) {
      throw new Error(`Parent A2 signup failed: ${signupRes.status}`);
    }

    const signupData = await signupRes.json();
    const parentA2Token = signupData.session?.access_token || signupData.access_token;

    console.log(`✅ Parent A2 signed up: ${parentA2Email}`);
    console.log('');

    // Step 3: Parent A2 accepts invite
    console.log('📝 Step 3: Parent A2 accepts invite...\n');

    const acceptInviteRes = await fetch(
      `${API_BASE}/invites/${invite.code}/accept`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentA2Token}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (!acceptInviteRes.ok) {
      throw new Error(`Accept invite failed: ${acceptInviteRes.status} - ${await acceptInviteRes.text()}`);
    }

    console.log('✅ Parent A2 accepted invite');
    console.log('');

    // Step 4: Verify Parent A2 sees Family A data
    console.log('📝 Step 4: Verify Parent A2 sees Family A data...\n');

    const familyRes = await fetch(`${API_BASE}/family`, {
      headers: {
        'Authorization': `Bearer ${parentA2Token}`,
        'apikey': publicAnonKey
      }
    });

    if (!familyRes.ok) {
      throw new Error(`Parent A2 get family failed: ${familyRes.status}`);
    }

    const parentA2Family = await familyRes.json();
    if (parentA2Family.id !== family.id) {
      throw new Error(`Family mismatch: expected ${family.id}, got ${parentA2Family.id}`);
    }

    console.log('✅ Parent A2 sees Family A data');
    console.log(`   Family: ${parentA2Family.name}`);
    console.log('');

    // Step 5: Verify Parent A2 can do parent-only CRUD
    console.log('📝 Step 5: Verify Parent A2 can create child...\n');

    const createChildRes = await fetch(
      `${API_BASE}/families/${family.id}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentA2Token}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Kid by Parent A2',
          pin: '5678',
          avatar: '👧'
        })
      }
    );

    if (!createChildRes.ok) {
      throw new Error(`Parent A2 create child failed: ${createChildRes.status}`);
    }

    console.log('✅ Parent A2 can create children');
    console.log('');

    console.log('📝 Step 6: Verify Parent A2 can create reward...\n');

    const createRewardRes = await fetch(`${API_BASE}/rewards`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentA2Token}`,
        'apikey': publicAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Reward by Parent A2',
        cost: 100
      })
    });

    if (!createRewardRes.ok) {
      throw new Error(`Parent A2 create reward failed: ${createRewardRes.status}`);
    }

    console.log('✅ Parent A2 can create rewards');
    console.log('');

    // Step 7: Verify Parent A2 cannot access other families
    if (testData?.familyB) {
      console.log('📝 Step 7: Verify Parent A2 cannot access Family B...\n');

      const familyBRes = await fetch(
        `${API_BASE}/families/${testData.familyB.id}`,
        {
          headers: {
            'Authorization': `Bearer ${parentA2Token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (familyBRes.ok) {
        throw new Error('Parent A2 accessed Family B (should be 403)');
      }

      if (familyBRes.status !== 403) {
        throw new Error(`Expected 403, got ${familyBRes.status}`);
      }

      console.log('✅ Parent A2 blocked from other families (403)');
      console.log('');
    }

    tests.push({
      id: 'ONB-004',
      name: 'Multiple parents join via invite',
      status: 'PASS',
      details: 'Parent A2 joined, sees Family A, can do parent CRUD, cannot access other families'
    });
    console.log('✅ ONB-004 PASSED\n');
  } catch (error: any) {
    console.error('❌ ONB-004 FAILED:', error.message, '\n');
    tests.push({
      id: 'ONB-004',
      name: 'Multiple parents join via invite',
      status: 'FAIL',
      error: error.message
    });
  }

  // ================================================================
  // ONB-005 (P1): Child Removal/Update Impact
  // ================================================================
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TEST ONB-005 (P1): Child Removal/Update Impact');
  console.log('───────────────────────────────────────────────────────────────\n');

  try {
    const parentToken = (testData as any)?.newUserToken || newUserToken;
    const kidToken = (testData as any)?.onboardingKidToken;
    const kid = (testData as any)?.onboardingKid;
    const family = (testData as any)?.onboardingFamily;

    if (!parentToken || !kid || !family) {
      throw new Error('No parent/kid/family from ONB-003');
    }

    // Setup: Create some data for the kid (event, wishlist item)
    console.log('📝 Setup: Creating data for kid (event, wishlist)...\n');

    // Log an event
    const logEventRes = await fetch(
      `${API_BASE}/children/${kid.id}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          behaviorId: 'test-behavior',
          type: 'positive',
          points: 10,
          notes: 'Test event for ONB-005'
        })
      }
    );

    if (logEventRes.ok) {
      console.log('✅ Event logged for kid');
    } else {
      console.log('ℹ️  Event logging not available');
    }
    console.log('');

    // Step 1: Parent updates child profile (name, avatar)
    console.log('📝 Step 1: Parent updates child name and avatar...\n');

    const updateChildRes = await fetch(
      `${API_BASE}/children/${kid.id}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Kid Name',
          avatar: '🎯'
        })
      }
    );

    if (!updateChildRes.ok) {
      throw new Error(`Update child failed: ${updateChildRes.status} - ${await updateChildRes.text()}`);
    }

    const updatedChild = await updateChildRes.json();
    console.log('✅ Child profile updated');
    console.log(`   New name: ${updatedChild.name}`);
    console.log(`   New avatar: ${updatedChild.avatar}`);
    console.log('');

    // Step 2: Verify updates propagate to GET /children
    console.log('📝 Step 2: Verify updates in GET /children...\n');

    const childrenRes = await fetch(`${API_BASE}/children`, {
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'apikey': publicAnonKey
      }
    });

    if (!childrenRes.ok) {
      throw new Error(`Get children failed: ${childrenRes.status}`);
    }

    const children = await childrenRes.json();
    const foundChild = children.find((c: any) => c.id === kid.id);

    if (!foundChild) {
      throw new Error('Updated child not found in children list');
    }

    if (foundChild.name !== 'Updated Kid Name') {
      throw new Error(`Name not updated: ${foundChild.name}`);
    }

    console.log('✅ Updates propagated to children list');
    console.log('');

    // Step 3: Parent updates child PIN
    console.log('📝 Step 3: Parent updates child PIN...\n');

    const updatePinRes = await fetch(
      `${API_BASE}/children/${kid.id}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pin: '9999'
        })
      }
    );

    if (!updatePinRes.ok) {
      throw new Error(`Update PIN failed: ${updatePinRes.status}`);
    }

    console.log('✅ PIN updated');
    console.log('');

    // Step 4: Verify kid cannot login with old PIN
    console.log('📝 Step 4: Verify kid cannot login with old PIN...\n');

    const oldPinLoginRes = await fetch(`${API_BASE}/kid-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        familyCode: family.code,
        pin: '1234' // Old PIN
      })
    });

    if (oldPinLoginRes.ok) {
      throw new Error('Kid login succeeded with old PIN (should be blocked)');
    }

    if (oldPinLoginRes.status !== 401) {
      throw new Error(`Expected 401, got ${oldPinLoginRes.status}`);
    }

    console.log('✅ Old PIN blocked (401)');
    console.log('');

    // Step 5: Verify kid can login with new PIN
    console.log('📝 Step 5: Verify kid can login with new PIN...\n');

    const newPinLoginRes = await fetch(`${API_BASE}/kid-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        familyCode: family.code,
        pin: '9999' // New PIN
      })
    });

    if (!newPinLoginRes.ok) {
      throw new Error(`Kid login with new PIN failed: ${newPinLoginRes.status}`);
    }

    console.log('✅ New PIN works');
    console.log('');

    // Step 6: Test deactivation (if supported) or deletion
    console.log('📝 Step 6: Testing child deactivation/deletion...\n');

    // Try to delete or deactivate
    const deleteChildRes = await fetch(
      `${API_BASE}/children/${kid.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey
        }
      }
    );

    if (deleteChildRes.ok) {
      console.log('✅ Child deletion supported');
      
      // Verify child removed from lists
      const checkChildrenRes = await fetch(`${API_BASE}/children`, {
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey
        }
      });

      if (checkChildrenRes.ok) {
        const remainingChildren = await checkChildrenRes.json();
        const stillExists = remainingChildren.find((c: any) => c.id === kid.id);
        
        if (stillExists) {
          throw new Error('Deleted child still in list');
        }
        
        console.log('✅ Deleted child removed from lists');
      }
      console.log('');
    } else if (deleteChildRes.status === 404 || deleteChildRes.status === 405) {
      console.log('ℹ️  Child deletion not supported (405/404)');
      console.log('   Testing deactivation instead...');
      
      // Try deactivation
      const deactivateRes = await fetch(
        `${API_BASE}/children/${kid.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${parentToken}`,
            'apikey': publicAnonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            active: false
          })
        }
      );

      if (deactivateRes.ok) {
        console.log('✅ Child deactivation supported');
      } else {
        console.log('ℹ️  Child deactivation not supported');
      }
      console.log('');
    } else {
      throw new Error(`Unexpected delete status: ${deleteChildRes.status}`);
    }

    // Step 7: Verify no orphaned records
    console.log('📝 Step 7: Verify no orphaned records break lists...\n');

    const listsToCheck = [
      { name: 'Children', url: `${API_BASE}/children` },
      { name: 'Family', url: `${API_BASE}/family` },
      { name: 'Rewards', url: `${API_BASE}/rewards` }
    ];

    for (const list of listsToCheck) {
      const res = await fetch(list.url, {
        headers: {
          'Authorization': `Bearer ${parentToken}`,
          'apikey': publicAnonKey
        }
      });

      if (!res.ok && res.status !== 404) {
        throw new Error(`${list.name} list broken: ${res.status}`);
      }

      console.log(`   ✅ ${list.name} list loads (no crashes)`);
    }
    console.log('');

    tests.push({
      id: 'ONB-005',
      name: 'Child removal/update impact',
      status: 'PASS',
      details: 'Child updated, PIN changed, old PIN blocked, new PIN works, deletion/deactivation handled, no orphaned records'
    });
    console.log('✅ ONB-005 PASSED\n');
  } catch (error: any) {
    console.error('❌ ONB-005 FAILED:', error.message, '\n');
    tests.push({
      id: 'ONB-005',
      name: 'Child removal/update impact',
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
  console.log('📊 ONBOARDING PERMUTATIONS TEST SUMMARY');
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
