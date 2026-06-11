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

const prompt = (q) => new Promise(resolve => rl.question(q, resolve));

const promptSecret = (q) => new Promise(resolve => {
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = (str) => {
        if (str.includes(q)) {
            rl.output.write(q);
        } else {
            rl.output.write('*'.repeat(str.replace(/[\r\n]/g, '').length));
        }
    };
    rl.question(q, (answer) => {
        rl._writeToOutput = originalWrite;
        rl.output.write('\n');
        resolve(answer);
    });
});

let GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim() || null;

async function githubFetch(endpoint, method = 'GET') {
    const response = await fetch(`https://api.github.com${endpoint}`, {
        method,
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    return response;
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

async function getAllRepos() {
    const repos = [];
    let page = 1;

    process.stdout.write('Fetching repositories');

    while (true) {
        // /user/repos (not /users/{username}/repos) so private repos are included
        const response = await githubFetch(`/user/repos?per_page=100&page=${page}&affiliation=owner`);
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

function displayRepos(repos, selected) {
    console.clear();
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│            SELECT REPOSITORIES TO DELETE                   │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Commands:                                                 │');
    console.log('│    1,2,3    - Toggle selection                             │');
    console.log('│    1-5      - Toggle range                                 │');
    console.log('│    a        - Select all                                   │');
    console.log('│    n        - Deselect all                                 │');
    console.log('│    d        - Delete selected                              │');
    console.log('│    q        - Quit                                         │');
    console.log('└────────────────────────────────────────────────────────────┘\n');

    repos.forEach((repo, i) => {
        const marker = selected.has(repo.full_name) ? '[X]' : '[ ]';
        const fork = repo.fork ? ' (fork)' : '';
        const priv = repo.private ? '🔒' : '  ';
        console.log(`${String(i + 1).padStart(3)}. ${marker} ${priv} ${repo.name}${fork}`);
    });

    console.log(`\n📊 Selected: ${selected.size} of ${repos.length}`);
}

function toggle(selected, repo) {
    selected.has(repo.full_name)
        ? selected.delete(repo.full_name)
        : selected.add(repo.full_name);
}

async function interactiveSelect(repos) {
    const selected = new Set();

    while (true) {
        displayRepos(repos, selected);
        const input = await prompt('\nCommand: ');
        const cmd = input.trim().toLowerCase();

        if (cmd === '') continue;

        if (cmd === 'q') return null;

        if (cmd === 'd') {
            if (selected.size === 0) {
                await prompt('No repositories selected. Press Enter...');
                continue;
            }
            return Array.from(selected);
        }

        if (cmd === 'a') {
            repos.forEach(r => selected.add(r.full_name));
            continue;
        }

        if (cmd === 'n') {
            selected.clear();
            continue;
        }

        if (/^\d+\s*-\s*\d+$/.test(cmd)) {
            const [start, end] = cmd.split('-').map(n => parseInt(n.trim()));
            for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                if (i >= 1 && i <= repos.length) toggle(selected, repos[i - 1]);
            }
            continue;
        }

        if (/^\d+(\s*,\s*\d+)*$/.test(cmd)) {
            const numbers = cmd.split(',').map(n => parseInt(n.trim()));
            const invalid = numbers.filter(n => n < 1 || n > repos.length);
            numbers.forEach(num => {
                if (num >= 1 && num <= repos.length) toggle(selected, repos[num - 1]);
            });
            if (invalid.length > 0) {
                await prompt(`No repository with number(s): ${invalid.join(', ')}. Press Enter...`);
            }
            continue;
        }

        await prompt(`Unknown command: "${cmd}". Press Enter...`);
    }
}

async function main() {
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

        const repos = await getAllRepos();

        if (repos.length === 0) {
            console.log('No repositories found.');
            rl.close();
            return;
        }

        console.log(`✓ Found ${repos.length} repositories\n`);
        await prompt('Press Enter to continue...');

        const toDelete = await interactiveSelect(repos);

        if (!toDelete || toDelete.length === 0) {
            console.log('\nOperation cancelled.');
            rl.close();
            return;
        }

        console.clear();
        console.log('\n⚠️  WARNING: This will PERMANENTLY delete:\n');
        toDelete.forEach(name => console.log(`  🗑️  ${name}`));
        console.log(`\nTotal: ${toDelete.length} repository(ies)\n`);

        const confirm = await prompt('Type "DELETE" to confirm: ');

        if (confirm.trim() !== 'DELETE') {
            console.log('\nOperation cancelled.');
            rl.close();
            return;
        }

        console.log('\n🗑️  Deleting repositories...\n');

        let success = 0;
        const failures = [];

        for (const fullName of toDelete) {
            process.stdout.write(`Deleting ${fullName}... `);
            const result = await deleteRepo(fullName);
            if (result.ok) {
                console.log('✓');
                success++;
            } else {
                console.log(`✗ ${result.reason}`);
                failures.push({ fullName, reason: result.reason });
            }
        }

        console.log('\n════════════════════════');
        console.log(`✓ Deleted: ${success}`);
        console.log(`✗ Failed: ${failures.length}`);
        console.log('════════════════════════\n');

        if (failures.length > 0) {
            console.log('Failed repositories:');
            failures.forEach(f => console.log(`  ✗ ${f.fullName}: ${f.reason}`));
            console.log('');
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
    }

    rl.close();
}

main();
