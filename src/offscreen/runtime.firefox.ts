type RuntimeLike = {
  onMessage?: {
    addListener?: (...args: unknown[]) => void;
  };
  sendMessage?: (...args: unknown[]) => Promise<unknown>;
};

export function rememberOffscreenReference(_value: unknown): void {}

export function getHeldReferenceCount(): number {
  return 0;
}

export function registerOffscreenMessageListener(_runtime?: RuntimeLike): void {}

export function __resetOffscreenListenerForTests(): void {}
