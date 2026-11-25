# Contributing

English | [日本語](CONTRIBUTING.ja.md)

These actions are written in dependency-free TypeScript and run directly on Node 24 using native type stripping—no build step is required.

```sh
pnpm install
pnpm typecheck
pnpm test
```

The workflows in `examples/` must stay identical to the quickstart examples in `README.md` and `README.ja.md`. `test/readme.test.ts` verifies that they match.
