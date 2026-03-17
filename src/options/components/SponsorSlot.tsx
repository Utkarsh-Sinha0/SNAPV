import type { LicenseState } from '../../shared/types';

type SponsorSlotProps = {
  licenseState: LicenseState;
  src: string;
};

export function SponsorSlot({ licenseState, src }: SponsorSlotProps) {
  if (licenseState.status === 'pro') {
    return null;
  }

  return (
    <section className="options-panel">
      <div className="section-header">
        <p className="eyebrow">Sponsor</p>
        <h2>Free tier support slot</h2>
      </div>
      <iframe
        title="Sponsor slot"
        src={src}
        sandbox="allow-scripts allow-popups"
        className="sponsor-frame"
      />
    </section>
  );
}
