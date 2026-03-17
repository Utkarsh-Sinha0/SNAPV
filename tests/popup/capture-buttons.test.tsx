import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { CaptureButtons } from '../../src/popup/components/CaptureButtons';

describe('CaptureButtons', () => {
  it('dispatches the correct capture message types', () => {
    const onCapture = vi.fn();
    render(<CaptureButtons onCapture={onCapture} />);

    fireEvent.click(screen.getByRole('button', { name: /capture visible/i }));
    fireEvent.click(screen.getByRole('button', { name: /capture region/i }));
    fireEvent.click(screen.getByRole('button', { name: /capture full page/i }));

    expect(onCapture.mock.calls).toEqual([
      ['CAPTURE_VISIBLE'],
      ['CAPTURE_REGION'],
      ['CAPTURE_FULLPAGE'],
    ]);
  });
});
