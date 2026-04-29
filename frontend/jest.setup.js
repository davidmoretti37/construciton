// Define React Native globals
global.__DEV__ = true;

// Silence console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// @sentry/react-native ships ES modules that babel-jest skips by default
// (transformIgnorePatterns excludes node_modules). Tests don't need real
// Sentry — mock the surface our code uses.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((cb) => cb({ setTag: jest.fn(), setContext: jest.fn(), setExtra: jest.fn() })),
  ReactNavigationInstrumentation: jest.fn(),
  ReactNativeTracing: jest.fn(),
  wrap: (component) => component,
}));
