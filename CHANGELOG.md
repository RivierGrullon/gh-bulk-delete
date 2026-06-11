# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-11

### Added

- Interactive filters: `/text` filters by name, `f` shows only forks, `p` shows only private repos
- Pagination of the repository list based on terminal height (`>` / `<` to navigate)
- Repository list now shows last push date and star count
- Warning before deleting repositories that have stars
- `--dry-run` flag to preview operations without making any changes
- Non-interactive mode: `--match <glob>` and `--forks-only` select repos by pattern; `--yes` skips the confirmation prompt
- `--org <name>` to operate on an organization's repositories
- Archive as a reversible alternative to delete: `r` command in interactive mode and `--archive` flag (already-archived repos are skipped)
- `--help` with usage and examples
- Token prompt input is now hidden (masked with `*`)
- Feedback for unknown commands and out-of-range numbers in interactive mode
- Graceful Ctrl+C handling
- `LICENSE`, `CONTRIBUTING.md` and this changelog

### Fixed

- Private repositories were never listed: the tool used `/users/{username}/repos` (public only); it now uses `/user/repos?affiliation=owner`
- Crash with a confusing `TypeError` when the GitHub API returned an error during repository fetching (rate limit, missing permissions)
- Delete failures showed no reason; the API error is now displayed, including a hint when the token lacks the `delete_repo` scope
- A network error while deleting one repository aborted the remaining deletions
- Typing `DELETE` with surrounding whitespace cancelled the operation instead of confirming
- Piped/scripted input lost lines between prompts
- Missing shebang prevented running as a global binary on some systems
- README stated Node 18+ while `package.json` requires Node 20+

## [1.0.2] - 2025-12-01

Initial published version: interactive selection and bulk deletion of repositories.
