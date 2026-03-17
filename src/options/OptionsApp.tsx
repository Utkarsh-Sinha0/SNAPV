import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ExportSpecPreset, LicenseState } from '../shared/types';
import {
  countStoredCaptures,
  exportPresetAsBlob,
  getOptionsApis,
  getSponsorFrameSrc,
  importPresetFile,
  loadLicenseState,
  loadPresets,
  loadPrivacySettings,
  nukeAllCaptures,
  savePresets,
  savePrivacySettings,
  type OptionsApis,
  type PrivacySettingsState,
} from './options-api';
import { PresetManager } from './components/PresetManager';
import { PrivacySettings } from './components/PrivacySettings';
import { SponsorSlot } from './components/SponsorSlot';

type OptionsAppProps = {
  apis?: OptionsApis;
};

const DEFAULT_PRIVACY_SETTINGS: PrivacySettingsState = {
  storeCaptures: false,
  captureExpiryDays: 7,
};

export function OptionsApp({ apis }: OptionsAppProps) {
  const optionsApis = useMemo(() => apis ?? getOptionsApis(), [apis]);
  const [privacySettings, setPrivacySettings] =
    useState<PrivacySettingsState>(DEFAULT_PRIVACY_SETTINGS);
  const [captureCount, setCaptureCount] = useState(0);
  const [presets, setPresets] = useState<ExportSpecPreset[]>([]);
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [loadedPrivacy, loadedPresets, loadedLicense, loadedCaptureCount] =
          await Promise.all([
            loadPrivacySettings(optionsApis),
            loadPresets(optionsApis),
            loadLicenseState(optionsApis),
            countStoredCaptures(optionsApis),
          ]);

        if (cancelled) {
          return;
        }

        setPrivacySettings(loadedPrivacy);
        setPresets(loadedPresets);
        setLicenseState(loadedLicense);
        setCaptureCount(loadedCaptureCount);
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : 'Failed to load options.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [optionsApis]);

  async function handlePrivacyChange(nextSettings: PrivacySettingsState) {
    setPrivacySettings(nextSettings);
    await savePrivacySettings(nextSettings, optionsApis);
  }

  async function handleNuke() {
    const confirmed = window.confirm(
      `This will delete ${captureCount} captures. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    await nukeAllCaptures(optionsApis);
    setCaptureCount(0);
    setStatusMessage('All stored captures were deleted.');
  }

  async function handleExportPreset(preset: ExportSpecPreset) {
    const blob = await exportPresetAsBlob(preset);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${preset.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    anchor.click();
  }

  async function handleImportPreset(file: File) {
    const preset = await importPresetFile(file);
    const nextPresets = [...presets, preset];
    setPresets(nextPresets);
    await savePresets(nextPresets, optionsApis);
    setStatusMessage(`Imported preset ${preset.name}.`);
  }

  return (
    <main className="options-shell">
      <section className="options-hero">
        <div>
          <p className="eyebrow">SnapVault Options</p>
          <h1>Shape privacy, presets, and what the free tier shows.</h1>
        </div>
        {statusMessage ? <p className="status-copy">{statusMessage}</p> : null}
      </section>

      <PrivacySettings
        captureCount={captureCount}
        settings={privacySettings}
        onChange={(settings) => void handlePrivacyChange(settings)}
        onNuke={() => void handleNuke()}
      />

      <PresetManager
        presets={presets}
        onExport={handleExportPreset}
        onImport={handleImportPreset}
      />

      {licenseState ? (
        <SponsorSlot
          licenseState={licenseState}
          src={getSponsorFrameSrc(optionsApis)}
        />
      ) : null}
    </main>
  );
}
