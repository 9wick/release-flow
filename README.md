# release-flow

[![CI](https://github.com/9wick/release-flow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/9wick/release-flow/actions/workflows/ci.yml)

release-flow は、`stg` に入った変更を Release PR で確認し、`main` にマージして本番に出すための GitHub Actions です。次に出る変更は PR に自動でまとまり、リリースする版とリリースノートは人が決めます。デプロイは各リポジトリの workflow が行います。

## リリースの流れ

![開発ブランチから stg、Release PR を経て main に進むリリースの流れと、main へ直接 PR を出す hotfix の流れ](docs/images/release-flow.svg)

1. 開発ブランチの PR を **`stg` にマージ**します。`stg` から `main` への Release PR がドラフトで開き、前回のリリース以降の変更が本文に並びます。Release PR を開いたまま `stg` に変更を積むと、同じ PR の一覧が更新されます。
2. **本番に出すと決めたら**、Release PR のタイトルで版を確認し、本文のリリースノート欄に利用者向けの変更を書きます。たとえば前回が `1.2.3` なら初期値は `1.2.4` です。minor や major を上げるときは、タイトルを `1.3.0` や `2.0.0` に変えます。
3. **ドラフトを解除**し、`Release version and notes` が通ったら **`main` にマージ**します。マージが本番リリースの承認です。`stg` からの Release PR では **Create a merge commit** を選び、`stg` のコミット履歴を `main` に取り込みます。
4. **`main` へのマージで本番デプロイ**が始まります。下の workflow 例では、成功後に `v1.2.4` のようなタグと GitHub Release を作ります。このタグを基に、次のリリースの版が提案されます。

### `stg` を通さずに出す（hotfix）

`main` から修正用のブランチを切り、`main` 宛ての PR を開きます。通常のリリースと同じようにタイトルで版を指定し、本文にリリースノートを書いてマージします。変更一覧は付きません。リリース後は `main` から `stg` に PR を出してマージし、修正を `stg` にも取り込みます。

## 導入

以下は、本番ブランチが `main`、ステージングブランチが `stg` のリポジトリ向けの例です。

### 1. リポジトリを設定する

- **Settings → Actions → General → Workflow permissions** で **Allow GitHub Actions to create and approve pull requests** を有効にします。
- `main` への変更は PR 経由にします。`stg` の履歴を取り込めるよう、`main` 宛ての PR でマージコミットを使える設定にします。

### 2. workflow を配置する

以下の3ファイルを `.github/workflows/` に置きます。

#### `stg` が進んだら Release PR を更新する

`release-pr` は、`stg` に `main` に入っていないコミットがあるときに Release PR を開きます。開いている PR があれば、同じ PR の変更一覧を更新します。

```yaml
# .github/workflows/release-pr.yml
name: Release PR
on:
  push:
    branches: [stg]
permissions:
  contents: write # the release notes API requires it
  pull-requests: write
concurrency:
  group: release-pr
  cancel-in-progress: true
jobs:
  release-pr:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: 9wick/release-flow/release-pr@v1
```

#### `main` 宛ての PR を検証する

`check` は、PR のタイトルにある版と、本文のリリースノートを検証します。この例では、ドラフトを解除してからチェックを実行します。

```yaml
# .github/workflows/release-check.yml
name: Release check
on:
  pull_request:
    types: [opened, edited, reopened, synchronize, ready_for_review]
    branches: [main]
permissions:
  contents: read
  pull-requests: write # to fill in the defaults when a PR opens or leaves draft
concurrency:
  group: release-check-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  check:
    name: Release version and notes
    # People are still writing while the PR is a draft
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: 9wick/release-flow/check@v1
```

#### 既存のデプロイにつなぐ

`resolve` は、デプロイ先の環境・版・コミットを workflow に渡します。この例は `main`、`stg`、`develop` への push で実行し、本番デプロイの成功後に GitHub Release とタグを作ります。対象ブランチと `./scripts/deploy.sh` は、自分のリポジトリに合わせてください。環境ごとに workflow を分けている場合も、それぞれから `resolve` を呼べます。

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main, stg, develop]
permissions:
  contents: write # to record the prod release
  pull-requests: read # to find the release PR behind a push to main
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - id: release
        uses: 9wick/release-flow/resolve@v1

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          ref: ${{ steps.release.outputs.sha }}
          persist-credentials: false

      - name: Deploy
        env:
          ENVIRONMENT: ${{ steps.release.outputs.environment }}
          VERSION: ${{ steps.release.outputs.version }}
        run: ./scripts/deploy.sh "$ENVIRONMENT" "$VERSION"

      # The tag is the record of what prod runs, and the next release PR's version builds on it
      - name: Record the prod release
        if: ${{ steps.release.outputs.environment == 'prod' }}
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          TAG: ${{ steps.release.outputs.tag }}
          SHA: ${{ steps.release.outputs.sha }}
          NOTES: ${{ steps.release.outputs.notes }}
        run: gh release view "$TAG" > /dev/null 2>&1 || gh release create "$TAG" --target "$SHA" --title "$TAG" --notes "$NOTES"
```

### 3. 初回のリリースを確認する

すでに本番を運用している場合は、現在本番で動いているコミットに、現在の版のタグ（例 `v1.2.3`）があることを確認します。タグがなければそのコミットに付けます。リリースのタグが一つもない場合、最初の版の初期値は `0.0.1` です。

[リリースの流れ](#リリースの流れ)に沿って、`stg` へのマージで Release PR が開き、本番デプロイの成功後にタグとリリースノート付きの GitHub Release が作られることを確認します。初回の `Release version and notes` が成功したら、`main` の必須チェックに追加します。[GitHub の必須ステータスチェック](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## 設定とトラブルシューティング

### Release PR のタイトルと本文

タイトルは `1.2.3` のように `major.minor.patch` で書きます。指定する版は、最新のリリースより新しく、対応するタグが存在しない版です。版は PR から取得するため、リリース用の版更新コミットを作らずに運用できます。

本文では、`notes` のコメントに挟まれた部分にリリースノートを書きます。`changes` の部分には `release-pr` が変更一覧を書き、`stg` が進むたびに更新します。

```markdown
<!-- release-flow:notes -->
同期の完了までにかかる時間を短縮しました。
<!-- /release-flow:notes -->

<!-- release-flow:changes -->
* Faster sync by @someone in #12
<!-- /release-flow:changes -->
```

GitHub Release に使うのは `notes` 内の文章です。欄内の HTML コメント、変更一覧、欄外のメモは含まれません。

`release-pr` は PR の作成時にタイトルの初期値と空の `notes` 欄を入れます。`check` も PR を開いたときかドラフトを解除したときに、不足している初期値を補います。版らしいタイトル（例 `v1.3`）は保持され、形式の誤りがチェックで報告されます。その後の編集では、タイトルとリリースノートを検証します。

### 版の決まり方

| 種類 | 例 | 決まり方 |
| --- | --- | --- |
| リリースの版 | `1.3.0` | マージした PR のタイトル |
| 最新のリリース | `1.2.3` | `v<major>.<minor>.<patch>` の形のタグのうち、SemVer で最も大きいもの |
| `stg` と開発ブランチの版 | `1.2.4-stg.20261123050607` | 次の patch 版に、環境名と UTC の日時を付けたもの |

`stg` と開発ブランチの版は、SemVer の順序で最新のリリースより新しく、次のリリースより古くなります。これらはタグにしません。`v1.2.4-stg.…` のようなタグがあっても、リリースとしては数えません。

### アクションの入出力と権限

#### 共通の入力

| 入力 | 既定値 | 説明 |
| --- | --- | --- |
| `token` | `${{ github.token }}` | GitHub API のトークン |
| `production-branch` | `main` | 本番ブランチの名前 |
| `staging-branch` | `stg` | ステージングブランチの名前 |
| `tag-prefix` | `v` | リリースのタグの接頭辞 |

ブランチ名を変える場合は、3つのアクションの `with` と workflow のトリガーに同じブランチ名を設定します。タグの接頭辞を変える場合は、3つとも同じ `tag-prefix` を指定します。

#### `release-pr`

権限は `contents: write` と `pull-requests: write` です。`contents: write` は GitHub のリリースノート生成 API が要求します。

| 入力 | 既定値 | 説明 |
| --- | --- | --- |
| `draft` | `true` | PR をドラフトで作る |

| 出力 | 説明 |
| --- | --- |
| `pull-request-number` | Release PR の番号。ステージングに新しいコミットがなければ空 |
| `pull-request-url` | Release PR の URL。ステージングに新しいコミットがなければ空 |
| `created` | この実行で PR を作ったときは `true` |

#### `check`

検証に失敗すると、エラーに次に使える版が表示されます。

権限は `contents: read` と `pull-requests: write` です。`pull-requests: write` は既定値を入れるときに要ります。

| 出力 | 説明 |
| --- | --- |
| `version` | タイトルの版。例 `1.3.0` |
| `tag` | リリースで付けるタグ。例 `v1.3.0` |

#### `resolve`

`push` では push 先、マージされた `pull_request` ではベースブランチ、マージ前の `pull_request` では PR の head ブランチから環境を決めます。

| きっかけ | `environment` | `version` | `sha` |
| --- | --- | --- | --- |
| 本番ブランチへの push、本番ブランチ宛ての PR のマージ | `prod` | マージした PR のタイトル | マージ結果のコミット |
| ステージングブランチへの push、ステージングブランチ宛ての PR のマージ | `stg` | `1.2.4-stg.<UTC の日時>` | そのコミット |
| ほかのブランチ | `dev` | `1.2.4-dev.<UTC の日時>` | そのコミット |

`prod` のときは、`check` と同じ検証をもう一度行います。同じ版のタグが同じコミットにあるときは、やり直しとして通します。本番ブランチへの push に対応するマージ済み PR が見つからないときは失敗します。

権限は `contents: read` と `pull-requests: read` です。`pull-requests: read` は、push に対応するマージ済み PR の検索に使います。

| 出力 | 説明 |
| --- | --- |
| `environment` | `prod`、`stg`、`dev` のどれか |
| `version` | 出す版 |
| `tag` | `tag-prefix` を付けた版。`prod` では、デプロイが成功したらこのタグを作る |
| `notes` | `prod` ではリリースノート欄の中身。ほかでは空 |
| `sha` | デプロイするコミット |
| `pull-request-number` | `prod` ではマージした PR の番号。ほかでは空 |

### トラブルシューティング

#### Release PR が作られない

次の2つを確かめてください。

- workflow の `permissions` に `contents: write` と `pull-requests: write` があること
- リポジトリの **Settings → Actions → General → Workflow permissions** で **Allow GitHub Actions to create and approve pull requests** が有効なこと

ドラフト PR を使えないリポジトリでは、`release-pr` に `draft: false` を渡してください。

#### Release PR で CI が動かない

`GITHUB_TOKEN` で PR を作成すると、`opened` をきっかけにした workflow は承認待ちになります。PR 画面で **Approve workflows to run** を選ぶと実行できます。承認待ちを避ける場合は、`release-pr` の `token` に GitHub App のトークンを渡します。[GitHub のトークンと workflow の起動条件](https://docs.github.com/en/actions/concepts/security/github_token)

上の導入例の `check` は、人がドラフトを解除したときにも実行されます。

#### `PR title must be a release version such as 1.2.4`

タイトルが版の形ではありません。エラーに示された版か、それより新しい版を `1.2.3` の形で書いてください。

#### `PR description must contain the release notes`

リリースノート欄が空です。本文の `<!-- release-flow:notes -->` と `<!-- /release-flow:notes -->` の間に書いてください。

#### `1.2.4 is already released at <sha>`

その版はほかのコミットでリリース済みです。Release PR を開いている間に、hotfix が同じ版で出た場合に起きることがあります。

- マージの前なら、タイトルをエラーに示された版に書き換えてください。
- マージの後にデプロイで止まったなら、マージ済みの PR のタイトルを書き換えてから、デプロイの workflow をやり直してください。

マージの後に タイトルを書き換える方法は、デプロイを `push` で動かしているときだけ効きます。`pull_request` の `closed` で動かしている場合、やり直しでも元のイベントのタイトルが使われます。

#### 本番デプロイに失敗した

Deploy workflow の **Re-run failed jobs** で失敗したジョブを再実行します。同じ版のタグが同じコミットに作られていれば、`resolve` は再実行として扱います。

#### `<sha> on main did not come from a merged PR`

PR を通らずに `main` へ push されたコミットです。版がないのでデプロイできません。`main` への直接の push を禁止してください。

#### fork からの PR で `check` が失敗する

fork からの PR では `GITHUB_TOKEN` が読み取り専用になるため、PR が開いたときに既定値を入れられません。タイトルとリリースノート欄を手動で書き、PR を編集して検証を再実行します。

[このリポジトリの開発手順](CONTRIBUTING.md)
