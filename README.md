# Construction Manager App

A mobile-first construction project management app built with React Native and Expo, featuring an AI chat assistant as the primary interface.

## Features

- **Chat-First Interface**: AI assistant as the main screen for natural interaction
- **Project Management**: Track projects, budgets, timelines, and progress
- **Worker Management**: Clock in/out, assign tasks, track hours
- **Real-time Updates**: Activity feed and notifications
- **Statistics & Analytics**: Income tracking, project progress, worker hours
- **Bottom Tab Navigation**: Easy access to Home, Projects, Workers, Chat, and Stats

## Tech Stack

- **React Native + Expo**: Cross-platform mobile development
- **React Navigation**: Bottom tab navigation
- **Expo Vector Icons**: Ionicons for UI elements
- **JavaScript**: No TypeScript for simplicity

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo Go app on your phone (for testing)

### Installation

1. Navigate to the project directory:
```bash
cd construction-manager
```

2. Install dependencies (already done if you just created the project):
```bash
npm install
```

### Running the App

1. Start the development server:
```bash
npm start
```

2. Scan the QR code with:
   - **iOS**: Camera app
   - **Android**: Expo Go app

3. Or run on emulator/simulator:
```bash
npm run ios     # For iOS simulator (Mac only)
npm run android # For Android emulator
npm run web     # For web browser
```

## Project Structure

```
construction-manager/
├── src/
│   ├── screens/          # All app screens
│   │   ├── ChatScreen.js
│   │   ├── HomeScreen.js
│   │   ├── ProjectsScreen.js
│   │   ├── WorkersScreen.js
│   │   └── StatsScreen.js
│   ├── components/       # Reusable components (to be added)
│   ├── navigation/       # Navigation configuration
│   │   └── BottomTabNavigator.js
│   └── constants/        # Theme colors, spacing, fonts
│       └── theme.js
├── App.js               # Main app entry point
└── package.json
```

## Screens

### 1. Chat (Default Screen)
- AI assistant interface
- Quick actions: WhatsApp import, Screenshot upload, Manual create
- Real-time messaging with AI
- Embedded visual elements (project cards, photos, etc.)

### 2. Home (Dashboard)
- Welcome header with date
- Quick stats cards (Active Projects, On-Site, Need Attention)
- Income overview for the month
- Today's activity feed
- Active projects list
- Recent photos

### 3. Projects
- Search and filter projects
- Project cards with:
  - Budget progress bars
  - Worker avatars
  - Status badges (On track, Behind, Over budget)
  - Last activity timestamp
- Create new project button

### 4. Workers
- On-site workers (active today)
- Off-duty workers
- Worker status indicators
- Clock-in times
- Current project assignments

### 5. Stats
- Time range toggle (Monthly, Weekly, All Time)
- Income tracking with breakdowns
- Project progress overview
- Worker hours breakdown
- Visual progress bars and charts

## Next Steps / TODO

### Backend Integration
- [ ] Set up backend API (Node.js/Express recommended)
- [ ] Database setup (PostgreSQL/MongoDB)
- [ ] Authentication (JWT)
- [ ] Real-time updates (WebSockets)

### AI Integration
- [ ] Connect to OpenAI API or Anthropic Claude API
- [ ] Implement context management for AI responses
- [ ] Add screenshot OCR for project creation
- [ ] WhatsApp Business API integration

### Features to Add
- [ ] Camera integration for photo uploads
- [ ] Image picker for screenshot uploads
- [ ] Push notifications
- [ ] Offline support
- [ ] Clock-in/out with geolocation
- [ ] Project detail screens
- [ ] Worker detail screens
- [ ] Settings screen
- [ ] Authentication flow (login/signup)
- [ ] User onboarding flow

### UI Enhancements
- [ ] Loading states
- [ ] Error handling and error screens
- [ ] Empty states
- [ ] Pull-to-refresh
- [ ] Skeleton screens
- [ ] Animations and transitions
- [ ] Dark mode support

## Design System

### Colors
- **Primary Blue**: #2563EB
- **Success Green**: #10B981
- **Warning Orange**: #F59E0B
- **Error Red**: #EF4444

### Spacing Scale
- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 24px
- xxl: 32px

### Font Sizes
- tiny: 12px
- small: 14px
- body: 16px
- subheader: 18px
- header: 24px
- large: 32px

## Contributing

This is a work in progress. Feel free to:
1. Add new features
2. Improve existing UI
3. Fix bugs
4. Add tests
5. Improve documentation

## License

MIT
