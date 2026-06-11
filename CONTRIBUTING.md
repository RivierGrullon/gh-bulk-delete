# Contributing to gh-bulk-delete

Thanks for your interest in contributing! Issues and pull requests are welcome.

## Reporting bugs

Open an issue at [github.com/RivierGrullon/gh-bulk-delete/issues](https://github.com/RivierGrullon/gh-bulk-delete/issues) and include:

- What you did (command and options used)
- What you expected to happen
- What actually happened (paste the output, **redacting your token**)
- Your Node.js version (`node --version`) and OS

## Development setup

```bash
git clone https://github.com/RivierGrullon/gh-bulk-delete.git
cd gh-bulk-delete
node index.js --help
```

No dependencies to install — the tool uses only Node.js built-ins (Node 20+).

## Testing your changes

This tool deletes repositories, so **never test against your real account
without `--dry-run`**. Recommended ways to test:

1. **Syntax check:** `node --check index.js`
2. **Dry run:** `GITHUB_TOKEN=your_token node index.js --dry-run --match "some-pattern"`
3. **Mocked API:** preload a script that replaces `global.fetch` with fake
   responses, then drive the interactive mode with piped input:

   ```bash
   printf '\na\nd\nDELETE\n' | GITHUB_TOKEN=x node -r ./your-mock.js index.js
   ```

## Pull requests

1. Fork the repo and create a branch from `main`
2. Keep the tool dependency-free (Node.js built-ins only)
3. Match the existing code style (4-space indent, no semicolon omission)
4. Update `README.md` if you add or change options/commands
5. Add an entry to `CHANGELOG.md` under an "Unreleased" heading
6. Open the PR with a clear description of what changed and why

## Safety principles

Changes must preserve these invariants:

- Destructive actions always require explicit confirmation (typing `DELETE`/`ARCHIVE`), unless `--yes` is passed explicitly
- `--dry-run` must never make any write request to the GitHub API
- The token must never be echoed to the screen or written to disk
