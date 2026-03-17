import type { PopupCaptureCommand } from '../popup-api';

type CaptureButtonsProps = {
  busyCommand?: PopupCaptureCommand | null;
  onCapture: (command: PopupCaptureCommand) => void;
};

const CAPTURE_OPTIONS: Array<{ command: PopupCaptureCommand; label: string }> = [
  { command: 'CAPTURE_VISIBLE', label: 'Capture Visible' },
  { command: 'CAPTURE_REGION', label: 'Capture Region' },
  { command: 'CAPTURE_FULLPAGE', label: 'Capture Full Page' },
];

export function CaptureButtons({
  busyCommand = null,
  onCapture,
}: CaptureButtonsProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <p className="eyebrow">Capture</p>
        <h2>Grab what matters</h2>
      </div>
      <div className="button-grid">
        {CAPTURE_OPTIONS.map((option) => (
          <button
            key={option.command}
            className="ghost-button"
            type="button"
            disabled={busyCommand !== null}
            onClick={() => onCapture(option.command)}
          >
            <span>{option.label}</span>
            <small>{busyCommand === option.command ? 'Working...' : 'Ready'}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
