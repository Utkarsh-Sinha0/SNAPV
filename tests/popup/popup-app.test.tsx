import { render, screen, waitFor } from '@testing-library/preact';
import { fireEvent } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupApp } from '../../src/popup/PopupApp';
import type { PopupApis } from '../../src/popup/popup-api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function createApis(): PopupApis {
  return {
    runtime: {
      sendMessage: vi.fn(async (message: unknown) => {
        const payload = message as { type?: string };
        if (payload.type === 'CHECK_FEASIBILITY') {
          return {
            ok: true,
            blockingReasons: [],
            warnings: [],
          };
        }

        if (payload.type === 'SYNC_LICENSE') {
          return { status: 'free' };
        }

        return { captureId: 'capture-123' };
      }),
      getURL: vi.fn((path: string) => `chrome-extension://snapvault/${path}`),
    },
    storage: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    },
    tabs: {
      create: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 19 }]),
    },
    scripting: {
      executeScript: vi.fn(async () => [
        {
          result: {
            cssWidth: 1280,
            cssHeight: 720,
            devicePixelRatio: 2,
            screenLeft: 0,
            screenTop: 0,
          },
        },
      ]),
    },
  };
}

describe('PopupApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends CHECK_FEASIBILITY after mount without blocking the initial render', async () => {
    const apis = createApis();
    const feasibility = deferred<{
      ok: boolean;
      blockingReasons: string[];
      warnings: string[];
    }>();

    vi.mocked(apis.runtime.sendMessage).mockImplementation(
      async (message: unknown) => {
        const payload = message as { type?: string };
        if (payload.type === 'CHECK_FEASIBILITY') {
          return feasibility.promise;
        }

        if (payload.type === 'SYNC_LICENSE') {
          return { status: 'free' };
        }

        return { captureId: 'capture-123' };
      },
    );

    render(<PopupApp apis={apis} />);

    expect(screen.getByRole('button', { name: /capture visible/i })).toBeTruthy();

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CHECK_FEASIBILITY',
        }),
      ),
    );

    feasibility.resolve({
      ok: true,
      blockingReasons: [],
      warnings: [],
    });

    await waitFor(() =>
      expect(apis.storage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'popup.exportSpec': expect.any(Object),
        }),
      ),
    );
  });

  it('syncs the license on first popup open', async () => {
    const apis = createApis();

    render(<PopupApp apis={apis} />);

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SYNC_LICENSE',
        }),
      ),
    );
  });

  it('skips the sync when the last sync happened less than a day ago', async () => {
    const apis = createApis();
    vi.mocked(apis.storage.get).mockImplementation(
      async (keys?: string | string[] | null | Record<string, unknown>) => {
        if (keys === 'lastSyncedAt') {
          return {
            lastSyncedAt: Date.now() - 60 * 60 * 1000,
          };
        }

        return {};
      },
    );

    render(<PopupApp apis={apis} />);

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CHECK_FEASIBILITY',
        }),
      ),
    );

    expect(apis.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SYNC_LICENSE',
      }),
    );
  });

  it('starts interactive region capture and shows the selection message', async () => {
    const apis = createApis();
    vi.mocked(apis.runtime.sendMessage).mockImplementation(
      async (message: unknown) => {
        const payload = message as { type?: string };
        if (payload.type === 'CHECK_FEASIBILITY') {
          return {
            ok: true,
            blockingReasons: [],
            warnings: [],
          };
        }

        if (payload.type === 'SYNC_LICENSE') {
          return { status: 'free' };
        }

        if (payload.type === 'CAPTURE_REGION') {
          return { pending: true };
        }

        return { captureId: 'capture-123' };
      },
    );

    render(<PopupApp apis={apis} />);

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CHECK_FEASIBILITY',
        }),
      ),
    );

    const regionButtons = screen.getAllByRole('button', { name: /capture region/i });
    fireEvent.click(regionButtons[regionButtons.length - 1]!);

    await waitFor(() =>
      expect(apis.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CAPTURE_REGION',
          tabId: 19,
          spec: expect.any(Object),
        }),
      ),
    );

    expect(screen.getByText(/select a region on the page/i)).toBeTruthy();
  });
});
