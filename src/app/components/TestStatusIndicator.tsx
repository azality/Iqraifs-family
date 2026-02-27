/**
 * Test Status Indicator (Dev Only)
 * 
 * Shows P0 test status in development mode.
 * Appears as a floating badge in bottom-right corner.
 */

import { useState, useEffect } from 'react';

export function TestStatusIndicator() {
  const [testResults, setTestResults] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Check for test results every 2 seconds
    const interval = setInterval(() => {
      const results = (window as any).p0TestResults;
      if (results && results.length > 0) {
        const passed = results.filter((r: any) => r.status === 'PASS').length;
        const failed = results.filter((r: any) => r.status === 'FAIL').length;
        const skipped = results.filter((r: any) => r.status === 'SKIP').length;
        
        setTestResults({
          passed,
          failed,
          skipped,
          total: results.length
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Only show in development mode
  if (import.meta.env.PROD) return null;
  if (!testResults) return null;

  const passRate = Math.round((testResults.passed / (testResults.total - testResults.skipped)) * 100);
  const status = testResults.failed === 0 ? 'pass' : 'fail';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div 
        className={`
          rounded-lg shadow-lg cursor-pointer transition-all
          ${status === 'pass' ? 'bg-green-500' : 'bg-red-500'}
          ${isExpanded ? 'p-4 w-64' : 'p-2 w-auto'}
        `}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {!isExpanded ? (
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <span>🧪</span>
            <span>P0: {passRate}%</span>
            {testResults.failed > 0 && (
              <span className="bg-red-700 px-1.5 py-0.5 rounded text-xs">
                {testResults.failed} ❌
              </span>
            )}
          </div>
        ) : (
          <div className="text-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">P0 Test Results</h3>
              <button 
                className="text-white hover:text-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>✅ Passed:</span>
                <span className="font-bold">{testResults.passed}</span>
              </div>
              <div className="flex justify-between">
                <span>❌ Failed:</span>
                <span className="font-bold">{testResults.failed}</span>
              </div>
              <div className="flex justify-between">
                <span>⏭️ Skipped:</span>
                <span className="font-bold">{testResults.skipped}</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 mt-1">
                <span>📊 Total:</span>
                <span className="font-bold">{testResults.total}</span>
              </div>
              <div className="flex justify-between">
                <span>🎯 Pass Rate:</span>
                <span className="font-bold">{passRate}%</span>
              </div>
            </div>

            <button
              className="mt-3 w-full bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                console.table((window as any).p0TestResults);
              }}
            >
              View Details in Console
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
