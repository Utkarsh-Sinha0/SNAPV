import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapSponsorCard,
  normalizeSponsorPayload,
} from '../../src/ads_sandbox/sponsor-card';

describe('sponsor-card', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <article class="sponsor-card" data-hidden="true">
        <h1 class="sponsor-name"></h1>
        <p class="sponsor-tagline"></p>
        <a class="sponsor-cta"></a>
      </article>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('normalizes the flat sponsor.json format', () => {
    expect(
      normalizeSponsorPayload({
        name: 'Acme Dev Tools',
        tagline: 'Automate your workflow.',
        ctaLabel: 'Try free',
        ctaUrl: 'https://acme.example.com',
      }),
    ).toEqual({
      name: 'Acme Dev Tools',
      tagline: 'Automate your workflow.',
      ctaLabel: 'Try free',
      ctaUrl: 'https://acme.example.com',
    });
  });

  it('fetches sponsor.json through chrome.runtime.getURL and renders the card', async () => {
    const getURL = vi.fn(() => 'chrome-extension://snapvault/assets/sponsor.json');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: 'Acme Dev Tools',
        tagline: 'Automate your workflow.',
        ctaLabel: 'Try free',
        ctaUrl: 'https://acme.example.com',
      }),
    }));
    vi.stubGlobal('chrome', {
      runtime: {
        getURL,
      },
    });

    await bootstrapSponsorCard(fetchMock as unknown as typeof fetch, document);

    expect(getURL).toHaveBeenCalledWith('assets/sponsor.json');
    expect(fetchMock).toHaveBeenCalledWith('chrome-extension://snapvault/assets/sponsor.json');
    expect(document.querySelector('.sponsor-name')?.textContent).toBe('Acme Dev Tools');
    expect(document.querySelector('.sponsor-tagline')?.textContent).toBe(
      'Automate your workflow.',
    );
    expect(document.querySelector('.sponsor-cta')?.textContent).toBe('Try free');
  });
});
