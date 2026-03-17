import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportSpecPicker } from '../../src/popup/components/ExportSpecPicker';
import type { ExportSpec } from '../../src/shared/types';

const baseSpec: ExportSpec = {
  format: 'png',
  dimensions: {
    mode: 'preset',
    presetId: 'original',
  },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
};

describe('ExportSpecPicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('fires onChange when the format changes', () => {
    const onChange = vi.fn();
    render(<ExportSpecPicker spec={baseSpec} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Format'), {
      currentTarget: { value: 'jpeg' },
      target: { value: 'jpeg' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'jpeg',
        jpeg: expect.objectContaining({ mode: 'quality' }),
      }),
    );
  });

  it('reveals width and height inputs when manual dimensions are selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ExportSpecPicker spec={baseSpec} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Dimensions'), {
      currentTarget: { value: 'manual' },
      target: { value: 'manual' },
    });

    const manualSpec: ExportSpec = {
      ...baseSpec,
      dimensions: {
        mode: 'manual',
        width: 1280,
        height: 720,
      },
    };

    rerender(<ExportSpecPicker spec={manualSpec} onChange={onChange} />);

    expect(screen.getByLabelText('Width')).toBeTruthy();
    expect(screen.getByLabelText('Height')).toBeTruthy();
  });

  it('shows a pro badge for true 1x exports on the free tier', () => {
    render(
      <ExportSpecPicker
        spec={{ ...baseSpec, dpiPolicy: 'css1x' }}
        licenseState={{ status: 'free' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Pro')).toBeTruthy();
  });

  it('does not show a pro badge for pro users', () => {
    render(
      <ExportSpecPicker
        spec={{ ...baseSpec, dpiPolicy: 'css1x' }}
        licenseState={{ status: 'pro' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Pro')).toBeNull();
  });
});
