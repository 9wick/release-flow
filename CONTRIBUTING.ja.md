# 開発

[English](CONTRIBUTING.md) | 日本語

アクションは依存のない TypeScript で、Node 24 の型除去でそのまま動きます。ビルドの工程はありません。

```sh
pnpm install
pnpm typecheck
pnpm test
```

`examples/` の workflow は、`README.md` と `README.ja.md` のクイックスタートと同じ内容です。`test/readme.test.ts` が一致を確かめます。
