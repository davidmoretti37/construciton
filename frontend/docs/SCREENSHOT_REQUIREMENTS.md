# App Store Screenshot Requirements

## Required Device Sizes

### iPhone Screenshots (Required)

| Display Size | Resolution (Portrait) | Device Examples |
|--------------|----------------------|-----------------|
| 6.7" | 1290 x 2796 px | iPhone 15 Pro Max, iPhone 15 Plus |
| 6.5" | 1284 x 2778 px | iPhone 14 Plus, iPhone 13 Pro Max |
| 5.5" | 1242 x 2208 px | iPhone 8 Plus (optional but recommended) |

### iPad Screenshots (Required if supporting tablet)

| Display Size | Resolution (Portrait) | Device Examples |
|--------------|----------------------|-----------------|
| 12.9" | 2048 x 2732 px | iPad Pro 12.9" |
| 11" | 1668 x 2388 px | iPad Pro 11" |

**Note:** Your app has `supportsTablet: true`, so iPad screenshots are required.

---

## Screenshot Limits

- **Minimum:** 3 screenshots per device size
- **Maximum:** 10 screenshots per device size
- **Format:** PNG or JPEG (PNG recommended)
- **No alpha/transparency** allowed

---

## Recommended Screenshot Sequence

Capture these screens in order to showcase your app's key features:

### 1. Dashboard / Home Screen
- Show the main dashboard with project overview
- Display key stats (active projects, pending tasks)
- Demonstrates the app's clean, professional interface

### 2. AI Chat / Estimate Generation
- Show the AI chat interface
- Display an example of estimate creation
- Highlights the AI-powered features

### 3. Projects List
- Show multiple projects with status indicators
- Display project cards with key information
- Demonstrates multi-project management

### 4. Project Detail View
- Show a single project's full details
- Display phases, budget, and progress
- Shows depth of project tracking

### 5. Worker Management / Scheduling
- Show the worker list or scheduling calendar
- Display assigned workers and schedules
- Demonstrates team management features

### 6. Time Tracking
- Show the clock in/out interface
- Display time entries with location
- Highlights GPS verification feature

### 7. Invoice / Estimate Preview
- Show a professional invoice or estimate
- Display line items and totals
- Demonstrates professional document generation

### 8. Daily Report
- Show a daily report with photos
- Display work completion details
- Demonstrates documentation features

---

## Screenshot Guidelines

### Status Bar Requirements
- **Time:** 9:41 AM (Apple's standard)
- **Cellular:** Full signal bars
- **WiFi:** Full signal (optional)
- **Battery:** Full or not shown

### Content Guidelines
- Use realistic but not real personal data
- Remove or blur any sensitive information
- Ensure text is readable at small sizes
- Use consistent sample data across screenshots

### Visual Tips
- Use high-contrast, clean screens
- Avoid cluttered views
- Show completed/populated states (not empty states)
- Consider light mode for screenshots (better visibility)

### Optional Enhancements
- Add text overlays highlighting features
- Create device frames using tools like:
  - Rotato
  - MockUPhone
  - AppLaunchpad
  - Screenshots Pro

---

## Screenshot Capture Tips

### On Physical Device (Recommended)
1. Set device time to 9:41 AM
2. Enable Do Not Disturb
3. Ensure full battery display
4. Use sample/demo data
5. Press Side Button + Volume Up simultaneously

### On Simulator
1. Open Simulator with correct device
2. Set status bar: `xcrun simctl status_bar booted override --time 9:41`
3. Capture: Cmd + S or File > Save Screen

### Screenshot Tools
- **Fastlane Snapshot:** Automated screenshot capture
- **Xcode:** Built-in simulator screenshots
- **QuickTime:** Screen recording then extract frames

---

## Sample Data Suggestions

### Projects
- "Johnson Kitchen Remodel" - Active, 65% complete
- "Smith Home Addition" - In Progress
- "Downtown Office Build" - Planning Phase

### Workers
- "Mike Rodriguez" - Carpenter
- "Sarah Chen" - Electrician
- "James Wilson" - General Labor

### Financial Data
- Contract: $45,000
- Collected: $22,500
- Expenses: $12,350
- Profit: $10,150

### Time Entries
- Clock in: 7:00 AM
- Clock out: 3:30 PM
- Location: "123 Main St, Austin, TX"

---

## Localization

If supporting multiple languages, capture screenshots in:
- English (U.S.) - Required
- Spanish - If significant Spanish-speaking market
- Portuguese (Brazil) - If targeting Brazil market

Use App Store Connect's localization features to upload language-specific screenshots.

---

## Pre-Submission Checklist

- [ ] 6.7" iPhone screenshots (minimum 3)
- [ ] 6.5" iPhone screenshots (minimum 3)
- [ ] 12.9" iPad screenshots (minimum 3)
- [ ] 11" iPad screenshots (minimum 3)
- [ ] Status bar shows 9:41 AM
- [ ] No personal/sensitive data visible
- [ ] All screenshots in PNG format
- [ ] Screenshots are high quality (not blurry)
- [ ] Consistent sample data across all screenshots
- [ ] App name/branding visible where appropriate
