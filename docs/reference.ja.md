# 設定とアクションリファレンス

[English](reference.md) | 日本語 · [← README に戻る](../README.ja.md)

## Release PR のタイトルと本文

### タイトル

タイトルは `1.2.3` のように `major.minor.patch` で書きます（先頭の `v` や接尾辞は付けません）。指定する版は、最新のリリースより新しく、対応するタグが存在しない版です。版は PR タイトルから取得するため、リリース用の版更新コミットを作らずに運用できます。

### 本文

`notes` のコメントに挟まれた部分にリリースノートを書きます。`changes` の部分には `release-pr` が変更一覧を書き、`stg` が進むたびに更新します。

```markdown
## Release Notes
> Edit before merging. The text below becomes the release notes for this version.

<!-- release-flow:notes -->
同期の完了までにかかる時間を短縮しました。
<!-- /release-flow:notes -->

<!-- release-flow:changes -->
* Faster sync by @someone in #12
<!-- /release-flow:changes -->
```

GitHub Release に使うのは `notes` 内の文章だけです。欄内の HTML コメント、変更一覧（`changes`）、`Release Notes` 見出しを含む欄外の文章は含まれません。

`release-pr` は PR の作成時にタイトルの初期値と、表示画面で見える `Release Notes` 見出し付きの空の `notes` 欄を入れます。`check` も PR を開いたとき（`opened`）かドラフトを解除したとき（`ready_for_review`）に、不足している初期値を補います。版らしいタイトル（例 `v1.3`）は上書きせずに保持し、形式の誤りをチェックで報告します。その後の編集では、タイトルとリリースノートを検証します。

## 版の決まり方

| 種類 | 例 | 決まり方 |
| --- | --- | --- |
| リリースの版 | `1.3.0` | マージした PR のタイトル |
| 最新のリリース | `1.2.3` | `<tag-prefix><major>.<minor>.<patch>` の形のタグのうち、SemVer で最も大きいもの |
| `stg` の版 | `1.2.4-stg.0` | 次の patch 版に、`staging-prerelease`（既定値 `stg`）と連番を付けたもの。連番はリリースごとに 0 から数え直す |
| 開発ブランチの版 | `1.2.4-dev.20261123050607` | 次の patch 版に、`development-prerelease`（既定値 `dev`）と UTC の日時を付けたもの |

`stg` と開発ブランチの版は、SemVer の順序で最新のリリースより新しく、次のリリースより古くなります。`stg` の版は `resolve` がタグ（例 `v1.2.4-stg.0`）にして、次の連番をそこから数えます。同じコミットでやり直したときは同じ版を使います。開発ブランチの版はタグにしません。`v1.2.4-stg.0` のようなプレリリースタグは、最新のリリースとしては数えません。

## アクション仕様

### 共通の入力

| 入力 | 既定値 | 説明 |
| --- | --- | --- |
| `token` | `${{ github.token }}` | GitHub API のトークン |
| `production-branch` | `main` | 本番ブランチの名前 |
| `staging-branch` | `stg` | ステージングブランチの名前 |
| `tag-prefix` | `v` | リリースのタグの接頭辞 |

ブランチ名を変える場合は、3つのアクションの `with` と workflow のトリガーに同じブランチ名を設定します。タグの接頭辞を変える場合は、3つとも同じ `tag-prefix` を指定します。

### `release-pr`

権限は `contents: write`（GitHub のリリースノート生成 API が要求）と `pull-requests: write` です。

| 入力 | 既定値 | 説明 |
| --- | --- | --- |
| `draft` | `true` | PR をドラフトで作る |

| 出力 | 説明 |
| --- | --- |
| `pull-request-number` | Release PR の番号。ステージングに新しいコミットがなければ空 |
| `pull-request-url` | Release PR の URL。ステージングに新しいコミットがなければ空 |
| `created` | この実行で PR を作ったときは `true` |

### `check`

権限は `contents: read` と `pull-requests: write`（既定値を入れるときに必要）です。検証に失敗すると、エラーに次に使える版が表示されます。

| 出力 | 説明 |
| --- | --- |
| `version` | タイトルの版。例 `1.3.0` |
| `tag` | リリースで付けるタグ。例 `v1.3.0` |

### `resolve`

マージされた `pull_request` ではベースブランチ、マージ前の `pull_request` では PR の head ブランチから環境を決めます。`push` や `workflow_dispatch` では workflow が実行されたブランチを使います。

| きっかけ | `environment` | `version` | `sha` |
| --- | --- | --- | --- |
| 本番ブランチ宛ての PR のマージ | `prod` | マージ時点の PR タイトル | マージ結果のコミット |
| ステージングブランチ宛ての PR のマージ、ステージングブランチへの `push` や `workflow_dispatch` | `stg` | `1.2.4-<staging-prerelease>.<連番>` | マージ結果または実行対象のコミット |
| ほかのブランチ | `dev` | `1.2.4-<development-prerelease>.<UTC の日時>` | そのコミット |

`prod` のときは、`check` と同じ検証をもう一度行います。同じ版のタグが同じコミットにあるときは、やり直しとして通します。

#### 権限

- タグの参照には `contents: read`、`stg` の版のタグ作成には `contents: write` が必要です。
- 既存の workflow が本番ブランチへの `push` で起動する場合は、コミットに対応するマージ済み PR の検索に `pull-requests: read` も必要です（該当する PR が見つからない場合は失敗します）。

#### キャッシュと開発環境へのデプロイ

- `stg` のデプロイにビルドキャッシュを設定すると、`stg` への push で動く実行間で共有できます。[GitHub Actions のキャッシュのスコープ](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)
- 開発環境へのデプロイが必要なら、`push` や `workflow_dispatch` で起動する workflow から `resolve` を呼べます。

#### 入力と出力

| 入力 | 既定値 | 説明 |
| --- | --- | --- |
| `staging-prerelease` | `stg` | `stg` の版の pre-release ラベル。`beta` にすると `1.2.4-beta.0` |
| `development-prerelease` | `dev` | 開発ブランチの版の pre-release ラベル。`alpha` にすると `1.2.4-alpha.20261123050607` |

ラベルには英数字とハイフンを使い、数字だけにはしません。ラベルを変えても `environment` の値は変わりません。`stg` の連番はラベルごとに数えるので、途中で変えると新しいラベルの 0 から始まります。

| 出力 | 説明 |
| --- | --- |
| `environment` | `prod`、`stg`、`dev` のどれか |
| `version` | 出す版 |
| `tag` | `tag-prefix` を付けた版。`prod` ではデプロイ成功後にこのタグを作る。`stg` では `resolve` が作成済み |
| `notes` | `prod` ではリリースノート欄の中身。ほかでは空 |
| `sha` | デプロイするコミット |
| `pull-request-number` | `prod` ではマージした PR の番号。ほかでは空 |
