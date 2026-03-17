type HiDpiBannerProps = {
  hiDpiWarning: boolean;
};

export function HiDpiBanner({ hiDpiWarning }: HiDpiBannerProps) {
  if (!hiDpiWarning) {
    return null;
  }

  return (
    <div className="banner banner-info" role="status">
      <strong>HiDPI capture detected.</strong> Device-resolution export keeps every
      pixel, but files will be larger than a true 1x export.
    </div>
  );
}
