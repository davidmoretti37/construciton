# App Store Submission Checklist

Use this checklist to ensure everything is ready before submitting to the App Store.

---

## Prerequisites

### Apple Developer Account
- [ ] Enrolled in Apple Developer Program ($99/year)
- [ ] Account approved and active
- [ ] Agreements signed in App Store Connect

### EAS / Expo Setup
- [ ] Logged into EAS CLI (`eas login`)
- [ ] EAS project linked (`eas init` or project ID in app.json)

---

## App Configuration

### app.json
- [x] App name set: "Construction Manager"
- [x] Slug corrected: "constructionapp" (was "consrcutionapp")
- [x] Version set: "1.0.0"
- [x] Bundle identifier set: "com.davidmoretti.constructionmanager"
- [x] iOS buildNumber added: "1"
- [x] usesNonExemptEncryption set: false
- [ ] Privacy policy URL updated (currently placeholder)
- [ ] Terms of service URL updated (currently placeholder)

### eas.json
- [ ] Apple ID configured
- [ ] App Store Connect App ID configured
- [ ] Apple Team ID configured
- [ ] Production backend URL set

---

## Assets

### Icons
- [x] App icon (1024x1024): `assets/icon.png`
- [x] Adaptive icon (1024x1024): `assets/adaptive-icon.png`
- [x] Notification icon: `assets/notification-icon.png`

### Splash Screen
- [x] Splash image: `assets/splash-icon.png`
- [x] Background color configured: #ffffff

### App Store Assets
- [ ] Screenshots captured (see SCREENSHOT_REQUIREMENTS.md)
  - [ ] iPhone 6.7" (3-10 screenshots)
  - [ ] iPhone 6.5" (3-10 screenshots)
  - [ ] iPad 12.9" (3-10 screenshots)
  - [ ] iPad 11" (3-10 screenshots)
- [ ] App preview video (optional)

---

## Legal Documents

### Privacy Policy
- [x] Privacy policy document created: `docs/PRIVACY_POLICY.md`
- [ ] Privacy policy hosted at public URL
- [ ] URL added to app.json
- [ ] URL added to App Store Connect

### Terms of Service
- [x] Terms of service document created: `docs/TERMS_OF_SERVICE.md`
- [ ] Terms hosted at public URL
- [ ] URL added to app.json

---

## App Store Connect Setup

### App Information
- [ ] App record created in App Store Connect
- [ ] App name reserved
- [ ] Primary language set (English)
- [ ] Bundle ID registered

### App Details
- [ ] Subtitle entered (30 chars max)
- [ ] Promotional text entered (170 chars max)
- [ ] Description entered (4000 chars max)
- [ ] Keywords entered (100 chars max)
- [ ] Support URL entered
- [ ] Marketing URL entered (optional)

### Categories & Rating
- [ ] Primary category selected: Business
- [ ] Secondary category selected: Productivity
- [ ] Age rating questionnaire completed

### Pricing & Availability
- [ ] Price set (Free)
- [ ] Availability configured (all territories or specific)
- [ ] Pre-order configured (if applicable)

### In-App Purchases
- [ ] Subscription products created in App Store Connect
  - [ ] Starter Plan ($49/month)
  - [ ] Pro Plan ($79/month)
  - [ ] Business Plan ($149/month)
- [ ] Subscription group configured
- [ ] Pricing localization set

### App Review
- [ ] Demo account credentials provided
- [ ] Review notes written
- [ ] Contact information complete

---

## Build & Submit

### Pre-Build Testing
- [ ] App runs without errors in development
- [ ] All features tested on physical device
- [ ] Subscription flow tested (Stripe sandbox)
- [ ] Push notifications tested
- [ ] Location permissions work correctly
- [ ] Camera and photo library work
- [ ] Voice input works
- [ ] All supported languages tested (en, es, pt-BR)

### Build Commands
```bash
# Login to EAS
eas login

# Build for production
eas build --platform ios --profile production

# Wait for build to complete...

# Submit to App Store
eas submit --platform ios --profile production
```

### Post-Submit
- [ ] Build uploaded successfully
- [ ] App appears in App Store Connect
- [ ] All metadata reviewed and accurate
- [ ] Screenshots display correctly
- [ ] Submit for review

---

## App Review Preparation

### Common Rejection Reasons to Avoid
- [ ] App functions as described
- [ ] No crashes or major bugs
- [ ] Login/authentication works
- [ ] In-app purchases work correctly
- [ ] Privacy policy is accessible
- [ ] All permissions have clear usage descriptions
- [ ] Demo account allows full app testing
- [ ] No placeholder content visible

### Review Timeline
- Initial review: 1-3 business days (typically)
- If rejected: Address issues and resubmit
- Expedited review: Available for critical bug fixes

---

## Post-Approval

### Launch Day
- [ ] Verify app appears in App Store
- [ ] Test download and installation
- [ ] Verify in-app purchases work
- [ ] Monitor crash reports
- [ ] Respond to initial reviews

### Ongoing
- [ ] Monitor App Store Connect analytics
- [ ] Respond to user reviews
- [ ] Plan updates and improvements
- [ ] Keep dependencies updated

---

## Quick Reference

### Important URLs
- Apple Developer: https://developer.apple.com
- App Store Connect: https://appstoreconnect.apple.com
- EAS Documentation: https://docs.expo.dev/eas/

### Helpful Commands
```bash
# Check EAS CLI version
eas --version

# View build status
eas build:list

# View submission status
eas submit:list

# Update credentials
eas credentials
```

### Support Contacts
- Apple Developer Support: https://developer.apple.com/contact/
- Expo/EAS Support: https://expo.dev/support

---

*Last updated: January 27, 2025*
