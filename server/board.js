// ---------- the task board ----------
// The cork board in my office: columns of index cards and sticky notes, shared by every open browser.
// ~/.claude/my-office/board.json. It changes by a list of ops (POST /api/board), each checked and clamped here, all or
// none; the whole board then goes to every browser (event: board). Card text is plain text: the office paints it on a
// canvas and the editor only ever sets it as a value or textContent.
const fs = require('fs');
const path = require('path');
const { CLAUDE, readJSON, clients } = require('./util');

const BOARD_FILE = path.join(CLAUDE, 'my-office', 'board.json');
const LIM = { cards: 500, cols: 12, title: 200, body: 10000, colName: 40, label: 24, labels: 8, who: 3, ops: 100, bytes: 2e6, req: 262144 };
const KINDS = ['index', 'sticky'];
const COLORS = ['white', 'yellow', 'pink', 'blue', 'green', 'orange'];
const isId = (s) => typeof s === 'string' && /^[a-z0-9]{4,16}$/.test(s);

const line = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, n);
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : '');
const labelsOf = (a) => [...new Set((Array.isArray(a) ? a : typeof a === 'string' ? a.split(',') : []).map((l) => line(l, LIM.label)).filter(Boolean))].slice(0, LIM.labels);
const whoOf = (s) => line(s, LIM.who).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

// The fields a card's editor may set, checked; only those given.
function fields(c) {
  const o = {};
  if (!c || typeof c !== 'object') return o;
  if ('title' in c) o.title = line(c.title, LIM.title);
  if ('body' in c) o.body = text(c.body, LIM.body);
  if ('kind' in c && KINDS.includes(c.kind)) o.kind = c.kind;
  if ('color' in c && COLORS.includes(c.color)) o.color = c.color;
  if ('prio' in c) o.prio = Number.isInteger(c.prio) ? Math.min(3, Math.max(0, c.prio)) : 0;
  if ('due' in c) o.due = day(c.due);
  if ('labels' in c) o.labels = labelsOf(c.labels);
  if ('who' in c) o.who = whoOf(c.who);
  return o;
}
const cardOf = (c, col, now) => ({ id: isId(c?.id) ? c.id : newId(), col, kind: 'index', color: 'white', title: '', body: '', prio: 0, due: '', labels: [], who: '',
  ...fields(c), archived: c?.archived === true, created: Number.isFinite(c?.created) ? c.created : now, updated: now });

const DEFAULT = () => {
  const t = Date.now();
  return { rev: 0, columns: [['backlog', 'Backlog'], ['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']].map(([id, name]) => ({ id, name })),
    cards: [cardOf({ id: 'welcome1', kind: 'sticky', color: 'yellow', title: 'Click the board to use it',
      body: 'Add index cards and sticky notes, drag them between columns, click one to read or edit all of it. Esc to walk away.' }, 'todo', t)] };
};

// What's on disk, checked like anything sent (a hand-edited file can't put more on the board than the routes could).
function load() {
  const j = readJSON(BOARD_FILE);
  if (!j || !Array.isArray(j.columns) || !Array.isArray(j.cards)) return DEFAULT();
  const columns = [], seen = new Set();
  for (const c of j.columns.slice(0, LIM.cols)) {
    const id = isId(c?.id) && !seen.has(c.id) ? c.id : newId();
    seen.add(id); columns.push({ id, name: line(c?.name, LIM.colName) || 'Untitled' });
  }
  if (!columns.length) return DEFAULT();
  const ids = new Set(), cards = [];
  for (const c of j.cards.slice(0, LIM.cards)) {
    if (!c || typeof c !== 'object' || ids.has(c.id)) continue;
    const card = cardOf(c, columns.some((k) => k.id === c.col) ? c.col : columns[0].id, Number.isFinite(c.updated) ? c.updated : Date.now());
    if (Number.isFinite(c.updated)) card.updated = c.updated;
    ids.add(card.id); cards.push(card);
  }
  return { rev: Number.isInteger(j.rev) ? j.rev : 0, columns, cards };
}
let board = load();

const fail = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
// Puts card c into column col at position `at` among that column's cards on the board (archived ones are skipped over).
function place(b, c, col, at) {
  const inCol = b.cards.filter((x) => x.col === col && !x.archived);
  const before = Number.isInteger(at) && at >= 0 && at < inCol.length ? inCol[at] : null;
  c.col = col;
  if (before) b.cards.splice(b.cards.indexOf(before), 0, c);
  else {
    const last = inCol[inCol.length - 1];
    b.cards.splice(last ? b.cards.indexOf(last) + 1 : b.cards.length, 0, c);
  }
}
function applyOp(b, o, now) {
  if (!o || typeof o !== 'object') fail('not an op');
  const colOf = (id) => (id === undefined ? b.columns[0].id : b.columns.some((k) => k.id === id) ? id : fail(`no column ${JSON.stringify(String(id).slice(0, 40))}`));
  const cardAt = (id) => b.cards.find((c) => c.id === id) || fail(`no card ${JSON.stringify(String(id).slice(0, 40))}`);
  if (o.op === 'add') {
    if (b.cards.length >= LIM.cards) fail(`the board is full (${LIM.cards} cards): archive or delete some`);
    if (o.card?.id !== undefined && (!isId(o.card.id) || b.cards.some((c) => c.id === o.card.id))) fail('bad or duplicate card id');
    const c = cardOf(o.card, colOf(o.col), now);
    place(b, c, c.col, c.archived ? undefined : o.at);
    return;
  }
  if (o.op === 'edit') { const c = cardAt(o.id); Object.assign(c, fields(o.set), { updated: now }); return; }
  if (o.op === 'move') {
    const c = cardAt(o.id), col = colOf(o.col);
    b.cards.splice(b.cards.indexOf(c), 1);
    c.archived = false; c.updated = now;
    place(b, c, col, o.at);
    return;
  }
  if (o.op === 'archive') { const c = cardAt(o.id); c.archived = o.archived !== false; c.updated = now; return; }
  if (o.op === 'delete') { const c = cardAt(o.id); b.cards.splice(b.cards.indexOf(c), 1); return; }
  if (o.op === 'columns') {
    // The whole list, in order: an existing id keeps its cards, a new one is made; a column left out sends its cards to the first.
    if (!Array.isArray(o.columns) || !o.columns.length) fail('columns: give at least one');
    if (o.columns.length > LIM.cols) fail(`columns: at most ${LIM.cols}`);
    const seen = new Set();
    b.columns = o.columns.map((k) => {
      const id = isId(k?.id) && !seen.has(k.id) ? k.id : newId();
      seen.add(id);
      return { id, name: line(k?.name, LIM.colName) || 'Untitled' };
    });
    for (const c of b.cards) if (!seen.has(c.col)) c.col = b.columns[0].id;
    return;
  }
  fail(`unknown op ${JSON.stringify(String(o.op).slice(0, 40))}`);
}

// { ops: [...] } -> the board after them, saved and pushed to every browser. A bad op changes nothing (400, and the board).
function changeBoard(body) {
  const ops = body?.ops;
  if (!Array.isArray(ops) || !ops.length) fail('no ops');
  if (ops.length > LIM.ops) fail(`at most ${LIM.ops} ops at a time`);
  const next = structuredClone(board), now = Date.now();
  for (const o of ops) applyOp(next, o, now);
  next.rev = board.rev + 1;
  const json = JSON.stringify(next);
  if (json.length > LIM.bytes) fail('the board is too big: archive or delete some cards');
  fs.mkdirSync(path.dirname(BOARD_FILE), { recursive: true });
  fs.writeFileSync(BOARD_FILE + '.tmp', JSON.stringify(next, null, 1));
  fs.renameSync(BOARD_FILE + '.tmp', BOARD_FILE);
  board = next;
  for (const res of clients) if (res.boardOk) res.write(`event: board\ndata: ${json}\n\n`);
  return board;
}

module.exports = { get board() { return board; }, changeBoard, BOARD: { LIM, KINDS, COLORS } };
