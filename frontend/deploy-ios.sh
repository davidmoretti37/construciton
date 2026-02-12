#!/bin/bash

# Deploy iOS to TestFlight
# Run with: bash deploy-ios.sh

set -e # Exit on error

echo "🚀 Starting iOS TestFlight Deployment"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "app.json" ]; then
    echo "❌ Error: app.json not found. Please run this from the frontend directory."
    exit 1
fi

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "📦 Installing EAS CLI..."
    npm install -g eas-cli
fi

# Login to EAS (if not already logged in)
echo ""
echo "🔐 Checking EAS authentication..."
eas whoami || eas login

# Build for iOS production
echo ""
echo "🏗️  Building iOS app for production..."
echo "This will take 10-15 minutes..."
eas build --platform ios --profile production --non-interactive

# The build will automatically increment build number
# After build completes, submit to TestFlight
echo ""
echo "📱 Submitting to TestFlight..."
eas submit --platform ios --latest --profile production

echo ""
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "📋 Next Steps:"
echo "1. Go to App Store Connect: https://appstoreconnect.apple.com"
echo "2. Navigate to: TestFlight > iOS > Internal Testing"
echo "3. The new build (12) will appear in 5-10 minutes"
echo "4. Add your partner as an internal tester if not already added"
echo "5. They'll receive an email to install the build"
echo ""
echo "🔗 Direct link: https://appstoreconnect.apple.com/apps/6758401232/testflight/ios"
