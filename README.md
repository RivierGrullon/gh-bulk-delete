# gh-bulk-delete

A CLI tool to interactively select and delete multiple GitHub repositories at once.

## Features

- 📋 Lists all your repositories
- ✅ Interactive selection with keyboard commands
- 🔒 Shows private repos and forks
- 🛡️ Requires confirmation before deletion
- 🔑 Supports environment variable or prompt for token

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
4. Select the `delete_repo` scope
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

Or the tool will prompt you for it when you run it.

## Usage

```bash
gh-bulk-delete
```

### Commands

| Command | Action |
|---------|--------|
| `3` | Toggle selection for repo #3 |
| `1,4,7` | Toggle multiple repos |
| `5-15` | Select a range |
| `a` | Select all |
| `n` | Deselect all |
| `d` | Proceed to delete selected |
| `q` | Quit without deleting |

### Example

```
┌────────────────────────────────────────────────────────────┐
│            SELECT REPOSITORIES TO DELETE                   │
└────────────────────────────────────────────────────────────┘

  1. [ ]    my-old-project
  2. [ ] 🔒 private-repo
  3. [X]    test-repo (fork)
  4. [X]    another-old-repo

📊 Selected: 2 of 4

Command: _
```

## Safety

- The tool requires you to type `DELETE` to confirm
- Only repositories you own can be deleted
- Deletion is **permanent** and cannot be undone

## Requirements

- Node.js 20+ (for native fetch)
- GitHub Personal Access Token with `delete_repo` scope

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/Riviergrullon/gh-bulk-delete](https://github.com/RivierGrullon/gh-bulk-delete)