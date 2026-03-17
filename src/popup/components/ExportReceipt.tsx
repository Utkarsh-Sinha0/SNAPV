import { useEffect } from 'preact/hooks';

type ExportReceiptProps = {
  filename: string;
  onDismiss: () => void;
};

export function ExportReceipt({ filename, onDismiss }: ExportReceiptProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [filename, onDismiss]);

  return (
    <div className="receipt" role="status">
      <strong>Saved</strong>
      <span>{filename}</span>
    </div>
  );
}
