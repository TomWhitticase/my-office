// A readable structural diff of two JSON values: one line per path that differs.
export function diffJSON(a, b, at = '', out = []) {
  if (out.length > 200) return out;
  const t = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (t(a) !== t(b)) { out.push(`${at || '.'}: ${short(a)} → ${short(b)}`); return out; }
  if (t(a) === 'array') {
    if (a.length !== b.length) out.push(`${at}.length: ${a.length} → ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffJSON(a[i], b[i], `${at}[${i}]`, out);
  } else if (t(a) === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${at}.${k}: (none) → ${short(b[k])}`);
      else if (!(k in b)) out.push(`${at}.${k}: ${short(a[k])} → (none)`);
      else diffJSON(a[k], b[k], `${at}.${k}`, out);
    }
  } else if (a !== b) out.push(`${at || '.'}: ${short(a)} → ${short(b)}`);
  return out;
}
const short = (v) => { const s = JSON.stringify(v) ?? 'undefined'; return s.length > 120 ? s.slice(0, 117) + '…' : s; };
