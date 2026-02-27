/**
 * Device Simulator
 * 
 * Simulates multiple devices for testing:
 * - Device 1: Kid device (fresh install)
 * - Device 2: Parent device
 * - Device 3: Second kid device (session/device corner cases)
 * 
 * Usage in browser console:
 * import('/src/tests/device-simulator').then(m => m.simulateDevices())
 */

import { supabase } from '../../utils/supabase/client';

interface Device {
  id: string;
  type: 'kid' | 'parent';
  description: string;
  sessionData: {
    accessToken?: string;
    refreshToken?: string;
    userId?: string;
    familyId?: string;
    childId?: string;
  };
  localStorage: Record<string, string>;
}

interface DeviceSimulation {
  devices: Device[];
  activeDevice: string;
}

let simulation: DeviceSimulation = {
  devices: [],
  activeDevice: ''
};

// ============================================
// DEVICE MANAGEMENT
// ============================================

function createDevice(id: string, type: 'kid' | 'parent', description: string): Device {
  return {
    id,
    type,
    description,
    sessionData: {},
    localStorage: {}
  };
}

function saveSimulation() {
  localStorage.setItem('fgs_device_simulation', JSON.stringify(simulation));
}

function loadSimulation(): DeviceSimulation | null {
  const data = localStorage.getItem('fgs_device_simulation');
  return data ? JSON.parse(data) : null;
}

// ============================================
// DEVICE SWITCHING
// ============================================

export async function switchToDevice(deviceId: string): Promise<void> {
  console.log(`🔄 Switching to device: ${deviceId}\n`);

  const device = simulation.devices.find(d => d.id === deviceId);
  if (!device) {
    console.error(`❌ Device not found: ${deviceId}`);
    return;
  }

  // Save current device state
  if (simulation.activeDevice) {
    const currentDevice = simulation.devices.find(d => d.id === simulation.activeDevice);
    if (currentDevice) {
      // Capture current localStorage
      currentDevice.localStorage = {
        fgs_family_id: localStorage.getItem('fgs_family_id') || '',
        fgs_selected_child: localStorage.getItem('fgs_selected_child') || '',
        fgs_view_mode: localStorage.getItem('fgs_view_mode') || ''
      };

      // Capture current session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        currentDevice.sessionData = {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          userId: session.user.id,
          familyId: localStorage.getItem('fgs_family_id') || undefined,
          childId: localStorage.getItem('fgs_selected_child') || undefined
        };
      }

      console.log(`💾 Saved state for ${currentDevice.id}`);
    }
  }

  // Clear current session and localStorage
  await supabase.auth.signOut();
  localStorage.removeItem('fgs_family_id');
  localStorage.removeItem('fgs_selected_child');
  localStorage.removeItem('fgs_view_mode');

  // Restore target device state
  if (device.sessionData.accessToken) {
    // Restore session
    const { error } = await supabase.auth.setSession({
      access_token: device.sessionData.accessToken,
      refresh_token: device.sessionData.refreshToken || ''
    });

    if (error) {
      console.error('❌ Failed to restore session:', error.message);
    } else {
      console.log('✅ Session restored');
    }
  }

  // Restore localStorage
  if (device.localStorage.fgs_family_id) {
    localStorage.setItem('fgs_family_id', device.localStorage.fgs_family_id);
  }
  if (device.localStorage.fgs_selected_child) {
    localStorage.setItem('fgs_selected_child', device.localStorage.fgs_selected_child);
  }
  if (device.localStorage.fgs_view_mode) {
    localStorage.setItem('fgs_view_mode', device.localStorage.fgs_view_mode);
  }

  // Update active device
  simulation.activeDevice = deviceId;
  saveSimulation();

  console.log(`✅ Now on: ${device.description}`);
  console.log(`   Type: ${device.type}`);
  console.log(`   Session: ${device.sessionData.accessToken ? 'Active' : 'None'}`);
  console.log(`   Family ID: ${device.localStorage.fgs_family_id || 'None'}`);
  console.log(`   Child ID: ${device.localStorage.fgs_selected_child || 'None'}\n`);

  console.log('💡 Refresh the page to see the device state\n');
}

// ============================================
// DEVICE STATUS
// ============================================

export function showDeviceStatus(): void {
  console.log('📱 ========================================');
  console.log('📱 DEVICE SIMULATION STATUS');
  console.log('📱 ========================================\n');

  if (simulation.devices.length === 0) {
    console.log('❌ No devices simulated yet');
    console.log('Run: await simulateDevices()\n');
    return;
  }

  console.log(`Active Device: ${simulation.activeDevice}\n`);

  simulation.devices.forEach(device => {
    const isActive = device.id === simulation.activeDevice;
    const marker = isActive ? '👉' : '  ';
    
    console.log(`${marker} ${device.id} - ${device.description}`);
    console.log(`   Type: ${device.type}`);
    console.log(`   Session: ${device.sessionData.accessToken ? '✅ Active' : '❌ None'}`);
    console.log(`   Family: ${device.localStorage.fgs_family_id || 'None'}`);
    console.log(`   Child: ${device.localStorage.fgs_selected_child || 'None'}\n`);
  });

  console.log('💡 Commands:');
  console.log('   switchToDevice("device1") - Switch to kid device');
  console.log('   switchToDevice("device2") - Switch to parent device');
  console.log('   switchToDevice("device3") - Switch to second kid device\n');
}

// ============================================
// MAIN SIMULATION SETUP
// ============================================

export async function simulateDevices(): Promise<void> {
  console.log('📱 ========================================');
  console.log('📱 DEVICE SIMULATION SETUP');
  console.log('📱 ========================================\n');

  // Check if test environment exists
  const envStr = localStorage.getItem('fgs_test_environment');
  if (!envStr) {
    console.log('❌ No test environment found');
    console.log('Run: await setupTestEnvironment() first\n');
    return;
  }

  const env = JSON.parse(envStr);

  // Create devices
  console.log('📋 Creating devices...\n');

  const device1 = createDevice(
    'device1',
    'kid',
    'Kid Device (Fresh Install - Kid A1)'
  );

  const device2 = createDevice(
    'device2',
    'parent',
    'Parent Device (Parent A1)'
  );

  const device3 = createDevice(
    'device3',
    'kid',
    'Second Kid Device (Session Corner Cases - Kid A2)'
  );

  simulation.devices = [device1, device2, device3];
  simulation.activeDevice = 'device1';

  console.log('✅ Created 3 virtual devices\n');

  // Device 1: Fresh kid install (not logged in)
  console.log('📱 Device 1: Fresh Kid Install');
  console.log('   - No session');
  console.log('   - No localStorage');
  console.log('   - Simulates first-time app open\n');

  // Device 2: Parent logged in
  console.log('📱 Device 2: Parent Device');
  console.log('   - Logging in as Parent A1...');

  const { data: parentSignIn, error: parentError } = await supabase.auth.signInWithPassword({
    email: env.familyA.parents[0].email,
    password: env.familyA.parents[0].password
  });

  if (parentError) {
    console.error('   ❌ Failed to sign in parent:', parentError.message);
    return;
  }

  device2.sessionData = {
    accessToken: parentSignIn.session!.access_token,
    refreshToken: parentSignIn.session!.refresh_token,
    userId: parentSignIn.user.id,
    familyId: env.familyA.familyId
  };
  device2.localStorage = {
    fgs_family_id: env.familyA.familyId,
    fgs_view_mode: 'parent'
  };

  console.log('   ✅ Parent A1 logged in\n');

  // Device 3: Second kid device (for testing session conflicts)
  console.log('📱 Device 3: Second Kid Device');
  console.log('   - Kid A2 session prepared');
  console.log('   - For testing session/device corner cases\n');

  device3.localStorage = {
    fgs_family_id: env.familyA.familyId,
    fgs_selected_child: env.familyA.children[1].childId,
    fgs_view_mode: 'kid'
  };

  // Sign out to start with device 1 (fresh)
  await supabase.auth.signOut();
  simulation.activeDevice = 'device1';

  // Save simulation
  saveSimulation();

  console.log('✅ Device simulation ready!\n');

  console.log('📋 DEVICE SUMMARY:\n');
  console.log('Device 1: Kid Device (Fresh Install)');
  console.log('  - Use for: First-time kid login testing');
  console.log('  - Family Code: ' + env.familyA.inviteCode);
  console.log('  - Kid: Kid A1, PIN: 1111\n');

  console.log('Device 2: Parent Device');
  console.log('  - Use for: Parent operations');
  console.log('  - Email: ' + env.familyA.parents[0].email);
  console.log('  - Password: ' + env.familyA.parents[0].password + '\n');

  console.log('Device 3: Second Kid Device');
  console.log('  - Use for: Session conflict testing');
  console.log('  - Kid: Kid A2, PIN: 2222\n');

  console.log('💡 Commands:');
  console.log('   switchToDevice("device1") - Switch to fresh kid device');
  console.log('   switchToDevice("device2") - Switch to parent device');
  console.log('   switchToDevice("device3") - Switch to second kid device');
  console.log('   showDeviceStatus()        - Show all devices\n');

  console.log('📝 Current Device: device1 (Fresh Install)');
  console.log('💡 Refresh page to see device state\n');
}

// ============================================
// RESET SIMULATION
// ============================================

export async function resetDeviceSimulation(): Promise<void> {
  console.log('🔄 Resetting device simulation...\n');

  const confirmed = confirm('This will clear device simulation data.\nContinue?');
  if (!confirmed) {
    console.log('❌ Reset cancelled');
    return;
  }

  // Sign out
  await supabase.auth.signOut();

  // Clear localStorage
  localStorage.removeItem('fgs_device_simulation');
  localStorage.removeItem('fgs_family_id');
  localStorage.removeItem('fgs_selected_child');
  localStorage.removeItem('fgs_view_mode');

  // Reset simulation
  simulation = {
    devices: [],
    activeDevice: ''
  };

  console.log('✅ Device simulation reset');
  console.log('Run await simulateDevices() to recreate\n');
}

// ============================================
// TEST SCENARIOS
// ============================================

export async function testScenario_FreshKidLogin(): Promise<void> {
  console.log('🧪 ========================================');
  console.log('🧪 TEST SCENARIO: Fresh Kid Login');
  console.log('🧪 ========================================\n');

  // Get test environment
  const envStr = localStorage.getItem('fgs_test_environment');
  if (!envStr) {
    console.log('❌ No test environment found\n');
    return;
  }

  const env = JSON.parse(envStr);

  console.log('📋 Scenario: Kid opens app for first time\n');

  console.log('Step 1: Switch to fresh kid device');
  await switchToDevice('device1');

  console.log('Step 2: Manual actions required:');
  console.log('  1. Refresh page');
  console.log('  2. Navigate to /kid-login-new');
  console.log('  3. Enter family code: ' + env.familyA.inviteCode);
  console.log('  4. Select: Kid A1');
  console.log('  5. Enter PIN: 1111');
  console.log('  6. Verify: Kid dashboard loads\n');

  console.log('✅ Device ready for testing\n');
}

export async function testScenario_ParentApproval(): Promise<void> {
  console.log('🧪 ========================================');
  console.log('🧪 TEST SCENARIO: Parent Approval Flow');
  console.log('🧪 ========================================\n');

  console.log('📋 Scenario: Parent approves reward request\n');

  console.log('Step 1: Switch to parent device');
  await switchToDevice('device2');

  console.log('Step 2: Manual actions required:');
  console.log('  1. Refresh page');
  console.log('  2. Should already be logged in as Parent A1');
  console.log('  3. Navigate to /redemption-requests');
  console.log('  4. Review pending requests');
  console.log('  5. Approve or decline\n');

  console.log('✅ Device ready for testing\n');
}

export async function testScenario_SessionConflict(): Promise<void> {
  console.log('🧪 ========================================');
  console.log('🧪 TEST SCENARIO: Session Conflict');
  console.log('🧪 ========================================\n');

  const envStr = localStorage.getItem('fgs_test_environment');
  if (!envStr) {
    console.log('❌ No test environment found\n');
    return;
  }

  const env = JSON.parse(envStr);

  console.log('📋 Scenario: Two kids using same device\n');

  console.log('Step 1: Kid A1 logs in on device 1');
  await switchToDevice('device1');
  console.log('  Manual: Login as Kid A1 (PIN: 1111)\n');

  console.log('Step 2: Switch to device 3 (Kid A2)');
  await switchToDevice('device3');
  console.log('  Manual: Login as Kid A2 (PIN: 2222)\n');

  console.log('Step 3: Switch back to device 1');
  console.log('  Test: Does Kid A1 session persist?');
  console.log('  Or: Does app correctly handle session expiry?\n');

  console.log('✅ Ready to test session handling\n');
}

// ============================================
// LOAD EXISTING SIMULATION
// ============================================

const existing = loadSimulation();
if (existing) {
  simulation = existing;
  console.log('✅ Device simulation loaded from localStorage');
  console.log('📝 Run: showDeviceStatus()');
}

// ============================================
// EXPORT FOR GLOBAL ACCESS
// ============================================

(window as any).simulateDevices = simulateDevices;
(window as any).switchToDevice = switchToDevice;
(window as any).showDeviceStatus = showDeviceStatus;
(window as any).resetDeviceSimulation = resetDeviceSimulation;
(window as any).testScenario_FreshKidLogin = testScenario_FreshKidLogin;
(window as any).testScenario_ParentApproval = testScenario_ParentApproval;
(window as any).testScenario_SessionConflict = testScenario_SessionConflict;

console.log('✅ Device simulator loaded!');
console.log('📝 Run: await simulateDevices()');
