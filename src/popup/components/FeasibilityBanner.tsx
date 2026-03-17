import type { FeasibilityResult } from '../../shared/types';
import { HiDpiBanner } from './HiDpiBanner';

type FeasibilityBannerProps = {
  result: FeasibilityResult | null;
};

export function FeasibilityBanner({ result }: FeasibilityBannerProps) {
  if (!result) {
    return null;
  }

  const showBlocking = !result.ok && result.blockingReasons.length > 0;
  const showWarnings = result.warnings.length > 0;
  const showHiDpi = result.hiDpiWarning === true;

  if (!showBlocking && !showWarnings && !showHiDpi) {
    return null;
  }

  return (
    <section className="panel compact-panel">
      {showBlocking ? (
        <div className="banner banner-danger" role="alert">
          <strong>Export blocked</strong>
          <ul>
            {result.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {showWarnings ? (
        <div className="banner banner-warning" role="status">
          <strong>Heads up</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <HiDpiBanner hiDpiWarning={showHiDpi} />
    </section>
  );
}
