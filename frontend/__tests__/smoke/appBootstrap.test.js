/**
 * App Bootstrap Smoke Tests
 *
 * Verifies structural integrity of the app without rendering any React
 * components. These tests catch:
 * - Missing or deleted files still referenced elsewhere
 * - Broken directory structure
 * - Missing critical service/context/navigation files
 * - File count regressions (accidental bulk deletes)
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../../src');

describe('App Bootstrap Smoke Tests', () => {
  // ============================================================
  // Context Providers
  // ============================================================
  describe('context providers', () => {
    const contextsDir = path.join(SRC_DIR, 'contexts');

    test('contexts directory exists', () => {
      expect(fs.existsSync(contextsDir)).toBe(true);
    });

    test('all required context files exist', () => {
      const expectedContexts = [
        'AuthContext.js',
        'ThemeContext.js',
        'OnboardingContext.js',
        'NotificationContext.js',
        'SubscriptionContext.js',
      ];

      const files = fs.readdirSync(contextsDir);
      for (const ctx of expectedContexts) {
        expect(files).toContain(ctx);
      }
    });

    test('context files are not empty', () => {
      const files = fs.readdirSync(contextsDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(contextsDir, file), 'utf8');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // Navigation Files
  // ============================================================
  describe('navigation files', () => {
    const navDir = path.join(SRC_DIR, 'navigation');

    test('navigation directory exists', () => {
      expect(fs.existsSync(navDir)).toBe(true);
    });

    test('all required navigator files exist', () => {
      const expectedNavigators = [
        'AuthNavigator.js',
        'MainNavigator.js',
        'OwnerMainNavigator.js',
        'WorkerMainNavigator.js',
        'BottomTabNavigator.js',
        'OwnerBottomTabNavigator.js',
        'WorkerBottomTabNavigator.js',
        'OnboardingNavigator.js',
        'SettingsNavigator.js',
      ];

      const files = fs.readdirSync(navDir);
      for (const nav of expectedNavigators) {
        expect(files).toContain(nav);
      }
    });

    test('navigation files are not empty', () => {
      const files = fs.readdirSync(navDir).filter(f => f.endsWith('.js'));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(path.join(navDir, file), 'utf8');
        expect(content.length).toBeGreaterThan(100); // Navigators should have substantial code
      }
    });
  });

  // ============================================================
  // Screen Directories
  // ============================================================
  describe('screen directories', () => {
    const screenDir = path.join(SRC_DIR, 'screens');

    test('screens directory exists', () => {
      expect(fs.existsSync(screenDir)).toBe(true);
    });

    test('screens directory has files', () => {
      const entries = fs.readdirSync(screenDir);
      expect(entries.length).toBeGreaterThan(0);
    });

    test('critical screen files exist', () => {
      const expectedScreens = [
        'HomeScreen.js',
        'ChatScreen.js',
        'ProjectsScreen.js',
        'WorkersScreen.js',
        'ProjectDetailScreen.js',
      ];

      const allFiles = [];
      // Collect files from screens/ and its subdirectories
      const entries = fs.readdirSync(screenDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          allFiles.push(entry.name);
        }
      }

      for (const screen of expectedScreens) {
        expect(allFiles).toContain(screen);
      }
    });

    test('role-specific screen directories exist', () => {
      const expectedDirs = ['auth', 'owner', 'worker', 'onboarding', 'settings'];
      const entries = fs.readdirSync(screenDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      for (const dir of expectedDirs) {
        expect(dirs).toContain(dir);
      }
    });
  });

  // ============================================================
  // Service Files
  // ============================================================
  describe('service files', () => {
    const servicesDir = path.join(SRC_DIR, 'services');

    test('services directory exists', () => {
      expect(fs.existsSync(servicesDir)).toBe(true);
    });

    test('all required service files exist', () => {
      const expectedServices = [
        'aiService.js',
        'chatHistoryService.js',
        'conversationService.js',
        'eventEmitter.js',
        'projectService.js',
        'subscriptionService.js',
        'uploadService.js',
      ];

      const files = fs.readdirSync(servicesDir);
      for (const svc of expectedServices) {
        expect(files).toContain(svc);
      }
    });

    test('agent system directory exists with CoreAgent', () => {
      const agentsDir = path.join(servicesDir, 'agents');
      expect(fs.existsSync(agentsDir)).toBe(true);

      const coreDir = path.join(agentsDir, 'core');
      expect(fs.existsSync(coreDir)).toBe(true);

      const coreAgentPath = path.join(coreDir, 'CoreAgent.js');
      expect(fs.existsSync(coreAgentPath)).toBe(true);
    });

    test('service files are not empty', () => {
      const criticalServices = ['aiService.js', 'chatHistoryService.js'];
      for (const svc of criticalServices) {
        const content = fs.readFileSync(path.join(servicesDir, svc), 'utf8');
        expect(content.length).toBeGreaterThan(100);
      }
    });
  });

  // ============================================================
  // Utils
  // ============================================================
  describe('utility files', () => {
    const utilsDir = path.join(SRC_DIR, 'utils');

    test('utils directory exists', () => {
      expect(fs.existsSync(utilsDir)).toBe(true);
    });

    test('logger utility exists', () => {
      const loggerPath = path.join(utilsDir, 'logger.js');
      expect(fs.existsSync(loggerPath)).toBe(true);
    });

    test('storage utilities exist', () => {
      const storagePath = path.join(utilsDir, 'storage');
      expect(fs.existsSync(storagePath)).toBe(true);
    });
  });

  // ============================================================
  // Lib (Supabase client)
  // ============================================================
  describe('lib files', () => {
    const libDir = path.join(SRC_DIR, 'lib');

    test('lib directory exists', () => {
      expect(fs.existsSync(libDir)).toBe(true);
    });

    test('supabase client file exists', () => {
      const supabasePath = path.join(libDir, 'supabase.js');
      expect(fs.existsSync(supabasePath)).toBe(true);
    });
  });

  // ============================================================
  // Components
  // ============================================================
  describe('components directory', () => {
    const componentsDir = path.join(SRC_DIR, 'components');

    test('components directory exists', () => {
      expect(fs.existsSync(componentsDir)).toBe(true);
    });

    test('components directory has files', () => {
      const entries = fs.readdirSync(componentsDir);
      expect(entries.length).toBeGreaterThan(10); // Should have many components
    });

    test('ChatVisuals subdirectory exists', () => {
      const chatVisualsDir = path.join(componentsDir, 'ChatVisuals');
      expect(fs.existsSync(chatVisualsDir)).toBe(true);

      const files = fs.readdirSync(chatVisualsDir);
      expect(files.length).toBeGreaterThan(5); // Project cards, estimate previews, etc.
    });
  });

  // ============================================================
  // File Count Regression Guards
  // ============================================================
  describe('file count regression guards', () => {
    test('src directory has substantial content', () => {
      const countFiles = (dir) => {
        let count = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
            count++;
          } else if (entry.isDirectory() && entry.name !== 'node_modules') {
            count += countFiles(path.join(dir, entry.name));
          }
        }
        return count;
      };

      const totalFiles = countFiles(SRC_DIR);
      // Guard against accidental bulk deletes
      expect(totalFiles).toBeGreaterThan(50);
    });
  });
});
