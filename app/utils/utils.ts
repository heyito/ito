export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Auth0 enforces these rules
export const isStrongPassword = (password: string): boolean => {
  if (!password) return false // non-empty
  if (password.length < 8) return false // length
  if (!/[a-z]/.test(password)) return false // lower
  if (!/[A-Z]/.test(password)) return false // upper
  if (!/\d/.test(password)) return false // number
  return true
}
