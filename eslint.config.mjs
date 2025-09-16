import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

export default [
  // Global ignores must be in their own config object
  {
    ignores: [
      '**/node_modules',
      '**/node_modules/**',
      '.pnpm-store',
      'dist',
      'build',
      'out',
      '.vite',
      'server/infra/cdk.out',
      'resources/binaries',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/dist',
      '**/generated',
      '**/*.pb.ts',
      '**/*_pb.ts',
      '**/*_connect.ts',
      'server/src/ito_*',
      'server/src/migrations',
      'scripts',
      'native',
      '**/target',
      '*.config.js',
      'commitlint.config.js',
      'electron-builder.config.js',
      'tailwind.config.js',
      'shared-constants.js',
      'server/infra/jest.config.js',
      // CDK outputs
      'server/infra/cdk.out/**',
      'server/infra/**/*.d.ts',
      'server/infra/**/*.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
      },
      globals: {
        // Browser globals that should be readonly
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',

        // Browser globals that can be modified
        console: 'writable',
        localStorage: 'writable',
        sessionStorage: 'writable',

        // Timer functions that can be modified
        setTimeout: 'writable',
        clearTimeout: 'writable',
        setInterval: 'writable',
        clearInterval: 'writable',

        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',

        // React globals
        React: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React specific rules
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      '@typescript-eslint/no-explicit-any': 'off',

      // Global modification rules
      'no-global-assign': [
        'error',
        {
          exceptions: ['console', 'localStorage', 'sessionStorage'],
        },
      ],
    },
  },
  // Add specific configuration for preload files
  {
    files: ['app/**/*.ts', 'lib/**/*.ts', 'app/**/*.tsx', 'lib/**/*.tsx'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        window: 'readonly',
      },
    },
  },
  // Test file specific configuration
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
]
