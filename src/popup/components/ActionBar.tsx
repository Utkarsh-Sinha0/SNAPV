import type { PopupActionCommand } from '../popup-api';

type ActionBarProps = {
  busy: boolean;
  onAction: (command: PopupActionCommand) => void;
};

const ACTIONS: Array<{ command: PopupActionCommand; label: string }> = [
  { command: 'EXPORT_CLIPBOARD', label: 'Copy' },
  { command: 'EXPORT_DOWNLOAD', label: 'Download' },
  { command: 'OPEN_EDITOR', label: 'Open Editor' },
  { command: 'RECAPTURE', label: 'Re-capture' },
];

export function ActionBar({ busy, onAction }: ActionBarProps) {
  return (
    <section className="panel compact-panel">
      <div className="section-header">
        <p className="eyebrow">Actions</p>
        <h2>Finish the export</h2>
      </div>
      <div className="action-row">
        {ACTIONS.map((action) => (
          <button
            key={action.command}
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => onAction(action.command)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
