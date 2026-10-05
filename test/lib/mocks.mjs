// What the browser gets instead of the routes that read this machine or GitHub (they can't be pinned by a fixture HOME):
// /api/machine, /api/repos/*, and the chat's ?route (which asks the OS where a session's terminal is).
import { T0, SESSION_IDS } from './fixtures.mjs';

export const MACHINE = {
  at: T0, hostname: 'fixture-host', os: 'macOS 26.0', arch: 'arm64', cpuModel: 'Apple M1 Pro', uptime: 357358, load: [3.41, 2.43, 1.69],
  cores: [57, 44, 33, 27, 18, 12, 9, 6, 4, 2], mem: { total: 17179869184, used: 9770813952 },
  disks: [{ dev: '/dev/disk3s1s1', size: 994662584320, used: 12570521600, avail: 452590292992, mount: '/' },
    { dev: '/dev/disk3s5', size: 994662584320, used: 511576903680, avail: 452590292992, mount: '/System/Volumes/Data' }],
  battery: { pct: 80, state: 'AC attached', ac: true }, net: { rx: 123456789, tx: 23456789 },
  top: [{ pid: 501, cpu: 41.2, rssMB: 820, name: 'node' }, { pid: 502, cpu: 22.3, rssMB: 357, name: 'Google Chrome' }, { pid: 503, cpu: 8.8, rssMB: 63, name: 'claude' },
    { pid: 504, cpu: 4.7, rssMB: 25, name: 'WindowServer' }, { pid: 505, cpu: 1.2, rssMB: 443, name: 'Finder' }],
  sessions: SESSION_IDS.map((sessionId, i) => ({ sessionId, name: ['api-server', 'docs-site', 'infra', 'mobile', 'notes'][i], pid: 41001 + i,
    status: ['working', 'working', 'shell', 'idle', 'idle'][i], cpu: i * 7.5, rssMB: 180 + i * 40 })),
};

const LANGS = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Shell', 'HTML', ''];
const NAMES = ['api-server', 'billing', 'chat-bot', 'docs-site', 'dotfiles', 'game-jam', 'infra', 'kitchen-sink', 'mobile', 'my-office', 'notes',
  'ray-tracer', 'scripts', 'tiny-db', 'website', 'zeta'];
export const REPOS = {
  login: 'fixture', orgs: ['fixture-org'],
  repos: NAMES.map((name, i) => ({ owner: i % 5 === 4 ? 'fixture-org' : 'fixture', name, description: `The ${name.replace(/-/g, ' ')} project`,
    url: `https://github.com/fixture/${name}`, private: i % 3 === 0, fork: i === 7, archived: i === 15, language: LANGS[i % LANGS.length], stars: (i * 7) % 23,
    updatedAt: new Date(T0 - i * 86400e3).toISOString(), kb: 100 + i * 37 })),
};
export const DETAIL = {
  branch: 'main', prs: 2, issues: 5, languages: [{ name: 'JavaScript', color: '#f1e05a', size: 80000 }, { name: 'HTML', color: '#e34c26', size: 12000 }],
  readme: { name: 'README.md', text: '# A fixture repo\n\nIt exists so the office has something to file.\n\n## Usage\n\n```\nnpm start\n```\n' },
  files: [{ name: 'src', type: 'dir' }, { name: 'README.md', type: 'file' }, { name: 'package.json', type: 'file' }],
  commits: [{ sha: 'abc1234', message: 'Add the thing', author: 'Fixture', date: new Date(T0 - 86400e3).toISOString() }],
};
// A small repo with a few commits of history: files added, changed, renamed and removed.
const FILES = ['README.md', 'package.json', 'src/index.js', 'src/app.js', 'src/lib/util.js', 'src/lib/db.js', 'src/routes/users.js', 'src/routes/posts.js',
  'test/app.test.js', 'test/util.test.js', 'docs/guide.md', 'docs/api.md', 'public/index.html', 'public/style.css', 'public/logo.svg', '.gitignore'];
const sha = (i) => (i + 1).toString(16).padStart(2, '0').repeat(20);
export const TREE = {
  head: sha(0), truncated: false, capped: false,
  files: FILES.map((p, i) => [p, 400 + i * 731]),
  commits: [
    { sha: sha(0), message: 'Add the posts route', author: 'Fixture', date: new Date(T0 - 1 * 86400e3).toISOString(), files: [['src/routes/posts.js', 'added', ''], ['src/app.js', 'modified', '']] },
    { sha: sha(1), message: 'Move helpers into lib', author: 'Fixture', date: new Date(T0 - 3 * 86400e3).toISOString(), files: [['src/lib/util.js', 'renamed', 'src/util.js']] },
    { sha: sha(2), message: 'Docs', author: 'Fixture', date: new Date(T0 - 6 * 86400e3).toISOString(), files: [['docs/guide.md', 'added', ''], ['docs/api.md', 'added', ''], ['docs/old.md', 'removed', '']] },
    { sha: sha(3), message: 'Tests', author: 'Fixture', date: new Date(T0 - 9 * 86400e3).toISOString(), files: [['test/app.test.js', 'added', ''], ['test/util.test.js', 'added', '']] },
    { sha: sha(4), message: 'First commit', author: 'Fixture', date: new Date(T0 - 12 * 86400e3).toISOString(), files: FILES.slice(0, 6).map((p) => [p, 'added', '']) },
  ],
};
export const BLOB = { size: 1234, text: '// A file, as it was.\nexport const answer = 42;\n' };
export const CONFIG = { owner: 'Fixture', city: 'London', lat: 51.5, lon: -0.13 };

// Installs the mocks on a Playwright page. `/api/session/:id/chat?route` gets the server's own answer, minus the routing.
export async function mockRoutes(page, base) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${base}/api/machine`, (r) => json(r, MACHINE));
  await page.route(`${base}/api/config`, (r) => json(r, CONFIG));
  await page.route(/\/api\/repos(\/|$|\?)/, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/repos') return json(r, REPOS);
    if (u.pathname.endsWith('/tree')) return json(r, TREE);
    if (u.pathname.endsWith('/blob')) return json(r, BLOB);
    return json(r, DETAIL);
  });
  await page.route(/\/api\/session\/[\w-]+\/chat/, async (r) => {
    const u = new URL(r.request().url());
    u.searchParams.delete('route');
    const body = await (await fetch(base + u.pathname + u.search)).json();
    return json(r, { ...body, cantSend: 'fixture: no terminal' });
  });
}
