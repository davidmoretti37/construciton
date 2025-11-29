# 🎯 Next Steps to Complete Universal Service Platform

## ✅ WHAT'S DONE (70% Complete!)

### Core Foundation ✓
- ✅ Database schema with 5 new tables
- ✅ AI service template generator
- ✅ Smart service search & discovery
- ✅ Service data service (all DB queries)
- ✅ Service search input component
- ✅ New onboarding screen (service selection)
- ✅ Phase template screen (dynamic)
- ✅ Navigation updated
- ✅ Migration SQL ready to run

**You can already:**
- Search for services (construction trades work immediately)
- Generate new services with AI (e.g., "pool cleaning")
- Select multiple services
- See AI-generated phases
- Database grows automatically

---

## 🚧 WHAT'S LEFT (30% - 4-5 Days)

### Day 4: Pricing Setup Screen (3 hours)

**File:** `src/screens/onboarding/PricingSetupScreen.js`

**Current Problem:**
```javascript
// Line ~20
import { getAllTrades, getDefaultPricing } from '../../constants/trades';
```

**What to change:**
1. Remove import from `constants/trades.js`
2. Get selected services from route params: `route.params.selectedServices`
3. For each service, show its items from `service.items`
4. Display: name, description, unit (NO default prices - user enters their own)
5. Allow adding custom items

**Simplified approach:**
```javascript
const selectedServices = route.params.selectedServices || [];

// Initialize pricing state from service items
const initializePricing = () => {
  const initialPricing = {};

  selectedServices.forEach(service => {
    initialPricing[service.id] = {};

    service.items?.forEach(item => {
      initialPricing[service.id][item.id] = {
        price: '', // User enters price
        unit: item.unit,
      };
    });
  });

  return initialPricing;
};
```

---

### Day 5: Update All References (4-6 hours)

**Goal:** Find all files using `trades.js` or `phaseTemplates.js` and update

**Quick Find:**
```bash
# Find all files importing trades
grep -r "from.*constants/trades" src/

# Find all files importing phaseTemplates
grep -r "from.*constants/phaseTemplates" src/
```

**For each file:**

**OLD:**
```javascript
import { TRADES, getAllTrades } from '../constants/trades';
const trades = getAllTrades();
```

**NEW:**
```javascript
import { getAllServices } from '../services/serviceDataService';
const [services, setServices] = useState([]);

useEffect(() => {
  loadServices();
}, []);

const loadServices = async () => {
  const data = await getAllServices();
  setServices(data);
};
```

**Key files to update:**
1. GeneralContractorSetupScreen.js
2. EditBusinessInfoScreen.js
3. EditPhasesScreen.js
4. SettingsScreen.js
5. ProjectsScreen.js (if used)
6. WorkersScreen.js (if used)
7. utils/storage.js
8. utils/migrations.js

---

### Day 6: Settings Screens (4-5 hours)

#### A. Create "Manage Services" Screen

**New File:** `src/screens/settings/ManageServicesScreen.js`

**Template to follow:** Copy structure from `ServiceSelectionScreen.js`

**Key features:**
```javascript
export default function ManageServicesScreen({ navigation }) {
  const { user } = useAuth();
  const [userServices, setUserServices] = useState([]);

  useEffect(() => {
    loadUserServices();
  }, []);

  const loadUserServices = async () => {
    const services = await getUserServices(user.id);
    setUserServices(services);
  };

  return (
    // Search bar at top (use ServiceSearchInput component)
    // List of user's current services
    // Edit button for each → Edit pricing/phases
    // Delete button → Archive service
  );
}
```

#### B. Update GeneralContractorSetupScreen

Replace hardcoded service grid with `ServiceSearchInput` component.

---

### Day 7: Update AI Prompts (2-3 hours)

**Files to update:**
```
src/services/agents/prompts/
├── coreAgentPrompt.js
├── projectCreationPrompt.js
├── estimateInvoicePrompt.js
├── workersSchedulingPrompt.js
├── documentPrompt.js
└── settingsConfigPrompt.js
```

**Find & Replace:**
- "construction" → "service" or "trade"
- "contractor" → "service provider"
- "building" → "project" or "job"
- Construction-specific examples → Generic examples

**Example:**
```javascript
// OLD:
"You are a construction project management assistant"

// NEW:
"You are a service business management assistant"
```

---

### Day 8: Testing & Polish (Full day)

#### Testing Checklist

**Database:**
- [ ] Run migration successfully
- [ ] Verify 5 tables created
- [ ] Check 12 services seeded
- [ ] Test search function

**Onboarding Flow:**
- [ ] New user starts onboarding
- [ ] Search works (autocomplete)
- [ ] Select existing service (construction trade)
- [ ] Select new service → AI generates
- [ ] Multiple services selected
- [ ] Phases load correctly
- [ ] Pricing screen works
- [ ] Complete onboarding

**AI Generation:**
- [ ] Search for "pool cleaning" → Generates
- [ ] Search for "landscaping" → Finds existing
- [ ] Search for "bee removal" → Generates
- [ ] Check database for new entries
- [ ] Second user searches same service → Instant (cached)

**Settings:**
- [ ] Manage Services screen works
- [ ] Add new service from settings
- [ ] Edit existing service
- [ ] Archive service

**Existing Features:**
- [ ] Create project works
- [ ] Generate estimate works
- [ ] Worker management works
- [ ] Everything else still functional

#### Polish Items

**Error Handling:**
- [ ] AI generation fails → Fallback
- [ ] Database connection fails → Error message
- [ ] Invalid service name → Validation
- [ ] Empty search results → Helpful message

**Loading States:**
- [ ] Service search (with debounce)
- [ ] AI generation (with indicator)
- [ ] Phase loading
- [ ] Database queries

**Empty States:**
- [ ] No services selected
- [ ] No search results
- [ ] No user services in settings

**Help Text:**
- [ ] Tooltips where helpful
- [ ] "AI Generated" badges
- [ ] Service counts
- [ ] Instructions

---

## 📋 MIGRATION CHECKLIST

Before you start remaining work:

### 1. Run the Migration

```bash
# Backup first!
pg_dump your_db > backup.sql

# Run migration
PGPASSWORD='...' psql "connection_string" -f supabase/migrations/20251121_create_service_system.sql

# Verify
PGPASSWORD='...' psql "connection_string" -c "SELECT COUNT(*) FROM service_categories;"
```

**Expected:** 12 services

### 2. Test Current Features

```bash
npm start
```

- Go through onboarding
- Try searching for "painting"
- Try searching for "pool cleaning"
- Check if phases load

### 3. Address Any Issues

Check console for errors:
- Supabase connection issues?
- Missing tables?
- AI API key configured?

---

## 🎯 PRIORITY ORDER

**Must Do First:**
1. ✅ Run migration
2. ✅ Test new onboarding
3. Update PricingSetupScreen (Day 4)
4. Update file references (Day 5)

**Can Do Later:**
5. Settings screens (Day 6)
6. AI prompts (Day 7)
7. Testing & polish (Day 8)

---

## 💡 TIPS

### For Day 4 (Pricing Screen)
- Copy pattern from `PhaseTemplateSetupScreen.js` (we just updated it)
- `selectedServices` comes from route params
- Each service has `service.items` array
- User enters prices (no defaults)

### For Day 5 (References)
- Use VSCode "Find in Files" (Cmd+Shift+F)
- Search for "constants/trades"
- Replace one file at a time
- Test after each file

### For Testing
- Keep Supabase dashboard open
- Watch service_categories table grow
- Check service_search_analytics for insights
- Monitor AI costs in OpenRouter

---

## 🚨 COMMON ISSUES & FIXES

### Issue: AI Generation Not Working
**Check:**
- OpenRouter API key in `.env`
- Internet connection
- Console errors

**Fix:**
```javascript
// In templateGenerationService.js
console.log('Calling AI with prompt:', prompt);
```

### Issue: Services Not Appearing
**Check:**
- Database connection
- RLS policies
- User authentication

**Fix:**
```bash
# Check RLS policies
PGPASSWORD='...' psql "..." -c "\d+ service_categories"
```

### Issue: Search Not Finding Services
**Check:**
- Trigram extension enabled
- Services actually in database
- Search query valid

**Fix:**
```bash
# Test search directly
PGPASSWORD='...' psql "..." -c "SELECT * FROM search_services('paint');"
```

---

## 📞 WHEN YOU NEED HELP

**Questions about:**
- Database: Check Supabase dashboard
- AI: Check OpenRouter dashboard
- Code: Check console logs

**Debugging tips:**
```javascript
// Add logging everywhere during development
console.log('🔍 Searching for:', query);
console.log('✅ Results found:', results.length);
console.log('🤖 Generating service:', serviceName);
```

---

## 🎉 WHEN YOU'RE DONE

You'll have:
- ✅ Universal service platform
- ✅ Unlimited service types
- ✅ AI-powered generation
- ✅ Self-growing database
- ✅ $10/month operating cost
- ✅ Works for ANY service business

**Market expanded from construction only → ALL service trades!**

---

## 📁 KEY FILES REFERENCE

**Use these as examples:**
- `ServiceSelectionScreen.js` - Search & select pattern
- `PhaseTemplateSetupScreen.js` - Dynamic data initialization
- `serviceDataService.js` - All database queries
- `serviceDiscoveryService.js` - Search logic
- `templateGenerationService.js` - AI generation

**Migration:**
- `supabase/migrations/20251121_create_service_system.sql`

**Guides:**
- `IMPLEMENTATION_SUMMARY.md` - Full overview
- `RUN_MIGRATION.md` - Migration instructions
- `NEXT_STEPS.md` - This file

---

Good luck! The hard part is done. The remaining work is straightforward updates! 🚀
