# トラブルシューティング

[English](troubleshooting.md) | 日本語 · [← README に戻る](../README.ja.md)

## Release PR が作られない

次の2つを確かめてください。

- workflow の `permissions` に `contents: write` と `pull-requests: write` があること
- リポジトリの **Settings → Actions → General → Workflow permissions** で **Allow GitHub Actions to create and approve pull requests** が有効なこと

ドラフト PR を使えないリポジトリ（GitHub Free プランのプライベートリポジトリなど）では、`release-pr` に `draft: false` を渡してください。

## Release PR で CI が動かない

`GITHUB_TOKEN` で PR を作成すると、`opened` をきっかけにした workflow は承認待ちになります。PR 画面で **Approve workflows to run** を選ぶと実行できます。承認待ちを避ける場合は、`release-pr` の `token` に GitHub App のトークンを渡します。[GitHub のトークンと workflow の起動条件](https://docs.github.com/en/actions/concepts/security/github_token)

[クイックスタート](../README.ja.md#クイックスタート) の `check` は、人がドラフトを解除したとき（`ready_for_review`）にも実行されます。

## `PR title must be a release version such as 1.2.4`

タイトルが `major.minor.patch` の形ではありません。エラーに示された版か、それより新しい版を `1.2.3` の形で書いてください。

## `PR description must contain the release notes`

リリースノート欄が空です。本文の `<!-- release-flow:notes -->` と `<!-- /release-flow:notes -->` の間に書いてください。

## `1.2.4 is already released at <sha>`

その版はほかのコミットでリリース済みです。Release PR を開いている間に、hotfix が同じ版で出た場合に起きることがあります。

- **マージの前なら:** タイトルをエラーに示された版に書き換えてください。
- **マージの後にデプロイで止まった場合:** 再実行ではマージ時点の版を使うため、競合は解消しません。新しい版で本番に出す内容を改めて承認してください。同じコミットを別の版で出す手順が必要なら、導入先で対象コミット・版・リリースノートを指定して承認する手動 workflow を用意します。

## 本番デプロイに失敗した

一時的な失敗なら、Deploy workflow の **Re-run failed jobs** で再実行します。PR マージで起動した実行は、マージ時点のコミット・版・リリースノートを使います。同じ版のタグが同じコミットに作られていれば、`resolve` は再実行として扱います。

## `<sha> on main did not come from a merged PR`

`main` への `push` で起動する既存の workflow で、コミットに対応するマージ済み PR が取得できなかったときに出ます。PR マージを起点にするには、[クイックスタート](../README.ja.md#クイックスタート) に合わせて workflow を変更してください。

## fork からの PR で `check` が失敗する

fork からの PR では `GITHUB_TOKEN` が読み取り専用になるため、PR が開いたときに既定値を入れられません。タイトルとリリースノート欄を手動で書き、PR を編集して検証を再実行します。
