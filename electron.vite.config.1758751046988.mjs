// electron.vite.config.ts
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
var __electron_vite_injected_dirname = 'C:\\Users\\johns\\work\\ito'
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: resolve(__electron_vite_injected_dirname, 'lib/main/main.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@/app': resolve(__electron_vite_injected_dirname, 'app'),
        '@/lib': resolve(__electron_vite_injected_dirname, 'lib'),
        '@/resources': resolve(__electron_vite_injected_dirname, 'resources'),
      },
    },
    plugins: [
      externalizeDepsPlugin(),
      sentryVitePlugin({ org: 'demox-labs', project: 'ito' }),
    ],
  },
  preload: {
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          preload: resolve(
            __electron_vite_injected_dirname,
            'lib/preload/preload.ts',
          ),
        },
      },
    },
    resolve: {
      alias: {
        '@/app': resolve(__electron_vite_injected_dirname, 'app'),
        '@/lib': resolve(__electron_vite_injected_dirname, 'lib'),
        '@/resources': resolve(__electron_vite_injected_dirname, 'resources'),
      },
    },
    plugins: [
      externalizeDepsPlugin(),
      sentryVitePlugin({ org: 'demox-labs', project: 'ito' }),
    ],
  },
  renderer: {
    root: './app',
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, 'app/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@/app': resolve(__electron_vite_injected_dirname, 'app'),
        '@/lib': resolve(__electron_vite_injected_dirname, 'lib'),
        '@/resources': resolve(__electron_vite_injected_dirname, 'resources'),
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      sentryVitePlugin({ org: 'demox-labs', project: 'ito' }),
    ],
  },
})
export { electron_vite_config_default as default }
