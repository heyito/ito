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
- Build: `bun build:app` or `bun vite:build:app`
- Test: `bun runAllTests` (runs both lib and server tests)
  - Lib tests: `bun runLibTests`
  - Server tests: `bun runServerTests`
- Lint: `bun lint` (check) or `bun lint:fix` (fix)
- Type check: `bun type-check`
- Format: `bun format` (check) or `bun format:fix` (fix)

## Recent Changes

- Command Mode UI implementation
- Bug fixes for lastSyncedOn and main window interactions
- Test failures related to prompt suffix removal

## Code Style Preferences

- Keep code as simple as possible
- Don't create overly long files
- Group related code into useful, well-named functions
- Prefer clean, readable code over complex solutions
- Follow existing patterns and conventions in the codebase

## Tech Stack

- TypeScript
- gRPC with Protocol Buffers
- React (for UI components)
- Various LLM providers (Groq, etc.)
