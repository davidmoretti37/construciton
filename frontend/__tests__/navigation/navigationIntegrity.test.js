/**
 * Navigation Integrity Tests
 *
 * Verifies that every screen component imported in navigator files
 * actually resolves to an existing file on disk. This catches:
 * - Deleted screens still referenced in navigators
 * - Typos in import paths
 * - Moved/renamed files with stale imports
 */

const fs = require('fs');
const path = require('path');

const NAVIGATOR_DIR = path.join(__dirname, '../../src/navigation');
const SRC_DIR = path.join(__dirname, '../../src');

// All navigator files in the project
const navigatorFiles = fs.readdirSync(NAVIGATOR_DIR)
  .filter(f => f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.ts') || f.endsWith('.tsx'));

/**
 * Given an import path and the directory of the file containing the import,
 * check whether the resolved file exists (trying common extensions).
 */
function importResolves(importPath, fromDir) {
  const resolved = path.resolve(fromDir, importPath);
  const candidates = [
    resolved,
    resolved + '.js',
    resolved + '.jsx',
    resolved + '.ts',
    resolved + '.tsx',
    path.join(resolved, 'index.js'),
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.tsx'),
  ];
  return candidates.some(p => fs.existsSync(p));
}

/**
 * Extract all import paths from a file's contents.
 * Handles:
 *   import Foo from '../screens/FooScreen';
 *   import { Bar } from '../contexts/BarContext';
 */
function extractImports(content) {
  const imports = [];
  // Match both default and named imports
  const regex = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Extract screen component names used in Stack.Screen or Tab.Screen declarations.
 * Handles: component={ScreenName}
 */
function extractScreenComponents(content) {
  const screens = [];
  const regex = /component=\{(\w+)\}/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    screens.push(match[1]);
  }
  return screens;
}

/**
 * Extract the mapping of imported names to their import paths.
 * Returns: { ComponentName: '../relative/path' }
 */
function extractImportMap(content) {
  const map = {};
  // Default imports: import ComponentName from 'path'
  const defaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = defaultRegex.exec(content)) !== null) {
    map[match[1]] = match[2];
  }
  // Named imports: import { Name1, Name2 } from 'path'
  const namedRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = namedRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim());
    for (const name of names) {
      if (name) map[name] = match[2];
    }
  }
  return map;
}

describe('Navigation Integrity', () => {
  test('navigator directory contains expected files', () => {
    expect(navigatorFiles.length).toBeGreaterThan(0);
    // Verify the core navigators exist
    expect(navigatorFiles).toContain('AuthNavigator.js');
    expect(navigatorFiles).toContain('MainNavigator.js');
    expect(navigatorFiles).toContain('OwnerMainNavigator.js');
    expect(navigatorFiles).toContain('WorkerMainNavigator.js');
    expect(navigatorFiles).toContain('BottomTabNavigator.js');
    expect(navigatorFiles).toContain('OwnerBottomTabNavigator.js');
    expect(navigatorFiles).toContain('WorkerBottomTabNavigator.js');
    expect(navigatorFiles).toContain('SettingsNavigator.js');
    expect(navigatorFiles).toContain('OnboardingNavigator.js');
    expect(navigatorFiles).toContain('SupervisorOnboardingNavigator.js');
    expect(navigatorFiles).toContain('WorkerOnboardingNavigator.js');
  });

  describe.each(navigatorFiles)('%s', (file) => {
    const filePath = path.join(NAVIGATOR_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = extractImports(content);
    const relativeImports = imports.filter(imp => imp.startsWith('.') || imp.startsWith('..'));

    test('all relative imports resolve to existing files', () => {
      const missing = [];
      for (const imp of relativeImports) {
        if (!importResolves(imp, NAVIGATOR_DIR)) {
          missing.push(imp);
        }
      }
      if (missing.length > 0) {
        fail(`Missing files for imports:\n  ${missing.join('\n  ')}`);
      }
    });

    test('all screen components have matching imports', () => {
      const screenComponents = extractScreenComponents(content);
      const importMap = extractImportMap(content);

      const unimported = [];
      for (const component of screenComponents) {
        // Skip React Navigation builtins and inline function components
        if (!importMap[component]) {
          // Check if it is defined locally in the file (e.g., ProjectsStack)
          const localDefRegex = new RegExp(`function\\s+${component}\\b|const\\s+${component}\\s*=`);
          if (!localDefRegex.test(content)) {
            unimported.push(component);
          }
        }
      }
      if (unimported.length > 0) {
        fail(`Screen components used but not imported:\n  ${unimported.join('\n  ')}`);
      }
    });

    test('all imported screen files exist on disk', () => {
      const screenComponents = extractScreenComponents(content);
      const importMap = extractImportMap(content);
      const missing = [];

      for (const component of screenComponents) {
        const importPath = importMap[component];
        if (importPath && (importPath.startsWith('.') || importPath.startsWith('..'))) {
          if (!importResolves(importPath, NAVIGATOR_DIR)) {
            missing.push(`${component} -> ${importPath}`);
          }
        }
      }
      if (missing.length > 0) {
        fail(`Screen files not found on disk:\n  ${missing.join('\n  ')}`);
      }
    });
  });

  describe('cross-navigator references', () => {
    test('MainNavigator references BottomTabNavigator which exists', () => {
      const mainContent = fs.readFileSync(path.join(NAVIGATOR_DIR, 'MainNavigator.js'), 'utf-8');
      expect(mainContent).toContain("from './BottomTabNavigator'");
      expect(fs.existsSync(path.join(NAVIGATOR_DIR, 'BottomTabNavigator.js'))).toBe(true);
    });

    test('MainNavigator references SettingsNavigator which exists', () => {
      const mainContent = fs.readFileSync(path.join(NAVIGATOR_DIR, 'MainNavigator.js'), 'utf-8');
      expect(mainContent).toContain("from './SettingsNavigator'");
      expect(fs.existsSync(path.join(NAVIGATOR_DIR, 'SettingsNavigator.js'))).toBe(true);
    });

    test('OwnerMainNavigator references OwnerBottomTabNavigator which exists', () => {
      const ownerContent = fs.readFileSync(path.join(NAVIGATOR_DIR, 'OwnerMainNavigator.js'), 'utf-8');
      expect(ownerContent).toContain("from './OwnerBottomTabNavigator'");
      expect(fs.existsSync(path.join(NAVIGATOR_DIR, 'OwnerBottomTabNavigator.js'))).toBe(true);
    });

    test('WorkerMainNavigator references WorkerBottomTabNavigator which exists', () => {
      const workerContent = fs.readFileSync(path.join(NAVIGATOR_DIR, 'WorkerMainNavigator.js'), 'utf-8');
      expect(workerContent).toContain("from './WorkerBottomTabNavigator'");
      expect(fs.existsSync(path.join(NAVIGATOR_DIR, 'WorkerBottomTabNavigator.js'))).toBe(true);
    });

    test('BottomTabNavigator references SettingsNavigator which exists', () => {
      const tabContent = fs.readFileSync(path.join(NAVIGATOR_DIR, 'BottomTabNavigator.js'), 'utf-8');
      expect(tabContent).toContain("from './SettingsNavigator'");
      expect(fs.existsSync(path.join(NAVIGATOR_DIR, 'SettingsNavigator.js'))).toBe(true);
    });
  });

  describe('screen count sanity checks', () => {
    test('AuthNavigator has expected number of screens', () => {
      const content = fs.readFileSync(path.join(NAVIGATOR_DIR, 'AuthNavigator.js'), 'utf-8');
      const screens = extractScreenComponents(content);
      // Onboarding, PremiumOnboarding, Login, Signup, RoleSelection
      expect(screens.length).toBe(5);
    });

    test('OwnerMainNavigator has a substantial number of screens', () => {
      const content = fs.readFileSync(path.join(NAVIGATOR_DIR, 'OwnerMainNavigator.js'), 'utf-8');
      const screens = extractScreenComponents(content);
      // Owner has 28+ screens (tabs + project + financial + bank + settings + docs)
      expect(screens.length).toBeGreaterThanOrEqual(25);
    });

    test('WorkerBottomTabNavigator has expected tab screens', () => {
      const content = fs.readFileSync(path.join(NAVIGATOR_DIR, 'WorkerBottomTabNavigator.js'), 'utf-8');
      const screens = extractScreenComponents(content);
      // TimeClock, Schedule, Assignments, Reports
      expect(screens.length).toBe(4);
    });

    test('OwnerBottomTabNavigator has expected tab screens', () => {
      const content = fs.readFileSync(path.join(NAVIGATOR_DIR, 'OwnerBottomTabNavigator.js'), 'utf-8');
      const screens = extractScreenComponents(content);
      // Home, Projects, Chat, Workers, Settings
      expect(screens.length).toBe(5);
    });
  });
});
