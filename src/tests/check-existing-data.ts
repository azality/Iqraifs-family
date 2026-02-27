/**
 * Check for Existing Test Data
 * 
 * Checks localStorage and tries common test credentials
 * to see if test data already exists
 */

import { createClient } from '/utils/supabase/client';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const COMMON_TEST_CREDENTIALS = [
  { email: 'parent1@testfamily.com', password: 'TestPassword123!' },
  { email: 'parent2@testfamily.com', password: 'TestPassword123!' },
  { email: 'parent.a@testfamily.com', password: 'TestPassword123!' },
  { email: 'mytest@example.com', password: 'TestPass123!' },
  { email: 'test@example.com', password: 'TestPassword123!' },
];

export async function checkExistingData() {
  console.log('🔍 ========================================');
  console.log('🔍 CHECKING FOR EXISTING TEST DATA');
  console.log('🔍 ========================================\n');

  // Step 1: Check localStorage
  console.log('📦 Step 1: Checking localStorage...\n');
  
  const testEnvStr = localStorage.getItem('fgs_test_environment');
  if (testEnvStr) {
    try {
      const testEnv = JSON.parse(testEnvStr);
      console.log('✅ Found test environment in localStorage!\n');
      console.log('📊 Test Environment:');
      console.log('   Family A:', testEnv.familyA?.familyName || 'Unknown');
      console.log('   Family ID:', testEnv.familyA?.familyId || 'Unknown');
      console.log('   Invite Code:', testEnv.familyA?.inviteCode || 'Unknown');
      console.log('   Children:', testEnv.familyA?.children?.length || 0);
      console.log('   Parents:', testEnv.familyA?.parents?.length || 0);
      
      if (testEnv.familyA?.parents?.[0]) {
        console.log('\n📧 Parent Credentials:');
        console.log('   Email:', testEnv.familyA.parents[0].email);
        console.log('   (Password is stored separately)\n');
      }

      console.log('\n✅ You can use this test data immediately!');
      console.log('   Just click "Points & Events (P0/P1)" to run tests.\n');
      return testEnv;
    } catch (e) {
      console.log('⚠️  Could not parse localStorage data');
    }
  } else {
    console.log('❌ No test environment found in localStorage\n');
  }

  // Step 2: Check current session
  console.log('📦 Step 2: Checking current session...\n');
  
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    console.log('✅ You are currently logged in!');
    console.log('   Email:', session.user.email || 'Unknown');
    console.log('   User ID:', session.user.id);

    // Check if user has a family
    const familyId = localStorage.getItem('familyId');
    if (familyId) {
      console.log('   Family ID:', familyId);
      console.log('\n✅ Perfect! You have a family!');
      console.log('   Click "Use Current Session ⭐" to capture this data.\n');
      return { currentSession: true, hasFamily: true, familyId };
    } else {
      console.log('\n⚠️  You are logged in but have no family yet.');
      console.log('   Complete onboarding to create a family.\n');
      return { currentSession: true, hasFamily: false };
    }
  } else {
    console.log('❌ Not currently logged in\n');
  }

  // Step 3: Try common test credentials
  console.log('📦 Step 3: Trying common test credentials...\n');

  for (const cred of COMMON_TEST_CREDENTIALS) {
    try {
      console.log(`   Trying ${cred.email}...`);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cred.email,
        password: cred.password
      });

      if (data?.session) {
        console.log(`   ✅ SUCCESS! Logged in as ${cred.email}\n`);
        
        // Check if user has a family
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for localStorage to update
        
        const familyId = localStorage.getItem('familyId');
        
        if (familyId) {
          console.log('✅ This account has a family!');
          console.log('   Family ID:', familyId);
          console.log('\n🎉 You can use this account for testing!');
          console.log('   Click "Use Current Session ⭐" to capture the data.\n');
          
          return {
            loggedIn: true,
            email: cred.email,
            familyId: familyId
          };
        } else {
          console.log('⚠️  This account has no family yet.');
          console.log('   You can complete onboarding to create one.\n');
          return {
            loggedIn: true,
            email: cred.email,
            familyId: null
          };
        }
      }
    } catch (e) {
      // Continue trying
    }
  }

  console.log('   ❌ None of the common credentials worked\n');

  // Step 4: Show solution
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💡 SOLUTION: WAIT FOR RATE LIMIT TO RESET');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('You are hitting Supabase Auth rate limits (429 errors).');
  console.log('This is a built-in Supabase protection.\n');
  
  console.log('⏰ OPTION 1: Wait ~1 hour for rate limit to reset\n');
  console.log('   Supabase Auth rate limits typically reset after 1 hour.');
  console.log('   After waiting, try signing up again.\n');
  
  console.log('🔧 OPTION 2: Use Supabase Dashboard (FASTEST)\n');
  console.log('   1. Go to your Supabase project dashboard');
  console.log('   2. Click "Authentication" > "Users"');
  console.log('   3. Click "Add User" > "Create new user"');
  console.log('   4. Fill in:');
  console.log('      - Email: mytest@example.com');
  console.log('      - Password: TestPass123!');
  console.log('      - Auto Confirm User: YES (check this!)');
  console.log('   5. Click "Create user"');
  console.log('   6. Come back here and login with those credentials\n');
  
  console.log('✅ OPTION 3: Check again in a few minutes\n');
  console.log('   Sometimes test data was created successfully.');
  console.log('   Click "Check Existing Data" again in 5 minutes.\n');
  
  console.log('═══════════════════════════════════════════════════════════\n');

  return null;
}
