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
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Sylk.app',
      build:
        "xcodebuild -workspace ios/Sylk.xcworkspace -scheme Sylk -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO -quiet",
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 17 Pro' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
  },
};
