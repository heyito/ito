import { WindowContext } from './types.js'

export function addContextToPrompt(
  prompt: string,
  context?: WindowContext,
): string {
  if (context) {
    const contextPrompt = `
    To assist with this, you have been given the following context:
    - ${context.windowTitle}: The title of the current window where the user is working.
    - ${context.appName}: The name of the application where the user is issuing this command.
    `
    return prompt + contextPrompt
  }
  return prompt
}
