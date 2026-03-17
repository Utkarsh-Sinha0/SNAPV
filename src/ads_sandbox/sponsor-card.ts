type SponsorPayload =
  | {
      sponsor?: {
        name?: string;
        tagline?: string;
        url?: string;
        cta?: string;
      };
    }
  | {
      name?: string;
      tagline?: string;
      ctaUrl?: string;
      ctaLabel?: string;
    };

export type SponsorCardModel = {
  name: string;
  tagline: string;
  ctaLabel: string;
  ctaUrl: string;
};

function getSponsorDocument(doc: Document = document) {
  return {
    card: doc.querySelector<HTMLElement>('.sponsor-card'),
    name: doc.querySelector<HTMLElement>('.sponsor-name'),
    tagline: doc.querySelector<HTMLElement>('.sponsor-tagline'),
    cta: doc.querySelector<HTMLAnchorElement>('.sponsor-cta'),
  };
}

export function normalizeSponsorPayload(payload: SponsorPayload): SponsorCardModel | null {
  const nested = 'sponsor' in payload ? payload.sponsor : undefined;
  const name = nested?.name ?? ('name' in payload ? payload.name : undefined);
  const tagline = nested?.tagline ?? ('tagline' in payload ? payload.tagline : undefined);
  const ctaUrl = nested?.url ?? ('ctaUrl' in payload ? payload.ctaUrl : undefined);
  const ctaLabel = nested?.cta ?? ('ctaLabel' in payload ? payload.ctaLabel : undefined);

  if (!name || !tagline || !ctaUrl || !ctaLabel) {
    return null;
  }

  return { name, tagline, ctaLabel, ctaUrl };
}

export function renderSponsorCard(
  sponsor: SponsorCardModel,
  doc: Document = document,
): void {
  const elements = getSponsorDocument(doc);
  if (!elements.card || !elements.name || !elements.tagline || !elements.cta) {
    return;
  }

  elements.name.textContent = sponsor.name;
  elements.tagline.textContent = sponsor.tagline;
  elements.cta.textContent = sponsor.ctaLabel;
  elements.cta.href = sponsor.ctaUrl;
  elements.card.dataset.hidden = 'false';
}

export function resolveSponsorUrl(): string {
  const chromeLike = globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        getURL?: (path: string) => string;
      };
    };
  };

  return chromeLike.chrome?.runtime?.getURL?.('assets/sponsor.json') ?? 'assets/sponsor.json';
}

export async function loadSponsorPayload(
  fetchImpl: typeof fetch = fetch,
): Promise<SponsorCardModel | null> {
  const response = await fetchImpl(resolveSponsorUrl());
  if (!response.ok) {
    return null;
  }

  const raw = (await response.json()) as SponsorPayload;
  return normalizeSponsorPayload(raw);
}

export async function bootstrapSponsorCard(
  fetchImpl: typeof fetch = fetch,
  doc: Document = document,
): Promise<void> {
  try {
    const sponsor = await loadSponsorPayload(fetchImpl);
    if (sponsor) {
      renderSponsorCard(sponsor, doc);
    }
  } catch {
    // Sponsor slot failure should stay silent in the sandbox.
  }
}
