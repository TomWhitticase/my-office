// The office's stylesheet and its HUD: the crosshair, hover card, minimap, counts, clock, legend, toast, and the bars
// for using a TV, drawing on a whiteboard and chatting (shown by the classes mountOffice and the parts toggle).

import { MARKER, WB_COLORS } from './util.js';

export const CSS = `
    #view-office canvas.of-gl { position: absolute; inset: 0; z-index: 1; display: block; }
    #view-office { background: #0b0c0e; }   /* if a frame is ever missed, show dark, not the white page */
    #view-office .of-css { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .of-dom { background: var(--page); overflow: hidden; pointer-events: none; }
    .of-hud { position: absolute; inset: 0; z-index: 2; pointer-events: none; font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #fff; transition: opacity .4s; }
    .of-hud.hidden { opacity: 0; }
    .of-bare > :not(.of-cross, .of-toast, .of-tvbar, .of-osd, .of-chat, .of-chatbar, .of-wbbar, .of-wbtext) { display: none !important; }   /* a TV in use keeps its bar, an open chat stays */
    .of-toast { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); background: rgba(15,16,19,.82); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 6px 12px; color: #c3c2b7; font-size: 12px; opacity: 0; transition: opacity .3s; }
    .of-toast.on { opacity: 1; }
    .of-toast kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,255,255,.9); box-shadow: 0 0 0 2px rgba(0,0,0,.35); display: none; }
    .of-locked .of-cross { display: block; }
    .of-target { position: absolute; left: 50%; top: calc(50% + 28px); transform: translateX(-50%); background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px 12px; min-width: 220px; max-width: 420px; text-align: center; display: none; }
    .of-target b { font-size: 14px; display: block; }
    .of-target .m { color: #c3c2b7; }
    .of-target .k { color: #8b8a85; font-size: 12px; margin-top: 3px; }
    .of-map { position: absolute; right: 16px; top: 16px; border-radius: 10px; background: rgba(15,16,19,.78); border: 1px solid rgba(255,255,255,.12); }
    .of-legend { position: absolute; left: 16px; bottom: 14px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; }
    .of-legend kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-start { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); background: rgba(15,16,19,.82); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 16px 22px; text-align: center; pointer-events: none; }
    .of-start b { font-size: 16px; display: block; margin-bottom: 4px; }
    .of-start span { color: #c3c2b7; }
    .of-locked .of-start { display: none; }
    .of-count { position: absolute; left: 16px; top: 16px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; }
    .of-count b { color: #fff; }
    .of-time { position: absolute; left: 16px; top: 56px; display: flex; align-items: center; gap: 6px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 5px 6px 5px 11px; color: #c3c2b7; font-size: 12px; pointer-events: auto; }
    .of-time .of-clock { color: #fff; font-weight: 600; min-width: 96px; white-space: pre; }
    .of-time button { font: inherit; font-size: 11px; color: #c3c2b7; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 2px 7px; cursor: pointer; }
    .of-time button:hover { color: #fff; }
    .of-time button[aria-pressed="true"] { background: #3987e5; border-color: #3987e5; color: #fff; }
    .of-tvbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(880px, calc(100% - 32px)); display: none; align-items: center; gap: 6px; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 6px 8px; pointer-events: auto; }
    .of-using .of-tvbar { display: flex; }
    .of-using .of-legend, .of-using .of-start, .of-using .of-map, .of-using .of-count, .of-using .of-time { display: none; }
    .of-tvbar button { font: inherit; font-size: 13px; color: #e8e6df; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
    .of-tvbar button:hover { color: #fff; background: rgba(255,255,255,.14); }
    .of-tvbar form { flex: 1; display: flex; min-width: 0; }
    .of-tvbar input[name=u] { flex: 1; min-width: 0; font: inherit; font-size: 13px; color: #fff; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); border-radius: 7px; padding: 5px 9px; }
    .of-tvbar input[type=range] { width: 90px; accent-color: #3987e5; }
    .of-tvbar kbd, .of-tvhint kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-tvhint { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); display: none; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; white-space: nowrap; }
    .of-tvhint b { color: #fff; }
    .of-using .of-tvhint { display: block; }
    .of-wbbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); max-width: calc(100% - 32px); display: none; flex-wrap: wrap; justify-content: center; align-items: center; gap: 5px; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 6px 8px; pointer-events: auto; }
    .of-boarding .of-wbbar, .of-boarding .of-wbhint { display: flex; }
    .of-boarding .of-legend, .of-boarding .of-start, .of-boarding .of-map, .of-boarding .of-count, .of-boarding .of-time, .of-boarding .of-target { display: none; }
    .of-heli { position: absolute; left: 50%; top: 60px; transform: translateX(-50%); display: none; gap: 18px; align-items: center; background: rgba(15,16,19,.8); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 8px 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .of-heli small { display: block; color: #8b8a85; font-size: 10px; letter-spacing: .08em; }
    .of-heli b { font-size: 17px; font-weight: 600; }
    .of-heli .hint { color: #c3c2b7; font-size: 12px; border-left: 1px solid rgba(255,255,255,.14); padding-left: 14px; }
    .of-heli .hint.on { color: #8fe3a5; }
    .of-heli kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-flying .of-heli { display: flex; }
    .of-flying .of-legend, .of-flying .of-start, .of-flying .of-count, .of-flying .of-time, .of-flying .of-target, .of-flying .of-cross { display: none !important; }
    .of-wbbar button { font: inherit; font-size: 13px; color: #e8e6df; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
    .of-wbbar button:hover { color: #fff; background: rgba(255,255,255,.14); }
    .of-wbbar button[aria-pressed="true"] { background: #3987e5; border-color: #3987e5; color: #fff; }
    .of-wbbar button:disabled { opacity: .4; cursor: default; }
    .of-wbbar button.sw { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); }
    .of-wbbar button.sw[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px #3987e5; }
    .of-wbbar i { width: 1px; height: 20px; background: rgba(255,255,255,.15); margin: 0 3px; }
    .of-wbbar kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-wbhint { gap: 4px; align-items: center; }
    .of-wbtext { position: absolute; display: none; pointer-events: auto; background: rgba(255,255,255,.7); border: 1px dashed #3987e5; border-radius: 3px; outline: none; padding: 0 3px; min-width: 140px; font-family: ${MARKER}; line-height: 1.15; }
    .of-osd { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); background: rgba(15,16,19,.84); border-radius: 14px; padding: 14px 24px; font-size: 22px; font-weight: 600; white-space: pre; opacity: 0; transition: opacity .3s; }
    .of-osd.on { opacity: 1; }
    .of-chat { position: absolute; right: 16px; top: 16px; bottom: 112px; width: min(500px, calc(100% - 32px)); display: none; flex-direction: column; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; pointer-events: auto; overflow: hidden; }
    .of-chatting .of-chat { display: flex; }
    .of-chat.of-john, .of-chatbar.of-john { display: none !important; }
    .of-johnning .of-chat.of-john, .of-johnning .of-chatbar.of-john { display: flex !important; }
    .of-johnning .of-legend, .of-johnning .of-start, .of-johnning .of-map, .of-johnning .of-target { display: none; }
    .of-chat.of-rosie, .of-chatbar.of-rosie { display: none !important; }
    .of-rosieing .of-chat.of-rosie, .of-rosieing .of-chatbar.of-rosie { display: flex !important; }
    .of-rosieing .of-legend, .of-rosieing .of-start, .of-rosieing .of-map, .of-rosieing .of-target { display: none; }
    .of-chatlog .n.typing::after { content: '…'; animation: of-dots 1.2s steps(4) infinite; display: inline-block; width: 1.2em; overflow: hidden; vertical-align: bottom; }
    @keyframes of-dots { from { width: 0; } to { width: 1.2em; } }
    .of-chatting .of-chatbar { display: flex; }
    .of-chatting .of-legend, .of-chatting .of-start, .of-chatting .of-map, .of-chatting .of-target { display: none; }
    .of-chat .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .of-chat .hd i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .of-chat .hd .tt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .of-chat .hd b, .of-chat .hd small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .of-chat .hd b { font-size: 14px; }
    .of-chat .hd small { color: #c3c2b7; font-size: 12px; }
    .of-chat button, .of-chatbar button { font: inherit; font-size: 12px; color: #e8e6df; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
    .of-chat button:hover, .of-chatbar button:hover { color: #fff; background: rgba(255,255,255,.14); }
    .of-chatlog { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
    .of-chatlog .u { align-self: flex-end; max-width: 85%; background: #2d5f9e; border-radius: 10px 10px 2px 10px; padding: 6px 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .of-chatlog .u.q { background: rgba(57,135,229,.35); border: 1px dashed rgba(255,255,255,.35); }
    .of-chatlog .u em { display: block; font-style: normal; font-size: 11px; color: #c9dcf5; margin-top: 2px; }
    .of-chatlog .a { color: #ecebe4; white-space: pre-wrap; overflow-wrap: anywhere; }
    .of-chatlog .a code { font: 12px ui-monospace, Menlo, monospace; background: rgba(255,255,255,.1); border-radius: 4px; padding: 0 4px; }
    .of-chatlog .a pre { font: 12px/1.45 ui-monospace, Menlo, monospace; background: rgba(0,0,0,.35); border-radius: 6px; padding: 7px 9px; margin: 4px 0; overflow-x: auto; white-space: pre; }
    .of-chatlog .a .h { font-weight: 650; color: #fff; }
    .of-chatlog .t { color: #8b8a85; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .of-chatlog details.t[open] { white-space: normal; }
    .of-chatlog details.t summary { cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
    .of-chatlog details.t div { padding-left: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .of-chatlog .n { color: #8b8a85; font-size: 12px; text-align: center; }
    .of-chatlog .ts { color: #6f6e69; font-size: 11px; text-align: center; margin-top: 4px; }
    .of-chatbar { position: absolute; left: 16px; right: 16px; bottom: 14px; display: none; flex-direction: column; gap: 4px; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 8px; pointer-events: auto; }
    .of-chatbar form { display: flex; gap: 8px; align-items: flex-end; }
    .of-chatbar textarea { flex: 1; font: inherit; font-size: 14px; color: #fff; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 7px 10px; resize: none; max-height: 30vh; min-height: 36px; }
    .of-chatbar textarea:disabled { opacity: .5; }
    .of-chatbar button.pri { background: #3987e5; border-color: #3987e5; color: #fff; padding: 7px 14px; font-size: 13px; }
    .of-chatbar .st { font-size: 12px; color: #8b8a85; padding: 0 2px; }
    .of-chatbar .st.ok { color: #6fcf8f; } .of-chatbar .st.warn { color: #e8b04a; } .of-chatbar .st.bad { color: #f07b6e; }
    .of-chatbar kbd, .of-chat kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-volrow { display: flex; gap: 10px; align-items: center; }
    .of-volrow input { flex: 1; accent-color: var(--accent); padding: 0 !important; }
    .of-volv { min-width: 44px; color: var(--ink-2); font-size: 13px; }
    .of-tvform { display: grid; gap: 12px; }
    .of-tvform label { display: grid; gap: 5px; font-size: 12px; color: var(--muted); }
    .of-tvform input, .of-tvform select { font: inherit; font-size: 14px; color: var(--ink); background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; }
    .of-tvform button, .of-tvform a { font: inherit; font-size: 13px; color: var(--ink-2); background: none; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
    .of-tvform button.pri { background: var(--accent); border-color: var(--accent); color: #fff; }
    .of-presets { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
    .of-presets button { font-size: 12px; padding: 2px 9px; }
    .of-tvwarn { font-size: 12px; color: var(--ink-2); }
    .of-tvwarn:empty { display: none; }
    .of-tvwarn.warn { color: var(--warning); }
    .of-tvwarn.bad { color: var(--critical); }
    .of-tvbtns { display: flex; gap: 8px; align-items: center; }
    .of-tvbtns a { margin-left: auto; }
  `;

export const hudHTML = (ALT, IS_MAC) => `<div class="of-cross"></div><div class="of-target"></div><canvas class="of-map" width="440" height="330" style="width:220px;height:165px"></canvas>
    <div class="of-count"></div>
    <div class="of-time"><span class="of-clock"></span><button data-speed="1">Live</button><button data-speed="120">×120</button><button data-speed="1200">×1200</button><button data-speed="7200">×7200</button></div>
    <div class="of-legend"><kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Click</kbd> talk to someone or use a TV · <kbd>E</kbd> details / set up a TV · <kbd>1</kbd> desks <kbd>2</kbd> breakroom <kbd>3</kbd> my office <kbd>4</kbd> lobby <kbd>5</kbd> meeting rooms · <kbd>T</kbd> time speed · <kbd>G</kbd> graphics · <kbd>H</kbd> hide overlays · <kbd>M</kbd> sounds · <kbd>Esc</kbd> release mouse</div>
    <div class="of-toast"></div>
    <div class="of-heli"><div><small>ALT</small><b class="alt"></b></div><div><small>SPEED</small><b class="spd"></b></div><div><small>HDG</small><b class="hdg"></b></div><div><small>ROTOR</small><b class="rpm"></b></div><div class="hint"></div></div>
    <div class="of-start"><b>Click to look around</b><span>Walk up to anyone and click to talk to them, or click their screen for details.<br>Click your own monitor to use your computer.</span></div>
    <div class="of-tvhint">Using the <b class="of-tvname"></b> TV · click and type into the page · <kbd>${ALT}M</kbd> mute · <kbd>${ALT}−</kbd> <kbd>${ALT}=</kbd> or <kbd>${ALT}scroll</kbd> volume · <kbd>Esc</kbd> back to walking</div>
    <div class="of-tvbar"><button data-nav="back" title="Back">←</button><button data-nav="forward" title="Forward">→</button><button data-nav="reload" title="Reload">⟳</button><button data-nav="home" title="Back to the TV's own page">⌂</button>
      <form><input name="u" type="text" spellcheck="false" autocomplete="off" placeholder="Go to a URL"></form>
      <button data-act="mute"></button><input type="range" min="0" max="100" title="TV volume"><button data-act="setup" title="Set up this TV">⚙</button><button data-act="leave">Done <kbd>Esc</kbd></button></div>
    <div class="of-osd"></div>
    <div class="of-tvhint of-wbhint">Drawing on the <b class="of-wbname"></b> · <kbd>P</kbd> pen <kbd>E</kbd> eraser <kbd>T</kbd> text <kbd>1</kbd>–<kbd>6</kbd> colours · <kbd>${IS_MAC ? '⌘' : 'Ctrl+'}Z</kbd> undo · <kbd>Esc</kbd> back to walking</div>
    <div class="of-wbbar">${WB_COLORS.map((c, i) => `<button class="sw" data-c="${c}" style="background:${c}" title="Colour (${i + 1})"></button>`).join('')}<i></i>
      <button data-t="pen" title="Pen (P)">✎ Pen</button><button data-t="eraser" title="Eraser (E)">⌫ Eraser</button><button data-t="text" title="Text (T): click where to write">T Text</button><i></i>
      <button data-s="S" title="Thin">S</button><button data-s="M" title="Medium">M</button><button data-s="L" title="Thick">L</button><i></i>
      <button data-a="undo" title="Undo (${IS_MAC ? '⌘' : 'Ctrl+'}Z)">↶</button><button data-a="redo" title="Redo (${IS_MAC ? '⇧⌘' : 'Ctrl+Shift+'}Z)">↷</button>
      <button data-a="list" title="Show or hide today's shipped list under your drawing">Shipped list</button><button data-a="reset" title="Put back what was on the board originally">Reset</button><button data-a="wipe" title="Wipe the board clean">Wipe</button><button data-a="leave">Done <kbd>Esc</kbd></button></div>
    <input class="of-wbtext" type="text" spellcheck="false" autocomplete="off" placeholder="Type, then Enter">
    <div class="of-chat"><div class="hd"><i></i><div class="tt"><b></b><small></small></div><button data-act="details">Details</button><button data-act="close">Close <kbd>Esc</kbd></button></div><div class="of-chatlog"></div></div>
    <div class="of-chatbar"><form><textarea rows="1" maxlength="8000" spellcheck="true"></textarea><button class="pri">Send</button></form><div class="st"></div></div>`;
