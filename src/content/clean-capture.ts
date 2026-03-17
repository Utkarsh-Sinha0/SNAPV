export function validateCssSelector(
  selector: string,
  documentLike: Document = document,
): boolean {
  if (selector.trim().length === 0) {
    return false;
  }

  try {
    documentLike.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function applyCleanCapture(
  css: string,
  documentLike: Document = document,
): () => void {
  const style = documentLike.createElement('style');
  style.setAttribute('data-snapvault-clean-capture', 'true');
  style.textContent = css;
  documentLike.head.append(style);

  return () => {
    style.remove();
  };
}
