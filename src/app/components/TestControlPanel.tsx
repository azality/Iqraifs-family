/**
 * Test Control Panel - CLEANED UP VERSION
 * 
 * A floating UI panel for running test suite commands
 * Now organized into logical sections with only essential buttons
 */

import { useState, useEffect } from 'react';
import { X, Play, Search, Zap } from 'lucide-react';
import { setStorage, removeStorage } from '../../utils/storage';

export function TestControlPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  // Handle ESC key to close panel
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const runCommand = async (commandName: string, commandFn: () => Promise<any>) => {
    setIsRunning(true);
    setLastResult(`Running ${commandName}...`);
    
    try {
      const result = await commandFn();
      console.log(`✅ ${commandName} completed:`, result);
      setLastResult(`✅ ${commandName} completed! Check console for details.`);
    } catch (error: any) {
      console.error(`❌ ${commandName} failed:`, error);
      setLastResult(`❌ ${commandName} failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const commands = [
    // ═══════════════════════════════════════════════════════════════
    // 🚀 MAIN TEST SUITE - USE THIS!
    // ═══════════════════════════════════════════════════════════════
    {
      name: '🎯 MASTER TEST SUITE (All 27 Tests)',
      icon: Zap,
      description: '🚀 RUN THIS! Complete production readiness validation - runs all test suites (5-7 min)',
      category: 'main',
      action: async () => {
        const { runMasterTestSuite } = await import('../tests/master-test-suite');
        return await runMasterTestSuite(false); // false = don't skip slow tests
      }
    },
    {
      name: '⚡ FAST Suite (Skip Slow Tests)',
      icon: Zap,
      description: 'Faster version - runs 24 core test suites, skips System Audit & Device Simulation (~3 min)',
      category: 'main',
      action: async () => {
        const { runMasterTestSuite } = await import('../tests/master-test-suite');
        return await runMasterTestSuite(true); // true = skip slow tests
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 🔧 SETUP - Get Test Data Ready
    // ═══════════════════════════════════════════════════════════════
    {
      name: '🔍 Discover Test Data',
      icon: Search,
      description: 'Find existing test families (Family A, Family B) - run this first if no test data',
      category: 'setup',
      action: async () => {
        const { getOrDiscoverTestData } = await import('../tests/discover-test-data');
        const testData = await getOrDiscoverTestData();
        console.log('📦 Test Data:', testData);
        return testData;
      }
    },
    {
      name: '⭐ Use Current Session',
      icon: Zap,
      description: 'Use YOUR logged-in family for testing (easiest option if you have a family)',
      category: 'setup',
      action: async () => {
        // Get current user session
        const { createClient } = await import('@supabase/supabase-js');
        const { projectId, publicAnonKey } = await import('../../../utils/supabase/info');
        const supabase = createClient(
          `https://${projectId}.supabase.co`,
          publicAnonKey
        );
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!session || error) {
          console.log('❌ Not logged in. Please log in first.');
          return { error: 'Not logged in' };
        }
        
        console.log('✅ Using current session for testing');
        console.log('   User:', session.user.email);
        
        // Fetch family data
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;
        const familyRes = await fetch(`${API_BASE}/family`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        });
        
        if (!familyRes.ok) {
          console.log('❌ No family found. Please complete onboarding first.');
          return { error: 'No family found' };
        }
        
        const family = await familyRes.json();
        console.log('✅ Family found:', family.name);
        
        // Store in localStorage
        const testEnv = {
          familyA: {
            familyId: family.id,
            familyName: family.name,
            inviteCode: family.inviteCode,
            parents: [{
              email: session.user.email,
              accessToken: session.access_token,
              userId: session.user.id
            }],
            children: family.children || []
          }
        };

        await setStorage('fgs_test_environment', JSON.stringify(testEnv));
        console.log('✅ Test environment updated with your session');

        return testEnv;
      }
    },
    {
      name: '🔄 Reset & Recreate Test Data',
      icon: Search,
      description: 'Delete old test data and create fresh Family A + Family B (use if tests fail)',
      category: 'setup',
      action: async () => {
        console.log('🧹 Resetting test environment...\n');

        // Clear storage
        await removeStorage('fgs_test_environment');
        console.log('✅ Storage cleared\n');
        
        // Note: We can't recreate test families here because setup-test-environment.ts doesn't exist
        // Users need to use "Discover Test Data" instead
        console.log('⚠️  Auto-recreation not available');
        console.log('💡 Use "Discover Test Data" to find existing test families');
        console.log('   or manually create test families through the UI\n');
        
        return { cleared: true, note: 'Use Discover Test Data to find families' };
      }
    },
    {
      name: '⚡ Quick Setup (Family A Only)',
      icon: Zap,
      description: '🔥 FASTEST! Creates minimal test data (1 family, 2 parents, 2 kids) - ~30 seconds',
      category: 'setup',
      action: async () => {
        const { setupTestEnvironmentQuick } = await import('../../tests/setup-test-environment');
        return await setupTestEnvironmentQuick();
      }
    },
  ];

  // Group commands by category
  const mainCommands = commands.filter(c => c.category === 'main');
  const setupCommands = commands.filter(c => c.category === 'setup');

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg z-50 flex items-center gap-2"
        title="Open Test Control Panel"
      >
        <Play className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl z-50 w-[600px] max-h-[80vh] overflow-auto border border-gray-200">
      {/* Header */}
      <div className="sticky top-0 bg-purple-600 text-white p-4 flex items-center justify-between rounded-t-lg z-10">
        <div className="flex items-center gap-2">
          <Play className="w-5 h-5" />
          <h2 className="font-bold text-lg">Test Control Panel</h2>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
          className="hover:bg-purple-700 p-2 rounded-lg transition-colors flex items-center gap-1"
          title="Close panel (or press ESC)"
        >
          <X className="w-5 h-5" />
          <span className="text-xs">ESC</span>
        </button>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className={`p-3 m-4 rounded-lg ${
          lastResult.includes('✅') ? 'bg-green-50 text-green-800 border border-green-200' :
          lastResult.includes('❌') ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          <p className="text-sm font-mono">{lastResult}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="p-4 bg-blue-50 border-b border-blue-200">
        <p className="text-sm text-blue-900 font-medium mb-2">
          ⚡ Quick Start (First Time):
        </p>
        <ol className="text-sm text-blue-800 space-y-1 ml-4">
          <li>1. Click <strong>"⚡ Quick Setup (Family A Only)"</strong> (creates test data in ~30 sec)</li>
          <li>2. Click <strong>"🎯 MASTER TEST SUITE"</strong> (runs all 27 tests)</li>
          <li>3. Check console for detailed results</li>
        </ol>
        <p className="text-xs text-blue-700 mt-2 italic">
          Already have test data? Skip to step 2!
        </p>
        <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-200">
          📝 Note: 400 errors in Network tab during "Discover" are normal - the system tries different credentials.
        </p>
      </div>

      {/* Commands */}
      <div className="p-4 space-y-6">
        {/* Main Test Suite */}
        <div>
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600" />
            Main Test Suite
          </h3>
          <div className="space-y-2">
            {mainCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => runCommand(cmd.name, cmd.action)}
                disabled={isRunning}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <div className="flex items-start gap-2">
                  <cmd.icon className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900">{cmd.name}</div>
                    <div className="text-xs text-gray-600 mt-1">{cmd.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Setup Tools */}
        <div>
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-600" />
            Setup & Test Data
          </h3>
          <div className="space-y-2">
            {setupCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => runCommand(cmd.name, cmd.action)}
                disabled={isRunning}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <div className="flex items-start gap-2">
                  <cmd.icon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900">{cmd.name}</div>
                    <div className="text-xs text-gray-600 mt-1">{cmd.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gray-50 p-3 rounded-b-lg border-t border-gray-200">
        <p className="text-xs text-gray-600 text-center">
          💡 Tip: All results appear in the browser console
        </p>
      </div>
    </div>
  );
}