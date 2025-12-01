const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const prompt = (q) => new Promise(resolve => rl.question(q, resolve));

let GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

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

async function getAuthenticatedUser() {
    const response = await githubFetch('/user');
    if (!response.ok) throw new Error('Invalid token');
    return response.json();
}

async function getAllRepos(username) {
    const repos = [];
    let page = 1;
    
    process.stdout.write('Fetching repositories');
    
    while (true) {
        const response = await githubFetch(`/users/${username}/repos?per_page=100&page=${page}&type=owner`);
        const data = await response.json();
        
        if (data.length === 0) break;
        repos.push(...data);
        process.stdout.write('.');
        page++;
    }
    
    console.log(' Done!\n');
    return repos.sort((a, b) => a.name.localeCompare(b.name));
}

async function deleteRepo(fullName) {
    const response = await githubFetch(`/repos/${fullName}`, 'DELETE');
    return response.status === 204;
}

function displayRepos(repos, selected) {
    console.clear();
    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│            SELECT REPOSITORIES TO DELETE                   │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log('│  Commands:                                                 │');
    console.log('│    1,2,3    - Toggle selection                             │');
    console.log('│    1-5      - Select range                                 │');
    console.log('│    a        - Select all                                   │');
    console.log('│    n        - Deselect all                                 │');
    console.log('│    d        - Delete selected                              │');
    console.log('│    q        - Quit                                         │');
    console.log('└────────────────────────────────────────────────────────────┘\n');
    
    repos.forEach((repo, i) => {
        const marker = selected.has(repo.full_name) ? '[X]' : '[ ]';
        const fork = repo.fork ? '(fork)' : '';
        const priv = repo.private ? '🔒' : '  ';
        console.log(`${String(i + 1).padStart(3)}. ${marker} ${priv} ${repo.name} ${fork}`);
    });
    
    console.log(`\n📊 Selected: ${selected.size} of ${repos.length}`);
}

async function interactiveSelect(repos) {
    const selected = new Set();
    
    while (true) {
        displayRepos(repos, selected);
        const input = await prompt('\nCommand: ');
        const cmd = input.trim().toLowerCase();
        
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
        
        if (cmd.includes('-') && !cmd.startsWith('-')) {
            const [start, end] = cmd.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                    if (i >= 1 && i <= repos.length) {
                        const repo = repos[i - 1];
                        selected.has(repo.full_name) 
                            ? selected.delete(repo.full_name) 
                            : selected.add(repo.full_name);
                    }
                }
            }
            continue;
        }
        
        const numbers = cmd.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        numbers.forEach(num => {
            if (num >= 1 && num <= repos.length) {
                const repo = repos[num - 1];
                selected.has(repo.full_name) 
                    ? selected.delete(repo.full_name) 
                    : selected.add(repo.full_name);
            }
        });
    }
}

async function main() {
    console.log('\n🗑️  GitHub Bulk Repository Deleter\n');
    
    if (!GITHUB_TOKEN) {
        GITHUB_TOKEN = await prompt('Enter your GitHub token: ');
        if (!GITHUB_TOKEN.trim()) {
            console.log('Token is required.');
            rl.close();
            return;
        }
    }
    
    console.log('\n🔐 Verifying token...\n');
    
    try {
        const user = await getAuthenticatedUser();
        console.log(`✓ Authenticated as: ${user.login}\n`);
        
        const repos = await getAllRepos(user.login);
        
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
        
        if (confirm !== 'DELETE') {
            console.log('\nOperation cancelled.');
            rl.close();
            return;
        }
        
        console.log('\n🗑️  Deleting repositories...\n');
        
        let success = 0, failed = 0;
        
        for (const fullName of toDelete) {
            process.stdout.write(`Deleting ${fullName}... `);
            if (await deleteRepo(fullName)) {
                console.log('✓');
                success++;
            } else {
                console.log('✗');
                failed++;
            }
        }
        
        console.log('\n════════════════════════');
        console.log(`✓ Deleted: ${success}`);
        console.log(`✗ Failed: ${failed}`);
        console.log('════════════════════════\n');
        
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
    }
    
    rl.close();
}

main();