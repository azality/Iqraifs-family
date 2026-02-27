/**
 * COMPREHENSIVE API SECURITY AUDIT (P0)
 * 
 * Tests all critical API endpoints for:
 * - Authentication enforcement
 * - Authorization (role-based access)
 * - Family isolation
 * - Child access control
 * - Data leakage prevention
 * 
 * Based on: Backend API Coverage P0/P1 Specification
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
// TEST DATA & SETUP
// ============================================================================

interface TestContext {
  // Parent A (Family A)
  parentA: {
    email: string;
    password: string;
    token: string;
    userId: string;
  };
  
  // Parent B (Family B)
  parentB: {
    email: string;
    password: string;
    token: string;
    userId: string;
  };
  
  // Family A
  familyA: {
    id: string;
    name: string;
    code: string;
  };
  
  // Family B
  familyB: {
    id: string;
    name: string;
    code: string;
  };
  
  // Children in Family A
  childA1: {
    id: string;
    name: string;
    pin: string;
    token: string;
  };
  childA2: {
    id: string;
    name: string;
    pin: string;
    token: string;
  };
  
  // Child in Family B
  childB1: {
    id: string;
    name: string;
    pin: string;
    token: string;
  };
}

// ============================================================================
// API-P0.1: HEALTH CHECK (PUBLIC)
// ============================================================================

async function testHealthCheck(): Promise<{ passed: boolean; message: string; duration: number }> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 API-P0.1: Testing health check endpoint...');
    
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
    });
    
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    // Verify response
    if (response.status !== 200) {
      return {
        passed: false,
        message: `Health check returned ${response.status} instead of 200`,
        duration
      };
    }
    
    if (data.status !== 'ok') {
      return {
        passed: false,
        message: `Health check returned status '${data.status}' instead of 'ok'`,
        duration
      };
    }
    
    console.log('✅ API-P0.1: Health check passed');
    return {
      passed: true,
      message: 'Health check endpoint working correctly',
      duration
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Health check failed: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

// ============================================================================
// API-P0.2: PUBLIC FAMILY CODE VERIFY
// ============================================================================

async function testFamilyCodeVerify(
  validCode: string,
  expectedFamilyId: string
): Promise<{ passed: boolean; message: string; duration: number }> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 API-P0.2: Testing family code verification...');
    
    // Test 1: Valid code
    const validResponse = await fetch(`${API_BASE}/public/verify-family-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify({ familyCode: validCode })
    });
    
    const validData = await validResponse.json();
    
    if (!validResponse.ok || !validData.valid) {
      return {
        passed: false,
        message: `Valid code not accepted: ${validData.error || 'Unknown error'}`,
        duration: Date.now() - startTime
      };
    }
    
    if (validData.familyId !== expectedFamilyId) {
      return {
        passed: false,
        message: `Valid code returned wrong familyId: ${validData.familyId} !== ${expectedFamilyId}`,
        duration: Date.now() - startTime
      };
    }
    
    // Test 2: Invalid code (no enumeration)
    const invalidResponse = await fetch(`${API_BASE}/public/verify-family-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify({ familyCode: 'INVALID123' })
    });
    
    const invalidData = await invalidResponse.json();
    
    if (invalidResponse.status !== 404) {
      return {
        passed: false,
        message: `Invalid code didn't return 404: ${invalidResponse.status}`,
        duration: Date.now() - startTime
      };
    }
    
    // Verify no enumeration hints
    if (invalidData.familyId || invalidData.familyName) {
      return {
        passed: false,
        message: 'Invalid code response leaks family information',
        duration: Date.now() - startTime
      };
    }
    
    const duration = Date.now() - startTime;
    
    // Test 3: Response time
    if (duration > 2000) {
      return {
        passed: false,
        message: `Response time too slow: ${duration}ms > 2000ms`,
        duration
      };
    }
    
    console.log('✅ API-P0.2: Family code verification passed');
    return {
      passed: true,
      message: 'Family code verification working correctly',
      duration
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Family code verification failed: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

// ============================================================================
// API-P0.3: PUBLIC CHILDREN LIST (NO SENSITIVE DATA)
// ============================================================================

async function testPublicChildrenList(
  familyId: string
): Promise<{ passed: boolean; message: string; duration: number }> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 API-P0.3: Testing public children list...');
    
    const response = await fetch(`${API_BASE}/public/families/${familyId}/children`, {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY
      }
    });
    
    if (!response.ok) {
      return {
        passed: false,
        message: `Public children list failed: ${response.status}`,
        duration: Date.now() - startTime
      };
    }
    
    const children = await response.json();
    
    // Verify it's an array
    if (!Array.isArray(children)) {
      return {
        passed: false,
        message: 'Children list is not an array',
        duration: Date.now() - startTime
      };
    }
    
    // Verify no sensitive data in response
    for (const child of children) {
      // Check for forbidden fields
      const sensitiveFields = ['pin', 'pinHash', 'hashedPin', 'parentIds', 'familyId'];
      const foundSensitive = sensitiveFields.filter(field => child[field] !== undefined);
      
      if (foundSensitive.length > 0) {
        return {
          passed: false,
          message: `Sensitive fields found in public children list: ${foundSensitive.join(', ')}`,
          duration: Date.now() - startTime
        };
      }
      
      // Verify required safe fields exist
      if (!child.id || !child.name) {
        return {
          passed: false,
          message: 'Required fields (id, name) missing from children list',
          duration: Date.now() - startTime
        };
      }
    }
    
    console.log('✅ API-P0.3: Public children list passed');
    return {
      passed: true,
      message: `Public children list secure (${children.length} children, no sensitive data)`,
      duration: Date.now() - startTime
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Public children list failed: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

// ============================================================================
// API-P0.4: KID PIN VERIFICATION & SESSION CREATION
// ============================================================================

async function testKidPinVerification(
  familyCode: string,
  childId: string,
  correctPin: string
): Promise<{ passed: boolean; message: string; duration: number; kidToken?: string }> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 API-P0.4: Testing kid PIN verification...');
    
    // Test 1: Correct PIN
    const correctResponse = await fetch(`${API_BASE}/kid/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify({
        familyCode,
        childId,
        pin: correctPin
      })
    });
    
    const correctData = await correctResponse.json();
    
    if (!correctResponse.ok || !correctData.success) {
      return {
        passed: false,
        message: `Correct PIN not accepted: ${correctData.error || 'Unknown error'}`,
        duration: Date.now() - startTime
      };
    }
    
    if (!correctData.kidAccessToken) {
      return {
        passed: false,
        message: 'Correct PIN did not return kid session token',
        duration: Date.now() - startTime
      };
    }
    
    const kidToken = correctData.kidAccessToken;
    
    // Test 2: Wrong PIN
    const wrongResponse = await fetch(`${API_BASE}/kid/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify({
        familyCode,
        childId,
        pin: '0000' // Wrong PIN
      })
    });
    
    const wrongData = await wrongResponse.json();
    
    if (wrongResponse.status !== 401) {
      return {
        passed: false,
        message: `Wrong PIN didn't return 401: ${wrongResponse.status}`,
        duration: Date.now() - startTime
      };
    }
    
    if (wrongData.success === true) {
      return {
        passed: false,
        message: 'Wrong PIN was accepted (security breach!)',
        duration: Date.now() - startTime
      };
    }
    
    // Verify safe error message (no enumeration)
    if (wrongData.childId || wrongData.familyId) {
      return {
        passed: false,
        message: 'Wrong PIN response leaks sensitive information',
        duration: Date.now() - startTime
      };
    }
    
    console.log('✅ API-P0.4: Kid PIN verification passed');
    return {
      passed: true,
      message: 'Kid PIN verification working correctly',
      duration: Date.now() - startTime,
      kidToken
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Kid PIN verification failed: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

// ============================================================================
// API-P0.5: PARENT-ONLY ENDPOINTS ENFORCE requireParent
// ============================================================================

interface EndpointTest {
  name: string;
  method: string;
  path: string;
  body?: any;
  requiresFamilyId?: boolean;
}

async function testParentOnlyEndpoints(
  ctx: Partial<TestContext>
): Promise<{ passed: boolean; message: string; duration: number; details: any[] }> {
  const startTime = Date.now();
  const details: any[] = [];
  
  try {
    console.log('🧪 API-P0.5: Testing parent-only endpoints...');
    
    // Define parent-only endpoints to test
    const endpoints: EndpointTest[] = [
      {
        name: 'Create Family',
        method: 'POST',
        path: '/families',
        body: { name: 'Test Family' }
      },
      {
        name: 'Get Family',
        method: 'GET',
        path: `/families/${ctx.familyA?.id || 'family:test'}`,
        requiresFamilyId: true
      },
      {
        name: 'Get Family Children',
        method: 'GET',
        path: `/families/${ctx.familyA?.id || 'family:test'}/children`,
        requiresFamilyId: true
      },
      {
        name: 'Create Child',
        method: 'POST',
        path: '/children',
        body: {
          familyId: ctx.familyA?.id || 'family:test',
          name: 'Test Child',
          pin: '1234',
          age: 8
        },
        requiresFamilyId: true
      }
    ];
    
    for (const endpoint of endpoints) {
      const endpointResult = {
        endpoint: endpoint.name,
        tests: {
          noToken: { passed: false, status: 0 },
          kidToken: { passed: false, status: 0 },
          wrongFamily: { passed: false, status: 0 },
          validParent: { passed: false, status: 0 }
        }
      };
      
      // Test 1: No token → 401
      try {
        const response = await fetch(`${API_BASE}${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
        });
        
        endpointResult.tests.noToken.status = response.status;
        endpointResult.tests.noToken.passed = response.status === 401;
      } catch (e) {
        console.warn(`No token test failed for ${endpoint.name}:`, e.message);
      }
      
      // Test 2: Kid token → 403
      if (ctx.childA1?.token) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ctx.childA1.token}`
            },
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
          });
          
          endpointResult.tests.kidToken.status = response.status;
          endpointResult.tests.kidToken.passed = response.status === 403;
        } catch (e) {
          console.warn(`Kid token test failed for ${endpoint.name}:`, e.message);
        }
      }
      
      // Test 3: Parent token but wrong family → 403 (if family-scoped)
      if (endpoint.requiresFamilyId && ctx.parentB?.token && ctx.familyA?.id) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ctx.parentB.token}`
            },
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
          });
          
          endpointResult.tests.wrongFamily.status = response.status;
          endpointResult.tests.wrongFamily.passed = response.status === 403 || response.status === 404;
        } catch (e) {
          console.warn(`Wrong family test failed for ${endpoint.name}:`, e.message);
        }
      } else {
        endpointResult.tests.wrongFamily.passed = true; // Not applicable
      }
      
      // Test 4: Valid parent token → 200/201
      if (ctx.parentA?.token) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ctx.parentA.token}`
            },
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
          });
          
          endpointResult.tests.validParent.status = response.status;
          endpointResult.tests.validParent.passed = 
            response.status === 200 || 
            response.status === 201 || 
            response.status === 409; // Conflict is OK (already exists)
        } catch (e) {
          console.warn(`Valid parent test failed for ${endpoint.name}:`, e.message);
        }
      }
      
      details.push(endpointResult);
    }
    
    // Check if all tests passed
    const allPassed = details.every(result => 
      Object.values(result.tests).every(test => test.passed)
    );
    
    console.log('✅ API-P0.5: Parent-only endpoints test complete');
    return {
      passed: allPassed,
      message: allPassed 
        ? 'All parent-only endpoints properly secured'
        : 'Some parent-only endpoints have security issues',
      duration: Date.now() - startTime,
      details
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Parent-only endpoints test failed: ${error.message}`,
      duration: Date.now() - startTime,
      details
    };
  }
}

// ============================================================================
// API-P0.6: SHARED ENDPOINTS ENFORCE requireChildAccess
// ============================================================================

async function testChildAccessEndpoints(
  ctx: Partial<TestContext>
): Promise<{ passed: boolean; message: string; duration: number; details: any[] }> {
  const startTime = Date.now();
  const details: any[] = [];
  
  try {
    console.log('🧪 API-P0.6: Testing child access control...');
    
    // Test child-specific endpoints
    const childId = ctx.childA1?.id || 'child:test';
    const otherChildSameFamily = ctx.childA2?.id || 'child:test2';
    const childDiffFamily = ctx.childB1?.id || 'child:testB';
    
    const endpoints = [
      {
        name: 'Get Child Events',
        path: (cid: string) => `/children/${cid}/events`
      },
      {
        name: 'Get Child Challenges',
        path: (cid: string) => `/children/${cid}/challenges`
      }
    ];
    
    for (const endpoint of endpoints) {
      const result = {
        endpoint: endpoint.name,
        tests: {
          kidSelf: { passed: false, status: 0 },
          kidOtherSameFamily: { passed: false, status: 0 },
          kidDiffFamily: { passed: false, status: 0 },
          parentSameFamily: { passed: false, status: 0 },
          parentDiffFamily: { passed: false, status: 0 }
        }
      };
      
      // Test 1: Kid A1 accessing own data → 200
      if (ctx.childA1?.token) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path(childId)}`, {
            headers: {
              'Authorization': `Bearer ${ctx.childA1.token}`
            }
          });
          result.tests.kidSelf.status = response.status;
          result.tests.kidSelf.passed = response.status === 200;
        } catch (e) {
          console.warn(`Kid self test failed:`, e.message);
        }
      }
      
      // Test 2: Kid A1 accessing Kid A2 (same family) → 403
      if (ctx.childA1?.token && otherChildSameFamily) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path(otherChildSameFamily)}`, {
            headers: {
              'Authorization': `Bearer ${ctx.childA1.token}`
            }
          });
          result.tests.kidOtherSameFamily.status = response.status;
          result.tests.kidOtherSameFamily.passed = response.status === 403;
        } catch (e) {
          console.warn(`Kid other same family test failed:`, e.message);
        }
      }
      
      // Test 3: Kid A1 accessing Kid B1 (different family) → 403
      if (ctx.childA1?.token && childDiffFamily) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path(childDiffFamily)}`, {
            headers: {
              'Authorization': `Bearer ${ctx.childA1.token}`
            }
          });
          result.tests.kidDiffFamily.status = response.status;
          result.tests.kidDiffFamily.passed = response.status === 403;
        } catch (e) {
          console.warn(`Kid diff family test failed:`, e.message);
        }
      }
      
      // Test 4: Parent A accessing any child in Family A → 200
      if (ctx.parentA?.token) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path(childId)}`, {
            headers: {
              'Authorization': `Bearer ${ctx.parentA.token}`
            }
          });
          result.tests.parentSameFamily.status = response.status;
          result.tests.parentSameFamily.passed = response.status === 200;
        } catch (e) {
          console.warn(`Parent same family test failed:`, e.message);
        }
      }
      
      // Test 5: Parent A accessing child in Family B → 403
      if (ctx.parentA?.token && childDiffFamily) {
        try {
          const response = await fetch(`${API_BASE}${endpoint.path(childDiffFamily)}`, {
            headers: {
              'Authorization': `Bearer ${ctx.parentA.token}`
            }
          });
          result.tests.parentDiffFamily.status = response.status;
          result.tests.parentDiffFamily.passed = response.status === 403;
        } catch (e) {
          console.warn(`Parent diff family test failed:`, e.message);
        }
      }
      
      details.push(result);
    }
    
    // Check if all tests passed
    const allPassed = details.every(result => 
      Object.values(result.tests).every(test => test.passed)
    );
    
    console.log('✅ API-P0.6: Child access control test complete');
    return {
      passed: allPassed,
      message: allPassed
        ? 'Child access control working correctly'
        : 'Some child access control issues found',
      duration: Date.now() - startTime,
      details
    };
    
  } catch (error) {
    return {
      passed: false,
      message: `Child access control test failed: ${error.message}`,
      duration: Date.now() - startTime,
      details
    };
  }
}

// ============================================================================
// MAIN AUDIT RUNNER
// ============================================================================

export async function runComprehensiveApiSecurityAudit(
  existingTestData?: Partial<TestContext>
): Promise<any> {
  console.log('\n🔒 ========================================');
  console.log('🔒 COMPREHENSIVE API SECURITY AUDIT (P0)');
  console.log('🔒 ========================================\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    tests: [] as any[],
    summary: {
      total: 6,
      passed: 0,
      failed: 0,
      warnings: 0,
      skipped: 0
    }
  };
  
  // API-P0.1: Health Check
  const healthResult = await testHealthCheck();
  results.tests.push({
    id: 'API-P0.1',
    name: 'Health check (public)',
    ...healthResult
  });
  if (healthResult.passed) results.summary.passed++;
  else results.summary.failed++;
  
  // Check if we have test data
  if (!existingTestData?.familyA?.code || !existingTestData?.familyA?.id) {
    console.warn('⚠️  No test data provided. Skipping tests that require existing families/children.');
    console.warn('   To run full audit, provide existing test data with families and children.');
    
    results.summary.skipped = 5;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 API SECURITY AUDIT SUMMARY (PARTIAL)');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${results.summary.total}`);
    console.log(`✅ Passed: ${results.summary.passed}`);
    console.log(`❌ Failed: ${results.summary.failed}`);
    console.log(`⏭️  Skipped: ${results.summary.skipped} (no test data)`);
    console.log('='.repeat(60) + '\n');
    
    return results;
  }
  
  // API-P0.2: Family Code Verification
  const familyCodeResult = await testFamilyCodeVerify(
    existingTestData.familyA.code,
    existingTestData.familyA.id
  );
  results.tests.push({
    id: 'API-P0.2',
    name: 'Public family code verify',
    ...familyCodeResult
  });
  if (familyCodeResult.passed) results.summary.passed++;
  else results.summary.failed++;
  
  // API-P0.3: Public Children List
  const childrenListResult = await testPublicChildrenList(
    existingTestData.familyA.id
  );
  results.tests.push({
    id: 'API-P0.3',
    name: 'Public children list (no sensitive data)',
    ...childrenListResult
  });
  if (childrenListResult.passed) results.summary.passed++;
  else results.summary.failed++;
  
  // API-P0.4: Kid PIN Verification
  if (existingTestData.childA1?.id && existingTestData.childA1?.pin) {
    const pinResult = await testKidPinVerification(
      existingTestData.familyA.code,
      existingTestData.childA1.id,
      existingTestData.childA1.pin
    );
    results.tests.push({
      id: 'API-P0.4',
      name: 'Kid PIN verification & session',
      ...pinResult
    });
    if (pinResult.passed) results.summary.passed++;
    else results.summary.failed++;
    
    // Store kid token for later tests
    if (pinResult.kidToken && existingTestData.childA1) {
      existingTestData.childA1.token = pinResult.kidToken;
    }
  } else {
    results.summary.skipped++;
    results.tests.push({
      id: 'API-P0.4',
      name: 'Kid PIN verification & session',
      passed: false,
      message: 'Skipped - no child test data',
      duration: 0
    });
  }
  
  // API-P0.5: Parent-Only Endpoints
  const parentOnlyResult = await testParentOnlyEndpoints(existingTestData);
  results.tests.push({
    id: 'API-P0.5',
    name: 'Parent-only endpoints (requireParent)',
    ...parentOnlyResult
  });
  if (parentOnlyResult.passed) results.summary.passed++;
  else results.summary.failed++;
  
  // API-P0.6: Child Access Control
  const childAccessResult = await testChildAccessEndpoints(existingTestData);
  results.tests.push({
    id: 'API-P0.6',
    name: 'Shared endpoints (requireChildAccess)',
    ...childAccessResult
  });
  if (childAccessResult.passed) results.summary.passed++;
  else results.summary.failed++;
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE API SECURITY AUDIT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`⚠️  Warnings: ${results.summary.warnings}`);
  console.log(`⏭️  Skipped: ${results.summary.skipped}`);
  console.log('='.repeat(60));
  
  // Print detailed results
  console.log('\n📋 DETAILED RESULTS:\n');
  for (const test of results.tests) {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${test.id}: ${test.name}`);
    console.log(`   ${test.message}`);
    console.log(`   Duration: ${test.duration}ms\n`);
  }
  
  return results;
}