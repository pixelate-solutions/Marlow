const NON_RETRYABLE_WORKER_ERROR =
  /APPROVAL_|SUPPRESSED|PERMISSION|CREDIT|DELIVERY_UNKNOWN|APOLLO_NOT_CONNECTED|APOLLO_REAUTHORIZATION_REQUIRED|APOLLO_PERMISSION_DENIED|APOLLO_PLAN_UPGRADE_REQUIRED|MAILBOX_NOT_AVAILABLE|invalid input syntax|violates .* constraint|null value in column|duplicate key value|schema cache|column .* does not exist/i;

export function isRetryableWorkerError(error: unknown, attempts: number): boolean {
  if (attempts >= 5) return false;
  const message = error instanceof Error ? error.message : String(error);
  return !NON_RETRYABLE_WORKER_ERROR.test(message);
}
