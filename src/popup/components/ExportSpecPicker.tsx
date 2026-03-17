import type { ExportSpec, LicenseState } from '../../shared/types';

type ExportSpecPickerProps = {
  spec: ExportSpec;
  licenseState?: LicenseState | null;
  onChange: (nextSpec: ExportSpec) => void;
};

const PRESET_OPTIONS = [
  { value: 'original', label: 'Original size' },
  { value: '1080p', label: '1080p' },
  { value: 'a4', label: 'A4' },
  { value: 'social', label: 'Social square' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'manual', label: 'Manual' },
] as const;

function coercePositive(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function ExportSpecPicker({
  spec,
  licenseState = null,
  onChange,
}: ExportSpecPickerProps) {
  const selectedPreset =
    spec.dimensions.mode === 'manual' ? 'manual' : spec.dimensions.presetId ?? 'original';
  const showProBadge = spec.dpiPolicy === 'css1x' && licenseState?.status !== 'pro';

  return (
    <section className="panel">
      <div className="section-header">
        <p className="eyebrow">Export</p>
        <h2>Shape the file</h2>
      </div>

      <label className="field">
        <span>Format</span>
        <select
          aria-label="Format"
          value={spec.format}
          onChange={(event) => {
            const format = event.currentTarget.value as ExportSpec['format'];
            onChange({
              ...spec,
              format,
              ...(format === 'jpeg'
                ? {
                    jpeg: spec.jpeg ?? {
                      mode: 'quality',
                      quality: 92,
                    },
                  }
                : {}),
            });
          }}
        >
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="pdf">PDF</option>
        </select>
      </label>

      <label className="field">
        <span>Dimensions</span>
        <select
          aria-label="Dimensions"
          value={selectedPreset}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue === 'manual') {
              onChange({
                ...spec,
                dimensions: {
                  mode: 'manual',
                  width: spec.dimensions.width ?? 1280,
                  height: spec.dimensions.height ?? 720,
                },
              });
              return;
            }

            onChange({
              ...spec,
              dimensions: {
                mode: 'preset',
                presetId: nextValue,
              },
            });
          }}
        >
          {PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {spec.dimensions.mode === 'manual' ? (
        <div className="inline-fields">
          <label className="field">
            <span>Width</span>
            <input
              aria-label="Width"
              type="number"
              min="1"
              value={spec.dimensions.width ?? 1280}
              onInput={(event) =>
                onChange({
                  ...spec,
                  dimensions: {
                    mode: 'manual',
                    width: coercePositive(event.currentTarget.value, 1280),
                    height: spec.dimensions.height ?? 720,
                  },
                })
              }
            />
          </label>
          <label className="field">
            <span>Height</span>
            <input
              aria-label="Height"
              type="number"
              min="1"
              value={spec.dimensions.height ?? 720}
              onInput={(event) =>
                onChange({
                  ...spec,
                  dimensions: {
                    mode: 'manual',
                    width: spec.dimensions.width ?? 1280,
                    height: coercePositive(event.currentTarget.value, 720),
                  },
                })
              }
            />
          </label>
        </div>
      ) : null}

      <label className="field">
        <span className="field-label">
          <span>DPI policy</span>
          {showProBadge ? (
            <span
              className="pro-badge"
              title="True 1x CSS pixel normalization is available on Pro exports."
            >
              Pro
            </span>
          ) : null}
        </span>
        <select
          aria-label="DPI policy"
          value={spec.dpiPolicy}
          onChange={(event) =>
            onChange({
              ...spec,
              dpiPolicy: event.currentTarget.value as ExportSpec['dpiPolicy'],
            })
          }
        >
          <option value="device">Device pixels</option>
          <option value="css1x">True 1x CSS pixels</option>
        </select>
      </label>

      {spec.format === 'jpeg' ? (
        <>
          <label className="field">
            <span>JPEG mode</span>
            <select
              aria-label="JPEG mode"
              value={spec.jpeg?.mode ?? 'quality'}
              onChange={(event) => {
                const mode = event.currentTarget.value as 'quality' | 'targetSize';
                onChange({
                  ...spec,
                  jpeg:
                    mode === 'quality'
                      ? {
                          mode,
                          quality: 92,
                        }
                      : {
                          mode,
                          targetBytes: 250_000,
                          toleranceBytes: 15_000,
                        },
                });
              }}
            >
              <option value="quality">Quality</option>
              <option value="targetSize">Target size</option>
            </select>
          </label>
          {spec.jpeg?.mode === 'targetSize' ? (
            <div className="inline-fields">
              <label className="field">
                <span>Target bytes</span>
                <input
                  aria-label="Target bytes"
                  type="number"
                  min="1"
                  value={spec.jpeg.targetBytes ?? 250_000}
                  onInput={(event) =>
                    onChange({
                      ...spec,
                      jpeg: {
                        mode: 'targetSize',
                        targetBytes: coercePositive(event.currentTarget.value, 250_000),
                        toleranceBytes: spec.jpeg?.toleranceBytes ?? 15_000,
                      },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Tolerance</span>
                <input
                  aria-label="Tolerance"
                  type="number"
                  min="0"
                  value={spec.jpeg.toleranceBytes ?? 15_000}
                  onInput={(event) =>
                    onChange({
                      ...spec,
                      jpeg: {
                        mode: 'targetSize',
                        targetBytes: spec.jpeg?.targetBytes ?? 250_000,
                        toleranceBytes: coercePositive(event.currentTarget.value, 15_000),
                      },
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <label className="field">
              <span>JPEG quality</span>
              <input
                aria-label="JPEG quality"
                type="range"
                min="1"
                max="100"
                value={spec.jpeg?.quality ?? 92}
                onInput={(event) =>
                  onChange({
                    ...spec,
                    jpeg: {
                      mode: 'quality',
                      quality: coercePositive(event.currentTarget.value, 92),
                    },
                  })
                }
              />
            </label>
          )}
        </>
      ) : null}
    </section>
  );
}
