import { afterEach, describe, expect, it, vi } from 'vitest';
import { androidBridge, saveKeyOnThisPhone } from './android-bridge';

type Win = { FinanceAndroid?: unknown };

describe('androidBridge', () => {
  afterEach(() => {
    delete (window as unknown as Win).FinanceAndroid;
  });

  it('is null in a normal browser', () => {
    expect(androidBridge()).toBeNull();
    expect(saveKeyOnThisPhone('fad_test_example')).toBe(false);
  });

  it('is null when the object is missing a method', () => {
    (window as unknown as Win).FinanceAndroid = { openPhoneSetup: vi.fn() };
    expect(androidBridge()).toBeNull();
    (window as unknown as Win).FinanceAndroid = { saveDeviceKey: vi.fn() };
    expect(androidBridge()).toBeNull();
  });

  it('reports a failed save when the phone throws', () => {
    (window as unknown as Win).FinanceAndroid = {
      saveDeviceKey: () => {
        throw new Error('boom');
      },
      openPhoneSetup: vi.fn(),
    };
    expect(saveKeyOnThisPhone('fad_test_example')).toBe(false);
  });
});
