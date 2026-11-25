# Troubleshooting

English | [日本語](troubleshooting.ja.md) · [← Back to README](../README.md)

## Release PR is not created

Verify both of the following:

- Your workflow `permissions` include `contents: write` and `pull-requests: write`.
- **Allow GitHub Actions to create and approve pull requests** is enabled under **Settings → Actions → General → Workflow permissions**.

In repositories where draft PRs are unavailable (such as private repositories on the GitHub Free plan), pass `draft: false` to `release-pr`.

## CI workflows do not run on the Release PR

When a PR is created using the default `GITHUB_TOKEN`, workflows triggered by `opened` wait for manual approval—click **Approve workflows to run** on the PR page. To trigger workflows automatically without approval, pass a GitHub App token to `release-pr`'s `token` input. See [Automatic token authentication](https://docs.github.com/en/actions/concepts/security/github_token).

Note that the `check` workflow in the [Quickstart](../README.md#quickstart) also triggers on `ready_for_review` when a human takes the PR out of draft.

## `PR title must be a release version such as 1.2.4`

The PR title does not match `major.minor.patch` format. Set it to the suggested version shown in the error message (or a newer one) in `1.2.3` format.

## `PR description must contain the release notes`

The release notes section is empty. Write user-facing notes between `<!-- release-flow:notes -->` and `<!-- /release-flow:notes -->` in the PR description.

## `1.2.4 is already released at <sha>`

That version was already released on another commit (for example, when a hotfix shipped with the same version while a Release PR was open).

- **Before merging:** Update the PR title to the next valid version shown in the error message.
- **After merging (if deploy failed):** Re-running the failed job keeps using the version from merge time, so the conflict will not resolve itself. Merge a new release under a new version, or—if you must re-ship the exact commit under another version—set up a manual workflow (`workflow_dispatch`) that accepts the target commit, version, and release notes.

## Production deploy failed

For transient failures, click **Re-run failed jobs** on the Deploy workflow. Runs triggered by a merged PR reuse the commit SHA, version, and release notes from merge time. If the tag for that version already points to the same commit, `resolve` treats it as a valid re-run.

## `<sha> on main did not come from a merged PR`

This happens when an existing workflow triggered by `push` to `main` cannot find a merged PR associated with the commit. Switch your deploy workflow to trigger on `pull_request: types: [closed]` as shown in the [Quickstart](../README.md#quickstart).

## `check` fails on PRs from forks

For pull requests from forks, `GITHUB_TOKEN` is read-only, so `check` cannot prefill the default title and notes section when the PR opens. Enter the version title and `<!-- release-flow:notes -->` section manually, then edit the PR to re-trigger the check.
