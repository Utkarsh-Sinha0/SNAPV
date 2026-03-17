import { useEffect, useMemo, useState } from 'preact/hooks';
import { CaptureButtons } from './components/CaptureButtons';
import { ExportSpecPicker } from './components/ExportSpecPicker';
import { FeasibilityBanner } from './components/FeasibilityBanner';
import { ActionBar } from './components/ActionBar';
import { ExportReceipt } from './components/ExportReceipt';
import {
  exportToClipboard,
  exportToDownloads,
  getActiveTabId,
  getCurrentTabMetadata,
  getPopupApis,
  loadLicenseState,
  loadStoredExportSpec,
  openEditor,
  requestFeasibility,
  runCapture,
  saveStoredExportSpec,
  syncLicenseIfStale,
} from './popup-api';
import type {
  CaptureMetadata,
  ExportSpec,
  FeasibilityResult,
  LicenseState,
} from '../shared/types';
import type {
  PopupActionCommand,
  PopupApis,
  PopupCaptureCommand,
} from './popup-api';

type PopupAppProps = {
  apis?: PopupApis;
};

const FALLBACK_SPEC: ExportSpec = {
  format: 'png',
  dimensions: {
    mode: 'preset',
    presetId: 'original',
  },
  dpiPolicy: 'device',
  filenameTemplate: 'snapvault-{date}-{time}.{format}',
};

export function PopupApp({ apis }: PopupAppProps) {
  const popupApis = useMemo(() => apis ?? getPopupApis(), [apis]);
  const [spec, setSpec] = useState<ExportSpec>(FALLBACK_SPEC);
  const [specReady, setSpecReady] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<CaptureMetadata | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityResult | null>(null);
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [busyCapture, setBusyCapture] = useState<PopupCaptureCommand | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [lastCaptureCommand, setLastCaptureCommand] =
    useState<PopupCaptureCommand>('CAPTURE_VISIBLE');
  const [receiptFilename, setReceiptFilename] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [storedSpec, currentTabId] = await Promise.all([
          loadStoredExportSpec(popupApis),
          getActiveTabId(popupApis),
        ]);

        if (cancelled) {
          return;
        }

        setSpec(storedSpec);
        setSpecReady(true);
        setTabId(currentTabId);
        setLicenseState(await loadLicenseState(popupApis));

        const nextMetadata = await getCurrentTabMetadata(currentTabId, popupApis);
        if (cancelled) {
          return;
        }

        setMetadata(nextMetadata);
        void syncLicenseIfStale(popupApis)
          .then((syncedLicenseState) => {
            if (!cancelled && syncedLicenseState) {
              setLicenseState(syncedLicenseState);
            }
          })
          .catch((error) => {
            if (!cancelled) {
              setStatusMessage(
                error instanceof Error ? error.message : 'Failed to sync license.',
              );
            }
          });
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : 'Failed to prepare the popup.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [popupApis]);

  useEffect(() => {
    if (!specReady || !metadata) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const [result] = await Promise.all([
          requestFeasibility(spec, metadata, popupApis),
          saveStoredExportSpec(spec, popupApis),
        ]);

        if (!cancelled) {
          setFeasibility(result);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : 'Failed to validate export settings.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [metadata, popupApis, spec, specReady]);

  const captureSummary = useMemo(() => {
    if (!captureId) {
      return 'No capture yet. Pick a mode to prepare the next export.';
    }

    return `Capture ready: ${captureId.slice(0, 8)}`;
  }, [captureId]);

  async function handleCapture(command: PopupCaptureCommand) {
    if (tabId === null || !metadata) {
      setStatusMessage('The active tab is still loading.');
      return;
    }

    setStatusMessage(null);
    setBusyCapture(command);

    try {
      const result = await runCapture(command, tabId, spec, metadata, popupApis);
      setCaptureId(result.captureId);
      setLastCaptureCommand(command);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Capture failed.');
    } finally {
      setBusyCapture(null);
    }
  }

  async function handleAction(command: PopupActionCommand) {
    if (!captureId) {
      return;
    }

    setStatusMessage(null);
    setBusyAction(true);

    try {
      if (command === 'EXPORT_CLIPBOARD') {
        await exportToClipboard(captureId, spec, popupApis);
        setStatusMessage('PNG copied to the clipboard.');
        return;
      }

      if (command === 'EXPORT_DOWNLOAD') {
        const result = await exportToDownloads(captureId, spec, popupApis);
        setReceiptFilename(result.filename);
        return;
      }

      if (command === 'OPEN_EDITOR') {
        await openEditor(captureId, popupApis);
        return;
      }

      await handleCapture(lastCaptureCommand);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <main className="popup-shell">
      <section className="hero">
        <p className="eyebrow">SnapVault</p>
        <h1>Fast local capture, tuned before you export.</h1>
        <p className="hero-copy">
          Pick a capture mode, shape the output, then ship a clean file without
          leaving the page.
        </p>
      </section>

      <CaptureButtons busyCommand={busyCapture} onCapture={handleCapture} />
      <ExportSpecPicker
        spec={spec}
        licenseState={licenseState}
        onChange={setSpec}
      />
      <FeasibilityBanner result={feasibility} />

      <section className="panel compact-panel">
        <div className="section-header">
          <p className="eyebrow">Status</p>
          <h2>{captureSummary}</h2>
        </div>
        <p className="status-copy">
          {metadata
            ? `${metadata.cssWidth} x ${metadata.cssHeight} CSS px at ${metadata.devicePixelRatio}x`
            : 'Reading the active tab metadata...'}
        </p>
        {statusMessage ? <p className="inline-message">{statusMessage}</p> : null}
      </section>

      {captureId ? <ActionBar busy={busyAction} onAction={handleAction} /> : null}
      {receiptFilename ? (
        <ExportReceipt
          filename={receiptFilename}
          onDismiss={() => setReceiptFilename(null)}
        />
      ) : null}
    </main>
  );
}
