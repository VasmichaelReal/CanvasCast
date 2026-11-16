/** Помилка провайдера. `retryable=false` — повтор не допоможе (поганий ключ, відмова моделі). */
export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean = true) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** 4xx (крім 408/429) — помилка запиту, повторювати марно. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
