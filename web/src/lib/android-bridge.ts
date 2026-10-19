import { useSyncExternalStore } from 'react';

/**
 * The Masroof Android app shows this web app full screen and adds a small
 * `window.FinanceAndroid` object (only on pages from its own server). With it
 * the web app can hand a new device key straight to the phone, which stores
 * it encrypted, so the key never has to be copied by hand.
 */
export interface FinanceAndroidBridge {
  isApp(): boolean;
  hasDeviceKey(): boolean;
  /** True when the phone saved the key. */
  saveDeviceKey(key: string): boolean;
  openPhoneSetup(): void;
}

export function androidBridge(): FinanceAndroidBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { FinanceAndroid?: Partial<FinanceAndroidBridge> }).FinanceAndroid;
  if (!bridge || typeof bridge.saveDeviceKey !== 'function' || typeof bridge.openPhoneSetup !== 'function') return null;
  return bridge as FinanceAndroidBridge;
}

/** Hands the key to the phone. Never throws; the key is not kept anywhere else. */
export function saveKeyOnThisPhone(key: string): boolean {
  const bridge = androidBridge();
  if (!bridge) return false;
  try {
    return bridge.saveDeviceKey(key) === true;
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

/** True inside the Masroof Android app. False while rendering on the server, so hydration matches. */
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(noSubscribe, () => androidBridge() !== null, () => false);
}
