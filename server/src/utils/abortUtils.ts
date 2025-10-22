import { ConnectError, Code } from '@connectrpc/connect'

/**
 * Checks if an error is an abort/connection reset error caused by the client
 * cancelling the request or closing the connection.
 *
 * Common abort error patterns:
 * - Error message: "aborted"
 * - Error code: "ECONNRESET" (connection reset)
 * - Error code: "ABORT_ERR" (abort error)
 *
 * @param err - The error to check
 * @returns true if the error is an abort error, false otherwise
 */
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message === 'aborted' ||
      (err as any).code === 'ECONNRESET' ||
      (err as any).code === 'ABORT_ERR')
  )
}

/**
 * Converts an abort error into a proper ConnectError with Code.Canceled.
 * This should be used when handling client-initiated cancellations.
 *
 * @param err - The original abort error
 * @param message - Optional custom message (defaults to "Request cancelled by client")
 * @returns A ConnectError with Code.Canceled
 */
export function createAbortError(
  err: unknown,
  message: string = 'Request cancelled by client',
): ConnectError {
  return new ConnectError(message, Code.Canceled, undefined, undefined, err)
}
