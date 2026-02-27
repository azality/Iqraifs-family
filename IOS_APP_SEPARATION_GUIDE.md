# iOS App Separation Strategy
## Two Apps, One Backend - Implementation Guide

**Target:** Launch two separate iOS apps from single codebase  
**Apps:**
1. **Family Growth - Parents** (Command Center)
2. **Family Growth - Kids** (Adventure Mode)

---

## 🎯 STRATEGY COMPARISON

### Option 1: Build-Time Separation (RECOMMENDED ⭐)

**Approach:** Single codebase, different builds for each app

**Pros:**
- ✅ Easy to maintain
- ✅ Shared bug fixes
- ✅ Single repository
- ✅ Type safety across apps
- ✅ Fast iteration

**Cons:**
- ❌ Slightly larger bundle sizes
- ❌ Need build configuration

**Complexity:** 🟢 Low

---

### Option 2: Two Separate React Apps

**Approach:** Fork codebase into two apps

**Pros:**
- ✅ Complete isolation
- ✅ Smaller bundle sizes
- ✅ Independent deployments
- ✅ Clear ownership

**Cons:**
- ❌ Duplicate code maintenance
- ❌ Bug fixes need manual sync
- ❌ Higher maintenance burden
- ❌ Divergence risk

**Complexity:** 🟡 Medium

---

### Option 3: Monorepo with Shared Packages

**Approach:** Turborepo/Nx monorepo structure

**Pros:**
- ✅ Best code organization
- ✅ Shared utilities/types
- ✅ Independent versioning
- ✅ Scalable for future apps

**Cons:**
- ❌ Complex setup
- ❌ Learning curve
- ❌ Overkill for 2 apps

**Complexity:** 🔴 High

---

## 📱 RECOMMENDED: OPTION 1 - BUILD-TIME SEPARATION

### Implementation Plan

#### Step 1: Create App Modes in Vite Config

**File: `/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Determine app type from environment variable
  const appMode = process.env.APP_MODE || 'parent';
  
  console.log(`🔨 Building ${appMode} app...`);
  
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Inject app mode into the app
      'import.meta.env.APP_MODE': JSON.stringify(appMode),
    },
    build: {
      outDir: `dist/${appMode}`,
      rollupOptions: {
        output: {
          // Separate chunks for better caching
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router'],
            ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          },
        },
      },
    },
  };
});
```

---

#### Step 2: Update Package.json Scripts

**File: `/package.json`**

```json
{
  "scripts": {
    "build": "vite build",
    "build:parent": "APP_MODE=parent vite build",
    "build:kids": "APP_MODE=kids vite build",
    "build:all": "npm run build:parent && npm run build:kids",
    "preview:parent": "APP_MODE=parent vite preview",
    "preview:kids": "APP_MODE=kids vite preview"
  }
}
```

**Windows-compatible version:**

```json
{
  "scripts": {
    "build": "vite build",
    "build:parent": "cross-env APP_MODE=parent vite build",
    "build:kids": "cross-env APP_MODE=kids vite build",
    "build:all": "npm run build:parent && npm run build:kids"
  },
  "devDependencies": {
    "cross-env": "^7.0.3"
  }
}
```

---

#### Step 3: Create App-Specific Routes

**File: `/src/app/routes.parent.tsx`**

```typescript
import { createBrowserRouter } from "react-router";

// Import ONLY parent pages
import { Welcome } from "./pages/Welcome";
import { ParentLogin } from "./pages/ParentLogin";
import { ParentSignup } from "./pages/ParentSignup";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { LogBehavior } from "./pages/LogBehavior";
import { Adjustments } from "./pages/Adjustments";
import { Settings } from "./pages/Settings";
import { WeeklyReview } from "./pages/WeeklyReview";
import { AttendanceNew } from "./pages/AttendanceNew";
import { Rewards } from "./pages/Rewards";
import { AuditTrail } from "./pages/AuditTrail";
import { ParentWishlistReview } from "./pages/ParentWishlistReview";
import { PendingRedemptionRequests } from "./pages/PendingRedemptionRequests";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
import { RootLayout } from "./layouts/RootLayout";

export const parentRouter = createBrowserRouter([
  // Public routes
  { path: "/", element: <Welcome /> },
  { path: "/login", element: <ParentLogin /> },
  { path: "/signup", element: <ParentSignup /> },
  
  // Protected parent routes
  {
    path: "/app",
    element: <ProtectedRoute><ProvidersLayout /></ProtectedRoute>,
    children: [
      {
        element: <RootLayout />,
        children: [
          { path: "onboarding", element: <Onboarding /> },
          { path: "dashboard", element: <Dashboard /> },
          { path: "log", element: <LogBehavior /> },
          { path: "adjustments", element: <Adjustments /> },
          { path: "attendance", element: <AttendanceNew /> },
          { path: "rewards", element: <Rewards /> },
          { path: "review", element: <WeeklyReview /> },
          { path: "audit", element: <AuditTrail /> },
          { path: "settings", element: <Settings /> },
          { path: "wishlist", element: <ParentWishlistReview /> },
          { path: "redemptions", element: <PendingRedemptionRequests /> },
        ],
      },
    ],
  },
]);
```

**File: `/src/app/routes.kids.tsx`**

```typescript
import { createBrowserRouter } from "react-router";

// Import ONLY kid pages
import { KidLoginNew } from "./pages/KidLoginNew";
import { KidDashboard } from "./pages/KidDashboard";
import { Challenges } from "./pages/Challenges";
import { KidWishlist } from "./pages/KidWishlist";
import { TitlesBadgesPage } from "./pages/TitlesBadgesPage";
import { SadqaPage } from "./pages/SadqaPage";
import { ProvidersLayout } from "./layouts/ProvidersLayout";

// Simpler kid-only auth guard
function RequireKidAuth({ children }: { children: JSX.Element }) {
  const kidToken = localStorage.getItem('kid_access_token');
  
  if (!kidToken) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

export const kidsRouter = createBrowserRouter([
  // Public routes
  { path: "/", element: <Navigate to="/login" /> },
  { path: "/login", element: <KidLoginNew /> },
  
  // Protected kid routes
  {
    path: "/app",
    element: <RequireKidAuth><ProvidersLayout /></RequireKidAuth>,
    children: [
      { path: "home", element: <KidDashboard /> },
      { path: "challenges", element: <Challenges /> },
      { path: "wishlist", element: <KidWishlist /> },
      { path: "titles", element: <TitlesBadgesPage /> },
      { path: "sadqa", element: <SadqaPage /> },
    ],
  },
]);
```

---

#### Step 4: Update App.tsx to Use Conditional Router

**File: `/src/app/App.tsx`**

```typescript
import { RouterProvider } from 'react-router';
import { parentRouter } from './routes.parent';
import { kidsRouter } from './routes.kids';
import { Toaster } from './components/ui/sonner';

// Determine which router to use based on build mode
const APP_MODE = import.meta.env.APP_MODE as 'parent' | 'kids';

console.log(`🚀 App starting in ${APP_MODE} mode`);

const router = APP_MODE === 'kids' ? kidsRouter : parentRouter;

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>
  );
}
```

---

#### Step 5: Create App-Specific Assets

**Parent App:**

```
/public/
  parent/
    icon.png        (512x512 - Professional icon)
    splash.png      (Parent-themed splash screen)
    manifest.json   (Parent app metadata)
```

**Kids App:**

```
/public/
  kids/
    icon.png        (512x512 - Fun, colorful icon)
    splash.png      (Adventure-themed splash screen)
    manifest.json   (Kids app metadata)
```

**File: `/public/parent/manifest.json`**

```json
{
  "name": "Family Growth - Parents",
  "short_name": "FGS Parents",
  "description": "Manage your family's growth and development",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e40af",
  "theme_color": "#1e40af",
  "icons": [
    {
      "src": "/parent/icon.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**File: `/public/kids/manifest.json`**

```json
{
  "name": "Family Growth - Kids",
  "short_name": "FGS Kids",
  "description": "Your adventure awaits! Complete quests and earn rewards",
  "start_url": "/login",
  "display": "standalone",
  "background_color": "#f59e0b",
  "theme_color": "#f59e0b",
  "icons": [
    {
      "src": "/kids/icon.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

#### Step 6: Update index.html for Each Build

**File: `/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- Dynamically set based on APP_MODE -->
    <% if (process.env.APP_MODE === 'kids') { %>
      <title>Family Growth - Kids</title>
      <link rel="manifest" href="/kids/manifest.json" />
      <link rel="icon" href="/kids/icon.png" />
    <% } else { %>
      <title>Family Growth - Parents</title>
      <link rel="manifest" href="/parent/manifest.json" />
      <link rel="icon" href="/parent/icon.png" />
    <% } %>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Alternative with vite-plugin-html:**

```typescript
// vite.config.ts
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig(({ mode }) => {
  const appMode = process.env.APP_MODE || 'parent';
  
  return {
    plugins: [
      react(),
      tailwindcss(),
      createHtmlPlugin({
        inject: {
          data: {
            title: appMode === 'kids' 
              ? 'Family Growth - Kids' 
              : 'Family Growth - Parents',
            manifest: `/${appMode}/manifest.json`,
            icon: `/${appMode}/icon.png`,
          },
        },
      }),
    ],
  };
});
```

---

#### Step 7: Configure Netlify Deployment

**File: `/netlify.toml`**

```toml
# Parent App (Primary Site)
[build]
  command = "npm run build:parent"
  publish = "dist/parent"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Kids App (Branch Deploy or Separate Site)
[context.kids]
  command = "npm run build:kids"
  publish = "dist/kids"

[[context.kids.redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Deployment Strategy:**

**Option A: Two Netlify Sites**
1. Create two sites on Netlify:
   - `fgs-parent.netlify.app` (or custom domain: `parent.familygrowth.app`)
   - `fgs-kids.netlify.app` (or custom domain: `kids.familygrowth.app`)

2. Configure each:
   - Parent site: Build command = `npm run build:parent`
   - Kids site: Build command = `npm run build:kids`

**Option B: Branch Deploys (Same Site)**
1. Main branch → Parent app
2. Create `kids` branch → Kids app (configure context in netlify.toml)

---

## 📦 BUNDLE OPTIMIZATION

### Tree Shaking for App-Specific Code

**File: `/src/app/utils/appMode.ts`**

```typescript
export const APP_MODE = import.meta.env.APP_MODE as 'parent' | 'kids';

export const isParentApp = () => APP_MODE === 'parent';
export const isKidsApp = () => APP_MODE === 'kids';

// Use this for conditional imports
export function conditionalImport<T>(
  parentModule: () => Promise<T>,
  kidsModule: () => Promise<T>
): Promise<T> {
  return isParentApp() ? parentModule() : kidsModule();
}
```

**Usage:**

```typescript
// Only import parent components in parent build
if (isParentApp()) {
  const { ParentDashboard } = await import('./pages/ParentDashboard');
  // Use ParentDashboard
}

// Only import kid components in kids build
if (isKidsApp()) {
  const { KidDashboard } = await import('./pages/KidDashboard');
  // Use KidDashboard
}
```

---

## 🎨 APP-SPECIFIC THEMING

### Conditional Theme Loading

**File: `/src/styles/theme.parent.css`**

```css
:root {
  --primary: #1e40af; /* Blue 700 */
  --primary-foreground: #ffffff;
  --secondary: #64748b; /* Slate 500 */
  --accent: #3b82f6; /* Blue 500 */
  
  /* Professional, clean theme */
  --radius: 0.5rem;
}
```

**File: `/src/styles/theme.kids.css`**

```css
:root {
  --primary: #f59e0b; /* Amber 500 */
  --primary-foreground: #ffffff;
  --secondary: #10b981; /* Emerald 500 */
  --accent: #8b5cf6; /* Violet 500 */
  
  /* Playful, rounded theme */
  --radius: 1rem;
}
```

**File: `/src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/index.css';

// Conditionally load theme
const APP_MODE = import.meta.env.APP_MODE as 'parent' | 'kids';

if (APP_MODE === 'kids') {
  import('./styles/theme.kids.css');
} else {
  import('./styles/theme.parent.css');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 🧪 TESTING BOTH APPS

### Local Development

**Terminal 1 (Parent App):**
```bash
APP_MODE=parent npm run dev
# Opens on http://localhost:5173
```

**Terminal 2 (Kids App):**
```bash
APP_MODE=kids vite dev --port 5174
# Opens on http://localhost:5174
```

### Build Testing

```bash
# Build both apps
npm run build:all

# Preview parent app
npm run preview:parent
# Visit http://localhost:4173

# Preview kids app (in new terminal)
APP_MODE=kids vite preview --port 4174
# Visit http://localhost:4174
```

### Automated Testing Script

**File: `/scripts/test-both-apps.sh`**

```bash
#!/bin/bash

echo "🧪 Testing Parent App Build..."
APP_MODE=parent npm run build
if [ $? -ne 0 ]; then
  echo "❌ Parent app build failed!"
  exit 1
fi
echo "✅ Parent app build successful"

echo ""
echo "🧪 Testing Kids App Build..."
APP_MODE=kids npm run build
if [ $? -ne 0 ]; then
  echo "❌ Kids app build failed!"
  exit 1
fi
echo "✅ Kids app build successful"

echo ""
echo "✅ Both apps built successfully!"
echo ""
echo "📊 Build Sizes:"
du -sh dist/parent
du -sh dist/kids
```

Make executable:
```bash
chmod +x scripts/test-both-apps.sh
./scripts/test-both-apps.sh
```

---

## 📱 iOS-SPECIFIC CONSIDERATIONS

### Capacitor Configuration (for Native iOS Apps)

**File: `/capacitor.config.parent.json`**

```json
{
  "appId": "com.familygrowth.parent",
  "appName": "Family Growth - Parents",
  "webDir": "dist/parent",
  "bundledWebRuntime": false,
  "ios": {
    "contentInset": "automatic"
  }
}
```

**File: `/capacitor.config.kids.json`**

```json
{
  "appId": "com.familygrowth.kids",
  "appName": "Family Growth - Kids",
  "webDir": "dist/kids",
  "bundledWebRuntime": false,
  "ios": {
    "contentInset": "automatic"
  }
}
```

### Build Commands for iOS

```bash
# Build parent app
APP_MODE=parent npm run build
npx cap sync ios --config capacitor.config.parent.json

# Build kids app
APP_MODE=kids npm run build
npx cap sync ios --config capacitor.config.kids.json
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] Run `npm run build:all` successfully
- [ ] Test parent app at `/dist/parent/index.html`
- [ ] Test kids app at `/dist/kids/index.html`
- [ ] Verify correct app icons loading
- [ ] Verify correct app titles
- [ ] Verify no cross-contamination (parent code in kids app)

### Netlify Setup

**Parent App:**
- [ ] Create new Netlify site
- [ ] Set build command: `npm run build:parent`
- [ ] Set publish directory: `dist/parent`
- [ ] Configure environment variables (Supabase keys)
- [ ] Set up custom domain (optional)
- [ ] Enable HTTPS

**Kids App:**
- [ ] Create new Netlify site
- [ ] Set build command: `npm run build:kids`
- [ ] Set publish directory: `dist/kids`
- [ ] Configure environment variables (same Supabase backend)
- [ ] Set up custom domain (optional)
- [ ] Enable HTTPS

### Post-Deployment

- [ ] Test parent app login flow
- [ ] Test kids app login flow
- [ ] Verify both apps connect to same Supabase backend
- [ ] Verify family data syncs across apps
- [ ] Test on real iOS device (Safari)
- [ ] Check PWA installation (Add to Home Screen)

---

## 🔄 ONGOING MAINTENANCE

### Making Changes

**Shared Code Changes (Contexts, API, Utils):**
1. Make change in shared files
2. Test in both apps locally
3. Build both apps: `npm run build:all`
4. Deploy both apps

**Parent-Only Changes:**
1. Make change in parent-specific files
2. Build parent app: `npm run build:parent`
3. Deploy parent app only

**Kids-Only Changes:**
1. Make change in kids-specific files
2. Build kids app: `npm run build:kids`
3. Deploy kids app only

### CI/CD Pipeline (GitHub Actions Example)

**File: `.github/workflows/deploy.yml`**

```yaml
name: Deploy Apps

on:
  push:
    branches: [main]

jobs:
  build-parent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build:parent
      - uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist/parent
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_PARENT_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}

  build-kids:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build:kids
      - uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist/kids
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_KIDS_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
```

---

## 💡 SUMMARY

**Recommended Approach:** Build-Time Separation (Option 1)

**Implementation Steps:**
1. ✅ Update `vite.config.ts` with APP_MODE detection
2. ✅ Update `package.json` scripts
3. ✅ Create `routes.parent.tsx` and `routes.kids.tsx`
4. ✅ Update `App.tsx` to use conditional router
5. ✅ Create app-specific assets (icons, manifests)
6. ✅ Configure Netlify deployment
7. ✅ Test both builds locally
8. ✅ Deploy to separate Netlify sites

**Time Estimate:** 4-6 hours  
**Difficulty:** 🟢 Low-Medium  
**Maintenance Overhead:** 🟢 Low

**Result:** Two production-ready iOS apps sharing the same backend! 🎉

