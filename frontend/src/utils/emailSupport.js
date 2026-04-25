// Email-app chooser. Tapping "Help & Support" in Settings used to open
// `mailto:` directly, which on iOS sometimes silently fails (no Mail
// account configured) and on Android skips the Gmail-default-app
// experience users expect. This presents a clean action sheet with the
// installed email apps + a "Copy address" fallback so users on every
// device can reach support without guessing.

import { Platform, ActionSheetIOS, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Each entry: app deep-link probe + an open() that returns the URL to
// hand to Linking. `webFallback` is used when the native app isn't
// installed but a web compose flow exists.
const EMAIL_APPS = [
  {
    id: 'mail',
    label: 'Mail (default)',
    probe: () => 'mailto:test@example.com',
    open: (email) => `mailto:${email}`,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    probe: () => 'googlegmail://',
    open: (email) => `googlegmail://co?to=${encodeURIComponent(email)}`,
    webFallback: (email) =>
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`,
  },
  {
    id: 'outlook',
    label: 'Outlook',
    probe: () => 'ms-outlook://',
    open: (email) => `ms-outlook://compose?to=${encodeURIComponent(email)}`,
  },
];

async function discoverApps() {
  const found = [];
  for (const app of EMAIL_APPS) {
    try {
      const ok = await Linking.canOpenURL(app.probe());
      if (ok) {
        found.push({ ...app, kind: 'app' });
      } else if (app.webFallback) {
        // Native app not installed but the web flow exists — keep the
        // option using the fallback URL so Gmail-on-the-web still works.
        found.push({ ...app, kind: 'web' });
      }
    } catch (_) {
      // canOpenURL can throw on Android when the package isn't in the
      // <queries> manifest. Treat that as "unknown" — for `mail` we keep
      // it because mailto is universally supported; for the others we
      // skip unless a web fallback exists.
      if (app.id === 'mail') {
        found.push({ ...app, kind: 'app' });
      } else if (app.webFallback) {
        found.push({ ...app, kind: 'web' });
      }
    }
  }
  return found;
}

async function openApp(app, email) {
  const url = app.kind === 'web' && app.webFallback
    ? app.webFallback(email)
    : app.open(email);
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Could not open', `Couldn't launch ${app.label}.`);
  }
}

async function copyAddress(email) {
  try {
    await Clipboard.setStringAsync(email);
    Alert.alert('Copied', `${email} copied to clipboard.`);
  } catch (_) {
    Alert.alert('Copy failed', email);
  }
}

/**
 * Show an OS-appropriate chooser of email apps. iOS uses ActionSheetIOS
 * for the native bottom sheet; Android uses Alert with stacked buttons.
 */
export async function chooseEmailApp(email) {
  const apps = await discoverApps();

  // Always include "Copy address" as a last-resort fallback so users on
  // devices without any email client can still get the address.
  const labels = apps.map((a) => a.label).concat(['Copy address']);

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Email support',
        message: email,
        options: [...labels, 'Cancel'],
        cancelButtonIndex: labels.length, // Cancel is the last button
      },
      async (idx) => {
        if (idx < apps.length) {
          await openApp(apps[idx], email);
        } else if (idx === apps.length) {
          await copyAddress(email);
        }
        // idx === labels.length → Cancel; do nothing
      }
    );
    return;
  }

  // Android: Alert.alert renders stacked buttons; works well with 3-5
  // options. Cancel goes first so it's at the top of the stack.
  const buttons = [
    { text: 'Cancel', style: 'cancel' },
    ...apps.map((a) => ({ text: a.label, onPress: () => openApp(a, email) })),
    { text: 'Copy address', onPress: () => copyAddress(email) },
  ];
  Alert.alert('Email support', email, buttons);
}
