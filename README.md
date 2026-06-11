# gh-bulk-delete

A CLI tool to interactively select and delete (or archive) multiple GitHub repositories at once.

## Features

- 📋 Lists all your repositories (public and private) with last-push date and stars
- ✅ Interactive selection with keyboard commands, filters and pagination
- 🔎 Filter by name, forks or private repos
- 📦 Archive repositories instead of deleting (reversible)
- 🏢 Works on your own repos or an organization's repos
- 🤖 Non-interactive mode for scripting (`--match`, `--forks-only`)
- 🔍 Dry-run mode to preview what would happen
- 🛡️ Requires confirmation before deletion and warns about starred repos
- 🔑 Supports environment variable or hidden prompt for token

## Installation

```bash
npm install -g gh-bulk-delete
```

Or run directly with npx:

```bash
npx gh-bulk-delete
```

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click **Generate new token** (classic)
3. Give it a name (e.g., "bulk-delete")
4. Select the `delete_repo` scope (and `repo` if you want to use `--archive`)
5. Generate and copy the token

### 2. Set your token (optional)

You can set the token as an environment variable:

```bash
# Linux/macOS
export GITHUB_TOKEN=your_token_here

# Windows (PowerShell)
$env:GITHUB_TOKEN="your_token_here"

# Windows (CMD)
set GITHUB_TOKEN=your_token_here
```

Or the tool will prompt you for it when you run it (input is hidden).

## Usage

```bash
gh-bulk-delete [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--org <name>` | Operate on an organization's repositories instead of your own |
| `--match <glob>` | Non-interactive: select repos matching a glob (e.g. `"test-*"`) |
| `--forks-only` | Non-interactive: select only forked repositories |
| `--archive` | Archive instead of delete (reversible, needs `repo` scope) |
| `--dry-run` | Show what would happen without making any changes |
| `--yes`, `-y` | Skip the confirmation prompt (non-interactive mode) |
| `-h`, `--help` | Show help |

### Interactive commands

| Command | Action |
|---------|--------|
| `3` | Toggle selection for repo #3 |
| `1,4,7` | Toggle multiple repos |
| `5-15` | Toggle a range |
| `a` | Select all currently shown (respects active filters) |
| `n` | Deselect all |
| `/text` | Filter repos by name (`/` alone clears the filter) |
| `f` | Show only forks (repeat to clear) |
| `p` | Show only private repos (repeat to clear) |
| `>` / `<` | Next / previous page |
| `d` | Delete selected |
| `r` | Archive selected (reversible) |
| `q` | Quit without changes |

### Examples

```bash
# Interactive mode
gh-bulk-delete

# Preview deleting all your forks, without touching anything
gh-bulk-delete --forks-only --dry-run

# Archive every repo whose name starts with "test-"
gh-bulk-delete --match "test-*" --archive

# Delete all forks without confirmation (careful!)
gh-bulk-delete --forks-only --yes

# Work on an organization's repositories
gh-bulk-delete --org my-org
```

### Interactive screen

```
🗑️  SELECT REPOSITORIES
──────────────────────────────────────────────────────────────
 Select:  1,2,3 toggle · 1-5 range · a all shown · n none
 Filter:  /text by name · f forks · p private (repeat to clear)
 Pages:   > next · < prev
 Actions: d delete selected · r archive selected · q quit
──────────────────────────────────────────────────────────────

   1. [ ]    my-old-project    pushed 3y ago
   2. [ ] 🔒 private-repo      pushed 1mo ago
   3. [X]    test-repo (fork)  pushed 2y ago
   4. [X]    another-old-repo  pushed 4y ago  ⭐ 12

📊 Selected: 2 of 4

Command: _
```

## Safety

- The tool requires you to type `DELETE` (or `ARCHIVE`) to confirm
- It warns you when selected repos have stars
- Use `--dry-run` to preview any operation
- Archiving (`r` / `--archive`) is reversible; deletion is **permanent**
- Only repositories you own (or org repos you admin) can be deleted

## Requirements

- Node.js 20+ (for native fetch)
- GitHub Personal Access Token with `delete_repo` scope (`repo` for archiving)

## License

[MIT](LICENSE)

## Contributing

Issues and PRs welcome at [github.com/RivierGrullon/gh-bulk-delete](https://github.com/RivierGrullon/gh-bulk-delete).
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
