# SlopMiles

SlopMiles is an AI running coach with an iOS-first app and a web companion. It helps runners build personalized training plans, adapt those plans over time, and receive coaching feedback based on workout data.

## Monorepo Layout

- `apps/mobile` - React Native (Expo) iOS client
- `apps/web` - React + Vite web companion
- `packages/domain` - Shared domain models and types
- `SPEC.md` - Full product and technical specification
- `SUMMARY.md` - High-level product walkthrough

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
pnpm install
```

### Run Development

```bash
pnpm dev
```

Or run a specific client:

```bash
pnpm dev:mobile
pnpm dev:web
```

### Typecheck

```bash
pnpm typecheck
```

## License

This project is licensed under the MIT License. See `LICENSE` for details.
