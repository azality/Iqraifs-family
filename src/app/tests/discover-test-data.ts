/**
 * DISCOVER EXISTING TEST DATA
 * 
 * Instead of creating new test data (which hits rate limits),
 * this discovers and reuses existing test families from the database.
 * 
 * This allows tests to run even when rate-limited.
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface DiscoveredTestData {
  familyA?: {
    id: string;
    code: string;
    name: string;
  };
  childA1?: {
    id: string;
    name: string;
    pin: string;
  };
  parentA?: {
    email: string;
    password: string;
    userId?: string;
    token?: string;
  };
}

/**
 * Discovers existing test data by trying common test credentials
 * and querying the database for test families.
 */
export async function discoverExistingTestData(): Promise<DiscoveredTestData | null> {
  console.log('🔍 Discovering existing test data...');
  console.log('');

  const discovered: DiscoveredTestData = {};

  // Step 1: Try to login with common test parent credentials
  console.log('📝 Step 1: Attempting to find existing test parent...');
  console.log('   (Note: 400 errors in Network tab are expected during discovery)');
  console.log('');
  
  const commonTestEmails = [
    'parent1@testfamily.com',
    'parent.a@testfamily.com',
    'test.parent@example.com',
    'parent@test.com'
  ];
  
  const commonTestPasswords = [
    'TestPassword123!',
    'Password123!',
    'TestPass123!'
  ];

  let parentLoginSuccess = false;
  let parentToken = '';
  let parentUserId = '';
  let parentEmail = '';
  let parentPassword = '';

  // Import singleton client once
  const { supabase } = await import('../../../utils/supabase/client');
  
  // Suppress console errors during discovery (expected 400s from trying different credentials)
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // Only suppress expected auth failures during discovery
    if (message.includes('400') && message.includes('auth')) {
      return; // Suppress expected 400 auth errors
    }
    originalConsoleError(...args);
  };
  
  for (const email of commonTestEmails) {
    if (parentLoginSuccess) break;
    
    for (const password of commonTestPasswords) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (!error && data.session) {
          parentToken = data.session.access_token;
          parentUserId = data.user!.id;
          parentEmail = email;
          parentPassword = password;
          parentLoginSuccess = true;
          
          console.log(`   ✅ Found existing test parent: ${email}`);
          
          discovered.parentA = {
            email,
            password,
            userId: parentUserId,
            token: parentToken
          };
          
          break;
        }
      } catch (error) {
        // Continue trying other credentials
      }
    }
  }
  
  // Restore console.error
  console.error = originalConsoleError;

  if (!parentLoginSuccess) {
    console.log('   ⚠️  No existing test parent found with common credentials');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   1. Click "Reset & Recreate" to create fresh test environment');
    console.log('   2. Or manually create a test parent with email: parent1@testfamily.com');
    console.log('');
    return null;
  }

  // Step 2: Get family data for this parent
  console.log('');
  console.log('📝 Step 2: Fetching family data...');
  
  try {
    const familyResponse = await fetch(`${API_BASE}/family`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentToken}`,
        'apikey': publicAnonKey
      }
    });
    
    if (!familyResponse.ok) {
      console.log(`   ⚠️  Could not fetch family data: ${familyResponse.status}`);
      return null;
    }
    
    const familyData = await familyResponse.json();
    
    if (!familyData.id || !familyData.inviteCode) {
      console.log('   ⚠️  Family data incomplete');
      return null;
    }
    
    discovered.familyA = {
      id: familyData.id,
      code: familyData.inviteCode,
      name: familyData.name
    };
    
    console.log(`   ✅ Found family: ${familyData.name} (${familyData.inviteCode})`);
  } catch (error: any) {
    console.log(`   ⚠️  Error fetching family: ${error.message}`);
    return null;
  }

  // Step 3: Get children for this family
  console.log('');
  console.log('📝 Step 3: Fetching children...');
  
  try {
    const childrenResponse = await fetch(`${API_BASE}/family/${discovered.familyA!.id}/children`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${parentToken}`,
        'apikey': publicAnonKey
      }
    });
    
    if (!childrenResponse.ok) {
      console.log(`   ⚠️  Could not fetch children: ${childrenResponse.status}`);
      return discovered; // Return partial data (family without children)
    }
    
    const childrenData = await childrenResponse.json();
    
    if (!Array.isArray(childrenData) || childrenData.length === 0) {
      console.log('   ⚠️  No children found in family');
      console.log('');
      console.log('💡 TIP: Use "Reset & Recreate" to create a complete test environment');
      return discovered; // Return partial data
    }
    
    const firstChild = childrenData[0];
    
    // Try common test PINs
    const commonPins = ['1234', '0000', '1111', '9999'];
    let foundPin = '';
    
    for (const pin of commonPins) {
      try {
        const pinVerifyResponse = await fetch(`${API_BASE}/kid/verify-pin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            familyCode: discovered.familyA!.code,
            childId: firstChild.id,
            pin
          })
        });
        
        if (pinVerifyResponse.ok) {
          foundPin = pin;
          break;
        }
      } catch (error) {
        // Continue trying
      }
    }
    
    if (!foundPin) {
      console.log(`   ⚠️  Found child "${firstChild.name}" but could not determine PIN`);
      console.log('   💡 Common PINs tried: 1234, 0000, 1111, 9999');
      
      // Store child info without PIN
      discovered.childA1 = {
        id: firstChild.id,
        name: firstChild.name,
        pin: '1234' // Default guess
      };
    } else {
      discovered.childA1 = {
        id: firstChild.id,
        name: firstChild.name,
        pin: foundPin
      };
      
      console.log(`   ✅ Found child: ${firstChild.name} (PIN: ${foundPin})`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Error fetching children: ${error.message}`);
    return discovered; // Return partial data
  }

  // Step 4: Save discovered data to localStorage
  console.log('');
  console.log('📝 Step 4: Saving discovered data to localStorage...');
  
  try {
    const testEnvData = {
      timestamp: new Date().toISOString(),
      source: 'discovered',
      familyA: {
        familyId: discovered.familyA!.id,
        familyName: discovered.familyA!.name,
        inviteCode: discovered.familyA!.code,
        parents: [{
          email: discovered.parentA!.email,
          password: discovered.parentA!.password,
          userId: discovered.parentA!.userId,
          accessToken: discovered.parentA!.token
        }],
        children: discovered.childA1 ? [{
          childId: discovered.childA1.id,
          id: discovered.childA1.id,
          name: discovered.childA1.name,
          pin: discovered.childA1.pin
        }] : []
      }
    };
    
    localStorage.setItem('fgs_test_environment', JSON.stringify(testEnvData));
    console.log('   ✅ Test data saved to localStorage');
  } catch (error: any) {
    console.log(`   ⚠️  Could not save to localStorage: ${error.message}`);
  }

  // Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 DISCOVERED TEST DATA SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Parent:  ${discovered.parentA?.email || 'Not found'}`);
  console.log(`✅ Family:  ${discovered.familyA?.name || 'Not found'} (${discovered.familyA?.code || 'N/A'})`);
  console.log(`${discovered.childA1 ? '✅' : '⚠️ '} Child:   ${discovered.childA1?.name || 'Not found'}`);
  console.log('═'.repeat(60));
  console.log('');

  if (discovered.familyA && discovered.childA1 && discovered.parentA) {
    console.log('🎉 Complete test data discovered! Tests can now run.');
    return discovered;
  } else {
    console.log('⚠️  Partial test data discovered. Some tests may be skipped.');
    return discovered;
  }
}

/**
 * Gets test data from localStorage or discovers it from the database
 */
export async function getOrDiscoverTestData(): Promise<DiscoveredTestData | null> {
  // First, try to get from localStorage
  const existingData = localStorage.getItem('fgs_test_environment');
  
  if (existingData) {
    try {
      const parsed = JSON.parse(existingData);
      
      // Check if data is complete
      if (parsed.familyA?.familyId && parsed.familyA?.inviteCode && 
          parsed.familyA?.children?.[0]?.id && parsed.familyA?.parents?.[0]?.email) {
        
        console.log('📦 Using existing test data from localStorage');
        console.log(`   Family: ${parsed.familyA.familyName} (${parsed.familyA.inviteCode})`);
        console.log(`   Parent: ${parsed.familyA.parents[0].email}`);
        console.log(`   Child: ${parsed.familyA.children[0].name}`);
        console.log('');
        
        return {
          familyA: {
            id: parsed.familyA.familyId || parsed.familyA.id,
            code: parsed.familyA.inviteCode || parsed.familyA.code,
            name: parsed.familyA.familyName || parsed.familyA.name
          },
          childA1: {
            id: parsed.familyA.children[0].childId || parsed.familyA.children[0].id,
            name: parsed.familyA.children[0].name,
            pin: parsed.familyA.children[0].pin
          },
          parentA: {
            email: parsed.familyA.parents[0].email,
            password: parsed.familyA.parents[0].password || 'TestPassword123!',
            userId: parsed.familyA.parents[0].userId,
            token: parsed.familyA.parents[0].accessToken || parsed.familyA.parents[0].token
          }
        };
      }
    } catch (error) {
      console.log('⚠️  Could not parse existing test data, will discover new data...');
      console.log('');
    }
  }

  // No valid localStorage data, discover from database
  return await discoverExistingTestData();
}