#!/usr/bin/env node
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('SIGINT', () => {
    console.log('\n\nOperation cancelled.');
    rl.close();
    process.exit(0);
});

// Buffer lines ourselves: rl.question drops lines that arrive between
// questions, which breaks piped/scripted input.
const inputQueue = [];
const inputWaiters = [];

rl.on('line', (line) => {
    const waiter = inputWaiters.shift();
    if (waiter) waiter(line);
    else inputQueue.push(line);
});

// On stdin EOF, answer pending/future prompts with 'q' so the tool
// cancels gracefully instead of hanging.
let stdinClosed = false;
rl.on('close', () => {
    stdinClosed = true;
    inputWaiters.splice(0).forEach(w => w('q'));
});

function readLineAsync() {
    if (inputQueue.length > 0) return Promise.resolve(inputQueue.shift());
    if (stdinClosed) return Promise.resolve('q');
    return new Promise(resolve => inputWaiters.push(resolve));
}

let maskInput = false;
const defaultWriteToOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (str) => {
    if (maskInput) {
        rl.output.write('*'.repeat(str.replace(/[\r\n]/g, '').length));
    } else {
        defaultWriteToOutput(str);
    }
};

async function prompt(q) {
    process.stdout.write(q);
    return readLineAsync();
}

async function promptSecret(q) {
    process.stdout.write(q);
    maskInput = true;
    const answer = await readLineAsync();
    maskInput = false;
    process.stdout.write('\n');
    return answer;
}

let GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim() || null;

// ---------- CLI arguments ----------

function printHelp() {
    console.log(`
🗑️  gh-bulk-delete - Interactively select and delete (or archive) GitHub repositories

Usage: gh-bulk-delete [options]

Without filter options, an interactive selector is shown.
With --match or --forks-only, the matching repos are processed non-interactively.

Options:
  --org <name>      Operate on an organization's repositories instead of your own
  --match <glob>    Select repos whose name matches a glob pattern (e.g. "test-*")
  --forks-only      Select only forked repositories
  --archive         Archive instead of delete (reversible, needs "repo" scope)
  --dry-run         Show what would happen without making any changes
  --yes, -y         Skip the confirmation prompt (non-interactive mode only)
  -h, --help        Show this help

Examples:
  gh-bulk-delete                              Interactive mode
  gh-bulk-delete --forks-only --dry-run       Preview deleting all forks
  gh-bulk-delete --match "test-*" --archive   Archive every repo named test-*
  gh-bulk-delete --org my-org                 Interactive mode on an organization
`);
}

function parseArgs(argv) {
    const args = { dryRun: false, yes: false, forksOnly: false, archive: false, match: null, org: null, help: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--dry-run': args.dryRun = true; break;
            case '--yes': case '-y': args.yes = true; break;
            case '--forks-only': args.forksOnly = true; break;
            case '--archive': args.archive = true; break;
            case '--match':
                args.match = argv[++i];
                if (args.match === undefined) { console.error('Missing value for --match'); process.exit(1); }
                break;
            case '--org':
                args.org = argv[++i];
                if (args.org === undefined) { console.error('Missing value for --org'); process.exit(1); }
                break;
            case '--help': case '-h': args.help = true; break;
            default:
                console.error(`Unknown option: ${a}\nUse --help to see available options.`);
                process.exit(1);
        }
    }
    return args;
}

function globToRegex(glob) {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
}

// ---------- GitHub API ----------

async function githubFetch(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    return fetch(`https://api.github.com${endpoint}`, options);
}

async function apiErrorMessage(response, fallback) {
    let message = fallback;
    try {
        const body = await response.json();
        if (body && body.message) message = body.message;
    } catch {}
    return `${message} (HTTP ${response.status})`;
}

async function getAuthenticatedUser() {
    const response = await githubFetch('/user');
    if (response.status === 401) throw new Error('Invalid or expired token');
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'Failed to verify token'));
    return response.json();
}

async function getAllRepos(org) {
    const repos = [];
    let page = 1;

    process.stdout.write('Fetching repositories');

    while (true) {
        // /user/repos (not /users/{username}/repos) so private repos are included
        const endpoint = org
            ? `/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}&type=all`
            : `/user/repos?per_page=100&page=${page}&affiliation=owner`;
        const response = await githubFetch(endpoint);
        if (response.status === 404 && org) {
            console.log('');
            throw new Error(`Organization "${org}" not found or you have no access to it`);
        }
        if (!response.ok) {
            console.log('');
            throw new Error(await apiErrorMessage(response, 'Failed to fetch repositories'));
        }
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) break;
        repos.push(...data);
        process.stdout.write('.');
        if (data.length < 100) break;
        page++;
    }

    console.log(' Done!\n');
    return repos.sort((a, b) => a.name.localeCompare(b.name));
}

async function deleteRepo(fullName) {
    try {
        const response = await githubFetch(`/repos/${fullName}`, 'DELETE');
        if (response.status === 204) return { ok: true };
        if (response.status === 403) {
            return { ok: false, reason: await apiErrorMessage(response, 'Forbidden - does your token have the delete_repo scope?') };
        }
        return { ok: false, reason: await apiErrorMessage(response, 'Delete failed') };
    } catch (error) {
        return { ok: false, reason: error.message };
    }
}

async function archiveRepo(fullName) {
    try {
        const response = await githubFetch(`/repos/${fullName}`, 'PATCH', { archived: true });
        if (response.ok) return { ok: true };
        if (response.status === 403) {
            return { ok: false, reason: await apiErrorMessage(response, 'Forbidden - does your token have the repo scope?') };
        }
        return { ok: false, reason: await apiErrorMessage(response, 'Archive failed') };
    } catch (error) {
        return { ok: false, reason: error.message };
    }
}

// ---------- Display ----------

function timeAgo(iso) {
    if (!iso) return 'never';
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    const units = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]];
    for (const [label, secs] of units) {
        if (seconds >= secs) return `${Math.floor(seconds / secs)}${label} ago`;
    }
    return 'just now';
}

function repoLabel(repo) {
    const flags = [];
    if (repo.fork) flags.push('fork');
    if (repo.archived) flags.push('archived');
    return repo.name + (flags.length ? ` (${flags.join(', ')})` : '');
}

function formatRepoLine(num, repo, selected, nameWidth) {
    const marker = selected.has(repo.full_name) ? '[X]' : '[ ]';
    const priv = repo.private ? '🔒' : '  ';
    const stars = repo.stargazers_count > 0 ? `  ⭐ ${repo.stargazers_count}` : '';
    return `${String(num).padStart(4)}. ${marker} ${priv} ${repoLabel(repo).padEnd(nameWidth)}  pushed ${timeAgo(repo.pushed_at)}${stars}`;
}

function displayRepos(repos, selected, state) {
    const view = applyFilters(repos, state);
    const pageSize = Math.max(5, (process.stdout.rows || 30) - 15);
    const totalPages = Math.max(1, Math.ceil(view.length / pageSize));
    state.page = Math.min(state.page, totalPages - 1);
    const pageItems = view.slice(state.page * pageSize, (state.page + 1) * pageSize);

    console.clear();
    console.log('🗑️  SELECT REPOSITORIES');
    console.log('──────────────────────────────────────────────────────────────');
    console.log(' Select:  1,2,3 toggle · 1-5 range · a all shown · n none');
    console.log(' Filter:  /text by name · f forks · p private (repeat to clear)');
    console.log(' Pages:   > next · < prev');
    console.log(' Actions: d delete selected · r archive selected · q quit');
    console.log('──────────────────────────────────────────────────────────────\n');

    if (pageItems.length === 0) {
        console.log('  (no repositories match the current filter)');
    } else {
        const nameWidth = Math.max(...pageItems.map(v => repoLabel(v.repo).length));
        pageItems.forEach(v => console.log(formatRepoLine(v.num, v.repo, selected, nameWidth)));
    }

    const filters = [];
    if (state.nameFilter) filters.push(`name~"${state.nameFilter}"`);
    if (state.forksOnly) filters.push('forks');
    if (state.privateOnly) filters.push('private');

    let footer = `\n📊 Selected: ${selected.size} of ${repos.length}`;
    if (filters.length) footer += ` · Filter: ${filters.join(' + ')} (${view.length} shown)`;
    if (totalPages > 1) footer += ` · Page ${state.page + 1}/${totalPages}`;
    console.log(footer);
}

function applyFilters(repos, state) {
    return repos
        .map((repo, i) => ({ repo, num: i + 1 }))
        .filter(v => !state.forksOnly || v.repo.fork)
        .filter(v => !state.privateOnly || v.repo.private)
        .filter(v => !state.nameFilter || v.repo.name.toLowerCase().includes(state.nameFilter));
}

// ---------- Interactive selection ----------

function toggle(selected, repo) {
    selected.has(repo.full_name)
        ? selected.delete(repo.full_name)
        : selected.add(repo.full_name);
}

async function interactiveSelect(repos) {
    const selected = new Set();
    const state = { nameFilter: null, forksOnly: false, privateOnly: false, page: 0 };

    while (true) {
        displayRepos(repos, selected, state);
        const input = await prompt('\nCommand: ');
        const cmd = input.trim().toLowerCase();
        const view = applyFilters(repos, state);

        if (cmd === '') continue;

        if (cmd === 'q') return null;

        if (cmd === 'd' || cmd === 'r') {
            if (selected.size === 0) {
                await prompt('No repositories selected. Press Enter...');
                continue;
            }
            return {
                action: cmd === 'd' ? 'delete' : 'archive',
                repos: repos.filter(r => selected.has(r.full_name))
            };
        }

        if (cmd === 'a') {
            view.forEach(v => selected.add(v.repo.full_name));
            continue;
        }

        if (cmd === 'n') {
            selected.clear();
            continue;
        }

        if (cmd === 'f') {
            state.forksOnly = !state.forksOnly;
            state.page = 0;
            continue;
        }

        if (cmd === 'p') {
            state.privateOnly = !state.privateOnly;
            state.page = 0;
            continue;
        }

        if (cmd === '>' || cmd === 'next') {
            state.page++;
            continue;
        }

        if (cmd === '<' || cmd === 'prev') {
            state.page = Math.max(0, state.page - 1);
            continue;
        }

        if (cmd.startsWith('/')) {
            state.nameFilter = cmd.slice(1).trim() || null;
            state.page = 0;
            continue;
        }

        if (/^\d+\s*-\s*\d+$/.test(cmd)) {
            const [start, end] = cmd.split('-').map(n => parseInt(n.trim()));
            const lo = Math.min(start, end), hi = Math.max(start, end);
            view.forEach(v => {
                if (v.num >= lo && v.num <= hi) toggle(selected, v.repo);
            });
            continue;
        }

        if (/^\d+(\s*,\s*\d+)*$/.test(cmd)) {
            const numbers = cmd.split(',').map(n => parseInt(n.trim()));
            const byNum = new Map(view.map(v => [v.num, v.repo]));
            const invalid = [];
            numbers.forEach(num => {
                if (byNum.has(num)) {
                    toggle(selected, byNum.get(num));
                } else {
                    invalid.push(num);
                }
            });
            if (invalid.length > 0) {
                await prompt(`Not shown with the current filter/list: ${invalid.join(', ')}. Press Enter...`);
            }
            continue;
        }

        await prompt(`Unknown command: "${cmd}". Press Enter...`);
    }
}

// ---------- Execution ----------

async function confirmAndExecute(targets, action, options) {
    const { dryRun, yes } = options;
    const actionWord = action === 'delete' ? 'DELETE' : 'ARCHIVE';
    const icon = action === 'delete' ? '🗑️' : '📦';

    console.clear();
    if (action === 'delete') {
        console.log(`\n⚠️  WARNING: This will PERMANENTLY delete:\n`);
    } else {
        console.log(`\n📦 The following repositories will be archived (reversible):\n`);
    }
    targets.forEach(r => {
        const stars = r.stargazers_count > 0 ? `  ⭐ ${r.stargazers_count}` : '';
        console.log(`  ${icon}  ${r.full_name}  (pushed ${timeAgo(r.pushed_at)})${stars}`);
    });
    console.log(`\nTotal: ${targets.length} repository(ies)\n`);

    const starred = targets.filter(r => r.stargazers_count > 0);
    if (starred.length > 0 && action === 'delete') {
        console.log(`⚠️  ${starred.length} of them have stars - double-check before continuing!\n`);
    }

    if (dryRun) {
        console.log('🔎 Dry run: no changes will be made.\n');
        targets.forEach(r => console.log(`[dry-run] Would ${action} ${r.full_name}`));
        console.log(`\nDry run finished. ${targets.length} repository(ies) would be ${action}d.\n`);
        return;
    }

    if (!yes) {
        const confirm = await prompt(`Type "${actionWord}" to confirm: `);
        if (confirm.trim() !== actionWord) {
            console.log('\nOperation cancelled.');
            return;
        }
    }

    const verb = action === 'delete' ? 'Deleting' : 'Archiving';
    console.log(`\n${icon}  ${verb} repositories...\n`);

    let success = 0, skipped = 0;
    const failures = [];

    for (const repo of targets) {
        process.stdout.write(`${verb} ${repo.full_name}... `);
        if (action === 'archive' && repo.archived) {
            console.log('already archived, skipped');
            skipped++;
            continue;
        }
        const result = action === 'delete'
            ? await deleteRepo(repo.full_name)
            : await archiveRepo(repo.full_name);
        if (result.ok) {
            console.log('✓');
            success++;
        } else {
            console.log(`✗ ${result.reason}`);
            failures.push({ fullName: repo.full_name, reason: result.reason });
        }
    }

    console.log('\n════════════════════════');
    console.log(`✓ ${action === 'delete' ? 'Deleted' : 'Archived'}: ${success}`);
    if (skipped > 0) console.log(`- Skipped: ${skipped}`);
    console.log(`✗ Failed: ${failures.length}`);
    console.log('════════════════════════\n');

    if (failures.length > 0) {
        console.log('Failed repositories:');
        failures.forEach(f => console.log(`  ✗ ${f.fullName}: ${f.reason}`));
        console.log('');
    }
}

// ---------- Main ----------

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printHelp();
        rl.close();
        return;
    }

    console.log('\n🗑️  GitHub Bulk Repository Deleter\n');

    if (!GITHUB_TOKEN) {
        GITHUB_TOKEN = (await promptSecret('Enter your GitHub token: ')).trim();
        if (!GITHUB_TOKEN) {
            console.log('Token is required.');
            rl.close();
            return;
        }
    }

    console.log('\n🔐 Verifying token...\n');

    try {
        const user = await getAuthenticatedUser();
        console.log(`✓ Authenticated as: ${user.login}\n`);
        if (args.org) console.log(`🏢 Organization: ${args.org}\n`);

        const repos = await getAllRepos(args.org);

        if (repos.length === 0) {
            console.log('No repositories found.');
            rl.close();
            return;
        }

        const nonInteractive = args.match !== null || args.forksOnly;
        let action, targets;

        if (nonInteractive) {
            const matcher = args.match ? globToRegex(args.match) : null;
            targets = repos
                .filter(r => !args.forksOnly || r.fork)
                .filter(r => !matcher || matcher.test(r.name));
            action = args.archive ? 'archive' : 'delete';

            if (targets.length === 0) {
                console.log('No repositories match the given filters.');
                rl.close();
                return;
            }
        } else {
            console.log(`✓ Found ${repos.length} repositories\n`);
            await prompt('Press Enter to continue...');

            const result = await interactiveSelect(repos);
            if (!result) {
                console.log('\nOperation cancelled.');
                rl.close();
                return;
            }
            action = args.archive && result.action === 'delete' ? 'archive' : result.action;
            targets = result.repos;
        }

        await confirmAndExecute(targets, action, args);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
    }

    rl.close();
}

main();
