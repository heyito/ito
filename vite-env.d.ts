interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_REDIRECT_URI: string
  readonly VITE_AUTH0_AUDIENCE: string
  readonly VITE_GRPC_BASE_URL: string
  readonly VITE_AMPLITUDE_API_KEY: string
  readonly VITE_UPDATER_BUCKET: string
  readonly VITE_LOCAL_SERVER_PORT?: string
  readonly VITE_ITO_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.webm' {
  const src: string
  export default src
}
