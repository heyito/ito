# Claude Context for ITO Project

## Project Overview

This is the ITO project - an AI assistant application with both client and server components.

## Project Structure

- `app/` - Client application code
- `server/` - Server-side code with gRPC services
- `server/src/ito.proto` - Protocol buffer definitions
- `server/src/clients/` - Various client implementations (Groq, LLM providers, etc.)

## Branch

Main development branch: `dev`

## Development Commands

- Dev: `bun dev` (starts electron-vite dev with watch)
- Server: `docker compose up --build` (run from server directory)
- Build: `bun build:app:mac` or `bun build:app:windows`
- Test: `bun runAllTests` (runs both lib and server tests)
  - Lib tests: `bun runLibTests`
  - Server tests: `bun runServerTests`
  - Native tests: See "Native Binary Tests" section below
- Lint: `bun lint` (check) or `bun lint:fix` (fix)
- Type check: `bun type-check`
- Format: `bun format` (check) or `bun format:fix` (fix)

## Native Binary Tests

The `native/` directory contains Rust binaries that power the app's core functionality. The modules are organized as a Cargo workspace, allowing you to test and build all modules with a single command.

### Running Tests

Test all native modules:
```bash
cd native
cargo test --workspace
```

Or use the npm script:
```bash
bun runNativeTests
```

Test a single module:
```bash
cd native/global-key-listener
cargo test
```

### Native Modules

- `global-key-listener` - Keyboard event capture and hotkey management
- `audio-recorder` - Audio recording with sample rate conversion
- `text-writer` - Cross-platform text input simulation
- `active-application` - Active window detection
- `selected-text-reader` - Selected text extraction

### CI/CD

The `.github/workflows/native-tests.yml` workflow runs tests and builds for:
- macOS (Intel x86_64 + Apple Silicon aarch64)
- Windows (x86_64-gnu)

The workflow runs automatically on:
- Pull requests
- Pushes to `main` or `dev` branches

## Code Style Preferences

- Keep code as simple as possible
- Don't create overly long files
- Group related code into useful, well-named functions
- Prefer clean, readable code over complex solutions
- Follow existing patterns and conventions in the codebase

## Tech Stack

- TypeScript
- bun
- gRPC with Protocol Buffers
- React (for UI components)
- Various LLM providers (Groq, etc.)
