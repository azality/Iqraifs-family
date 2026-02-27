#!/usr/bin/env pwsh
# iOS Migration Verification Script
# Run this to verify your iOS setup is ready for testing

Write-Host "🔍 FGS iOS Migration Verification" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Storage wrapper exists
Write-Host "✓ Checking storage wrapper..." -NoNewline
if (Test-Path "src/utils/storage.ts") {
    Write-Host " ✅ Found" -ForegroundColor Green
} else {
    Write-Host " ❌ Missing!" -ForegroundColor Red
    exit 1
}

# Check 2: Auth files migrated
Write-Host "✓ Checking auth migrations..." -NoNewline
$authFiles = @(
    "src/utils/auth.ts",
    "src/app/utils/authHelpers.ts",
    "src/app/contexts/AuthContext.tsx"
)
$allExist = $true
foreach ($file in $authFiles) {
    if (-not (Test-Path $file)) {
        $allExist = $false
        break
    }
}
if ($allExist) {
    Write-Host " ✅ All migrated" -ForegroundColor Green
} else {
    Write-Host " ❌ Some files missing!" -ForegroundColor Red
    exit 1
}

# Check 3: iOS projects exist
Write-Host "✓ Checking iOS projects..." -NoNewline
if ((Test-Path "ios-parent/App") -and (Test-Path "ios-kids/App")) {
    Write-Host " ✅ Both apps found" -ForegroundColor Green
} else {
    Write-Host " ❌ iOS projects missing!" -ForegroundColor Red
    Write-Host "   Run: npm run add:ios" -ForegroundColor Yellow
    exit 1
}

# Check 4: Web builds synced
Write-Host "✓ Checking synced builds..." -NoNewline
$parentIndex = "ios-parent/App/public/index.html"
$kidsIndex = "ios-kids/App/public/index.html"
if ((Test-Path $parentIndex) -and (Test-Path $kidsIndex)) {
    Write-Host " ✅ Both synced" -ForegroundColor Green
    
    # Show last sync times
    $parentTime = (Get-Item $parentIndex).LastWriteTime
    $kidsTime = (Get-Item $kidsIndex).LastWriteTime
    Write-Host "   Parent: $($parentTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
    Write-Host "   Kids:   $($kidsTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
} else {
    Write-Host " ❌ Not synced!" -ForegroundColor Red
    Write-Host "   Run: npm run build-all && npm run sync-all" -ForegroundColor Yellow
    exit 1
}

# Check 5: Capacitor config
Write-Host "✓ Checking Capacitor config..." -NoNewline
if (Test-Path "capacitor.config.ts") {
    $config = Get-Content "capacitor.config.ts" -Raw
    if ($config -match "iosScheme.*https" -and $config -match "hostname.*localhost") {
        Write-Host " ✅ Secure WebView configured" -ForegroundColor Green
    } else {
        Write-Host " ⚠️ Config may need updates" -ForegroundColor Yellow
    }
} else {
    Write-Host " ❌ Config missing!" -ForegroundColor Red
    exit 1
}

# Check 6: Package.json scripts
Write-Host "✓ Checking npm scripts..." -NoNewline
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$scripts = $packageJson.scripts
if ($scripts."build:parent" -and $scripts."sync:parent" -and $scripts."open:parent") {
    Write-Host " ✅ All scripts present" -ForegroundColor Green
} else {
    Write-Host " ⚠️ Some scripts missing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ Migration Status: READY FOR TESTING" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📱 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open parent app in Xcode:" -ForegroundColor White
Write-Host "   npm run open:parent" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. In Xcode:" -ForegroundColor White
Write-Host "   • Select your development team" -ForegroundColor Gray
Write-Host "   • Connect your iPhone" -ForegroundColor Gray  
Write-Host "   • Click Run (▶️)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test auth flows:" -ForegroundColor White
Write-Host "   • Login as parent" -ForegroundColor Gray
Write-Host "   • Close app completely" -ForegroundColor Gray
Write-Host "   • Reopen app" -ForegroundColor Gray
Write-Host "   • Should still be logged in! ✅" -ForegroundColor Green
Write-Host ""
Write-Host "4. Check Xcode console for logs:" -ForegroundColor White
Write-Host "   Look for: 📱 [Native Storage] messages" -ForegroundColor Gray
Write-Host ""

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   • iOS_AUTH_READY.md - Quick start guide" -ForegroundColor Gray
Write-Host "   • MIGRATION_GUIDE.md - Detailed patterns" -ForegroundColor Gray
Write-Host ""
