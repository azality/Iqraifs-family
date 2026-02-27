/**
 * Test Environment Setup
 * 
 * Creates comprehensive test data for P0 testing:
 * - Family A: Parent A1, Parent A2, Kid A1, Kid A2
 * - Family B: Parent B1, Kid B1
 * 
 * Includes device simulation and audit capabilities.
 * 
 * Usage in browser console:
 * import('/src/tests/setup-test-environment').then(m => m.setupTestEnvironment())
 */

import { supabase } from '../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface TestFamily {
  familyId: string;
  familyName: string;
  inviteCode: string;
  parents: TestParent[];
  children: TestChild[];
}

interface TestParent {
  userId: string;
  email: string;
  password: string;
  name: string;
}

interface TestChild {
  childId: string;
  name: string;
  pin: string;
  pinHash: string;
  avatar: string;
  currentPoints: number;
}

interface TestEnvironment {
  familyA: TestFamily;
  familyB: TestFamily;
  setupTimestamp: string;
}

let testEnv: TestEnvironment | null = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Sleep for a specified number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 2000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`  ⏳ Rate limited. Waiting ${delay}ms before retry ${attempt}/${maxRetries}...`);
        await sleep(delay);
      }
      
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('Too Many Requests') || 
                         error.message?.includes('429');
      
      if (!isRateLimit || attempt === maxRetries) {
        // Not a rate limit error, or we're out of retries
        throw error;
      }
      
      console.log(`  ⚠️  ${operationName} rate limited (attempt ${attempt + 1}/${maxRetries + 1})`);
    }
  }
  
  throw lastError;
}

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please login first.');
  }
  return session.access_token;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// FAMILY CREATION
// ============================================

async function createFamily(
  name: string,
  parentEmails: string[],
  childrenData: Array<{ name: string; pin: string; avatar: string }>
): Promise<TestFamily> {
  console.log(`\n📋 Creating ${name}...`);
  
  // Step 1: Create first parent account
  console.log(`  ├─ Creating parent account: ${parentEmails[0]}`);
  
  const password = 'TestPassword123!';
  
  let userId: string;
  let token: string;

  // OPTIMIZATION: Try to sign in first to avoid hitting signup rate limits
  console.log(`  ├─ Checking if account exists (sign-in attempt)...`);
  const { data: existingSignIn, error: existingSignInError } = await supabase.auth.signInWithPassword({
    email: parentEmails[0],
    password: password
  });

  if (!existingSignInError && existingSignIn.session) {
    // Account exists and we signed in successfully
    token = existingSignIn.session.access_token;
    userId = existingSignIn.user.id;
    console.log(`  ✅ Account exists, signed in: ${userId}`);
  } else {
    // Account doesn't exist or wrong password - try to create it
    console.log(`  ├─ Account doesn't exist, creating new account...`);
    
    const signUpRes = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        email: parentEmails[0],
        password: password,
        name: parentEmails[0].split('@')[0]
      })
    });

    if (!signUpRes.ok) {
      const errorText = await signUpRes.text();
      
      // Check if it's a rate limit error
      if (signUpRes.status === 429) {
        throw new Error('Too Many Requests');
      }
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText };
      }
      
      // If user already exists (edge case - password might be different)
      const errorMessage = error.error || errorText;
      if (errorMessage.includes('already been registered') || errorMessage.includes('User already registered')) {
        console.log(`  ⚠️  User already exists but different password - trying standard password...`);
        
        // Try sign in again with the standard password
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: parentEmails[0],
          password: password
        });

        if (signInError) {
          throw new Error(`Account exists but cannot sign in: ${signInError.message}`);
        }

        token = signInData.session!.access_token;
        userId = signInData.user.id;
        console.log(`  ✅ Signed in to existing account: ${userId}`);
      } else {
        throw new Error(`Failed to create parent: ${errorMessage}`);
      }
    } else {
      const signUpData = await signUpRes.json();
      userId = signUpData.user.id;
      console.log(`  ✅ Parent created: ${userId}`);

      // Sign in as first parent
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: parentEmails[0],
        password: password
      });

      if (signInError) {
        throw new Error(`Failed to sign in: ${signInError.message}`);
      }

      token = signInData.session!.access_token;
      console.log(`  ✅ Signed in as ${parentEmails[0]}`);
    }
  }

  // Step 2: Create family
  console.log(`  ├─ Creating family: ${name}`);
  const familyRes = await fetch(`${API_BASE}/families`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'apikey': publicAnonKey
    },
    body: JSON.stringify({ name })
  });

  if (!familyRes.ok) {
    const error = await familyRes.json();
    throw new Error(`Failed to create family: ${error.error}`);
  }

  const familyData = await familyRes.json();
  const familyId = familyData.id;
  const inviteCode = familyData.inviteCode;
  
  console.log(`  ✅ Family created: ${familyId}`);
  console.log(`  ✅ Invite code: ${inviteCode}`);

  // Step 3: Create children
  const children: TestChild[] = [];
  
  for (const childData of childrenData) {
    console.log(`  ├─ Creating child: ${childData.name}`);
    
    const childRes = await fetch(`${API_BASE}/children`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({
        name: childData.name,
        familyId: familyId,
        pin: childData.pin,
        avatar: childData.avatar
      })
    });

    if (!childRes.ok) {
      const error = await childRes.json();
      throw new Error(`Failed to create child: ${error.error}`);
    }

    const child = await childRes.json();
    const pinHash = await hashPin(childData.pin);
    
    children.push({
      childId: child.id,
      name: childData.name,
      pin: childData.pin,
      pinHash: pinHash,
      avatar: childData.avatar,
      currentPoints: 0
    });

    console.log(`  ✅ Child created: ${child.id} (PIN: ${childData.pin})`);
  }

  // Step 4: Add second parent if needed
  const parents: TestParent[] = [{
    userId,
    email: parentEmails[0],
    password,
    name: parentEmails[0].split('@')[0]
  }];

  if (parentEmails.length > 1) {
    console.log(`  ├─ Adding second parent: ${parentEmails[1]}`);
    
    let parent2UserId: string;
    let parent2Token: string;
    
    // OPTIMIZATION: Try to sign in first to avoid hitting signup rate limits
    console.log(`  ├─ Checking if Parent 2 account exists...`);
    const { data: existingParent2SignIn, error: existingParent2Error } = await supabase.auth.signInWithPassword({
      email: parentEmails[1],
      password: password
    });

    if (!existingParent2Error && existingParent2SignIn.session) {
      // Account exists and we signed in successfully
      parent2Token = existingParent2SignIn.session.access_token;
      parent2UserId = existingParent2SignIn.user.id;
      console.log(`  ✅ Parent 2 account exists, signed in: ${parent2UserId}`);
    } else {
      // Account doesn't exist - create it
      console.log(`  ├─ Parent 2 doesn't exist, creating...`);
      
      const parent2SignUpRes = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': publicAnonKey
        },
        body: JSON.stringify({
          email: parentEmails[1],
          password: password,
          name: parentEmails[1].split('@')[0]
        })
      });

      if (!parent2SignUpRes.ok) {
        const errorText = await parent2SignUpRes.text();
        
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { error: errorText };
        }
        
        // If user already exists, just sign in instead
        const errorMessage = error.error || errorText;
        if (errorMessage.includes('already been registered') || errorMessage.includes('User already registered')) {
          console.log(`  ⚠️  Second parent already exists, signing in instead...`);
          
          // Sign in with existing account
          const { data: parent2SignIn, error: parent2Error } = await supabase.auth.signInWithPassword({
            email: parentEmails[1],
            password: password
          });

          if (parent2Error) {
            throw new Error(`Failed to sign in second parent (existing account): ${parent2Error.message}`);
          }

          parent2Token = parent2SignIn.session!.access_token;
          parent2UserId = parent2SignIn.user.id;
          console.log(`  ✅ Signed in to existing account: ${parent2UserId}`);
        } else {
          throw new Error(`Failed to create second parent: ${errorMessage}`);
        }
      } else {
        const parent2Data = await parent2SignUpRes.json();
        parent2UserId = parent2Data.user.id;
        console.log(`  ✅ Second parent created: ${parent2UserId}`);

        // Sign in as second parent
        const { data: parent2SignIn, error: parent2Error } = await supabase.auth.signInWithPassword({
          email: parentEmails[1],
          password: password
        });

        if (parent2Error) {
          throw new Error(`Failed to sign in second parent: ${parent2Error.message}`);
        }

        parent2Token = parent2SignIn.session!.access_token;
      }
    }

    // Join family using invite code
    const joinRes = await fetch(`${API_BASE}/families/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parent2Token}`,
        'Content-Type': 'application/json',
        'apikey': publicAnonKey
      },
      body: JSON.stringify({ inviteCode })
    });

    if (!joinRes.ok) {
      const errorData = await joinRes.json();
      const errorMessage = errorData.error || 'Unknown error';
      
      // If parent is already in another family, check if it's this family or a stale one
      if (errorMessage.includes('already part of another family')) {
        console.log(`  ⚠️  Parent 2 is already in a family, checking if it's this one...`);
        
        // Try to get the family they're in
        const checkFamilyRes = await fetch(`${API_BASE}/families/current`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${parent2Token}`,
            'apikey': publicAnonKey
          }
        });
        
        if (checkFamilyRes.ok) {
          const currentFamily = await checkFamilyRes.json();
          
          if (currentFamily.id === familyId) {
            console.log(`  ✅ Parent 2 is already in this family (${familyId})`);
            // They're already in the correct family, continue
          } else {
            console.log(`  ⚠️  Parent 2 is in a different family: ${currentFamily.id}`);
            console.log(`  💡 Solution: The parent account needs to be removed from the old family first.`);
            console.log(`  💡 For testing, you can either:`);
            console.log(`     1. Use a different email for Parent 2`);
            console.log(`     2. Manually delete the old family from the database`);
            console.log(`     3. Delete the parent-a2 account and let setup recreate it`);
            console.log(`  ⏭️  Skipping Parent 2 for now - continuing with Parent 1 only...`);
            
            // Continue with just parent 1 - don't add parent 2 to the list
            console.log(`  ⚠️  Family created with only 1 parent due to conflict`);
          }
        } else {
          // Can't check current family, but error says they're in one
          console.log(`  ⚠️  Could not verify parent's current family`);
          console.log(`  ⏭️  Skipping Parent 2 - continuing with Parent 1 only...`);
        }
      } else {
        // Some other error
        throw new Error(`Failed to join family: ${errorMessage}`);
      }
    } else {
      // Successfully joined
      console.log(`  ✅ Second parent joined: ${parent2UserId}`);
    }
    
    // Only add parent 2 if join was successful
    if (joinRes.ok) {
      parents.push({
        userId: parent2UserId,
        email: parentEmails[1],
        password,
        name: parentEmails[1].split('@')[0]
      });
    }

    // Sign back in as first parent
    await supabase.auth.signInWithPassword({
      email: parentEmails[0],
      password: password
    });
  }

  console.log(`✅ ${name} complete!\n`);

  return {
    familyId,
    familyName: name,
    inviteCode,
    parents,
    children
  };
}

// ============================================
// MAIN SETUP FUNCTION
// ============================================

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  console.log('🧪 ========================================');
  console.log('🧪 TEST ENVIRONMENT SETUP');
  console.log('🧪 ========================================\n');

  const startTime = Date.now();

  try {
    // Check if already set up
    const existing = localStorage.getItem('fgs_test_environment');
    if (existing) {
      console.log('⚠️  Test environment already exists!');
      console.log('📋 Stored at: localStorage.fgs_test_environment');
      console.log('\nTo recreate, run: await resetTestEnvironment()');
      
      testEnv = JSON.parse(existing);
      return testEnv;
    }

    // Create Family A
    const familyA = await retryWithBackoff(
      () => createFamily(
        'Test Family A',
        ['parent-a1@fgs-test.com', 'parent-a2@fgs-test.com'],
        [
          { name: 'Kid A1', pin: '1111', avatar: '👧' },
          { name: 'Kid A2', pin: '2222', avatar: '👦' }
        ]
      ),
      5, // Max 5 retries
      5000, // Start with 5 second delay
      'Family A creation'
    );

    // Wait between families to avoid rate limits
    console.log('⏳ Waiting 3 seconds before creating Family B...\n');
    await sleep(3000);

    // Create Family B
    const familyB = await retryWithBackoff(
      () => createFamily(
        'Test Family B',
        ['parent-b1@fgs-test.com'],
        [
          { name: 'Kid B1', pin: '3333', avatar: '👶' }
        ]
      ),
      5, // Max 5 retries
      5000, // Start with 5 second delay
      'Family B creation'
    );

    // Create environment object
    testEnv = {
      familyA,
      familyB,
      setupTimestamp: new Date().toISOString()
    };

    // Save to localStorage
    localStorage.setItem('fgs_test_environment', JSON.stringify(testEnv, null, 2));

    // Print summary
    const duration = Date.now() - startTime;
    
    console.log('🎉 ========================================');
    console.log('🎉 TEST ENVIRONMENT READY!');
    console.log('🎉 ========================================\n');
    
    console.log('📊 SUMMARY:\n');
    console.log(`✅ Family A: ${familyA.familyId}`);
    console.log(`   Invite Code: ${familyA.inviteCode}`);
    console.log(`   Parents: ${familyA.parents.length}`);
    console.log(`   Children: ${familyA.children.length}\n`);
    
    console.log(`✅ Family B: ${familyB.familyId}`);
    console.log(`   Invite Code: ${familyB.inviteCode}`);
    console.log(`   Parents: ${familyB.parents.length}`);
    console.log(`   Children: ${familyB.children.length}\n`);
    
    console.log(`⏱️  Setup Time: ${duration}ms\n`);
    
    console.log('💾 Data saved to: localStorage.fgs_test_environment\n');
    
    console.log('📝 Next Steps:\n');
    console.log('1. Run audit: await auditTestEnvironment()');
    console.log('2. Simulate devices: await simulateDevices()');
    console.log('3. Access data: getTestEnvironment()\n');

    return testEnv;
  } catch (error) {
    console.error('❌ Setup failed:', error);
    
    // Check if it's a rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Too Many Requests') || errorMessage.includes('429')) {
      console.log('');
      console.log('═'.repeat(60));
      console.log('⚠️  RATE LIMIT EXCEEDED');
      console.log('═'.repeat(60));
      console.log('');
      console.log("You've hit Supabase authentication rate limits.");
      console.log('This is a security feature, not a bug!');
      console.log('');
      console.log('💡 SOLUTION:');
      console.log('   1. Wait 1 hour for rate limits to reset');
      console.log('   2. OR increase rate limits in Supabase dashboard:');
      console.log('      https://supabase.com/dashboard/project/[your-project]/auth/rate-limits');
      console.log('');
      console.log('📚 See: /RATE_LIMITING_CHECKLIST.md for details');
      console.log('');
      console.log('═'.repeat(60));
      console.log('');
    }
    
    throw error;
  }
}

// ============================================
// RESET FUNCTION
// ============================================

export async function resetTestEnvironment(): Promise<void> {
  console.log('🔄 Resetting test environment...\n');
  
  const confirmed = confirm(
    'This will clear test environment data.\n\n' +
    'Note: Test accounts and families will remain in the database.\n' +
    'Continue?'
  );

  if (!confirmed) {
    console.log('❌ Reset cancelled');
    return;
  }

  localStorage.removeItem('fgs_test_environment');
  testEnv = null;
  
  console.log('✅ Test environment reset');
  console.log('Run await setupTestEnvironment() to recreate\n');
}

// ============================================
// GETTER FUNCTION
// ============================================

export function getTestEnvironment(): TestEnvironment | null {
  if (!testEnv) {
    const stored = localStorage.getItem('fgs_test_environment');
    if (stored) {
      testEnv = JSON.parse(stored);
    }
  }
  return testEnv;
}

// ============================================
// PRINT CREDENTIALS
// ============================================

export function printTestCredentials(): void {
  const env = getTestEnvironment();
  if (!env) {
    console.log('❌ No test environment found. Run setupTestEnvironment() first.');
    return;
  }

  console.log('🔑 ========================================');
  console.log('🔑 TEST CREDENTIALS');
  console.log('🔑 ========================================\n');

  console.log('📧 FAMILY A:\n');
  console.log(`   Invite Code: ${env.familyA.inviteCode}`);
  env.familyA.parents.forEach((p, i) => {
    console.log(`   Parent A${i + 1}:`);
    console.log(`     Email: ${p.email}`);
    console.log(`     Password: ${p.password}`);
  });
  env.familyA.children.forEach((c, i) => {
    console.log(`   Kid A${i + 1}:`);
    console.log(`     Name: ${c.name}`);
    console.log(`     PIN: ${c.pin}`);
  });

  console.log('\n📧 FAMILY B:\n');
  console.log(`   Invite Code: ${env.familyB.inviteCode}`);
  env.familyB.parents.forEach((p, i) => {
    console.log(`   Parent B${i + 1}:`);
    console.log(`     Email: ${p.email}`);
    console.log(`     Password: ${p.password}`);
  });
  env.familyB.children.forEach((c, i) => {
    console.log(`   Kid B${i + 1}:`);
    console.log(`     Name: ${c.name}`);
    console.log(`     PIN: ${c.pin}`);
  });

  console.log('\n');
}

// ============================================
// EXPORT FOR GLOBAL ACCESS
// ============================================

(window as any).setupTestEnvironment = setupTestEnvironment;
(window as any).resetTestEnvironment = resetTestEnvironment;
(window as any).getTestEnvironment = getTestEnvironment;
(window as any).printTestCredentials = printTestCredentials;

console.log('✅ Test environment setup loaded!');
console.log('📝 Run: await setupTestEnvironment()');

// ============================================
// QUICK SETUP FUNCTION (Family A Only)
// ============================================

export async function setupTestEnvironmentQuick(): Promise<TestEnvironment> {
  console.log('🧪 ========================================');
  console.log('🧪 QUICK TEST ENVIRONMENT SETUP');
  console.log('🧪 (Family A Only - Faster!)');
  console.log('🧪 ========================================\n');

  const startTime = Date.now();

  try {
    // Check if already set up
    const existing = localStorage.getItem('fgs_test_environment');
    if (existing) {
      console.log('⚠️  Test environment already exists!');
      console.log('📋 Stored at: localStorage.fgs_test_environment');
      console.log('\nTo recreate, clear localStorage first\n');
      
      testEnv = JSON.parse(existing);
      return testEnv;
    }

    // Create Family A only
    const familyA = await retryWithBackoff(
      () => createFamily(
        'Test Family A',
        ['parent-a1@fgs-test.com', 'parent-a2@fgs-test.com'],
        [
          { name: 'Kid A1', pin: '1111', avatar: '👧' },
          { name: 'Kid A2', pin: '2222', avatar: '👦' }
        ]
      ),
      5, // Max 5 retries
      5000, // Start with 5 second delay
      'Family A creation'
    );

    // Create a minimal Family B placeholder (not actually created in DB)
    const familyB: TestFamily = {
      familyId: 'placeholder',
      familyName: 'Not Created (Quick Mode)',
      inviteCode: 'N/A',
      parents: [],
      children: []
    };

    // Create environment object
    testEnv = {
      familyA,
      familyB,
      setupTimestamp: new Date().toISOString()
    };

    // Save to localStorage
    localStorage.setItem('fgs_test_environment', JSON.stringify(testEnv, null, 2));

    // Print summary
    const duration = Date.now() - startTime;
    
    console.log('🎉 ========================================');
    console.log('🎉 QUICK TEST ENVIRONMENT READY!');
    console.log('🎉 ========================================\n');
    
    console.log('📊 SUMMARY:\n');
    console.log(`✅ Family A: ${familyA.familyId}`);
    console.log(`   Invite Code: ${familyA.inviteCode}`);
    console.log(`   Parents: ${familyA.parents.length}`);
    console.log(`   Children: ${familyA.children.length}\n`);
    
    console.log(`⏭️  Family B: Not created (quick mode)\n`);
    
    console.log(`⏱️  Setup Time: ${duration}ms\n`);
    
    console.log('💾 Data saved to: localStorage.fgs_test_environment\n');
    
    console.log('📝 Next Steps:\n');
    console.log('1. Run tests: Click "Points & Events (P0/P1)"');
    console.log('2. Full setup: Click "Reset & Recreate" for Family A + B\n');

    return testEnv;
  } catch (error) {
    console.error('❌ Quick setup failed:', error);
    
    // Check if it's a rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Too Many Requests') || errorMessage.includes('429')) {
      console.log('');
      console.log('═'.repeat(60));
      console.log('⚠️  RATE LIMIT EXCEEDED');
      console.log('═'.repeat(60));
      console.log('');
      console.log("You've hit Supabase authentication rate limits.");
      console.log('This is a security feature, not a bug!');
      console.log('');
      console.log('💡 SOLUTION:');
      console.log('   1. Wait 1 hour for rate limits to reset');
      console.log('   2. OR increase rate limits in Supabase dashboard:');
      console.log('      https://supabase.com/dashboard/project/[your-project]/auth/rate-limits');
      console.log('');
      console.log('📚 See: /RATE_LIMITING_CHECKLIST.md for details');
      console.log('');
      console.log('═'.repeat(60));
      console.log('');
    }
    
    throw error;
  }
}