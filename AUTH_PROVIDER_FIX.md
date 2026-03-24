# Auth Provider Context Error - FIXED

## ❌ The Error

```
Error: useAuth must be used within AuthProvider
```

This error occurred because some routes were trying to use the `useAuth()` hook without having `AuthProvider` available in their component tree.

## 🔍 Root Cause

The routing structure had routes wrapped WITHOUT `ProvidersLayout`, meaning they didn't have access to `AuthProvider`:

### **Before (BROKEN):**

```tsx
// Route 1: Login pages (NOT wrapped)
{
  path: "/login",
  element: <ParentLogin />,  // ❌ No AuthProvider!
},
{
  path: "/parent-login",
  element: <ParentLogin />,  // ❌ No AuthProvider!
},

// Route 2: Onboarding/diagnostic pages (NOT wrapped)
{
  path: "/onboarding",
  element: <ProtectedRoute><Onboarding /></ProtectedRoute>,  // ❌ No AuthProvider!
},
{
  path: "/diagnostic",
  element: <ProtectedRoute><DiagnosticPage /></ProtectedRoute>,  // ❌ No AuthProvider!
}
```

But these pages use `useAuth()`:
- `ParentLogin.tsx` → Line 17: `const { refreshSession } = useAuth();`
- `Onboarding.tsx` → Line 21: `const { refreshSession, accessToken, userId } = useAuth();`
- `DiagnosticPage.tsx` → Line 23: `const { accessToken, userId } = useAuth();`

## ✅ The Fix

Wrapped ALL routes that use `useAuth()` with `ProvidersLayout`:

### **After (FIXED):**

```tsx
// Route 1: Login pages (NOW wrapped)
{
  path: "/login",
  element: <ProvidersLayout><ParentLogin /></ProvidersLayout>,  // ✅
},
{
  path: "/parent-login",
  element: <ProvidersLayout><ParentLogin /></ProvidersLayout>,  // ✅
},

// Route 2: Onboarding/diagnostic pages (NOW wrapped)
{
  path: "/onboarding",
  element: <ProtectedRoute><ProvidersLayout><Onboarding /></ProvidersLayout></ProtectedRoute>,  // ✅
},
{
  path: "/diagnostic",
  element: <ProtectedRoute><ProvidersLayout><DiagnosticPage /></ProvidersLayout></ProtectedRoute>,  // ✅
}
```

## 📋 What is ProvidersLayout?

Located at `/src/app/layouts/ProvidersLayout.tsx`, it wraps routes with all necessary context providers:

```tsx
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  return (
    <AuthProvider>           {/* ← Provides useAuth() */}
      <FamilyProvider>       {/* ← Provides useFamilyContext() */}
        <ViewModeProvider>   {/* ← Provides useViewMode() */}
          {children || <Outlet />}
          <ModeTransitionOverlay />
        </ViewModeProvider>
      </FamilyProvider>
    </AuthProvider>
  );
}
```

## 🔄 Additional Improvements

### **Updated RequireFamily to use async storage:**

Changed from:
```tsx
const cachedFamilyId = localStorage.getItem('fgs_family_id');  // ❌ Web-only
```

To:
```tsx
const cachedFamilyId = await getStorage(STORAGE_KEYS.FAMILY_ID);  // ✅ Works on iOS + Web
```

This ensures the family check works on both web and iOS native apps.

## 🎯 Provider Hierarchy (Correct Structure)

```
App.tsx
└── ErrorBoundary
    └── RouterProvider
        └── Route
            └── ProtectedRoute (checks Supabase session)
                └── ProvidersLayout
                    └── AuthProvider ← useAuth() available here
                        └── FamilyProvider ← useFamilyContext() available here
                            └── ViewModeProvider ← useViewMode() available here
                                └── Page Components (Onboarding, DiagnosticPage, etc.)
```

## 📱 Files Changed

1. **`/src/app/routes.tsx`**
   - Wrapped `/onboarding`, `/join-pending`, and `/diagnostic` routes with `ProvidersLayout`
   - Updated `RequireFamily` to use async `getStorage()` instead of `localStorage`
   - Added import for `getStorage` and `STORAGE_KEYS` from storage wrapper

## ✅ Result

All routes now have proper access to:
- ✅ `useAuth()` hook (from AuthProvider)
- ✅ `useFamilyContext()` hook (from FamilyProvider)
- ✅ `useViewMode()` hook (from ViewModeProvider)

The "useAuth must be used within AuthProvider" error is now **completely resolved**.