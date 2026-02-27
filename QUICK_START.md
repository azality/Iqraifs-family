# ⚡ Quick Start - Fix Login Issues

**Choose your path:**

---

## 🔴 URGENT: Fix Both Auth Errors (5 minutes)

**Problem 1:** Parent login fails with "Invalid JWT" error  
**Problem 2:** Kid login shows "Failed to load children" error

**Fix (ONE deployment fixes both):**
```bash
# Deploy the backend fix
cd supabase/functions
supabase functions deploy server

# Test it works
# 1. Parent login at /login - should work!
# 2. Kid login at /kid-login - should load children!
```

**That's it!** Both login flows will work.

📄 **Details:** 
- JWT fix: `/FIX_JWT_ERROR.md`
- 401 fix: `/FIX_401_FINAL.md`

---

## 🔄 COMPLETE: Implement Auth Refactor (2-3 hours)

**Problem:** Parent logout → Kid login breaks (session collision)

**Solution:** New auth system with clean parent/kid separation

**Quick Implementation:**
```bash
# 1. Activate new files (2 min)
mv src/app/routes-new.tsx src/app/routes.tsx
mv src/utils/api-new.ts src/utils/api.ts

# 2. Test flows (see checklist)
# - Parent login → logout → Kid login (should work!)
# - Kid login → logout → Parent login (should work!)

# 3. Deploy when tests pass
npm run build
# Deploy to your hosting
```

📋 **Complete Testing Guide:** `/IMPLEMENTATION_CHECKLIST.md`  
📚 **Full Documentation:** `/AUTH_REFACTOR_GUIDE.md`

---

## 🎯 What Gets Fixed

### 401 Fix ✅
- Kid login loads children
- No authorization errors

### Auth Refactor ✅
- Parent/kid sessions don't collide
- Clean mode separation
- Smart token management
- Better UX with mode selection

---

## 📞 Need Help?

1. **Quick overview:** `/CURRENT_STATUS.md`
2. **Auth cheat sheet:** `/AUTH_QUICK_REFERENCE.md`
3. **Step-by-step:** `/IMPLEMENTATION_CHECKLIST.md`
4. **Deep dive:** `/AUTH_REFACTOR_GUIDE.md`

---

**Recommendation:** Do 401 fix first (quick), then auth refactor (thorough)