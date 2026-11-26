# Configuration & Action Reference

English | [日本語](reference.ja.md) · [← Back to README](../README.md)

## Release PR Title & Body

### Title

Write the version in `major.minor.patch` format (e.g., `1.2.3`) without a leading `v` or suffix. The version must be newer than the latest release and must not already have a matching tag. Because the version lives in the PR title, you do not need version-bump commits.

### Body

Write user-facing release notes between the `notes` comment markers. `release-pr` writes and updates the generated change list inside the `changes` markers whenever `stg` advances:

```markdown
## Release Notes
> Edit before merging. This section is copied to the GitHub Release when the PR is merged.

<!-- release-flow:notes -->
Reduced sync completion time.
<!-- /release-flow:notes -->

<!-- release-flow:changes -->
* Faster sync by @someone in #12
<!-- /release-flow:changes -->
```

Only the text inside `notes` is included in the GitHub Release (HTML comments inside the section, the `changes` section, and any text outside the markers, including the `Release Notes` heading, are excluded).

When `release-pr` opens a PR, it fills in the default title and an empty `notes` section under a visible `Release Notes` heading. When `check` runs on `opened` or `ready_for_review`, it also fills in any missing defaults. Existing version-like titles (e.g., `v1.3`) are preserved so `check` reports the format error instead of overwriting them. Subsequent edits validate both the title and release notes.

## Versioning

| Kind | Example | How it is determined |
| --- | --- | --- |
| Release version | `1.3.0` | Title of the merged PR |
| Latest release | `1.2.3` | Highest SemVer tag matching `<tag-prefix><major>.<minor>.<patch>` |
| `stg` version | `1.2.4-stg.0` | Next patch version + `staging-prerelease` (default `stg`) + sequence number (resets to `0` after each release) |
| Development branch version | `1.2.4-dev.20261123050607` | Next patch version + `development-prerelease` (default `dev`) + UTC timestamp |

Pre-release versions for `stg` and development branches sort after the latest release and before the next release in SemVer order. `resolve` creates a tag (e.g., `v1.2.4-stg.0`) for `stg` builds so the next run increments from it, and reuses the same version if re-run on the same commit. Development branch versions are not tagged. Pre-release tags such as `v1.2.4-stg.0` are ignored when determining the latest release.

## Actions

### Common Inputs

| Input | Default | Description |
| --- | --- | --- |
| `token` | `${{ github.token }}` | GitHub API token |
| `production-branch` | `main` | Name of the production branch |
| `staging-branch` | `stg` | Name of the staging branch |
| `tag-prefix` | `v` | Prefix for release tags |

If you customize branch names, pass the same `production-branch` / `staging-branch` values to all three actions and update your workflow triggers to match. If you customize `tag-prefix`, pass the same value to all three actions.

### `release-pr`

Requires `contents: write` (needed by GitHub's generate-release-notes API) and `pull-requests: write`.

| Input | Default | Description |
| --- | --- | --- |
| `draft` | `true` | Open new Release PRs as drafts |

| Output | Description |
| --- | --- |
| `pull-request-number` | Release PR number (empty if `stg` has no commits ahead of `main`) |
| `pull-request-url` | Release PR URL (empty if `stg` has no commits ahead of `main`) |
| `created` | `"true"` when this run created a new PR |

### `check`

Requires `contents: read` and `pull-requests: write` (for filling in defaults when a PR opens or leaves draft). On validation failure, the error message includes the next valid version.

| Output | Description |
| --- | --- |
| `version` | Version from the PR title (e.g., `1.3.0`) |
| `tag` | Tag that will be created on release (e.g., `v1.3.0`) |

### `resolve`

Determines the target environment from the base branch for merged `pull_request` events, the head branch for open `pull_request` events, or the current branch for `push` and `workflow_dispatch` events.

| Trigger | `environment` | `version` | `sha` |
| --- | --- | --- | --- |
| Merged PR targeting `production-branch` | `prod` | PR title at merge time | Merge commit |
| Merged PR targeting `staging-branch`, or `push` / `workflow_dispatch` on `staging-branch` | `stg` | `1.2.4-<staging-prerelease>.<seq>` | Merge or triggered commit |
| Any other branch | `dev` | `1.2.4-<development-prerelease>.<UTC timestamp>` | Triggered commit |

For `prod`, `resolve` re-runs the same validation as `check`; if a tag for that version already points to the same commit, it passes as a re-run.

#### Permissions

- `contents: read` to inspect tags, or `contents: write` to tag `stg` versions.
- `pull-requests: read` is also required if your deploy workflow runs on `push` to `main`, so `resolve` can look up the merged PR for the commit (it fails if no merged PR is found).

#### Deployment Caching & Dev Environments

- Configuring build caching on `stg` deploys lets consecutive runs triggered by pushes to `stg` share caches across runs. See [GitHub Actions cache scope](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).
- To deploy development branches, call `resolve` from a workflow triggered on `push` or `workflow_dispatch`.

#### Inputs & Outputs

| Input | Default | Description |
| --- | --- | --- |
| `staging-prerelease` | `stg` | Pre-release label for `stg` versions (e.g., `beta` produces `1.2.4-beta.0`) |
| `development-prerelease` | `dev` | Pre-release label for other branches (e.g., `alpha` produces `1.2.4-alpha.20261123050607`) |

Pre-release labels may contain ASCII letters, digits, and hyphens, and must include at least one non-digit character. Changing a label does not change `environment`. Because `stg` sequence numbers are counted per label, changing `staging-prerelease` starts a new sequence at `0`.

| Output | Description |
| --- | --- |
| `environment` | `prod`, `stg`, or `dev` |
| `version` | Resolved version |
| `tag` | Version prefixed with `tag-prefix` (`prod` deploys should create this tag on success; `stg` tags are already created by `resolve`) |
| `notes` | Contents of the `notes` section on `prod`; empty otherwise |
| `sha` | Commit SHA to deploy |
| `pull-request-number` | Merged PR number on `prod`; empty otherwise |
