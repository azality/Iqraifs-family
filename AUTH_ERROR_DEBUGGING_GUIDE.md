# Auth Error Debugging Guide

## Current Status

The error "useAuth must be used within AuthProvider" is still occurring after multiple fix attempts. We've now added enhanced debugging to identify the exact source.

## What We've Done

### 1. Restructured Routes (✅ Completed)
Changed from individual route wrapping to a parent layout route pattern:

```tsx
// routes.tsx
export const router = createBrowserRouter([
  {
    element: <ProvidersLayout />,  // ✅ Single parent wrapping ALL routes
    children: [
      { path: "/welcome", element: <Welcome /> },
      { path: "/login", element: <ParentLogin /> },
      // ... all other routes
    ],
  },
]);
```

### 2. Added Debug Logging (✅ Completed)

**AuthContext.tsx** - `useAuth()` function:
```tsx
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    console.error('❌ useAuth called outside AuthProvider!');
    console.error('Stack trace:', new Error().stack);
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

**ProvidersLayout.tsx** - Component render:
```tsx
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  console.log('🔧 ProvidersLayout rendering, has children:', !!children);
  // ...
}
```

## Debugging Steps

### Step 1: Check Browser Console

When the error occurs, check the browser console for:

1. **Stack Trace:**
   ```
   ❌ useAuth called outside AuthProvider!
   Stack trace: Error
       at useAuth (AuthContext.tsx:475)
       at ComponentName (ComponentFile.tsx:XX)
       at ...
   ```
   
   This will tell us EXACTLY which component is calling `useAuth()` outside the provider.

2. **ProvidersLayout Logs:**
   ```
   🔧 ProvidersLayout rendering, has children: false
   ```
   
   This confirms ProvidersLayout is rendering and using `<Outlet />`.

3. **AuthContext Initialization:**
   ```
   🔄 AuthContext: Loading initial state from storage...
   📦 Loaded from storage: {...}
   🔐 AuthContext: Initial role determined: parent
   ```

### Step 2: Identify the Culprit

Once we have the stack trace, we'll know:
- Which component called `useAuth()`
- Which file and line number
- The call stack showing how that component was rendered

### Step 3: Common Scenarios

#### Scenario A: Component Rendered Before Provider
**Symptom:** Stack trace shows a component is rendered directly by RouterProvider, not through ProvidersLayout
**Cause:** Route configuration error - route not a child of ProvidersLayout
**Fix:** Move route into the `children` array of the parent ProvidersLayout route

#### Scenario B: Module-Level Hook Call
**Symptom:** Stack trace shows `useAuth()` called at module level, not inside a component
**Cause:** Someone called `useAuth()` outside a React component (e.g., at the top level of a file)
**Fix:** Move the hook call inside the component function

#### Scenario C: Error Boundary or Fallback
**Symptom:** Error occurs during React Router's error handling
**Cause:** An error occurred somewhere else, and React Router's error boundary is trying to render a fallback that uses `useAuth()`
**Fix:** Find and fix the original error, or ensure error boundaries don't use `useAuth()`

#### Scenario D: Timing Issue
**Symptom:** Error occurs intermittently or only on first load
**Cause:** Race condition where component renders before provider finishes initialization
**Fix:** Add null checks or loading states in components

## Next Steps

1. **Run the app** and wait for the error
2. **Copy the full console output**, especially:
   - The stack trace from `useAuth()`
   - Any logs from ProvidersLayout
   - Any other error messages
3. **Analyze the stack trace** to identify which component is the problem
4. **Fix the specific component** based on the scenario above

## Potential Root Causes (Ranked by Likelihood)

1. **❓ React Router v7 Behavior Change**
   - React Router might be rendering error boundaries or fallbacks before provider context is available
   - Solution: Add error boundaries that don't use hooks

2. **❓ Race Condition During Initial Load**
   - ProvidersLayout renders but AuthProvider hasn't finished initializing
   - Solution: Add loading state to AuthProvider and don't render children until ready

3. **❓ Hidden Import or Module-Level Code**
   - Some file imports a component that calls `useAuth()` at module level
   - Solution: Find and fix the module-level hook call

4. **❓ React Router Outlet Timing**
   - `<Outlet />` might render before provider context is established
   - Solution: Wrap `<Outlet />` with a loading check

## Proposed Emergency Fix (If Debug Doesn't Work)

If we can't identify the source from logs, we can add a "safe mode" to `useAuth()`:

```tsx
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    // Instead of throwing, return a safe default
    console.warn('⚠️ useAuth called before provider ready, returning loading state');
    return {
      role: 'parent' as UserRole,
      isParentMode: true,
      requestParentAccess: () => false,
      switchToChildMode: () => {},
      switchToParentMode: () => false,
      accessToken: null,
      userId: null,
      user: null,
      refreshSession: async () => {},
      logout: async () => {},
      isLoading: true,  // ← Key: mark as loading
    };
  }
  
  return context;
}
```

**Note:** This is NOT ideal - it hides the real problem. Only use as a last resort for demo/testing.

## Files Modified

1. `/src/app/routes.tsx` - Restructured to use parent layout route
2. `/src/app/contexts/AuthContext.tsx` - Added debug logging to `useAuth()`
3. `/src/app/layouts/ProvidersLayout.tsx` - Added debug logging to render

## Summary

We need to see the **stack trace** from the browser console to identify exactly where `useAuth()` is being called outside the provider. Once we have that, we can pinpoint and fix the specific component or code pattern causing the issue.
