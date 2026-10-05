// ---------- GitHub repos (THE ARCHIVE's filing cabinet) ----------
// Read-only, through the gh CLI already signed in on this machine; cached ~10 minutes. Repo text is passed through as data
// (the office escapes everything it renders).
const { binOf, run } = require('./util');

const REPO_TTL = 10 * 60e3;
const repoCache = new Map();   // key -> { at, p }
function cached(key, fn) {
  const c = repoCache.get(key);
  if (c && Date.now() - c.at < REPO_TTL) return c.p;
  const p = fn().catch((e) => { repoCache.delete(key); throw e; });
  repoCache.set(key, { at: Date.now(), p });
  if (repoCache.size > 200) repoCache.delete(repoCache.keys().next().value);
  return p;
}
async function gh(args) {
  const bin = binOf('gh');
  if (!bin) throw Object.assign(new Error('the GitHub CLI (gh) isn’t installed'), { signin: true });
  const r = await run(bin, args);
  if (r.err) throw Object.assign(new Error((r.errOut.trim() || r.err.message).split('\n')[0]), { signin: /gh auth login|not logged in|Requires authentication|HTTP 401/i.test(r.errOut) });
  return JSON.parse(r.out);
}
const REPO_FIELDS = 'name,nameWithOwner,description,url,isPrivate,isFork,isArchived,primaryLanguage,stargazerCount,updatedAt,diskUsage';
const listRepos = () => cached('list', async () => {
  const me = (await gh(['api', 'user'])).login;
  const orgs = await gh(['api', 'user/orgs', '--jq', '[.[].login]']).catch(() => []);
  const lists = await Promise.all([me, ...orgs].map((o) => gh(['repo', 'list', o, '--limit', '500', '--json', REPO_FIELDS]).catch(() => [])));
  const repos = lists.flat().map((r) => ({ owner: r.nameWithOwner.split('/')[0], name: r.name, description: r.description || '', url: r.url, private: r.isPrivate, fork: r.isFork,
    archived: r.isArchived, language: r.primaryLanguage?.name || '', stars: r.stargazerCount, updatedAt: r.updatedAt, kb: r.diskUsage }));
  return { login: me, orgs, repos: repos.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })) };
});
const REPO_GQL = 'query($o:String!,$n:String!){repository(owner:$o,name:$n){pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount} '
  + 'defaultBranchRef{name} languages(first:12,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}}';
const repoDetail = (o, n) => cached(`repo:${o}/${n}`, async () => {
  const [meta, readme, files, commits] = await Promise.all([
    gh(['api', 'graphql', '-f', `query=${REPO_GQL}`, '-F', `o=${o}`, '-F', `n=${n}`]),
    gh(['api', `repos/${o}/${n}/readme`]).catch(() => null),
    gh(['api', `repos/${o}/${n}/contents`]).catch(() => []),
    gh(['api', `repos/${o}/${n}/commits?per_page=8`]).catch(() => []),
  ]);
  const r = meta.data?.repository;
  if (!r) throw new Error('repository not found');
  return {
    branch: r.defaultBranchRef?.name || '', prs: r.pullRequests.totalCount, issues: r.issues.totalCount,
    languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
    readme: readme?.content ? { name: readme.name, text: Buffer.from(readme.content, 'base64').toString('utf8').slice(0, 200000) } : null,
    files: Array.isArray(files) ? files.map((f) => ({ name: f.name, type: f.type })) : [],
    commits: (Array.isArray(commits) ? commits : []).map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], author: c.commit.author?.name || c.author?.login || '', date: c.commit.author?.date })),
  };
});
// The tesseract: the whole tree (paths and sizes, at HEAD) and the repo's whole history (up to HISTORY_MAX commits, newest first)
// with the files each commit touched, so the office can rebuild the tree as it was at every commit. That's one call per commit,
// ten at a time; a commit never changes, so what each touched is kept for good (COMMIT_FILES) and a refresh only asks about new
// ones. It takes a while the first time, so it runs as a job: /tree answers 202 with { done, total } until it's ready.
const TREE_MAX = 5000, HISTORY_MAX = 3000, EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';   // (GitHub 404s on git's empty tree)
const COMMIT_FILES = new Map(), treeJobs = new Map();
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const j = i++; out[j] = await fn(list[j]).catch(() => null); } }));
  return out;
}
async function repoTree(o, n, job) {
  const log = [];
  for (let page = 1; log.length < HISTORY_MAX; page++) {
    const batch = await gh(['api', `repos/${o}/${n}/commits?per_page=100&page=${page}`]).catch((e) => { if (/409|empty/i.test(e.message)) return []; throw e; });
    log.push(...batch);
    job.total = log.length;
    if (batch.length < 100) break;
  }
  if (!log.length) return { head: null, truncated: false, files: [], commits: [] };
  const head = log[0].sha, tree = log[0].commit.tree.sha === EMPTY_TREE ? { tree: [] } : await gh(['api', `repos/${o}/${n}/git/trees/${log[0].commit.tree.sha}?recursive=1`]);
  const blobs = tree.tree.filter((e) => e.type === 'blob');
  const changes = await pool(log, 10, async (c) => {
    const key = `${o}/${n}@${c.sha}`;
    if (!COMMIT_FILES.has(key)) COMMIT_FILES.set(key, await gh(['api', `repos/${o}/${n}/commits/${c.sha}`, '--jq', '[.files[]? | [.filename, .status, .previous_filename // ""]]']));
    job.done++;
    return COMMIT_FILES.get(key);
  });
  return {
    head, truncated: !!tree.truncated || blobs.length > TREE_MAX, capped: log.length >= HISTORY_MAX,
    files: blobs.slice(0, TREE_MAX).map((e) => [e.path, e.size || 0]),
    commits: log.map((c, i) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], author: c.commit.author?.name || c.author?.login || '', date: c.commit.author?.date, files: changes[i] || [] })),
  };
}
// { status, body }: the finished tree (cached ~10 minutes), or 202 and how far along it is.
function treeJob(o, n) {
  const key = `${o}/${n}`, j = treeJobs.get(key);
  if (j?.res && Date.now() - j.at < REPO_TTL) return { status: 200, body: j.res };
  if (j?.err) { treeJobs.delete(key); return { status: j.err.signin ? 401 : 502, body: { error: j.err.message, signin: !!j.err.signin } }; }
  if (j && !j.res) return { status: 202, body: { done: j.done, total: j.total } };
  const job = { done: 0, total: 0, res: null, err: null, at: 0 };
  treeJobs.set(key, job);
  repoTree(o, n, job).then((res) => Object.assign(job, { res, at: Date.now() }), (err) => { job.err = err; });
  return { status: 202, body: { done: 0, total: 0 } };
}
// One file at one commit, as text (or a note that it's binary or too big).
const BLOB_MAX = 160000;
const repoBlob = (o, n, ref, file) => cached(`blob:${o}/${n}@${ref}:${file}`, async () => {
  const j = await gh(['api', `repos/${o}/${n}/contents/${file.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`]);
  if (Array.isArray(j) || j.type !== 'file') throw new Error('not a file');
  if (!j.content) return { size: j.size, text: null, why: 'too big to read here' };
  const buf = Buffer.from(j.content, 'base64');
  if (buf.subarray(0, 8000).includes(0)) return { size: j.size, text: null, why: 'binary' };
  return { size: j.size, text: buf.toString('utf8', 0, BLOB_MAX), cut: buf.length > BLOB_MAX };
});

module.exports = { listRepos, repoDetail, treeJob, repoBlob };
