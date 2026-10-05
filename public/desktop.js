// Your computer: a pretend Windows-XP-style desktop with four apps, each in a window: the Dashboard (the live overview
// <main>, moved in, not copied), Office Admin (#view-admin, likewise), Messages (chat with your sessions, via chat.js)
// and Security (the building's camera feeds, drawn by the office: office/systems/cctv.js).
// It's what your office monitor and MacBook show, live (inert there: clicking the screen flies you in), and what you use
// full screen once you've flown in. Window layout and the open conversation persist in localStorage.

import { CAN_CHAT, chatView, escapeHtml, titleOf } from './chat.js';

const dash = window.dash;
const KEY = 'officeDesktop';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const svg = (body) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const APPS = {
  dash: { title: 'Dashboard', hash: 'overview', sub: 'Live sessions, usage and cost',
    icon: svg('<rect x="2" y="4" width="28" height="20" rx="2" fill="#e4ebf5" stroke="#3b5f99"/><rect x="4.5" y="6.5" width="23" height="15" fill="#173a78"/><path d="M8 19v-3M12 19v-7M16 19v-5M20 19v-9M24 19v-6" stroke="#7fe07a" stroke-width="2.4"/><path d="M12.5 24h7l1 4h-9z" fill="#98a7bd"/><rect x="9" y="27.5" width="14" height="2" rx="1" fill="#62728a"/>') },
  admin: { title: 'Office Admin', hash: 'admin', sub: 'Lights, blinds, door, sounds, TVs',
    icon: svg('<rect x="3" y="3" width="26" height="26" rx="4" fill="#f4f0e2" stroke="#8a7a52"/><path d="M8 10h16M8 16h16M8 22h16" stroke="#8b96a8" stroke-width="2.2" stroke-linecap="round"/><circle cx="13" cy="10" r="3.2" fill="#2f7be8" stroke="#1d4f9e"/><circle cx="21" cy="16" r="3.2" fill="#f0a020" stroke="#9c6408"/><circle cx="11" cy="22" r="3.2" fill="#2fb34a" stroke="#1d7a31"/>') },
  msgs: { title: 'Messages', hash: 'messages', sub: 'Chat with your Claude sessions',
    icon: svg('<rect x="2" y="4" width="20" height="14" rx="4" fill="#5aa8f8" stroke="#1f5fbf"/><path d="M7 17.5l-1 5 6-4.5" fill="#5aa8f8" stroke="#1f5fbf" stroke-linejoin="round"/><rect x="11" y="12" width="19" height="13" rx="4" fill="#86d86f" stroke="#3a8a2a"/><path d="M25 24.5l1 4.5-6-4.5" fill="#86d86f" stroke="#3a8a2a" stroke-linejoin="round"/><path d="M15.5 18.5h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>') },
  cctv: { title: 'Security', hash: 'security', sub: 'Cameras: office, server hall, roof',
    icon: svg('<rect x="3" y="24" width="10" height="3" rx="1" fill="#6b7686"/><path d="M8 24v-6" stroke="#6b7686" stroke-width="2.4"/><g transform="rotate(-14 16 14)"><rect x="5" y="9" width="21" height="9" rx="3" fill="#eef1f4" stroke="#56606e"/><rect x="5" y="7.5" width="22" height="2.4" rx="1" fill="#c9cfd6" stroke="#56606e" stroke-width=".8"/><rect x="24.5" y="10" width="4" height="7" rx="1.2" fill="#1d232b"/><circle cx="9" cy="15" r="1.4" fill="#ff3b2f"/></g>') },
};
const DEFAULT = { dash: { open: true, x: 0.09, y: 0.03, w: 0.72, h: 0.88 }, admin: { x: 0.2, y: 0.06, w: 0.6, h: 0.84 }, msgs: { x: 0.3, y: 0.09, w: 0.6, h: 0.78 },
  cctv: { x: 0.12, y: 0.04, w: 0.74, h: 0.86 } };
const FLOOR_TABS = [['all', 'All'], [48, 'Office'], [47, 'Server Hall'], [50, 'Roof']];
const stamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}`;
const STATUS = { working: ['Working', 'w'], idle: ['Idle · waiting for you', 'i'], shell: ['Waiting on a shell task', 's'] };

export function mountDesktop() {
  const style = document.createElement('style');
  style.textContent = `
    #xp { position: absolute; inset: 0; overflow: hidden; z-index: 5; user-select: none; color: #fff; background: #3d82e2;
      font: 12px/1.3 Tahoma, Verdana, "Segoe UI", system-ui, sans-serif; }
    /* Rolling hills under a blue sky with a few soft clouds. Its own layer, so it's painted once, not under every live update. */
    .xp-wall { position: absolute; inset: 0; will-change: transform; pointer-events: none;
      background:
        radial-gradient(ellipse 95% 46% at 30% 112%, #5cb83a 0, #4fa832 60%, #47a02c 98%, transparent 99.5%),
        radial-gradient(ellipse 80% 40% at 92% 108%, #3f9427 0, #368524 98%, transparent 99.5%),
        radial-gradient(ellipse 70% 30% at 66% 88%, #4c9e33 0, #42902b 98%, transparent 99.5%),
        radial-gradient(ellipse 22% 7% at 26% 21%, rgba(255,255,255,.75), transparent 70%),
        radial-gradient(ellipse 24% 6% at 76% 16%, rgba(255,255,255,.6), transparent 70%),
        linear-gradient(#1d5fcb, #3d82e2 30%, #7db4ef 58%, #b9dbf8 72%); }
    body > #xp { position: fixed; }
    body:not([data-view="desktop"]) > #xp { display: none; }
    :where(#xp) button { font: inherit; color: inherit; }
    .xp-icons { position: absolute; left: 10px; top: 12px; display: grid; gap: 14px; }
    .xp-icon { width: 84px; display: grid; justify-items: center; gap: 4px; padding: 4px 2px; background: none; border: 1px dotted transparent; cursor: pointer; }
    .xp-icon svg { width: 40px; height: 40px; }
    .xp-icon span { padding: 1px 3px; text-shadow: 1px 1px 1px #000, 0 0 3px #000; }
    .xp-icon:hover span, .xp-icon:focus-visible span { background: #0b61ff; text-shadow: none; }
    .xp-icon:focus-visible { outline: none; border-color: #fff; }
    .xp-area { position: absolute; left: 0; top: 0; right: 0; bottom: 30px; z-index: 0; pointer-events: none; }   /* own stacking context: windows stay under the menu and taskbar */
    .xp-area > * { pointer-events: auto; }
    .xp-win { position: absolute; display: flex; flex-direction: column; min-width: 300px; min-height: 160px; background: #ece9d8; color: #000;
      border: 3px solid #0842d0; border-top: 0; border-radius: 8px 8px 0 0; box-shadow: 1px 2px 6px rgba(0,0,0,.35); }
    .xp-win[hidden] { display: none; }
    .xp-win.max { border-radius: 0; }
    .xp-win:not(.on) { border-color: #7a96df; }
    .xp-tb { height: 28px; flex: none; display: flex; align-items: center; gap: 5px; margin: 0 -3px; padding: 0 5px 0 7px; border-radius: 7px 7px 0 0; touch-action: none;
      background: linear-gradient(#0997ff, #0053ee 8%, #0050ee 40%, #0066ff 88%, #0066ff 93%, #005bff 95%, #003dd7 96%, #003dd7); color: #fff; }
    .xp-win.max .xp-tb { border-radius: 0; }
    .xp-win:not(.on) .xp-tb { background: linear-gradient(#7c9ef0, #7695e6 10%, #7b99e9 85%, #6a87d8); }
    .xp-tb svg { width: 16px; height: 16px; flex: none; }
    .xp-tb b { flex: 1; min-width: 0; font-size: 13px; text-shadow: 1px 1px #0f1089; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-tb button { position: relative; width: 21px; height: 21px; flex: none; padding: 0; border: 1px solid #fff; border-radius: 3px; cursor: pointer;
      background: radial-gradient(circle at 70% 75%, #1a5fe6, #3c86f6 70%, #5c9cfb); }
    .xp-tb button:hover { filter: brightness(1.15); }
    .xp-tb button[data-w="close"] { background: radial-gradient(circle at 70% 75%, #c4401f, #e0643e 70%, #ee8a62); }
    .xp-win:not(.on) .xp-tb button { opacity: .75; }
    .xp-tb button::before, .xp-tb button::after { content: ""; position: absolute; background: #fff; }
    .xp-tb [data-w="min"]::before { left: 5px; bottom: 4px; width: 7px; height: 3px; }
    .xp-tb [data-w="max"]::before { inset: 4px; background: none; border: 1px solid #fff; border-top-width: 3px; }
    .xp-win.max [data-w="max"]::before { inset: 7px 7px 3px 3px; }
    .xp-win.max [data-w="max"]::after { inset: 3px 3px 7px 7px; background: none; border: 1px solid #fff; border-top-width: 2px; border-left: 0; border-bottom: 0; }
    .xp-tb [data-w="close"]::before, .xp-tb [data-w="close"]::after { left: 8.5px; top: 3px; width: 2px; height: 13px; transform: rotate(45deg); }
    .xp-tb [data-w="close"]::after { transform: rotate(-45deg); }
    .xp-body { flex: 1; min-height: 0; overflow: auto; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; user-select: text; container-type: inline-size; }
    .xp-win[data-app="msgs"] .xp-body { overflow: hidden; }
    .xp-grip { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; touch-action: none;
      background: linear-gradient(135deg, transparent 52%, #8a8775 52% 60%, transparent 60% 70%, #8a8775 70% 78%, transparent 78%); }
    .xp-win.max .xp-grip { display: none; }

    .xp-taskbar { position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: 30px; display: flex; align-items: stretch;
      background: linear-gradient(#3168d5, #4993e6 6%, #2157d7 20%, #2663e0 60%, #1941a5); }
    .xp-start { display: flex; align-items: center; gap: 5px; padding: 0 18px 2px 10px; border: 0; border-radius: 0 10px 10px 0; cursor: pointer;
      background: linear-gradient(#5eac56, #3c9c3c 12%, #37a137 55%, #2e8a2e 90%, #296d29); font: italic bold 18px/1 "Trebuchet MS", Tahoma, sans-serif; text-shadow: 1px 1px 2px #1a4e1a; }
    .xp-start:hover, .xp-start.on { filter: brightness(1.1); }
    .xp-start svg { width: 18px; height: 18px; font-style: normal; }
    .xp-tasks { flex: 1; min-width: 0; display: flex; gap: 3px; padding: 3px 6px; }
    .xp-tasks button { flex: 0 1 160px; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid #1c49b3; border-radius: 3px; cursor: pointer; text-align: left;
      background: linear-gradient(#5a9bf6, #3c81f3 20%, #3175ee); }
    .xp-tasks button:hover { background: linear-gradient(#6faaf8, #4f8ff6 20%, #4485f2); }
    .xp-tasks button.on { background: #1e4fb8; border-color: #12348a; }
    .xp-tasks svg { width: 16px; height: 16px; flex: none; }
    .xp-tasks span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-tray { display: flex; align-items: center; gap: 10px; padding: 0 12px; border-left: 1px solid #0d3f9e;
      background: linear-gradient(#0c9ae8, #19b4f5 8%, #0f93e2 55%, #0d86d6); }
    .xp-tray .conn { color: #fff; font-size: 11px; }
    .xp-clock { font-size: 12px; white-space: nowrap; }

    .xp-menu { position: absolute; z-index: 1; left: 0; bottom: 30px; width: min(400px, 92%); display: none; flex-direction: column; border-radius: 8px 8px 0 0; overflow: hidden;
      border: 1px solid #0b3fae; box-shadow: 2px 2px 6px rgba(0,0,0,.4); }
    .xp-menu.on { display: flex; }
    .xp-menu .hd { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: linear-gradient(#1868ce, #0e5bc8 30%, #2b75dc 90%); font-size: 15px; font-weight: bold; text-shadow: 1px 1px #0f1089; }
    .xp-menu .hd i { width: 40px; height: 40px; border: 2px solid #fff; border-radius: 4px; background: linear-gradient(135deg, #f7c96b, #e08a2c); display: grid; place-items: center; font: normal bold 20px Tahoma, sans-serif; text-shadow: none; color: #fff; }
    .xp-menu .cols { display: grid; grid-template-columns: 1.15fr 1fr; color: #000; border-top: 2px solid #f19a3c; }
    .xp-menu .l { background: #fff; padding: 6px 4px; display: grid; gap: 2px; align-content: start; }
    .xp-menu .r { background: #d3e5fa; border-left: 1px solid #95bdee; padding: 6px 4px; display: grid; gap: 2px; align-content: start; color: #0a246a; }
    .xp-menu .cols button { display: grid; grid-template-columns: 32px 1fr; align-items: center; gap: 0 8px; padding: 4px 6px; text-align: left; background: none; border: 0; border-radius: 2px; cursor: pointer; color: inherit; }
    .xp-menu .cols button:hover { background: #316ac5; color: #fff; }
    .xp-menu .cols button svg { width: 32px; height: 32px; grid-row: span 2; }
    .xp-menu .cols button b { font-size: 12px; }
    .xp-menu .cols button small { color: #6b6b6b; font-size: 11px; }
    .xp-menu .cols button:hover small { color: #dbe6fb; }
    .xp-menu .r p { margin: 4px 8px; font-size: 11px; color: #3c4f7a; }
    .xp-menu .ft { display: flex; justify-content: flex-end; gap: 6px; padding: 6px 8px; background: linear-gradient(#2b75dc, #1868ce); }
    .xp-menu .ft button { display: flex; align-items: center; gap: 6px; padding: 3px 8px; background: none; border: 0; border-radius: 3px; cursor: pointer; }
    .xp-menu .ft button:hover { background: rgba(255,255,255,.15); }
    .xp-menu .ft i { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #fff; display: grid; place-items: center; font-style: normal; font-weight: bold; }
    .xp-menu .ft .off i { background: linear-gradient(135deg, #f08a5d, #c8361a); }
    .xp-menu .ft .out i { background: linear-gradient(135deg, #f7c96b, #d98a1b); }

    .xp-msgs { height: 100%; display: grid; grid-template-columns: minmax(170px, 34%) minmax(0, 1fr); color-scheme: light; background: #fff; color: #1b1b1b; font: 12px/1.4 Tahoma, Verdana, "Segoe UI", sans-serif; }
    .xp-buddies { overflow: auto; border-right: 1px solid #b9c9e6; background: linear-gradient(#eef4fd, #dbe7fa); }
    .xp-buddies h3 { margin: 0; padding: 7px 10px 5px; font-size: 11px; color: #1d3f8a; border-bottom: 1px solid #c3d3ee; }
    .xp-buddy { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 0 8px; width: 100%; padding: 6px 8px; text-align: left; border: 0; border-bottom: 1px solid #dde6f5; background: none; cursor: pointer; }
    .xp-buddy:hover { background: #e3edfc; }
    .xp-buddy.on { background: #cfe0fb; box-shadow: inset 3px 0 #316ac5; }
    .xp-buddy i { grid-row: span 3; width: 28px; height: 28px; border-radius: 5px; border: 1px solid rgba(0,0,0,.25); display: grid; place-items: center; color: #fff; font: normal bold 13px Tahoma, sans-serif; text-shadow: 0 1px 1px rgba(0,0,0,.4); }
    .xp-buddy b, .xp-buddy span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-buddy .ps { font-size: 11px; color: #777; }
    .xp-buddy .ps.w { color: #13871a; } .xp-buddy .ps.s, .xp-buddy .ps.x { color: #b86b00; }
    .xp-buddy .pv { font-size: 11px; color: #5c5c5c; }
    .xp-buddies .none { padding: 12px 10px; color: #666; }
    .xp-conv { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .xp-conv .hd { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #b9c9e6; background: linear-gradient(#fafcff, #e3ecfa); }
    .xp-conv .hd i { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .xp-conv .hd div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .xp-conv .hd b, .xp-conv .hd small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-conv .hd b { font-size: 13px; }
    .xp-conv .hd small { color: #666; }
    .xp-conv button { padding: 3px 10px; border: 1px solid #003c74; border-radius: 3px; background: linear-gradient(#fff, #ecebe6 85%, #d6d0c5); color: #000; cursor: pointer; }
    .xp-conv button:hover:not(:disabled) { box-shadow: inset 0 0 0 1px #f8b636; }
    .xp-conv button:disabled { color: #a0a0a0; border-color: #c9c7ba; cursor: default; }
    .xp-chatlog { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; user-select: text; }
    .xp-chatlog .u { align-self: flex-end; max-width: 85%; background: #dbe9ff; border: 1px solid #a9c4ef; border-radius: 8px 8px 2px 8px; padding: 5px 9px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .xp-chatlog .u.q { background: #eef4ff; border-style: dashed; }
    .xp-chatlog .u em { display: block; font-style: normal; font-size: 11px; color: #4a6aa0; margin-top: 2px; }
    .xp-chatlog .a { white-space: pre-wrap; overflow-wrap: anywhere; }
    .xp-chatlog .a code { font: 11px ui-monospace, Menlo, monospace; background: #eef0f4; border-radius: 3px; padding: 0 3px; }
    .xp-chatlog .a pre { font: 11px/1.45 ui-monospace, Menlo, monospace; background: #f3f4f7; border: 1px solid #dde1e8; border-radius: 4px; padding: 6px 8px; margin: 4px 0; overflow-x: auto; white-space: pre; }
    .xp-chatlog .a .h { font-weight: bold; }
    .xp-chatlog .t { color: #7a7a7a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-chatlog details.t[open] { white-space: normal; }
    .xp-chatlog details.t summary { cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
    .xp-chatlog details.t div { padding-left: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xp-chatlog .n { color: #7a7a7a; font-size: 11px; text-align: center; }
    .xp-chatlog .ts { color: #999; font-size: 10px; text-align: center; margin-top: 4px; }
    .xp-conv form { display: flex; gap: 6px; align-items: flex-end; padding: 6px 8px 4px; border-top: 1px solid #b9c9e6; background: #eef3fb; }
    .xp-conv textarea { flex: 1; font: inherit; font-size: 12px; color: #000; background: #fff; border: 1px solid #7f9db9; padding: 5px 7px; resize: none; min-height: 44px; max-height: 30vh; }
    .xp-conv textarea:disabled { background: #f4f4f0; }
    .xp-conv form button { padding: 6px 16px; font-weight: bold; }
    .xp-conv .st { padding: 0 8px 6px; font-size: 11px; color: #666; background: #eef3fb; }
    .xp-conv .st.ok { color: #13871a; } .xp-conv .st.warn { color: #9a6200; } .xp-conv .st.bad { color: #c0261b; }
    .xp-conv kbd { font: inherit; font-weight: bold; background: #fff; border: 1px solid #b9c9e6; border-radius: 3px; padding: 0 4px; }
    .xp-conv.empty form, .xp-conv.empty .st, .xp-conv.empty .hd { display: none; }

    .xp-win[data-app="cctv"] .xp-body { overflow: hidden; }
    .xp-cctv { height: 100%; display: flex; flex-direction: column; background: #0a0c0b; color: #e8efe9; font: 11px/1.2 Tahoma, Verdana, "Segoe UI", sans-serif; user-select: none; }
    .cc-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; background: #ece9d8; color: #000; border-bottom: 1px solid #aca899; }
    .cc-bar button { padding: 2px 9px; border: 1px solid #003c74; border-radius: 3px; background: linear-gradient(#fff, #ecebe6 85%, #d6d0c5); color: #000; cursor: pointer; font: inherit; }
    .cc-bar button:hover { box-shadow: inset 0 0 0 1px #f8b636; }
    .cc-bar button[aria-pressed="true"] { background: linear-gradient(#d6d0c5, #e3e0d6); box-shadow: inset 1px 1px 2px rgba(0,0,0,.25); }
    .cc-bar small { color: #555; }
    .cc-bar .sp { flex: 1; }
    .cc-bar .rec { color: #c0261b; font-weight: bold; }
    .cc-bar b { padding: 0 6px; }
    .cc-grid { flex: 1; min-height: 0; display: grid; gap: 3px; padding: 3px; }
    .cc-tile, .cc-one { position: relative; min-width: 0; min-height: 0; overflow: hidden; padding: 0; border: 0; background: #000; color: inherit; cursor: pointer; font: inherit; text-align: left;
      container-type: size; }
    .cc-tile[hidden], .cc-one[hidden], .cc-grid[hidden] { display: none; }
    .cc-tile:hover { outline: 2px solid #f8b636; outline-offset: -2px; }
    .cc-tile canvas, .cc-one canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cc-one { flex: 1; margin: 3px; cursor: grab; touch-action: none; }
    .cc-one canvas { object-fit: contain; }
    .cc-tile i, .cc-one i { position: absolute; padding: 1px 4px; font: 600 10px/1.25 ui-monospace, Menlo, Consolas, monospace; font-style: normal; letter-spacing: .02em;
      color: #f2f6f0; text-shadow: 0 0 2px #000, 1px 1px 0 #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
    .cc-one i { font-size: 14px; padding: 4px 8px; }
    .cc-tile .nm, .cc-one .nm { left: 2px; top: 2px; }
    .cc-tile .fl, .cc-one .fl { left: 2px; bottom: 2px; color: #cfd8cf; }
    .cc-tile .ts, .cc-one .ts { right: 2px; bottom: 2px; }
    .cc-tile .rc, .cc-one .rc { right: 2px; top: 2px; color: #ff4b3a; }
    .cc-tile .rc u, .cc-one .rc u { text-decoration: none; animation: cc-blink 1s steps(1) infinite; }
    @keyframes cc-blink { 50% { color: transparent; } }
    .cc-tile .ns, .cc-one .ns { inset: 0; max-width: none; display: grid; place-items: center; color: #9aa59b; letter-spacing: .2em;
      background: repeating-linear-gradient(0deg, #101211 0 2px, #161917 2px 4px); }
    .cc-tile canvas[data-live] ~ .ns, .cc-one canvas[data-live] ~ .ns { display: none; }
    .cc-tile.off canvas, .cc-one.off canvas, .cc-tile.off .rc, .cc-one.off .rc { visibility: hidden; }
    .cc-tile.off canvas ~ .ns, .cc-one.off canvas ~ .ns { display: grid; color: #d8ddd8; animation: cc-static .24s steps(3) infinite;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .55 0 0 0 0 .5 0 0 0 .8 -.35'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%23202421'/%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 160px 90px; }
    @keyframes cc-static { 33% { background-position: 37px 51px; } 66% { background-position: 91px 13px; } }
    .cc-tile .pw { position: absolute; right: 2px; top: 18px; width: 22px; height: 20px; padding: 0; border: 1px solid rgba(255,255,255,.35); border-radius: 3px;
      background: rgba(0,0,0,.55); color: #9fe8a8; font: 12px/1 system-ui, sans-serif; cursor: pointer; opacity: 0; }
    .cc-tile:hover .pw, .cc-tile:focus-within .pw, .cc-tile.off .pw { opacity: 1; }
    .cc-tile.off .pw, .cc-one.off .cc-pad [data-power] { color: #ff6a5a; }
    .cc-one:focus-visible { outline: 2px solid #f8b636; outline-offset: -2px; }
    .cc-one.drag { cursor: grabbing; }
    .cc-pad { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; gap: 3px; padding: 3px; border-radius: 5px; background: rgba(0,0,0,.5); }
    .cc-pad button { min-width: 26px; height: 24px; padding: 0 6px; border: 1px solid rgba(255,255,255,.35); border-radius: 3px; background: rgba(30,34,31,.8); color: #e8efe9;
      font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
    .cc-pad button:hover { background: rgba(70,80,72,.9); }
    .cc-one.off .cc-pad button:not([data-power]) { opacity: .4; pointer-events: none; }
    .cc-keys { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); padding: 2px 8px; border-radius: 4px; background: rgba(0,0,0,.45);
      color: #cfd8cf; font: 11px/1.5 system-ui, sans-serif; white-space: nowrap; pointer-events: none; }
    .cc-keys kbd { font: inherit; font-weight: 600; color: #fff; padding: 0 3px; border: 1px solid rgba(255,255,255,.3); border-radius: 3px; }
    @container (max-width: 520px) { .cc-keys { display: none; } }
    body:not([data-view="desktop"]) .cc-keys { display: none; }
    .cc-tile .ts b { font-weight: inherit; }
    @container (max-width: 300px) { .cc-tile .ts b { display: none; } }
    @container (max-width: 220px) { .cc-tile .fl, .cc-tile .rc span { display: none; } .cc-tile .nm { max-width: 82%; } }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'xp';
  el.innerHTML = `<div class="xp-wall"></div><div class="xp-icons">${Object.entries(APPS).map(([k, a]) => `<button class="xp-icon" data-app="${k}" title="${a.sub}">${a.icon}<span>${a.title}</span></button>`).join('')}</div>
    <div class="xp-area">${Object.entries(APPS).map(([k, a]) => `<section class="xp-win" data-app="${k}" hidden>
      <header class="xp-tb">${a.icon}<b>${a.title}</b><button data-w="min" title="Minimise"></button><button data-w="max" title="Maximise"></button><button data-w="close" title="Close"></button></header>
      <div class="xp-body"></div><i class="xp-grip"></i></section>`).join('')}</div>
    <div class="xp-menu"><div class="hd"><i></i><span></span></div>
      <div class="cols"><div class="l">${Object.entries(APPS).map(([k, a]) => `<button data-app="${k}">${a.icon}<b>${a.title}</b><small>${a.sub}</small></button>`).join('')}</div>
        <div class="r"><button data-act="office">${svg('<path d="M4 29V9l12-6 12 6v20z" fill="#e9eef7" stroke="#3b5f99"/><path d="M8 12h4v4H8zm6 0h4v4h-4zm6 0h4v4h-4zM8 19h4v4H8zm12 0h4v4h-4zm-6 0h4v10h-4z" fill="#5a86c8"/>')}<b>My office</b><small>Walk around</small></button><p></p></div></div>
      <div class="ft"><button class="out" data-act="office"><i>⇠</i>Log Off</button><button class="off" data-act="office"><i>⏻</i>Shut Down</button></div></div>
    <div class="xp-taskbar"><button class="xp-start">${svg('<rect x="7" y="3" width="18" height="27" rx="1.5" fill="#fff"/><path d="M10 7h4v4h-4zm8 0h4v4h-4zm-8 7h4v4h-4zm8 0h4v4h-4zm-4 8h4v8h-4z" fill="#2e8a2e"/>')}start</button><div class="xp-tasks"></div>
      <div class="xp-tray"><span class="xp-clock"></span></div></div>`;
  document.body.appendChild(el);
  const area = el.querySelector('.xp-area'), tasks = el.querySelector('.xp-tasks'), menu = el.querySelector('.xp-menu'), startBtn = el.querySelector('.xp-start');
  const win = (k) => area.querySelector(`.xp-win[data-app="${k}"]`), body = (k) => win(k).querySelector('.xp-body');
  // The live overview and the admin controls move in; their listeners and live updates come with them.
  body('dash').appendChild(document.querySelector('body > main'));
  body('admin').appendChild(document.getElementById('view-admin'));
  el.querySelector('.xp-tray').prepend(document.getElementById('conn'));

  // ----- state -----
  let st = null;
  try { st = JSON.parse(localStorage[KEY] || 'null'); } catch {}
  st = { z: 0, sel: null, ...st, wins: Object.fromEntries(Object.keys(APPS).map((k) => [k, { open: false, min: false, max: false, z: 0, ...DEFAULT[k], ...st?.wins?.[k] }])) };
  const save = () => { try { localStorage[KEY] = JSON.stringify(st); } catch {} };
  const shown = (k) => st.wins[k].open && !st.wins[k].min;
  const topApp = () => Object.keys(APPS).filter(shown).sort((a, b) => st.wins[b].z - st.wins[a].z)[0] || null;
  const fullScreen = () => document.body.dataset.view === 'desktop';

  function place(k) {
    const w = st.wins[k], e = win(k);
    e.hidden = !shown(k);
    e.classList.toggle('max', w.max);
    e.style.zIndex = w.z;
    Object.assign(e.style, w.max ? { left: 0, top: 0, width: '100%', height: '100%' }
      : { left: w.x * 100 + '%', top: w.y * 100 + '%', width: w.w * 100 + '%', height: w.h * 100 + '%' });
    e.querySelector('[data-w="max"]').title = w.max ? 'Restore' : 'Maximise';
  }
  function update() {
    const top = topApp();
    for (const k of Object.keys(APPS)) { place(k); win(k).classList.toggle('on', k === top); }
    tasks.innerHTML = Object.keys(APPS).filter((k) => st.wins[k].open)
      .map((k) => `<button data-app="${k}" class="${k === top ? 'on' : ''}" title="${APPS[k].title}">${APPS[k].icon}<span>${APPS[k].title}</span></button>`).join('');
    syncHash();
    syncMsgs();
    syncCctv();
    save();
  }
  function syncHash() {
    if (!fullScreen()) return;
    const h = '#' + (APPS[topApp()]?.hash || 'desktop');
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function focus(k) {
    if (topApp() !== k || !st.wins[k].z) st.wins[k].z = ++st.z;
    update();
  }
  function open(k) {
    Object.assign(st.wins[k], { open: true, min: false });
    closeMenu();
    focus(k);
  }

  // ----- windows: focus, title bar buttons, drag to move, the corner grip to resize -----
  area.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('.xp-win');
    if (!w) return;
    const k = w.dataset.app, s = st.wins[k], tb = e.target.closest('.xp-tb'), grip = e.target.closest('.xp-grip');
    if (topApp() !== k) focus(k);
    if (e.button || !(tb || grip) || e.target.closest('button') || s.max) return;
    e.preventDefault();
    const A = area.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, r = { x: s.x * A.width, y: s.y * A.height, w: s.w * A.width, h: s.h * A.height };
    const h = tb || grip;
    h.setPointerCapture(e.pointerId);
    const move = (m) => {
      const dx = m.clientX - x0, dy = m.clientY - y0;
      if (tb) { s.x = clamp(r.x + dx, 80 - r.w, A.width - 80) / A.width; s.y = clamp(r.y + dy, 0, A.height - 28) / A.height; }
      else { s.w = clamp(r.w + dx, 300, A.width - r.x) / A.width; s.h = clamp(r.h + dy, 160, A.height - r.y) / A.height; }
      place(k);
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); save(); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  area.addEventListener('click', (e) => {
    const b = e.target.closest('.xp-tb button');
    if (!b) return;
    const k = b.closest('.xp-win').dataset.app, s = st.wins[k];
    if (b.dataset.w === 'min') s.min = true;
    else if (b.dataset.w === 'max') s.max = !s.max;
    else Object.assign(s, { open: false, min: false });
    update();
  });
  area.addEventListener('dblclick', (e) => {
    const tb = e.target.closest('.xp-tb');
    if (!tb || e.target.closest('button')) return;
    const s = st.wins[tb.closest('.xp-win').dataset.app];
    s.max = !s.max; update();
  });
  // Taskbar: a hidden window comes back; the front one minimises; any other comes to the front.
  tasks.addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.app;
    if (!k) return;
    if (topApp() === k) { st.wins[k].min = true; update(); } else open(k);
  });
  el.querySelector('.xp-icons').addEventListener('click', (e) => { const k = e.target.closest('[data-app]')?.dataset.app; if (k) open(k); });

  // ----- start menu -----
  function closeMenu() { menu.classList.remove('on'); startBtn.classList.remove('on'); }
  startBtn.addEventListener('click', () => {
    if (menu.classList.contains('on')) { closeMenu(); return; }
    const who = dash.config?.owner || 'You', n = dash.state?.live.length || 0;
    menu.querySelector('.hd i').textContent = who[0].toUpperCase();
    menu.querySelector('.hd span').textContent = who;
    menu.querySelector('.r p').textContent = `${n} Claude session${n === 1 ? '' : 's'} running · Esc also leaves your desk`;
    menu.classList.add('on'); startBtn.classList.add('on');
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.app) open(b.dataset.app);
    else if (b?.dataset.act === 'office') { closeMenu(); dash.setView('office'); }
  });
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.xp-menu, .xp-start')) closeMenu(); });
  // Esc (or Start > Log off / Shut down) gets up from the computer; an open drawer or the start menu closes first.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !fullScreen() || document.body.classList.contains('drawer')) return;
    if (menu.classList.contains('on')) { closeMenu(); return; }
    dash.setView('office');
  }, true);

  // ----- clock -----
  const clockEl = el.querySelector('.xp-clock');
  const tick = () => {
    const d = new Date(), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (clockEl.textContent !== t) { clockEl.textContent = t; clockEl.title = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  };
  tick(); setInterval(() => { tick(); if (shown('cctv')) stampCctv(); }, 1000);

  // ----- Messages: your sessions on the left, the conversation on the right -----
  body('msgs').innerHTML = `<div class="xp-msgs"><div class="xp-buddies"></div>
    <div class="xp-conv empty"><div class="hd"><i></i><div><b></b><small></small></div><button data-act="details">Details</button></div>
      <div class="xp-chatlog"><div class="n" style="margin:auto">Pick a session on the left to chat with it.</div></div>
      <form><textarea rows="2" maxlength="8000" spellcheck="true"></textarea><button>Send</button></form><div class="st"></div></div></div>`;
  const buddies = body('msgs').querySelector('.xp-buddies'), conv = body('msgs').querySelector('.xp-conv'), log = conv.querySelector('.xp-chatlog');
  const input = conv.querySelector('textarea');
  const chat = chatView({ log, input, send: conv.querySelector('form button'), status: conv.querySelector('.st'), onUpdate: renderConvHead, route: fullScreen });
  let buddiesHtml = '';
  function renderBuddies() {
    const S = dash.state;
    if (!S) return;
    const last = {};
    for (const e of S.feed) if ((e.kind === 'say' || e.kind === 'prompt') && !last[e.sessionId]) last[e.sessionId] = e;   // the feed is newest first
    const live = [...S.live].sort((a, b) => a.startedAt - b.startedAt);
    const html = `<h3>Online now (${live.length})</h3>` + (live.map((s) => {
      const id = s.sessionId, e = last[id], [stText, cls] = STATUS[s.status] || [s.status === 'waiting' ? 'Needs you · answer in its terminal' : String(s.status || 'unknown'), 'x'];
      const pv = e ? (e.kind === 'prompt' ? 'You: ' : '') + e.text : s.transcript?.lastPrompt ? 'You: ' + s.transcript.lastPrompt : 'No messages yet';
      const name = titleOf(s);
      return `<button class="xp-buddy${id === st.sel ? ' on' : ''}" data-id="${id}"><i style="background:${dash.colorHex(id)}">${escapeHtml((s.name || name || '?')[0].toUpperCase())}</i>
        <b>${escapeHtml(name)}</b><span class="ps ${cls}">${escapeHtml(stText)}</span><span class="pv">${escapeHtml(String(pv).slice(0, 140))}</span></button>`;
    }).join('') || '<div class="none">No Claude sessions running.</div>');
    if (html !== buddiesHtml) buddies.innerHTML = buddiesHtml = html;
  }
  function renderConvHead() {
    const s = dash.state?.live.find((x) => x.sessionId === st.sel);
    conv.querySelector('.hd i').style.background = st.sel ? dash.colorHex(st.sel) : '';
    conv.querySelector('.hd b').textContent = s ? titleOf(s) : 'Session ended';
    conv.querySelector('.hd small').textContent = s ? `${STATUS[s.status]?.[0] || s.status} · ${s.name} · ${dash.fmt.home(s.cwd)}` : '';
  }
  // Poll the open conversation only while the Messages window is up.
  function syncMsgs() {
    const on = shown('msgs');
    conv.classList.toggle('empty', !st.sel);
    if (on) renderBuddies();
    if (on && st.sel && chat.id !== st.sel) { chat.open(st.sel); renderConvHead(); }
    else if (!on && chat.id) chat.close();
  }
  buddies.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    st.sel = id; save();
    syncMsgs();
    if (CAN_CHAT && fullScreen()) setTimeout(() => input.focus());
  });
  conv.querySelector('[data-act="details"]').addEventListener('click', () => { if (st.sel) dash.openDrawer(st.sel); });
  dash.onUpdate(() => { if (shown('msgs')) { renderBuddies(); if (chat.id) { renderConvHead(); chat.sync(); } } });

  // ----- Security: the cameras' feeds, a grid of the floor picked or one camera big -----
  // The office draws them (office/systems/cctv.js) into the canvases handed to dash.cctv.want(): only those on screen,
  // and none while the window is closed, minimised or under a maximised one. Opened before the office has ever been,
  // it mounts the office (unseen) for its cameras. Each camera can be turned off (its tile's ⏻), and the one enlarged
  // aimed: the pad's arrows, dragging the picture (grabbing it), the keys (below), the wheel or +/− to zoom. That's
  // office.cameras on the server, so every view and browser (and the camera itself, in the office) follows.
  st.cam = { floor: 'all', one: null, ...st.cam };
  const cc = body('cctv');
  cc.innerHTML = `<div class="xp-cctv"><div class="cc-bar"></div><div class="cc-grid"></div>
    <div class="cc-one" tabindex="0" hidden><canvas width="640" height="360"></canvas><i class="nm"></i><i class="rc"><u>●</u> REC</i><i class="fl"></i><i class="ts"></i><i class="ns">NO SIGNAL</i>
      <div class="cc-pad"><button data-power title="Turn off (Space)">⏻</button><button data-pt="-1,0" title="Pan left (← or A)">◀</button><button data-pt="0,1" title="Tilt up (↑ or W)">▲</button>
        <button data-pt="0,-1" title="Tilt down (↓ or S)">▼</button><button data-pt="1,0" title="Pan right (→ or D)">▶</button><button data-zm="-1" title="Zoom out (− or Q)">−</button>
        <button data-zm="1" title="Zoom in (+ or E)">+</button><button data-reset title="Back to its usual aim (R or 0)">Reset</button></div>
      <div class="cc-keys"><kbd>←→↑↓</kbd>/<kbd>WASD</kbd> aim · <kbd>+</kbd><kbd>−</kbd>/<kbd>Q</kbd><kbd>E</kbd> zoom · <kbd>R</kbd> reset · <kbd>Space</kbd> power · <kbd>[</kbd><kbd>]</kbd> camera · drag to look</div></div></div>`;
  const ccBar = cc.querySelector('.cc-bar'), ccGrid = cc.querySelector('.cc-grid'), ccOne = cc.querySelector('.cc-one'), oneCanvas = ccOne.querySelector('canvas');
  let camList = null, tiles = new Map(), ccKey = '', oneId = null;
  const camLabel = (c) => `CAM ${String(camList.indexOf(c) + 1).padStart(2, '0')} · ${c.name}`;
  const floorLabel = (c) => `${c.floor === 50 ? 'R' : c.floor} · ${c.where.toUpperCase()}`;
  const inFloor = () => camList.filter((c) => st.cam.floor === 'all' || c.floor === st.cam.floor);
  const camSet = (id) => ({ on: true, pan: 0, tilt: 0, zoom: 1, ...dash.office.cameras?.[id] });
  function buildCctv() {
    camList = dash.cctv.cams;
    ccGrid.innerHTML = camList.map((c) => `<div class="cc-tile" data-cam="${c.id}" role="button" tabindex="0" title="${escapeHtml(c.name)}: click to enlarge"><canvas width="384" height="216"></canvas>
      <i class="nm">${escapeHtml(camLabel(c))}</i><i class="rc"><u>●</u><span> REC</span></i><i class="fl">${escapeHtml(floorLabel(c))}</i><i class="ts"></i><i class="ns">NO SIGNAL</i>
      <button class="pw" data-power="${c.id}" title="Turn off">⏻</button></div>`).join('');
    tiles = new Map([...ccGrid.querySelectorAll('.cc-tile')].map((b) => [b.dataset.cam, b]));
    stampCctv();
    syncPower();
  }
  // The date shows only where there's room for it (see the tiles' container queries).
  function stampCctv() {
    const [d, t] = stamp(new Date()).split(' ');
    for (const e of cc.querySelectorAll('.ts')) e.innerHTML = `<b>${d} </b>${t}`;
  }
  // Off cameras: static and NO SIGNAL in place of the picture, the switch lit up to turn them back on.
  function syncPower() {
    if (!camList) return;
    for (const [id, t] of tiles) { const on = camSet(id).on; t.classList.toggle('off', !on); t.querySelector('.pw').title = on ? 'Turn off' : 'Turn on'; }
    const on = !oneId || camSet(oneId).on;
    ccOne.classList.toggle('off', !on);
    ccOne.querySelector('[data-power]').title = on ? 'Turn off' : 'Turn on';
  }
  // Whether anything's on screen: shown, and not under a maximised window.
  const ccSeen = () => shown('cctv') && !Object.keys(APPS).some((k) => k !== 'cctv' && shown(k) && st.wins[k].max && st.wins[k].z > st.wins.cctv.z);
  function syncCctv() {
    if (!shown('cctv') && !camList) return;
    if (!dash.cctv) {
      ccBar.innerHTML = '<span>Connecting to the cameras…</span>';
      dash.ensureOffice?.().then(() => { if (dash.cctv) syncCctv(); }, () => { ccBar.innerHTML = '<span>No cameras: the office couldn’t start.</span>'; });
      return;
    }
    if (!camList) buildCctv();
    const list = inFloor(), one = list.find((c) => c.id === st.cam.one) || null;
    // The bar: the floors (with their camera counts), and in the single view prev / next and back to the grid.
    const key = `${st.cam.floor}|${one?.id}`;
    if (key !== ccKey) {
      ccKey = key;
      ccBar.innerHTML = FLOOR_TABS.map(([f, label]) => `<button data-floor="${f}" aria-pressed="${st.cam.floor === f}">${label} <small>${camList.filter((c) => f === 'all' || c.floor === f).length}</small></button>`).join('')
        + '<span class="sp"></span>' + (one ? `<button data-go="-1" title="Previous camera">◀</button><b>${escapeHtml(camLabel(one))}</b><button data-go="1" title="Next camera">▶</button><button data-go="0">⊞ Grid</button>`
          : `<span class="rec">●</span><span>REC · ${list.length} camera${list.length === 1 ? '' : 's'}</span>`);
      const cols = list.length <= 1 ? 1 : list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
      Object.assign(ccGrid.style, { gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(list.length / cols)}, 1fr)` });
      for (const [id, b] of tiles) b.hidden = !list.some((c) => c.id === id);
      ccGrid.hidden = !!one; ccOne.hidden = !one;
      if (one && one.id !== oneId) {   // a fresh camera: no signal until its first frame
        delete oneCanvas.dataset.live; oneCanvas.getContext('bitmaprenderer').transferFromImageBitmap(null);
        ccOne.querySelector('.nm').textContent = camLabel(one); ccOne.querySelector('.fl').textContent = floorLabel(one);
      }
      oneId = one?.id ?? null;
      syncPower();
    }
    dash.cctv.want(!ccSeen() ? [] : one ? [{ id: one.id, canvas: oneCanvas, fps: 12 }] : list.map((c) => ({ id: c.id, canvas: tiles.get(c.id).querySelector('canvas'), fps: 4 })));
  }
  function stepCam(d) {
    const list = inFloor(), i = list.findIndex((c) => c.id === st.cam.one);
    st.cam.one = d ? list[(i + d + list.length) % list.length].id : null;
    save(); syncCctv();
    if (st.cam.one && fullScreen()) ccOne.focus({ preventScroll: true });
  }
  // A change to a camera: shown at once everywhere on this page, saved at most every 200 ms (a drag sends a few, not
  // hundreds), and held against the server's echoes of older ones for a moment.
  let camSave = {}, camTimer = 0;
  function setCam(id, patch, now) {
    const c = camList.find((x) => x.id === id), was = camSet(id), next = { ...was, ...patch };
    next.pan = Math.round(clamp(next.pan, -c.lim.pan, c.lim.pan) * 10) / 10;
    next.tilt = Math.round(clamp(next.tilt, ...c.lim.tilt) * 10) / 10;
    next.zoom = Math.round(clamp(next.zoom, 1, c.lim.zoom) * 100) / 100;
    if (JSON.stringify(next) === JSON.stringify(was)) return;
    (dash.camHold ||= {})[id] = performance.now() + 1500;
    dash.putOffice({ cameras: { [id]: next } }, false);
    camSave[id] = next;
    if (now) flushCams(); else camTimer ||= setTimeout(flushCams, 200);
  }
  function flushCams() {
    clearTimeout(camTimer); camTimer = 0;
    if (Object.keys(camSave).length) dash.putOffice({ cameras: camSave });
    camSave = {};
  }
  const nudge = (dp, dt) => { const s = camSet(oneId), k = 5 / s.zoom; setCam(oneId, { pan: s.pan + dp * k, tilt: s.tilt + dt * k * 0.6 }); };
  const zoomBy = (d) => setCam(oneId, { zoom: camSet(oneId).zoom * (d > 0 ? 1.25 : 0.8) });
  dash.officeListeners.add(() => syncPower());
  cc.addEventListener('click', (e) => {
    if (!camList) return;
    const b = e.target.closest('button'), tile = e.target.closest('.cc-tile');
    if (b?.dataset.power !== undefined) { const id = b.dataset.power || oneId; setCam(id, { on: !camSet(id).on }, true); }
    else if (b?.dataset.floor) { const f = b.dataset.floor; st.cam.floor = f === 'all' ? f : +f; st.cam.one = null; save(); syncCctv(); }
    else if (b?.dataset.go) stepCam(+b.dataset.go);
    else if (b?.dataset.pt) { const [p, t] = b.dataset.pt.split(',').map(Number); nudge(p, t); }
    else if (b?.dataset.zm) zoomBy(+b.dataset.zm);
    else if (b?.dataset.reset !== undefined) setCam(oneId, { pan: 0, tilt: 0, zoom: 1 }, true);
    else if (tile && !b) { st.cam.one = tile.dataset.cam; save(); syncCctv(); if (fullScreen()) ccOne.focus({ preventScroll: true }); }
  });
  ccGrid.addEventListener('keydown', (e) => { const t = e.target.closest('.cc-tile'); if (t && (e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); t.click(); } });
  // Drag the picture to look round (grab it: drag right and the view goes left), the wheel to zoom.
  ccOne.addEventListener('pointerdown', (e) => {
    if (e.button || e.target.closest('button') || !oneId) return;
    e.preventDefault(); ccOne.focus({ preventScroll: true });
    const r = oneCanvas.getBoundingClientRect(), s0 = camSet(oneId), x0 = e.clientX, y0 = e.clientY;
    const deg = 70 / s0.zoom / r.width;   // about the feed's width in degrees, over its width in pixels
    ccOne.setPointerCapture(e.pointerId); ccOne.classList.add('drag');
    const move = (m) => setCam(oneId, { pan: s0.pan - (m.clientX - x0) * deg, tilt: s0.tilt + (m.clientY - y0) * deg });
    const up = () => { ccOne.classList.remove('drag'); ccOne.removeEventListener('pointermove', move); ccOne.removeEventListener('pointerup', up); ccOne.removeEventListener('pointercancel', up); flushCams(); };
    ccOne.addEventListener('pointermove', move); ccOne.addEventListener('pointerup', up); ccOne.addEventListener('pointercancel', up);
  });
  ccOne.addEventListener('wheel', (e) => { if (!oneId) return; e.preventDefault(); setCam(oneId, { zoom: camSet(oneId).zoom * Math.exp(-e.deltaY * 0.002) }); }, { passive: false });
  // Keys, whenever the enlarged view is up in the front window of the desktop you're using (full screen) and you're not
  // typing: arrows / WASD aim (held, they keep turning, 40 deg/s at 1x), +/- or Q/E zoom (held too), 0 or R resets, Space
  // switches it on/off, [ ] or Tab / Shift+Tab step through the cameras.
  const AIM = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
    Equal: [0, 0, 1], NumpadAdd: [0, 0, 1], KeyE: [0, 0, 1], Minus: [0, 0, -1], NumpadSubtract: [0, 0, -1], KeyQ: [0, 0, -1] };
  const held = new Set();
  let holdRaf = 0, holdT = 0;
  const camKeys = (e) => fullScreen() && topApp() === 'cctv' && !!oneId && !ccOne.hidden && !menu.classList.contains('on')
    && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest?.('input, textarea, select, [contenteditable]');
  function hold(now) {
    holdRaf = 0;
    if (!held.size || !oneId) { held.clear(); return; }
    const dt = Math.min(0.1, (now - holdT) / 1000); holdT = now;
    let p = 0, t = 0, z = 0;
    for (const k of held) { const [a, b, c = 0] = AIM[k]; p += a; t += b; z += c; }
    const s = camSet(oneId), v = 40 / s.zoom * dt;
    if (s.on) setCam(oneId, { pan: s.pan + p * v, tilt: s.tilt + t * v, zoom: s.zoom * Math.exp(z * 1.2 * dt) });
    holdRaf = requestAnimationFrame(hold);
  }
  document.addEventListener('keydown', (e) => {
    if (!camKeys(e)) return;
    const c = e.code, step = c === 'BracketLeft' || c === 'BracketRight' || c === 'Tab';
    if (AIM[c]) {
      if (!held.has(c)) { held.add(c); if (!holdRaf) { holdT = performance.now() - 16; holdRaf = requestAnimationFrame(hold); } }
    } else if (!step && !/^(Digit0|Numpad0|KeyR|Space)$/.test(c)) return;
    else if (e.repeat && !step) { /* held down: once is enough */ }
    else if (step) stepCam(c === 'BracketLeft' || (c === 'Tab' && e.shiftKey) ? -1 : 1);
    else if (c === 'Space') setCam(oneId, { on: !camSet(oneId).on }, true);
    else setCam(oneId, { pan: 0, tilt: 0, zoom: 1 }, true);
    e.preventDefault();
  }, true);
  const letGo = (e) => { if (held.delete(e.code) && !held.size) flushCams(); };
  document.addEventListener('keyup', letGo, true);
  addEventListener('blur', () => { held.clear(); flushCams(); });

  update();
  return {
    el, open, syncHash,
    // On the monitor or MacBook (an office element) the desktop is display-only; on the page it's yours to use.
    // Moving it resets scroll positions, so they're carried across.
    mount(parent) {
      if (el.parentNode === parent) return;
      const keep = [...el.querySelectorAll('.xp-body, .feed, .xp-chatlog, .xp-buddies')].map((e) => [e, e.scrollTop]);
      const away = parent !== document.body;
      if (away && el.contains(document.activeElement)) document.activeElement.blur();
      closeMenu();
      parent.appendChild(el);
      el.inert = away;
      for (const [e, t] of keep) e.scrollTop = t;
      syncHash();
      syncCctv();
    },
  };
}
