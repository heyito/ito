/**
 * Simple health check utility for the local Ito server using the main process
 */

export interface HealthCheckResult {
  isHealthy: boolean
  error?: string
}

/**
 * Performs a health check against the local Ito server via the main process
 * This avoids CORS issues by using the main process to make the HTTP request
 * @returns Promise resolving to health check result
 */
export async function checkLocalServerHealth(): Promise<HealthCheckResult> {
  try {
    // Use the main process to check server health via HTTP
    const result = await window.api.checkServerHealth()

    return {
      isHealthy: result.isHealthy,
      error: result.error,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'

    return {
      isHealthy: false,
      error: errorMessage,
    }
  }
}
