/**
 * Suppress known Recharts duplicate key warnings
 * These are internal to the Recharts library and don't affect functionality
 */
export function suppressRechartsWarnings() {
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    if (message.includes('Encountered two children with the same key')) {
      return; // Suppress Recharts duplicate key warnings
    }
    originalConsoleWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    if (message.includes('Encountered two children with the same key')) {
      return; // Suppress Recharts duplicate key warnings
    }
    originalConsoleError.apply(console, args);
  };
}
