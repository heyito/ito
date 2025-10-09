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

- Dev: `bun run dev` (starts electron-vite dev with watch)
- Dev (with fresh native binaries): `bun run dev:rust`
- Server: `bun run dev` (run inside `server/`; use `bun run local-db-up` first if Postgres is down)
- Build: `bun run build:mac`, `bun run build:win`, or `bun run build:app`
- Test: `bun run runAllTests` (runs both lib and server tests)
  - Lib tests: `bun run runLibTests`
  - Server tests: `bun run runServerTests`
- Lint: `bun run lint` (check) or `bun run lint:fix` (fix)
- Type check: `bun run type-check`
- Format: `bun run format` (check) or `bun run format:fix` (fix)

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
