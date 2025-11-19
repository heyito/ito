# Repository Guidelines

## Project Structure & Module Organization

- `app/` hosts the Electron renderer (React + Tailwind); `lib/` contains shared TypeScript modules, preload logic, and unit tests.
- `server/` holds the Bun-based transcription API, database migrations, and infrastructure scripts.
- `native/` includes Rust crates for keyboard, audio, and text bridges; rebuild via scripts as needed.
- `resources/` provides packaging assets (icons, updater configs), while `build/` and `out/` house generated installers; avoid editing build outputs.
- Use `scripts/` for automation and keep generated proto/constants under `lib/generated` (created by build steps).

## Build, Test, and Development Commands

- `bun install` aligns dependencies after pulls.
- `bun run dev` starts the Electron shell with live reload; `bun run dev:rust` rebuilds native bridges via `./build-binaries.sh` before launching.
- Packaging: `bun run build:app` for cross-platform; use `bun run build:mac` / `bun run build:win` for platform installers.
- Backend (`server/`): `bun install`, `bun run local-db-up` (Postgres), `bun run db:migrate`, `bun run dev`.

## Coding Style & Naming Conventions

- TypeScript + React across app/lib; server targets modern ECMAScript on Bun.
- Prettier (2-space indent) and ESLint enforce formatting. Run `bun run format` and `bun run lint` (or `*:app` variants) before submitting.
- Components/classes use `PascalCase`, hooks/utilities `camelCase`, constants `SCREAMING_SNAKE_CASE`. Co-locate Tailwind styles with components and reuse tokens via `lib/constants`.
- Always prefer console commands over log commands. E.g. use `console.log` instead of `log.info`.

## Testing Guidelines

- Unit tests run with Bun. Renderer/shared specs live in `lib/__tests__`; server tests reside under `server/src/**`. Name files with `.test.ts`.
- Run `bun run runLibTests`, `bun run runServerTests`, or `bun run runAllTests`; paste output in PR notes.
- Seed backend tests with `bun run local-db-up` and avoid hitting external services—mock microphone, OS, and network dependencies.

## Commit & Pull Request Guidelines

- Conventional commits are enforced via commitlint (example: `feat(app): add dictation overlay`). Scope by top-level folder.
- PRs need a summary, linked issue, test commands, and screenshots/GIFs for UI work. Call out schema/config updates and refresh `.env.example` files.

## Environment & Security Notes

- Copy `.env.example` (root) and `server/.env.example`; never commit credentials.
- After modifying protobufs or constants, run `bun run generate:constants` so `lib/generated` stays in sync with the app bundle.
