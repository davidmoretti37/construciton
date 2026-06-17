import { registerRootComponent } from 'expo';

// Pure-JS base64 polyfill — React Native (Hermes/JSC) has no global btoa/atob,
// which breaks Twilio Basic auth (TwilioSetupScreen, communication.js, conversationService.js).
// Installed before App so every call site is covered without per-file edits.
if (typeof global.btoa === 'undefined') {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  global.btoa = (input) => {
    const str = String(input);
    let output = '';
    for (
      let block = 0, charCode, i = 0, map = B64;
      str.charAt(i | 0) || ((map = '='), i % 1);
      output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
      charCode = str.charCodeAt((i += 3 / 4));
      if (charCode > 0xff) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = (block << 8) | charCode;
    }
    return output;
  };
}

if (typeof global.atob === 'undefined') {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  global.atob = (input) => {
    const str = String(input).replace(/=+$/, '');
    if (str.length % 4 === 1) {
      throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    let output = '';
    for (
      let bc = 0, bs = 0, buffer, i = 0;
      (buffer = str.charAt(i++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = B64.indexOf(buffer);
    }
    return output;
  };
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
