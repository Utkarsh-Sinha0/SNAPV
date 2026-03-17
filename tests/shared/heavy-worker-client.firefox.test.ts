import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/background/heavy-handler', () => ({
  handleBackgroundHeavyMessage: vi.fn(),
}));

import { sendToHeavyWorker } from '../../src/shared/heavy-worker-client.firefox';
import { handleBackgroundHeavyMessage } from '../../src/background/heavy-handler';

describe('firefox heavy worker client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes requests through the direct background-heavy handler', async () => {
    vi.useFakeTimers();
    vi.mocked(handleBackgroundHeavyMessage).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'firefox-id',
      ok: true,
    });

    const resultPromise = sendToHeavyWorker(
      { type: 'OFFSCREEN_CLEAR_MEMORY', id: 'firefox-id' },
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({
      type: 'OFFSCREEN_RESULT',
      id: 'firefox-id',
      ok: true,
    });
    expect(handleBackgroundHeavyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_CLEAR_MEMORY',
        id: 'firefox-id',
        _target: 'background-heavy',
      }),
    );
  });

  it('throws when the background-heavy response is not ok', async () => {
    vi.useFakeTimers();
    vi.mocked(handleBackgroundHeavyMessage).mockResolvedValue({
      type: 'OFFSCREEN_RESULT',
      id: 'firefox-id',
      ok: false,
      error: 'processor failed',
    });

    const rejection = sendToHeavyWorker({ type: 'OFFSCREEN_CLEAR_MEMORY' }).catch(
      (error) => error,
    );
    await vi.runAllTimersAsync();
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('processor failed');
  });
});
