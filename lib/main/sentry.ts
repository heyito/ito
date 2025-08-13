import * as Sentry from '@sentry/electron/main'

const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined
const environment =
  ((import.meta as any).env?.VITE_SENTRY_ENV as string | undefined) || 'local'

const tracesSampleRateRaw = (import.meta as any).env
  ?.VITE_SENTRY_TRACES_SAMPLE_RATE
const tracesSampleRate = Number.parseFloat(
  typeof tracesSampleRateRaw === 'string' && tracesSampleRateRaw.trim() !== ''
    ? tracesSampleRateRaw
    : '0.2',
)

const profilesSampleRateRaw = (import.meta as any).env
  ?.VITE_SENTRY_PROFILES_SAMPLE_RATE
const profilesSampleRate = Number.parseFloat(
  typeof profilesSampleRateRaw === 'string' &&
    profilesSampleRateRaw.trim() !== ''
    ? profilesSampleRateRaw
    : '0.2',
)

Sentry.init({
  enabled: Boolean(dsn),
  dsn,
  environment,
  tracesSampleRate,
  profilesSampleRate,
})
