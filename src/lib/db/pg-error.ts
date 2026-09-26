/**
 * Drizzle wraps the raw `pg` driver error in its own error object, so the
 * Postgres error code lives on `.cause.code`, not `.code` directly. Checks
 * both so callers don't have to know which layer threw.
 */
export function getPgErrorCode(err: unknown): string | undefined {
  const asRecord = err as { code?: string; cause?: { code?: string } } | undefined;
  return asRecord?.code ?? asRecord?.cause?.code;
}
