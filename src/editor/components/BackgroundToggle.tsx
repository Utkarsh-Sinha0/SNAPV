import type { BackgroundMode } from '../../shared/background-mode';

type BackgroundToggleProps = {
  mode: BackgroundMode;
  setBackgroundMode: (mode: BackgroundMode) => void;
};

const OPTIONS: Array<{ mode: BackgroundMode; label: string }> = [
  { mode: 'transparent', label: 'Transparent' },
  { mode: 'remove-shadow', label: 'Remove shadow' },
  { mode: 'solid', label: 'Solid fill' },
];

export function BackgroundToggle({
  mode,
  setBackgroundMode,
}: BackgroundToggleProps) {
  return (
    <section className="editor-panel">
      <div className="section-header">
        <p className="eyebrow">Isolation</p>
        <h2>Background mode</h2>
      </div>
      <div className="toolbar-row" role="toolbar" aria-label="Background modes">
        {OPTIONS.map((option) => {
          const selected = option.mode === mode;

          return (
            <button
              key={option.mode}
              type="button"
              className={selected ? 'tool-button active' : 'tool-button'}
              aria-pressed={selected}
              onClick={() => setBackgroundMode(option.mode)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
