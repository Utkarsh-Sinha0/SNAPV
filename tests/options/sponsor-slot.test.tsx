import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { SponsorSlot } from '../../src/options/components/SponsorSlot';

describe('SponsorSlot', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the iframe for free licenses', () => {
    render(
      <SponsorSlot
        licenseState={{ status: 'free' }}
        src="about:blank"
      />,
    );

    const frame = screen.getByTitle('Sponsor slot') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
  });

  it('hides the iframe for pro licenses', () => {
    render(
      <SponsorSlot
        licenseState={{ status: 'pro' }}
        src="about:blank"
      />,
    );

    expect(screen.queryByTitle('Sponsor slot')).toBeNull();
  });
});
