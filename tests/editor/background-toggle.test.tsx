import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundToggle } from '../../src/editor/components/BackgroundToggle';

describe('BackgroundToggle', () => {
  it('emits the selected background mode', () => {
    const setBackgroundMode = vi.fn();
    render(
      <BackgroundToggle
        mode="transparent"
        setBackgroundMode={setBackgroundMode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Transparent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove shadow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid fill' }));

    expect(setBackgroundMode.mock.calls).toEqual([
      ['transparent'],
      ['remove-shadow'],
      ['solid'],
    ]);
  });
});
