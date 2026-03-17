import { render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportReceipt } from '../../src/popup/components/ExportReceipt';

describe('ExportReceipt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the filename and auto-dismisses after 3 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<ExportReceipt filename="snapvault-export.png" onDismiss={onDismiss} />);

    expect(screen.getByText('snapvault-export.png')).toBeTruthy();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
