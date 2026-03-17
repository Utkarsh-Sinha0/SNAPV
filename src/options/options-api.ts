import { DEFAULT_PRESETS, validateExportSpecPreset } from '../shared/export-spec';
import type { ExportSpecPreset, LicenseState } from '../shared/types';

export type PrivacySettingsState = {
  storeCaptures: boolean;
  captureExpiryDays: number;
};

type RuntimeLike = {
  sendMessage: (message: unknown) => Promise<unknown>;
  getURL: (path: string) => string;
};

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

export type OptionsApis = {
  runtime: RuntimeLike;
  storage: StorageAreaLike;
};

const PRESET_STORAGE_KEY = 'options.presets';

function getChromeApis(): OptionsApis {
  const chromeLike = (globalThis as unknown as {
    chrome: {
      runtime: RuntimeLike;
      storage: { local: StorageAreaLike };
    };
  }).chrome;

  return {
    runtime: chromeLike.runtime,
    storage: chromeLike.storage.local,
  };
}

export function getOptionsApis(): OptionsApis {
  return getChromeApis();
}

export async function loadPrivacySettings(
  apis: OptionsApis = getChromeApis(),
): Promise<PrivacySettingsState> {
  const stored = await apis.storage.get([
    'privacySettings.storeCaptures',
    'privacySettings.captureExpiryDays',
    'privacySettings',
  ]);
  const nested = stored.privacySettings as Partial<PrivacySettingsState> | undefined;

  return {
    storeCaptures:
      (stored['privacySettings.storeCaptures'] as boolean | undefined) ??
      nested?.storeCaptures ??
      false,
    captureExpiryDays:
      (stored['privacySettings.captureExpiryDays'] as number | undefined) ??
      nested?.captureExpiryDays ??
      7,
  };
}

export async function savePrivacySettings(
  settings: PrivacySettingsState,
  apis: OptionsApis = getChromeApis(),
): Promise<void> {
  await apis.storage.set({
    privacySettings: settings,
    'privacySettings.storeCaptures': settings.storeCaptures,
    'privacySettings.captureExpiryDays': settings.captureExpiryDays,
  });
}

export async function countStoredCaptures(
  apis: OptionsApis = getChromeApis(),
): Promise<number> {
  const stored = await apis.storage.get(null);
  return Object.keys(stored).filter((key) => key.startsWith('capture:')).length;
}

export async function nukeAllCaptures(
  apis: OptionsApis = getChromeApis(),
): Promise<void> {
  await apis.runtime.sendMessage({
    type: 'NUKE_ALL_CAPTURES',
  });
}

export async function loadPresets(
  apis: OptionsApis = getChromeApis(),
): Promise<ExportSpecPreset[]> {
  const stored = await apis.storage.get(PRESET_STORAGE_KEY);
  const rawPresets = stored[PRESET_STORAGE_KEY];

  if (!Array.isArray(rawPresets)) {
    return [...DEFAULT_PRESETS];
  }

  return rawPresets.map((preset) => validateExportSpecPreset(preset));
}

export async function savePresets(
  presets: ExportSpecPreset[],
  apis: OptionsApis = getChromeApis(),
): Promise<void> {
  await apis.storage.set({
    [PRESET_STORAGE_KEY]: presets,
  });
}

export async function loadLicenseState(
  apis: OptionsApis = getChromeApis(),
): Promise<LicenseState> {
  const stored = await apis.storage.get('licenseState');
  return (stored.licenseState as LicenseState | undefined) ?? { status: 'free' };
}

export async function exportPresetAsBlob(preset: ExportSpecPreset): Promise<Blob> {
  return new Blob([JSON.stringify(preset, null, 2)], {
    type: 'application/json',
  });
}

export async function importPresetFile(file: File): Promise<ExportSpecPreset> {
  const raw = JSON.parse(await file.text()) as unknown;
  return validateExportSpecPreset(raw);
}

export function getSponsorFrameSrc(apis: OptionsApis = getChromeApis()): string {
  return apis.runtime.getURL('ads_sandbox.html');
}
