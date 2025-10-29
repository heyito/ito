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
- Test: `bun runAllTests` (runs lib, server, and native tests)
  - Lib tests: `bun runLibTests`
  - Server tests: `bun runServerTests`
  - Native tests: `bun runNativeTests` (or see "Native Binary Tests" section)
- Lint:
  - TypeScript: `bun lint` (check) or `bun lint:fix` (fix)
  - Rust: `bun lint:native` (check) or `bun lint:fix:native` (fix)
- Type check: `bun type-check`
- Format:
  - TypeScript: `bun format` (check) or `bun format:fix` (fix)
  - Rust: `bun format:native` (check) or `bun format:fix:native` (fix)

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

### Linting and Formatting

Rust code follows standard formatting and linting rules defined in `native/`:

- **rustfmt.toml** - Code formatting configuration (100 char width, Unix line endings)
- **clippy.toml** - Linter configuration (cognitive complexity threshold)
- **Cargo.toml** - Workspace-level lint rules (pedantic + nursery warnings)

Run checks locally:

```bash
# Check formatting
bun format:native

# Auto-fix formatting
bun format:fix:native

# Check lints
bun lint:native

# Auto-fix lints (where possible)
bun lint:fix:native
```

### CI/CD

Native tests and builds are integrated into the existing CI workflows:

**Tests** (`.github/workflows/test-runner.yml`):

- Unit tests run on macOS runner (OS-agnostic tests)
- Runs automatically via `bun runAllTests` on all pushes and PRs
- Executed as part of the main CI controller workflow

**Compilation Checks** (`.github/workflows/native-build-check.yml`):

- macOS: Verifies compilation for x86_64 and aarch64 architectures
- Windows: Verifies cross-compilation for x86_64-pc-windows-gnu
- Runs automatically on all pushes and PRs via the CI controller
- Ensures binaries compile correctly for both platforms before merging

**Release Builds** (`.github/workflows/build.yml`):

- Full release compilation happens during tagged releases
- Also includes compilation verification before packaging

## Code Style Preferences

- Keep code as simple as possible
- Don't create overly long files
- Group related code into useful, well-named functions
- Prefer clean, readable code over complex solutions
- Follow existing patterns and conventions in the codebase
- Always prefer console commands over log commands. E.g. use `console.log` instead of `log.info`.

## Tech Stack

- TypeScript
- bun
- gRPC with Protocol Buffers
- React (for UI components)
- Various LLM providers (Groq, etc.)
