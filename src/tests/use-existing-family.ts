/**
 * Use Existing Family for Testing
 * 
 * Discovers any existing family in the database and uses it for testing
 * Completely bypasses rate limits by not creating new accounts
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

export async function useExistingFamily() {
  console.log('🔍 ========================================');
  console.log('🔍 DISCOVERING EXISTING FAMILY FOR TESTING');
  console.log('🔍 ========================================\n');

  try {
    // Step 1: Try to find ANY parent user in the system
    console.log('📋 Step 1: Looking for parent users...\n');
    
    const kvResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kv/getByPrefix`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ prefix: 'parent:' })
      }
    );

    if (!kvResponse.ok) {
      // Check if it's 404 (endpoint doesn't exist yet - server redeploying)
      if (kvResponse.status === 404) {
        console.log('⏳ Server is redeploying... (new endpoints being deployed)\n');
        console.log('💡 SOLUTION: Create a manual test account instead!\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🚀 MANUAL ACCOUNT CREATION (NO RATE LIMITS!)');
        console.log('═══════════════════════════════════════════════════════════\n');
        console.log('The automated server endpoints are being deployed.');
        console.log('This takes ~1-2 minutes.\n');
        console.log('⚡ FASTER SOLUTION: Create account through UI (3 minutes):\n');
        console.log('1. Logout if logged in');
        console.log('2. Click "Sign Up"');
        console.log('3. Create account:');
        console.log('   - Email: mytest@example.com');
        console.log('   - Password: TestPass123!');
        console.log('   - Name: Test Parent');
        console.log('4. Create family during onboarding');
        console.log('5. Add at least 1 child');
        console.log('6. Come back here and click "Use Existing Family" again\n');
        console.log('✅ Manual signup bypasses ALL rate limits!');
        console.log('✅ Takes 3 minutes, works immediately!');
        console.log('✅ Account is permanent - use for all future tests!\n');
        console.log('📚 See: /MANUAL_TEST_ACCOUNT_SOLUTION.md for detailed guide\n');
        console.log('═══════════════════════════════════════════════════════════\n');
        
        return null;
      }
      
      throw new Error(`Failed to fetch parents: ${kvResponse.status}`);
    }

    const parents = await kvResponse.json();
    
    if (!parents || parents.length === 0) {
      console.log('❌ No parents found in database\n');
      console.log('💡 SOLUTION: Create a test account manually:');
      console.log('   1. Sign up through the app UI');
      console.log('   2. Create a family');
      console.log('   3. Add at least 1 child');
      console.log('   4. Then run tests again\n');
      return null;
    }

    console.log(`✅ Found ${parents.length} parent(s) in database\n`);

    // Step 2: For each parent, find their family
    for (const parent of parents) {
      console.log(`👤 Checking parent: ${parent.key}`);
      
      if (!parent.value?.familyId) {
        console.log('   ⚠️  No family ID\n');
        continue;
      }

      const familyId = parent.value.familyId;
      console.log(`   Family ID: ${familyId}`);

      // Step 3: Get family details
      const familyResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kv/get`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ key: familyId })
        }
      );

      if (!familyResponse.ok) {
        console.log('   ⚠️  Could not fetch family\n');
        continue;
      }

      const family = await familyResponse.json();
      
      if (!family) {
        console.log('   ⚠️  Family not found\n');
        continue;
      }

      console.log(`   ✅ Family Name: ${family.name || 'Unknown'}`);
      console.log(`   ✅ Invite Code: ${family.inviteCode || 'N/A'}`);

      // Step 4: Get children
      const childrenResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kv/getByPrefix`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ prefix: `child:${familyId}:` })
        }
      );

      const children = childrenResponse.ok ? await childrenResponse.json() : [];
      console.log(`   ✅ Children: ${children.length}\n`);

      if (children.length === 0) {
        console.log('   ⚠️  No children found, looking for next family...\n');
        continue;
      }

      // Step 5: Get parent email from user record
      const userResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kv/get`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ key: `user:${parent.value.userId}` })
        }
      );

      const user = userResponse.ok ? await userResponse.json() : null;
      const parentEmail = user?.email || 'unknown@example.com';

      // We found a complete family! Build the test environment
      const testEnv = {
        familyA: {
          familyId: familyId,
          familyName: family.name || 'Test Family',
          inviteCode: family.inviteCode || 'N/A',
          parents: [{
            userId: parent.value.userId,
            email: parentEmail,
            password: 'MANUAL_LOGIN_REQUIRED' // They'll need to login manually
          }],
          children: children.map((child: any) => ({
            childId: child.key,
            id: child.key,
            name: child.value?.name || 'Child',
            pin: child.value?.pin || '0000',
            avatar: child.value?.avatar || '👶'
          }))
        },
        familyB: {
          familyId: 'placeholder',
          familyName: 'Not Required',
          inviteCode: 'N/A',
          parents: [],
          children: []
        },
        setupTimestamp: new Date().toISOString(),
        discoveredFromDatabase: true
      };

      // Save to localStorage
      localStorage.setItem('fgs_test_environment', JSON.stringify(testEnv, null, 2));

      console.log('🎉 ========================================');
      console.log('🎉 EXISTING FAMILY DISCOVERED!');
      console.log('🎉 ========================================\n');
      
      console.log('📊 TEST ENVIRONMENT READY:\n');
      console.log(`✅ Family: ${testEnv.familyA.familyName}`);
      console.log(`✅ Invite Code: ${testEnv.familyA.inviteCode}`);
      console.log(`✅ Family ID: ${testEnv.familyA.familyId}`);
      console.log(`✅ Parent Email: ${parentEmail}`);
      console.log(`✅ Children: ${testEnv.familyA.children.length}\n`);

      testEnv.familyA.children.forEach((child: any, i: number) => {
        console.log(`   ${i + 1}. ${child.name} (PIN: ${child.pin}) ${child.avatar}`);
      });

      console.log('\n💾 Saved to: localStorage.fgs_test_environment\n');
      
      console.log('📝 NEXT STEPS:\n');
      console.log('1. Run tests: Click "Points & Events (P0/P1)"');
      console.log('2. Tests will use this existing family');
      console.log('3. No rate limits! ✅\n');

      return testEnv;
    }

    // If we get here, no complete families found
    console.log('❌ No complete families found (need family + children)\n');
    console.log('💡 SOLUTION: Create a test account manually:');
    console.log('   1. Sign up through the app UI');
    console.log('   2. Create a family');
    console.log('   3. Add at least 1 child');
    console.log('   4. Then click "Discover Existing Data" again\n');

    return null;

  } catch (error) {
    console.error('❌ Discovery failed:', error);
    throw error;
  }
}

/**
 * Quick helper to check if we have existing test data
 */
export function hasExistingTestData(): boolean {
  const testEnvStr = localStorage.getItem('fgs_test_environment');
  
  if (!testEnvStr) {
    return false;
  }

  try {
    const testEnv = JSON.parse(testEnvStr);
    return !!(
      testEnv.familyA?.familyId && 
      testEnv.familyA?.children?.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Get existing test data from localStorage
 */
export function getExistingTestData() {
  const testEnvStr = localStorage.getItem('fgs_test_environment');
  
  if (!testEnvStr) {
    return null;
  }

  try {
    return JSON.parse(testEnvStr);
  } catch {
    return null;
  }
}