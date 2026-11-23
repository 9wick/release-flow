# release-flow

main・stg・開発ブランチの3段構成で、PR を承認の場にしてリリースするための GitHub Actions です。版番号は PR の title、リリースノートは PR の description に書きます。リポジトリのファイルへ版を書き戻しません。

デプロイそのものは利用側の workflow で書きます。このリポジトリが受け持つのは、Release PR を保つこと、版と原稿を検証すること、デプロイ先の環境と版を決めることの3つです。

## 流れ

![feature を stg に merge すると Release PR が開き、人が版と原稿を書いて merge すると prod に deploy されてタグが付く。hotfix は main へ直接 PR を出す](docs/images/release-flow.svg)

1. 開発ブランチの PR を stg にマージします。stg へデプロイされます。
2. stg が更新されるたびに、`release-pr` が stg→main の Release PR を1件だけ開いておきます。
   - 初回は draft で作り、title に既定値として「最新のリリース + patch」を入れます。人はこれを上書きできます。
   - description には、原稿の区画と PR 一覧の区画を置きます。一覧の区画には、前回のリリースから stg にマージされた PR を bot が書きます。
3. 人が必要なら title の版を上書きし(minor や major を上げるときなど)、原稿の区画に利用者向けの変更内容を書いて、draft を解除します。`check` が版と原稿を検証します。
4. Release PR をマージすると main へデプロイされます。`resolve` が PR の title と description から版と原稿を返します。
5. デプロイが成功したら、タグ `v<版>` を作ります(GitHub Release を作ればタグもできます)。次の Release PR の版はこのタグから決まります。

hotfix は main 宛ての PR を任意のブランチから作れば、同じ手順で出せます。PR を開いたとき(draft なら解除したとき)に `check` が既定の版と空の原稿の区画を入れるので、Release PR と同じ状態から始まります。stg を経由しないので、マージ済み PR の一覧は付きません。

## 誰がいつ書くか

bot が人の持ち分(title と原稿の区画)に書くのは、PR が Release の候補になったときの1回だけです。その後の編集は人のもので、bot は検証してエラーを出すだけです。

| いつ | title | 原稿の区画 | 一覧の区画 |
| --- | --- | --- | --- |
| `release-pr` が Release PR を作るとき | 既定値「最新のリリース + patch」を入れる | 空の区画を入れる | 書く |
| PR が開いたとき、draft を解除したとき(`check`) | 版が書かれていなければ既定値を入れる | なければ空の区画を足す | 触らない |
| その後の編集、push(`check`) | 検証だけ | 検証だけ | 触らない |
| stg への push(`release-pr`) | 触らない | 触らない | 書き直す |
| merge(`resolve`) | 検証だけ | 検証だけ | 触らない |

`v1.3` のように版を書こうとした跡がある title には、既定値を入れません。minor を上げるつもりの書き間違いを、patch で上書きしないためです。`check` がエラーで直す先を示します。

hotfix が開いている Release PR と同じ版で出た場合、Release PR の title は書き換えません。次に Release PR が編集されたときか stg に push されたときに、`check` が次の patch を添えてエラーを出します。それより前に merge されても、`resolve` が止めます。

## description の区画

Release PR の description は、HTML コメントのマーカーで2つの区画に分けます。区画は互いに独立しています。

```markdown
<!-- release-flow:notes -->
利用者向けの変更内容。この区画の中だけが Release の原稿になる。
<!-- /release-flow:notes -->

<!-- release-flow:changes -->
bot が書く PR 一覧。bot はこの区画の中だけを書き換える。
<!-- /release-flow:changes -->
```

区画の外に書いたもの(PR テンプレート、レビュー向けのメモ、他の bot の要約など)は、原稿にも一覧にも入りません。原稿の区画の中の HTML コメントも原稿から除きます。

- 一覧の区画が消されていたら、bot は末尾に作り直します。消された古い一覧は区画の外に残るだけなので、原稿には入りません。

## アクション

すべてのアクションが次の入力を受け取ります。

| 入力 | 既定値 | 意味 |
| --- | --- | --- |
| `token` | `github.token` | GitHub API のトークン |
| `production-branch` | `main` | prod に対応するブランチ |
| `staging-branch` | `stg` | stg に対応するブランチ |
| `tag-prefix` | `v` | リリースのタグの接頭辞。タグ `v1.2.3` が版 `1.2.3` のリリース済みの記録になる |

### `release-pr`

staging-branch に main にないコミットがあれば、staging→production の PR を1件開いておき、description の一覧の区画を更新します。書き換えるのは一覧の区画の中だけで、原稿の区画には触れません。title と原稿の区画は、PR を作るときに既定値を入れるだけで、その後は書き換えません。

| 入力 | 既定値 | 意味 |
| --- | --- | --- |
| `draft` | `true` | 新しい PR を draft で作る。Free プランの private リポジトリは draft を使えないので `false` にする |

出力は `pull-request-number`、`pull-request-url`、`created` です。staging に新しいものがなければ PR を作らず、番号と URL は空になります。

### `check`

main 宛ての PR が開いたときと draft を解除したときは、先に既定値を入れます(「誰がいつ書くか」の表)。そのため `pull-requests: write` の権限が要ります。そのうえで、次の3つを確かめます。

- title が `1.2.3` の形の版番号であること。`v` や `-rc.1` のような接尾辞は付けない。
- その版のタグがまだなく、最新のリリースより新しいこと。
- description の原稿の区画に文章があること。

出力は `version` と `tag` です。

### `resolve`

イベントから、デプロイ先と出すものを決めます。

| 状況 | `environment` | `version` | `sha` |
| --- | --- | --- | --- |
| main への push、または main への PR のマージ | `prod` | Release PR の title | マージコミット |
| stg への push、または stg への PR のマージ | `stg` | `1.2.4-stg.20261123050607` | そのコミット |
| それ以外のブランチ | `dev` | `1.2.4-dev.20261123050607` | そのコミット |

stg と dev の版は「最新のリリース + patch」に UTC の日時を付けたものです。SemVer の順序では最新のリリースより新しく、次のリリースより古くなります。

prod のとき、`notes` に Release PR の原稿の区画の中身を、`pull-request-number` にその PR の番号を返します。マージ時点でも `check` と同じ検証をします。Release PR を開いている間に hotfix が同じ版で出た場合は、ここで止まります。その版のタグが同じコミットにすでにあるときは、失敗したデプロイの再実行とみなして通します。

PR を通らずに main へ push されたコミットには版がないので、失敗します。

## 使い方

[`examples/`](examples/) に3つの workflow があります。

- [`release-pr.yml`](examples/release-pr.yml) は stg への push で Release PR を更新します。
- [`release-check.yml`](examples/release-check.yml) は main 宛ての PR を検証します。
- [`deploy.yml`](examples/deploy.yml) は `resolve` の結果でデプロイし、prod なら GitHub Release を作ります。

リポジトリの設定で次を有効にしてください。

- Settings → Actions → General の **Allow GitHub Actions to create and approve pull requests**。
- main への直接 push を禁止し、`Release version and notes` を必須のチェックにするブランチ保護。

`GITHUB_TOKEN` で作った PR では、他の workflow(CI など)が自動では動きません。PR 画面で承認して動かすか、GitHub App のトークンを `token` に渡してください。

## 開発

依存のない TypeScript を Node 24 の型除去でそのまま動かします。ビルドの工程はありません。

```sh
pnpm install
pnpm typecheck
pnpm test
```
