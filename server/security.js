// Who may change things: this dashboard's own pages, never a TV or another site.
const os = require('os');
const net = require('net');

const TV_UA_TAG = 'my-office-tv';   // on the TV browser's user agent, so a TV showing the office can't open TV streams itself

function trustedHost(host) {
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === 'localhost' || net.isIP(h) || h === os.hostname() || h.endsWith('.local');
}

// Anything that changes state must come from this dashboard: JSON (a foreign page then needs a CORS preflight, which is never
// approved), our own Origin on our own Host (no other site, no DNS rebinding), and not a TV or headless browser (a TV showing
// the dashboard must not drive it).
function refuse(req) {
  const host = req.headers.host || '', ua = req.headers['user-agent'] || '';
  if (!trustedHost(host)) return 'unknown Host';
  if (req.headers.origin !== `http://${host}`) return 'missing or foreign Origin';
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) return 'Content-Type must be application/json';
  if (/HeadlessChrome/.test(ua) || ua.includes(TV_UA_TAG)) return 'not from a TV or headless browser';
  return null;
}
function deny(req, res) {
  const why = refuse(req);
  if (!why) return false;
  console.log(`[refused] ${req.method} ${req.url}: ${why} (origin ${req.headers.origin || '-'}, host ${req.headers.host || '-'})`);
  res.writeHead(403, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: `refused: ${why}` }));
  return true;
}

module.exports = { TV_UA_TAG, trustedHost, refuse, deny };
