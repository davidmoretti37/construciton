# Quick Start Guide

## What You Just Got

A fully functional React Native + Expo mobile app for construction project management with:
- ✅ 5 complete screens (Chat, Home, Projects, Workers, Stats)
- ✅ Bottom tab navigation
- ✅ Professional UI with proper styling
- ✅ Chat-first interface ready for AI integration
- ✅ Demo data showing how it all works

## How to Run It (3 Minutes)

### Option 1: On Your Phone (Easiest)

1. **Install Expo Go**
   - iOS: Download from App Store
   - Android: Download from Play Store

2. **Start the app**
   ```bash
   cd construction-manager
   npm start
   ```

3. **Scan the QR code**
   - iOS: Use Camera app
   - Android: Use Expo Go app
   
4. **Done!** The app opens on your phone

### Option 2: On Web Browser

```bash
cd construction-manager
npm run web
```

Opens automatically in your browser at `http://localhost:19006`

## What Each Screen Does

### 💬 Chat (Opens First)
- Type messages to the AI assistant
- Three quick action buttons at bottom:
  - WhatsApp: Create project from WhatsApp convo (not functional yet)
  - Screenshot: Upload screenshot to create project (not functional yet)
  - Plus: Manual project creation (not functional yet)
- Currently shows demo responses - needs AI API integration

### 🏠 Home
- Dashboard with overview stats
- Income tracking for the month
- Today's activity feed
- Active projects preview
- Quick access to everything

### 📁 Projects  
- List of all projects
- Search and filter (UI only for now)
- Each project shows:
  - Budget progress
  - Workers assigned
  - Status (on track, behind, over budget)
- Tap + button to create new project (not functional yet)

### 👷 Workers
- On-site workers (actively working)
- Off-duty workers
- Shows current projects and clock-in times
- Green indicator = currently working
- Gray indicator = off today

### 📊 Stats
- Toggle between Monthly/Weekly/All Time
- Income breakdown (earned, collected, pending)
- Project progress overview
- Worker hours tracking
- Visual progress bars

## Next Steps to Make It Real

### 1. Connect to Backend (Required)
```javascript
// In ChatScreen.js, replace the setTimeout simulation with:
const response = await fetch('YOUR_API_URL/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: inputText })
});
const data = await response.json();
// Use data.response as the AI message
```

### 2. Add AI Integration (Required)
- Sign up for OpenAI API or Anthropic Claude API
- Create backend endpoint that calls AI API
- Pass project data as context to AI
- Return AI response to app

### 3. Add Real Data (Required)
- Replace demo data with API calls
- Fetch projects, workers, stats from your backend
- Update screens when data changes

### 4. Add Missing Features
- Camera for photos
- Image picker for screenshots  
- WhatsApp integration
- Push notifications
- User authentication

## File Structure

```
src/
  screens/
    ChatScreen.js       ← Main screen, AI interface
    HomeScreen.js       ← Dashboard
    ProjectsScreen.js   ← Project list
    WorkersScreen.js    ← Worker management
    StatsScreen.js      ← Analytics
  navigation/
    BottomTabNavigator.js ← Tab setup
  constants/
    theme.js            ← Colors, spacing, fonts
```

## Customization

### Change Colors
Edit `src/constants/theme.js`:
```javascript
export const Colors = {
  primaryBlue: '#YOUR_COLOR',  // Change this
  successGreen: '#YOUR_COLOR', // And these
  // ...
};
```

### Add a New Screen
1. Create `src/screens/NewScreen.js`
2. Add to `BottomTabNavigator.js`:
```javascript
<Tab.Screen
  name="NewScreen"
  component={NewScreen}
  options={{
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="icon-name" size={size} color={color} />
    ),
  }}
/>
```

### Modify Chat Messages
Look in `ChatScreen.js` for the `messages` state. The structure is:
```javascript
{
  id: 'unique-id',
  text: 'Message text',
  isUser: false, // false = AI, true = User
  timestamp: new Date()
}
```

## Common Issues

**"Module not found" error:**
```bash
cd construction-manager
rm -rf node_modules
npm install
```

**App won't start:**
```bash
npx expo start --clear
```

**Can't see changes:**
- Shake phone → "Reload"
- Or tap "r" in terminal

**Expo Go doesn't connect:**
- Make sure phone and computer on same WiFi
- Try entering URL manually in Expo Go

## Getting Help

- Expo docs: https://docs.expo.dev
- React Native docs: https://reactnative.dev
- React Navigation: https://reactnavigation.org

## What's NOT Included Yet

- ❌ Backend/database
- ❌ Real AI integration
- ❌ Camera functionality
- ❌ Image uploads
- ❌ Authentication
- ❌ Real-time updates
- ❌ Push notifications
- ❌ WhatsApp integration

All the UI is ready - just needs to be connected to real services!
