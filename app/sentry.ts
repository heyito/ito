import * as Sentry from '@sentry/electron/renderer'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
const environment =
  (import.meta.env.VITE_SENTRY_ENV as string | undefined) || 'local'

const tracesSampleRate = Number.parseFloat(
  (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined) ||
    '0.2',
)

const profilesSampleRate = Number.parseFloat(
  (import.meta.env.VITE_SENTRY_PROFILES_SAMPLE_RATE as string | undefined) ||
    '0.2',
)

Sentry.init({
  enabled: Boolean(dsn),
  dsn,
  environment,
  tracesSampleRate,
  profilesSampleRate,
  beforeBreadcrumb: breadcrumb =>
    breadcrumb?.category === 'console' ? null : breadcrumb,
  integrations: integrations =>
    integrations.filter(integration =>
      typeof (integration as any).name === 'string'
        ? !(
            (integration as any).name.toLowerCase().includes('console') ||
            (integration as any).name.toLowerCase() === 'breadcrumbs'
          )
        : true,
    ),
})
