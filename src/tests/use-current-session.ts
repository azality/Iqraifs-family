/**
 * Use Current Session for Testing
 * 
 * If you're already logged in, this will check if you have a family
 * and guide you through setup if not
 */

import { createClient } from '/utils/supabase/client';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export async function useCurrentSession() {
  console.log('🔍 ========================================');
  console.log('🔍 CHECKING CURRENT SESSION');
  console.log('🔍 ========================================\n');

  try {
    // Step 1: Check if user is logged in
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.log('❌ Not logged in\n');
      console.log('💡 SOLUTION:\n');
      console.log('1. Sign up or login to your account');
      console.log('2. Complete onboarding (create family + children)');
      console.log('3. Come back and try again\n');
      return null;
    }

    console.log('✅ Logged in as:', session.user.id);
    console.log('📧 Email:', session.user.email || 'No email');

    // Step 2: Check if user has a family (from localStorage)
    const familyId = localStorage.getItem('familyId');

    if (!familyId) {
      console.log('\n⚠️  You are logged in but have NO FAMILY yet!\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🚀 COMPLETE ONBOARDING FIRST!');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('You need to complete the onboarding flow to create a family.\n');
      console.log('📋 STEPS TO COMPLETE:\n');
      console.log('1. Look at your app screen');
      console.log('2. You should see "Family Setup" or onboarding screen');
      console.log('3. Fill in:');
      console.log('   - Family Name: "Test Family"');
      console.log('   - Click Continue\n');
      console.log('4. Add at least ONE child:');
      console.log('   - Name: "Ahmed"');
      console.log('   - Avatar: 👦');
      console.log('   - PIN: 1234');
      console.log('   - Click "Add Child"\n');
      console.log('5. Add at least 2 behaviors:');
      console.log('   - "Prayer" (+10 points)');
      console.log('   - "Helping" (+5 points)');
      console.log('   - "Fighting" (-5 points)\n');
      console.log('6. Complete onboarding\n');
      console.log('7. Come back here and click "Use Current Session" again\n');
      console.log('⏱️  Takes 2-3 minutes');
      console.log('✅ No rate limits!');
      console.log('✅ Uses your existing account!\n');
      console.log('═══════════════════════════════════════════════════════════\n');
      return null;
    }

    console.log('✅ Family ID found:', familyId);

    // Step 3: Get family details
    const accessToken = session.access_token;
    
    const familyResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!familyResponse.ok) {
      console.log('❌ Could not fetch family details');
      console.log('Status:', familyResponse.status);
      console.log('\nYou may need to complete onboarding first.\n');
      return null;
    }

    const family = await familyResponse.json();
    console.log('✅ Family Name:', family.name || 'Unknown');
    console.log('✅ Invite Code:', family.inviteCode || 'N/A');

    // Step 4: Get children
    const childrenResponse = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/children`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!childrenResponse.ok) {
      console.log('⚠️  Could not fetch children');
      console.log('\nYou may need to add children in onboarding.\n');
      return null;
    }

    const children = await childrenResponse.json();
    console.log('✅ Children:', children.length);

    if (children.length === 0) {
      console.log('\n⚠️  No children found! Please add at least one child in the app.\n');
      return null;
    }

    // Build test environment
    const testEnv = {
      familyA: {
        familyId: familyId,
        familyName: family.name || 'Test Family',
        inviteCode: family.inviteCode || 'N/A',
        parents: [{
          userId: session.user.id,
          email: session.user.email || 'unknown@example.com',
          accessToken: accessToken
        }],
        children: children.map((child: any) => ({
          childId: child.id,
          id: child.id,
          name: child.name || 'Child',
          pin: child.pin || '0000',
          avatar: child.avatar || '👶'
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
      usingCurrentSession: true
    };

    // Save to localStorage
    localStorage.setItem('fgs_test_environment', JSON.stringify(testEnv, null, 2));

    console.log('\n🎉 ========================================');
    console.log('🎉 TEST ENVIRONMENT READY!');
    console.log('🎉 ========================================\n');
    
    console.log('📊 USING YOUR CURRENT FAMILY:\n');
    console.log(`✅ Family: ${testEnv.familyA.familyName}`);
    console.log(`✅ Invite Code: ${testEnv.familyA.inviteCode}`);
    console.log(`✅ Family ID: ${testEnv.familyA.familyId}`);
    console.log(`✅ Your Email: ${session.user.email}`);
    console.log(`✅ Children: ${testEnv.familyA.children.length}\n`);

    testEnv.familyA.children.forEach((child: any, i: number) => {
      console.log(`   ${i + 1}. ${child.name} ${child.avatar}`);
    });

    console.log('\n💾 Saved to: localStorage.fgs_test_environment\n');
    
    console.log('📝 NEXT STEPS:\n');
    console.log('1. Click "Points & Events (P0/P1)" to run tests');
    console.log('2. Tests will use YOUR family');
    console.log('3. No rate limits! ✅\n');

    return testEnv;

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}
