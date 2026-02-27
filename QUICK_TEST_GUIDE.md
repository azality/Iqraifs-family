# 🧪 Quick Test Guide - Day 4

**Test the complete authentication + middleware stack**

---

## ✅ Pre-Test Checklist

1. Clear your browser's localStorage
2. Open DevTools (F12)
3. Go to Console + Network tabs
4. Refresh the app

---

## Test 1: Signup Flow (2 min)

### **Steps**:
1. You should see the signup screen
2. Fill in:
   - **Name**: Ahmed Ali
   - **Email**: ahmed@test.com
   - **Password**: password123
3. Click **"Create Account"**

### **Expected Results**:
- ✅ Toast: "Account created successfully!"
- ✅ Auto-advances to "Create Family" screen
- ✅ In DevTools → Application → Local Storage:
  - `fgs_access_token` = eyJhbGc...
  - `fgs_user_id` = (UUID)
- ✅ Network tab shows POST to `/auth/signup` → 200 OK

### **If it fails**:
- Check Console for errors
- Verify `/auth/signup` endpoint returned user data
- Check if Supabase credentials are set

---

## Test 2: Create Family (1 min)

### **Steps**:
1. Enter **Family Name**: The Ahmed Family
2. Click **"Create Family"**

### **Expected Results**:
- ✅ Toast: "Family created successfully!"
- ✅ Auto-advances to "Add Children" screen
- ✅ Network tab shows:
  - POST `/families` with `Authorization: Bearer eyJ...`
  - Response: 200 OK with family object
- ✅ In Local Storage:
  - `fgs_family_id` = family:123456...

### **If it fails**:
- Check if JWT is in Authorization header
- Check backend logs for errors
- Verify user ID exists in KV store

---

## Test 3: Add Children (1 min)

### **Steps**:
1. Enter **Child Name**: Yusuf
2. Click **"Add"**
3. Repeat for: Aisha, Omar

### **Expected Results**:
- ✅ Toast: "Yusuf added to family!"
- ✅ Child appears in green pills below input
- ✅ Network tab shows POST `/children` → 200 OK
- ✅ Can add multiple children

### **If it fails**:
- Check if familyId is being sent
- Verify child creation endpoint works

---

## Test 4: Complete Setup (30 sec)

### **Steps**:
1. Click **"Complete Setup"**

### **Expected Results**:
- ✅ Toast: "Setup complete! Welcome to Family Growth System 🎉"
- ✅ Redirects to main dashboard
- ✅ Can see children in left sidebar

### **If it fails**:
- Check if FamilyContext is loading children
- Verify GET `/families/:id/children` works

---

## Test 5: Authorization Check (1 min)

### **Steps**:
1. Open DevTools → Application → Local Storage
2. Find `fgs_access_token`
3. Delete it
4. Try to refresh the page

### **Expected Results**:
- ✅ Error: "Unauthorized" or similar
- ✅ Redirected back to signup screen
- ✅ Network shows 401 Unauthorized responses

### **If it fails**:
- Middleware might not be applied
- Check if API is sending tokens

---

## Test 6: Validation Check (1 min)

### **Steps**:
1. Logout or clear localStorage
2. Go to signup screen
3. Try invalid data:
   - Email: "notanemail"
   - Password: "123"
4. Click signup

### **Expected Results**:
- ✅ Error toast or validation message
- ✅ Network shows 400 Bad Request
- ✅ Response includes validation details

### **If it fails**:
- Validation middleware not applied
- Check validateSignup is working

---

## Test 7: Login Flow (1 min)

### **Steps**:
1. On signup screen, click **"Already have an account? Sign in"**
2. Enter:
   - **Email**: ahmed@test.com
   - **Password**: password123
3. Click **"Sign In"**

### **Expected Results**:
- ✅ Toast: "Logged in successfully!"
- ✅ JWT stored in localStorage
- ✅ Advances to family screen
- ✅ If family exists, loads it automatically

---

## 🎯 Success Criteria

All 7 tests pass → **Backend + Auth is production-ready! 🎉**

Any test fails → Check the specific failure section for debugging

---

## 🐛 Common Issues

### **Issue**: "Unauthorized" error on all requests
**Fix**: 
1. Check if JWT is stored: `localStorage.getItem('fgs_access_token')`
2. Verify JWT is sent: Check Network → Headers → Authorization
3. Re-login if token expired

### **Issue**: "Validation Failed" on signup
**Fix**:
1. Check password is 8+ characters
2. Check email is valid format
3. Check name is 2+ characters

### **Issue**: Can't create family
**Fix**:
1. Verify user ID exists in localStorage
2. Check if JWT is valid
3. Check backend logs for errors

### **Issue**: Children not loading
**Fix**:
1. Verify familyId is correct
2. Check GET `/families/:id/children` endpoint
3. Verify Authorization header is sent

---

## 📊 Network Request Checklist

Every authenticated request should have:
- ✅ `Authorization: Bearer eyJhbGci...`
- ✅ `Content-Type: application/json`
- ✅ Valid JSON body (for POST/PATCH)

---

## 🔍 Debug Checklist

If anything fails:
1. [ ] Check Console for JavaScript errors
2. [ ] Check Network tab for failed requests
3. [ ] Check request headers include Authorization
4. [ ] Check localStorage has `fgs_access_token`
5. [ ] Check backend logs (if accessible)
6. [ ] Verify middleware is applied to route
7. [ ] Check validation rules match data

---

**Time to Complete All Tests**: ~7 minutes  
**Expected Success Rate**: 100% if setup correct  

**Ready to ship!** 🚀
