import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { FeasibilityBanner } from '../../src/popup/components/FeasibilityBanner';

describe('FeasibilityBanner', () => {
  it('renders nothing for a clean feasibility result', () => {
    const { container } = render(
      <FeasibilityBanner
        result={{
          ok: true,
          blockingReasons: [],
          warnings: [],
        }}
      />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders blocking reasons in an alert', () => {
    render(
      <FeasibilityBanner
        result={{
          ok: false,
          blockingReasons: ['Estimated file too large'],
          warnings: [],
        }}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Estimated file too large');
  });

  it('renders warnings and the hi-dpi banner when present', () => {
    render(
      <FeasibilityBanner
        result={{
          ok: true,
          blockingReasons: [],
          warnings: ['PDF export may exceed a single A4 page height'],
          hiDpiWarning: true,
        }}
      />,
    );

    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/pdf export may exceed/i)).toBeTruthy();
    expect(screen.getByText(/hidpi capture detected/i)).toBeTruthy();
  });
});
