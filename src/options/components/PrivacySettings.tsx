import type { PrivacySettingsState } from '../options-api';

type PrivacySettingsProps = {
  captureCount: number;
  settings: PrivacySettingsState;
  onChange: (settings: PrivacySettingsState) => void;
  onNuke: () => void;
};

export function PrivacySettings({
  captureCount,
  settings,
  onChange,
  onNuke,
}: PrivacySettingsProps) {
  return (
    <section className="options-panel">
      <div className="section-header">
        <p className="eyebrow">Privacy</p>
        <h2>Control local storage</h2>
      </div>

      <label className="field field-inline">
        <span>Store recent captures</span>
        <input
          aria-label="Store recent captures"
          type="checkbox"
          checked={settings.storeCaptures}
          onChange={(event) =>
            onChange({
              ...settings,
              storeCaptures: event.currentTarget.checked,
            })
          }
        />
      </label>

      <label className="field">
        <span>Capture expiry: {settings.captureExpiryDays} day(s)</span>
        <input
          aria-label="Capture expiry"
          type="range"
          min="1"
          max="30"
          value={settings.captureExpiryDays}
          onInput={(event) =>
            onChange({
              ...settings,
              captureExpiryDays: Number(event.currentTarget.value),
            })
          }
        />
      </label>

      <button type="button" className="danger-button" onClick={onNuke}>
        Nuke everything
      </button>
      <p className="helper-copy">{captureCount} stored capture(s) will be removed.</p>
    </section>
  );
}
