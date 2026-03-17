import { useRef, useState } from 'preact/hooks';
import type { ExportSpecPreset } from '../../shared/types';

type PresetManagerProps = {
  presets: ExportSpecPreset[];
  onExport: (preset: ExportSpecPreset) => Promise<void>;
  onImport: (file: File) => Promise<void>;
};

export function PresetManager({
  presets,
  onExport,
  onImport,
}: PresetManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      setErrorMessage(null);
      await onImport(file);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to import the preset.',
      );
    } finally {
      input.value = '';
    }
  }

  return (
    <section className="options-panel">
      <div className="section-header">
        <p className="eyebrow">Presets</p>
        <h2>Export and import workflow defaults</h2>
      </div>

      <div className="preset-actions">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileInputRef}
          aria-label="Import preset file"
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
        />
      </div>

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      <ul className="preset-list">
        {presets.map((preset) => (
          <li key={preset.name} className="preset-card">
            <div>
              <p className="preset-name">{preset.name}</p>
              <p className="helper-copy">
                {preset.description ?? 'Community preset'}
              </p>
            </div>
            <button type="button" onClick={() => void onExport(preset)}>
              Export
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
