# iOS Native Storage Migration Guide

## ✅ Migration Status

### Completed Files
1. **`/src/utils/storage.ts`** - ✅ Cross-platform storage wrapper created
2. **`/src/utils/auth.ts`** - ✅ Migrated to async storage
3. **`/src/app/utils/authHelpers.ts`** - ✅ Migrated to async storage
4. **`/src/app/contexts/AuthContext.tsx`** - ✅ Complete async migration

### Files Still Using localStorage (Non-Critical)
- `/src/app/data/test-auth-comprehensive.ts` - Test file (OK to keep localStorage)
- `/src/app/components/TestControlPanel.tsx` - Dev tool (OK to keep localStorage)

### Files That Need Migration (High Priority)
The following files read/write auth-related data and should be migrated:

1. **`/src/app/contexts/FamilyContext.tsx`** - Family state management
2. **`/src/app/components/AuthErrorBanner.tsx`** - Error handling
3. **`/src/app/components/ModeSwitcher.tsx`** - Parent/Kid mode switching
4. **`/src/app/components/RequireParentRole.tsx`** - Route protection
5. **`/src/app/components/mobile/FloatingActionButton.tsx`** - Mobile UI

---

## 📖 Migration Pattern

### Before (Synchronous localStorage)
```typescript
// ❌ Old synchronous pattern
const userId = localStorage.getItem('fgs_user_id');
localStorage.setItem('fgs_user_id', 'abc123');
localStorage.removeItem('fgs_user_id');
```

### After (Async Capacitor Preferences)
```typescript
import { getStorage, setStorage, removeStorage, STORAGE_KEYS } from '../../utils/storage';

// ✅ New async pattern
const userId = await getStorage(STORAGE_KEYS.USER_ID);
await setStorage(STORAGE_KEYS.USER_ID, 'abc123');
await removeStorage(STORAGE_KEYS.USER_ID);
```

---

## 🔑 Available Storage Functions

### Single Operations
- `getStorage(key: string): Promise<string | null>`
- `setStorage(key: string, value: string): Promise<void>`
- `removeStorage(key: string): Promise<void>`
- `clearStorage(): Promise<void>`

### Batch Operations (More Efficient)
```typescript
// Get multiple values in parallel
const data = await getMultiple(['fgs_user_id', 'user_role', 'fgs_family_id']);
// Returns: { 'fgs_user_id': '...', 'user_role': 'parent', ... }

// Set multiple values in parallel
await setMultiple({
  'fgs_user_id': 'abc123',
  'user_role': 'parent',
  'fgs_family_id': 'family456'
});

// Remove multiple values in parallel
await removeMultiple(['fgs_user_id', 'user_role', 'fgs_family_id']);
```

### Storage Keys Constants
```typescript
import { STORAGE_KEYS } from '../../utils/storage';

// Use constants instead of strings for type safety
STORAGE_KEYS.USER_ID          // 'fgs_user_id'
STORAGE_KEYS.USER_ROLE         // 'user_role'
STORAGE_KEYS.USER_MODE         // 'fgs_user_mode'
STORAGE_KEYS.USER_NAME         // 'fgs_user_name'
STORAGE_KEYS.USER_EMAIL        // 'user_email'
STORAGE_KEYS.FAMILY_ID         // 'fgs_family_id'
STORAGE_KEYS.ACCESS_TOKEN      // 'fgs_access_token'
STORAGE_KEYS.KID_SESSION_TOKEN // 'kid_session_token'
STORAGE_KEYS.CHILD_ID          // 'child_id'
```

---

## 🎯 Common Migration Patterns

### Pattern 1: React State Initialization
```typescript
// ❌ Before: Synchronous initialization
const [userId, setUserId] = useState(() => {
  return localStorage.getItem('fgs_user_id');
});

// ✅ After: Async loading in useEffect
const [userId, setUserId] = useState<string | null>(null);

useEffect(() => {
  const loadUserId = async () => {
    const stored = await getStorage(STORAGE_KEYS.USER_ID);
    setUserId(stored);
  };
  loadUserId();
}, []);
```

### Pattern 2: useEffect with localStorage
```typescript
// ❌ Before
useEffect(() => {
  const role = localStorage.getItem('user_role');
  if (role === 'parent') {
    // do something
  }
}, []);

// ✅ After
useEffect(() => {
  const checkRole = async () => {
    const role = await getStorage(STORAGE_KEYS.USER_ROLE);
    if (role === 'parent') {
      // do something
    }
  };
  checkRole();
}, []);
```

### Pattern 3: Event Handlers
```typescript
// ❌ Before
const handleSave = () => {
  localStorage.setItem('fgs_family_id', familyId);
  navigate('/dashboard');
};

// ✅ After
const handleSave = async () => {
  await setStorage(STORAGE_KEYS.FAMILY_ID, familyId);
  navigate('/dashboard');
};
```

### Pattern 4: Conditional Checks
```typescript
// ❌ Before
const userRole = localStorage.getItem('user_role');
if (userRole === 'child') {
  // do something
}

// ✅ After
const userRole = await getStorage(STORAGE_KEYS.USER_ROLE);
if (userRole === 'child') {
  // do something
}
```

---

## 🚨 Critical Reminders

1. **Always use `await`** - Storage operations are async, forgetting `await` will cause bugs
2. **Mark functions as `async`** - Any function using storage must be `async`
3. **Use constants** - Import `STORAGE_KEYS` instead of hardcoded strings
4. **Batch operations** - Use `getMultiple`/`setMultiple` for better performance
5. **Error handling** - Wrap storage calls in try/catch for production code

---

## 📱 How It Works on iOS vs Web

### On Web (Browser)
- Falls back to `localStorage` automatically
- Synchronous under the hood, but wrapped in async API for consistency
- Works in development (`npm run dev`)

### On iOS (Native)
- Uses Capacitor Preferences (native iOS UserDefaults)
- Truly async operations
- Data persists even after app closes
- More reliable than WebView localStorage

### Detection
The system automatically detects the platform:
```typescript
import { Capacitor } from '@capacitor/core';
const isNative = Capacitor.isNativePlatform(); // true on iOS, false on web
```

---

## 🧪 Testing the Migration

### 1. Test on Web
```bash
npm run dev
# Should work exactly as before
```

### 2. Build and Test on iOS
```bash
# Build parent app
npm run build:parent

# Sync to iOS
npm run sync:parent

# Open in Xcode
npm run open:parent

# Run on device and test:
# - Login/logout
# - Session persistence (close app, reopen)
# - Parent/kid mode switching
```

### 3. Check Logs
Look for these log prefixes:
- `📱 [Native Storage]` - iOS native storage operations
- `🌐 [Web Storage]` - Browser localStorage operations

---

## 🔧 Next Steps

1. **Phase 1 (DONE)** ✅
   - Create storage wrapper
   - Migrate auth.ts
   - Migrate authHelpers.ts
   - Migrate AuthContext.tsx

2. **Phase 2 (TODO)**
   - Migrate FamilyContext.tsx
   - Migrate login/signup components
   - Migrate route guards

3. **Phase 3 (TODO)**
   - Migrate remaining UI components
   - Test thoroughly on iOS device
   - Update any API clients that use tokens

4. **Phase 4 (Optional)**
   - Add storage encryption for sensitive data
   - Implement storage migrations for schema changes
   - Add storage telemetry

---

## 📚 Resources

- [Capacitor Preferences Docs](https://capacitorjs.com/docs/apis/preferences)
- [iOS UserDefaults](https://developer.apple.com/documentation/foundation/userdefaults)
- [React Async Patterns](https://react.dev/reference/react/useEffect)

---

## 🆘 Troubleshooting

### Issue: "Auth session not persisting on iOS"
**Solution**: Check that all auth-related localStorage calls have been migrated to async storage

### Issue: "Race condition when loading initial state"
**Solution**: Use `hasInitialized` ref pattern (see AuthContext.tsx)

### Issue: "Can't use localStorage in production iOS build"
**Solution**: This is expected - localStorage is unreliable in iOS WebViews. Use Capacitor Preferences.

### Issue: "How to debug storage on iOS?"
**Solution**: Check Xcode console for `📱 [Native Storage]` logs

---

**Last Updated**: Today
**Migration Status**: 60% Complete (Core auth done, contexts/components remain)
