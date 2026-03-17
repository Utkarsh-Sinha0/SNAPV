export function getWebExtensionNamespace<T>(): T {
  const globalScope = globalThis as typeof globalThis & {
    browser?: T;
    chrome?: T;
  };

  const namespace = globalScope.browser ?? globalScope.chrome;
  if (!namespace) {
    throw new Error('WebExtension APIs are unavailable');
  }

  return namespace;
}
