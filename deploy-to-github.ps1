# ========================================
# DEPLOY FGS TO GITHUB (PowerShell Script)
# ========================================
# Run this on Windows after downloading the zip file

Write-Host "🚀 Family Growth System - GitHub Deploy Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Configuration - EDIT THESE!
$GITHUB_USERNAME = "yourusername"  # Change to your GitHub username
$REPO_NAME = "fgs-app"             # Change to your desired repo name

# ========================================
# STEP 1: Verify Git is Installed
# ========================================
Write-Host "📋 Step 1: Checking if Git is installed..." -ForegroundColor Yellow

try {
    $gitVersion = git --version
    Write-Host "✅ Git is installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not installed!" -ForegroundColor Red
    Write-Host "Please install Git from: https://git-scm.com/download/win" -ForegroundColor Red
    Write-Host "After installing, restart PowerShell and run this script again." -ForegroundColor Red
    pause
    exit
}

Write-Host ""

# ========================================
# STEP 2: Initialize Git Repository
# ========================================
Write-Host "📋 Step 2: Initializing Git repository..." -ForegroundColor Yellow

if (Test-Path ".git") {
    Write-Host "⚠️  Git repository already exists. Skipping initialization." -ForegroundColor Yellow
} else {
    git init
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
}

Write-Host ""

# ========================================
# STEP 3: Create .gitignore
# ========================================
Write-Host "📋 Step 3: Creating .gitignore file..." -ForegroundColor Yellow

$gitignoreContent = @"
# Dependencies
node_modules/
package-lock.json

# Build outputs
dist/
build/
*.log

# Environment files
.env
.env.local
.env.production

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# iOS
ios-parent/App/Pods/
ios-parent/App/.build/
ios-kids/App/Pods/
ios-kids/App/.build/
*.xcworkspace
*.xcuserstate

# Testing
coverage/
.nyc_output/

# Misc
*.bak
*.tmp
"@

Set-Content -Path ".gitignore" -Value $gitignoreContent
Write-Host "✅ .gitignore created" -ForegroundColor Green

Write-Host ""

# ========================================
# STEP 4: Add All Files
# ========================================
Write-Host "📋 Step 4: Adding all files to Git..." -ForegroundColor Yellow

git add .
Write-Host "✅ All files staged for commit" -ForegroundColor Green

Write-Host ""

# ========================================
# STEP 5: Create Initial Commit
# ========================================
Write-Host "📋 Step 5: Creating initial commit..." -ForegroundColor Yellow

git commit -m "Initial commit - FGS production ready with prayer points system"
Write-Host "✅ Initial commit created" -ForegroundColor Green

Write-Host ""

# ========================================
# STEP 6: Add GitHub Remote
# ========================================
Write-Host "📋 Step 6: Setting up GitHub remote..." -ForegroundColor Yellow

Write-Host ""
Write-Host "⚠️  IMPORTANT: Create a repository on GitHub first!" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to: https://github.com/new" -ForegroundColor Cyan
Write-Host "2. Repository name: $REPO_NAME" -ForegroundColor Cyan
Write-Host "3. Make it PRIVATE (recommended)" -ForegroundColor Cyan
Write-Host "4. Do NOT initialize with README" -ForegroundColor Cyan
Write-Host "5. Click 'Create repository'" -ForegroundColor Cyan
Write-Host ""

$repoCreated = Read-Host "Have you created the repository on GitHub? (yes/no)"

if ($repoCreated -ne "yes") {
    Write-Host "❌ Please create the repository first, then run this script again." -ForegroundColor Red
    pause
    exit
}

# Remove existing remote if it exists
git remote remove origin 2>$null

# Add new remote
$remoteUrl = "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
git remote add origin $remoteUrl
Write-Host "✅ GitHub remote added: $remoteUrl" -ForegroundColor Green

Write-Host ""

# ========================================
# STEP 7: Push to GitHub
# ========================================
Write-Host "📋 Step 7: Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "⚠️  You may be prompted for GitHub username and password/token" -ForegroundColor Yellow
Write-Host ""

try {
    # Try to push
    git push -u origin main
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
} catch {
    # If main branch doesn't exist, try master
    Write-Host "⚠️  'main' branch failed, trying 'master'..." -ForegroundColor Yellow
    git branch -M main
    git push -u origin main
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
}

Write-Host ""

# ========================================
# STEP 8: Verify Netlify Connection
# ========================================
Write-Host "📋 Step 8: Next Steps for Netlify Deployment..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Since you already have GitHub → Netlify connected:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to your Netlify dashboard" -ForegroundColor White
Write-Host "2. Your site should automatically deploy" -ForegroundColor White
Write-Host "3. If not, trigger a manual deploy" -ForegroundColor White
Write-Host ""
Write-Host "Or add a new site:" -ForegroundColor Cyan
Write-Host "1. Go to: https://app.netlify.com/start" -ForegroundColor White
Write-Host "2. Import from GitHub" -ForegroundColor White
Write-Host "3. Select: $GITHUB_USERNAME/$REPO_NAME" -ForegroundColor White
Write-Host "4. Build command: npm run build" -ForegroundColor White
Write-Host "5. Publish directory: dist" -ForegroundColor White
Write-Host ""

# ========================================
# SUCCESS!
# ========================================
Write-Host "🎉 DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
Write-Host "✅ Netlify will auto-deploy (if connected)" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Your GitHub repository:" -ForegroundColor Cyan
Write-Host "   https://github.com/$GITHUB_USERNAME/$REPO_NAME" -ForegroundColor White
Write-Host ""
Write-Host "📱 Next step: Deploy iOS apps on Mac" -ForegroundColor Cyan
Write-Host "   See: iOS_DEPLOYMENT_COMPLETE_GUIDE.md" -ForegroundColor White
Write-Host ""

pause
