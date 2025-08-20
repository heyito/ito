module.exports = {
  appId: 'ai.ito.ito',
  productName: 'Ito',
  copyright: 'Copyright © 2025 Demox Labs',
  directories: {
    buildResources: 'resources',
    output: 'dist',
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!.eslintignore',
    '!.eslintrc.cjs',
    '!.prettierignore',
    '!.prettierrc.yaml',
    '!dev-app-update.yml',
    '!README.md',
    '!.env',
    '!.env.*',
    '!.npmrc',
    '!pnpm-lock.yaml',
    '!tsconfig.json',
    '!tsconfig.node.json',
    '!tsconfig.web.json',
    '!native/**',
    {
      from: 'out',
      filter: ['**/*'],
    },
  ],
  asar: true,
  asarUnpack: ['resources/**'],
  extraResources: [
    {
      from: 'native/global-key-listener/target/${arch}-apple-darwin/release/global-key-listener',
      to: 'binaries/global-key-listener',
    },
    {
      from: 'native/audio-recorder/target/${arch}-apple-darwin/release/audio-recorder',
      to: 'binaries/audio-recorder',
    },
    {
      from: 'native/text-writer/target/${arch}-apple-darwin/release/text-writer',
      to: 'binaries/text-writer',
    },
    {
      from: 'native/active-application/target/${arch}-apple-darwin/release/active-application',
      to: 'binaries/active-application',
    },
    {
      from: 'native/selected-text-reader/target/${arch}-apple-darwin/release/selected-text-reader',
      to: 'binaries/selected-text-reader',
    },
  ],
  extraMetadata: {
    version: process.env.VITE_ITO_VERSION || '0.0.0-dev',
  },
  protocols: {
    name: 'ito',
    schemes: ['ito'],
  },
  mac: {
    target: 'default',
    icon: 'resources/build/icon.icns',
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    identity: 'Demox Labs, Inc. (294ZSTM7UB)',
    notarize: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    extendInfo: {
      NSMicrophoneUsageDescription:
        'Ito requires microphone access to transcribe your speech.',
    },
  },
  dmg: {
    artifactName: 'Ito-Installer.${ext}',
  },
  win: {
    target: ['nsis'],
    icon: 'resources/build/icon.ico',
    executableName: 'Ito',
  },
  nsis: {
    artifactName: '${name}-${version}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: true,
  },
}
