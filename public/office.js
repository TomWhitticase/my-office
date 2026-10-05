// 3D first-person office view of the live dashboard.
// Working sessions sit at desks with their stats on screen; idle ones hang out in the breakroom.
// Your own glass office holds your computer: the centre monitor is the real, live desktop (desktop.js),
// projected with CSS3DRenderer behind a hole punched in the WebGL scene.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSounds } from './sounds.js';
import { CAN_CHAT, chatView, escapeHtml, titleOf } from './chat.js';
import { AISLE, EYE, F, FONT, LIFT, MARKER, PP, REDUCED, ROOM, SEATED_EYE, WB_COLORS, angDiff, artTexture, box, brickTexture, clamp, colliders, cyl, damp, dash, ease, faceTo, fit, hash, leafTexture, lerp, makeCanvas, makeScreen, mat, mergedBoxes, rng, rugTexture, solid, sstep, woodTexture } from './office/util.js';
import { MONO, drawAway, drawBoard, drawCode, drawFeed, drawOff, drawRoster, drawSession, drawUsage, drawWall, statusOf, tokenRoll } from './office/painters.js';
import { G, Person, installSpots, installSync } from './office/people.js';
import { createCtx } from './office/ctx.js';
import { install as installFurniture } from './office/world/furniture.js';
import { install as installDesks } from './office/world/desks.js';
import { install as installBreakroom, installCozy } from './office/world/breakroom.js';
import { install as installLounge, installVending } from './office/world/lounge.js';
import { install as installMyOffice, installScreen, installDesk } from './office/world/my-office.js';
import { install as installKitchen } from './office/world/kitchen.js';
import { install as installGuitars } from './office/world/guitars.js';
import { install as installMeetingRooms } from './office/world/meeting-rooms.js';
import { install as installFittings } from './office/world/fittings.js';
import { install as installClocks } from './office/world/clocks.js';
import { install as installSky } from './office/world/sky.js';
import { install as installShell, installReception } from './office/world/shell.js';
import { install as installCity } from './office/world/city.js';
import { install as installWhiteboards, installDrawing } from './office/world/whiteboards.js';
import { install as installTVs, installUse } from './office/systems/tvs.js';
import { install as installLiftLobby, installCycle, installRiding, installShafts } from './office/systems/lifts.js';
import { install as installPlayer } from './office/systems/player.js';
import { install as installArchive } from './office/floors/archive.js';
import { install as installGateway } from './office/floors/gateway.js';
import { install as installRoof } from './office/floors/roof.js';
import { install as installServerHall } from './office/floors/server-hall.js';
import { install as installChat } from './office/systems/chat.js';
import { install as installHover } from './office/systems/hover.js';
import { install as installMinimap } from './office/systems/minimap.js';
import { install as installPost, installRender } from './office/systems/post.js';

// ---------- the office ----------
export function mountOffice(container) {
  const style = document.createElement('style');
  style.textContent = `
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
  document.head.appendChild(style);

  // ----- the shared context (see office/ctx.js) -----
  // What every part of the office shares. Values that change (the state, which floor you're on, what you're doing) are
  // read through it each time, never copied.
  const ctx = createCtx({
    THREE, dash, container, colliders, toast,
    get renderer() { return renderer; }, get scene() { return scene; }, get world() { return world; }, get camera() { return camera; },
    get hud() { return hud; },
    get sfx() { return sfx; },
    get cssScene() { return cssScene; },
    get pmrem() { return pmrem; },
    get ALT() { return ALT; }, get IS_MAC() { return IS_MAC; },
    get setOverlays() { return setOverlays; },
    get cssRenderer() { return cssRenderer; },
    get style() { return style; }, get mapCtx() { return mapCtx; },
    get countEl() { return countEl; },
    get targetEl() { return targetEl; },
  });

  // ----- renderers -----
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'of-gl';
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'of-css';
  container.append(cssRenderer.domElement, renderer.domElement);

  const hud = document.createElement('div');
  hud.className = 'of-hud hidden';
  const IS_MAC = /Mac/.test(navigator.platform), ALT = IS_MAC ? '⌥' : 'Alt+';
  hud.innerHTML = `<div class="of-cross"></div><div class="of-target"></div><canvas class="of-map" width="440" height="330" style="width:220px;height:165px"></canvas>
    <div class="of-count"></div>
    <div class="of-time"><span class="of-clock"></span><button data-speed="1">Live</button><button data-speed="120">×120</button><button data-speed="1200">×1200</button><button data-speed="7200">×7200</button></div>
    <div class="of-legend"><kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Click</kbd> talk to someone or use a TV · <kbd>E</kbd> details / set up a TV · <kbd>1</kbd> desks <kbd>2</kbd> breakroom <kbd>3</kbd> my office <kbd>4</kbd> lobby <kbd>5</kbd> meeting rooms · <kbd>T</kbd> time speed · <kbd>G</kbd> graphics · <kbd>H</kbd> hide overlays · <kbd>M</kbd> sounds · <kbd>Esc</kbd> release mouse</div>
    <div class="of-toast"></div>
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
  container.appendChild(hud);
  const targetEl = hud.querySelector('.of-target'), mapCanvas = hud.querySelector('.of-map'), mapCtx = mapCanvas.getContext('2d'), countEl = hud.querySelector('.of-count');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd8ef');
  scene.fog = new THREE.FogExp2('#bcd8ef', 0.0008);
  const cssScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 6000);
  camera.rotation.order = 'YXZ';

  installSky(ctx);
  const { setSpeed, clockState } = ctx;

  const world = new THREE.Group();
  scene.add(world);

  installShell(ctx);
  const { rugs } = ctx;

  installCity(ctx);
  installReception(ctx);

  installFurniture(ctx);
  const { seats } = ctx;
  installDesks(ctx);
  const { desks } = ctx;
  installBreakroom(ctx);
  installWhiteboards(ctx);
  const { boards } = ctx;

  installCozy(ctx);

  installLounge(ctx);
  const { laptop } = ctx;

  installMyOffice(ctx);
  const { blinds, door, doors } = ctx;
  installKitchen(ctx);
  const { kitchen } = ctx;
  installDesk(ctx);
  installGuitars(ctx);

  installScreen(ctx);
  const { syncCss, layoutCenterMonitor, domScreen } = ctx;

  installMeetingRooms(ctx);

  installFittings(ctx);

  installLiftLobby(ctx);
  const { lifts } = ctx;

  installVending(ctx);

  installClocks(ctx);

  installTVs(ctx);
  const { tvQuiet, openTvPanel, tvSocket, tvs } = ctx;

  installSpots(ctx);
  const { idleSpots } = ctx;

  installCycle(ctx);
  const { setLift } = ctx;

  installRiding(ctx);
  const { callLift, pressFloor, resetLift, mine, FLOORS, spare } = ctx;
  installShafts(ctx);
  const { setFloor, renderFloor } = ctx;

  installArchive(ctx);
  const { arch } = ctx;

  installGateway(ctx);

  installRoof(ctx);
  const { EDGE, roof } = ctx;

  installServerHall(ctx);
  const { srv } = ctx;

  // ----- sounds (see sounds.js; M mutes) -----
  const sfx = createSounds({ camera, rugs, glass: { minX: 6, maxX: 20, minZ: -15, maxZ: -3.5 }, lift: LIFT, coffee: { x: -16.5, y: 1.25, z: 14.5, onBrew: () => kitchen.brew(false) }, doorPos: { x: 7.7, z: -3.5 },
    roof: { minX: -EDGE.x, maxX: EDGE.x, minZ: -EDGE.z, maxZ: EDGE.z } });

  installSync(ctx);
  const { people } = ctx;

  installPlayer(ctx);
  const { sitIn, openLaptop, collide, tween, camPose, setCam, laptopFx, fillPose, seatedPose, player, keys, TELEPORTS } = ctx;

  installUse(ctx);
  const { leaveTv, useTv } = ctx;

  installDrawing(ctx);
  const { leaveBoard, useBoard, wb } = ctx;

  installChat(ctx);
  const { openChat, closeChat, openJohn, talk, johnChat } = ctx;

  installHover(ctx);

  installMinimap(ctx);

  installPost(ctx);
  const { composer } = ctx;
  // H hides every overlay: HUD panels, minimap, hover cards and the name tags over people. Only the crosshair stays.
  let toastTimer = 0;
  function setOverlays(on, quiet) {
    ctx.overlays = on; localStorage.officeOverlays = on ? 'on' : 'off';
    hud.classList.toggle('of-bare', !on);
    for (const p of people.values()) p.label.visible = on;
    if (!quiet) toast(`Overlays ${on ? 'shown' : 'hidden'} · <kbd>H</kbd> to ${on ? 'hide' : 'show'}`);
  }
  function toast(html) {
    const t = hud.querySelector('.of-toast');
    t.innerHTML = html;
    t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }
  setOverlays(ctx.overlays, true);
  installRender(ctx);
  const { renderFrame } = ctx;

  // ----- loop -----
  let raf = 0, lastT = performance.now();
  const clock0 = performance.now();
  // Each frame, in this order: see ctx.onFrame.
  ctx.onFrame((dt, t) => sfx.update(t, dt, { people, door, blinds, free: ctx.mode === 'free' }), 110);
  ctx.onFrame((dt, t) => ctx.away?.fx?.(dt, t), 190);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - lastT) / 1000, 0, 0.05);   // the first rAF stamp can predate lastT
    lastT = now;
    const t = (now - clock0) / 1000;
    ctx.runFrame(dt, t, now);
    if (ctx.away?.scene) { renderFloor(ctx.away); return; }
    renderFrame();
    syncCss();
    cssRenderer.render(cssScene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    cssRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layoutCenterMonitor(w, h);
    composer.setSize(w, h);
    for (const F of FLOORS) F.composer?.setSize(w, h);
    if (ctx.active) ctx.away?.scene ? renderFloor(ctx.away) : renderFrame();   // setSize clears the canvas; redraw now so the blank frame never reaches the screen
  }
  new ResizeObserver(resize).observe(container);

  window.__office = { ctx, openChat, closeChat, talk, get mode() { return ctx.mode; }, teleport: (k) => TELEPORTS[k](), openTv: (id) => openTvPanel(tvs.find((t) => t.id === id)), useTv: (id) => useTv(tvs.find((t) => t.id === id)), leaveTv,
    boards, useBoard: (id) => useBoard(boards.find((b) => b.id === id)), leaveBoard, wb,
    tvPoint: (id, u, v) => { const t = tvs.find((x) => x.id === id), p = t.scr.mesh.localToWorld(new THREE.Vector3((u - 0.5) * t.w, (0.5 - v) * t.h, 0)).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
    tvs: () => tvs.map((t) => ({ id: t.id, live: t.live, frame: !!t.frame, url: t.page?.url, title: t.page?.title, dist: t.dist })), seats, sitIn, openLaptop, laptop, kitchen, player, keys, camera, people, blinds, door, doors, collide, colliders, desks, idleSpots, lifts, sfx, mine, arch, roof, srv, FLOORS, openJohn, johnChat, setFloor, get away() { return ctx.away; }, callLift,
    goFloor: (n) => {   // debug: straight into your car at floor n, doors opening (headless tests can't sit through a ride)
      const L = mine.L || lifts.find(spare); if (!L) return false;
      Object.assign(mine, { L, call: false, goal: null }); L.player = true;
      Object.assign(player, { x: LIFT.x + 1, z: L.z, seated: false, seat: null, eye: EYE });
      L.floor = n; L.dir = 0; setFloor(n === 48 ? null : FLOORS.find((F) => F.n === n)); setLift(L, 'opening'); return true;
    }, pressFloor, setSpeed, clockState, setTime: (ms) => Object.assign(clockState, { speed: 0.0001, simBase: ms, realBase: Date.now() }) };

  return {
    // Adopt your desktop onto the monitor, then pull back from it to the chair.
    show() {
      ctx.active = true;
      resetLift();
      tvSocket();
      sfx.setActive(true);
      dash.desktop?.mount(domScreen);
      resize();
      setCam(fillPose());
      ctx.mode = 'intro';
      hud.classList.add('hidden');
      lastT = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      const seat = seatedPose();
      setTimeout(() => tween(fillPose(), seat, 2600, () => {
        Object.assign(player, { x: seat.x, z: seat.z, eye: seat.y, yaw: seat.yaw, pitch: seat.pitch, seated: true, seat: seat.seat ?? null });
        ctx.mode = 'free';
        hud.classList.remove('hidden');
      }), REDUCED ? 0 : 350);
    },
    // Fly back into the monitor, then hand the desktop back to the page.
    hide() {
      return new Promise((resolve) => {
        if (document.pointerLockElement) document.exitPointerLock();
        closeChat();
        dash.closeDrawer();
        if (ctx.using) { ctx.using.dirty = true; ctx.using = null; hud.classList.remove('of-using'); }
        leaveBoard();
        if (ctx.away) { resetLift(); setCam(seatedPose()); }
        hud.classList.add('hidden');
        ctx.mode = 'outro';
        if (laptop.open) { laptop.k = 1; laptopFx(0); }
        const from = camPose(), to = fillPose();
        const dist = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
        tween(from, to, clamp(dist * 260, 1100, 2800), () => {
          requestAnimationFrame(() => {
            dash.desktop?.mount(document.body);
            cancelAnimationFrame(raf);
            tvQuiet();
            ctx.active = false;
            sfx.setActive(false);
            ctx.mode = 'idle';
            resolve();
          });
        });
      });
    },
  };
}
