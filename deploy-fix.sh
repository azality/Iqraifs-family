#!/bin/bash

# Quick deployment script for 401 error fix
# Run this from project root

echo "🚀 Deploying fix for 401 authorization error..."
echo ""
echo "📝 What's being deployed:"
echo "   - New public endpoint: /public/families/:id/children"
echo "   - No auth required, explicit public path"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Navigate to functions directory
echo "📂 Navigating to supabase functions..."
cd supabase/functions || exit 1

# Deploy the server function
echo "📤 Deploying server function..."
supabase functions deploy server

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🧪 Test the fix:"
    echo "1. Navigate to /kid-login in your app"
    echo "2. Should see children's profile pictures"
    echo "3. No 401 errors in console"
    echo ""
    echo "📄 Full testing guide: See /FIX_401_FINAL.md"
    echo ""
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Check the error message above and try again."
    exit 1
fi
