function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isImageDataInstance(value: unknown): boolean {
  return typeof ImageData !== 'undefined' && value instanceof ImageData;
}

function assertSafeValue(value: unknown, seen: WeakSet<object>): void {
  if (value instanceof ArrayBuffer) {
    throw new Error('Pixel payloads must not include ArrayBuffer values');
  }

  if (isImageDataInstance(value)) {
    throw new Error('Pixel payloads must not include ImageData values');
  }

  if (!isPlainObject(value)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        assertSafeValue(item, seen);
      }
    }
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.toLowerCase() === 'dataurl' && typeof nestedValue === 'string' && nestedValue.startsWith('data:')) {
      throw new Error('Pixel payloads must not include data URLs');
    }

    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        assertSafeValue(item, seen);
      }
      continue;
    }

    assertSafeValue(nestedValue, seen);
  }
}

export function assertNoPixelPayload(payload: unknown): void {
  assertSafeValue(payload, new WeakSet<object>());
}
