import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { FamilyProvider } from './contexts/FamilyContext';
import { AuthProvider } from './contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from './contexts/ViewModeContext';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TestStatusIndicator } from './components/TestStatusIndicator';
import { TestControlPanel } from './components/TestControlPanel';

console.log('🚀 App.tsx loaded');

// Auto-load P0 test suite (always enabled for testing)
import('./utils/loadTestSuite').then(({ loadTestSuite }) => {
  // The loadTestSuite will auto-execute and make functions available
  console.log('🧪 Test suite auto-loading...');
}).catch(err => {
  console.warn('⚠️ Could not load test suite:', err.message);
});

export default function App() {
  console.log('🎯 App component rendering');
  
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FamilyProvider>
          <ViewModeProvider>
            <ErrorBoundary>
              <RouterProvider router={router} />
            </ErrorBoundary>
            <Toaster />
            <ModeTransitionOverlay />
            {import.meta.env.DEV && <TestStatusIndicator />}
            <TestControlPanel />
          </ViewModeProvider>
        </FamilyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}