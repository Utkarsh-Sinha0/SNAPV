import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsApp } from '../../src/options/OptionsApp';
import type { OptionsApis } from '../../src/options/options-api';
import type { ExportSpecPreset } from '../../src/shared/types';

const demoPreset: ExportSpecPreset = {
  snapvault_preset: '1.0',
  name: 'Demo preset',
  description: 'Preset for tests',
  spec: {
    format: 'png',
    dimensions: {
      mode: 'preset',
      presetId: 'original',
    },
    dpiPolicy: 'device',
    filenameTemplate: 'snapvault-{date}-{time}.{format}',
  },
};

function createApis(overrides?: Record<string, unknown>) {
  const storageState: Record<string, unknown> = {
    'privacySettings.storeCaptures': false,
    'privacySettings.captureExpiryDays': 7,
    privacySettings: {
      storeCaptures: false,
      captureExpiryDays: 7,
    },
    licenseState: { status: 'pro' },
    'options.presets': [demoPreset],
    'capture:one': { dataUrl: 'data:test' },
    'capture:two': { dataUrl: 'data:test' },
    ...overrides,
  };

  const apis: OptionsApis = {
    runtime: {
      sendMessage: vi.fn(async () => ({ ok: true })),
      getURL: vi.fn((path: string) => `/${path}`),
    },
    storage: {
      get: vi.fn(async (keys?: string | string[] | null | Record<string, unknown>) => {
        if (keys === null || keys === undefined) {
          return { ...storageState };
        }

        if (typeof keys === 'string') {
          return { [keys]: storageState[keys] };
        }

        if (Array.isArray(keys)) {
          return keys.reduce<Record<string, unknown>>((result, key) => {
            result[key] = storageState[key];
            return result;
          }, {});
        }

        return { ...storageState };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageState, items);
      }),
    },
  };

  return { apis, storageState };
}

describe('OptionsApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function waitForInitialLoad() {
    await waitFor(() => expect(screen.getByLabelText('Store recent captures')).toBeTruthy());
  }

  it('writes privacy settings to storage when the toggle and slider change', async () => {
    const { apis } = createApis();
    render(<OptionsApp apis={apis} />);

    await waitForInitialLoad();

    fireEvent.click(screen.getByLabelText('Store recent captures'));
    fireEvent.input(screen.getByLabelText('Capture expiry'), {
      currentTarget: { value: '14' },
      target: { value: '14' },
    });

    await waitFor(() =>
      expect(apis.storage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          privacySettings: {
            storeCaptures: true,
            captureExpiryDays: 14,
          },
          'privacySettings.storeCaptures': true,
          'privacySettings.captureExpiryDays': 14,
        }),
      ),
    );
  });

  it('does not nuke captures when the confirm dialog is rejected', async () => {
    const { apis } = createApis();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<OptionsApp apis={apis} />);

    await waitForInitialLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Nuke everything' }));

    await waitFor(() =>
      expect(globalThis.confirm).toHaveBeenCalledWith(
        'This will delete 2 captures. Continue?',
      ),
    );
    expect(apis.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'NUKE_ALL_CAPTURES' });
  });

  it('nukes captures after a confirmation', async () => {
    const { apis } = createApis();
    render(<OptionsApp apis={apis} />);

    await waitForInitialLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Nuke everything' }));

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith({ type: 'NUKE_ALL_CAPTURES' }),
    );
  });

  it('exports a preset as a json blob and imports a valid preset file', async () => {
    const { apis } = createApis();
    const createObjectURL = vi.fn(() => 'blob:test');
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const previousCreateObjectURL = URL.createObjectURL;
    Object.assign(URL, { createObjectURL });

    render(<OptionsApp apis={apis} />);

    await waitForInitialLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const exportedBlobCall = (createObjectURL.mock.calls as unknown[][])[0];
    expect(exportedBlobCall).toBeTruthy();
    const exportedBlob = exportedBlobCall![0] as unknown as Blob;
    expect(await exportedBlob.text()).toContain('"name": "Demo preset"');
    expect(anchorClick).toHaveBeenCalled();

    const importedPreset: ExportSpecPreset = {
      ...demoPreset,
      name: 'Imported preset',
    };
    const file = new File(
      [JSON.stringify(importedPreset)],
      'preset.json',
      { type: 'application/json' },
    );
    if (!('text' in file)) {
      Object.defineProperty(file, 'text', {
        value: async () => JSON.stringify(importedPreset),
      });
    }

    fireEvent.change(screen.getByLabelText('Import preset file'), {
      currentTarget: { files: [file] },
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText('Imported preset')).toBeTruthy());
    await waitFor(() =>
      expect(apis.storage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'options.presets': expect.arrayContaining([
            expect.objectContaining({ name: 'Imported preset' }),
          ]),
        }),
      ),
    );

    Object.assign(URL, { createObjectURL: previousCreateObjectURL });
  });

  it('shows an error for invalid preset imports and keeps the list length unchanged', async () => {
    const { apis } = createApis();
    render(<OptionsApp apis={apis} />);

    await waitForInitialLoad();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    const invalidFile = new File(['{"snapvault_preset":"2.0"}'], 'bad.json', {
      type: 'application/json',
    });
    if (!('text' in invalidFile)) {
      Object.defineProperty(invalidFile, 'text', {
        value: async () => '{"snapvault_preset":"2.0"}',
      });
    }

    fireEvent.change(screen.getByLabelText('Import preset file'), {
      currentTarget: { files: [invalidFile] },
      target: { files: [invalidFile] },
    });

    await waitFor(() =>
      expect(screen.getByText('Unsupported preset schema version')).toBeTruthy(),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

});
