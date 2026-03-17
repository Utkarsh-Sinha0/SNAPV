import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../../src/popup/components/ActionBar';

describe('ActionBar', () => {
  it('dispatches the correct action commands', () => {
    const onAction = vi.fn();
    render(<ActionBar busy={false} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-capture' }));

    expect(onAction.mock.calls).toEqual([
      ['EXPORT_CLIPBOARD'],
      ['EXPORT_DOWNLOAD'],
      ['OPEN_EDITOR'],
      ['RECAPTURE'],
    ]);
  });
});
