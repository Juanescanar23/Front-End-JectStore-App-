/** Share the in-flight UI submission; this is not a server idempotency guarantee. */
export function createCheckoutSubmissionGuard() {
  const pending = new Map<string, Promise<unknown>>();

  return function runOnce<T>(key: string, submit: () => Promise<T>): Promise<T> {
    const current = pending.get(key);
    if (current) return current as Promise<T>;

    const result = Promise.resolve().then(submit).finally(() => {
      if (pending.get(key) === result) pending.delete(key);
    });
    pending.set(key, result);
    return result;
  };
}
