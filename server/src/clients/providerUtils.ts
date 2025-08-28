import { LlmProvider } from './llmProvider.js'
import { ClientProvider } from './providers.js'
import { groqClient } from './groqClient.js'
import { cerebrasClient } from './cerebrasClient.js'
import { ClientUnavailableError } from './errors.js'

/**
 * Get an ASR provider by name
 * @param providerName The name of the ASR provider
 * @returns The ASR provider instance
 */
export function getAsrProvider(providerName: string): LlmProvider {
  switch (providerName) {
    case ClientProvider.GROQ:
      if (!groqClient.isAvailable) {
        throw new ClientUnavailableError(ClientProvider.GROQ)
      }
      return groqClient

    default:
      throw new ClientUnavailableError(providerName as ClientProvider)
  }
}

/**
 * Get an LLM provider by name
 * @param providerName The name of the LLM provider
 * @returns The LLM provider instance
 */
export function getLlmProvider(providerName: string): LlmProvider {
  switch (providerName) {
    case ClientProvider.GROQ:
      if (!groqClient.isAvailable) {
        throw new ClientUnavailableError(ClientProvider.GROQ)
      }
      return groqClient

    case ClientProvider.CEREBRAS:
      if (!cerebrasClient || !cerebrasClient.isAvailable) {
        throw new ClientUnavailableError(ClientProvider.CEREBRAS)
      }
      return cerebrasClient

    default:
      throw new ClientUnavailableError(providerName as ClientProvider)
  }
}

/**
 * Get list of available ASR providers
 * @returns Array of available ASR provider names
 */
export function getAvailableAsrProviders(): ClientProvider[] {
  const providers: ClientProvider[] = []

  if (groqClient.isAvailable) {
    providers.push(ClientProvider.GROQ)
  }

  return providers
}

/**
 * Get list of available LLM providers
 * @returns Array of available LLM provider names
 */
export function getAvailableLlmProviders(): ClientProvider[] {
  const providers: ClientProvider[] = []

  if (groqClient.isAvailable) {
    providers.push(ClientProvider.GROQ)
  }

  if (cerebrasClient && cerebrasClient.isAvailable) {
    providers.push(ClientProvider.CEREBRAS)
  }

  return providers
}
