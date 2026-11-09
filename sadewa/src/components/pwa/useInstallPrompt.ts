'use client';

import { useCallback, useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const K_DISMISS = 'sadewa-pwa-dismissed';
const K_INSTALLED = 'sadewa-pwa-installed';

let savedPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    savedPrompt = event as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useInstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(savedPrompt !== null);
  const [installed, setInstalled] = useState(
    () => isStandalone() || readKey(K_INSTALLED) === '1',
  );
  const [dismissed, setDismissed] = useState(() => readKey(K_DISMISS) === '1');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCanPrompt(savedPrompt !== null);
      if (isStandalone()) {
        setInstalled(true);
        writeKey(K_INSTALLED, '1');
      }
    };
    listeners.add(sync);
    const onInstalled = () => {
      savedPrompt = null;
      setCanPrompt(false);
      setInstalled(true);
      writeKey(K_INSTALLED, '1');
      removeKey(K_DISMISS);
    };
    window.addEventListener('appinstalled', onInstalled);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMq = () => {
      if (mq?.matches) onInstalled();
    };
    mq?.addEventListener?.('change', onMq);
    const t = setTimeout(sync, 1200);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onMq);
      clearTimeout(t);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const ev = savedPrompt;
    if (!ev || installing) return false;
    setInstalling(true);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        writeKey(K_INSTALLED, '1');
      }
      savedPrompt = null;
      setCanPrompt(false);
      return choice.outcome === 'accepted';
    } finally {
      setInstalling(false);
    }
  }, [installing]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeKey(K_DISMISS, '1');
  }, []);

  const isiOS =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !isStandalone();

  return {
    canPrompt,
    isiOS,
    installed,
    /** Banner/notif: hanya jika belum terinstal, belum ditutup, dan bisa dipasang/manual iOS. */
    showBanner: !dismissed && !installed && (canPrompt || isiOS),
    /** Opsi di pengaturan: tampil jika belum terinstal (abaikan status dismiss banner). */
    showSettingsInstall: !installed && (canPrompt || isiOS),
    installing,
    install,
    dismiss,
  };
}
