import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationToolbar } from '../../src/editor/components/AnnotationToolbar';

describe('AnnotationToolbar', () => {
  afterEach(() => {
    cleanup();
  });

  it('activates blur when the Blur button is clicked', () => {
    const setActiveTool = vi.fn();
    render(<AnnotationToolbar activeTool="arrow" setActiveTool={setActiveTool} />);

    fireEvent.click(screen.getByRole('button', { name: 'Blur' }));

    expect(setActiveTool).toHaveBeenCalledWith('blur');
  });
});
