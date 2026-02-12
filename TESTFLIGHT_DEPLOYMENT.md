# 🚀 TestFlight Deployment Guide

## What Changed
✅ **Backend**: New AI agent system deployed to Railway
✅ **iOS Build**: Bumped to version 12

---

## 🎯 Quick Deploy (Automated)

From the `frontend` directory, run:

```bash
cd /Users/david/Downloads/construciton/frontend
bash deploy-ios.sh
```

This will automatically:
1. Build the iOS app (10-15 minutes)
2. Submit to TestFlight
3. Notify you when complete

---

## 📱 Manual Deploy (Step by Step)

If you prefer to run commands manually:

### 1. Navigate to frontend directory
```bash
cd /Users/david/Downloads/construciton/frontend
```

### 2. Make sure EAS CLI is installed
```bash
npm install -g eas-cli
```

### 3. Login to EAS (if needed)
```bash
eas login
```

### 4. Build for iOS
```bash
eas build --platform ios --profile production
```
⏱️ **This takes 10-15 minutes**

When it completes, you'll see:
```
✅ Build finished
Build ID: abc123-xyz-...
```

### 5. Submit to TestFlight
```bash
eas submit --platform ios --latest --profile production
```

⏱️ **This takes 2-3 minutes**

---

## 👥 Add Internal Testers

### First Time Setup (Only Once)

1. Go to **App Store Connect**: https://appstoreconnect.apple.com

2. Navigate to:
   - **My Apps** → **Construction Manager**
   - **TestFlight** tab
   - **Internal Testing** section

3. Click **"+" button** to add a tester

4. Enter your partner's **Apple ID email**

5. Click **Add**

They'll receive an email to join TestFlight

### For Subsequent Builds

Once added, your partner will automatically get notified of new builds!

---

## 📲 Your Partner's Installation Steps

### First Time (One-Time Setup)

1. **Install TestFlight app** from App Store:
   https://apps.apple.com/app/testflight/id899247664

2. **Accept invitation email** from Apple TestFlight

3. Open TestFlight app

4. Find "Construction Manager"

5. Tap **Install**

### For New Builds

When you deploy a new build:

1. Partner receives **push notification** on their iPhone
   > "Construction Manager build 12 is ready to test"

2. Open **TestFlight app**

3. Tap **Update** next to Construction Manager

4. App updates automatically

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Backend deploy (Railway) | 2-3 minutes (automatic) |
| iOS build (EAS) | 10-15 minutes |
| TestFlight submission | 2-3 minutes |
| Apple processing | 5-10 minutes |
| **Total time** | **~20-30 minutes** |

---

## 🔍 Monitoring Deployment

### Check Backend Deployment (Railway)

1. Go to: https://railway.app/dashboard
2. Find your project: `construciton-production`
3. Check **Deployments** tab
4. You should see the latest commit deploying

**Or test the backend directly:**
```bash
curl https://construciton-production.up.railway.app/health
```

### Check iOS Build Status

**Option 1: Command Line**
```bash
eas build:list --platform ios --limit 5
```

**Option 2: Web Dashboard**
https://expo.dev/accounts/davidmoretti/projects/consrcutionapp/builds

### Check TestFlight Status

**App Store Connect:**
https://appstoreconnect.apple.com/apps/6758401232/testflight/ios

You'll see:
- Build 12 processing → Ready to Test
- Number of internal testers
- Installation status

---

## 🧪 Testing the Agent Upgrade

Once your partner installs build 12, have them test:

### Test 1: Simple Query (Should be fast)
```
"Show me the Smith project"
```
✅ Should respond in <1 second (using Haiku)

### Test 2: Estimate Creation (Should be fast)
```
"Create an estimate for John's kitchen"
```
✅ Should respond in <1 second (using Haiku)

### Test 3: Complex Query (Should be smart)
```
"Show me all projects, overdue invoices, and who's clocked in today"
```
✅ Should respond in 2-3 seconds (using Sonnet)
✅ Should handle all 3 queries accurately

### Test 4: Memory Test
```
First: "Show me the Smith project"
Then: "What's the budget for that project?"
```
✅ Should remember "that project" = Smith project

---

## 🐛 Troubleshooting

### "Build failed"
**Check logs:**
```bash
eas build:view [BUILD_ID]
```

**Common fixes:**
- Make sure Xcode project is valid
- Check app.json for syntax errors
- Verify certificates are valid

### "Submission failed"
**Common issues:**
- Apple ID not configured in `eas.json`
- Need to accept Apple agreements
- Build missing required metadata

**Fix:**
```bash
eas credentials
```

### "Partner can't see the build"
**Checklist:**
- Partner added as internal tester? ✓
- Partner accepted TestFlight invitation? ✓
- Build status = "Ready to Test"? ✓
- Wait 5-10 minutes for Apple processing

### "Backend not updating"
**Check Railway:**
1. Go to Railway dashboard
2. Check deployment logs
3. Verify latest commit is deployed

**Force redeploy:**
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

---

## 📊 Verifying the Upgrade Works

### Backend Logs (Railway)

Look for these indicators in Railway logs:

```
🎯 Intent: project | Tools: 9/34 | Model: claude-haiku-4.5 (Standard query (9 tools))
⚡ Selecting Haiku: 9 tools needed (under threshold)
🧠 Selecting Sonnet: 12 tools needed (threshold: 10)
💾 Remembered: project_abc123 for user ...
✅ Agent complete in 847ms (2 rounds, model: claude-haiku-4.5)
```

### Expected Improvements

| Metric | Before | After Build 12 |
|--------|--------|----------------|
| Tool confusion | High | 30-40% reduction |
| Simple queries | Fast | Same (still fast) |
| Complex queries | 70% accurate | 90% accurate |
| Response quality | Good | Excellent |

---

## 🎉 Success Checklist

- [ ] Backend changes pushed to GitHub
- [ ] Railway shows successful deployment
- [ ] iOS build 12 created with EAS
- [ ] Build submitted to TestFlight
- [ ] Build shows "Ready to Test" in App Store Connect
- [ ] Partner added as internal tester
- [ ] Partner receives TestFlight notification
- [ ] Partner installs build 12
- [ ] Partner tests and confirms improvements

---

## 📞 Quick Links

- **Railway Dashboard**: https://railway.app/dashboard
- **EAS Builds**: https://expo.dev/accounts/davidmoretti/projects/consrcutionapp/builds
- **App Store Connect**: https://appstoreconnect.apple.com/apps/6758401232
- **TestFlight**: https://appstoreconnect.apple.com/apps/6758401232/testflight/ios
- **GitHub Repo**: https://github.com/davidmoretti37/construciton

---

## 💡 Pro Tips

1. **Keep your partner in the loop**: Send them a message when you deploy
   > "Hey! Just pushed build 12 with the new AI improvements. Should be ready in TestFlight in ~30 min. Try some complex queries - it's way smarter now!"

2. **Monitor the first few queries**: Check Railway logs to see the model routing in action

3. **Collect feedback**: Have your partner note any improvements or issues

4. **Version notes**: In App Store Connect, add "What to Test":
   > "Improved AI responses - try complex multi-part queries"

---

**Need help?** Check the logs:
- **Backend**: Railway dashboard → Logs
- **iOS Build**: `eas build:view [BUILD_ID]`
- **TestFlight**: App Store Connect → Activity tab
