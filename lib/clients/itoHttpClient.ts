import store from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'

interface RequestOptions {
  requireAuth?: boolean
  headers?: Record<string, string>
}

/**
 * HTTP client for Ito backend API calls
 */
class ItoHttpClient {
  private getBaseUrl(): string {
    return import.meta.env.VITE_GRPC_BASE_URL
  }

  private getAccessToken(): string {
    return (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
  }

  async get(path: string, options: RequestOptions = {}) {
    try {
      const { requireAuth = false, headers = {} } = options
      const token = this.getAccessToken()

      if (requireAuth && !token) {
        return { success: false, error: 'Access token not available' }
      }

      const url = new URL(path, this.getBaseUrl())
      const response = await fetch(url.toString(), {
        headers: {
          ...headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      const data: any = await response.json().catch(() => undefined)

      if (!response.ok) {
        return {
          success: false,
          error: data?.error || `Request failed (${response.status})`,
          status: response.status,
        }
      }

      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  }

  async post(path: string, body?: any, options: RequestOptions = {}) {
    try {
      const { requireAuth = false, headers = {} } = options
      const token = this.getAccessToken()

      if (requireAuth && !token) {
        return { success: false, error: 'Access token not available' }
      }

      const url = new URL(path, this.getBaseUrl())
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...(body && { 'content-type': 'application/json' }),
          ...headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body && { body: JSON.stringify(body) }),
      })

      const data: any = await response.json().catch(() => undefined)

      if (!response.ok) {
        return {
          success: false,
          error: data?.error || `Request failed (${response.status})`,
          status: response.status,
        }
      }

      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  }
}

export const itoHttpClient = new ItoHttpClient()
