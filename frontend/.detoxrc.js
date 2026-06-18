/** Detox config — iOS simulator E2E for Sylk.
 * The app must be (re)generated with the Detox config plugin and built with
 * Detox linked: `npx expo prebuild -p ios` (with @config-plugins/detox in
 * app.json plugins) -> `cd ios && pod install` -> `detox build -c ios.sim.debug`.
 * The build command assumes the Stripe NSUInteger patch is applied in
 * node_modules (see project_sylk_simulator_test_harness memory) and no signing.
 */
module.exports = {
  testRunner: {
    args: { '$0': 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 180000 },
  },
  apps: {
    // Release build bundles the JS (no Metro / no Expo dev launcher) -> a
    // self-contained, deterministic binary for Detox/CI.
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/Sylk.app',
      build:
        "SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace ios/Sylk.xcworkspace -scheme Sylk -configuration Release -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO -quiet",
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 17 Pro' },
    },
  },
  configurations: {
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
  },
};
