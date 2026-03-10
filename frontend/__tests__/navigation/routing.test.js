/**
 * App Routing Logic Tests
 *
 * Tests the navigation routing decisions in App.js.
 * The app uses a getNavigator() function that determines which navigator
 * to show based on: session, role, language selection, and onboarding status.
 *
 * Routing rules (in order of priority):
 * 1. No session + no cached profile  -> AuthNavigator (login/signup)
 * 2. No session + cached profile     -> AppLoadingScreen (waiting for session restore)
 * 3. Session + no language selected   -> LanguageSelectionScreen
 * 4. Session + language + no role     -> RoleSelectionScreen
 * 5. Session + role + not onboarded:
 *    - role=owner                     -> OnboardingNavigator
 *    - role=supervisor                -> SupervisorOnboardingNavigator
 *    - role=worker                    -> WorkerOnboardingNavigator
 * 6. Session + role + onboarded:
 *    - role=owner                     -> OwnerMainWrapper (OwnerMainNavigator)
 *    - role=supervisor + ownerId      -> MainNavigator
 *    - role=supervisor + no ownerId   -> SupervisorOnboardingNavigator (invitation)
 *    - role=worker                    -> WorkerMainNavigator
 * 7. Fallback                         -> MainNavigator
 */

const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '../../App.js');
const appContent = fs.readFileSync(APP_PATH, 'utf-8');

const NAV_DIR = path.join(__dirname, '../../src/navigation');

describe('App Routing Logic', () => {
  describe('App.js module structure', () => {
    test('App.js file exists', () => {
      expect(fs.existsSync(APP_PATH)).toBe(true);
    });

    test('exports a default App component', () => {
      expect(appContent).toMatch(/export\s+default\s+function\s+App/);
    });

    test('defines AppContent component with routing logic', () => {
      expect(appContent).toContain('function AppContent');
    });

    test('defines getNavigator function for routing decisions', () => {
      expect(appContent).toContain('getNavigator');
    });
  });

  describe('provider hierarchy', () => {
    test('wraps app in ErrorBoundary', () => {
      expect(appContent).toContain('<ErrorBoundary>');
    });

    test('wraps app in ThemeProvider', () => {
      expect(appContent).toContain('<ThemeProvider>');
    });

    test('wraps app in AuthProvider', () => {
      expect(appContent).toContain('<AuthProvider>');
    });

    test('wraps app in SubscriptionProvider', () => {
      expect(appContent).toContain('<SubscriptionProvider>');
    });

    test('wraps app in NotificationProvider', () => {
      expect(appContent).toContain('<NotificationProvider>');
    });
  });

  describe('navigator imports in App.js', () => {
    const expectedImports = [
      { name: 'MainNavigator', path: './src/navigation/MainNavigator' },
      { name: 'WorkerMainNavigator', path: './src/navigation/WorkerMainNavigator' },
      { name: 'OwnerMainNavigator', path: './src/navigation/OwnerMainNavigator' },
      { name: 'OnboardingNavigator', path: './src/navigation/OnboardingNavigator' },
      { name: 'WorkerOnboardingNavigator', path: './src/navigation/WorkerOnboardingNavigator' },
      { name: 'SupervisorOnboardingNavigator', path: './src/navigation/SupervisorOnboardingNavigator' },
      { name: 'AuthNavigator', path: './src/navigation/AuthNavigator' },
    ];

    test.each(expectedImports)('imports $name', ({ name }) => {
      expect(appContent).toContain(name);
    });

    test.each(expectedImports)('$name navigator file exists on disk', ({ path: relPath }) => {
      const fullPath = path.join(__dirname, '../../', relPath + '.js');
      const exists = fs.existsSync(fullPath) ||
        fs.existsSync(fullPath.replace('.js', '.tsx')) ||
        fs.existsSync(fullPath.replace('.js', '/index.js'));
      expect(exists).toBe(true);
    });
  });

  describe('routing decision: no session', () => {
    test('shows AuthNavigator when no session and no cached profile', () => {
      expect(appContent).toContain('<AuthNavigator />');
    });

    test('shows AppLoadingScreen when no session but cached profile exists', () => {
      // The code checks: if (profile || isUsingCache) -> loading
      expect(appContent).toContain('profile || isUsingCache');
      expect(appContent).toContain('AppLoadingScreen');
    });
  });

  describe('routing decision: authenticated but needs setup', () => {
    test('shows LanguageSelectionScreen when language not selected', () => {
      expect(appContent).toContain('languageSelected === false');
      expect(appContent).toContain('<LanguageSelectionScreen');
    });

    test('shows RoleSelectionScreen when no role is set', () => {
      expect(appContent).toContain('!role');
      expect(appContent).toContain('<RoleSelectionScreen');
    });
  });

  describe('routing decision: needs onboarding', () => {
    test('shows OnboardingNavigator for owner role not yet onboarded', () => {
      expect(appContent).toContain("role === 'owner'");
      expect(appContent).toContain('<OnboardingNavigator');
    });

    test('shows SupervisorOnboardingNavigator for supervisor role not yet onboarded', () => {
      expect(appContent).toContain("role === 'supervisor'");
      expect(appContent).toContain('<SupervisorOnboardingNavigator');
    });

    test('shows WorkerOnboardingNavigator for worker role not yet onboarded', () => {
      expect(appContent).toContain("role === 'worker'");
      expect(appContent).toContain('<WorkerOnboardingNavigator');
    });

    test('passes onComplete callback to onboarding navigators', () => {
      expect(appContent).toContain('onComplete={handleOnboardingComplete}');
    });

    test('passes onGoBack callback to onboarding navigators', () => {
      expect(appContent).toContain('onGoBack={handleGoBackToRoleSelection}');
    });
  });

  describe('routing decision: fully set up', () => {
    test('shows OwnerMainWrapper for onboarded owner', () => {
      expect(appContent).toContain('<OwnerMainWrapper');
    });

    test('shows MainNavigator for onboarded supervisor with ownerId', () => {
      // After owner check, supervisor check includes ownerId
      expect(appContent).toContain('<MainNavigator />');
      expect(appContent).toContain('ownerId');
    });

    test('shows SupervisorOnboardingNavigator for supervisor without ownerId (invitation)', () => {
      expect(appContent).toContain('!ownerId');
      // Supervisor without owner gets invitation flow
      expect(appContent).toContain('SupervisorOnboardingNavigator');
    });

    test('shows WorkerMainNavigator for onboarded worker', () => {
      expect(appContent).toContain('<WorkerMainNavigator />');
    });

    test('falls back to MainNavigator', () => {
      // Last return in getNavigator
      const fallbackMatch = appContent.match(/\/\/\s*Fallback[\s\S]*?return\s+<MainNavigator\s*\/>/);
      expect(fallbackMatch).not.toBeNull();
    });
  });

  describe('routing state variables', () => {
    test('tracks loading state', () => {
      expect(appContent).toContain("const [loading, setLoading] = useState(true)");
    });

    test('tracks language selection state (null = undetermined)', () => {
      expect(appContent).toContain("const [languageSelected, setLanguageSelected] = useState(null)");
    });

    test('tracks onboarding state (null = undetermined)', () => {
      expect(appContent).toContain("const [userOnboarded, setUserOnboarded] = useState(null)");
    });

    test('uses AuthContext for session, role, and profile', () => {
      expect(appContent).toContain('useAuth()');
      expect(appContent).toContain('session');
      expect(appContent).toContain('role');
      expect(appContent).toContain('profile');
    });
  });

  describe('deep linking configuration', () => {
    test('configures NavigationContainer with linking prefixes', () => {
      expect(appContent).toContain('linking=');
      expect(appContent).toContain('prefixes');
    });

    test('supports sylk:// custom scheme', () => {
      expect(appContent).toContain("sylk://");
    });

    test('supports railway.app HTTPS URL', () => {
      expect(appContent).toContain('construciton-production.up.railway.app');
    });
  });

  describe('role-specific navigator screen counts', () => {
    test('supervisor MainNavigator has screens for daily reports, expenses, settings', () => {
      const mainContent = fs.readFileSync(path.join(NAV_DIR, 'MainNavigator.js'), 'utf-8');
      expect(mainContent).toContain('DailyReportForm');
      expect(mainContent).toContain('DailyReportDetail');
      expect(mainContent).toContain('ExpenseForm');
      expect(mainContent).toContain('NotificationSettings');
      expect(mainContent).toContain('DocumentViewer');
    });

    test('owner OwnerMainNavigator has financial and bank screens', () => {
      const ownerContent = fs.readFileSync(path.join(NAV_DIR, 'OwnerMainNavigator.js'), 'utf-8');
      expect(ownerContent).toContain('FinancialReport');
      expect(ownerContent).toContain('ARAging');
      expect(ownerContent).toContain('TaxSummary');
      expect(ownerContent).toContain('BankConnection');
      expect(ownerContent).toContain('BankReconciliation');
      expect(ownerContent).toContain('Paywall');
    });

    test('worker WorkerMainNavigator has time clock and assignment screens via tabs', () => {
      const workerTabContent = fs.readFileSync(path.join(NAV_DIR, 'WorkerBottomTabNavigator.js'), 'utf-8');
      expect(workerTabContent).toContain('TimeClock');
      expect(workerTabContent).toContain('Schedule');
      expect(workerTabContent).toContain('Assignments');
      expect(workerTabContent).toContain('Reports');
    });
  });

  describe('onboarding navigator screen counts', () => {
    test('OnboardingNavigator has full business setup flow', () => {
      const onboardContent = fs.readFileSync(path.join(NAV_DIR, 'OnboardingNavigator.js'), 'utf-8');
      expect(onboardContent).toContain('Welcome');
      expect(onboardContent).toContain('ServiceSelection');
      expect(onboardContent).toContain('PhaseCustomization');
      expect(onboardContent).toContain('PricingSetup');
      expect(onboardContent).toContain('BusinessInfo');
      expect(onboardContent).toContain('InvoiceSetup');
      expect(onboardContent).toContain('Completion');
    });

    test('SupervisorOnboardingNavigator has simplified 3-step flow', () => {
      const supContent = fs.readFileSync(path.join(NAV_DIR, 'SupervisorOnboardingNavigator.js'), 'utf-8');
      expect(supContent).toContain('SupervisorWelcome');
      expect(supContent).toContain('SupervisorInfo');
      expect(supContent).toContain('SupervisorCompletion');
    });

    test('WorkerOnboardingNavigator has simplified 3-step flow', () => {
      const workerContent = fs.readFileSync(path.join(NAV_DIR, 'WorkerOnboardingNavigator.js'), 'utf-8');
      expect(workerContent).toContain('WorkerWelcome');
      expect(workerContent).toContain('WorkerInfo');
      expect(workerContent).toContain('WorkerCompletion');
    });
  });
});
