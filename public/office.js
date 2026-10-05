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
import { G, Person } from './office/people.js';
import { createCtx } from './office/ctx.js';
import { install as installFurniture } from './office/world/furniture.js';

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
    THREE, dash, container, colliders, toast, setQuality,
    get renderer() { return renderer; }, get scene() { return scene; }, get world() { return world; }, get camera() { return camera; },
    get hud() { return hud; }, get player() { return player; }, get people() { return people; }, get lamps() { return lamps; },
    get sfx() { return sfx; }, get state() { return S; }, get daylight() { return daylight; },
    get quality() { return hq; }, get away() { return away; }, get mode() { return mode; }, set mode(v) { mode = v; },
    get active() { return active; }, get locked() { return locked; }, get hover() { return hover; }, get FLOORS() { return FLOORS; },
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

  // ----- sky, sun, moon, time of day -----
  // Sun and moon follow the real sky over the configured location (London by default); time can be sped up from the HUD (or T).
  let officeExposure = 1.05;
  const hemi = new THREE.HemisphereLight('#e3ecf7', '#b39b80', 0.95);
  const sun = new THREE.DirectionalLight('#fff1dc', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  const moonLight = new THREE.DirectionalLight('#9fb4ff', 0);
  scene.add(hemi, sun, sun.target, moonLight, moonLight.target);
  const lamps = [];   // { light, base } or { mat, eBase }: dimmed by day, full in the evening

  const skyU = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, horizonSun: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
    night: { value: 0 }, time: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, horizonSun, ground, cloudLit, cloudDark, sunCol, sunDir, moonDir; uniform float night, time; varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Horizon glows toward the sun (fiery at sunset) and stays cooler on the far side.
        float toward = pow(dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4)) * 0.5 + 0.5, 5.0);
        vec3 hor = mix(horizon, horizonSun, toward);
        vec3 col = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor, ground, pow(min(-h * 4.0, 1.0), 0.6));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 1400.0) * 30.0 + pow(sd, 60.0) * 0.6 + pow(sd, 8.0) * 0.25);
        if (h > 0.0) {
          float s = hash(floor(d * 700.0));
          col += vec3(step(0.9982, s) * night * (0.6 + 0.4 * sin(time * 3.0 + s * 60.0)) * smoothstep(0.0, 0.25, h));
        }
        float mc = dot(d, moonDir), R = 0.03;
        if (mc > cos(R)) {
          vec3 off = d - moonDir * mc;
          float r = length(off) / sin(R);
          vec3 n = normalize(off / sin(R) - moonDir * sqrt(max(0.0, 1.0 - r * r)));
          float lit = smoothstep(-0.08, 0.12, dot(n, sunDir));
          col = mix(col, vec3(0.95, 0.93, 0.86) * (0.06 + 1.4 * lit), smoothstep(1.0, 0.9, r) * smoothstep(-0.02, 0.03, moonDir.y));
        }
        col += vec3(0.6, 0.65, 0.8) * pow(max(mc, 0.0), 200.0) * 0.25 * night;
        // Clouds: a drifting fbm layer, lit from the sun side (orange-pink undersides at sunset).
        if (h > 0.01) {
          vec2 uv = d.xz / (h + 0.06) * 0.9 + vec2(time * 0.006, time * 0.003);
          float c = smoothstep(0.5, 0.78, fbm(uv)) * smoothstep(0.01, 0.16, h);
          float lit = pow(sd, 3.0);
          vec3 cc = mix(cloudDark, cloudLit, 0.35 + 0.65 * (toward * 0.6 + lit * 0.4));
          cc += sunCol * pow(sd, 12.0) * 0.8;
          col = mix(col, cc, c * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const skyScene = new THREE.Scene();   // sky alone, rendered into an env map so city glass and water reflect the real sky
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // [sun elevation°, zenith, horizon, horizon toward the sun, below horizon, cloud lit side, cloud shadow side]
  const SKY_KEYS = [
    [-18, '#03050c', '#090f1f', '#0d1226', '#05070c', '#141a2e', '#0a0d18'],
    [-9, '#0c1434', '#2a2350', '#4a2c5e', '#0b0d14', '#3a2b57', '#191730'],
    [-4, '#182a64', '#9a4e6e', '#ff6a3d', '#1a1418', '#ff7a5c', '#4a2e5c'],
    [0, '#26489a', '#e2776a', '#ff8a2e', '#2a1f1c', '#ff9a5a', '#7a4870'],
    [5, '#3566b5', '#f2a27c', '#ffbd5e', '#3a302a', '#ffd3a0', '#9a7f98'],
    [16, '#3a80d6', '#bcd8ef', '#e3edf6', '#4a4a48', '#ffffff', '#c3cedb'],
    [60, '#2a6ccc', '#cbe3f6', '#e6f0f9', '#55534f', '#ffffff', '#d0d8e2'],
  ].map(([el, ...cs]) => [el, ...cs.map((c) => new THREE.Color(c))]);
  const SKY_C = Array.from({ length: 6 }, () => new THREE.Color());
  const SUN_RED = new THREE.Color('#ff4a12'), SUN_GOLD = new THREE.Color('#ffa040'), SUN_HIGH = new THREE.Color('#fff4e4');
  const HEMI = { daySky: new THREE.Color('#e3ecf7'), dayGnd: new THREE.Color('#b39b80'), nightSky: new THREE.Color('#2c3555'),
    nightGnd: new THREE.Color('#4a3a2a'), sunset: new THREE.Color('#ff9a66'), sunsetGnd: new THREE.Color('#7a4a3a') };
  const C = { sun: new THREE.Color() };
  const LAT = (dash.config?.lat ?? 51.5) * Math.PI / 180, LON = dash.config?.lon ?? -0.13;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const RAD = Math.PI / 180;
  function altAz(ra, dec, d) {
    const H = ((18.697374558 + 24.06570982441908 * d) * 15 + LON) * RAD - ra;
    const el = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H));   // from north, clockwise
    return { el, az };
  }
  function sunPos(date) {
    const d = (date - J2000) / 864e5, g = (357.529 + 0.98560028 * d) * RAD;
    const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    return altAz(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), Math.asin(Math.sin(e) * Math.sin(L)), d);
  }
  function moonPos(date) {
    const d = (date - J2000) / 864e5, e = 23.4397 * RAD;
    const M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
    const lon = (218.316 + 13.176396 * d) * RAD + 6.289 * RAD * Math.sin(M), lat = 5.128 * RAD * Math.sin(F);
    const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
    return altAz(ra, Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon)), d);
  }
  // World axes: +x east, +z north, so evening sun pours in through the west windows.
  const toDir = (p, v) => v.set(Math.sin(p.az) * Math.cos(p.el), Math.sin(p.el), Math.cos(p.az) * Math.cos(p.el));
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  let daylight = 1, lampK = 0;
  let raysStrength = 0, lastEnvEl = 999, lastEnvAt = 0, envRT = null;
  function updateSky(date, t) {
    const sp = sunPos(date), mp = moonPos(date);
    toDir(sp, sunDir); toDir(mp, moonDir);
    const el = sp.el / RAD, mel = mp.el / RAD;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && el > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], k = clamp((el - a[0]) / (b[0] - a[0]), 0, 1);
    for (let c = 0; c < 6; c++) SKY_C[c].lerpColors(a[c + 1], b[c + 1], k);
    const [top, hor, horSun, gnd, cLit, cDark] = SKY_C;
    const night = 1 - sstep(-10, -2, el), dl = sstep(-4, 12, el), sunset = sstep(-6, -0.5, el) * (1 - sstep(8, 20, el));
    // The sun drops behind the mountain ridge a little before the true horizon.
    const azDeg = ((Math.round(Math.atan2(sunDir.z, sunDir.x) / RAD) % 360) + 360) % 360;
    const sunVis = sstep(city.ridge[azDeg] - 0.5, city.ridge[azDeg] + 0.7, el);
    daylight = dl;
    if (el < 7) C.sun.lerpColors(SUN_RED, SUN_GOLD, sstep(-1, 7, el)); else C.sun.lerpColors(SUN_GOLD, SUN_HIGH, sstep(7, 28, el));
    skyU.top.value.copy(top); skyU.horizon.value.copy(hor); skyU.horizonSun.value.copy(horSun); skyU.ground.value.copy(gnd);
    skyU.cloudLit.value.copy(cLit); skyU.cloudDark.value.copy(cDark);
    skyU.sunDir.value.copy(sunDir); skyU.moonDir.value.copy(moonDir);
    skyU.sunCol.value.copy(C.sun).multiplyScalar(sstep(-4, 1, el));
    skyU.night.value = night; skyU.time.value = t;
    sun.position.copy(sunDir).multiplyScalar(90); sun.color.copy(C.sun); sun.intensity = 4.2 * sstep(-1.5, 2.5, el) * sunVis;
    moonLight.position.copy(moonDir).multiplyScalar(90); moonLight.intensity = 0.4 * night * sstep(-2, 8, mel);
    hemi.intensity = lerp(0.2, 0.9, dl) + 0.12 * sunset;
    hemi.color.lerpColors(HEMI.nightSky, HEMI.daySky, dl).lerp(HEMI.sunset, sunset * 0.6);
    hemi.groundColor.lerpColors(HEMI.nightGnd, HEMI.dayGnd, dl).lerp(HEMI.sunsetGnd, sunset * 0.5);
    scene.environmentIntensity = lerp(0.1, 0.42, dl);
    scene.fog.color.copy(hor).lerp(horSun, 0.3); scene.background.copy(scene.fog.color);
    renderer.toneMappingExposure = officeExposure = lerp(1.12, 1.0, dl) + 0.06 * sunset;
    // Lamps follow the Admin tab: 'auto' keeps them off in daylight (the windows light the office) and fades them up from
    // dusk as the sun drops below ~12°; 'on'/'off' override that. Eased so switching doesn't snap.
    const o = dash.office || {}, lampTo = (o.lights === 'on' ? 1 : o.lights === 'off' ? 0 : 1 - dl) * (o.brightness ?? 1);
    lampK += (lampTo - lampK) * 0.08;
    for (const L of lamps) {
      if (L.light) L.light.intensity = L.base * lampK;
      if (L.mat) L.mat.emissiveIntensity = L.eBase * lampK;
    }
    ceilingM.emissiveIntensity = 0.04 + 0.2 * dl;
    city.mat.emissiveIntensity = 0.04 + 1.25 * night;
    city.ground.emissiveIntensity = 0.02 + 1.1 * night;
    city.av.emissiveIntensity = Math.sin(t * 2.4) > 0.55 ? 4 : 0.15;
    
    shaftU.uLight.value.copy(sunDir).negate(); shaftU.color.value.copy(C.sun);
    shaftU.strength.value = sunVis * sstep(-1, 2, el) * (0.25 + 0.75 * (1 - sstep(8, 30, el)));
    shaftU.time.value = t;
    raysStrength = sunVis * sstep(-2, 2, el) * (0.45 + 0.9 * sunset);
    if (Math.abs(el - lastEnvEl) > 0.8 || performance.now() - lastEnvAt > 60000) {
      lastEnvEl = el; lastEnvAt = performance.now();
      envRT?.dispose();
      envRT = pmrem.fromScene(skyScene, 0, 0.1, 500);
      city.setEnv(envRT.texture);
    }
  }

  const SPEEDS = [1, 120, 1200, 7200];
  const timeEl = hud.querySelector('.of-time'), clockEl = hud.querySelector('.of-clock');
  const clockState = { speed: 1, simBase: Date.now(), realBase: Date.now() };
  const simNow = () => (clockState.speed === 1 ? Date.now() : clockState.simBase + (Date.now() - clockState.realBase) * clockState.speed);
  function setSpeed(sp) {
    const cur = simNow();
    Object.assign(clockState, { speed: sp, simBase: sp === 1 ? Date.now() : cur, realBase: Date.now() });
    localStorage.officeTimeSpeed = sp;
    for (const b of timeEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.speed === sp));
  }
  timeEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });
  setSpeed(SPEEDS.includes(+localStorage.officeTimeSpeed) ? +localStorage.officeTimeSpeed : 1);
  let clockText = '';
  function updateClock(date) {
    const txt = `${daylight > 0.5 ? '☀︎' : '☾'}  ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString([], { weekday: 'short' })}`;
    if (txt !== clockText) clockEl.textContent = clockText = txt;
  }

  const world = new THREE.Group();
  scene.add(world);

  // ----- building shell -----
  const H = ROOM.h + 0.15;
  const woodTex = woodTexture();
  woodTex.repeat.set(10, 7.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  let rugSeed = 1;
  const rugs = [];   // soft footsteps
  function rug(x0, x1, z0, z1, base, accent, y = 0.006) {
    rugs.push({ x0, x1, z0, z1 });
    const tex = accent ? rugTexture(base, accent, rugSeed++) : null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : base, map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; world.add(m);
  }
  rug(6, 19.9, -14.9, -3.5, '#3a4660', null, 0.004);                       // my office carpet
  rug(10.5, 15.5, -11, -7.5, '#d8c7a8', '#33405a');
  rug(-15.9, -12.1, 4.4, 9.6, '#cdb99b', '#8c5a3c');                        // breakroom
  rug(7.4, 12.6, 6.8, 11.2, '#b5654a', '#e2c9a6');                          // lounge

  // Ceiling with exposed timber beams.
  const ceilingM = new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 1, emissive: '#efe7da', emissiveIntensity: 0.2 });
  box(world, 40.4, 0.2, 30.4, '', 0, ROOM.h + 0.1, 0, { material: ceilingM });
  const beamM = mat('#9c6b43', { roughness: 0.75 });
  for (let x = -18; x <= 18; x += 4) box(world, 0.22, 0.28, 30, '', x, ROOM.h - 0.14, 0, { material: beamM });

  const wallM = mat('#ece3d3', { roughness: 0.95 }), frameM = mat('#2f3236', { metalness: 0.4, roughness: 0.5 });
  const sillM = mat('#a87447', { roughness: 0.6 });
  const outerGlassM = new THREE.MeshBasicMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.05, depthWrite: false });
  // Outer wall along x (z fixed) or z (x fixed); `windows` are [from, to] spans of floor-to-ceiling glazing.
  // Window blinds are grouped per wall; the stretch of east wall inside my office is its own group.
  const WIN = ['north', 'east', 'west', 'office'], winKey = (axis, fixed, u) => axis === 'x' ? 'north' : fixed < 0 ? 'west' : u < -3.5 ? 'office' : 'east';
  const panes = [], winRuns = [];
  function wall(axis, fixed, from, to, windows = [], m = wallM) {
    const inward = Math.sign(-fixed);
    const seg = (a, b, y0, y1, material = m, depth = 0.2, off = 0, shadow = true) => {
      const len = b - a, mid = (a + b) / 2;
      return axis === 'x'
        ? box(world, len, y1 - y0, depth, '', mid, (y0 + y1) / 2, fixed + off * inward, { material, shadow })
        : box(world, depth, y1 - y0, len, '', fixed + off * inward, (y0 + y1) / 2, mid, { material, shadow });
    };
    let cur = from;
    for (const [a, b] of windows) {
      if (a > cur) seg(cur, a, 0, H);
      seg(a, b, 0, 0.45); seg(a, b, 3.05, H);
      const glass = seg(a, b, 0.45, 3.05, outerGlassM, 0.02, 0, false);
      seg(a, b, 0.45, 0.49, sillM, 0.3, 0.12);
      const n = Math.max(1, Math.round((b - a) / 2.5)), step = (b - a) / n;
      winRuns.push({ axis, fixed, a, b, n, step, inward, glass });
      for (let q = 0; q <= n; q++) seg(a + q * step - 0.04, a + q * step + 0.04, 0.45, 3.05, frameM, 0.12);
      for (let q = 0; q < n; q++) panes.push({ axis, fixed, a: a + q * step + 0.04, b: a + (q + 1) * step - 0.04, inward, win: WIN.indexOf(winKey(axis, fixed, a + (q + 0.5) * step)) });
      seg(a, b, 2.3, 2.36, frameM, 0.1);
      cur = b;
    }
    if (cur < to) seg(cur, to, 0, H);
  }
  wall('x', 15, -20, 20, [[-20, 6], [16, 20]]);
  wall('z', -20, -15, 15, [[-15, 2], [6.8, 10.9]]);   // solid from 10.9 north: the kitchen's tall units stand against it
  wall('z', 20, -15, 15, [[-15, -3.5], [2.5, 15]]);   // the lift core fills the stretch between my office and the meeting rooms
  wall('x', -15, -20, 6, [], mat('#2f463b', { roughness: 0.9 }));          // green accent behind the desks
  wall('x', -15, 6, 20, [], mat('#2b3650', { roughness: 0.9 }));           // navy in my office
  {
    const slats = [];
    for (let x = -19.8; x < 5.9; x += 0.14) if (x < -10.5 || x > -5.9) slats.push([0.05, ROOM.h - 0.1, 0.04, x, (ROOM.h - 0.1) / 2, -14.88]);
    world.add(mergedBoxes(slats, mat('#b07d4f', { roughness: 0.7 })));
  }
  // Sunbeams: each window pane swept along the light direction, drawn additively and faded with depth.
  // `shut` is how much each window group's blinds cut the light (0 raised, ~0.9 lowered).
  const shaftU = { uLight: { value: new THREE.Vector3(0, -1, 0) }, color: { value: new THREE.Color() }, strength: { value: 0 }, time: { value: 0 }, shut: { value: WIN.map(() => 0) } };
  const shafts = (() => {
    const pos = [], along = [], nIn = [], win = [], idx = [];
    for (const p of panes) {
      const y0 = 0.49, y1 = 3.05;
      const cs = p.axis === 'x' ? [[p.a, y0, p.fixed], [p.b, y0, p.fixed], [p.b, y1, p.fixed], [p.a, y1, p.fixed]]
        : [[p.fixed, y0, p.a], [p.fixed, y0, p.b], [p.fixed, y1, p.b], [p.fixed, y1, p.a]];
      const nrm = p.axis === 'x' ? [0, 0, p.inward] : [p.inward, 0, 0], base = pos.length / 3;
      for (const t of [0, 1]) for (const c of cs) { pos.push(...c); along.push(t); nIn.push(...nrm); win.push(p.win); }
      for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) idx.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('nIn', new THREE.Float32BufferAttribute(nIn, 3));
    g.setAttribute('win', new THREE.Float32BufferAttribute(win, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float along; attribute vec3 nIn; attribute float win; uniform vec3 uLight; uniform float shut[${WIN.length}]; varying float vA; varying float vFace; varying vec3 vW;
        void main() { vec3 p = position + along * 16.0 * uLight; vA = along; vFace = max(dot(uLight, nIn), 0.0) * (1.0 - shut[int(win + 0.5)]);
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 color; uniform float strength, time; varying float vA; varying float vFace; varying vec3 vW;
        void main() {
          float fade = smoothstep(0.0, 0.05, vA) * pow(1.0 - vA, 1.7);
          float dust = 0.8 + 0.2 * sin(vW.x * 2.1 + vW.y * 3.3 + time * 0.5) * sin(vW.z * 1.7 - time * 0.35);
          gl_FragColor = vec4(color * strength * vFace * fade * dust * smoothstep(0.0, 0.3, vW.y) * 0.03, 1.0);
        }`,
    }));
    m.frustumCulled = false;
    world.add(m);
    return m;
  })();

  for (const [x, z] of [[4, -8], [4, 8], [-9, 0.5 - 2.6]]) { box(world, 0.5, ROOM.h, 0.5, '#a8774b', x, ROOM.h / 2, z, { mat: { roughness: 0.7 } }); solid(x, z, 0.5, 0.5); }

  // ----- the city outside (we're on the ~48th floor, ~175 m up) -----
  const city = buildCity();
  function buildCity() {
    const GROUND = -175, R = rng(4242);
    // Facade colour, lit windows at night, and a roughness/metalness map so the glass is glossy and reflective.
    const fac = makeCanvas(512, 512), lit = makeCanvas(512, 512), rm = makeCanvas(512, 512);
    fac.ctx.fillStyle = '#9a9a96'; fac.ctx.fillRect(0, 0, 512, 512);
    lit.ctx.fillStyle = '#000'; lit.ctx.fillRect(0, 0, 512, 512);
    rm.ctx.fillStyle = 'rgb(0,235,25)'; rm.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = i * 64, y = j * 64, g = fac.ctx.createLinearGradient(x, y, x + 64, y + 64);
      g.addColorStop(0, '#2c3a4a'); g.addColorStop(1, '#5f7489');
      fac.ctx.fillStyle = g; fac.ctx.fillRect(x + 9, y + 10, 46, 40);
      fac.ctx.fillStyle = 'rgba(0,0,0,.25)'; fac.ctx.fillRect(x + 9, y + 48, 46, 3);
      rm.ctx.fillStyle = 'rgb(0,40,230)'; rm.ctx.fillRect(x + 9, y + 10, 46, 40);
      if (R() < 0.42) {
        lit.ctx.globalAlpha = 0.5 + R() * 0.5;
        lit.ctx.fillStyle = ['#ffd49a', '#ffe6bf', '#fff1d6', '#cfe0ff', '#ffc27a'][Math.floor(R() * 5)];
        lit.ctx.fillRect(x + 9, y + 10, 46, 40);
      }
    }
    lit.ctx.globalAlpha = 1;
    rm.tex.colorSpace = THREE.NoColorSpace;
    for (const t of [fac.tex, lit.tex, rm.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }

    // A river runs north-south just west of us, and the west side is low-rise, so sunsets have a clear view.
    const riverX = (z) => -230 + 60 * Math.sin(z / 250) + 20 * Math.sin(z / 90), RIVER_W = 42;
    const bigPark = (gx, gz) => gx >= 2 && gx <= 4 && gz >= -3 && gz <= -1;
    const geos = [], av = [], trees = [], parks = [], ponds = [];
    const TINTS = ['#ffffff', '#e8dccb', '#cfd8e3', '#d9d2c5', '#bfc6cc', '#f0e6d8', '#a9b4c0', '#c9b8a6'];
    const addB = (w, h, d, x, z, tintHex, uo, vo) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, GROUND + h / 2, z);
      const uv = g.attributes.uv, col = new Float32Array(uv.count * 3), tint = new THREE.Color(tintHex);
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.003, 0.003);
        else uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / 16 + uo, uv.getY(i) * h / 24 + vo);
        col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    };
    const tree = (x, z, scale = 1) => trees.push([x, z, (8 + R() * 7) * scale, (2.6 + R() * 1.9) * scale]);
    addB(40.6, -GROUND - 0.05, 30.6, 0, 0, '#d8d2c8', 0, 0);                // our own tower, below the office
    for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
      const cx = gx * 70, cz = gz * 70, dist = Math.hypot(cx, cz), ring = Math.max(Math.abs(gx), Math.abs(gz));
      if ((gx === 0 && gz === 0) || dist > 880) continue;
      if (bigPark(gx, gz) || (ring >= 3 && R() < 0.1 && Math.abs(cx - riverX(cz)) > 75)) {
        parks.push([cx, cz]);
        if (R() < 0.4) ponds.push([cx + (R() - 0.5) * 20, cz + (R() - 0.5) * 20, 7 + R() * 6]);
        for (let k = 0; k < 26; k++) {
          const x = cx + (R() - 0.5) * 48, z = cz + (R() - 0.5) * 48;
          if (!ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 3)) tree(x, z);
        }
        continue;
      }
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const w = 14 + R() * 22, d = 14 + R() * 22;
        // Mid-rise next door, well below us, so the view opens over rooftops; a few towers further out top us.
        const tall = R() < 0.1 ? 120 + R() * 160 : 0;
        let h = ring === 1 ? 25 + R() * 55 : ring === 2 ? 35 + R() * 70 + (R() < 0.2 ? 25 + R() * 40 : 0) : 25 + R() * 130 * (1 - dist / 1300) + tall;
        const x = cx + (R() - 0.5) * (54 - w), z = cz + (R() - 0.5) * (54 - d);
        if (cx < -40 && Math.abs(cz) < -cx * 0.75 + 60) h = Math.min(h, 22 + R() * 30);
        if (Math.abs(x - riverX(z)) < RIVER_W + Math.max(w, d) / 2 + 6) continue;
        addB(w, h, d, x, z, TINTS[Math.floor(R() * TINTS.length)], Math.floor(R() * 8) / 8, Math.floor(R() * 8) / 8);
        if (h > 150) av.push([x, GROUND + h + 1, z]);
      }
      if (R() < 0.55) {   // street trees along one or two kerbs
        const side = Math.floor(R() * 4);
        for (let k = 0; k < 6; k++) {
          const o = -22 + k * 8.8;
          const [x, z] = [[cx + o, cz - 25], [cx + o, cz + 25], [cx - 25, cz + o], [cx + 25, cz + o]][side];
          if (Math.abs(x - riverX(z)) > RIVER_W + 4) tree(x, z, 0.8);
        }
      }
    }
    // Riverside parks with trees along both banks.
    for (let z = -1100; z <= 1100; z += 12) for (const s of [-1, 1]) if (R() < 0.75) tree(riverX(z) + s * (RIVER_W + 6 + R() * 14), z + R() * 6);

    const cityMat = new THREE.MeshStandardMaterial({ map: fac.tex, emissiveMap: lit.tex, emissive: '#ffffff', vertexColors: true,
      roughnessMap: rm.tex, metalnessMap: rm.tex, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
    world.add(new THREE.Mesh(mergeGeometries(geos), cityMat));

    const avMat = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2a1a', emissiveIntensity: 3 });
    const avMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), avMat, av.length);
    const m4 = new THREE.Matrix4();
    av.forEach(([x, y, z], i) => avMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    world.add(avMesh);

    // Streets: one 70 m block per texture tile, roads on the tile edges, streetlights along the kerbs.
    const gt = makeCanvas(256, 256), ge = makeCanvas(256, 256), px = 256 / 70;
    gt.ctx.fillStyle = '#2a2c30'; gt.ctx.fillRect(0, 0, 256, 256);
    gt.ctx.fillStyle = '#5a5d61'; gt.ctx.fillRect(8 * px, 8 * px, 54 * px, 54 * px);
    gt.ctx.fillStyle = '#4b5a46'; gt.ctx.fillRect(11 * px, 11 * px, 48 * px, 48 * px);
    gt.ctx.fillStyle = '#c9c3a8';
    for (let i = 0; i < 256; i += 14) { gt.ctx.fillRect(i, 0, 7, 1.2); gt.ctx.fillRect(i, 254.8, 7, 1.2); gt.ctx.fillRect(0, i, 1.2, 7); gt.ctx.fillRect(254.8, i, 1.2, 7); }
    ge.ctx.fillStyle = '#000'; ge.ctx.fillRect(0, 0, 256, 256);
    for (let i = 4; i < 256; i += 32) for (const [x, y] of [[i, 7 * px], [i, 63 * px], [7 * px, i], [63 * px, i]]) {
      const g = ge.ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255,200,130,1)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ge.ctx.fillStyle = g; ge.ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    for (const t of [gt.tex, ge.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(86, 86); t.needsUpdate = true; }
    const groundMat = new THREE.MeshStandardMaterial({ map: gt.tex, emissiveMap: ge.tex, emissive: '#ffffff', roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6020, 6020), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(35, GROUND, 35);
    world.add(ground);

    // Grass for parks and river banks, water for the river and ponds.
    const grassMat = mat('#5f8f4a', { roughness: 1 });
    const parkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(56, 0.4, 56), grassMat, parks.length);
    parks.forEach(([x, z], i) => parkMesh.setMatrixAt(i, m4.makeTranslation(x, GROUND + 0.2, z)));
    world.add(parkMesh);
    const waterMat = new THREE.MeshStandardMaterial({ color: '#1b3444', roughness: 0.07, metalness: 0.85, envMapIntensity: 1.2 });
    const strip = (offA, offB, y, material) => {
      const pos = [], idx = [];
      for (let z = -3000, i = 0; z <= 3000; z += 20, i++) {
        const x = riverX(z);
        pos.push(x + offA, y, z, x + offB, y, z);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, material); m.material.side = THREE.DoubleSide;
      world.add(m);
    };
    strip(-RIVER_W, RIVER_W, GROUND + 0.35, waterMat);
    strip(RIVER_W, RIVER_W + 24, GROUND + 0.3, grassMat);
    strip(-RIVER_W - 24, -RIVER_W, GROUND + 0.3, grassMat);
    const pondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.2, 32), waterMat, ponds.length);
    const dummy = new THREE.Object3D();
    ponds.forEach(([x, z, r], i) => { dummy.position.set(x, GROUND + 0.45, z); dummy.scale.set(r, 1, r); dummy.updateMatrix(); pondMesh.setMatrixAt(i, dummy.matrix); });
    world.add(pondMesh);

    // Trees: autumn palette, it being October.
    const TREE_COLS = ['#3f7a3a', '#4f8a3c', '#2f6b3a', '#5d9440', '#d08a2a', '#c4572a', '#e0b23a', '#a23a2a', '#b8742a'].map((c) => new THREE.Color(c));
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), mat('#5a4030', { roughness: 1 }), trees.length);
    // Crowns: a clump of lumpy blobs, darker underneath, instead of one smooth ball.
    const crownGeo = mergeGeometries([[0, 0.1, 0, 0.8], [0.5, -0.2, 0.2, 0.62], [-0.45, -0.15, -0.3, 0.64], [0.1, 0.45, -0.25, 0.55], [-0.2, -0.05, 0.5, 0.58], [0.3, 0.2, -0.5, 0.5]].map(([x, y, z, r]) => {
      const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const n = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 73.1 + x * 13) * 43758.5, k = 0.9 + 0.2 * (n - Math.floor(n));
        p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
        col.fill(0.55 + 0.45 * sstep(-0.7, 0.8, p.getY(i)), i * 3, i * 3 + 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }));
    crownGeo.computeVertexNormals();
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }), trees.length);
    trees.forEach(([x, z, h, r], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, GROUND + h * 0.25, z); dummy.scale.set(1, h * 0.5, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, GROUND + h * 0.62, z); dummy.scale.set(r, r * 1.25, r); dummy.rotation.y = R() * 6; dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, TREE_COLS[R() < 0.55 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 5)]);
    });
    world.add(trunks, crowns);

    // Mountains on the far horizon: a ring of ridged fbm terrain, tallest to the north, lower in the west so sunsets clear them.
    const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
    };
    const fbm2 = (x, y) => { let s = 0, a = 0.5; for (let i = 0; i < 5; i++) { s += a * n2(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 3.1; a *= 0.5; } return s; };
    // MS scales the peaks up so they still clear the horizon seen from up here.
    const MBASE = GROUND - 40, R0 = 2700, R1 = 4400, SEG = 720, ROWS = 16, MS = 1.35;
    const mtnH = (th, t) => {
      const c = Math.cos(th), sn = Math.sin(th);
      const amp = 120 + 380 * fbm2(c * 2.2 + 5, sn * 2.2 + 9) + 320 * Math.max(0, sn) + 160 * Math.max(0, c) - 90 * Math.max(0, -c);
      const ridge = 1 - Math.abs(fbm2(c * 9 + t * 3, sn * 9 - t * 2) * 2 - 1);
      return amp * Math.pow(Math.sin(Math.PI * clamp(t * 1.15, 0, 1)), 0.85) * (0.5 + 0.5 * ridge);
    };
    const mpos = [], mcol = [], midx = [], ridgeDeg = new Array(360).fill(-90);
    const SNOW = new THREE.Color('#f4f6f9'), ROCK = new THREE.Color('#6b7078'), FOREST = new THREE.Color('#3a5440'), tmpC = new THREE.Color();
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS, r = R0 + (R1 - R0) * t;
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI * 2, hh = mtnH(th, t), y = MBASE + hh * MS;
        mpos.push(Math.cos(th) * r, y, Math.sin(th) * r);
        if (hh > 470 + 60 * n2(i * 0.3, j)) tmpC.copy(SNOW); else tmpC.copy(FOREST).lerp(ROCK, sstep(120, 380, hh));
        mcol.push(tmpC.r, tmpC.g, tmpC.b);
        const deg = Math.round(th / RAD) % 360;
        ridgeDeg[deg] = Math.max(ridgeDeg[deg], Math.atan2(y - 1.65, r) / RAD);
        if (j && i) { const w = SEG + 1, a = j * w + i, b = a - 1, c = a - w, d = c - 1; midx.push(d, b, a, d, a, c); }
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mcol, 3));
    mg.setIndex(midx); mg.computeVertexNormals();
    const mtnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: '#8a8a8a', side: THREE.DoubleSide });
    // Aerial perspective: the scene's exp² fog, but ~3x thinner, so far ranges fade into the sky instead of vanishing.
    mtnMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.11);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.9);
        #endif`);
    };
    world.add(new THREE.Mesh(mg, mtnMat));

    // Low cloud drifting between the rooftops: stacked fbm slices, so each cloud has some depth and where a tower pokes
    // through it fades over a few slices instead of a hard line. Unlit: tinted from the sky colours, glowing over the
    // city at night. Bottom slice first so they blend back to front from above.
    const CL = 7, cpos = [], ck = [], cidx = [];
    for (let i = 0; i < CL; i++) {
      const y = GROUND + 72 + i * 5, b = i * 4;
      cpos.push(-3000, y, -3000, 3000, y, -3000, 3000, y, 3000, -3000, y, 3000);
      ck.push(i / (CL - 1), i / (CL - 1), i / (CL - 1), i / (CL - 1));
      cidx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cg.setAttribute('k', new THREE.Float32BufferAttribute(ck, 1));
    cg.setIndex(cidx);
    const cloudU = { lit: skyU.cloudLit, dark: skyU.cloudDark, sunCol: skyU.sunCol, sunDir: skyU.sunDir, night: skyU.night, time: skyU.time,
      fogCol: { value: scene.fog.color }, fogD: { value: scene.fog.density }, glow: { value: new THREE.Color('#ff9a52') } };
    const clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      uniforms: cloudU, transparent: true, depthWrite: false,
      vertexShader: `attribute float k; varying float vK; varying vec3 vW;
        void main() { vK = k; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 lit, dark, sunCol, sunDir, fogCol, glow; uniform float night, time, fogD; varying float vK; varying vec3 vW;
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.07 + 1.3; a *= 0.5; } return v; }
        void main() {
          vec2 p = vW.xz * 0.004 + vec2(time * 0.006, time * 0.0025);
          float n = (fbm(p + vec2(vK * 0.07, 0.0)) - 0.42) * 2.4 + (n2(p * 0.15 + 1.5) - 0.5) * 1.1;   // ~half cover
          // Thickest mid-stack: the top and bottom slices only show where the cloud is dense, which rounds the puffs.
          float a = smoothstep(0.0, 0.3, n - abs(vK - 0.4) * 0.5);
          float r = length(vW.xz);
          a *= 0.38 * (1.0 - smoothstep(1500.0, 2900.0, r));
          if (a < 0.002) discard;
          vec3 v = normalize(vW - cameraPosition);
          vec3 col = mix(dark, lit, 0.3 + 0.55 * vK + 0.15 * smoothstep(0.0, 0.5, n));
          col += sunCol * (pow(max(dot(v, sunDir), 0.0), 6.0) * 0.5 + 0.12 * max(sunDir.y, 0.0) * vK);
          col += glow * night * (0.16 + 0.12 * (1.0 - vK)) * (1.0 - smoothstep(500.0, 1300.0, r));   // only over the lit city
          float d = distance(vW, cameraPosition);
          col = mix(col, fogCol, 1.0 - exp(-fogD * fogD * d * d * 0.5));
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    clouds.frustumCulled = false;
    world.add(clouds);

    return {
      mat: cityMat, ground: groundMat, av: avMat, mtn: mtnMat, ridge: ridgeDeg,
      setEnv(tex) { for (const m of [cityMat, waterMat]) { if (!m.envMap) m.needsUpdate = true; m.envMap = tex; } },
    };
  }

  // Reception, side-on to the lift core, the receptionist's back to the floor sign.
  box(world, 0.7, 1.05, 2.0, '#c49a6c', 16.6, 0.525, -2.3, { mat: { roughness: 0.55 } });
  box(world, 0.85, 0.05, 2.1, '#2a2724', 16.6, 1.075, -2.3, { mat: { roughness: 0.35 } });
  solid(16.6, -2.3, 0.85, 2.1);

  // Brick feature wall in the lounge.
  {
    const bt = brickTexture();
    bt.repeat.set(5, 1.7);
    box(world, 10, ROOM.h, 0.06, '', 11, ROOM.h / 2, 14.87, { material: new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 }) });
  }

  installFurniture(ctx);
  const { sofa, plant, bookshelf, floorLamp, pendant, addLamp, officeChair, monitor, art, smallPlant, addSeat, plantKit, seats, barM, glowMat } = ctx;
  // ----- desks -----
  // Benching pods: runs of desks pushed together side by side, two runs back to back across a felt privacy screen.
  // Each desk is built in its own group in desk-local space: local +z points from the monitors toward the chair.
  const desks = [], DESK = { w: 2.0, d: 0.8 }, CHAIR_Z = 0.62, LANE_Z = 1.5;
  const deskTopM = mat('#c49a6c', { roughness: 0.55 }), legM = mat('#2f3236', { metalness: 0.5, roughness: 0.4 });
  const podScreenM = mat('#9aab9f', { roughness: 1 }), podRailM = mat('#b9bcc0', { metalness: 0.7, roughness: 0.35 });
  // Desk-local (lx, lz) to world, for a desk at (x, z) turned by ry.
  const deskToWorld = (d, lx, lz) => ({ x: d.x + lx * Math.cos(d.ry) + lz * Math.sin(d.ry), z: d.z - lx * Math.sin(d.ry) + lz * Math.cos(d.ry) });
  function desk(x, z, ry, walkX) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g);
    box(g, DESK.w - 0.01, 0.04, DESK.d, '', 0, 0.74, 0, { material: deskTopM });
    box(g, 0.44, 0.015, 0.14, '#3a3c40', 0, 0.765, 0.12);   // where a seated worker's hands land (see the 'type' pose)
    box(g, 0.06, 0.02, 0.1, '#3a3c40', 0.36, 0.765, 0.14);
    if (hash(String(x * z)) % 3 === 0) cyl(g, 0.04, 0.035, 0.1, '#f4f1ea', -0.82, 0.81, 0.2);
    box(g, 1.3, 0.035, 0.09, '', 0, 2.6, 0.1, { material: barM, shadow: false });
    for (const dx of [-0.5, 0.5]) cyl(g, 0.004, 0.004, ROOM.h - 2.6, '#222', dx, (ROOM.h + 2.6) / 2, 0.1, { shadow: false });
    // Left: session stats. Right: the code it's writing. Both angled in toward the chair.
    const mon = monitor(g, 0.9, 0.5625, -0.47, 0.76, -0.2, 0.14);
    const scr = makeScreen(mon.g, 0.9, 0.5625, 800, 500, 0, mon.screenY, mon.screenZ);
    const codeMon = monitor(g, 0.9, 0.5625, 0.47, 0.76, -0.2, -0.14);
    const codeScr = makeScreen(codeMon.g, 0.9, 0.5625, 800, 500, 0, codeMon.screenY, codeMon.screenZ);
    drawOff(scr); scr.tex.needsUpdate = true;
    drawOff(codeScr); codeScr.tex.needsUpdate = true;
    const d = { x, z, ry, rotY: angDiff(0, ry + Math.PI), scr, codeScr, owner: null };
    if (hash(`${x}|${z}`) % 3 === 1) { const p = deskToWorld(d, 0.86, 0.22); smallPlant(world, p.x, 0.76, p.z); }   // its leaves are world-space instances
    const seat = deskToWorld(d, 0, 0.68);
    d.chair = officeChair(seat.x, seat.z, d.rotY);
    // In from the main aisle down the nearest walkway between pods, along the lane behind the chairs, then sit.
    const chair = deskToWorld(d, 0, CHAIR_Z), lane = deskToWorld(d, 0, LANE_Z);
    d.spot = { key: `desk:${x},${z}`, kind: 'desk', pos: chair, rotY: d.rotY, pose: 'type',
      route: [{ x: walkX, z: AISLE }, { x: walkX, z: lane.z }, lane, chair] };
    desks.push(d);
    return d;
  }
  // A pod of 2 x n desks centred on (cx, cz), runs along x: the south run faces north, the north run faces south.
  // `walks` are the x of the walkways either side; each desk is reached from the nearer one.
  function pod(cx, cz, n, walks) {
    const len = n * DESK.w, x0 = cx - len / 2;
    rug(x0 - 1.1, x0 + len + 1.1, cz - DESK.d - 1.25, cz + DESK.d + 1.25, '#6f7c6c', '#55614f');
    for (let i = 0; i <= n; i++) box(world, 0.05, 0.72, 2 * DESK.d - 0.1, '', x0 + i * DESK.w, 0.36, cz, { material: legM });
    box(world, len, 0.05, 0.05, '', cx, 0.68, cz, { material: legM });
    box(world, len - 0.2, 0.08, 0.22, '#26282b', cx, 0.6, cz);              // cable tray
    box(world, len, 0.34, 0.03, '', cx, 0.93, cz, { material: podScreenM });   // privacy screen, ~30 cm above the desktops
    box(world, len, 0.015, 0.04, '', cx, 1.105, cz, { material: podRailM });
    for (let i = 0; i < n; i++) box(world, 0.12, 0.04, 0.06, '#d9dcdf', x0 + (i + 0.5) * DESK.w, 0.78, cz);   // power rail sockets
    solid(cx, cz, len, 2 * DESK.d);
    const runs = [];
    for (const [dz, ry] of [[DESK.d / 2, 0], [-DESK.d / 2, Math.PI]]) for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * DESK.w;
      runs.push(desk(x, cz + dz, ry, walks.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))));
    }
    return runs;
  }
  // Two bands of two pods across the desk floor, walkways at the west wall, between the pods (under the big
  // activity screen) and east of them. Desks fill south band first, nearest the aisle.
  const DESK_WALKS = [-18.75, -8.3, 2.6];
  for (const cz of [-5.4, -10.8]) for (const cx of [-3.1, -13.5]) pod(cx, cz, 4, DESK_WALKS);

  // Desk clutter: takeaway coffee cups and energy drink cans pile up on the desks of the sessions working hardest
  // (output tokens + time spent busy). Each desk has a fixed, seeded layout of DESK_MAX slots filled in order, so the
  // pile only grows; cups sometimes stack. Four instanced meshes for every desk.
  const DESK_MAX = 18, clutterN = desks.length * DESK_MAX;
  const clutter = {
    cup: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.03, 0.115, 12).translate(0, 0.0575, 0), mat('#ffffff', { roughness: 0.75 }), clutterN),
    lid: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 12).translate(0, 0.121, 0), mat('#ffffff', { roughness: 0.5 }), clutterN),
    can: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 14).translate(0, 0.061, 0), mat('#ffffff', { roughness: 0.3, metalness: 0.6 }), clutterN),
    top: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.033, 0.008, 14).translate(0, 0.126, 0), mat('#c9ccd1', { roughness: 0.3, metalness: 0.9 }), clutterN),
  };
  {
    const CUP = ['#f2efe8', '#c9a57a', '#f2efe8', '#e9e4da'], LID = ['#2a2a2a', '#f4f4f4'], CAN = ['#7ed321', '#1f6fd1', '#e3e5e8', '#e0245e', '#151515', '#ffb000'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    // Free spots on the desk top (desk-local): beside the monitors and in the front corners clear of keyboard and mouse.
    const ZONES = [[-0.93, -0.62, -0.34, 0.34], [0.62, 0.93, -0.34, 0.12], [-0.6, -0.3, 0.24, 0.36], [0.5, 0.62, 0.24, 0.36]];
    desks.forEach((d, di) => {
      const R = rng(hash(`clutter|${d.x}|${d.z}`)), placed = [];
      d.clutter = [];
      for (let i = 0, tries = 0; i < DESK_MAX && tries < 400; tries++) {
        const kind = R() < 0.55 ? 'cup' : 'can', base = kind === 'cup' && placed.find((p) => p.kind === 'cup' && p.h < 3 && R() < 0.3);
        let x, z, y = 0.76, lying = false;
        if (base) { x = base.x; z = base.z; y = 0.76 + base.h * 0.105; base.h++; }
        else {
          const [x0, x1, z0, z1] = ZONES[Math.floor(R() * R() * ZONES.length)];
          x = x0 + R() * (x1 - x0); z = z0 + R() * (z1 - z0);
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 0.09) || Math.hypot(x + 0.82, z - 0.2) < 0.09 || Math.hypot(x - 0.86, z - 0.22) < 0.12) continue;
          lying = kind === 'can' && R() < 0.25;
          placed.push({ kind, x, z, h: 1 });
        }
        e.set(lying ? Math.PI / 2 : 0, R() * Math.PI * 2, 0, 'YXZ');
        const w = deskToWorld(d, x, z);
        m4.compose(v.set(w.x, lying ? y + 0.033 : y, w.z), q.setFromEuler(e), one);
        const k = di * DESK_MAX + i;
        d.clutter.push({ k, kind, m: m4.clone() });
        if (kind === 'cup') { clutter.cup.setColorAt(k, c.set(CUP[Math.floor(R() * CUP.length)])); clutter.lid.setColorAt(k, c.set(LID[Math.floor(R() * LID.length)])); }
        else clutter.can.setColorAt(k, c.set(CAN[Math.floor(R() * CAN.length)]));
        i++;
      }
      d.clutterShown = -1;
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of Object.values(clutter)) {
      for (let k = 0; k < clutterN; k++) im.setMatrixAt(k, zero);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      world.add(im);
    }
  }
  // How many items a session has earned: ~1 per 15k output tokens plus 1 per 10 minutes busy.
  function clutterFor(s, now) {
    const t = s?.transcript;
    if (!t) return 0;
    const busyMs = (t.turns || 0) * (t.avgTurnMs || 0) + (s.status === 'working' && s.statusSince ? now - s.statusSince : 0);
    return Math.min(DESK_MAX, Math.floor((t.tokens?.output || 0) / 15000 + busyMs / 600000));
  }
  function setClutter(d, n) {
    if (n === d.clutterShown) return;
    d.clutterShown = n;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [i, it] of d.clutter.entries()) {
      const m = i < n ? it.m : zero;
      if (it.kind === 'cup') { clutter.cup.setMatrixAt(it.k, m); clutter.lid.setMatrixAt(it.k, m); }
      else { clutter.can.setMatrixAt(it.k, m); clutter.top.setMatrixAt(it.k, m); }
    }
    for (const im of Object.values(clutter)) im.instanceMatrix.needsUpdate = true;
  }

  // Big activity screen over the desk floor.
  const feedTV = makeScreen(world, 4.2, 2.1, 1280, 640, -8.2, 2.05, -14.86);
  box(world, 4.3, 2.2, 0.06, '#111214', -8.2, 2.05, -14.9);

  // ----- breakroom -----
  sofa(-14, 5.2, 0);
  sofa(-14, 8.8, Math.PI);
  box(world, 1.3, 0.06, 0.65, '#8a6a4a', -14, 0.4, 7, { mat: { roughness: 0.5 } });
  box(world, 1.2, 0.37, 0.55, '#6e5238', -14, 0.185, 7);
  solid(-14, 7, 1.3, 0.65);
  cyl(world, 0.06, 0.06, 0.12, '#2f6f8f', -14.3, 0.49, 7.1); cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', -13.7, 0.48, 6.9);
  // Ping pong, by the kitchen (east of the island, clear of the x -11.6 corridor to the kitchen).
  box(world, 2.74, 0.04, 1.525, '#1d5c3a', PP.x, 0.76, PP.z, { mat: { roughness: 0.5 } });
  box(world, 2.74, 0.005, 0.02, '#ffffff', PP.x, 0.783, PP.z, { shadow: false });
  box(world, 0.02, 0.15, 1.6, '#eeeeee', PP.x, 0.86, PP.z, { mat: { transparent: true, opacity: 0.7 } });
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.65, 0.65]) box(world, 0.05, 0.74, 0.05, '#222', PP.x + dx, 0.37, PP.z + dz);
  solid(PP.x, PP.z, 2.74, 1.525);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }));
  ball.castShadow = true; world.add(ball);
  // High table for chats.
  cyl(world, 0.4, 0.4, 0.04, '#f2efe9', -9.6, 1.06, 4.9, { seg: 24 });
  cyl(world, 0.04, 0.04, 1.04, '#2f3236', -9.6, 0.52, 4.9);
  cyl(world, 0.25, 0.25, 0.03, '#2f3236', -9.6, 0.015, 4.9);
  solid(-9.6, 4.9, 0.8, 0.8);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', -9.5, 1.13, 4.85);
  // Beanbags.
  for (const z of [7.6, 9.6]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), mat(z < 8 ? '#c0573e' : '#e0a63a', { roughness: 1 }));
    b.scale.set(1, 0.55, 1); b.position.set(-18.35, 0.26, z); b.castShadow = true; b.receiveShadow = true; world.add(b);
  }
  // ----- whiteboards -----
  // Every whiteboard can be drawn on (see useBoard). What's on one is a transparent ink layer over the board (plain, or the
  // breakroom's live shipped list), saved per board to localStorage. A board's printed sketch starts out as ink, so it can be
  // erased, and Reset puts it back.
  const boards = [], WB_BG = '#f7f7f4';
  function whiteboard(scr, id, name, draw, live = false) {
    const ink = document.createElement('canvas');
    ink.width = scr.W; ink.height = scr.H;
    const b = { id, name, scr, draw, live, list: live && localStorage[`officeBoardList:${id}`] !== 'off', ink, ictx: ink.getContext('2d'), undo: [], redo: [], dirty: true,
      w: scr.mesh.geometry.parameters.width, h: scr.mesh.geometry.parameters.height };
    scr.mesh.material = new THREE.MeshStandardMaterial({ map: scr.tex, roughness: 0.6 });
    scr.mesh.userData = { action: 'board', board: b, reach: 5 };
    const saved = localStorage[`officeBoard:${id}`];
    if (saved) { const img = new Image(); img.onload = () => { b.ictx.drawImage(img, 0, 0); b.dirty = true; }; img.src = saved; }
    else inkDefault(b);
    boards.push(b);
    return b;
  }
  function inkDefault(b) {
    const c = b.ictx;
    c.clearRect(0, 0, b.ink.width, b.ink.height);
    if (!b.draw) return;
    c.save(); c.lineCap = c.lineJoin = 'round'; c.lineWidth = 5; b.draw(c, b.ink.width, b.ink.height); c.restore();
  }
  function paintBoard(b) {
    const { ctx, W, H } = b.scr;
    if (b.live && b.list && S) drawBoard(b.scr, S); else { ctx.fillStyle = WB_BG; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(b.ink, 0, 0);
    b.scr.tex.needsUpdate = true; b.dirty = false;
  }
  // Breakroom whiteboard: today's shipped list, drawn over.
  const board = makeScreen(world, 2.4, 1.3, 1024, 560, -19.86, 1.6, 4.6);
  board.mesh.rotation.y = Math.PI / 2;
  const breakBoard = whiteboard(board, 'breakroom', 'breakroom whiteboard', null, true);
  box(world, 0.04, 1.38, 2.48, '#b9bcc0', -19.9, 1.6, 4.6, { shadow: false });
  plant(-2.6, 14.3, 1.1); plant(-19.3, 3.1); plant(-11, 14.3, 0.9);

  // Cozy bits: bookshelf divider, lamps, pendants, neon.
  bookshelf(-16, 2.42, 0, 7, 1.1, 2);
  for (const x of [-18.6, -16.2, -13.5]) smallPlant(world, x, 1.1, 2.42);
  floorLamp(-15.75, 4.95, 10);
  pendant(-14, 7, { light: 14 });
  pendant(-9.6, 4.9, { drop: 1.1, light: 10, shade: '#d97757' });
  pendant(PP.x - 0.6, PP.z, { drop: 0.9 }); pendant(PP.x + 0.6, PP.z, { drop: 0.9 });
  plant(-12, 2.6, 0.8);
  {
    const neon = makeScreen(world, 1.8, 0.45, 720, 180, -19.84, 2.78, 4.6);
    neon.mesh.rotation.y = Math.PI / 2;
    const { ctx } = neon;
    ctx.clearRect(0, 0, 720, 180);
    ctx.font = `italic 700 110px ${FONT}`; ctx.textAlign = 'center';
    ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 30; ctx.fillStyle = '#ffd1e6';
    ctx.fillText('ship it ✦', 360, 128); ctx.fillText('ship it ✦', 360, 128);
    neon.mesh.material.transparent = true;
    neon.tex.needsUpdate = true;
  }
  addLamp(-17.5, 2.6, -7.5, 16); addLamp(-9, 2.6, -5.5, 16); addLamp(-1, 2.6, -9.5, 14);

  // ----- lounge / meeting area -----
  box(world, 3, 0.05, 1.2, '#e9e4da', 10, 0.74, 9, { material: deskTopM });
  for (const dx of [-1.3, 1.3]) box(world, 0.06, 0.72, 1, '', 10 + dx, 0.36, 9, { material: legM });
  solid(10, 9, 3, 1.2);
  for (const dx of [-1, 0, 1]) { officeChair(10 + dx, 8.15, 0, '#7a8796'); officeChair(10 + dx, 9.85, Math.PI, '#7a8796'); }
  plant(3.5, 3.4); plant(19.2, 14.2, 1.2); plant(5.4, -2.9, 0.9);
  // Corner nook: two armchairs facing each other across a low table.
  sofa(15.85, 13.95, Math.PI / 2, 1.05, '#8a6f5a'); sofa(17.55, 13.95, -Math.PI / 2, 1.05, '#8a6f5a');
  box(world, 0.6, 0.04, 0.5, '#8a6a4a', 16.7, 0.38, 14.05, { mat: { roughness: 0.6 } });
  for (const [dx, dz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) box(world, 0.035, 0.36, 0.035, '', 16.7 + dx, 0.18, 14.05 + dz, { material: legM });
  box(world, 0.22, 0.03, 0.16, '#3f4a6b', 16.66, 0.415, 14.21).rotation.y = 0.1; cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', 16.95, 0.45, 14.21);
  solid(16.7, 14.05, 0.6, 0.5);
  const laptop = macbook(seats.slice(-2));

  // Your MacBook, on the nook table facing whichever armchair you open it from. 14" proportions; the lid hinges at the back
  // (pivot.rotation.x: PI/2 shut, LID_OPEN tilted back). While it's open the dashboard screen moves onto it (see placeHole).
  function macbook(nookSeats) {
    const W = 0.312, D = 0.221, T = 0.011, LT = 0.0045, LH = 0.215;
    const alu = new THREE.MeshStandardMaterial({ color: '#b9bbbf', metalness: 0.4, roughness: 0.55, envMapIntensity: 0.6 });   // bead-blasted, not mirror
    // A rounded-rectangle plate in x-y, extruded `t` back along -z, with softened edges.
    function plate(w, h, t, r) {
      const b = Math.min(0.0015, t / 3), s = new THREE.Shape(), x = -w / 2 + b, y = -h / 2 + b, iw = w - 2 * b, ih = h - 2 * b;
      s.moveTo(x + r, y); s.lineTo(x + iw - r, y); s.quadraticCurveTo(x + iw, y, x + iw, y + r); s.lineTo(x + iw, y + ih - r);
      s.quadraticCurveTo(x + iw, y + ih, x + iw - r, y + ih); s.lineTo(x + r, y + ih); s.quadraticCurveTo(x, y + ih, x, y + ih - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -t + b);
    }
    const g = new THREE.Group(); world.add(g);
    const base = new THREE.Mesh(plate(W, D, T, 0.012).rotateX(-Math.PI / 2), alu);
    base.position.y = T; base.castShadow = base.receiveShadow = true; g.add(base);
    // Deck: keyboard well, keycaps, speaker grilles and trackpad on one canvas; the legends double as the backlight.
    const deck = makeCanvas(1024, 726), glow = makeCanvas(1024, 726), c = deck.ctx, e = glow.ctx;
    c.fillStyle = '#c3c5c9'; c.fillRect(0, 0, 1024, 726);
    e.fillStyle = '#000'; e.fillRect(0, 0, 1024, 726);
    c.fillStyle = '#0c0c0d'; c.beginPath(); c.roundRect(128, 34, 768, 352, 10); c.fill();
    c.fillStyle = '#9fa2a7';
    for (const x0 of [44, 914]) for (let y = 50; y < 370; y += 9) for (let x = x0; x < x0 + 66; x += 9) c.fillRect(x, y, 3, 3);
    const ROWS = [
      [[1.5, 'esc'], ...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'.split(' ').map((k) => [1, k]), [1, '']],
      [...'` 1 2 3 4 5 6 7 8 9 0 - ='.split(' ').map((k) => [1, k]), [1.5, 'delete']],
      [[1.5, 'tab'], ...'Q W E R T Y U I O P [ ] \\'.split(' ').map((k) => [1, k])],
      [[1.8, 'caps'], ...'A S D F G H J K L ; \''.split(' ').map((k) => [1, k]), [1.7, 'return']],
      [[2.3, 'shift'], ...'Z X C V B N M , . /'.split(' ').map((k) => [1, k]), [2.2, 'shift']],
      [[1, 'fn'], [1, 'ctrl'], [1, 'opt'], [1.25, 'cmd'], [5.1, ''], [1.25, 'cmd'], [1, 'opt'], [1, '◀'], [1, '▲▼'], [1, '▶']],
    ];
    ROWS.forEach((row, i) => {
      const sum = row.reduce((a, k) => a + k[0], 0), u = 744 / sum, h = i ? 54 : 30, y = i ? 82 + (i - 1) * 59 : 44;
      let x = 140;
      for (const [w, label] of row) {
        c.fillStyle = '#1e1f21'; c.beginPath(); c.roundRect(x + 2, y, w * u - 5, h, 6); c.fill();
        if (label) {
          e.font = `500 ${label.length > 2 ? 13 : 19}px ${FONT}`; e.fillStyle = '#fff'; e.textAlign = 'center';
          e.fillText(label, x + (w * u) / 2, y + h / 2 + 6);
          c.font = e.font; c.fillStyle = '#6d6f73'; c.textAlign = 'center'; c.fillText(label, x + (w * u) / 2, y + h / 2 + 6);
        }
        x += w * u;
      }
    });
    c.fillStyle = '#b9bbbf'; c.strokeStyle = '#a7a9ad'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(292, 420, 440, 276, 16); c.fill(); c.stroke();
    deck.tex.needsUpdate = true; glow.tex.needsUpdate = true;
    const deckM = new THREE.MeshStandardMaterial({ map: deck.tex, metalness: 0.2, roughness: 0.6, envMapIntensity: 0.5, emissive: '#cfe2ff', emissiveMap: glow.tex, emissiveIntensity: 0 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, D - 0.006), deckM);
    top.rotation.x = -Math.PI / 2; top.position.y = T + 0.0003; top.receiveShadow = true; g.add(top);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, W - 0.05, 12).rotateZ(Math.PI / 2), mat('#2b2c2f', { metalness: 0.5, roughness: 0.4 }));
    hinge.position.set(0, T - 0.0005, -D / 2 + 0.0045); g.add(hinge);
    // Lid: aluminium back, black glass bezel with the notch, and the logo. The screen itself is the punched hole.
    const pivot = new THREE.Group(); pivot.position.set(0, T + 0.0022, -D / 2 + 0.003); g.add(pivot);
    const lid = new THREE.Mesh(plate(W, LH, LT, 0.012).translate(0, LH / 2, 0), alu);
    lid.castShadow = true; pivot.add(lid);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.004, LH - 0.004), new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.4, metalness: 0 }));
    bezel.position.set(0, LH / 2, 0.0003); pivot.add(bezel);
    const notch = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0065), bezel.material);
    notch.position.set(0, LH - 0.002 - 0.0033, 0.0018); pivot.add(notch);
    const logo = makeCanvas(256, 256), l = logo.ctx;
    l.fillStyle = '#fff';
    for (const [x, y, rx, ry] of [[100, 140, 72, 74], [156, 140, 72, 74], [128, 184, 82, 58]]) { l.beginPath(); l.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); l.fill(); }
    l.beginPath(); l.ellipse(144, 40, 13, 30, 0.7, 0, Math.PI * 2); l.fill();
    l.globalCompositeOperation = 'destination-out';
    for (const [x, y, r] of [[128, 62, 18], [128, 246, 16], [236, 132, 34]]) { l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fill(); }
    logo.tex.needsUpdate = true;
    const apple = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.046), new THREE.MeshStandardMaterial({ color: '#f1f2f4', metalness: 1, roughness: 0.08, alphaMap: logo.tex, alphaTest: 0.5, emissive: '#ffffff', emissiveIntensity: 0.06 }));
    apple.rotation.y = Math.PI; apple.position.set(0, LH / 2 + 0.006, -LT - 0.0002); pivot.add(apple);
    // The screen's light on the keys and on you.
    const light = new THREE.PointLight('#d6e4ff', 0, 0.9, 2);
    light.position.set(0, LH * 0.5, 0.16); pivot.add(light);
    g.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { action: 'laptop', reach: 3.2 }); });
    // Rest on the table edge nearest `st`, facing it.
    const poseFor = (st) => ({ x: 16.7 - Math.sin(st.rotY) * 0.09, z: 13.96, r: st.rotY + Math.PI });
    const L = { g, pivot, lid, light, deckM, W, LH, seats: nookSeats, seat: nookSeats[0], open: false, shown: false, k: 0, poseFor };
    const p0 = poseFor(L.seat);
    g.position.set(p0.x, 0.4, p0.z); g.rotation.y = p0.r; pivot.rotation.x = Math.PI / 2;
    return L;
  }

  pendant(9.3, 9, { light: 14, shade: '#2f463b' }); pendant(10.7, 9, { shade: '#2f463b' });
  floorLamp(18.55, 14.3, 10);
  plant(14.7, 14.4, 0.9);

  // ----- my office -----
  // Tinted glass that gets more opaque and reflective at grazing angles, so the walls read as solid.
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#b9d3da', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, envMapIntensity: 2.2, specularIntensity: 1, depthWrite: false });
  glassM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = mix(gl_FragColor.a, 0.62, pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0));');
  };
  const frostTex = (() => {
    const t = makeCanvas(128, 64), { ctx } = t;
    ctx.fillStyle = 'rgba(244,247,248,.62)'; ctx.fillRect(0, 0, 128, 34);
    for (let x = 8; x < 128; x += 16) { ctx.beginPath(); ctx.arc(x, 48, 4.5, 0, Math.PI * 2); ctx.fill(); }
    t.tex.wrapS = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;
  })();
  // Venetian blinds: k 0 = raised, 1 = lowered with slats tilted ~57°, leaving thin slits of light.
  // A run is one InstancedMesh of slats (and one of bottom rails) for a row of [x, width] cells hanging from `top` down to `bot`.
  const slatM = mat('#e6e1d6', { roughness: 0.95, envMapIntensity: 0.25 }), railM = mat('#cfc9bd'), blinds = {};
  for (const [key, name] of [['side', 'Blinds'], ['front', 'Blinds'], ['north', 'North window blinds'], ['east', 'East window blinds'], ['west', 'West window blinds'], ['office', 'Window blinds'],
    ['meetSouth', 'Meeting room (south) blinds'], ['meetNorth', 'Meeting room (north) blinds'], ['meetSmall', 'Small meeting room blinds']]) blinds[key] = { key, name, k: 0, to: 0, runs: [] };
  const BL = { top: ROOM.h - 0.12, sp: 0.05, stack: 0.008, slatG: new THREE.BoxGeometry(1, 0.004, 0.058), railG: new THREE.BoxGeometry(1, 0.02, 0.06) };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  // States: 0 raised, 0.5 lowered with the slats open, 1 closed. The first half drops the blind, the second tilts the slats.
  const blindShut = (k) => clamp(k * 2, 0, 1) * 0.3 + clamp(k * 2 - 1, 0, 1) * 0.6;
  function layBlind(r, k) {
    const drop = clamp(k * 2, 0, 1), tilt = clamp(k * 2 - 1, 0, 1) * 1.0;
    const railY = lerp(r.top - r.n * BL.stack - 0.02, r.bot, drop);
    _q.setFromEuler(_e.set(tilt, 0, 0));
    r.cells.forEach(([x, w], c) => {
      _s.x = w;
      r.rails.setMatrixAt(c, _m4.compose(_v.set(x, railY, 0), _q0, _s));
      for (let i = 0; i < r.n; i++) r.slats.setMatrixAt(c * r.n + i, _m4.compose(_v.set(x, Math.max(r.top - (i + 1) * BL.sp, railY + (r.n - i) * BL.stack), 0), _q, _s));
    });
    for (const m of [r.slats, r.rails]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  }
  function hangBlind(g, cells, top, bot, z, bl) {
    const n = Math.floor((top - bot - 0.02) / BL.sp), r = { cells, top, bot, n, slats: new THREE.InstancedMesh(BL.slatG, slatM, n * cells.length), rails: new THREE.InstancedMesh(BL.railG, railM, cells.length) };
    g.add(mergedBoxes(cells.map(([x, w]) => [w, 0.05, 0.07, x, top + 0.03, z]), mat('#d9d4c9')));
    for (const m of [r.slats, r.rails]) { m.position.z = z; m.castShadow = true; m.userData = { action: 'blinds', blind: bl, reach: 6 }; g.add(m); }
    bl.runs.push(r); layBlind(r, 0);
  }
  // A group on the `inward` side of a wall along x (z fixed) or z (x fixed), centred at `mid`; ux maps a wall coordinate to its local x.
  function wallGroup(axis, fixed, inward, mid) {
    const X = axis === 'x', g = new THREE.Group();
    g.position.set(X ? mid : fixed, 0, X ? fixed : mid); g.rotation.y = X ? (inward > 0 ? 0 : Math.PI) : inward * Math.PI / 2; world.add(g);
    const sx = X ? Math.cos(g.rotation.y) : -Math.sin(g.rotation.y);
    return { g, ux: (u) => (u - mid) * sx };
  }
  function glass(axis, fixed, from, to, bl) {
    const len = to - from, mid = (from + to) / 2, X = axis === 'x';
    const at = (u, w, h, d, y, m) => box(world, X ? w : d, h, X ? d : w, '', X ? u : fixed, y, X ? fixed : u, { material: m, shadow: false });
    const pane = at(mid, len, ROOM.h, 0.03, ROOM.h / 2, glassM);
    pane.userData = { action: 'blinds', blind: bl, reach: 3.5, glass: true };
    at(mid, len, 0.06, 0.06, 0.03, frameM); at(mid, len, 0.06, 0.06, ROOM.h - 0.03, frameM);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) at(from + (i * len) / n, 0.05, ROOM.h, 0.07, ROOM.h / 2, frameM);
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(len / 0.32, 1); fm.map.needsUpdate = true;
    at(mid, len, 0.16, 0.036, 1.46, fm).userData = pane.userData;
    solid(X ? mid : fixed, X ? fixed : mid, X ? len : 0.08, X ? 0.08 : len);
    // Blind hangs on the office side of the glass.
    const g = new THREE.Group();
    g.position.set(X ? mid : fixed, 0, X ? fixed : mid); g.rotation.y = X ? Math.PI : Math.PI / 2; world.add(g);
    hangBlind(g, [[0, len - 0.2]], BL.top, 0.06, 0.11, bl);
  }
  glass('z', 6, -15, -3.5, blinds.side);
  glass('x', -3.5, 6, 7, blinds.front);
  glass('x', -3.5, 8.4, 20, blinds.front);
  // Outside windows: a blind per pane just inside the glass, above the sill. One run per wall stretch and group.
  for (const w of winRuns) {
    const X = w.axis === 'x', { g, ux } = wallGroup(w.axis, w.fixed, w.inward, (w.a + w.b) / 2), cells = {};
    const cell = (a, b) => (cells[winKey(w.axis, w.fixed, (a + b) / 2)] ||= []).push([ux((a + b) / 2), b - a]);
    for (let q = 0; q < w.n; q++) {
      const a = w.a + q * w.step + 0.07, b = w.a + (q + 1) * w.step - 0.07;
      if (!X && w.fixed > 0 && a < -3.5 && b > -3.5) { cell(a, -3.56); cell(-3.44, b); } else cell(a, b);   // my office's glass meets the east wall here
    }
    for (const [key, cs] of Object.entries(cells)) hangBlind(g, cs, 3.0, 0.53, 0.16, blinds[key]);
    w.glass.userData = { action: 'blinds', glass: true, reach: 3.5, blindAt: (p) => blinds[winKey(w.axis, w.fixed, X ? p.x : p.z)] };
  }
  for (const x of [7, 8.4]) box(world, 0.06, ROOM.h, 0.06, '', x, ROOM.h / 2, -3.5, { material: frameM, shadow: false });
  box(world, 1.46, 0.08, 0.08, '', 7.7, 2.24, -3.5, { material: frameM, shadow: false });
  box(world, 1.34, ROOM.h - 2.34, 0.03, '', 7.7, (ROOM.h + 2.28) / 2, -3.5, { material: glassM, shadow: false });
  // Glass doors: a leaf hinged at (hx, hz), lying along angle r0 when shut and swinging `swing` (±1) quarter turns open.
  // An invisible box over the whole leaf takes the clicks (the glass itself is on layer 1, which the ray skips). Its
  // collider follows it, and `auto` doors open by themselves while someone walks through.
  const doors = [], doorHitM = new THREE.MeshBasicMaterial();
  function glassDoor({ name, hx, hz, r0, swing, W, H = 2.18, auto = false }) {
    const d = { name, k: 0, to: 0, r0, swing, W, hx, hz, auto, pivot: new THREE.Group(), box: {} };
    const p = d.pivot;
    p.position.set(hx, 0, hz); p.rotation.y = r0; world.add(p);
    box(p, W, H, 0.025, '', W / 2, H / 2 + 0.01, 0, { material: glassM, shadow: false });
    for (const [w, h, x, y] of [[W, 0.07, W / 2, 0.045], [W, 0.05, W / 2, H - 0.015], [0.05, H, 0.025, H / 2 + 0.01], [0.05, H, W - 0.025, H / 2 + 0.01]]) box(p, w, h, 0.045, '', x, y, 0, { material: frameM });
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(W / 0.32, 1); fm.map.needsUpdate = true;
    box(p, W - 0.1, 0.16, 0.03, '', W / 2, 1.46, 0, { material: fm, shadow: false });
    for (const s of [-1, 1]) {
      cyl(p, 0.014, 0.014, 0.9, '#b8bcc2', W - 0.12, 1.05, s * 0.07, { mat: { metalness: 0.9, roughness: 0.25 } });
      for (const y of [0.65, 1.45]) box(p, 0.018, 0.018, 0.06, '#b8bcc2', W - 0.12, y, s * 0.04, { mat: { metalness: 0.9, roughness: 0.25 } });
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.1), doorHitM);
    hit.position.set(W / 2, H / 2, 0); hit.visible = false; p.add(hit);
    p.traverse((o) => { if (o.isMesh) o.userData = { action: 'door', door: d, reach: 5 }; });
    setDoorBox(d, false);
    colliders.push(d.box);
    doors.push(d);
    return d;
  }
  function setDoorBox(d, open) {
    const r = d.r0 + (open ? d.swing * Math.PI / 2 : 0), tx = d.hx + Math.cos(r) * d.W, tz = d.hz - Math.sin(r) * d.W;
    Object.assign(d.box, { minX: Math.min(d.hx, tx) - 0.04, maxX: Math.max(d.hx, tx) + 0.04, minZ: Math.min(d.hz, tz) - 0.04, maxZ: Math.max(d.hz, tz) + 0.04 });
  }
  // Mine: hinged on the left post, swinging into my office; shared with every browser via /api/office.
  const door = glassDoor({ name: 'Office door', hx: 7.04, hz: -3.5, r0: 0, swing: 1, W: 1.34 });
  function officeFx(dt) {
    for (const b of Object.values(blinds)) if (b.k !== b.to) {
      b.k = b.to > b.k ? Math.min(b.to, b.k + dt / 2.2) : Math.max(b.to, b.k - dt / 2.2);
      for (const r of b.runs) layBlind(r, b.k);
      if (WIN.includes(b.key)) shaftU.shut.value[WIN.indexOf(b.key)] = blindShut(b.k);
    }
    for (const d of doors) {
      const mid = { x: d.hx + Math.cos(d.r0) * d.W / 2, z: d.hz - Math.sin(d.r0) * d.W / 2 };
      const want = d.auto && [...people.values()].some((q) => Math.hypot(q.root.position.x - mid.x, q.root.position.z - mid.z) < 1.3) ? 1 : d.to;
      if (d.k === want) continue;
      d.k = want > d.k ? Math.min(1, d.k + dt / 0.9) : Math.max(0, d.k - dt / 0.9);
      d.pivot.rotation.y = d.r0 + d.swing * ease(d.k) * Math.PI * 0.5;
      setDoorBox(d, d.k > 0.85);
      if (d.k < 0.85 && want === 0) collide(player);
    }
  }
  // ----- kitchen -----
  // A run of base units under the north windows (sink, coffee station, drinks fridge, taps, snacks), a tall appliance wall
  // on the west (fridge, two glass drinks fridges, microwaves, pantry), and an island with stools. The fridges open
  // (they're doors), the drinks fridges open for anyone fetching a can, and the coffee machine brews when clicked.
  const kitchen = (() => {
    const GREEN = '#2f4a3f', GAP = '#1b2a24', OAK = '#b98a5a', STEEL = '#c3c7cc', BLACK = '#1c1c1e', BRASS = '#c9a35a';
    const kvc = mat('#ffffff', { vertexColors: true, roughness: 0.6 }), kmetal = mat('#ffffff', { vertexColors: true, roughness: 0.3, metalness: 0.7 });
    const quartzM = mat('#efece6', { roughness: 0.38 }), litM = mat('#eef3f7', { emissive: '#eaf4ff', emissiveIntensity: 0.55, roughness: 0.6 });
    const kGlassM = new THREE.MeshPhysicalMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.16, roughness: 0.04, envMapIntensity: 1.6, depthWrite: false });
    const B = [], M = [];   // painted boxes, metal boxes: [w, h, d, x, y, z, colour]
    // Base run: carcass, recessed plinth, then fronts per module along x. Fronts face -z at FZ.
    const X0 = -20, X1 = -11.45, FZ = 14.25, TOP = 0.92;
    const BX0 = -15.35, BX1 = -14.75;   // under-counter drinks fridge: a lit cavity instead of carcass
    for (const [a, b] of [[X0, BX0], [BX1, X1]]) B.push([b - a, 0.78, 14.9 - FZ, (a + b) / 2, 0.49, (FZ + 14.9) / 2, GAP]);
    B.push([X1 - X0, 0.1, 0.6, (X0 + X1) / 2, 0.05, 14.6, BLACK], [BX1 - BX0, 0.03, 0.6, (BX0 + BX1) / 2, 0.115, 14.58, '#dfe6ea'], [BX1 - BX0, 0.03, 0.6, (BX0 + BX1) / 2, 0.865, 14.58, '#dfe6ea']);
    const front = (xa, xb, ya, yb, c = GREEN) => B.push([xb - xa - 0.008, yb - ya - 0.008, 0.02, (xa + xb) / 2, (ya + yb) / 2, FZ - 0.01, c]);
    const pull = (x, y, w = 0.14) => M.push([w, 0.012, 0.02, x, y, FZ - 0.035, BRASS]);
    const MODS = [[-19.35, -18.75, 'drawers'], [-18.75, -17.95, 'doors'], [-17.95, -17.35, 'dishwasher'], [-17.35, -16.75, 'bins'], [-16.75, -15.95, 'doors'],
      [-15.95, -15.35, 'drawers'], [-15.35, -14.75, 'bev'], [-14.75, -13.95, 'keg'], [-13.95, -13.35, 'drawers'], [-13.35, -12.4, 'doors'], [-12.4, -11.45, 'doors']];
        for (const [xa, xb, kind] of MODS) {
      const mx = (xa + xb) / 2;
      if (kind === 'drawers') for (const [ya, yb] of [[0.1, 0.42], [0.42, 0.68], [0.68, 0.88]]) { front(xa, xb, ya, yb); pull(mx, yb - 0.06); }
      else if (kind === 'doors') { front(xa, mx, 0.1, 0.88); front(mx, xb, 0.1, 0.88); for (const s of [-1, 1]) M.push([0.012, 0.16, 0.02, mx + s * 0.04, 0.74, FZ - 0.035, BRASS]); }
      else if (kind === 'dishwasher') { M.push([xb - xa - 0.01, 0.77, 0.02, mx, 0.49, FZ - 0.01, STEEL], [xb - xa - 0.12, 0.02, 0.03, mx, 0.8, FZ - 0.04, '#9aa0a6']); }
      else if (kind === 'bins') { front(xa, xb, 0.1, 0.88); pull(mx, 0.8);
        ['#4f8a4a', '#3a6fb0', '#6b6f75'].forEach((c, i) => B.push([0.13, 0.05, 0.005, xa + 0.13 + i * 0.17, 0.66, FZ - 0.022, c])); }
      else if (kind === 'keg') { M.push([xb - xa - 0.01, 0.77, 0.02, mx, 0.49, FZ - 0.01, '#8d9399']); pull(mx, 0.8, 0.4); }
      else if (kind === 'bev') {   // under-counter drinks fridge: black frame, lit inside, cans behind glass
        const w = xb - xa - 0.008;
        B.push([w, 0.05, 0.03, mx, 0.125, FZ - 0.01, BLACK], [w, 0.08, 0.03, mx, 0.84, FZ - 0.01, BLACK], [0.04, 0.77, 0.03, xa + 0.024, 0.49, FZ - 0.01, BLACK], [0.04, 0.77, 0.03, xb - 0.024, 0.49, FZ - 0.01, BLACK]);
        for (const y of [0.36, 0.6]) M.push([w - 0.04, 0.008, 0.55, mx, y, 14.56, '#b8bcc2']);
        M.push([0.012, 0.3, 0.02, xb - 0.07, 0.55, FZ - 0.04, BLACK]);
      }
    }
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    box(world, X1 - X0 + 0.03, 0.04, 0.7, '', (X0 + X1) / 2 - 0.015, TOP - 0.02, 14.55, { material: quartzM });
    solid((X0 + X1) / 2, 14.55, X1 - X0, 0.7);

    // Sink with a gooseneck tap, soap and a brush; a boiling/sparkling water tap by the coffee.
    const sx = -18.35;
    M.push([0.62, 0.006, 0.42, sx, TOP + 0.001, 14.5, '#7d8389'], [0.54, 0.008, 0.34, sx, TOP + 0.002, 14.5, '#3a3e43'], [0.05, 0.009, 0.05, sx, TOP + 0.003, 14.5, '#202225']);
    const tap = (x, z, h, r) => {
      cyl(world, 0.022, 0.026, 0.03, '', x, TOP + 0.015, z, { material: shinyTapM });
      cyl(world, 0.012, 0.012, h, '', x, TOP + h / 2, z, { material: shinyTapM });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 16, Math.PI), shinyTapM);
      arc.position.set(x, TOP + h, z - r); arc.rotation.y = Math.PI / 2; arc.castShadow = true; world.add(arc);
      cyl(world, 0.014, 0.012, 0.04, '', x, TOP + h - 0.02, z - 2 * r, { material: shinyTapM });
    };
    const shinyTapM = mat('#d4d7db', { metalness: 0.95, roughness: 0.15 });
    tap(sx, 14.72, 0.32, 0.1); tap(-15.05, 14.66, 0.22, 0.07);
    cyl(world, 0.03, 0.03, 0.14, '#e8e2d6', sx + 0.4, TOP + 0.07, 14.62); cyl(world, 0.008, 0.008, 0.05, '#222', sx + 0.4, TOP + 0.16, 14.62);
    box(world, 0.04, 0.03, 0.14, OAK, sx + 0.5, TOP + 0.015, 14.6).rotation.y = 0.4;

    // Coffee station: bean-to-cup machine (screen, spouts, drip tray, hopper), grinder, knock box, a stack of mugs.
    const CX = -16.5, CZ = 14.52;
    B.push([0.38, 0.5, 0.42, CX, TOP + 0.25, CZ, '#202225'], [0.3, 0.1, 0.05, CX, TOP + 0.36, CZ - 0.23, '#2a2c30'], [0.07, 0.05, 0.06, CX, TOP + 0.3, CZ - 0.25, BLACK],
      [0.14, 0.32, 0.2, CX + 0.36, TOP + 0.16, CZ + 0.04, '#26282b'], [0.12, 0.1, 0.12, CX - 0.38, TOP + 0.05, CZ - 0.04, BLACK]);
    M.push([0.39, 0.04, 0.43, CX, TOP + 0.48, CZ, STEEL], [0.32, 0.025, 0.15, CX, TOP + 0.0125, CZ - 0.24, '#9aa0a6'], [0.012, 0.3, 0.43, CX - 0.19, TOP + 0.25, CZ, STEEL], [0.012, 0.3, 0.43, CX + 0.19, TOP + 0.25, CZ, STEEL]);
    cyl(world, 0.07, 0.06, 0.12, '#4a2c1a', CX + 0.06, TOP + 0.56, CZ + 0.06, { mat: { roughness: 0.9 } });
    cyl(world, 0.07, 0.03, 0.12, '#3b2416', CX + 0.36, TOP + 0.38, CZ + 0.04, { mat: { roughness: 0.9 } });
    const MUGS = ['#f4f1ea', '#d97757', '#2f6f8f', '#e0b23a', '#f4f1ea', '#33473f'];
    for (let i = 0; i < 6; i++) cyl(world, 0.042, 0.038, 0.1, MUGS[i], -15.75 + (i % 3) * 0.1, TOP + 0.05 + Math.floor(i / 3) * 0.1, 14.5 + (i % 2) * 0.02);
    // Kettle and tea tins.
    cyl(world, 0.065, 0.08, 0.2, '#e8e2d6', -15.4, TOP + 0.1, 14.55, { seg: 20 }); box(world, 0.03, 0.14, 0.02, BLACK, -15.4, TOP + 0.13, 14.64);
    ['#3f4a6b', '#c4572a', '#6b8e4e'].forEach((c, i) => cyl(world, 0.04, 0.04, 0.13, c, -15.62 + i * 0.09, TOP + 0.065, 14.72));
    // Cold brew and kombucha on tap, from the keg fridge below.
    M.push([0.06, 0.36, 0.06, -14.35, TOP + 0.18, 14.55, STEEL], [0.3, 0.06, 0.07, -14.35, TOP + 0.38, 14.55, STEEL], [0.24, 0.015, 0.12, -14.35, TOP + 0.008, 14.45, '#7d8389']);
    for (const [dx, c] of [[-0.1, BLACK], [0.1, OAK]]) {
      B.push([0.03, 0.12, 0.03, -14.35 + dx, TOP + 0.47, 14.53, c], [0.06, 0.04, 0.005, -14.35 + dx, TOP + 0.38, 14.512, dx < 0 ? '#2f2016' : '#d9a441']);
      M.push([0.015, 0.05, 0.015, -14.35 + dx, TOP + 0.32, 14.5, STEEL]);
    }
    // Snacks: a stepped oak riser of clear bins (nuts, sweets, crisps, granola) and three cereal dispensers.
    const SNACK = ['#c98f4a', '#e05a7a', '#e0b23a', '#8c5a3c', '#f2c94c', '#6b8e4e', '#d97757', '#b5654a', '#9a6a3a', '#ff8fab', '#7a4a2a', '#ffd166'];
    for (let t = 0; t < 3; t++) {
      const z = 14.42 + t * 0.14, y = TOP + t * 0.12;
      B.push([1.4, 0.03 + t * 0.12, 0.15, -12.95, TOP + (0.03 + t * 0.12) / 2, z, OAK]);
      for (let i = 0; i < 4; i++) B.push([0.28, 0.12, 0.11, -13.45 + i * 0.33, y + 0.03 + 0.06 + 0.005, z - 0.005, SNACK[t * 4 + i]]);
    }
    for (let i = 0; i < 3; i++) {
      const x = -11.95 + i * 0.16;
      cyl(world, 0.055, 0.055, 0.2, ['#f2c94c', '#8c5a3c', '#e05a7a'][i], x, TOP + 0.2, 14.55, { mat: { roughness: 0.9 } });
      M.push([0.05, 0.1, 0.05, x, TOP + 0.05, 14.55, '#2a2c30'], [0.14, 0.03, 0.14, x, TOP + 0.315, 14.55, '#2a2c30']);
    }
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    box(world, 1.38, 0.42, 0.42, '', -12.95, TOP + 0.21, 14.56, { material: kGlassM, shadow: false });
    for (let i = 0; i < 3; i++) cyl(world, 0.064, 0.064, 0.22, '', -11.95 + i * 0.16, TOP + 0.2, 14.55, { material: kGlassM, shadow: false });

    // Cans and bottles, shared by the drinks fridges: one instanced mesh each, a product per shelf like a restocked fridge.
    const cans = [], bottles = [];
    const DRINKS = [['can', ['#f2b8c6', '#7fd1c7', '#c7e27a', '#ffb36b']], ['can', ['#d0312d']], ['bottle', ['#f28c28', '#f6a623']], ['bottle', ['#b5762a', '#8fb35a']], ['can', ['#2b2b2b', '#e8e8e8']], ['bottle', ['#bfe3f2']]];
    function stock(cols, rows, at) {   // at(c, r) -> [x, y, z, drinksIndex]
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const [x, y, z, k] = at(c, r), [kind, pal] = DRINKS[k % DRINKS.length];
        (kind === 'can' ? cans : bottles).push([x, y, z, pal[(c + r) % pal.length]]);
      }
    }
    stock(7, 6, (c, r) => [-15.3 + c * 0.075, [0.13, 0.364, 0.604][r % 3], r < 3 ? 14.38 : 14.6, r % 3 + 1]);   // under-counter fridge: 7 across, 3 shelves, 2 deep

    // Tall wall on the west: carcass, then (south to north) pantry, two microwaves, two glass drinks fridges, fridge-freezer.
    const WX = -19.35, WZ0 = 10.9, WZ1 = 14.22, TH = 2.25;
    const wfront = (za, zb, ya, yb, c = GREEN) => B.push([0.02, yb - ya - 0.008, zb - za - 0.008, WX + 0.01, (ya + yb) / 2, (za + zb) / 2, c]);
    B.push([0.65, ROOM.h - TH, WZ1 - WZ0, WX - 0.325, (TH + ROOM.h) / 2, (WZ0 + WZ1) / 2, GREEN], [0.6, 0.1, WZ1 - WZ0, WX - 0.33, 0.05, (WZ0 + WZ1) / 2, BLACK]);
    for (const z of [WZ0 + 0.01, 11.4, 12.0, 12.635, 13.27, WZ1 - 0.01]) B.push([0.66, TH, 0.02, WX - 0.33, TH / 2, z, GREEN]);
    B.push([0.62, TH - 0.1, 0.48, WX - 0.33, TH / 2 + 0.05, 11.15, GAP], [0.62, TH - 0.1, 0.58, WX - 0.33, TH / 2 + 0.05, 11.7, GAP]);
    wfront(WZ0, 11.4, 0.1, TH); M.push([0.02, 0.6, 0.012, WX + 0.035, 1.15, 11.33, BRASS]);
    wfront(11.4, 12.0, 0.1, 0.88); wfront(11.4, 12.0, 0.88, 1.32);
    M.push([0.02, 0.012, 0.16, WX + 0.035, 0.8, 11.7, BRASS], [0.02, 0.012, 0.16, WX + 0.035, 1.22, 11.7, BRASS]);
    for (const y of [1.32, 1.79]) {   // microwaves: black glass door, steel trim, keypad, a green clock
      M.push([0.02, 0.46, 0.6, WX + 0.01, y + 0.23, 11.7, STEEL]);
      B.push([0.012, 0.36, 0.38, WX + 0.025, y + 0.23, 11.64, '#101114'], [0.012, 0.36, 0.1, WX + 0.025, y + 0.23, 11.9, '#2a2c30']);
      for (let k = 0; k < 6; k++) B.push([0.006, 0.025, 0.025, WX + 0.033, y + 0.15 + (k % 3) * 0.045, 11.88 + Math.floor(k / 3) * 0.04, '#5a5e64']);
    }
    const clock = [];
    for (const y of [1.32, 1.79]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.02), mat('#000', { emissive: '#4cff8a', emissiveIntensity: 1.6 })); c.position.set(WX + 0.034, y + 0.38, 11.9); c.rotation.y = Math.PI / 2; world.add(c); clock.push(c); }

    // A door on the doors list (so it animates, hovers and clicks like the others), hinged at z=hz on the tall wall's face.
    // `north` hinges sit at the north edge of the unit and the leaf swings out into the room.
    const leaves = [];
    function applianceDoor(name, za, zb, ya, yb, north, build, auto = false) {
      const W = zb - za, hz = north ? zb : za, d = { name, k: 0, to: 0, r0: north ? Math.PI / 2 : -Math.PI / 2, swing: north ? -1 : 1, W, hx: WX, hz, auto, pivot: new THREE.Group(), box: {} };
      d.pivot.position.set(WX, 0, hz); d.pivot.rotation.y = d.r0; world.add(d.pivot);
      build(d.pivot, W, ya, yb);
      d.pivot.traverse((o) => { if (o.isMesh) o.userData = { action: 'door', door: d, reach: 3.2 }; });
      doors.push(d); leaves.push(d);
      return d;
    }
    // Leaf space: x runs 0..W from the hinge, z out of the face (toward the room).
    const handle = (g, W, y0, y1, c = STEEL) => { box(g, 0.02, y1 - y0, 0.02, c, W - 0.06, (y0 + y1) / 2, 0.075, { mat: { metalness: 0.9, roughness: 0.25 } });
      for (const y of [y0 + 0.02, y1 - 0.02]) box(g, 0.02, 0.02, 0.05, c, W - 0.06, y, 0.05, { mat: { metalness: 0.9, roughness: 0.25 } }); };

    // Glass drinks fridges: lit white box, wire shelves, six products; black-framed glass doors that open toward each other's hinge.
    for (const [za, zb, north, name] of [[12.635, 13.27, true, 'Drinks fridge'], [12.0, 12.635, false, 'Drinks fridge']]) {
      const zm = (za + zb) / 2, w = zb - za - 0.06;
      B.push([0.02, TH - 0.2, w, WX - 0.62, TH / 2, zm, '#eaf2f7'], [0.6, 0.02, w, WX - 0.33, 0.12, zm, '#dfe6ea'], [0.6, 0.02, w, WX - 0.33, TH - 0.08, zm, '#dfe6ea'], [0.6, 0.1, w + 0.04, WX - 0.33, 0.05, zm, BLACK]);
      B.push([0.012, 0.08, w, WX - 0.33, TH - 0.15, zm, '#1f2a33']);   // lit header
      for (let s = 0; s < 6; s++) M.push([0.55, 0.012, w, WX - 0.34, 0.15 + s * 0.34, zm, '#b8bcc2']);
      const k0 = north ? 0 : 3;
      stock(Math.floor(w / 0.078), 12, (c, r) => {
        const s = Math.floor(r / 2), back = r % 2;
        return [WX - 0.12 - back * 0.16, 0.16 + s * 0.34, za + 0.07 + c * 0.078, k0 + s];
      });
      applianceDoor(name, za, zb, 0.1, TH - 0.02, north, (g, W, ya, yb) => {
        const fr = [[W, 0.06, 0.04, W / 2, ya + 0.03, 0.02], [W, 0.1, 0.04, W / 2, yb - 0.05, 0.02], [0.05, yb - ya, 0.04, 0.025, (ya + yb) / 2, 0.02], [0.05, yb - ya, 0.04, W - 0.025, (ya + yb) / 2, 0.02]];
        g.add(mergedBoxes(fr.map((b) => [...b, BLACK]), kvc));
        box(g, W - 0.1, yb - ya - 0.16, 0.012, '', W / 2, (ya + yb) / 2 - 0.02, 0.02, { material: kGlassM, shadow: false });
        handle(g, W, 0.85, 1.55, BLACK);
      }, true);
    }
    // Fridge-freezer: lit interior with glass shelves and food behind the top door; freezer drawer below.
    {
      const za = 13.27, zb = WZ1, zm = (za + zb) / 2, w = zb - za - 0.06;
      B.push([0.6, 0.05, w + 0.04, WX - 0.33, 0.77, zm, '#e3e7ea'], [0.6, 0.08, w + 0.04, WX - 0.33, TH - 0.04, zm, '#e3e7ea'], [0.6, 0.1, w + 0.04, WX - 0.33, 0.05, zm, BLACK]);
      for (const s of [1.15, 1.5, 1.85]) M.push([0.55, 0.01, w, WX - 0.34, s, zm, '#cfe3ea']);
      const FOOD = [[0.09, 0.24, 0.07, '#f4f6f9'], [0.08, 0.22, 0.08, '#4a6fd0'], [0.07, 0.2, 0.07, '#f2f2f2'], [0.2, 0.1, 0.15, '#ff9d3a'], [0.18, 0.08, 0.14, '#e8e2d6'], [0.06, 0.14, 0.06, '#c4572a'], [0.07, 0.07, 0.07, '#e0b23a'], [0.16, 0.12, 0.12, '#6b8e4e']];
      const FR = rng(77);
      for (const s of [0.8, 1.16, 1.51, 1.86]) for (let z = za + 0.1; z < zb - 0.12;) {
        const [fw, fh, fd, c] = FOOD[Math.floor(FR() * FOOD.length)];
        if (z + fd > zb - 0.06) break;
        B.push([fw, fh, fd, WX - 0.2 - FR() * 0.25, s + fh / 2, z + fd / 2, c]); z += fd + 0.03 + FR() * 0.04;
      }
      applianceDoor('Fridge', za, zb, 0.8, TH - 0.02, true, (g, W, ya, yb) => {
        g.add(mergedBoxes([[W - 0.008, yb - ya, 0.06, W / 2, (ya + yb) / 2, 0.03, STEEL]], kmetal));
        g.add(mergedBoxes([[W - 0.1, 0.02, 0.06, W / 2, ya + 0.35, -0.03, '#e3e7ea'], [W - 0.1, 0.02, 0.06, W / 2, ya + 0.75, -0.03, '#e3e7ea'],
          [0.08, 0.2, 0.05, 0.2, ya + 0.47, -0.03, '#f4f6f9'], [0.08, 0.22, 0.05, 0.32, ya + 0.48, -0.03, '#d97757'], [0.07, 0.12, 0.05, 0.44, ya + 0.85, -0.03, '#e0b23a']], kvc));
        handle(g, W, ya + 0.1, ya + 0.85);
      });
      M.push([0.06, 0.68, w + 0.05, WX + 0.03, 0.44, zm, STEEL], [0.02, 0.02, 0.5, WX + 0.075, 0.7, zm, '#9aa0a6']);
      B.push([0.6, 0.008, w, WX - 0.33, 0.78, zm, '#d9e6ec']);
    }
    // Interiors glow: a lit back panel per fridge, so the glass doors show the stock day and night.
    for (const [za, zb] of [[12.0, 12.635], [12.635, 13.27], [13.27, WZ1]]) box(world, 0.01, TH - 0.4, zb - za - 0.08, '', WX - 0.6, TH / 2 + 0.1, (za + zb) / 2, { material: litM, shadow: false });
    box(world, BX1 - BX0 - 0.02, 0.72, 0.01, '', (BX0 + BX1) / 2, 0.49, 14.86, { material: litM, shadow: false });
    box(world, BX1 - BX0 - 0.06, 0.66, 0.01, '', (BX0 + BX1) / 2, 0.49, FZ - 0.01, { material: kGlassM, shadow: false });
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), bottleGeo = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 0.17, 10).translate(0, 0.085, 0),
      new THREE.CylinderGeometry(0.012, 0.03, 0.07, 10).translate(0, 0.205, 0)]);
    canGeo.translate(0, 0.06, 0);
    const c = new THREE.Color();
    for (const [geo, list, ro] of [[canGeo, cans, 0.35], [bottleGeo, bottles, 0.15]]) {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: ro, metalness: geo === canGeo ? 0.6 : 0 }), list.length);
      list.forEach(([x, y, z, col], i) => { im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)); im.setColorAt(i, c.set(col)); });
      world.add(im);
    }
    solid(WX - 0.33, (WZ0 + WZ1) / 2, 0.7, WZ1 - WZ0);

    // "Today in the kitchen" board on the end of the tall units.
    {
      const brd = makeScreen(world, 0.5, 0.7, 400, 560, WX - 0.33, 1.5, WZ0 - 0.012);
      brd.mesh.rotation.y = Math.PI;
      const { ctx } = brd;
      ctx.fillStyle = '#23302a'; ctx.fillRect(0, 0, 400, 560);
      ctx.strokeStyle = OAK; ctx.lineWidth = 16; ctx.strokeRect(8, 8, 384, 544);
      ctx.fillStyle = '#f4efe4'; ctx.font = `700 40px ${FONT}`; ctx.fillText('Today', 36, 76);
      ctx.font = `400 26px ${FONT}`; ctx.fillStyle = '#d6cfbf';
      ['Lunch 12:30: tacos 🌮', 'Beans: Ethiopia, washed', 'Oat milk: top shelf', 'Kombucha: ginger', '', 'Friday: pizza + demos', '', 'Please load the', 'dishwasher ♥'].forEach((l, i) => ctx.fillText(l, 36, 136 + i * 42));
      brd.mesh.material = new THREE.MeshStandardMaterial({ map: brd.tex, roughness: 0.9 });
      brd.tex.needsUpdate = true;
    }

    // Island: quartz top with waterfall ends, oak fluted base on the stool side, green cupboards facing the kitchen.
    const IX = -15.4, IZ = 11.5, IL = 3.8, ID = 1.1;
    box(world, IL, 0.05, ID, '', IX, TOP - 0.025, IZ, { material: quartzM });
    for (const s of [-1, 1]) box(world, 0.05, TOP - 0.05, ID, '', IX + s * (IL / 2 - 0.025), (TOP - 0.05) / 2, IZ, { material: quartzM });
    B.push([IL - 0.1, TOP - 0.15, 0.62, IX, (TOP - 0.05) / 2 + 0.05, IZ + 0.12, GAP], [IL - 0.12, 0.1, 0.58, IX, 0.05, IZ + 0.12, BLACK]);
    for (let x = IX - IL / 2 + 0.1; x < IX + IL / 2 - 0.1; x += 0.05) B.push([0.04, TOP - 0.16, 0.025, x + 0.025, (TOP - 0.06) / 2 + 0.05, IZ - 0.2, OAK]);
    for (let i = 0; i < 6; i++) {
      const xa = IX - IL / 2 + 0.05 + i * (IL - 0.1) / 6, xb = xa + (IL - 0.1) / 6;
      B.push([xb - xa - 0.008, TOP - 0.16, 0.02, (xa + xb) / 2, (TOP - 0.06) / 2 + 0.05, IZ + 0.44, GREEN]);
      M.push([0.012, 0.16, 0.02, i % 2 ? xa + 0.05 : xb - 0.05, 0.7, IZ + 0.465, BRASS]);
    }
    // On the island: fruit bowl, a little plant, napkins, a tray with mugs, someone's laptop sticker-side up.
    cyl(world, 0.2, 0.1, 0.09, '#e8e2d6', IX + 0.3, TOP + 0.045, IZ + 0.05, { seg: 24 });
    const FRUIT = ['#c0392b', '#e67e22', '#8bbf3c', '#e74c3c', '#f39c12', '#a3c94a', '#d35400'];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = i < 6 ? 0.1 : 0.03, f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(FRUIT[i % FRUIT.length], { roughness: 0.5 }));
      f.position.set(IX + 0.3 + Math.cos(a) * r, TOP + 0.1 + (i < 6 ? 0 : 0.05), IZ + 0.05 + Math.sin(a) * r); f.castShadow = true; world.add(f);
    }
    for (const dz of [-0.05, 0.05]) { const ba = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12, 2.2), mat('#f2c94c', { roughness: 0.6 })); ba.position.set(IX + 0.32, TOP + 0.16, IZ + dz); ba.rotation.set(0.3, 0, 2.6); world.add(ba); }
    smallPlant(world, IX - 1.2, TOP, IZ + 0.1);
    B.push([0.34, 0.015, 0.24, IX - 0.6, TOP + 0.008, IZ + 0.15, OAK], [0.14, 0.05, 0.14, IX + 1.1, TOP + 0.025, IZ + 0.2, '#f4f1ea'],
      [0.32, 0.012, 0.22, IX - 0.2, TOP + 0.006, IZ - 0.25, '#b9bcc0']);
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    for (let i = 0; i < 3; i++) cyl(world, 0.04, 0.035, 0.09, MUGS[i + 1], IX - 0.68 + i * 0.09, TOP + 0.06, IZ + 0.15);
    solid(IX, IZ, IL + 0.04, ID);
    for (const x of [IX - 1.2, IX, IX + 1.2]) pendant(x, IZ, { drop: 0.95, light: x === IX ? 12 : 0, shade: '#e9e4da' });

    // Stools on the south side, facing the island; sit-in-able, and idle sessions perch on them with a coffee.
    const stools = [];
    for (const x of [-16.75, -15.85, -14.95, -14.05]) {
      const g = new THREE.Group(); g.position.set(x, 0, 10.6); world.add(g);
      cyl(g, 0.19, 0.18, 0.05, OAK, 0, 0.665, 0, { seg: 24, mat: { roughness: 0.55 } });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = box(g, 0.025, 0.66, 0.025, BLACK, dx * 0.12, 0.32, dz * 0.12); l.rotation.set(-dz * 0.06, 0, dx * 0.06); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 24), mat(BLACK)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
      const st = addSeat(g, 'Stool', 0, SEATED_EYE + 0.24);
      g.traverse((o) => { if (o.isMesh) o.userData.seat = st; });
      stools.push({ x, z: 10.6 });
    }

    // Coffee machine you can use: click it and it grinds, pours into a cup on the drip tray, then leaves it there a while.
    const scr = makeScreen(world, 0.15, 0.085, 160, 90, CX, TOP + 0.36, CZ - 0.2575);
    scr.mesh.rotation.y = Math.PI;
    const cup = new THREE.Group(); cup.position.set(CX, TOP + 0.025, CZ - 0.25); cup.visible = false; world.add(cup);
    cyl(cup, 0.04, 0.032, 0.085, '#f4f1ea', 0, 0.0425, 0, { seg: 16 });
    const fill = cyl(cup, 0.036, 0.036, 0.004, '#5a3420', 0, 0.01, 0, { seg: 16, shadow: false });
    const steamTex = (() => { const t = makeCanvas(64, 64), g = t.ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); t.ctx.fillStyle = g; t.ctx.fillRect(0, 0, 64, 64); t.tex.needsUpdate = true; return t.tex; })();
    const steam = [0, 1, 2, 3].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); s.scale.setScalar(0.06); cup.add(s); s.userData.ph = i / 4; return s; });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.5), new THREE.MeshBasicMaterial()); hit.position.set(CX, TOP + 0.27, CZ - 0.03); hit.visible = false; world.add(hit);
    hit.userData = { action: 'coffee', reach: 3 };
    const brew = { t: -1, left: 0, served: 0 };
    let shown = '';
    function paint(txt, sub) {
      if (shown === txt + sub) return; shown = txt + sub;
      const { ctx } = scr; ctx.fillStyle = '#0e1013'; ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = '#f4efe4'; ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(txt, 80, 42);
      ctx.fillStyle = '#d9a441'; ctx.font = `400 15px ${FONT}`; ctx.fillText(sub, 80, 68); scr.tex.needsUpdate = true;
    }
    paint('Ready', 'flat white ▸');
    return {
      hit, stools,
      brewing: () => brew.t >= 0,
      brew(sound = true) { if (brew.t >= 0) return false; brew.t = 0; cup.visible = true; if (sound) sfx.espresso?.(); return true; },
      update(dt, t) {
        clock.forEach((m) => { m.material.emissiveIntensity = Math.floor(t) % 2 ? 1.6 : 1.3; });
        if (brew.t >= 0) {
          brew.t += dt;
          const k = brew.t;
          paint(k < 2.7 ? 'Grinding' : k < 7 ? 'Pouring' : 'Enjoy ☕', k < 7 ? '•'.repeat(1 + Math.floor(k * 2) % 3) : 'flat white');
          fill.position.y = 0.01 + 0.065 * sstep(3, 6.8, k); fill.material.color.set(k > 5.5 ? '#c79a6a' : '#5a3420');
          if (k > 7) { brew.t = -1; brew.left = 25; brew.served++; }
        } else if (brew.left > 0) {
          brew.left -= dt;
          if (brew.left <= 0) { cup.visible = false; paint('Ready', 'flat white ▸'); }
        }
        const hot = cup.visible ? (brew.t >= 0 ? sstep(3, 5, brew.t) : clamp(brew.left / 25, 0, 1)) : 0;
        for (const s of steam) {
          const u = (t * 0.35 + s.userData.ph) % 1;
          s.position.set(Math.sin(u * 9 + s.userData.ph * 6) * 0.015, 0.1 + u * 0.22, 0); s.scale.setScalar(0.05 + u * 0.08); s.material.opacity = hot * 0.5 * Math.sin(u * Math.PI);
        }
      },
    };
  })();
  {
    const plate = makeScreen(world, 0.9, 0.22, 360, 88, 9.4, 1.75, -3.47);
    plate.ctx.fillStyle = 'rgba(20,20,22,.85)'; plate.ctx.beginPath(); plate.ctx.roundRect(0, 0, 360, 88, 14); plate.ctx.fill();
    plate.ctx.font = `600 40px ${FONT}`; plate.ctx.fillStyle = '#fff'; plate.ctx.fillText(fit(plate.ctx, dash.officeName(), 310), 26, 58);
    plate.mesh.material.transparent = true; plate.tex.needsUpdate = true;
  }
  const OWNER = { x: 13, z: -11.6 };
  box(world, 3.4, 0.05, 1.0, '#2a2724', OWNER.x, 0.74, OWNER.z, { mat: { roughness: 0.35 } });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x - 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x + 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.46, 0.015, 0.15, '#3a3c40', OWNER.x, 0.77, OWNER.z + 0.27);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', OWNER.x + 0.75, 0.815, OWNER.z + 0.3);
  solid(OWNER.x, OWNER.z, 3.4, 1.0);
  officeChair(OWNER.x, OWNER.z + 1.15, Math.PI, '#1d1f22');
  const leftMon = monitor(world, 0.9, 0.5625, OWNER.x - 1.18, 0.765, OWNER.z - 0.12, 0.5);
  const usageScr = makeScreen(leftMon.g, 0.9, 0.5625, 800, 500, 0, leftMon.screenY, leftMon.screenZ);
  const rightMon = monitor(world, 0.9, 0.5625, OWNER.x + 1.18, 0.765, OWNER.z - 0.12, -0.5);
  const rosterScr = makeScreen(rightMon.g, 0.9, 0.5625, 800, 500, 0, rightMon.screenY, rightMon.screenZ);
  const wallTV = makeScreen(world, 3.4, 1.7, 1280, 640, OWNER.x, 2.42, -14.86);
  box(world, 3.5, 1.8, 0.06, '#111214', OWNER.x, 2.42, -14.9);
  sofa(19.3, -9, -Math.PI / 2, 2.4, '#3d3a36');
  plant(18.9, -14.3, 1.2); plant(6.6, -14.3);

  bookshelf(8.6, -14.7, 0, 2.4, 2.2, 5);
  art(17.4, 1.75, -14.92, 0, 1.6, 1.1);
  smallPlant(world, 16.6, 1.1, -3.0);
  pendant(13, -10.6, { drop: 0.85, light: 12, shade: '#d97757' });
  floorLamp(19.3, -10.8, 10);
  smallPlant(world, OWNER.x - 1.5, 0.765, OWNER.z + 0.3);
  // Lived-in bits: desk clutter kept below the screens, a credenza under the TV, books and a whiteboard along the glass,
  // a lounge corner by the windows, a round table for 1:1s and a coat stand by the door.
  {
    const vcM = mat('#ffffff', { vertexColors: true, roughness: 0.6 }), shinyM = mat('#ffffff', { vertexColors: true, roughness: 0.3, metalness: 0.7 });
    const dy = 0.765, dx = OWNER.x, dz = OWNER.z;
    box(world, 0.21, 0.015, 0.28, '#2b3650', dx - 0.62, dy + 0.008, dz + 0.24).rotation.y = 0.15;   // notebook and pen
    cyl(world, 0.006, 0.006, 0.14, '#d97757', dx - 0.47, dy + 0.007, dz + 0.24, { seg: 6 }).rotation.x = Math.PI / 2;
    box(world, 0.075, 0.008, 0.15, '#1c1c1e', dx + 0.45, dy + 0.004, dz + 0.3).rotation.y = -0.2;   // phone
    // Headphones on a stand at the front corner.
    world.add(mergedBoxes([[0.12, 0.012, 0.1, dx + 1.56, dy + 0.006, dz + 0.36, '#2a2c30'], [0.015, 0.24, 0.015, dx + 1.56, dy + 0.13, dz + 0.36, '#2a2c30'],
      [0.03, 0.03, 0.17, dx + 1.56, dy + 0.255, dz + 0.36, '#1c1c1e']], vcM));
    for (const s of [-1, 1]) {
      box(world, 0.018, 0.17, 0.02, '#1c1c1e', dx + 1.56, dy + 0.18, dz + 0.36 + s * 0.085);
      box(world, 0.06, 0.08, 0.035, '#3a3c40', dx + 1.56, dy + 0.11, dz + 0.36 + s * 0.095);
    }

    // Credenza under the TV: four doors, a speaker, books, a framed photo, a trophy and an espresso machine.
    const cz = -14.6, cy = 0.76;
    const cred = [[3.2, 0.62, 0.46, dx, 0.41, cz, '#5e4029'], [3.26, 0.04, 0.5, dx, 0.74, cz, '#3a281a']];
    for (const fx of [-1.6, 1.6]) for (const fz of [-0.18, 0.18]) cred.push([0.04, 0.1, 0.04, dx + fx * 0.95, 0.05, cz + fz, '#2f3236']);
    for (let i = 1; i < 4; i++) cred.push([0.01, 0.56, 0.005, dx - 1.6 + i * 0.8, 0.41, cz + 0.232, '#2a1d12']);
    for (let i = 0; i < 4; i++) cred.push([0.012, 0.16, 0.02, dx - 1.6 + i * 0.8 + (i % 2 ? 0.07 : 0.73), 0.5, cz + 0.24, '#b8bcc2']);
    world.add(mergedBoxes(cred, vcM));
    solid(dx, cz, 3.26, 0.5);
    world.add(mergedBoxes([[0.18, 0.3, 0.18, dx - 1.38, cy + 0.15, cz, '#1c1c1e'], [0.2, 0.032, 0.26, dx - 0.95, cy + 0.016, cz, '#8c3b2f'],
      [0.18, 0.03, 0.24, dx - 0.95, cy + 0.047, cz, '#e7dcc8'], [0.19, 0.035, 0.25, dx - 0.95, cy + 0.08, cz, '#2f5d62'],
      [0.015, 0.16, 0.12, dx - 0.62, cy + 0.08, cz, '#2a2c30'], [0.015, 0.16, 0.12, dx - 0.27, cy + 0.08, cz, '#2a2c30']], vcM));
    cyl(world, 0.05, 0.05, 0.01, '#3a3c40', dx - 1.38, cy + 0.2, cz + 0.091, { seg: 20 }).rotation.x = Math.PI / 2;   // speaker cone
    cyl(world, 0.025, 0.025, 0.01, '#3a3c40', dx - 1.38, cy + 0.07, cz + 0.091, { seg: 16 }).rotation.x = Math.PI / 2;
    world.add(mergedBoxes(['#3f4a6b', '#d9a441', '#1f2a33', '#a35d7a', '#6b8e4e', '#c26a3d'].map((c, i) => [0.035, 0.2 + (i % 3) * 0.025, 0.15, dx - 0.585 + 0.045 * (i + 1), cy + 0.1 + (i % 3) * 0.0125, cz, c]), vcM));
    smallPlant(world, dx - 0.95, cy + 0.1, cz);
    {
      const g = new THREE.Group(); g.position.set(dx + 0.3, cy, cz + 0.02); g.rotation.set(-0.15, -0.25, 0); world.add(g);
      box(g, 0.24, 0.3, 0.02, '#1c1a18', 0, 0.15, 0);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), new THREE.MeshStandardMaterial({ map: artTexture(ctx.artSeed++, 0.75), roughness: 0.9 }));
      pic.position.set(0, 0.15, 0.011); g.add(pic);
    }
    // Trophy: plinth, stem, cup.
    world.add(mergedBoxes([[0.12, 0.06, 0.12, dx + 0.75, cy + 0.03, cz, '#2a2724']], vcM));
    cyl(world, 0.012, 0.02, 0.08, '#d9a441', dx + 0.75, cy + 0.1, cz, { mat: { metalness: 0.9, roughness: 0.25 } });
    cyl(world, 0.07, 0.03, 0.1, '#d9a441', dx + 0.75, cy + 0.19, cz, { mat: { metalness: 0.9, roughness: 0.25 } });
    // Espresso machine with a cup on the drip tray.
    world.add(mergedBoxes([[0.32, 0.36, 0.3, dx + 1.3, cy + 0.18, cz - 0.03, '#b8bcc2'], [0.24, 0.04, 0.12, dx + 1.3, cy + 0.32, cz + 0.16, '#2a2c30'],
      [0.24, 0.02, 0.12, dx + 1.3, cy + 0.04, cz + 0.16, '#2a2c30'], [0.06, 0.05, 0.06, dx + 1.3, cy + 0.27, cz + 0.17, '#1c1c1e']], shinyM));
    cyl(world, 0.03, 0.025, 0.06, '#f4f1ea', dx + 1.3, cy + 0.08, cz + 0.17, { seg: 12 });

    // Neon over the bookshelf, a tall plant beside it.
    const neon = makeScreen(world, 1.8, 0.45, 720, 180, 8.6, 2.75, -14.86);
    neon.ctx.clearRect(0, 0, 720, 180);
    neon.ctx.font = `italic 700 96px ${FONT}`; neon.ctx.textAlign = 'center';
    neon.ctx.shadowColor = '#ff8a4c'; neon.ctx.shadowBlur = 30; neon.ctx.fillStyle = '#ffe2c8';
    neon.ctx.fillText('stay curious', 360, 120); neon.ctx.fillText('stay curious', 360, 120);
    neon.mesh.material.transparent = true; neon.tex.needsUpdate = true;
    plant(10.4, -14.4, 0.9);

    // Along the west glass: a tall bookcase, a rolling whiteboard, the coat stand by the door. Kept clear of the blind.
    bookshelf(6.38, -12.4, Math.PI / 2, 2.2, 2.2, 5);
    const wg = new THREE.Group(); wg.position.set(6.5, 0, -8.6); wg.rotation.y = Math.PI / 2; world.add(wg);
    wg.add(mergedBoxes([[1.76, 1.02, 0.04, 0, 1.4, -0.01, '#b9bcc0'], [0.04, 1.85, 0.04, -0.86, 0.93, -0.03, '#8d9399'], [0.04, 1.85, 0.04, 0.86, 0.93, -0.03, '#8d9399'],
      [0.06, 0.04, 0.5, -0.86, 0.08, -0.03, '#5a5f66'], [0.06, 0.04, 0.5, 0.86, 0.08, -0.03, '#5a5f66'], [1.7, 0.03, 0.06, 0, 0.87, 0.03, '#b9bcc0']],
    mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
    markerBoard('office', 'whiteboard', makeScreen(wg, 1.7, 0.96, 768, 434, 0, 1.4, 0.012), (c) => {
      const node = (x, y, t, col) => { c.strokeStyle = col; c.strokeRect(x - 90, y - 34, 180, 68); c.fillStyle = col; c.font = `600 30px "Marker Felt", "Comic Sans MS", ${FONT}`; c.textAlign = 'center'; c.fillText(t, x, y + 10); };
      node(130, 90, '~/.claude', '#1f6fd1'); node(384, 90, 'server', '#2e8b57'); node(638, 90, 'office', '#c0392b');
      c.strokeStyle = '#333';
      for (const x of [220, 474]) { c.beginPath(); c.moveTo(x, 90); c.lineTo(x + 70, 90); c.lineTo(x + 56, 80); c.moveTo(x + 70, 90); c.lineTo(x + 56, 100); c.stroke(); }
      c.textAlign = 'left'; c.fillStyle = '#333'; c.font = `400 28px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['Q4', '- hire 2 engineers', '- launch v2 ✦', '- inbox zero (lol)'].forEach((t, i) => c.fillText(t, 50, 200 + i * 52));
      c.strokeStyle = '#d97757'; c.beginPath(); c.ellipse(560, 300, 140, 60, 0.1, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#d97757'; c.fillText('1:1s Thu', 500, 310);
    });
    solid(6.5, -8.6, 0.5, 1.8);
    {
      const x = 6.45, z = -5.3;
      cyl(world, 0.22, 0.24, 0.03, '#2a2a2a', x, 0.015, z, { seg: 20 }); cyl(world, 0.02, 0.025, 1.8, '#5a3d28', x, 0.9, z);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; box(world, 0.16, 0.02, 0.02, '#2a2a2a', x + Math.cos(a) * 0.07, 1.72, z + Math.sin(a) * 0.07).rotation.y = -a; }
      box(world, 0.16, 0.75, 0.34, '#1f2a44', x + 0.09, 1.32, z - 0.02).rotation.x = 0.05;   // a coat
      box(world, 0.05, 0.12, 0.3, '#2a2724', x - 0.08, 1.6, z + 0.02);                       // a bag strap
      solid(x, z, 0.4, 0.4);
    }

    // Lounge corner by the windows: two armchairs across a coffee table from the sofa, on a rug.
    rug(16.7, 19.85, -11.4, -6.6, '#e2d6c0', '#8b5a3c');
    sofa(17.9, -10.65, 0, 1.05, '#8b5a3c'); sofa(17.9, -7.35, Math.PI, 1.05, '#8b5a3c');
    box(world, 0.9, 0.04, 0.55, '#8a6a4a', 17.9, 0.4, -9, { mat: { roughness: 0.5 } });
    for (const [ox, oz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) box(world, 0.035, 0.38, 0.035, '', 17.9 + ox, 0.19, -9 + oz, { material: legM });
    world.add(mergedBoxes([[0.24, 0.03, 0.18, 17.75, 0.435, -9.08, '#1f2a33'], [0.22, 0.025, 0.17, 17.76, 0.462, -9.07, '#d9a441']], vcM));
    cyl(world, 0.04, 0.035, 0.1, '#2f6f8f', 18.15, 0.47, -8.9);
    smallPlant(world, 17.98, 0.42, -9.15);
    solid(17.9, -9, 0.9, 0.55);
    plant(19.3, -4.2, 1.35);

    // Round table for 1:1s.
    const tx = 15.4, tz = -5.5;
    cyl(world, 0.55, 0.55, 0.04, '#f2efe9', tx, 0.74, tz, { seg: 32 });
    cyl(world, 0.04, 0.04, 0.72, '#2f3236', tx, 0.36, tz);
    cyl(world, 0.28, 0.28, 0.03, '#2f3236', tx, 0.015, tz);
    solid(tx, tz, 1.1, 1.1);
    for (const a of [Math.PI / 2, -Math.PI / 2, 0]) officeChair(tx - Math.sin(a) * 0.85, tz - Math.cos(a) * 0.85, a, '#4b5a6a');
    box(world, 0.21, 0.015, 0.28, '#e7dcc8', tx - 0.18, 0.768, tz + 0.05).rotation.y = -0.3;
    cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', tx + 0.22, 0.81, tz - 0.12);
    pendant(tx, tz, { drop: 1.05, shade: '#2b3650' });
  }

  // Guitar corner, under the art: a cherry Les Paul, a dark blue Strat (maroon tortoise guard, gold hardware, maple board) and an
  // HSS Strat wrapped in copper tape (black guard, rosewood board), each on a stand, and a little practice amp plugged into the
  // copper one. Bodies are extruded outlines, fretboards one canvas each; small hardware is merged per guitar.
  {
    const UPV = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const add = (parent, geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
    const rodGeo = (a, b, r, seg = 6) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      return new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    const czGeo = (r, h, x, y, z0, seg = 16, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg).rotateX(Math.PI / 2).translate(x, y, z0 + h / 2);   // axis along z, from z0 up
    const bGeo = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const merged = (parent, list, m) => list.length && add(parent, mergeGeometries(list), m);
    // Closed smooth outline through points; optional scale about (0, cy).
    const outline = (pts, k = 1, cy = 0) => {
      const v = pts.map(([x, y]) => new THREE.Vector2(x * k, (y - cy) * k + cy)), s = new THREE.Shape();
      s.moveTo(v[0].x, v[0].y);
      if (pts.length > 40) v.slice(1).forEach((p) => s.lineTo(p.x, p.y)); else s.splineThru([...v.slice(1), v[0]]);   // traced outlines are dense already
      return s;
    };
    const rrect = (hw, hh, r) => {
      const s = new THREE.Shape();
      s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r); s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
      s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r); s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
      return s;
    };
    const slab = (shape, z0, depth, bevel = 0, curve = 6) => new THREE.ExtrudeGeometry(shape, { depth, curveSegments: curve, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 }).translate(0, 0, z0);
    const tex = (t, rx, ry, ox = 0.5, oy = 0) => { t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(rx, ry); t.tex.offset.set(ox, oy); t.tex.needsUpdate = true; return t.tex; };

    // Copper tape: strips laid across the body, each a slightly different tone, overlapping at darker seams; creases from
    // smoothing it round the curves, and tarnish. A matching roughness map keeps the tape shiny and the seams and tarnish duller.
    const copper = (() => {
      const W = 512, H = 704, m = makeCanvas(W, H), r = makeCanvas(W, H), c = m.ctx, q = r.ctx, R = rng(808);
      c.fillStyle = '#d0915c'; c.fillRect(0, 0, W, H); q.fillStyle = 'rgb(0,64,0)'; q.fillRect(0, 0, W, H);
      // Strips run diagonally (lower bass to upper treble): draw them in a rotated frame big enough to cover the canvas.
      const D = Math.hypot(W, H) / 2 + 30;
      for (const ctx of [c, q]) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.68); }
      for (let y = -D; y < D;) {
        const sh = 58 + R() * 36, tilt = (R() - 0.5) * 12, edge = (yy) => { c.beginPath(); c.moveTo(-D, yy); c.lineTo(D, yy + tilt); };
        c.fillStyle = `hsl(${22 + R() * 7} ${50 + R() * 14}% ${54 + R() * 11}%)`;
        c.beginPath(); c.moveTo(-D, y); c.lineTo(D, y + tilt); c.lineTo(D, y + tilt + sh); c.lineTo(-D, y + sh); c.closePath(); c.fill();
        const g = c.createLinearGradient(0, y, 0, y + sh);
        g.addColorStop(0, 'rgba(255,222,185,.2)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,20,0,.2)');
        c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(80,36,12,.5)'; c.lineWidth = 2.5; edge(y + sh); c.stroke();
        c.strokeStyle = 'rgba(255,225,190,.45)'; c.lineWidth = 1; edge(y + sh - 2.5); c.stroke();
        q.strokeStyle = 'rgb(0,150,0)'; q.lineWidth = 4; q.beginPath(); q.moveTo(-D, y + sh); q.lineTo(D, y + tilt + sh); q.stroke();
        y += sh - 4;
      }
      for (const ctx of [c, q]) ctx.restore();
      for (let i = 0; i < 320; i++) {
        const x = R() * W, y = R() * H, a = R() * Math.PI, l = 5 + R() * 30, x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
        c.strokeStyle = R() < 0.5 ? 'rgba(255,226,190,.3)' : 'rgba(60,25,8,.32)'; c.lineWidth = 0.8 + R() * 1.2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x1, y1); c.stroke();
        q.strokeStyle = 'rgb(0,125,0)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x, y); q.lineTo(x1, y1); q.stroke();
      }
      for (let i = 0; i < 80; i++) {
        const x = R() * W, y = R() * H, rad = 8 + R() * 42, green = R() < 0.12;
        for (const [ctx, col, a] of [[c, green ? '70,125,95' : '70,32,10', green ? 0.3 : 0.24], [q, '0,205,0', 0.55]]) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
      r.tex.colorSpace = THREE.NoColorSpace;
      return new THREE.MeshStandardMaterial({ map: tex(m, 1 / 0.34, 1 / 0.46), roughnessMap: tex(r, 1 / 0.34, 1 / 0.46), metalness: 1, roughness: 1, envMapIntensity: 1.4 });
    })();
    // Dark blue stain over ash, grain showing through; and a cherry finish over flamed maple. Both under a clear coat.
    const woodBody = (base, dark, light, seed, flame) => {
      const W = 512, H = 704, t = makeCanvas(W, H), c = t.ctx, R = rng(seed);
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 110; i++) {
        const x0 = R() * W, amp = 3 + R() * 9, f = 0.004 + R() * 0.01, ph = R() * 6;
        c.strokeStyle = R() < 0.6 ? dark : light; c.globalAlpha = 0.2 + R() * 0.35; c.lineWidth = 0.6 + R() * 2.4;
        c.beginPath(); for (let y = 0; y <= H; y += 16) c.lineTo(x0 + Math.sin(y * f + ph) * amp, y); c.stroke();
      }
      c.globalAlpha = 0.28; c.strokeStyle = dark; c.lineWidth = 2;   // cathedral figure
      for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(W / 2 + 20, H * 0.62, 30 + k * 26, 110 + k * 40, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); }
      if (flame) for (let y = 0; y < H; y += 5 + R() * 9) {
        c.globalAlpha = 0.1 + R() * 0.16; c.strokeStyle = R() < 0.5 ? light : dark; c.lineWidth = 3 + R() * 6;
        c.beginPath(); for (let x = 0; x <= W; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 4); c.stroke();
      }
      c.globalAlpha = 1;
      return new THREE.MeshPhysicalMaterial({ map: tex(t, 1 / 0.34, 1 / 0.46), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
    };
    const blueM = woodBody('#15275a', '#0a1430', '#2c4c8f', 41, false), cherryM = woodBody('#8c0b16', '#4a0208', '#c62233', 43, true);
    const tortM = (() => {
      const t = makeCanvas(256, 256), c = t.ctx, R = rng(47);
      c.fillStyle = '#5e1612'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 170; i++) {
        const x = R() * 256, y = R() * 256, rad = 6 + R() * 30, [col, a] = [['30,6,6', 0.7], ['120,32,20', 0.55], ['176,74,38', 0.45], ['70,12,10', 0.6]][Math.floor(R() * 4)];
        const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      return new THREE.MeshPhysicalMaterial({ map: tex(t, 1 / 0.13, 1 / 0.13), roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1 });
    })();
    // Fretboard: wood grain, nickel frets at the real spacing, dot (or trapezoid) inlays. Mapped in metres along the board.
    function boardTex(rose, trap, S, Ny, E) {
      const W = 128, H = 1024, t = makeCanvas(W, H), c = t.ctx, R = rng(rose ? 31 : 37), L = Ny - E;
      c.fillStyle = rose ? '#3a2216' : '#d4ad72'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = R() * W;
        c.strokeStyle = rose ? (R() < 0.5 ? 'rgba(14,7,3,.45)' : 'rgba(95,58,36,.4)') : `rgba(150,104,52,${0.12 + R() * 0.22})`; c.lineWidth = 0.5 + R() * 1.6;
        c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + R() * 6 - 3, H * 0.3, x + R() * 6 - 3, H * 0.7, x + R() * 4 - 2, H); c.stroke();
      }
      const fret = (n) => Ny - S * (1 - 2 ** (-n / 12)), py = (y) => (1 - (y - E) / L) * H, px = (x) => (x / 0.06 + 0.5) * W;
      for (let n = 1; n <= 22; n++) { const y = py(fret(n)); c.fillStyle = '#dcdde0'; c.fillRect(0, y - 1.6, W, 3.2); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, y + 1.6, W, 1); }
      c.fillStyle = rose ? '#efe9dc' : '#1a1a1a';
      for (const n of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
        const y = py((fret(n - 1) + fret(n)) / 2), hh = Math.abs(py(fret(n - 1)) - py(fret(n))) * 0.3, hw = 0.017 + n * 0.00025;
        if (trap) { c.beginPath(); c.moveTo(px(-hw * 0.82), y - hh); c.lineTo(px(hw * 0.82), y - hh); c.lineTo(px(hw), y + hh); c.lineTo(px(-hw), y + hh); c.fill(); }
        else for (const dx of n === 12 ? [-0.011, 0.011] : [0]) { c.beginPath(); c.arc(px(dx), y, 6, 0, Math.PI * 2); c.fill(); }
      }
      return new THREE.MeshStandardMaterial({ map: tex(t, 1 / 0.06, 1 / L, 0.5, -E / L), roughness: rose ? 0.75 : 0.35 });
    }

    const chromeM = mat('#eceef0', { metalness: 1, roughness: 0.15 }), goldM = mat('#e2b85c', { metalness: 1, roughness: 0.22 }), steelM = mat('#8f9297', { metalness: 1, roughness: 0.35 });
    const blackM = mat('#111111', { roughness: 0.3 }), ivoryM = mat('#ece2c4', { roughness: 0.4 }), stringM = mat('#d7d9dc', { metalness: 1, roughness: 0.3 });
    // Body outlines traced from full-size templates (cho2/guitar-shape, CC BY-SA 4.0), in mm: butt end at y 0, neck centreline x 0,
    // bass side -x. Strat 457 x 321 mm, neck pocket edge 396 mm up; Les Paul 438 x 331 mm (waist 186, upper bout 234), neck joint 438 up.
    const mm = (t) => t.split(/\s+/).map((p) => p.split(',').map((v) => v / 1000));
    const STRAT = mm(`-125,228 -130,217 -134,207 -138,197 -143,186 -146,175 -150,164 -153,154 -156,143 -158,132 -160,120 -162,109 -162,97 -162,85 -160,73 -157,62
      -152,52 -146,43 -138,34 -129,26 -120,19 -110,14 -100,10 -89,6 -78,4 -66,2 -54,1 -42,0 -30,0 -18,0 -6,0 7,0 19,0 32,0 44,0 56,1 68,2 79,4
      90,7 101,11 111,16 121,22 130,29 138,38 145,47 150,57 154,68 156,80 158,91 158,103 157,115 155,127 152,138 149,149 145,160 142,170 137,180
      133,191 128,201 124,211 119,221 115,232 112,243 112,255 114,266 117,277 121,288 125,298 130,308 133,319 136,331 137,342 137,354 136,366
      132,376 127,386 117,393 106,392 98,384 95,373 92,362 88,351 81,342 71,336 60,333 48,334 37,338 28,344 27,356 27,368 27,380 27,392 18,397
      6,397 -7,397 -19,397 -29,393 -35,383 -45,378 -57,378 -67,382 -77,389 -84,398 -89,409 -91,420 -92,432 -93,444 -99,453 -109,457 -120,453
      -128,445 -134,435 -137,424 -140,413 -140,401 -140,389 -140,377 -138,366 -136,354 -133,343 -130,332 -126,322 -122,311 -119,300 -116,289
      -115,277 -115,265 -116,254 -120,243 -123,232`);
    const LP = mm(`29,438 17,438 5,438 -8,438 -20,438 -32,438 -44,436 -56,434 -68,431 -79,426 -89,420 -98,412 -106,403 -112,393 -116,381 -118,370 -117,358
      -114,346 -109,334 -104,324 -98,312 -94,301 -92,289 -93,277 -98,266 -105,256 -112,247 -120,238 -128,229 -135,220 -142,210 -148,199 -153,188
      -158,177 -160,165 -162,154 -163,141 -163,129 -162,117 -160,105 -156,94 -152,82 -147,71 -141,61 -134,52 -126,43 -117,35 -107,28 -97,21 -86,16
      -75,10 -63,6 -52,4 -40,2 -28,1 -16,0 -4,0 9,0 21,0 33,1 45,2 57,5 68,8 80,12 91,16 102,22 112,29 121,36 130,44 138,53 146,62 152,72 157,83
      161,95 165,106 167,118 168,130 168,142 166,155 164,166 161,178 157,189 152,200 145,211 138,221 131,230 123,239 115,248 107,257 100,266
      94,277 92,289 94,301 98,312 103,323 109,334 113,345 117,357 118,369 117,381 111,391 100,392 93,382 85,373 74,368 62,366 50,369 40,375 34,385
      31,396 30,408 29,421 29,433`);
    // Strat scratchplate: 9 mm in from the treble edge and cutaways, part way up the treble horn, clear of the bass horn,
    // ~25 mm in down the bass side, across just above the bridge, and a lobe down round the controls.
    const PG = mm(`148,108 147,119 145,130 142,141 139,152 135,162 131,172 127,182 122,192 118,202 113,212 108,223 106,229 104,235 103,242 103,249 103,255
      104,262 105,268 106,274 110,286 115,296 119,306 123,316 126,327 128,338 128,348 128,358 126,368 104,371 103,365 101,358 98,353 96,347 92,341
      87,336 81,331 74,328 68,325 61,324 53,324 46,325 39,327 33,329 30,360 -30,360 -29,376 -36,372 -43,369 -51,369 -58,370 -65,372 -72,374
      -109,333 -103,324 -100,319 -97,312 -95,307 -93,301 -92,294 -90,286 -90,279 -89,271 -90,264 -90,256 -92,248 -94,242 -96,235 -98,229 -100,222
      -105,212 -103,215 -92,197 -75,179 -52,170 -20,168 20,168 50,167 68,146 82,124 96,103 112,93 130,94`);
    // Les Paul's raised guard: a narrow teardrop from under the cutaway down beside the bridge pickup.
    const LPG = mm(`44,355 52,357 62,358 72,361 82,366 90,372 97,374 102,366 103,350 100,330 90,305 83,280 75,255 66,235 56,228 49,238 45,265 44,310`);
    const SHEAD = [[-0.0215, 0], [-0.026, 0.04], [-0.03, 0.1], [-0.034, 0.15], [-0.036, 0.175], [-0.028, 0.192], [-0.008, 0.196], [0.018, 0.19], [0.042, 0.178],
      [0.052, 0.162], [0.045, 0.148], [0.026, 0.13], [0.016, 0.1], [0.016, 0.05], [0.0215, 0.008]];
    const LHEAD = [[-0.0215, 0], [-0.034, 0.05], [-0.045, 0.12], [-0.047, 0.168], [-0.038, 0.18], [-0.015, 0.176], [0, 0.168], [0.015, 0.176], [0.038, 0.18],
      [0.047, 0.168], [0.045, 0.12], [0.034, 0.05], [0.0215, 0.002]];

    // A guitar standing upright, front facing +z, bass side on the left, body bottom at y 0. Returns the group and its output jack.
    function guitar(o) {
      const g = new THREE.Group(), strat = o.kind === 'strat', S = strat ? 0.648 : 0.628, Ny = strat ? 0.785 : 0.81, By = Ny - S, FZ = strat ? 0.0225 : 0.0275;
      const E = Ny - S * (1 - 2 ** (-22 / 12)) - 0.006, wN = 0.043, wE = strat ? 0.057 : 0.056;
      const hw = [], poles = [], knobs = [], tips = [], blacks = [], strings = [];
      const xn = (i) => -0.0175 + i * 0.007, xb = (i) => -0.026 + i * 0.0104, xAt = (i, y) => lerp(xb(i), xn(i), (y - By) / (Ny - By));
      // Body and scratchplate.
      if (strat) {
        add(g, slab(outline(STRAT), -0.0165, 0.033, 0.006), o.body);
        add(g, slab(outline(PG), FZ, 0.0025), o.guard);
      } else {
        add(g, slab(outline(LP), -0.022, 0.04, 0.0015), o.body);
        add(g, slab(outline(LP), 0.0195, 0.004), [o.body, ivoryM]);                 // cream binding round the top
        add(g, slab(outline(LP, 0.86, 0.21), 0.0175, 0.002, 0.008), o.body);          // the carved top's arch
        add(g, slab(outline(LPG), FZ + 0.006, 0.0018), ivoryM);                      // raised pickguard
        hw.push(bGeo(0.004, 0.006, 0.006, 0.098, 0.363, FZ + 0.006));
      }
      // Neck, fretboard (bound on the Les Paul), nut.
      const n0 = strat ? 0.3 : 0.33;
      add(g, new THREE.CylinderGeometry(0.0215, 0.028, Ny - n0, 18, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.85).translate(0, (Ny + n0) / 2, FZ), o.neck);
      const fb = new THREE.Shape([V(-wE / 2, E), V(wE / 2, E), V(wN / 2, Ny), V(-wN / 2, Ny)].map((p) => new THREE.Vector2(p.x, p.y)));
      add(g, slab(fb, FZ, 0.006), [boardTex(o.board === 'rose', !strat, S, Ny, E), strat ? mat(o.board === 'rose' ? '#3a2216' : '#e0bd84', { roughness: 0.5 }) : ivoryM]);
      add(g, bGeo(wN, 0.005, 0.009, 0, Ny - 0.0025, FZ + 0.0045), ivoryM);
      // Headstock: Strat flat, six in a line on the bass side; Les Paul angled back, three a side.
      const hsM = new THREE.Matrix4().makeRotationX(strat ? 0 : -0.24).setPosition(0, Ny, FZ - (strat ? 0 : 0.002));
      add(g, slab(outline(strat ? SHEAD : LHEAD), -0.013, 0.013, 0.0015).applyMatrix4(hsM), strat ? o.neck : [blackM, o.neck]);
      const posts = strat ? [0, 1, 2, 3, 4, 5].map((i) => [-0.014 - i * 0.0016, 0.045 + i * 0.025, -1])
        : [[-0.028, 0.06, -1], [-0.032, 0.095, -1], [-0.035, 0.13, -1], [0.035, 0.13, 1], [0.032, 0.095, 1], [0.028, 0.06, 1]];
      const keys = [];
      for (const [px, py, side] of posts) {
        const hsList = [czGeo(0.0034, 0.012, px, py, 0), czGeo(0.0052, 0.0015, px, py, 0), bGeo(0.014, 0.016, 0.011, px + side * 0.004, py, -0.0205)];
        const out = strat ? -0.058 : side * 0.07;
        hsList.push(rodGeo(V(px + side * 0.011, py, -0.0185), V(out - side * 0.004, py, -0.0185), 0.0015));
        for (const h of hsList) hw.push(h.applyMatrix4(hsM));
        keys.push(new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 16).scale(1, 1, 0.7).translate(out, py, -0.0185).applyMatrix4(hsM));
      }
      if (!strat) {   // bell truss rod cover
        add(g, slab(rrect(0.011, 0.016, 0.006), 0.0005, 0.0012).translate(0, 0.03, 0).applyMatrix4(hsM), ivoryM);
        add(g, slab(rrect(0.0095, 0.0145, 0.005), 0.0012, 0.0012).translate(0, 0.03, 0).applyMatrix4(hsM), blackM);
      }
      // Pickups: chrome or plastic covers with a row of pole pieces each.
      const top = FZ + (strat ? 0.0025 : 0.003);
      const pickup = (kind, y, ang) => {
        const hb = kind === 'H', geo = slab(hb ? rrect(0.034, 0.018, 0.004) : rrect(0.0405, 0.0082, 0.0078), top + 0.001, 0.005, 0.001, 4);
        add(g, geo.rotateZ(ang).translate(0, y, 0), o.cover);
        for (let i = 0; i < 6; i++) {
          const xp = xAt(i, y), oy = hb ? 0.0075 : 0;
          poles.push(czGeo(hb ? 0.0022 : 0.0025, 0.001, xp * Math.cos(ang) - oy * Math.sin(ang), y + xp * Math.sin(ang) + oy * Math.cos(ang), top + 0.007));
        }
      };
      if (strat) {
        o.pickups.forEach((k, i) => pickup(k, By + [0.166, 0.105, 0.048][i], i < 2 ? 0 : k === 'H' ? -0.05 : -0.17));
        // Bridge: a vintage trem (plate, six saddles, the arm swung out to the treble side), or a hardtail: a heavier plate
        // with a raised back lip, strings through the body, no arm.
        if (o.hardtail) {
          hw.push(bGeo(0.07, 0.05, 0.004, 0, By - 0.006, FZ + 0.002), bGeo(0.07, 0.006, 0.012, 0, By - 0.028, FZ + 0.006));
          for (let i = 0; i < 6; i++) hw.push(bGeo(0.0092, 0.02, 0.009, xb(i), By - 0.002, FZ + 0.0085));
        } else {
          hw.push(bGeo(0.072, 0.042, 0.003, 0, By - 0.004, FZ + 0.0015));
          for (let i = 0; i < 6; i++) hw.push(bGeo(0.0092, 0.02, 0.01, xb(i), By - 0.004, FZ + 0.0075));
          hw.push(rodGeo(V(0.031, By - 0.02, FZ + 0.003), V(0.033, By - 0.022, FZ + 0.03), 0.0018), rodGeo(V(0.033, By - 0.022, FZ + 0.03), V(0.085, By - 0.145, FZ + 0.042), 0.0018));
          tips.push(rodGeo(V(0.075, By - 0.12, FZ + 0.0395), V(0.087, By - 0.15, FZ + 0.0425), 0.0035, 10));
        }
        for (const [x, y] of [[0.068, 0.176], [0.094, 0.152], [0.115, 0.124]]) knobs.push(czGeo(0.0105, 0.016, x, y, top, 20, 0.0118));
        hw.push(rodGeo(V(0.085, 0.218, top), V(0.088, 0.214, top + 0.014), 0.0012));
        tips.push(czGeo(0.003, 0.008, 0.088, 0.214, top + 0.012, 10));
        hw.push(new THREE.CylinderGeometry(0.0115, 0.0115, 0.003, 20).rotateX(Math.PI / 2).scale(1.35, 1, 1).translate(0.115, 0.075, FZ + 0.0015));
        blacks.push(czGeo(0.0045, 0.001, 0.115, 0.075, FZ + 0.003));
        hw.push(new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(0, -0.012, 0), new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(-0.109, 0.462, 0));
        for (let i = 0; i < 6; i++) {   // strings: saddle to nut to post
          const r = 0.00056 - i * 0.00005, [px, py] = posts[i], p = V(px + 0.0034, py, 0.008).applyMatrix4(hsM);
          strings.push(rodGeo(V(xb(i), By - 0.003, FZ + 0.013), V(xn(i), Ny - 0.001, FZ + 0.0085), r), rodGeo(V(xn(i), Ny - 0.001, FZ + 0.0085), p, r));
        }
      } else {
        for (const y of [By + 0.138, By + 0.033]) add(g, slab(rrect(0.043, 0.025, 0.006), FZ - 0.001, 0.004).translate(0, y, 0), ivoryM);   // mounting rings
        pickup('H', By + 0.138, 0); pickup('H', By + 0.033, 0);
        // Tune-o-matic bridge on its thumbwheels, stopbar tailpiece on studs.
        hw.push(bGeo(0.082, 0.012, 0.008, 0, By, FZ + 0.009));
        for (const s of [-1, 1]) hw.push(czGeo(0.0052, 0.006, s * 0.041, By, FZ), czGeo(0.0062, 0.009, s * 0.04, By - 0.049, FZ));
        hw.push(rodGeo(V(-0.044, By - 0.049, FZ + 0.008), V(0.044, By - 0.049, FZ + 0.008), 0.0055, 12));
        for (const [x, y] of [[0.072, 0.128], [0.112, 0.148], [0.085, 0.085], [0.125, 0.104]]) knobs.push(czGeo(0.0105, 0.016, x, y, FZ, 20, 0.012), czGeo(0.0145, 0.003, x, y, FZ, 20));
        add(g, slab(new THREE.Shape().absarc(0, 0, 0.017, 0, Math.PI * 2), FZ - 0.001, 0.002, 0, 16).translate(-0.085, 0.39, 0), ivoryM);   // toggle ring
        hw.push(rodGeo(V(-0.085, 0.39, FZ), V(-0.087, 0.395, FZ + 0.03), 0.0014));
        tips.push(czGeo(0.0042, 0.009, -0.087, 0.395, FZ + 0.026, 10));
        hw.push(new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(0, -0.012, 0));
        for (let i = 0; i < 6; i++) {   // strings: tailpiece over the bridge to nut to post
          const r = 0.00056 - i * 0.00005, [px, py] = posts[i < 3 ? i : 8 - i], p = V(px + (i < 3 ? 0.0034 : -0.0034), py, 0.008).applyMatrix4(hsM);
          const tail = V(xb(i) * 1.05, By - 0.049, FZ + 0.0135), br = V(xb(i), By, FZ + 0.0135), nut = V(xn(i), Ny - 0.001, FZ + 0.0085);
          strings.push(rodGeo(tail, br, r), rodGeo(br, nut, r), rodGeo(nut, p, r));
        }
      }
      merged(g, hw, o.hw); merged(g, poles, steelM); merged(g, knobs, o.knob); merged(g, tips, o.tip); merged(g, blacks, blackM); merged(g, keys, o.keys); merged(g, strings, stringM);
      return { g, jack: V(0.115, 0.075, FZ + 0.004) };
    }

    // An A-frame stand: a padded cradle under the body, a post up behind it to a yoke round the neck, three legs.
    const standM = mat('#1d1e20', { metalness: 0.6, roughness: 0.45 }), rubberM = mat('#121212', { roughness: 0.9 }), TILT = 0.21, Y0 = 0.17;
    function onStand(gu, x, z, yaw) {
      const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = yaw; world.add(root);
      gu.g.position.set(0, Y0, 0); gu.g.rotation.x = -TILT; root.add(gu.g);
      const at = (y, zz) => V(0, Y0 + y * Math.cos(TILT) + zz * Math.sin(TILT), -y * Math.sin(TILT) + zz * Math.cos(TILT)), yk = at(0.72, -0.004);
      const cy = Y0 - 0.006, metal = [], pads = [];
      for (const s of [-1, 1]) {
        pads.push(rodGeo(V(s * 0.085, cy, -0.05), V(s * 0.085, cy, 0.06), 0.008, 8), rodGeo(V(s * 0.085, cy, 0.06), V(s * 0.085, cy + 0.035, 0.066), 0.008, 8));
        metal.push(rodGeo(V(s * 0.085, cy - 0.01, 0.02), V(s * 0.19, 0.012, 0.16), 0.006, 8));
        pads.push(rodGeo(V(s * 0.03, yk.y, yk.z - 0.014), V(s * 0.03, yk.y + 0.012, yk.z + 0.03), 0.006, 8), new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10).translate(s * 0.19, 0.006, 0.16));
      }
      metal.push(rodGeo(V(-0.085, cy - 0.01, -0.035), V(0.085, cy - 0.01, -0.035), 0.006, 8), rodGeo(V(0, cy - 0.01, -0.06), V(0, yk.y - 0.008, yk.z - 0.016), 0.007, 8),
        rodGeo(V(-0.034, yk.y, yk.z - 0.016), V(0.034, yk.y, yk.z - 0.016), 0.005, 8), rodGeo(V(0, cy - 0.01, -0.06), V(0, 0.012, -0.29), 0.006, 8));
      merged(root, metal, standM); merged(root, pads, rubberM);
      add(root, new THREE.SphereGeometry(0.014, 10, 8).translate(0, 0.01, -0.29), rubberM);
      solid(x, z - 0.05, 0.46, 0.56);
      root.updateMatrixWorld(true);
      return root;
    }
    const lp = guitar({ kind: 'lp', body: cherryM, neck: mat('#5e1913', { roughness: 0.3 }), board: 'rose', hw: chromeM, cover: chromeM, knob: mat('#b8862e', { roughness: 0.3, metalness: 0.25 }), tip: ivoryM, keys: mat('#dfe0c4', { roughness: 0.35 }) });
    const blue = guitar({ kind: 'strat', body: blueM, guard: [tortM, ivoryM], neck: mat('#c9a066', { roughness: 0.45 }), board: 'maple', pickups: ['S', 'S', 'S'], hw: goldM, cover: mat('#efe6cf', { roughness: 0.45 }), knob: goldM, tip: ivoryM, keys: goldM });
    const cu = guitar({ kind: 'strat', body: copper, guard: [mat('#0d0d0d', { roughness: 0.25 }), mat('#e6e3dc')], neck: mat('#b88a52', { roughness: 0.45 }), board: 'rose', pickups: ['S', 'S', 'H'], hardtail: true, hw: chromeM, cover: chromeM, knob: blackM, tip: blackM, keys: chromeM });
    onStand(lp, 15.45, -14.5, 0.12); onStand(blue, 16.25, -14.5, 0); onStand(cu, 17.05, -14.5, -0.1);

    // Little practice amp: tolex, grille cloth, a chrome control strip with a red jewel light, a strap handle.
    const amp = new THREE.Group(), AX = 17.92, AZ = -14.48, AY = -0.45, AW = 0.36, AH = 0.31, AD = 0.2;
    amp.position.set(AX, 0, AZ); amp.rotation.y = AY; world.add(amp);
    box(amp, AW, AH, AD, '#1a1a1a', 0, AH / 2 + 0.012, 0, { mat: { roughness: 0.85 } });
    const grille = makeCanvas(256, 192);
    grille.ctx.fillStyle = '#b4ad9c'; grille.ctx.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 256; i += 3) { grille.ctx.fillStyle = i % 6 ? 'rgba(90,84,72,.45)' : 'rgba(235,230,215,.4)'; grille.ctx.fillRect(i, 0, 1.4, 192); grille.ctx.fillRect(0, i, 256, 1.4); }
    grille.tex.needsUpdate = true;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(AW - 0.04, 0.215), new THREE.MeshStandardMaterial({ map: grille.tex, roughness: 0.95 }));
    gm.position.set(0, 0.14, AD / 2 + 0.002); amp.add(gm);
    const trim = [[AW - 0.034, 0.005, 0.004, 0, 0.25, AD / 2 + 0.002], [AW - 0.034, 0.005, 0.004, 0, 0.03, AD / 2 + 0.002], [0.005, 0.225, 0.004, -(AW - 0.04) / 2, 0.14, AD / 2 + 0.002], [0.005, 0.225, 0.004, (AW - 0.04) / 2, 0.14, AD / 2 + 0.002]];
    amp.add(mergedBoxes(trim, ivoryM));
    box(amp, AW - 0.03, 0.045, 0.004, '#c9ccd1', 0, 0.287, AD / 2 + 0.002, { mat: { metalness: 0.9, roughness: 0.3 } });
    const ak = [];
    for (let i = 0; i < 6; i++) ak.push(czGeo(0.0085, 0.012, -0.095 + i * 0.045, 0.287, AD / 2 + 0.004, 16, 0.0095));
    merged(amp, ak, blackM);
    add(amp, czGeo(0.008, 0.004, -0.148, 0.287, AD / 2 + 0.004), chromeM); add(amp, czGeo(0.0045, 0.0005, -0.148, 0.287, AD / 2 + 0.0082), blackM);
    add(amp, new THREE.SphereGeometry(0.0065, 12, 8).translate(0.155, 0.287, AD / 2 + 0.005), mat('#ff3b1f', { emissive: '#ff2a12', emissiveIntensity: 1.6 }));
    const badge = makeCanvas(256, 64);
    badge.ctx.fillStyle = '#d9dcdf'; badge.ctx.beginPath(); badge.ctx.roundRect(0, 0, 256, 64, 12); badge.ctx.fill();
    badge.ctx.font = `italic 700 38px Georgia, serif`; badge.ctx.fillStyle = '#1c1c1e'; badge.ctx.textAlign = 'center'; badge.ctx.fillText('Little Giant', 128, 45);
    badge.tex.needsUpdate = true;
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.0225), new THREE.MeshStandardMaterial({ map: badge.tex, metalness: 0.6, roughness: 0.35 }));
    bm.position.set(0.1, 0.06, AD / 2 + 0.004); amp.add(bm);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) corners.push([0.03, 0.03, 0.03, sx * (AW / 2 - 0.013), 0.012 + sy * AH + (sy ? -0.013 : 0.013), sz * (AD / 2 - 0.013)]);
    amp.add(mergedBoxes(corners, mat('#2a2b2e', { metalness: 0.8, roughness: 0.4 })));
    amp.add(mergedBoxes([[0.16, 0.012, 0.032, 0, AH + 0.024, 0], [0.02, 0.02, 0.04, -0.085, AH + 0.02, 0], [0.02, 0.02, 0.04, 0.085, AH + 0.02, 0]], mat('#141414', { roughness: 0.6 })));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(amp, 0.012, 0.012, 0.012, '#111', sx * (AW / 2 - 0.03), 0.006, sz * (AD / 2 - 0.03), { seg: 10 });
    solid(AX, AZ, 0.42, 0.36);
    // Lead from the amp's input, along the floor, up into the copper Strat's jack.
    amp.updateMatrixWorld(true);
    const ampJack = amp.localToWorld(V(-0.148, 0.287, AD / 2 + 0.01)), gJack = cu.g.localToWorld(cu.jack.clone());
    const out = V(Math.sin(AY), 0, Math.cos(AY)), nrm = cu.g.getWorldDirection(new THREE.Vector3());
    const pts = [ampJack, ampJack.clone().addScaledVector(out, 0.05), amp.localToWorld(V(-0.17, 0.014, AD / 2 + 0.14)), V(gJack.x + 0.12, 0.014, gJack.z + 0.32),
      V(gJack.x + 0.03, 0.014, gJack.z + 0.2), gJack.clone().addScaledVector(nrm, 0.09).setY(gJack.y - 0.1), gJack.clone().addScaledVector(nrm, 0.035), gJack];
    add(world, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 120, 0.0035, 6), mat('#151515', { roughness: 0.7 }));
    add(world, rodGeo(ampJack, ampJack.clone().addScaledVector(out, 0.035), 0.0055, 12), chromeM);
    add(world, rodGeo(gJack, gJack.clone().addScaledVector(nrm, 0.035), 0.0055, 12), chromeM);
  }

  // The centre monitor: the real dashboard page, sized to the viewport's aspect so the
  // zoom transition starts and ends pixel-identical to the flat overview.
  const center = { x: OWNER.x, z: OWNER.z - 0.3, w: 1.25, h: 0.7 };
  const centerMon = monitor(world, 1, 1, center.x, 0.765, center.z);
  const holeM = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), holeM);
  hole.userData.action = 'computer';
  centerMon.g.add(hole);
  const domScreen = document.createElement('div');
  domScreen.className = 'of-dom';
  const cssObj = new CSS3DObject(domScreen);
  cssObj.element.style.pointerEvents = 'none';
  cssScene.add(cssObj);
  const screenWorld = new THREE.Vector3(), lapScr = { w: 0.3, h: 0.19 }, cssPx = { w: 1, h: 1 }, cssS = new THREE.Vector3();
  // While the MacBook's open the one live page sits on its lid instead, and the monitor says where it went.
  const awayScr = makeScreen(centerMon.g, 1, 1, 640, 360, 0, 0, 0.011);
  awayScr.mesh.visible = false;
  {
    const { ctx: a } = awayScr, gr = a.createLinearGradient(0, 0, 640, 360);
    gr.addColorStop(0, '#1b2433'); gr.addColorStop(1, '#0d1118'); a.fillStyle = gr; a.fillRect(0, 0, 640, 360);
    a.textAlign = 'center'; a.fillStyle = '#e8e6df'; a.font = `600 30px ${FONT}`; a.fillText('Open on your MacBook', 320, 178);
    a.fillStyle = '#8d96a6'; a.font = `400 18px ${FONT}`; a.fillText('Lounge · corner nook', 320, 212);
    awayScr.tex.needsUpdate = true;
  }
  function layoutCenterMonitor(pxW, pxH) {
    center.h = center.w * pxH / pxW;
    // The lid's display area (302 × 196 mm), filled edge to edge: the page is laid out at the lid's shape while it's there.
    lapScr.w = 0.302; lapScr.h = 0.196;
    centerMon.bezel.scale.set(center.w + 0.03, center.h + 0.03, 1);
    centerMon.bezel.position.y = 0.12 + center.h / 2;
    awayScr.mesh.scale.set(center.w, center.h, 1); awayScr.mesh.position.y = 0.12 + center.h / 2;
    Object.assign(cssPx, { vw: pxW, vh: pxH });
    placeHole();
  }
  function placeHole() {
    const lap = laptop.shown, s = lap ? lapScr : center;
    const pw = cssPx.vw, ph = lap ? Math.round(pw * lapScr.h / lapScr.w) : cssPx.vh;
    if (pw !== cssPx.w || ph !== cssPx.h) { domScreen.style.width = pw + 'px'; domScreen.style.height = ph + 'px'; Object.assign(cssPx, { w: pw, h: ph }); }
    (lap ? laptop.pivot : centerMon.g).add(hole);
    hole.scale.set(s.w, s.h, 1);
    if (lap) hole.position.set(0, laptop.LH - 0.004 - s.h / 2, 0.001); else hole.position.set(0, 0.12 + center.h / 2, 0.012);
    awayScr.mesh.visible = lap;
    centerMon.g.updateWorldMatrix(true, true);
    (lap ? awayScr.mesh : hole).getWorldPosition(screenWorld);
    syncCss();
  }
  // The CSS3D page follows the hole (the lid moves), at one CSS pixel per screen pixel.
  function syncCss() {
    hole.updateWorldMatrix(true, false);
    hole.matrixWorld.decompose(cssObj.position, cssObj.quaternion, cssS);
    cssObj.scale.setScalar(cssS.x / cssPx.w);
  }

  // ----- meeting rooms -----
  // Glass rooms like my office (tint, frosted band, mullions) with doorways instead of doors: two along the east windows
  // either side of a solid partition, one by the north windows. All panes, frames and frost are three meshes.
  // Seats: `xs` along both long sides of a table at (tx, tz); idle sessions walk in by `entry`, then the south or north corridor.
  const MR = [
    { tx: 17.2, tz: 5, len: 2.8, dep: 1.1, co: 0.85, xs: [16.3, 17.2, 18.1],
      entry: [[13.4, AISLE], [13.4, 3.55], [14.6, 3.55]], south: 3.55, north: 6.6, around: 14.6 },
    { tx: 17.2, tz: 10.2, len: 2.2, dep: 1.1, co: 0.85, xs: [16.7, 17.7],
      entry: [[13.4, AISLE], [13.4, 8.55], [14.6, 8.55]], south: 8.55, north: 11.85, around: 14.6 },
    { tx: 0.8, tz: 13.3, len: 1.8, dep: 0.9, co: 0.75, xs: [0.35, 1.25],
      entry: [[-0.75, AISLE], [-0.75, 11.9]], south: 11.9, north: 14.55, around: -0.75 },
  ];
  {
    const panes = [], frames = [], frost = [];
    // A glass wall along x (z fixed) or z (x fixed), with optional doorway [a, b]: posts, header and a glass transom over it.
    // Blinds (group `bl`) hang full height on the room's side (`inward`), either side of the doorway.
    const mrWall = (axis, fixed, from, to, gap, bl, inward) => {
      const blind = wallGroup(axis, fixed, inward, (from + to) / 2), cells = [];
      const X = axis === 'x', at = (list, u, w, h, d, y) => list.push(X ? [w, h, d, u, y, fixed] : [d, h, w, fixed, y, u]);
      for (const [a, b] of gap ? [[from, gap[0]], [gap[1], to]] : [[from, to]]) {
        const len = b - a, mid = (a + b) / 2, n = Math.max(1, Math.round(len / 1.5));
        at(panes, mid, len, ROOM.h, 0.03, ROOM.h / 2);
        at(frames, mid, len, 0.06, 0.06, 0.03); at(frames, mid, len, 0.06, 0.06, ROOM.h - 0.03);
        for (let i = 0; i <= n; i++) at(frames, a + (i * len) / n, 0.05, ROOM.h, 0.07, ROOM.h / 2);
        at(frost, mid, len, 0.16, 0.036, 1.46); frost[frost.length - 1].len = len;
        solid(X ? mid : fixed, X ? fixed : mid, X ? len : 0.08, X ? 0.08 : len);
        cells.push([blind.ux(mid), len - 0.2]);
      }
      hangBlind(blind.g, cells, BL.top, 0.06, 0.11, bl);
      if (gap) {
        const mid = (gap[0] + gap[1]) / 2, len = gap[1] - gap[0];
        at(frames, mid, len + 0.06, 0.08, 0.08, 2.24);
        at(panes, mid, len, ROOM.h - 2.28, 0.03, (ROOM.h + 2.28) / 2);
      }
    };
    const { meetSouth, meetNorth, meetSmall } = blinds;
    mrWall('x', 2.5, 14, 20, null, meetSouth, 1); mrWall('z', 14, 2.5, 7.5, [3.0, 4.1], meetSouth, 1); mrWall('z', 14, 7.5, 12.5, [8.0, 9.1], meetNorth, 1); mrWall('x', 12.5, 14, 20, null, meetNorth, -1);
    mrWall('z', -1.8, 11.2, 15, null, meetSmall, 1); mrWall('z', 3.4, 11.2, 15, null, meetSmall, -1); mrWall('x', 11.2, -1.8, 3.4, [-1.3, -0.2], meetSmall, 1);
    // Doors in the doorways, swinging into the rooms. People walking in or out open them on the way through.
    glassDoor({ name: 'Meeting room door', hx: 14, hz: 3.02, r0: -Math.PI / 2, swing: 1, W: 1.06, H: 2.16, auto: true });
    glassDoor({ name: 'Meeting room door', hx: 14, hz: 8.02, r0: -Math.PI / 2, swing: 1, W: 1.06, H: 2.16, auto: true });
    glassDoor({ name: 'Meeting room door', hx: -1.28, hz: 11.2, r0: 0, swing: -1, W: 1.06, H: 2.16, auto: true });
    const glassMesh = mergedBoxes(panes, glassM); glassMesh.castShadow = false;
    // Frost bands share one material; their UVs are stretched per wall so the dot pattern keeps its spacing.
    const frostM = new THREE.MeshStandardMaterial({ map: frostTex, transparent: true, roughness: 0.9, depthWrite: false });
    const frostMesh = new THREE.Mesh(mergeGeometries(frost.map(([w, h, d, x, y, z], i) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * frost[i].len / 0.32);
      return g.translate(x, y, z);
    })), frostM);
    world.add(glassMesh, frostMesh, mergedBoxes(frames, frameM));
    glassMesh.userData = frostMesh.userData = { action: 'blinds', glass: true, reach: 3.5, blindAt: (p) => p.x < 8 ? meetSmall : p.z < 7.5 ? meetSouth : meetNorth };
    // Solid partition between the two east rooms: a wall screen on one side, a whiteboard on the other.
    box(world, 6, ROOM.h, 0.12, '', 17, ROOM.h / 2, 7.5, { material: wallM });
    solid(17, 7.5, 6, 0.12);
  }
  for (const r of MR) {
    box(world, r.len, 0.05, r.dep, '', r.tx, 0.74, r.tz, { material: deskTopM });
    for (const dx of [-1, 1]) box(world, 0.06, 0.72, r.dep - 0.2, '', r.tx + dx * (r.len / 2 - 0.25), 0.36, r.tz, { material: legM });
    solid(r.tx, r.tz, r.len, r.dep);
    for (const x of r.xs) { officeChair(x, r.tz - r.co, 0, '#3f4a5a'); officeChair(x, r.tz + r.co, Math.PI, '#3f4a5a'); }
    cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', r.xs[0] + 0.2, 0.815, r.tz - 0.25);
    box(world, 0.3, 0.012, 0.22, '#e8e4dc', r.xs[r.xs.length - 1] - 0.1, 0.771, r.tz + 0.2, { shadow: false });
    // A light bar over the table: glows by the lamps rule and has one (lamp-controlled) light.
    box(world, r.len * 0.6, 0.035, 0.09, '', r.tx, 2.6, r.tz, { material: barM, shadow: false });
    for (const dx of [-1, 1]) cyl(world, 0.004, 0.004, ROOM.h - 2.6, '#222', r.tx + dx * r.len * 0.25, (ROOM.h + 2.6) / 2, r.tz, { shadow: false });
    addLamp(r.tx, 2.4, r.tz, 8);
  }
  // Whiteboards with a marker sketch on them to start with.
  function markerBoard(id, name, scr, draw) { return whiteboard(scr, id, name, draw); }
  {
    // South east room: a whiteboard on its face of the partition, back to back with the north room's.
    const sb = makeScreen(world, 2.4, 1.2, 1024, 512, 17.2, 1.55, 7.4);
    sb.mesh.rotation.y = Math.PI;
    box(world, 2.48, 1.28, 0.03, '#b9bcc0', 17.2, 1.55, 7.425, { shadow: false });
    box(world, 1.2, 0.03, 0.07, '#b9bcc0', 17.2, 0.93, 7.38, { shadow: false });
    markerBoard('meet-south', 'meeting room whiteboard', sb, null);
    // North east room: whiteboard on the other face of the partition.
    const wb = makeScreen(world, 2.4, 1.2, 1024, 512, 17.2, 1.55, 7.6);
    box(world, 2.48, 1.28, 0.03, '#b9bcc0', 17.2, 1.55, 7.575, { shadow: false });
    box(world, 1.2, 0.03, 0.07, '#b9bcc0', 17.2, 0.93, 7.62, { shadow: false });
    markerBoard('meet-north', 'meeting room whiteboard', wb, (c) => {
      const node = (x, y, t, col) => { c.strokeStyle = col; c.strokeRect(x - 105, y - 42, 210, 84); c.fillStyle = col; c.font = `600 34px "Marker Felt", "Comic Sans MS", ${FONT}`; c.textAlign = 'center'; c.fillText(t, x, y + 12); };
      const arrow = (x0, x1, y) => { c.strokeStyle = '#333'; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.lineTo(x1 - 16, y - 12); c.moveTo(x1, y); c.lineTo(x1 - 16, y + 12); c.stroke(); };
      node(170, 150, 'idea', '#1f6fd1'); node(512, 150, 'plan', '#2e8b57'); node(854, 150, 'ship ✦', '#c0392b');
      arrow(282, 400, 150); arrow(624, 742, 150);
      c.textAlign = 'left'; c.fillStyle = '#333'; c.font = `400 30px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['- write the test first', '- keep diffs small', '- ask before force-pushing'].forEach((t, i) => c.fillText(t, 90, 300 + i * 52));
      c.strokeStyle = '#c0392b'; c.beginPath(); c.ellipse(790, 400, 150, 70, -0.1, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#c0392b'; c.fillText('demo Fri!', 712, 410);
    });
    // North room: a rolling whiteboard by the east glass, facing the table.
    const g = new THREE.Group(); g.position.set(2.95, 0, 13.3); g.rotation.y = -Math.PI / 2; world.add(g);
    g.add(mergedBoxes([[1.36, 0.92, 0.04, 0, 1.4, -0.01, '#b9bcc0'], [0.04, 1.85, 0.04, -0.66, 0.93, -0.03, '#8d9399'], [0.04, 1.85, 0.04, 0.66, 0.93, -0.03, '#8d9399'],
      [0.06, 0.04, 0.5, -0.66, 0.08, -0.03, '#5a5f66'], [0.06, 0.04, 0.5, 0.66, 0.08, -0.03, '#5a5f66'], [1.3, 0.03, 0.06, 0, 0.92, 0.03, '#b9bcc0']],
    mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
    const hb = makeScreen(g, 1.3, 0.86, 640, 424, 0, 1.4, 0.012);
    markerBoard('meet-small', 'meeting room whiteboard', hb, (c) => {
      c.fillStyle = '#1f2a44'; c.font = `400 38px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['standup notes', '- review open PRs', '- fix flaky test'].forEach((t, i) => c.fillText(t, 40, 110 + i * 92));
      c.strokeStyle = '#c0392b'; c.beginPath(); c.moveTo(40, 128); c.lineTo(330, 128); c.stroke();
    });
    solid(2.95, 13.3, 0.5, 1.4);
  }
  plant(19.3, 12, 1); plant(2.9, 14.5, 0.75);

  // ----- more furniture -----
  // Desk floor, along my office's glass: a low binder credenza, filing cabinets, a copier with recycling bins, a water cooler.
  const metalM = mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 }), plainM = mat('#ffffff', { vertexColors: true, roughness: 0.8 });
  bookshelf(5.78, -6.2, -Math.PI / 2, 2.2, 1.1, 2);
  smallPlant(world, 5.78, 1.1, -6.9);
  {
    const fc = [];
    for (const z of [-9.7, -10.25]) {
      fc.push([0.62, 1.0, 0.52, 5.66, 0.5, z, '#8d9399']);
      for (let i = 0; i < 3; i++) fc.push([0.012, 0.29, 0.47, 5.345, 0.2 + i * 0.32, z, '#9ba1a7'], [0.02, 0.02, 0.14, 5.33, 0.3 + i * 0.32, z, '#d6d9dd']);
    }
    world.add(mergedBoxes(fc, metalM));
    solid(5.66, -9.975, 0.62, 1.07);
    cyl(world, 0.04, 0.035, 0.1, '#2f6f8f', 5.6, 1.05, -9.6);
    // Copier: body, scanner lid, control panel, paper trays, output tray.
    world.add(mergedBoxes([[1.0, 0.92, 0.66, 4.5, 0.46, -14.15, '#dcdcd8'], [1.0, 0.08, 0.66, 4.5, 0.96, -14.15, '#3a3c40'],
      [0.32, 0.06, 0.16, 4.82, 0.95, -13.78, '#2a2c30'], [0.9, 0.012, 0.01, 4.5, 0.3, -13.815, '#9a9a96'], [0.9, 0.012, 0.01, 4.5, 0.55, -13.815, '#9a9a96'],
      [0.4, 0.03, 0.3, 4.05, 0.75, -13.98, '#f4f4f0']], metalM));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ color: '#7fc3ff' }));
    panel.rotation.x = -Math.PI / 2 + 0.5; panel.position.set(4.82, 0.985, -13.78); world.add(panel);
    solid(4.5, -14.15, 1.0, 0.66);
  }
  // Recycling bins: paper, plastic, general.
  function bins(x, z) {
    const l = [];
    ['#2f6fd1', '#e0a63a', '#5a5f66'].forEach((c, i) => l.push([0.3, 0.62, 0.32, x + i * 0.34, 0.31, z, c], [0.28, 0.02, 0.3, x + i * 0.34, 0.63, z, '#e9e7e2']));
    world.add(mergedBoxes(l, plainM));
    solid(x + 0.34, z, 1.04, 0.34);
  }
  bins(3.0, -14.6);
  function waterCooler(x, z) {
    world.add(mergedBoxes([[0.32, 0.95, 0.32, x, 0.475, z, '#eceae4'], [0.2, 0.08, 0.03, x, 0.82, z - 0.17, '#2a2c30'], [0.22, 0.02, 0.1, x, 0.36, z - 0.2, '#9a9a96']], plainM));
    cyl(world, 0.15, 0.15, 0.38, '#7fb4e0', x, 1.15, z, { mat: { transparent: true, opacity: 0.55, roughness: 0.1 } });
    cyl(world, 0.035, 0.035, 0.24, '#f4f4f0', x + 0.2, 0.75, z, { seg: 10 });   // cup dispenser
    solid(x, z, 0.4, 0.4);
  }
  waterCooler(5.55, -1.7);
  // Lobby: a waiting sofa against my office's glass, a side table, a coat stand, an umbrella stand and a plant along the meeting room glass.
  sofa(14.6, -2.95, 0, 1.9, '#4b5a6a');
  cyl(world, 0.26, 0.26, 0.03, '#2a2724', 13.15, 0.55, -3.0, { seg: 24 }); cyl(world, 0.03, 0.03, 0.54, '#2f3236', 13.15, 0.27, -3.0); cyl(world, 0.18, 0.18, 0.02, '#2f3236', 13.15, 0.01, -3.0);
  smallPlant(world, 13.15, 0.565, -3.0); solid(13.15, -3.0, 0.5, 0.5);
  {
    const x = 15.6, z = 2.05;
    cyl(world, 0.22, 0.24, 0.03, '#2a2a2a', x, 0.015, z, { seg: 20 }); cyl(world, 0.02, 0.025, 1.8, '#5a3d28', x, 0.9, z);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; box(world, 0.16, 0.02, 0.02, '#2a2a2a', x + Math.cos(a) * 0.07, 1.72, z + Math.sin(a) * 0.07).rotation.y = -a; }
    box(world, 0.34, 0.75, 0.16, '#6b4f3a', x - 0.02, 1.32, z + 0.09).rotation.z = 0.05;   // a coat
    box(world, 0.06, 0.6, 0.05, '#c0392b', x + 0.1, 1.35, z - 0.08);                       // a scarf
    cyl(world, 0.13, 0.12, 0.5, '#3a3c40', 15.05, 0.25, 2.1, { mat: { metalness: 0.5, roughness: 0.4 } });
    for (const [dx, c] of [[-0.04, '#1f2a44'], [0.05, '#2f6f8f']]) { cyl(world, 0.012, 0.012, 0.85, c, 15.05 + dx, 0.62, 2.1 + dx, { seg: 8 }); cyl(world, 0.02, 0.02, 0.1, '#5a3d28', 15.05 + dx, 1.07, 2.1 + dx, { seg: 8 }); }
    solid(x, z, 0.4, 0.4); solid(15.05, 2.1, 0.3, 0.3);
  }
  plant(14.45, 2.0, 0.9);

  // ----- lift lobby -----
  // The building's lifts: a stone-clad core against the east wall, two cars facing west either side of the call panel.
  // Doors are brushed steel leaves sliding into the wall; each car is lit by an emissive ceiling panel only (no lights).
  // Sessions arrive and leave by lift: see the lift cycle next to the people sync.
  let liftSteelM;   // brushed steel for every lift's doors and surrounds (set below)
  const CORE = { x0: LIFT.x, x1: 20, z0: -3.47, z1: 2.46 }, DOOR = { w: 1.1, h: 2.2 }, CAR = { d: 1.8, w: 1.5, h: 2.35 };
  const lifts = [[LIFT.z - 0.9, 48], [LIFT.z + 0.9, 12]].map(([z, floor]) => ({ z, at: { x: LIFT.x, z }, floor, goal: floor, dir: 0, state: floor === 48 ? 'home' : 'away', t: 0, doorK: 0, nIn: 0,
    pending: [], cargo: new Set(), exits: new Set(), callers: new Set(), riders: new Set() }));
  {
    const brushed = makeCanvas(64, 256), R = rng(31);
    brushed.ctx.fillStyle = '#c9cdd2'; brushed.ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 260; i++) { brushed.ctx.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '40,44,50'},${0.05 + R() * 0.08})`; brushed.ctx.fillRect(R() * 64, 0, 0.6 + R(), 256); }
    brushed.tex.needsUpdate = true;
    const steelM = liftSteelM = new THREE.MeshStandardMaterial({ map: brushed.tex, metalness: 0.85, roughness: 0.32 });   // shared by every floor's lift
    const fx = LIFT.x + 0.05, cx = LIFT.x + 0.1 + CAR.d / 2, back = LIFT.x + 0.1 + CAR.d;
    const edges = [CORE.z0, ...lifts.flatMap((L) => [L.z - DOOR.w / 2, L.z + DOOR.w / 2]), CORE.z1];
    const stone = [], steel = [], car = [], mirror = [], glow = [];
    for (let k = 0; k < edges.length; k += 2) {
      const a = edges[k], b = edges[k + 1], len = b - a, mid = (a + b) / 2;
      stone.push([0.1, ROOM.h, len, fx, ROOM.h / 2, mid, '#77716a'], [0.02, 0.1, len, LIFT.x - 0.01, 0.05, mid, '#3b3835']);
      for (let y = 0.9; y < ROOM.h; y += 0.9) stone.push([0.012, 0.006, len, LIFT.x - 0.001, y, mid, '#5d5852']);   // panel joints
    }
    stone.push([CORE.x1 - LIFT.x, ROOM.h, 0.06, (LIFT.x + CORE.x1) / 2, ROOM.h / 2, CORE.z0 + 0.03, '#77716a'], [CORE.x1 - LIFT.x, ROOM.h, 0.06, (LIFT.x + CORE.x1) / 2, ROOM.h / 2, CORE.z1 - 0.03, '#77716a']);
    for (const L of lifts) {
      const z = L.z;
      stone.push([0.1, ROOM.h - DOOR.h, DOOR.w, fx, (ROOM.h + DOOR.h) / 2, z, '#77716a']);
      // Surround: jambs, head, threshold and the indicator housing.
      for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, z + s * (DOOR.w / 2 + 0.04)]);
      steel.push([0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, z], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, z], [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, z]);
      // Car: floor, ceiling, steel sides, wood back with a mirror over it, handrails.
      car.push([CAR.d, 0.02, CAR.w, cx, 0.01, z, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, z, '#232426'], [0.04, CAR.h, CAR.w, back, CAR.h / 2, z, '#8a6446']);
      for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, z + s * CAR.w / 2, '#aeb4ba'], [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, z + s * (CAR.w / 2 - 0.06), '#dfe2e5']);
      car.push([0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, z, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, z + CAR.w / 2 - 0.03, '#5a5f66']);
      mirror.push([0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, z]);
      glow.push([CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, z]);
      // Two leaves meeting in the middle; they slide apart into the wall.
      L.leaves = [-1, 1].map((s) => box(world, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, z + s * DOOR.w / 4, { material: steelM, shadow: false }));   // behind the stone face, so they slide into the wall
      L.ind = makeScreen(world, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, z);
      L.ind.mesh.rotation.y = -Math.PI / 2;
    }
    steel.push([0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, LIFT.z]);   // call panel
    world.add(mergedBoxes(stone, mat('#ffffff', { vertexColors: true, roughness: 0.55 })), mergedBoxes(steel, steelM),
      mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })), mergedBoxes(mirror, mat('#dfe4e8', { metalness: 1, roughness: 0.05 })));
    const carLight = mergedBoxes(glow, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 }));
    carLight.castShadow = false; world.add(carLight);
    lifts.callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(world, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, LIFT.z, { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : lifts.callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    solid((LIFT.x + CORE.x1) / 2, (CORE.z0 + CORE.z1) / 2, CORE.x1 - LIFT.x, CORE.z1 - CORE.z0);
    // The floor sign on the core behind reception: "48" and a building directory.
    const sign = makeScreen(world, 1.5, 1.0, 600, 400, LIFT.x - 0.012, 1.95, -2.3), c = sign.ctx;
    sign.mesh.rotation.y = -Math.PI / 2;
    c.fillStyle = '#26282b'; c.fillRect(0, 0, 600, 400);
    c.fillStyle = '#d97757'; c.fillRect(40, 54, 6, 120);
    c.font = `200 132px ${FONT}`; c.fillStyle = '#f2efe8'; c.fillText('48', 62, 168);
    c.font = `600 26px ${FONT}`; c.fillStyle = '#c3c2b7'; c.fillText('FLOOR', 250, 96);
    c.font = `400 24px ${FONT}`; c.fillText(fit(c, dash.officeName(), 310), 250, 132); c.fillText('Desks · Meeting rooms · Lounge', 250, 164);
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(40, 214, 520, 2);
    c.font = `400 22px ${FONT}`; c.fillStyle = '#9a9890';
    [['R', 'Roof terrace · Helipad'], ['49', 'Plant room'], ['47', 'Server hall'], ['G', 'Lobby · Street · Coffee'], ['B2', 'The Archive']].forEach(([f, t], i) => {
      c.fillStyle = '#f2efe8'; c.font = `600 22px ${FONT}`; c.fillText(f, 44, 252 + i * 34); c.fillStyle = '#9a9890'; c.font = `400 22px ${FONT}`; c.fillText(t, 100, 252 + i * 34);
    });
    sign.mesh.material = new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.5 }); sign.tex.needsUpdate = true;
  }
  // Hall lantern over each lift: floor and direction, repainted only when they change.
  const ROOF = 50;   // the roof terrace, two floors up (49 is the plant room); its button and lanterns read R
  const floorName = (f) => (f === ROOF ? 'R' : f < 0 ? `B${-f}` : f ? String(f) : 'G');
  function paintIndicator(L) {
    const f = Math.round(L.floor), key = `${f}${L.dir}`;
    if (key === L.indKey) return;
    L.indKey = key;
    const { ctx, W, H } = L.ind;
    ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffb347'; ctx.font = `600 58px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(floorName(f), W / 2 + 22, 62); ctx.textAlign = 'left';
    if (L.dir) { ctx.beginPath(); ctx.moveTo(26, L.dir > 0 ? 22 : 58); ctx.lineTo(48, L.dir > 0 ? 22 : 58); ctx.lineTo(37, L.dir > 0 ? 8 : 72); ctx.lineTo(26, L.dir > 0 ? 22 : 58); ctx.fill(); ctx.fillRect(33, L.dir > 0 ? 22 : 34, 8, 24); }
    L.ind.tex.needsUpdate = true;
  }
  lifts.forEach(paintIndicator);

  // Lounge, by the brick wall: a vending machine with a lit front, recycling bins, some art.
  {
    const x = 7.1, z = 14.42;
    world.add(mergedBoxes([[0.95, 1.85, 0.8, x, 0.925, z, '#1f2a33'], [0.6, 0.12, 0.04, x - 0.12, 0.3, z - 0.41, '#0d1114'], [0.2, 0.5, 0.03, x + 0.33, 1.1, z - 0.41, '#2a3540']], metalM));
    const v = makeScreen(world, 0.56, 1.2, 280, 600, x - 0.12, 1.15, z - 0.415), c = v.ctx;
    v.mesh.rotation.y = Math.PI;
    c.fillStyle = '#0e1a22'; c.fillRect(0, 0, 280, 600);
    const DR = ['#e0245e', '#7ed321', '#1f6fd1', '#ffb000', '#f4f1ea', '#d97757'], R = rng(77);
    for (let r = 0; r < 6; r++) {
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(10, 92 + r * 96, 260, 4);
      for (let k = 0; k < 5; k++) { c.fillStyle = DR[Math.floor(R() * DR.length)]; c.fillRect(18 + k * 52, 30 + r * 96, 36, 60); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(22 + k * 52, 34 + r * 96, 6, 52); }
    }
    v.tex.needsUpdate = true;
    solid(x, z, 0.95, 0.8);
  }
  bins(8.0, 14.6);
  art(14.4, 1.85, 14.82, Math.PI, 1.2, 0.9);
  art(-12.65, 1.95, -14.84, 0, 1.5, 1.0);
  // A reading nook between the pillar and the lounge: two armchairs, a side table, a standing lamp (glow only, no light).
  rug(4.5, 7.4, 3.6, 5.7, '#3f4a6b', '#d9a441');
  sofa(5.0, 4.6, Math.PI / 2, 1.05, '#6b8e4e');
  sofa(6.9, 4.6, -Math.PI / 2, 1.05, '#b5654a');
  cyl(world, 0.24, 0.24, 0.03, '#8a6a4a', 5.95, 0.5, 4.6, { seg: 24 }); cyl(world, 0.03, 0.03, 0.5, '#2f3236', 5.95, 0.25, 4.6); solid(5.95, 4.6, 0.5, 0.5);
  cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', 5.88, 0.565, 4.55);
  floorLamp(5.95, 5.55, 0);

  // ----- wall clocks -----
  // Hands follow the office's simulated time (the clock driving the sky, sped up with T); one shared face canvas.
  const clocks = [];
  const clockFaceM = (() => {
    const t = makeCanvas(256, 256), { ctx } = t;
    ctx.fillStyle = '#f7f5f0'; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1c1e'; ctx.textAlign = 'center'; ctx.font = `500 30px ${FONT}`;
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
      ctx.save(); ctx.translate(128, 128); ctx.rotate(a); ctx.fillRect(big ? -3 : -1, -122, big ? 6 : 2, big ? 18 : 8); ctx.restore();
      if (big) ctx.fillText(String(i / 5 || 12), 128 + Math.sin(a) * 84, 139 - Math.cos(a) * 84);
    }
    t.tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.6 });
  })();
  const handM = mat('#1c1c1e', { roughness: 0.5 }), secM = mat('#d0402b', { roughness: 0.5 });
  function wallClock(x, y, z, rotY, r = 0.2) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    cyl(g, r + 0.02, r + 0.02, 0.05, '#2a2b2e', 0, 0, 0.025, { seg: 40 }).rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), clockFaceM); face.position.z = 0.051; g.add(face);
    const hand = (len, w, m, z) => { const p = new THREE.Group(); p.position.z = z; g.add(p); box(p, w, len, 0.005, '', 0, len * 0.4, 0, { material: m, shadow: false }); return p; };
    clocks.push({ h: hand(r * 0.55, r * 0.1, handM, 0.056), m: hand(r * 0.85, r * 0.065, handM, 0.061), s: hand(r * 0.92, r * 0.025, secM, 0.066) });
    cyl(g, r * 0.06, r * 0.06, 0.02, '#d0402b', 0, 0, 0.068, { seg: 12 }).rotation.x = Math.PI / 2;
  }
  function updateClocks(d) {
    const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60, T = -Math.PI * 2;
    for (const c of clocks) { c.h.rotation.z = (h / 12) * T; c.m.rotation.z = (m / 60) * T; c.s.rotation.z = (s / 60) * T; c.s.visible = clockState.speed <= 120; }   // faster, the second hand just blurs
  }
  wallClock(-3.3, 2.45, -14.86, 0);             // desk floor
  wallClock(3.74, 2.65, 8, -Math.PI / 2);       // pillar over the ping pong TV, facing the breakroom
  wallClock(10.55, 2.35, -14.9, 0, 0.18);       // my office
  wallClock(17.2, 2.8, 7.44, Math.PI, 0.17);    // south east meeting room, over the whiteboard

  // ----- wall TVs -----
  // Each is a live tab in a browser the server runs (set from its panel or the Admin tab, /api/tvs). Frames arrive over
  // one socket and are drawn into the screen's canvas; only the nearest few in view stream, the rest keep their last frame.
  const tvs = [];
  let using = null;   // the TV clicked into, taking mouse and keys
  function tvSet(id, x, y, z, rotY, w, hung) {
    const name = dash.tvList[id];
    const h = w * 9 / 16, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    box(g, w + 0.08, h + 0.08, 0.06, '#111214', 0, 0, -0.03, { mat: { roughness: 0.4 } });
    if (hung) for (const dx of [-w / 3, w / 3]) cyl(g, 0.01, 0.01, ROOM.h - y - h / 2, '#222', dx, (ROOM.h - y + h / 2) / 2, -0.03, { shadow: false });
    const scr = makeScreen(g, w, h, 1280, 720, 0, 0, 0.004);
    scr.mesh.userData.tv = id;
    scr.mesh.material.color.setScalar(1); scr.mesh.material.toneMapped = false;   // web pages in their own colours, not tone-mapped
    const t = { id, name, w, h, scr, cfg: null, frame: null, seq: 0, shown: 0, live: false, page: null, center: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)) };
    t.sphere = new THREE.Sphere(t.center, w * 0.6);
    tvs.push(t);
    paintTv(t);
  }
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
  function paintTv(t) {
    const { ctx, W, H } = t.scr, c = t.cfg;
    ctx.fillStyle = c ? '#0b0d12' : '#050607'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (!c) {
      ctx.font = `600 44px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillText(`${t.name.toUpperCase()} TV · CLICK TO SET UP`, W / 2, H / 2 + 16);
    } else if (t.frame) {
      ctx.drawImage(t.frame, 0, 0, W, H);
      if (!t.live && t !== using) {
        ctx.font = `600 26px ${FONT}`; const label = '❚❚  paused · live when you walk closer', lw = ctx.measureText(label).width + 40;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(W - lw - 20, H - 68, lw, 48, 24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(label, W - lw / 2 - 20, H - 35);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(W / 2, 280, 92, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(W / 2 - 28, 232); ctx.lineTo(W / 2 + 48, 280); ctx.lineTo(W / 2 - 28, 328); ctx.fill();
      ctx.font = `600 52px ${FONT}`; ctx.fillStyle = '#e8e6df'; ctx.fillText(fit(ctx, hostOf(c.url), W - 160), W / 2, 480);
      ctx.font = `400 36px ${FONT}`; ctx.fillStyle = '#9a9890'; ctx.fillText(t.live ? 'loading…' : 'live when you walk closer', W / 2, 544);
    }
    t.scr.tex.needsUpdate = true;
  }
  tvSet('desks-west', -16.2, 2.05, -14.8, 0, 2.4);
  tvSet('desks-east', -0.4, 2.05, -14.8, 0, 2.4);
  tvSet('breakroom', -14, 2.15, 2.42, 0, 1.8, true);
  tvSet('pingpong', 3.69, 1.6, 8, -Math.PI / 2, 1.4);
  tvSet('lounge', 11, 1.75, 14.78, Math.PI, 2.6);
  tvSet('lobby', 16.9, 2.15, -3.3, 0, 2.0, true);

  // One socket to the server for every TV: JPEG frames in ([id length][id][JPEG]) and page updates; which TVs we're
  // looking at, how loud each should be for us, and input for the TV in use out.
  let sock = null, sentWatch = '', sentFade = '', fadeAt = 0;
  const utf8 = new TextDecoder();
  function tvSocket() {
    if (sock) return;
    sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/tv`);
    sock.binaryType = 'arraybuffer';
    sock.onopen = () => { sentWatch = sentFade = ''; };
    sock.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data), t = tvs.find((x) => x.id === m.id);
        if (t && m.t === 'page') { t.page = m; if (t === using) tvBarSync(); }
        return;
      }
      const b = new Uint8Array(e.data), n = b[0], t = tvs.find((x) => x.id === utf8.decode(b.subarray(1, 1 + n)));
      if (!t?.cfg) return;
      const seq = ++t.seq;   // decodes can finish out of order; keep the newest
      createImageBitmap(new Blob([b.subarray(1 + n)], { type: 'image/jpeg' })).then((img) => {
        if (seq < t.shown) return img.close();
        t.shown = seq; t.frame?.close(); t.frame = img; t.dirty = true;
      }).catch(() => {});
    };
    sock.onclose = () => { sock = null; if (active) setTimeout(tvSocket, 2000); };
  }
  const tvSend = (m) => sock?.readyState === 1 && sock.send(JSON.stringify(m));
  function tvQuiet() { tvSend({ t: 'watch', ids: [] }); tvSend({ t: 'fade', fades: {} }); sentWatch = sentFade = ''; }
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) tvQuiet(); });

  // Sound fades with distance: full within AUDIO.near, silent by AUDIO.far, times the TV's own volume (applied by the server).
  const AUDIO = { near: 3, far: 20 };
  const tvFrustum = new THREE.Frustum(), tvProj = new THREE.Matrix4(), toCam = new THREE.Vector3();
  function updateTVs(now) {
    camera.updateMatrixWorld();
    tvFrustum.setFromProjectionMatrix(tvProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const t of tvs) t.dist = toCam.subVectors(camera.position, t.center).length();
    const want = tvs.filter((t) => t.cfg && t.dist < 25
      && toCam.subVectors(camera.position, t.center).dot(t.normal) > 0 && tvFrustum.intersectsSphere(t.sphere)).sort((a, b) => a.dist - b.dist).slice(0, 3);
    for (const t of tvs) {
      if (want.includes(t) || t === using) t.seen = now;
      const live = !!t.cfg && now - (t.seen ?? -1e9) < 3000;   // a short grace, so glancing away doesn't stop the stream
      if (live !== t.live) { t.live = live; t.dirty = true; }
      if (t.dirty) { t.dirty = false; paintTv(t); }
    }
    if (sock?.readyState !== 1) return;
    const ids = tvs.filter((t) => t.live).map((t) => t.id), w = `${ids}|${using?.id || ''}`;
    if (w !== sentWatch) { sentWatch = w; tvSend({ t: 'watch', ids, use: using?.id || null }); }
    if (now - fadeAt < 250) return;
    fadeAt = now;
    const fades = {};
    for (const t of tvs) if (t.cfg && t.dist < AUDIO.far) fades[t.id] = Math.round(100 * (1 - sstep(AUDIO.near, AUDIO.far, t.dist))) / 100;
    const f = JSON.stringify(fades);
    if (f !== sentFade) { sentFade = f; tvSend({ t: 'fade', fades }); }
  }
  function applyTvs(map) {
    for (const t of tvs) {
      const c = map?.[t.id] || null;
      if (JSON.stringify(c) === JSON.stringify(t.cfg)) continue;
      if (c?.url !== t.cfg?.url || c?.at !== t.cfg?.at) { t.frame?.close(); t.frame = null; t.shown = t.seq; t.page = null; }
      t.cfg = c; t.dirty = true;
      if (t === using) c ? tvBarSync() : leaveTv();
    }
  }
  dash.tvListeners.add(applyTvs);
  applyTvs(dash.tvs);
  // Blinds and door follow the shared office settings (Admin tab, or a click in another browser).
  function applyOffice(o) {
    for (const [k, v] of Object.entries(o?.blinds || {})) if (blinds[k]) blinds[k].to = v;
    if (o && 'door' in o) door.to = o.door;
  }
  dash.officeListeners.add(applyOffice);
  applyOffice(dash.office);

  // TV config lives in the drawer (and the Admin tab). Volume and mute apply live without reloading the page.
  const TV_REFRESH = dash.tvRefresh;
  const normUrl = dash.normUrl;
  function openTvPanel(t) {
    const c = t.cfg || {};
    const db = dash.openPanel(`<div style="font-size:19px;font-weight:650">${escapeHtml(t.name)} TV</div><div class="muted" style="font-size:12px">A live browser tab on the office wall · click the TV to use it</div>`,
      `<form class="panel of-tvform">
        <label>Show this URL<input name="url" type="text" autocomplete="off" spellcheck="false" placeholder="Any web page: YouTube, GitHub, the dashboard" value="${escapeHtml(c.url || '')}"></label>
        <div class="of-presets">Try <button type="button" data-url="${escapeHtml(location.origin)}/">Live dashboard</button></div>
        <label>Auto-refresh<select name="refresh">${TV_REFRESH.map(([v, l]) => `<option value="${v}"${v === (c.refresh || 0) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Volume<span class="of-volrow"><input name="volume" type="range" min="0" max="100"><span class="of-volv"></span><button type="button" data-mute></button></span></label>
        <div class="of-tvwarn"></div>
        <div class="of-tvbtns"><button type="submit" class="pri">Save</button><button type="button" data-off>Turn off</button><a target="_blank" rel="noopener">Open in new tab ↗</a></div>
        <div class="muted" style="font-size:12px">Sound fades with distance on top of this volume. Logins made on a TV stay in the TV browser's own profile.</div>
      </form>`);
    const form = db.querySelector('form'), input = form.elements.url, warn = form.querySelector('.of-tvwarn'), link = form.querySelector('a');
    const vol = form.elements.volume, volV = form.querySelector('.of-volv'), mute = form.querySelector('[data-mute]');
    const check = (msg) => {
      let host = '';
      try { host = new URL(normUrl(input.value)).hostname; } catch {}
      link.href = normUrl(input.value) || '#'; link.style.visibility = host ? '' : 'hidden';
      warn.className = 'of-tvwarn' + (msg ? ' bad' : ''); warn.textContent = msg || '';
    };
    const syncVol = () => {
      const c = dash.tvs[t.id];
      vol.disabled = mute.disabled = !c;
      if (document.activeElement !== vol) vol.value = c?.volume ?? 100;
      volV.textContent = c ? `${c.volume}%` : 'TV off';
      mute.textContent = c?.muted ? 'Unmute' : 'Mute';
    };
    vol.oninput = () => { dash.patchTv(t.id, { volume: +vol.value }); syncVol(); };
    mute.onclick = () => { dash.patchTv(t.id, { muted: !dash.tvs[t.id]?.muted }); syncVol(); };
    dash.tvListeners.add(syncVol);
    new MutationObserver((_, mo) => { if (!form.isConnected) { dash.tvListeners.delete(syncVol); mo.disconnect(); } }).observe(db, { childList: true });
    input.oninput = () => check();
    form.querySelector('.of-presets').onclick = (e) => { const b = e.target.closest('button'); if (b) { input.value = b.dataset.url; check(); } };
    const save = async (url, refresh) => {
      warn.className = 'of-tvwarn'; warn.textContent = url ? 'Saving…' : '';
      const r = await dash.saveTv(t.id, url, refresh);
      if (r?.error) return check(`Couldn't save: ${r.error}`);
      dash.closeDrawer();
    };
    form.onsubmit = (e) => { e.preventDefault(); save(normUrl(input.value), +form.elements.refresh.value); };
    form.querySelector('[data-off]').onclick = () => save('', 0);
    check(); syncVol();
    input.focus(); input.select();
  }

  // ----- idle spots -----
  const R = (...pts) => pts.map(([x, z]) => ({ x, z }));
  const idleSpots = [];
  const spot = (key, x, z, rotY, pose, route) => { const s = { key, kind: 'idle', pos: { x, z }, rotY, pose, route: [...route, { x, z }] }; idleSpots.push(s); return s; };
  const sofaA = [-14.8, -14, -13.2].map((x, i) => spot(`sofaA${i}`, x, 5.25, 0, 'sofa', R([-11.6, AISLE], [-11.6, 6.15], [x, 6.15])));
  const sofaB = [-14.8, -14, -13.2].map((x, i) => spot(`sofaB${i}`, x, 8.75, Math.PI, 'sofa', R([-11.6, AISLE], [-11.6, 7.85], [x, 7.85])));
  // One at the coffee machine, one waiting and chatting; four stools at the island; one at the drinks fridge.
  const coffee = [[-16.5, 13.72, 0], [-15.5, 13.2, faceTo({ x: -15.5, z: 13.2 }, { x: -16.5, z: 13.72 })]].map(([x, z, rotY], i) =>
    spot(`coffee${i}`, x, z, rotY, 'coffee', R([-11.6, AISLE], [-11.6, 12.6], [x, 12.6])));
  const stool = kitchen.stools.map(({ x, z }, i) => spot(`stool${i}`, x, z, 0, 'stool', R([-11.6, AISLE], [-11.6, 10], [x, 10])));
  const fridge = spot('fridge', -18.55, 12.95, -Math.PI / 2, 'fridge', R([-11.6, AISLE], [-11.6, 12.6], [-18.55, 12.6]));
  const pp = [spot('pp0', PP.x - 1.85, PP.z, Math.PI / 2, 'pingpong', R([-11.6, AISLE], [-11.6, PP.z], [PP.x - 1.85, PP.z])), spot('pp1', PP.x + 1.85, PP.z, -Math.PI / 2, 'pingpong', R([-4.75, AISLE], [-4.75, 11], [PP.x + 1.85, 11]))];
  const chat = [
    spot('chat0', -10.35, 4.9, Math.PI / 2, 'chat', R([-10.35, AISLE])),
    spot('chat1', -8.85, 4.9, -Math.PI / 2, 'chat', R([-8.85, AISLE])),
    spot('chat2', -9.6, 5.65, Math.PI, 'chat', R([-8.2, AISLE], [-8.2, 5.65])),
  ];
  const bean = [7.6, 9.6].map((z, i) => spot(`bean${i}`, -17.9, z, Math.PI / 2, 'beanbag', R([-11.6, AISLE], [-11.6, 10], [-16.9, 10], [-16.9, z])));
  const meet = [8.8, 10, 11.2].map((x, i) => spot(`meet${i}`, x, 7.55, 0, 'chat', R([x, AISLE])));
  // Meeting rooms: a seat each side of the table per `xs`, south side facing +z; filled in facing pairs.
  const mrSeats = MR.map((r, ri) => r.xs.flatMap((x, i) => {
    const via = R(...r.entry), s = r.tz - r.co + 0.06, n = r.tz + r.co - 0.06;
    return [spot(`mr${ri}S${i}`, x, s, 0, 'meeting', [...via, { x, z: r.south }]),
      spot(`mr${ri}N${i}`, x, n, Math.PI, 'meeting', [...via, ...R([r.around, r.north], [x, r.north])])];
  }));
  const [mrSouth, mrNorth, mrSmall] = mrSeats;
  const IDLE_ORDER = [sofaA[1], coffee[0], pp[0], pp[1], stool[1], sofaA[0], chat[0], stool[2], chat[1], bean[0], coffee[1], sofaA[2], fridge, stool[0], bean[1], chat[2], stool[3],
    mrSmall[0], mrSmall[1], sofaB[0], sofaB[1], sofaB[2], ...meet, ...mrSouth, ...mrNorth, ...mrSmall.slice(2)];
  const LOBBY = { key: 'lobby', kind: 'idle', pos: { x: 15.6, z: -0.5 }, rotY: -Math.PI / 2, pose: 'chat', route: R([15.6, AISLE], [15.6, -0.5]) };

  // ----- lifts -----
  // Each lift is home (closed at 48), away (closed on another floor), travel, opening, open or closing. Arrivals ride up in
  // the car (`cargo`; `pending` until a car is free to fetch them) and walk out once the doors part. Leavers call it at the
  // panel, wait beside the doors, board, turn round, and are removed once the car has gone. Doors hold for anyone coming
  // or standing in the doorway, and reopen for them while closing.
  const PANEL = { x: LIFT.x - 0.45, z: LIFT.z };
  const inCar = (L, i) => ({ x: LIFT.x + 1.05 + (i % 2) * 0.45, z: L.z + [0, -0.4, 0.4][Math.floor(i / 2) % 3] });
  const carSpot = (L, pos) => ({ key: 'lift', kind: 'lift', pos, rotY: -Math.PI / 2, route: [{ x: LIFT.x - 1.2, z: AISLE }, { x: LIFT.x - 0.6, z: L.z }, pos] });
  const calling = (L) => [...L.callers].some((p) => p.lv.stage !== 'walk');
  const waitAt = (L) => ({ x: LIFT.x - 0.95 - 0.45 * ([...L.callers].filter((q) => q.lv.stage !== 'walk').length % 3), z: L.z + (L === lifts[0] ? -0.6 : 0.6) });
  const theirs = () => lifts.filter((L) => !L.player);   // the cars sessions may use: not the one you've called
  const inDoorway = (L) => [...people.values()].some((p) => p.lv?.stage !== 'in' && Math.abs(p.root.position.z - L.z) < 0.7 && p.root.position.x > LIFT.x - 0.6 && p.root.position.x < LIFT.x + 0.5);
  function gone(p) { world.remove(p.root); for (const [k, v] of people) if (v === p) people.delete(k); }
  function setLift(L, state) {
    if ((state === 'opening' || state === 'closing') && L.state !== state) sfx.slide(L.at, L.player);
    L.state = state; L.t = 0;
  }
  function goTo(L, floor) { L.goal = floor; L.dir = Math.sign(floor - L.floor); setLift(L, 'travel'); }
  function ride(L, p) {   // into the car out of sight: placed standing, facing the doors
    L.cargo.add(p); p.lift = L; p.root.visible = true;
    p.spot = carSpot(L, inCar(L, L.cargo.size - 1)); p.place(p.spot);
  }
  function arrive(p) {
    const free = (L) => !L.player && (L.state === 'away' || (L.state === 'travel' && L.goal === 48 && L.dir > 0));
    const L = lifts.find(free) || theirs().find((x) => x.state === 'home') || theirs().reduce((a, b) => (b.pending.length < a.pending.length ? b : a));
    p.root.visible = false; p.lift = L; p.place(carSpot(L, inCar(L, 0)));
    if (free(L)) ride(L, p); else L.pending.push(p);
  }
  function leave(p) {
    const fresh = lifts.some((L) => L.exits.delete(p));   // still stepping out of the car: turn straight round
    const C = p.lift;
    if (C) {   // gone again before they even stepped out: stay in the car, or never show up at all
      p.lift = null;
      if (C.pending.includes(p)) { C.pending.splice(C.pending.indexOf(p), 1); gone(p); return; }
      C.cargo.delete(p); C.riders.add(p); p.lv = { L: C, stage: 'in' };
      return;
    }
    const L = theirs().find((x) => x.state === 'open' || x.state === 'opening') || theirs().find(calling) || theirs().find((x) => x.state === 'home')
      || theirs().reduce((a, b) => (b.callers.size < a.callers.size ? b : a));
    const press = !lifts.some(calling) && L.state !== 'open';
    p.lv = { L, stage: 'walk', press };
    L.callers.add(p);
    p.path = [...(fresh ? [] : routeOut(p)), { x: LIFT.x - 1.2, z: AISLE }, press ? PANEL : waitAt(L)];
    p.spot = null;
    p.onArrive = () => atLift(p);
  }
  function atLift(p) {
    p.onArrive = null;
    if (p.lv.stage === 'walk' && p.lv.press) { p.lv.stage = 'press'; p.pressAt = p.time; p.spot = { pose: 'press', rotY: Math.PI / 2 }; return; }
    p.lv.stage = 'wait'; p.spot = { rotY: faceTo(p.root.position, p.lv.L.at) };
  }
  function liftFx(dt) {
    for (const L of lifts) {
      L.t += dt;
      for (const p of L.callers) {
        if (p.lv.stage === 'press' && p.time - p.pressAt > 1.2) { p.lv.stage = 'toWait'; p.path = [waitAt(L)]; p.onArrive = () => atLift(p); }
        if (p.lv.stage === 'wait' && (L.state === 'open' || (L.state === 'opening' && L.doorK > 0.8))) {
          p.lv.stage = 'board'; p.spot = null;
          p.path = [{ x: LIFT.x - 0.3, z: L.z }, inCar(L, L.nIn++)];
          p.onArrive = () => { p.onArrive = null; p.lv.stage = 'in'; L.callers.delete(p); L.riders.add(p); p.spot = { rotY: -Math.PI / 2 }; };
        }
      }
      for (const p of L.exits) if (!p.path.length || p.root.position.x < LIFT.x - 0.8) L.exits.delete(p);
      const holding = [...L.callers].some((p) => p.lv.stage !== 'walk' || Math.hypot(p.root.position.x - LIFT.x, p.root.position.z - L.z) < 4) || L.exits.size || inDoorway(L);   // incl. anyone about to reach it
      if (L.player) myCar(L, dt);
      else switch (L.state) {
        case 'home':
          if (calling(L)) { sfx.ding(L.at); setLift(L, 'opening'); }
          else if (L.pending.length) goTo(L, 30 + Math.floor(Math.random() * 15));   // fetch them from below
          break;
        case 'away':
          for (const p of L.pending.splice(0)) ride(L, p);
          if (L.cargo.size || calling(L)) goTo(L, 48);
          break;
        case 'travel':
          L.floor += L.dir * dt * 9;
          if ((L.goal - L.floor) * L.dir <= 0) {
            L.floor = L.goal; L.dir = 0;
            if (L.goal === 48) { sfx.ding(L.at); setLift(L, 'opening'); }
            else { for (const p of L.riders) gone(p); L.riders.clear(); setLift(L, 'away'); }
          }
          break;
        case 'opening':
          L.doorK = Math.min(1, L.doorK + dt / 1.1);
          if (L.doorK > 0.6) for (const p of L.cargo) { L.cargo.delete(p); p.lift = null; L.exits.add(p); sendTo(p, p.want || LOBBY); }
          if (L.doorK === 1) setLift(L, 'open');
          break;
        case 'open':
          if (L.t > 2.2 && !holding) setLift(L, 'closing');
          break;
        case 'closing':
          L.doorK = Math.max(0, L.doorK - dt / 1.3);
          if (holding) setLift(L, 'opening');
          else if (L.doorK === 0) {
            L.nIn = 0;
            if (L.riders.size) goTo(L, Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 40));
            else if (L.pending.length) goTo(L, 30 + Math.floor(Math.random() * 15));
            else setLift(L, 'home');
          }
          break;
      }
      const e = ease(Math.round(L.floor) === 48 ? L.doorK : 0);   // your car opening on another floor stays shut here
      L.leaves.forEach((m, i) => { m.position.z = L.z + (i ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
      paintIndicator(L);
    }
    lifts.callM.emissiveIntensity = lifts.some((L) => calling(L) && L.state !== 'open') || mine.call ? 2.5 : 0;
    myLift(dt);
  }

  // ----- riding the lifts yourself -----
  // Click the call panel and the nearest car no session needs is yours (`mine.L`, `L.player`) until you step out and it
  // closes: it opens, you walk in, press a floor on the car panel, and ride. Sessions keep using the other car meanwhile.
  // The other floors (THE ARCHIVE, ...) are separate scenes: the swap happens behind closed doors, and the car stays there for you.
  // FLOORS lists every floor the car panel offers, top first; `away` is the floor you're on when it isn't the office. A floor is
  // { n, label, title, scene, enter(z), bound(p), map(), colliders, hits, look } plus the car from liftShaft (see setFloor, renderFloor).
  // A floor with `y` instead of a scene is part of the office scene, that far up (THE ROOF): drawn by renderFrame, with leave().
  const ARCHIVE = -2;
  const OFFICE = { n: 48, label: 'OFFICE', title: 'Office' }, FLOORS = [OFFICE];
  let away = null;
  const addFloor = (F) => { FLOORS.push(F); FLOORS.sort((a, b) => b.n - a.n); for (const P of carPanels()) paintPanel(P, null); };
  const carPanels = () => [...lifts.map((L) => L.panel), ...FLOORS.filter((F) => F.panel).map((F) => F.panel)];
  const mine = { L: null, call: false, goal: null, from: 48, to: 48, k: 0, dur: 1 };
  const inMyCar = () => !!mine.L && player.x > LIFT.x + 0.3 && Math.abs(player.z - mine.L.z) < CAR.w / 2;
  const atMyDoor = () => !!mine.L && player.x > LIFT.x - 0.7 && player.x < LIFT.x + 0.45 && Math.abs(player.z - mine.L.z) < DOOR.w / 2 + 0.1;
  const spare = (L) => !L.player && !L.pending.length && !L.cargo.size && !L.callers.size && !L.riders.size && !L.exits.size && ['home', 'away', 'open', 'closing'].includes(L.state);
  function carPanel(parent, z) {   // the car's floor buttons, on the return beside the doors: one per floor, top floor first
    const scr = makeScreen(parent, 0.1, 0.34, 80, 272, LIFT.x + 0.3615, 1.2, z + 0.68);
    scr.mesh.rotation.y = Math.PI / 2;
    Object.assign(scr.mesh.userData, { action: 'liftpanel', reach: 2.2, floorAt: (uv) => FLOORS[clamp(Math.floor((1 - uv.y) * FLOORS.length), 0, FLOORS.length - 1)].n });
    return scr;
  }
  function paintPanel(scr, lit) {
    const { ctx: c, W, H } = scr, step = H / FLOORS.length, r = Math.min(27, step * 0.3);
    c.fillStyle = '#4d5157'; c.fillRect(0, 0, W, H); c.textAlign = 'center';
    FLOORS.forEach(({ n: f, label: t }, i) => {
      const y = step * (i + 0.42);
      c.beginPath(); c.arc(W / 2, y, r, 0, Math.PI * 2); c.fillStyle = '#d9dcdf'; c.fill();
      c.lineWidth = r / 5.4; c.strokeStyle = f === lit ? '#ffb347' : '#8b9096'; c.stroke();
      c.fillStyle = '#26282b'; c.font = `600 ${Math.round(r * 0.9)}px ${FONT}`; c.fillText(floorName(f), W / 2, y + r * 0.3);
      c.fillStyle = '#e8e6e1'; c.font = `600 ${Math.min(12, Math.round(r * 0.48))}px ${FONT}`; c.fillText(fit(c, t, W - 4), W / 2, y + r * 1.75);
    });
    c.textAlign = 'left'; scr.tex.needsUpdate = true;
  }
  const hitBox = (parent, w, h, d, x, y, z, ud) => { const m = box(parent, w, h, d, '#fff', x, y, z, { shadow: false }); m.visible = false; Object.assign(m.userData, ud); return m; };
  lifts.callHit = hitBox(world, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
  for (const L of lifts) { L.panel = carPanel(world, L.z); paintPanel(L.panel, null); }

  function callLift() {
    const L = mine.L;
    if (L) { if (L.state === 'closing' || L.state === 'parked') setLift(L, 'opening'); return; }
    if (!mine.call) toast('Lift called');
    mine.call = true;
  }
  function pressFloor(f) {
    const L = mine.L;
    if (!L || L.state === 'travel') return;
    mine.goal = f === Math.round(L.floor) ? null : f;
    if (mine.goal === null && L.state !== 'open') setLift(L, 'opening');
    for (const P of carPanels()) paintPanel(P, mine.goal);
  }
  function travelTo(L, f) {
    Object.assign(mine, { from: L.floor, to: f, k: 0, dur: clamp(Math.abs(f - L.floor) / 11, 2.5, 5.5) });
    L.goal = f; L.dir = Math.sign(f - L.floor); setLift(L, 'travel');
    if (inMyCar()) { setFloor(f === 48 ? null : FLOORS.find((F) => F.n === f)); sfx.hum(true); }
  }
  function release(L) {   // back to the sessions, closed at whatever floor it's on
    L.player = false; L.floor = Math.round(L.floor); L.dir = 0; L.doorK = 0;
    setLift(L, L.floor === 48 ? 'home' : 'away');
    Object.assign(mine, { L: null, goal: null });
    paintPanel(L.panel, null);
  }
  function myCar(L, dt) {
    const inside = inMyCar(), door = atMyDoor(), here = Math.round(L.floor);
    switch (L.state) {
      case 'opening':
        L.doorK = Math.min(1, L.doorK + dt / 1.1);
        if (L.doorK === 1) setLift(L, 'open');
        break;
      case 'open':
        if ((mine.goal !== null && inside && !door && L.t > 0.6) || (!inside && !door && L.t > 4)) setLift(L, 'closing');
        break;
      case 'closing':
        L.doorK = Math.max(0, L.doorK - dt / 1.3);
        if (door) setLift(L, 'opening');
        else if (L.doorK === 0) setLift(L, 'parked');
        break;
      case 'parked':
        if (inside && mine.goal !== null) travelTo(L, mine.goal);
        else if (!inside && here === 48 && !away) release(L);
        break;
      case 'travel':
        mine.k = Math.min(1, mine.k + dt / mine.dur);
        L.floor = lerp(mine.from, mine.to, ease(mine.k));
        if (mine.k === 1) {
          L.floor = mine.to; L.dir = 0; mine.goal = null; sfx.hum(false);
          for (const P of carPanels()) paintPanel(P, null);
          sfx.ding(L.at, true); setLift(L, 'opening');
          if (away) toast(`<b>${away.title.toUpperCase()}</b> · ${floorName(away.n)}`);
        }
        break;
    }
  }
  function myLift() {
    if (mine.call && !mine.L) {   // the nearest car nobody else needs (one already here first) comes for you
      const L = lifts.filter(spare).sort((a, b) => Math.abs(a.floor - 48) - Math.abs(b.floor - 48) || Math.abs(a.z - player.z) - Math.abs(b.z - player.z))[0];
      if (L) {
        mine.call = false; mine.L = L; L.player = true; mine.goal = null;
        if (L.state === 'home') { sfx.ding(L.at, true); setLift(L, 'opening'); }
        else if (L.state === 'away') travelTo(L, 48);
        else if (L.state === 'closing') setLift(L, 'opening');
      }
    }
    const L = mine.L;
    const F = away;
    if (!F?.leaves || !L) return;   // (inside a repo there's no lift)
    const e = ease(L.doorK);
    F.leaves.forEach((m, i) => { m.position.z = (i ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
    Object.assign(F.ind, { floor: L.floor, dir: L.dir }); paintIndicator(F.ind);
    F.callM.emissiveIntensity = L.state === 'opening' ? 2.5 : 0;
  }
  function resetLift() {   // leaving the 3D view: you're back at your desk and the car goes back to the sessions
    mine.call = false;
    if (mine.L) release(mine.L);
    sfx.hum(false);
    setFloor(null);
  }
  // Your car while it's yours: its walls, and the doorway while the doors are open (the core's collider rules otherwise).
  function carCollide(p) {
    const L = mine.L;
    if (!L) return false;
    const r = 0.25, front = LIFT.x + 0.1, open = L.doorK > 0.75, half = DOOR.w / 2 - r, inCar = p.x > front;
    if (!inCar && !(open && p.x > LIFT.x - 0.6 && Math.abs(p.z - L.z) < DOOR.w / 2)) return false;
    if (!inCar && p.x < LIFT.x - r) return true;   // in front of the open doors: nothing to bump into
    p.x = Math.min(p.x, front + CAR.d - r);
    p.z = clamp(p.z, L.z - CAR.w / 2 + r, L.z + CAR.w / 2 - r);
    if (!open) p.x = Math.max(p.x, front + 0.05 + r);
    else if (p.x < front + r && Math.abs(p.z - L.z) > half) {   // a jamb: push out the shorter way
      const dz = Math.abs(p.z - L.z) - half, dx = front + r - p.x;
      if (dx < dz) p.x = front + r; else p.z = L.z + Math.sign(p.z - L.z) * half;
    }
    return true;
  }

  // ----- THE ARCHIVE (B2) -----
  // A bright white void: a seamless floor fading into white haze, a freestanding lift back up, and in the middle one steel
  // filing cabinet (`arch.drawers`: a group per drawer, front at +z in the cabinet's space, so sliding one out is +z).
  // Its own scene and composer; while you're down here the office still runs, but isn't drawn or heard.
  const ARCH = { x: LIFT.x - 24, z: LIFT.z, r: 84 };   // the cabinet, 24 m out from the lift
  const arch = { n: ARCHIVE, label: 'ARCHIVE', title: 'The Archive', on: false, colliders: [], drawers: [], composer: null };
  {
    // Plain white haze, brightened by exposure (see renderFloor): an over-bright background clear gets clamped.
    const S = arch.scene = new THREE.Scene(), haze = new THREE.Color('#ffffff');
    S.background = haze; S.fog = new THREE.Fog(haze, 8, 95);   // far enough to make out the gateway, 70 m off
    S.environment = scene.environment; S.environmentIntensity = 0.7;
    const key = arch.key = new THREE.DirectionalLight('#ffffff', 0.75); key.position.set(-6, 14, 5);
    S.add(arch.hemi = new THREE.HemisphereLight('#ffffff', '#dcdcdc', 1.5), key);
    // Unlit and a shade under the haze, so it greys a touch around you and fades into the haze with no horizon at all.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.87, 0.87, 0.87) }));
    floor.rotation.x = -Math.PI / 2; floor.layers.set(1); S.add(floor);   // layer 1: out of the AO pass, which would draw the horizon back in
    // Soft contact shadows: a blurred black rectangle, a tight dark one and a wide faint one under each thing.
    const blob = makeCanvas(256, 256);
    blob.ctx.filter = 'blur(26px)'; blob.ctx.fillStyle = '#000'; blob.ctx.fillRect(64, 64, 128, 128); blob.tex.needsUpdate = true; arch.blob = blob.tex;
    const shadow = (parent, w, d, x, z, o) => {
      for (const [k, a] of [[1.15, o], [2.4, o * 0.35]]) {   // the dark core is the middle half of the texture
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 4 * k, d * 4 * k), new THREE.MeshBasicMaterial({ map: blob.tex, color: '#000', transparent: true, opacity: a, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); m.layers.set(1); parent.add(m);
      }
    };
    // THE ARCHIVE in the floor, reading as you walk from the lift to the cabinet.
    const word = makeCanvas(2048, 256), wc = word.ctx;
    wc.font = `200 150px ${FONT}`; wc.letterSpacing = '60px'; wc.fillStyle = '#ffffff'; wc.textAlign = 'center'; wc.textBaseline = 'middle';
    wc.fillText('THE ARCHIVE', 1024 + 30, 132); word.tex.needsUpdate = true;
    const words = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: word.tex, color: new THREE.Color(0.55, 0.55, 0.55), transparent: true, depthWrite: false }));
    words.rotation.order = 'YXZ'; words.rotation.set(-Math.PI / 2, Math.PI / 2, 0); words.position.set(ARCH.x + 3.2, 0.003, ARCH.z); words.layers.set(1);
    S.add(words);

    // The filing cabinet: powder-coated putty steel, a little scuffed, four drawers with pulls, label cards and a lock.
    const wear = makeCanvas(256, 512), R = rng(48), w = wear.ctx;
    w.fillStyle = '#9ea198'; w.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2500; i++) { w.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '40,40,36'},${R() * 0.05})`; w.fillRect(R() * 256, R() * 512, 1 + R() * 3, 1 + R() * 3); }
    for (let i = 0; i < 22; i++) { w.strokeStyle = `rgba(${R() > 0.4 ? '210,212,205' : '70,70,64'},${0.12 + R() * 0.2})`; w.lineWidth = 0.6 + R(); const x = R() * 256, y = R() * 512; w.beginPath(); w.moveTo(x, y); w.lineTo(x + (R() - 0.5) * 40, y + (R() - 0.5) * 10); w.stroke(); }
    const edge = w.createLinearGradient(0, 0, 256, 0); edge.addColorStop(0, 'rgba(60,60,55,.18)'); edge.addColorStop(0.06, 'rgba(0,0,0,0)'); edge.addColorStop(0.94, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(60,60,55,.18)');
    w.fillStyle = edge; w.fillRect(0, 0, 256, 512); wear.tex.needsUpdate = true;
    const bodyM = new THREE.MeshStandardMaterial({ map: wear.tex, metalness: 0.35, roughness: 0.48 }), chromeM = mat('#d7dade', { metalness: 1, roughness: 0.18 });
    const cab = arch.cabinet = new THREE.Group(), W = 0.47, H = 1.32, D = 0.62, base = 0.08, gap = 0.008, dh = (H - base - 0.012 - gap * 5) / 4;
    cab.position.set(ARCH.x, 0, ARCH.z); cab.rotation.y = Math.PI / 2;   // fronts face the lift
    cab.add(mergedBoxes([[0.012, H - base, D, -W / 2 + 0.006, base + (H - base) / 2, 0], [0.012, H - base, D, W / 2 - 0.006, base + (H - base) / 2, 0],
      [W, 0.012, D, 0, H - 0.006, 0], [W, H - base, 0.012, 0, base + (H - base) / 2, -D / 2 + 0.006]], bodyM));
    cab.add(mergedBoxes([[W - 0.03, 0.075, D - 0.05, 0, 0.0375, -0.01, '#2d2f2c'], [W - 0.024, H - base - 0.012, 0.004, 0, base + (H - base) / 2, D / 2 - 0.024, '#1e1f1d']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
    ['A – F', 'G – L', 'M – R', 'S – Z'].reverse().forEach((t, i) => {
      const g = new THREE.Group(), fz = D / 2 - 0.011;
      g.position.set(0, base + gap + i * (dh + gap) + dh / 2, 0);
      g.add(mergedBoxes([[W - 0.024 - gap, dh, 0.02, 0, 0, fz]], bodyM));
      g.add(mergedBoxes([[0.15, 0.016, 0.014, 0, -0.035, fz + 0.03], [0.012, 0.016, 0.03, -0.068, -0.035, fz + 0.016], [0.012, 0.016, 0.03, 0.068, -0.035, fz + 0.016],
        [0.104, 0.054, 0.003, 0, 0.07, fz + 0.011]], chromeM));
      const card = makeCanvas(192, 96);
      card.ctx.fillStyle = '#f1ead9'; card.ctx.fillRect(0, 0, 192, 96); card.ctx.fillStyle = '#2b2a28'; card.ctx.font = `600 40px "Courier New", ${MONO}`; card.ctx.textAlign = 'center'; card.ctx.fillText(t, 96, 62);
      card.tex.needsUpdate = true;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.044), new THREE.MeshStandardMaterial({ map: card.tex, roughness: 0.9 }));
      lab.position.set(0, 0.07, fz + 0.0128); g.add(lab);
      if (i === 3) { const lock = cyl(g, 0.011, 0.011, 0.012, '', W / 2 - 0.06, dh / 2 - 0.035, fz + 0.014, { material: chromeM, seg: 20 }); lock.rotation.x = Math.PI / 2; }
      cab.add(g); arch.drawers.push({ g, label: t, open: 0 });
    });
    arch.drawers.reverse();   // top drawer first
    arch.dims = { W, D, dh };
    arch.cabHit = hitBox(cab, W, H, D + 0.06, 0, H / 2, 0.03, { action: 'cabinet', reach: 4 });
    S.add(cab);
    shadow(S, D / 2 + 0.03, W / 2 + 0.03, ARCH.x, ARCH.z, 0.75);
    arch.colliders.push({ minX: ARCH.x - D / 2, maxX: ARCH.x + D / 2, minZ: ARCH.z - W / 2, maxZ: ARCH.z + W / 2 });

    // The lift back up: a freestanding stone shaft, the same car as upstairs, so the swap behind its doors is seamless.
    // Built about z = 0 and moved onto your car's z when you arrive (see arch.enter).
    Object.assign(arch, liftShaft());
    const lift = arch.lift, back = LIFT.x + 0.1 + CAR.d, sw = CAR.w / 2 + 0.3;
    shadow(lift, (back + 0.2 - LIFT.x) / 2, sw, (LIFT.x + back + 0.2) / 2, 0, 0.6);
    S.add(lift);
    arch.hits = [arch.cabHit, arch.callHit, arch.panel.mesh, cab, lift];
    // Brighter than the office, no bloom or grade (see renderFloor); the floor and its shadows stay out of the AO (layer 1).
    arch.look = { exposure: 1.5, hemi: 1.5, sky: new THREE.Color('#ffffff'), ground: new THREE.Color('#dcdcdc'), env: 0.7, bloom: 0, grade: 0, lights: [[key, 0.75]], aoSkip1: true };
    arch.enter = (z) => {
      arch.lift.position.z = z;
      arch.colliders.length = arch.nFixed;   // the cabinet, its open drawer (see cabinetFx) and the gateway
      loadRepos();
      arch.colliders.push({ minX: LIFT.x, maxX: LIFT.x + 0.3 + CAR.d, minZ: z - CAR.w / 2 - 0.3, maxZ: z + CAR.w / 2 + 0.3 });
    };
    arch.bound = (p) => {   // the void ends in a soft wall you don't see
      const dx = p.x - ARCH.x, dz = p.z - ARCH.z, d = Math.hypot(dx, dz);
      if (d > ARCH.r) { p.x = ARCH.x + (dx / d) * ARCH.r; p.z = ARCH.z + (dz / d) * ARCH.r; }
    };
    arch.map = drawArchiveMap;
    addFloor(arch);
  }
  // ----- THE ARCHIVE's filing cabinet: your GitHub repos -----
  // Click a drawer and it slides out, and keeps on sliding: 4–14 m of steel drawer out of a 62 cm cabinet, with a hanging folder
  // per repo (filed by name into A–F, G–L, M–R, S–Z; anything else up front). The tray and folders are cut off at the cabinet's
  // dark backing, so nothing ever pokes out behind it. Click a folder to lift it out and read it (the .of-folder overlay).
  const LANG = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', HTML: '#e34c26', CSS: '#563d7c', Java: '#b07219', 'C#': '#178600', 'C++': '#f34b7d',
    C: '#555555', Go: '#00add8', Rust: '#dea584', Shell: '#89e051', Swift: '#f05138', Kotlin: '#a97bff', Ruby: '#701516', PHP: '#4f5d95', Dart: '#00b4ab', Vue: '#41b883',
    Svelte: '#ff3e00', Lua: '#000080', 'Jupyter Notebook': '#da5b0b', GDScript: '#355570', Dockerfile: '#384d54', SCSS: '#c6538c', Astro: '#ff5a03' };
  const langColor = (l) => LANG[l] || (l ? `hsl(${hash(l) % 360},45%,48%)` : '#b9b4a6');
  const drawerOf = (name) => { const c = name[0].toUpperCase(); return !/[A-Z]/.test(c) ? 0 : c < 'G' ? 0 : c < 'M' ? 1 : c < 'S' ? 2 : 3; };
  const files = arch.files = { list: null, err: null, at: 0, loading: false, held: null, tabCell: { value: new THREE.Vector2(1, 1) } };
  const { W: CW, D: CD, dh: DH } = arch.dims, FZ = CD / 2 - 0.011, WI = CW - 0.06, CUT = CD / 2 - 0.03, RAIL = DH / 2 - 0.055, ROD = RAIL + 0.007;
  const TAB = { w: 0.17, h: 0.048, cols: 8, cw: 256, ch: 72 }, ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0);
  const trayM = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5 }), folderM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  // One unit of drawer along -z, stretched to however much of it is out: floor, sides, the hanging-file rails and the slides.
  const trayG = mergedBoxes([[WI, 0.006, 1, 0, -DH / 2 + 0.023, -0.5, '#9ea198'], ...[-1, 1].flatMap((s) => [
    [0.006, RAIL + DH / 2 - 0.02, 1, s * WI / 2, (RAIL - DH / 2 + 0.02) / 2, -0.5, '#9ea198'],
    [0.014, 0.004, 1, s * (WI / 2 - 0.005), RAIL + 0.002, -0.5, '#d7dade'],
    [0.01, 0.034, 1, s * (WI / 2 + 0.009), -0.02, -0.5, '#6f726c']])], trayM).geometry;
  // A hanging folder about its rod, which rests on the rails; the body is white so the instance colour makes it manila or kraft.
  const folderG = mergedBoxes([[0.34, 0.2, 0.006, 0, -0.106, 0, '#ffffff'], [WI + 0.012, 0.006, 0.008, 0, 0, 0, '#45474a'],
    ...[-1, 1].map((s) => [0.006, 0.02, 0.008, s * 0.17, -0.008, 0, '#45474a'])], folderM).geometry;
  const tabG = new THREE.PlaneGeometry(TAB.w, TAB.h);
  // The loose paper packed between the folders: a sheet standing on the drawer floor, its top corner dog-eared (mirrored at
  // at random), white so the instance colour makes it a sheet, a form or a thin file.
  const paperG = (() => {
    const w = 0.29, h = 0.2, c = 0.028, x = w / 2, sh = new THREE.Shape([[-x, 0], [x, 0], [x, h - c], [x - c, h], [-x, h]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ShapeGeometry(sh).toNonIndexed(), n = g.attributes.position.count;
    const flap = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x, h - c, 0, x - c, h, 0, x - c, h - c, 0.002], 3));
    flap.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3)); flap.setAttribute('color', new THREE.Float32BufferAttribute(new Array(9).fill(0.84), 3));
    return mergeGeometries([g, flap]);
  })();
  const paperM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const PAPER = ['#f5f3ec', '#f1eee4', '#ece8dc', '#f7f6f1', '#e9e4d4', '#f5f3ec', '#e3ecf2', '#f2e6e4', '#dcc590', '#cfb07b', '#f3ecc8'];
  const tabAt = [-0.11, 0, 0.11].map((x) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0.028, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1)));
  const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);   // the tab's other face, so it reads from either end of the drawer
  // Tabs share one atlas; each instance picks its cell with an offset attribute.
  const tabM = new THREE.MeshStandardMaterial({ roughness: 0.55, map: makeCanvas(4, 4).tex });
  tabM.onBeforeCompile = (sh) => {
    sh.uniforms.tabCell = files.tabCell;
    sh.vertexShader = 'attribute vec2 tabUv;\nuniform vec2 tabCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = vMapUv * tabCell + tabUv;');
  };
  arch.drawers.forEach((d, i) => {
    Object.assign(d, { k: 0, to: 0, L: 4.5, sp: 0.3, items: [] });
    d.tray = new THREE.Mesh(trayG, trayM); d.tray.position.z = FZ - 0.01; d.tray.castShadow = d.tray.receiveShadow = true; d.g.add(d.tray);
    d.hit = hitBox(d.g, CW - 0.03, DH, 0.05, 0, 0, FZ, { action: 'cabinet', reach: 4, drawerAt: () => i });
    // A soft shadow on the floor under what's out, fainter the higher the drawer.
    d.shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.3 - d.g.position.y * 0.15, depthWrite: false }));
    d.shade.rotation.x = -Math.PI / 2; d.shade.layers.set(1); d.shade.visible = false; arch.cabinet.add(d.shade);
  });
  arch.cabHit.userData.drawerAt = (p) => arch.drawers.reduce((b, d, j) => (Math.abs(d.g.position.y - p.y) < Math.abs(arch.drawers[b].g.position.y - p.y) ? j : b), 0);
  arch.drawerBox = { minX: ARCH.x, maxX: ARCH.x, minZ: ARCH.z, maxZ: ARCH.z };
  arch.colliders.push(arch.drawerBox);
  Object.assign(arch, { fx: (dt, t) => { cabinetFx(dt); gateFx(dt, t); }, leave: cabinetReset, toggleDrawer, pickUp, putBack, loadRepos });   // fx/leave: floor hooks (see setFloor)

  function toggleDrawer(i) {
    const d = arch.drawers[i];
    if (!d || files.held) return;
    d.to = d.to ? 0 : 1;
    if (d.to) for (const o of arch.drawers) if (o !== d) o.to = 0;
    loadRepos();
  }
  const frontP = new THREE.Vector3();
  const drawerFront = (d) => frontP.set(ARCH.x + FZ + d.g.position.z, d.g.position.y, ARCH.z);   // the cabinet faces +x
  function cabinetFx(dt) {
    let out = 0, moving = false;
    for (const d of arch.drawers) {
      const dur = 0.7 + d.L * 0.07;
      if (d.to !== d.was) {   // set off: the latch lets go (opening from shut), and it rolls for as long as it'll travel
        if (d.to && d.k === 0) sfx.cabinet('latch', drawerFront(d), 0.35);
        d.roll?.stop(); d.roll = d.k === d.to ? null : sfx.roll(drawerFront(d), (d.to ? 1 - d.k : d.k) * dur);
        d.was = d.to;
      }
      if (d.k !== d.to) {
        d.k = d.to ? Math.min(1, d.k + dt / dur) : Math.max(0, d.k - dt / dur); moving = true;
        if (d.k === d.to) { sfx.cabinet(d.to ? 'thunk' : 'slam', drawerFront(d), d.to ? 0.45 : 0.6); d.roll = null; }
      }
      const s = (d.L - 0.4) * ease(d.k), n = d.items.length;
      d.g.position.z = s;
      if (d.roll) d.roll.move(drawerFront(d));
      d.tray.scale.z = Math.min(d.L, FZ - 0.01 - CUT + s);
      const shown = n ? clamp(Math.floor((FZ - 0.13 - CUT + s) / d.sp) + 1, 0, n) : 0;
      if (d.bodies) d.bodies.count = d.tabs.count = d.backs.count = shown;
      if (d.papers) { let a = 0, b = d.pz.length; while (a < b) { const c = (a + b) >> 1; if (d.pz[c] + s > CUT) a = c + 1; else b = c; } d.papers.count = a; }
      d.shade.visible = s > 0.05;
      if (d.shade.visible) { d.shade.scale.set(CW * 1.9, s + 0.3, 1); d.shade.position.set(0, 0.003, CD / 2 + s / 2); }
      out = Math.max(out, s);
      // Walk off and it slides home.
      if (d.to && !files.held) {
        const b = arch.drawerBox, dx = Math.max(b.minX - player.x, 0, player.x - b.maxX), dz = Math.max(b.minZ - player.z, 0, player.z - b.maxZ);
        if (Math.hypot(dx, dz) > 5) d.to = 0;
      }
    }
    Object.assign(arch.drawerBox, out > 0.02 ? { minX: ARCH.x + CD / 2, maxX: ARCH.x + FZ + 0.03 + out, minZ: ARCH.z - CW / 2, maxZ: ARCH.z + CW / 2 } : { minX: ARCH.x, maxX: ARCH.x, minZ: ARCH.z, maxZ: ARCH.z });
    if (moving && mode === 'free') collide(player);   // a drawer sliding into you pushes you along
    heldFx(dt);
  }

  async function loadRepos() {
    if (files.loading || (files.list && Date.now() - files.at < 10 * 60e3)) return;
    files.loading = true;
    const r = await fetch('/api/repos').then(async (x) => ({ ok: x.ok, j: await x.json() })).catch((e) => ({ ok: false, j: { error: e.message } }));
    files.loading = false;
    if (r.ok) Object.assign(files, { list: r.j.repos, err: null, at: Date.now() });
    else if (!files.list) files.err = r.j;
    if (!files.held && (r.ok || !files.list)) refile();
  }
  // gh missing, signed out or failing: every drawer holds one folder saying so.
  const errFolder = () => ({ error: true, name: files.err?.signin ? 'gh isn’t signed in' : 'GitHub unavailable', description: files.err?.error || '', language: '' });
  function refile() {
    const all = files.list || [errFolder()];
    paintTabs(all);
    arch.drawers.forEach((d, i) => fileDrawer(d, files.list ? all.filter((f) => drawerOf(f.name) === i) : all));
  }
  function paintTabs(all) {
    const { cols, cw, ch } = TAB, rows = Math.ceil(all.length / cols), H = Math.min(8192, 2 ** Math.ceil(Math.log2(Math.max(rows * ch, 64)))), cap = cols * Math.floor(H / ch);
    const a = files.atlas = makeCanvas(cols * cw, H), c = a.ctx;
    all.forEach((f, j) => {
      f.cell = Math.min(j, cap - 1);
      const x = (f.cell % cols) * cw, y = Math.floor(f.cell / cols) * ch, stamp = f.error ? 'SEE INSIDE' : f.archived ? 'ARCHIVED' : f.private ? 'PRIVATE' : f.fork ? 'FORK' : '';
      c.fillStyle = '#c9d2d6'; c.fillRect(x, y, cw, ch);   // the clear plastic tab
      c.fillStyle = '#f7f3e8'; c.fillRect(x + 4, y + 4, cw - 8, ch - 8);   // its paper insert
      c.fillStyle = f.error ? '#c0392b' : langColor(f.language); c.fillRect(x + 4, y + 4, 14, ch - 8);
      c.fillStyle = '#0b0b0a'; c.font = `700 27px ${FONT}`; c.textBaseline = 'alphabetic';
      c.fillText(fit(c, f.name, cw - 36), x + 26, y + 34);
      c.font = `600 16px ${FONT}`; c.fillStyle = '#4f4a40'; c.fillText(fit(c, f.language || (f.error ? 'my-office' : '—'), 110), x + 26, y + 58);
      if (stamp) {
        c.font = `700 14px "Courier New", ${MONO}`; const w = c.measureText(stamp).width + 10;
        c.save(); c.translate(x + cw - 12 - w / 2, y + 53); c.rotate(-0.06);
        c.strokeStyle = c.fillStyle = '#b8352b'; c.lineWidth = 2; c.strokeRect(-w / 2, -10, w, 19); c.textAlign = 'center'; c.fillText(stamp, 0, 4); c.restore();
      }
    });
    a.tex.needsUpdate = true;
    tabM.map.dispose(); tabM.map = a.tex; tabM.needsUpdate = true;
    files.tabCell.value.set(1 / cols, ch / H);
  }
  function fileDrawer(d, items) {
    for (const m of [d.bodies, d.tabs, d.backs, d.papers]) if (m) { d.g.remove(m); m.dispose(); if (m === d.tabs || m === d.backs) m.geometry.dispose(); }
    const n = items.length, R = rng(hash(d.label) + n);
    d.items = items; d.L = clamp(1.5 + n * 0.25, 4.5, 14); d.sp = Math.min(0.4, (d.L - 0.9) / Math.max(n, 1));
    const geo = tabG.clone();
    d.bodies = new THREE.InstancedMesh(folderG, folderM, Math.max(n, 1)); d.tabs = new THREE.InstancedMesh(geo, tabM, Math.max(n, 1)); d.backs = new THREE.InstancedMesh(geo.clone(), tabM, Math.max(n, 1));
    const uv = new Float32Array(Math.max(n, 1) * 2), m = new THREE.Matrix4(), t = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const { cols, cw, ch } = TAB, cv = files.tabCell.value.y;
    items.forEach((f, j) => {
      e.set(-0.03 + (R() - 0.5) * 0.16, (R() - 0.5) * 0.02, (R() - 0.5) * 0.03);
      m.compose(new THREE.Vector3(0, ROD, FZ - 0.14 - j * d.sp), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      d.bodies.setMatrixAt(j, m); d.tabs.setMatrixAt(j, t.multiplyMatrices(m, tabAt[j % 3])); d.backs.setMatrixAt(j, t.multiply(FLIP));
      d.bodies.setColorAt(j, c.set(R() < 0.55 ? '#dcc48c' : '#c49d66').offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.06));
      uv[j * 2] = (f.cell % cols) * cw / (cols * cw); uv[j * 2 + 1] = 1 - (Math.floor(f.cell / cols) + 1) * cv;
    });
    const tabUv = new THREE.InstancedBufferAttribute(uv, 2);
    d.tabs.geometry.setAttribute('tabUv', tabUv); d.backs.geometry.setAttribute('tabUv', tabUv);
    for (const x of [d.bodies, d.tabs, d.backs]) {
      x.castShadow = true; x.computeBoundingSphere(); x.count = 0;
      Object.assign(x.userData, { action: 'folder', reach: 2.6, folderAt: (id) => ({ d, i: id }) });
      d.g.add(x);
    }
    d.backs.boundingSphere = d.tabs.boundingSphere = d.bodies.boundingSphere = d.bodies.boundingSphere.clone().union(d.tabs.boundingSphere);
    // Paper the whole way down: a sheet or thin file every ~1.3 cm, leaning a little, uneven, a few sticking up, none hard
    // against a folder. Ordered front to back (d.pz), so what's out of the cabinet is always the first `count`.
    const pz = d.pz = [], fz = items.map((_, j) => FZ - 0.14 - j * d.sp), back = FZ - 0.01 - d.L + 0.03, one = new THREE.Vector3();
    for (let z = FZ - 0.04; z > back; z -= 0.008 + R() * 0.01) if (!fz.some((f) => Math.abs(f - z) < 0.012)) pz.push(z);
    d.papers = new THREE.InstancedMesh(paperG, paperM, pz.length);
    const FLAT = new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(0, 0.2, 0);
    pz.forEach((z, j) => {
      const up = R() < 0.06 ? 0.015 + R() * 0.035 : R() * 0.012, file = R() < 0.12, hgt = file ? 1.04 : 0.86 + R() * 0.12;
      e.set((R() - 0.5) * 0.12, (R() - 0.5) * 0.04, (R() - 0.5) * 0.025);
      m.compose(one.set((R() - 0.5) * 0.04, -DH / 2 + 0.027 + up, z), q.setFromEuler(e), new THREE.Vector3(R() < 0.5 ? -1 : 1, hgt, 1));
      if (R() > 0.2) m.multiply(FLAT);   // most stand the other way up, the dog-ear down out of sight
      d.papers.setMatrixAt(j, m);
      d.papers.setColorAt(j, c.set(file ? PAPER[8 + Math.floor(R() * 3)] : PAPER[Math.floor(R() * 8)]).offsetHSL(0, 0, (R() - 0.5) * 0.04));
    });
    d.papers.raycast = () => {};   // you look past the paper to the folder it's filed behind
    d.papers.count = 0; d.papers.receiveShadow = true; d.papers.frustumCulled = false;
    d.g.add(d.papers);
  }

  function cabinetHover(h) {
    if (h.action === 'cabinet') {
      const d = arch.drawers[h.drawer], n = files.list ? d.items.length : 0;
      return `<b>Filing cabinet · ${d.label}</b><div class="m">${files.list ? `${n} repo${n === 1 ? '' : 's'}` : files.loading ? 'Fetching your repos…' : files.err ? escapeHtml(errFolder().name) : ''}</div><div class="k">Click to ${d.to ? 'close' : 'open'} the drawer</div>`;
    }
    const f = h.folder.d.items[h.folder.i];
    if (!f) return '';
    return `<b>${escapeHtml(f.name)}</b>${f.description ? `<div class="m">${escapeHtml(f.description.slice(0, 160))}</div>` : ''}
      <div class="k">${[f.private && 'Private', f.archived && 'Archived', f.fork && 'Fork', f.language].filter(Boolean).map(escapeHtml).join(' · ')}${f.error ? '' : ' · '}click to pick it up</div>`;
  }

  // ----- picking a folder up -----
  // The folder lifts off its rails into your hands (a copy; its instance hides meanwhile), then opens as a paper overlay.
  const folderEl = document.createElement('div');
  folderEl.className = 'of-folder';
  hud.appendChild(folderEl);
  style.textContent += `
    .of-hud .of-folder { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(40,36,28,.08), rgba(40,36,28,.42)); color: #2a2722; font: 13px/1.5 system-ui, -apple-system, sans-serif; }
    .of-hud.of-bare > .of-folder.on, .of-hud .of-folder.on { display: flex !important; }
    .of-folder .fo { position: relative; width: min(1180px, 94vw); height: min(760px, calc(100vh - 90px)); margin-top: 26px; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); background: #cfa96b; border-radius: 4px 8px 8px 8px; padding: 14px 14px 58px; box-shadow: 0 30px 90px rgba(0,0,0,.4); perspective: 1800px; animation: of-fo-in .3s ease-out; }
    .of-folder .tab { position: absolute; left: 0; top: -30px; height: 30px; max-width: 60%; padding: 6px 22px 0 16px; background: #cfa96b; border-radius: 8px 14px 0 0; font: 700 14px "Courier New", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .of-folder .pg { background: #fbf8ef; overflow-y: auto; overscroll-behavior: contain; padding: 24px 28px; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
    .of-folder .l { transform-origin: 100% 50%; animation: of-fo-open .7s cubic-bezier(.2,.7,.25,1) both; border-right: 1px solid #ded5c0; backface-visibility: hidden; }
    .of-folder .r { font: 13.5px/1.6 "Courier New", Courier, monospace; background: repeating-linear-gradient(#fbf8ef 0 1100px, #e9e2d0 1100px 1104px); }
    @keyframes of-fo-in { from { transform: translateY(30px) scale(.9); opacity: 0; } }
    @keyframes of-fo-open { from { transform: rotateY(-95deg); } }
    .of-folder h1 { font: 700 26px/1.2 "Courier New", monospace; margin: 0 0 2px; overflow-wrap: anywhere; }
    .of-folder .own { color: #8a8170; font-size: 12px; }
    .of-folder .stamps { margin: 12px 0 4px; min-height: 24px; }
    .of-folder .stamp { display: inline-block; border: 2px solid #b8352b; color: #b8352b; font: 700 12px "Courier New", monospace; letter-spacing: .14em; padding: 1px 8px; margin-right: 8px; border-radius: 3px; transform: rotate(-4deg); opacity: .85; }
    .of-folder .stamp.ok { border-color: #2f6b45; color: #2f6b45; transform: rotate(2deg); }
    .of-folder .desc { font-size: 14px; margin: 8px 0 12px; overflow-wrap: anywhere; }
    .of-folder dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; margin: 0; }
    .of-folder dt { color: #8a8170; } .of-folder dd { margin: 0; }
    .of-folder h3 { font: 700 11px system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #8a8170; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e3dccb; }
    .of-folder .bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #e6dfcf; margin: 4px 0 6px; }
    .of-folder .lg { font-size: 12px; color: #5d574c; } .of-folder .lg span { margin-right: 12px; white-space: nowrap; }
    .of-folder .lg i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
    .of-folder .files { columns: 2; font: 12px/1.65 "Courier New", monospace; overflow-wrap: anywhere; }
    .of-folder .cm { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; font-size: 12px; }
    .of-folder .cm code { font: 12px "Courier New", monospace; color: #8a8170; } .of-folder .cm small { display: block; color: #8a8170; }
    .of-folder .r h2, .of-folder .r h3, .of-folder .r h4, .of-folder .r h5, .of-folder .r h6, .of-folder .r h7 { font: 700 15px/1.3 "Courier New", monospace; letter-spacing: 0; text-transform: none; color: #2a2722; border: 0; margin: 18px 0 6px; }
    .of-folder .r h2 { font-size: 22px; } .of-folder .r h3 { font-size: 18px; text-decoration: underline; }
    .of-folder .r p, .of-folder .r ul, .of-folder .r ol, .of-folder .r blockquote { margin: 0 0 10px; overflow-wrap: anywhere; }
    .of-folder .r blockquote { border-left: 3px solid #d9cfb8; padding-left: 10px; color: #5d574c; }
    .of-folder .r pre { background: #f1ecdf; padding: 8px 10px; overflow-x: auto; font: 12px/1.45 "Courier New", monospace; margin: 0 0 10px; }
    .of-folder .r code { background: #efe8d8; padding: 0 3px; } .of-folder .r .tr { white-space: pre; overflow-x: auto; font-size: 12px; }
    .of-folder a { color: #1f4f99; }
    .of-folder .n { color: #8a8170; font-style: italic; }
    .of-folder .btns { position: absolute; right: 14px; bottom: 12px; display: flex; gap: 8px; }
    .of-folder .btns > * { font: 600 13px system-ui, sans-serif; background: #2a2722; color: #f6f1e4; border: 0; border-radius: 7px; padding: 8px 14px; cursor: pointer; text-decoration: none; }
    .of-folder .btns > :hover { background: #000; }
    .of-folder kbd { font: inherit; opacity: .7; }
  `;
  let turnAt = 0;   // a page turning every so often as you scroll through
  folderEl.addEventListener('scroll', (e) => {
    const el = e.target, y = el.scrollTop, now = performance.now();
    if (Math.abs(y - (el.turned || 0)) > 420 && now - turnAt > 220) { el.turned = y; turnAt = now; if (files.held) sfx.cabinet('page', files.hand.position, 0.18); }
  }, true);
  folderEl.addEventListener('click', (e) => {
    if (e.target === folderEl || e.target.closest('[data-act=back]')) putBack(true);
  });
  document.addEventListener('keydown', (e) => {
    if (!files.held || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); putBack(false);
  }, true);
  function pickUp(at) {
    const { d, i } = at || {}, f = d?.items[i];
    if (!f || files.held || mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    mode = 'folder'; keys.clear();
    const h = files.held = { d, i, f, k: 0, to: 1, m: [d.bodies, d.tabs, d.backs].map((x) => x.getMatrixAt(i, new THREE.Matrix4())), p: new THREE.Vector3(), q: new THREE.Quaternion() };
    for (const x of [d.bodies, d.tabs, d.backs]) { x.setMatrixAt(i, ZERO4); x.instanceMatrix.needsUpdate = true; }
    if (!files.hand) {   // the folder in your hands: the same body, its own copy of the tab
      const g = files.hand = new THREE.Group(), tab = files.handTab = makeCanvas(TAB.cw, TAB.ch);
      g.add(files.handBody = new THREE.Mesh(folderG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
      const t = new THREE.Mesh(tabG, new THREE.MeshStandardMaterial({ map: tab.tex, roughness: 0.55, side: THREE.DoubleSide }));
      t.applyMatrix4(tabAt[1]); g.add(t);
    }
    d.bodies.getColorAt(i, files.handBody.material.color);
    const { cols, cw, ch } = TAB;
    files.handTab.ctx.drawImage(files.atlas.canvas, (f.cell % cols) * cw, Math.floor(f.cell / cols) * ch, cw, ch, 0, 0, cw, ch); files.handTab.tex.needsUpdate = true;
    arch.scene.updateMatrixWorld();
    new THREE.Matrix4().multiplyMatrices(d.g.matrixWorld, h.m[0]).decompose(h.p, h.q, new THREE.Vector3());
    arch.scene.add(files.hand);
    sfx.cabinet('rustle', h.p, 0.5);
    showFolder(f, null);
    if (!f.error) fetch(`/api/repos/${encodeURIComponent(f.owner)}/${encodeURIComponent(f.name)}`).then(async (x) => ({ ok: x.ok, j: await x.json() })).catch((e) => ({ ok: false, j: { error: e.message } }))
      .then((r) => { if (files.held?.f === f) showFolder(f, r.ok ? r.j : { error: r.j.error || 'couldn’t read the repo' }); });
  }
  function putBack(relock) {
    const h = files.held;
    if (!h || !h.to) return;
    h.to = 0;
    folderEl.classList.remove('on');
    if (relock) renderer.domElement.requestPointerLock();
  }
  const handP = new THREE.Vector3(), handQ = new THREE.Quaternion(), TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0));
  function heldFx(dt) {
    const h = files.held;
    if (!h) return;
    h.k = h.to ? Math.min(1, h.k + dt / 0.55) : Math.max(0, h.k - dt / 0.5);
    if (h.k === 1 && !folderEl.classList.contains('on')) folderEl.classList.add('on');
    if (h.k === 0 && !h.to) { dropHeld(); return; }
    // Held up in front of your eyes, rising out of the drawer on a little arc.
    camera.updateMatrixWorld();
    handP.set(0, 0.07, -0.42).applyMatrix4(camera.matrixWorld);
    handQ.copy(camera.quaternion).multiply(TILT);
    const e = ease(h.k);
    files.hand.position.lerpVectors(h.p, handP, e); files.hand.position.y += Math.sin(Math.PI * h.k) * 0.25;
    files.hand.quaternion.slerpQuaternions(h.q, handQ, e);
  }
  function dropHeld(quiet) {
    const h = files.held;
    files.held = null;
    if (!h) return;
    if (!quiet) sfx.cabinet('rustle', h.p, 0.45);
    [h.d.bodies, h.d.tabs, h.d.backs].forEach((x, j) => { x.setMatrixAt(h.i, h.m[j]); x.instanceMatrix.needsUpdate = true; });
    arch.scene.remove(files.hand);
    folderEl.classList.remove('on');
    if (mode === 'folder') mode = 'free';
  }
  function cabinetReset() {   // leaving B2: everything filed away and shut
    if (!tess.warping) pullFx(0);
    dropHeld(true);
    for (const d of arch.drawers) { d.roll?.stop(); d.k = d.to = d.was = 0; d.roll = null; }
    cabinetFx(0);
  }

  // The folder's contents. Everything from GitHub is escaped; the README is a small markdown subset with no HTML.
  const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  function showFolder(f, x) {
    const s = (v) => escapeHtml(v), when = (t) => (t ? `${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${F.dur(Date.now() - Date.parse(t))} ago` : '—');
    let left, right;
    if (f.error) {
      left = `<h1>${s(f.name)}</h1><div class="stamps"><span class="stamp">NOT FILED</span></div>
        <p class="desc">The archive reads your repos through the GitHub CLI on this computer${files.err?.signin ? ', and it isn’t signed in' : ', and it failed'}.</p>
        <h3>To fix it</h3><p>In a terminal on this computer, run</p><pre style="font:14px 'Courier New',monospace;background:#f1ecdf;padding:8px 10px">gh auth login</pre>
        <p>then ride the lift back down (or reopen a drawer). If gh isn’t installed: <a href="https://cli.github.com" target="_blank" rel="noopener noreferrer">cli.github.com</a>.</p>`;
      right = `<h3>What gh said</h3><p>${s(f.description || 'nothing')}</p>`;
    } else {
      const st = [f.private ? '<span class="stamp">PRIVATE</span>' : '<span class="stamp ok">PUBLIC</span>', f.archived && '<span class="stamp">ARCHIVED</span>', f.fork && '<span class="stamp">FORK</span>'].filter(Boolean).join('');
      const langs = x?.languages?.filter((l) => l.size > 0) || [], total = langs.reduce((a, l) => a + l.size, 0);
      const col = (l) => (COLOR_RE.test(l.color || '') ? l.color : langColor(l.name));
      left = `<h1>${s(f.name)}</h1><div class="own">${s(f.owner)}/${s(f.name)}</div><div class="stamps">${st}</div>
        <div class="co">COORDINATES<b>${fmtCoord(coordOf(f))}</b></div>
        ${f.description ? `<p class="desc">${s(f.description)}</p>` : '<p class="desc n">No description.</p>'}
        <dl><dt>Language</dt><dd>${s(f.language || '—')}</dd><dt>Stars</dt><dd>★ ${f.stars}</dd><dt>Updated</dt><dd>${s(when(f.updatedAt))}</dd><dt>Size</dt><dd>${f.kb >= 1024 ? `${(f.kb / 1024).toFixed(1)} MB` : `${f.kb} KB`}</dd>
        ${x && !x.error ? `<dt>Branch</dt><dd>${s(x.branch || '—')}</dd><dt>Open PRs</dt><dd>${x.prs}</dd><dt>Open issues</dt><dd>${x.issues}</dd>` : ''}</dl>
        ${total ? `<h3>Languages</h3><div class="bar">${langs.map((l) => `<i style="width:${(l.size / total) * 100}%;background:${col(l)}"></i>`).join('')}</div>
          <div class="lg">${langs.slice(0, 8).map((l) => `<span><i style="background:${col(l)}"></i>${s(l.name)} ${((l.size / total) * 100).toFixed(1)}%</span>`).join('')}</div>` : ''}
        ${!x ? '<h3>Files</h3><p class="n">Reading the folder…</p>' : x.error ? `<h3>Files</h3><p class="n">Couldn’t read it: ${s(x.error)}</p>` : `
          <h3>Files</h3>${x.files.length ? `<div class="files">${x.files.map((e) => `<div>${e.type === 'dir' ? '▸ ' : '&nbsp; '}${s(e.name)}${e.type === 'dir' ? '/' : ''}</div>`).join('')}</div>` : '<p class="n">Empty.</p>'}
          <h3>Last commits</h3>${x.commits.length ? `<div class="cm">${x.commits.map((c) => `<code>${s(c.sha)}</code><div>${s(c.message)}<small>${s(c.author)} · ${s(when(c.date))}</small></div>`).join('')}</div>` : '<p class="n">None.</p>'}`}`;
      right = !x ? '<p class="n">Reading the folder…</p>' : x.error ? '' : x.readme ? readmeHtml(x.readme.text, f.url, x.branch) : '<p class="n">No README in this one.</p>';
    }
    folderEl.innerHTML = `<div class="fo"><div class="tab">${s(f.name)}</div><div class="pg l">${left}</div><div class="pg r">${right}</div>
      <div class="btns">${f.url ? `<a href="${s(f.url)}" target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a>` : ''}<button data-act="back">Put back <kbd>Esc</kbd></button></div></div>`;
  }
  function readmeHtml(text, url, branch) {
    const href = (h) => (/^https?:\/\//i.test(h) ? h : h.startsWith('#') ? '' : `${escapeHtml(url)}/blob/${escapeHtml(branch || 'HEAD')}/${h.replace(/^\.?\//, '')}`);
    const inline = (t) => escapeHtml(t).replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, a) => (a ? `[${a}]` : ''))
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, t2, h) => (href(h) ? `<a href="${href(h)}" target="_blank" rel="noopener noreferrer">${t2}</a>` : t2))
      .split(/(`[^`]+`)/).map((p, j) => (j % 2 ? `<code>${p.slice(1, -1)}</code>` : p
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])[*_]([^*_\s][^*_]*)[*_](?=[\s).,:;!?]|$)/g, '$1<i>$2</i>'))).join('');
    const out = [];
    let para = [], list = null, code = null;
    const flush = () => {
      if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
      if (list) { out.push(`</${list}>`); list = null; }
    };
    for (const raw of String(text).replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
      if (/^\s*(```|~~~)/.test(raw)) { if (code) { out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`); code = null; } else { flush(); code = []; } continue; }
      if (code) { code.push(raw); continue; }
      const l = raw.replace(/<\/?[a-z][^>]*>/gi, '');
      let m;
      if (!l.trim()) { if (!/^\s*<\/?[a-z]/i.test(raw)) flush(); }
      else if ((m = l.match(/^\s*(#{1,6})\s+(.*)/))) { flush(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2].replace(/\s#+\s*$/, ''))}</h${n}>`); }
      else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push('<hr>'); }
      else if ((m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/))) {
        const t = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (para.length || list !== t) flush();
        if (!list) { out.push(`<${t}>`); list = t; }
        out.push(`<li>${inline(m[2])}</li>`);
      }
      else if ((m = l.match(/^\s*>\s?(.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
      else if (/^\s*\|/.test(l)) { flush(); if (!/^\s*\|[\s:|-]+\|?\s*$/.test(l)) out.push(`<div class="tr">${inline(l.trim())}</div>`); }
      else { if (list) flush(); para.push(l.trim()); }
    }
    if (code) out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
    flush();
    return out.join('') || '<p class="n">The README is empty.</p>';
  }

  // ----- THE GATEWAY, and inside a repo -----
  // Every repo has coordinates (a hash of owner/name, typed in its folder). Far off to the left of the cabinet a ring stands
  // half sunk in the floor, with a keypad: enter a repo's coordinates and it opens onto a tunnel of threads, and walking
  // through takes you inside the repo (`tess`, a floor of its own the lift doesn't serve). In there you float through a
  // lattice of bookcases in the dark: every folder a bookcase (one per 56 files), laid out as the tree, each file a book on
  // its shelves. The lattice repeats away from you, one layer per commit, so going deeper goes back in time: books come and
  // go as files did, and the ones a commit touched glow. Look at a book and click to read it as it was then.
  const coordOf = (f) => hash(`${f.owner}/${f.name}`).toString(16).toUpperCase().padStart(8, '0');
  const fmtCoord = (c) => `${c.slice(0, 4)}·${c.slice(4)}`;
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
  // Out on its own, 70 m left of the cabinet, up on a plinth with steps either side (PL high, its top PW wide and PD deep). The
  // ring stands in a slot cut through the plinth, touching nothing, its foot just off the floor and its portal level with the top.
  const GATE = { x: ARCH.x - 14, z: ARCH.z + 68, y: 2.82, R: 2.6, tube: 0.2, PL: 0.9, PW: 6.4, PD: 3.6, STEP: 0.35, SLOT: 0.3, CUT: 2.2 };
  const portalMat = (core, rim) => new THREE.ShaderMaterial({
    uniforms: { uOpen: { value: 0 }, uTime: { value: 0 }, uHaze: { value: 0 }, uReady: { value: 0 }, uFlash: { value: 0 }, uCore: { value: new THREE.Color(...core) }, uRim: { value: new THREE.Color(...rim) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOpen, uTime, uHaze, uReady, uFlash; uniform vec3 uCore, uRim; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
        float z = 0.35 / (r + 0.04) + uTime * (0.2 + 0.5 * uReady);   // a tunnel of threads, rushing once it's tuned in
        float g = pow(1.0 - abs(fract(a / 6.2831853 * 24.0) - 0.5) * 2.0, 26.0) + pow(1.0 - abs(fract(z) - 0.5) * 2.0, 18.0);
        vec3 c = mix(uCore, uRim, smoothstep(0.0, 0.9, r)) + vec3(1.6, 1.05, 0.45) * g * smoothstep(0.02, 0.35, r) * (0.3 + 0.7 * uReady);
        c += vec3(2.4, 1.9, 1.2) * uFlash * (1.0 - 0.6 * r);   // the moment it's ready
        gl_FragColor = vec4(mix(c, vec3(1.0), uHaze), max(uOpen, uFlash) * smoothstep(1.0, 0.94, r));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const dialTex = (() => {   // the brass dial inside the ring: ticks and the sixteen hex digits
    const d = makeCanvas(1024, 1024), c = d.ctx;
    c.translate(512, 512); c.strokeStyle = c.fillStyle = '#fff';
    for (const r of [500, 412]) { c.lineWidth = 6; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2, l = i % 8 ? 18 : 40;
      c.lineWidth = i % 8 ? 3 : 6; c.beginPath(); c.moveTo(Math.cos(a) * 496, Math.sin(a) * 496); c.lineTo(Math.cos(a) * (496 - l), Math.sin(a) * (496 - l)); c.stroke();
    }
    c.font = `600 34px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) { c.save(); c.rotate((i / 16) * Math.PI * 2); c.fillText(i.toString(16).toUpperCase(), 0, -436); c.restore(); }
    d.tex.needsUpdate = true;
    return d.tex;
  })();
  function makeGate(parent, x, y, z, core, rim) {   // a ring facing ±z, its portal on layer 1 (out of the AO)
    const g = new THREE.Group(), { R, tube } = GATE;
    g.position.set(x, y, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 24, 128), mat('#2a2622', { metalness: 0.85, roughness: 0.32 }));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R - tube - 0.02, 0.025, 8, 128), mat('#b08a4a', { metalness: 1, roughness: 0.3 }));
    const dial = new THREE.Mesh(new THREE.RingGeometry(R - tube - 0.5, R - tube - 0.05, 128), new THREE.MeshStandardMaterial({ map: dialTex, color: '#c9a25c', metalness: 0.9, roughness: 0.35, alphaTest: 0.3, side: THREE.DoubleSide }));
    const portal = new THREE.Mesh(new THREE.CircleGeometry(R - tube - 0.48, 96), portalMat(core, rim));
    portal.layers.set(1);
    g.add(ring, lip, dial, portal); parent.add(g);
    return { g, dial, u: portal.material.uniforms };
  }

  // The gateway in the archive, and its keypad on a lectern beside it.
  const gate = arch.gate = { code: '', msg: 'ENTER COORDINATES', repo: null, open: 0, to: 0, ready: false, side: -1, hot: null, hotT: 0, bad: false, clear: false,
    ...makeGate(arch.scene, GATE.x, GATE.y, GATE.z, [0.3, 0.17, 0.06], [0.012, 0.009, 0.006]) };
  const GATE_P = new THREE.Vector3(GATE.x, GATE.y, GATE.z);
  {
    // The plinth: dark stone, four steps up from the cabinet's side and four down the far side, the ring standing in the middle.
    const { PL, PW, PD, STEP, SLOT, CUT } = GATE, n = Math.round(PL / 0.15), run = n * STEP, side = PW / 2 - CUT;
    const stone = [...[-1, 1].map((s) => [PW, PL, PD / 2 - SLOT, 0, PL / 2, s * (PD / 2 + SLOT) / 2, '#2a2622']),   // either side of the slot
      ...[-1, 1].map((s) => [side, PL, SLOT * 2, s * (CUT + side / 2), PL / 2, 0, '#2a2622']),   // past the ring's ends
      [CUT * 2, 0.02, SLOT * 2, 0, 0.01, 0, '#0b0907']];   // the slot's floor, in shadow
    for (let j = 0; j < n; j++) for (const s of [-1, 1]) stone.push([PW, PL - (j + 1) * 0.15, STEP, 0, (PL - (j + 1) * 0.15) / 2, s * (PD / 2 + (j + 0.5) * STEP), j % 2 ? '#2e2a26' : '#332e29']);
    for (const s of [-1, 1]) stone.push([PW + 0.02, 0.02, 0.04, 0, PL + 0.01, s * (PD / 2 - 0.02), '#b08a4a']);   // brass nosing at the top step
    const plinth = mergedBoxes(stone, mat('#ffffff', { vertexColors: true, roughness: 0.7, metalness: 0.2 }));
    plinth.position.set(GATE.x, 0, GATE.z); arch.scene.add(plinth);
    const psh = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.7, (PD + 2 * run) * 1.5), new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.4, depthWrite: false }));
    psh.rotation.x = -Math.PI / 2; psh.position.set(GATE.x, 0.002, GATE.z); psh.layers.set(1); arch.scene.add(psh);
    for (const s of [-1, 1]) {   // the ring's feet, and the plinth's sides (you go up by the steps)
      arch.colliders.push({ minX: GATE.x + s * 1.4, maxX: GATE.x + s * (CUT + 0.1), minZ: GATE.z - SLOT, maxZ: GATE.z + SLOT });
      arch.colliders.push({ minX: GATE.x + s * PW / 2 - 0.05, maxX: GATE.x + s * PW / 2 + 0.05, minZ: GATE.z - PD / 2 - run, maxZ: GATE.z + PD / 2 + run });
    }
    // How high the ground is here: the plinth's top, a step, or the floor (see movePlayer).
    arch.ground = (x, z) => {
      if (Math.abs(x - GATE.x) > PW / 2) return 0;
      const d = Math.abs(z - GATE.z) - PD / 2;
      return d < 0 ? PL : Math.max(0, PL - Math.ceil(d / STEP + 1e-6) * 0.15);   // (you step over the slot)
    };
    // The lectern, on the floor to the right of the steps: the keypad on a sloped brass board, clear of everything.
    const ped = new THREE.Group(), PX = GATE.x + 2.6, PZ = GATE.z - PD / 2 - run - 1.2;
    ped.position.set(PX, 0, PZ); ped.rotation.y = Math.PI + 0.25;   // facing you as you come along the path
    ped.add(mergedBoxes([[0.62, 0.08, 0.5, 0, 0.04, 0, '#1f1d1b'], [0.32, 1.1, 0.26, 0, 0.63, -0.03, '#2a2622']], mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.4 })));
    const pad = gate.pad = makeScreen(ped, 0.34, 0.51, 340, 510, 0, 1.35, 0.01);
    pad.mesh.rotation.x = -1.05;
    const board = box(ped, 0.4, 0.57, 0.04, '', 0, 1.35 - 0.87 * 0.022, 0.01 - 0.5 * 0.022, { material: mat('#b08a4a', { metalness: 0.9, roughness: 0.35 }) });
    board.rotation.x = -1.05;
    Object.assign(pad.mesh.userData, { action: 'gatekey', reach: 2.4, keyAt: (uv) => keyAt(uv) });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.5, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(PX, 0.002, PZ); sh.layers.set(1);
    arch.scene.add(ped, sh);
    arch.colliders.push({ minX: PX - 0.3, maxX: PX + 0.3, minZ: PZ - 0.3, maxZ: PZ + 0.3 });
    arch.hits.push(pad.mesh);
    arch.nFixed = arch.colliders.length;   // the cabinet, its drawer and the gateway (the lift's goes after, see arch.enter)
  }
  const KEYS = [...'0123456789ABCDEF', '⌫', 'GO', 'CLOSE'];
  Object.assign(arch, { coordOf, gatePress: (k) => gatePress(k), tess: () => tess, readBook: (b) => readBook(b), closeBook: () => closeBook(false) });   // for window.__office.arch
  function keyAt(uv) {
    const x = uv.x * 340, y = (1 - uv.y) * 510, r = Math.floor((y - 100) / 68), c = Math.floor((x - 10) / 80);
    if (y < 100 || c < 0 || c > 3 || r > 5) return null;
    return r < 4 ? KEYS[r * 4 + c] : r > 4 ? 'CLOSE' : c < 2 ? '⌫' : 'GO';
  }
  function paintPad() {
    const { ctx: c, W, H } = gate.pad;
    c.fillStyle = '#16130f'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#050403'; c.fillRect(10, 10, W - 20, 80);
    c.textAlign = 'center'; c.font = `600 34px ${MONO}`; c.fillStyle = gate.bad ? '#ff6b4a' : '#ffc46b';
    c.fillText(fmtCoord((gate.code + '________').slice(0, 8)), W / 2, 52);
    c.font = `600 14px ${FONT}`; c.fillStyle = gate.bad ? '#ff8a6b' : '#c9a25c'; c.fillText(fit(c, gate.msg, W - 40), W / 2, 79);
    KEYS.forEach((k, i) => {
      const big = i > 15, end = i > 17, x = 10 + (end ? 0 : big ? (i - 16) * 160 : (i % 4) * 80), y = 100 + (end ? 5 : big ? 4 : Math.floor(i / 4)) * 68, w = end ? 312 : big ? 152 : 72, hot = gate.hot === k;
      c.fillStyle = hot ? '#ffc46b' : end ? '#3a1d17' : '#2b2620'; c.beginPath(); c.roundRect(x, y, w, 60, 8); c.fill();
      c.strokeStyle = end ? '#8a3a2a' : '#6b5530'; c.lineWidth = 2; c.stroke();
      c.fillStyle = hot ? '#16130f' : end ? '#ffb39a' : '#e8c88a'; c.font = `600 ${big ? 22 : 30}px ${MONO}`; c.fillText(k === 'GO' ? 'ENTER' : end ? 'CLOSE THE GATEWAY' : k, x + w / 2, y + 41);
    });
    c.textAlign = 'left'; gate.pad.tex.needsUpdate = true;
  }
  paintPad();
  function gatePress(k) {
    if (!k) return;
    const at = gate.pad.mesh.getWorldPosition(new THREE.Vector3());
    Object.assign(gate, { hot: k, hotT: performance.now() + 160 });
    if (k === 'CLOSE') {
      if (gate.to) { sfx.cabinet('spindown', GATE_P, 0.7); sfx.cabinet('beep', at, 0.22); }
      Object.assign(gate, { code: '', to: 0, ready: false, repo: null, bad: false, clear: false, msg: gate.to ? 'GATEWAY CLOSED' : 'ENTER COORDINATES' });
      paintPad(); return;
    }
    if (gate.clear && k !== 'GO') Object.assign(gate, { code: '', clear: false, bad: false, msg: 'ENTER COORDINATES' });
    if (k === '⌫') { gate.code = gate.code.slice(0, -1); sfx.cabinet('beep', at, 0.22); }
    else if (k !== 'GO') { if (gate.code.length < 8) { gate.code += k; sfx.cabinet('beep', at, 0.22); } else sfx.cabinet('buzz', at, 0.25); }
    else if (gate.code.length < 8) { Object.assign(gate, { msg: 'COORDINATES ARE 8 DIGITS', bad: true }); sfx.cabinet('buzz', at, 0.35); }
    else if (!files.list) { Object.assign(gate, { msg: files.loading ? 'READING THE ARCHIVE…' : 'THE ARCHIVE IS UNREADABLE', bad: !files.loading }); loadRepos(); sfx.cabinet('buzz', at, 0.3); }
    else {
      const f = files.list.find((r) => coordOf(r) === gate.code);
      if (f) tune(f, at);
      else { Object.assign(gate, { msg: 'NOTHING AT THOSE COORDINATES', bad: true, clear: true, to: 0, ready: false, repo: null }); sfx.cabinet('buzz', at, 0.4); }
    }
    paintPad();
  }
  async function tune(f, at) {
    Object.assign(gate, { repo: f, to: 1, ready: false, prog: 0, bad: false, msg: `TUNING IN · ${f.name.toUpperCase()}` });
    sfx.cabinet('accept', at, 0.35); sfx.cabinet('spinup', GATE_P, 0.7);
    const ok = await loadTree(f, ({ done, total }) => {
      if (gate.repo !== f) return false;
      gate.msg = total ? `TUNING IN · ${done} / ${total} COMMITS` : `TUNING IN · ${f.name.toUpperCase()}`; gate.prog = total ? done / total : 0; paintPad();
      return true;
    });
    if (gate.repo !== f) return;
    if (ok) { Object.assign(gate, { ready: true, flash: 1, prog: 1, msg: `OPEN · ${f.name.toUpperCase()} · WALK THROUGH` }); sfx.cabinet('accept', GATE_P, 0.5); sfx.cabinet('boom', GATE_P, 0.4); }
    else { Object.assign(gate, { to: 0, msg: 'CAN’T REACH IT · TRY AGAIN', bad: true, clear: true }); sfx.cabinet('buzz', at, 0.35); }
    paintPad();
  }
  function gateFx(dt, t) {
    // Tuning in (the history still loading): it powers up, flickering and building with the progress, a slow tunnel, the dial
    // spinning ever faster; only once it's ready does it open fully, with a flash. Before then you can't go through.
    const loading = gate.to && !gate.ready;
    gate.open = gate.ready ? Math.min(1, gate.open + dt / 0.8) : Math.max(0, gate.open - dt / 1.2);
    gate.charge = damp(gate.charge || 0, loading ? Math.max(0.08, gate.prog || 0) : 0, 3, dt);
    const flick = loading ? 0.55 + 0.45 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1)) : 0;
    const u = gate.u;
    u.uOpen.value = Math.max(ease(gate.open), (0.3 + 0.45 * gate.charge) * flick); u.uTime.value = t;
    u.uReady.value = damp(u.uReady.value, gate.ready ? 1 : 0.3 * gate.charge, 2, dt);
    gate.flash = Math.max(0, (gate.flash || 0) - dt / 0.9); u.uFlash.value = gate.flash ** 1.5;
    u.uHaze.value = clamp((Math.hypot(camera.position.x - GATE.x, camera.position.z - GATE.z) - 8) / 87, 0, 1) * 0.9;   // the scene's fog
    gate.dial.rotation.z += dt * (0.02 + 0.25 * gate.open + (loading ? 0.4 + 2.4 * gate.charge : 0));
    if (gate.hot && performance.now() > gate.hotT) { gate.hot = null; paintPad(); }
    if (loading && mode === 'free' && gate.side < 0 && Math.abs(player.x - GATE.x) < 1.5 && player.z > GATE.z - 0.45) {   // not yet: a soft bounce
      player.z = GATE.z - 0.45;
      if (t > (gate.bumpT || 0)) { gate.bumpT = t + 1.2; sfx.cabinet('buzz', GATE_P, 0.25); }
    }
    const side = Math.sign(player.z - GATE.z) || 1;
    if (side > 0 && gate.side < 0 && gate.ready && gate.open > 0.9 && Math.abs(player.x - GATE.x) < 1.3 && mode === 'free') enterTess();
    gate.side = side;
    const d = Math.hypot(player.x - GATE.x, player.z - GATE.z);
    if (d > PULL + 0.5) gate.armed = true;   // (not straight back in when you've just come out)
    const s = gate.ready && gate.open > 0.9 && gate.armed && side < 0 && mode === 'free' ? pullOf(d) : 0;
    if (s) { pullTo(dt, s, GATE.x, GATE.y, GATE.z + 0.8, false); collide(player); }
    pullFx(s, WARP_IN, GATE_P);
  }

  // The pull: within PULL m of an open ring, on the side you go in by, it draws you to its centre and turns you to face it.
  // Gently at first (you can walk away from the edge), then faster than you can walk against; the view starts to stretch and
  // streak, and a rush builds, until you're through and the crossing takes over.
  const PULL = 6, PULL_V = 9;
  const pullOf = (d) => clamp(1 - d / PULL, 0, 1) ** 1.5;
  function pullTo(dt, s, tx, ty, tz, fly) {
    const ey = fly ? player.eye : player.eye + (player.fy || 0);
    const dx = tx - player.x, dy = fly ? ty - ey : 0, dz = tz - player.z, d = Math.hypot(dx, dy, dz) || 1, v = Math.min(d, s * PULL_V * dt);
    player.x += (dx / d) * v; player.z += (dz / d) * v; if (fly) player.eye += (dy / d) * v;
    const k = Math.min(1, s * 2.5 * dt), h = Math.hypot(tx - player.x, tz - player.z);
    player.yaw += angDiff(player.yaw, Math.atan2(-(tx - player.x), -(tz - player.z))) * k;
    player.pitch += (Math.atan2(ty - ey, Math.max(h, 0.5)) * 0.6 - player.pitch) * k;
  }
  const WARP_IN = { ray: 'rgba(255,196,110,.9)', flash: '#fff1cf', bg: '#0b0704' }, WARP_OUT = { ray: 'rgba(255,255,255,.95)', flash: '#ffffff', bg: '#f4f1ea' };
  function pullFx(s, look, at) {
    if (tess.warping) return;
    tess.pullS = s;
    if (s > 0.005) {
      fadeEl.style.setProperty('--ray', look.ray); fadeEl.style.setProperty('--flash', look.flash); fadeEl.style.setProperty('--bg', look.bg);
      fadeEl.classList.add('on');
      const r = (performance.now() / 40) % 360;
      Object.assign(raysA.style, { opacity: (s * 0.55).toFixed(3), transform: `scale(${(0.12 + 0.4 * s).toFixed(3)}) rotate(${r.toFixed(1)}deg)` });
      Object.assign(raysB.style, { opacity: (s * 0.4).toFixed(3), transform: `scale(${(0.08 + 0.3 * s).toFixed(3)}) rotate(${(-r * 0.7).toFixed(1)}deg)` });
      flashEl.style.opacity = (s * s * 0.3).toFixed(3);
    } else if (fadeEl.classList.contains('on')) { fadeEl.classList.remove('on'); for (const e of [raysA, raysB, flashEl]) e.style.opacity = 0; }
    if (!away?.fly) { const fov = FOV0 + 16 * s; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); } }   // (flying, flyPlayer adds it)
    sfx.pull(s, at);
  }

  // Through the ring: the view stretches as you're pulled in, threads of light streak past and fold into a flash, a deep boom,
  // and the far side swims into view as the threads fall away behind you.
  const fadeEl = document.createElement('div');
  fadeEl.className = 'of-fade';
  fadeEl.innerHTML = '<div class="rays"></div><div class="rays b"></div><div class="flash"></div>';
  hud.appendChild(fadeEl);
  const [raysA, raysB, flashEl] = fadeEl.children;
  function fovTo(a, b, ms, ez) {   // the warp's own lens, frame by frame (flyPlayer leaves the FOV alone meanwhile)
    const t0 = performance.now();
    return new Promise((done) => {
      const step = () => {
        const u = clamp((performance.now() - t0) / ms, 0, 1);
        camera.fov = lerp(a, b, ez(u)); camera.updateProjectionMatrix();
        if (u < 1) requestAnimationFrame(step); else done();
      };
      step();
    });
  }
  const easeIn = (u) => u * u * u, easeOut = (u) => 1 - (1 - u) ** 3;
  async function warp(look, then) {
    if (tess.warping) return;
    tess.warping = true;
    keys.clear(); mode = 'warp';
    if (REDUCED) { then(); if (mode === 'warp') mode = 'free'; tess.warping = false; return; }
    fadeEl.style.setProperty('--ray', look.ray); fadeEl.style.setProperty('--flash', look.flash); fadeEl.style.setProperty('--bg', look.bg);
    fadeEl.classList.add('on');
    sfx.cabinet('whoosh', camera.position, 0.6); sfx.cabinet('spinup', camera.position, 0.35);
    const IN = { duration: 1100, easing: 'cubic-bezier(.55,0,.9,.4)', fill: 'forwards' };
    const from = (e, t) => ({ transform: e.style.transform || t, opacity: +(e.style.opacity || 0) });   // where the pull left it
    raysA.animate([from(raysA, 'scale(.12) rotate(0deg)'), { transform: 'scale(.8) rotate(30deg)', opacity: 1, offset: 0.55 }, { transform: 'scale(3) rotate(80deg)', opacity: 1 }], IN);
    raysB.animate([from(raysB, 'scale(.08) rotate(0deg)'), { transform: 'scale(.6) rotate(-20deg)', opacity: 0.8, offset: 0.6 }, { transform: 'scale(2.4) rotate(-55deg)', opacity: 1 }], IN);
    const f0 = +(flashEl.style.opacity || 0);
    flashEl.animate([{ opacity: f0 }, { opacity: f0, offset: 0.6 }, { opacity: 1 }], IN);
    sfx.pull(0);
    await fovTo(camera.fov, FOV0 + 70, 1100, easeIn);
    sfx.cabinet('boom', camera.position, 0.8);
    then();
    if (mode === 'warp') mode = 'free';
    await new Promise((r) => setTimeout(r, 250));
    sfx.cabinet('boom', camera.position, 0.25);
    const OUT = { duration: 1500, easing: 'cubic-bezier(.1,.6,.3,1)', fill: 'forwards' };
    raysA.animate([{ transform: 'scale(3) rotate(80deg)', opacity: 1 }, { transform: 'scale(.15) rotate(130deg)', opacity: 0 }], OUT);
    raysB.animate([{ transform: 'scale(2.4) rotate(-55deg)', opacity: 1 }, { transform: 'scale(.1) rotate(-100deg)', opacity: 0 }], OUT);
    flashEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out', fill: 'forwards' });
    await fovTo(FOV0 + 70, FOV0, 1600, easeOut);
    fadeEl.classList.remove('on');
    for (const e of [raysA, raysB, flashEl]) { e.getAnimations().forEach((a) => a.cancel()); e.style.transform = ''; e.style.opacity = 0; }
    tess.warping = false;
  }
  const enterTess = () => warp(WARP_IN, () => setFloor(tess));
  const exitTess = () => warp(WARP_OUT, () => {
    setFloor(arch);
    arch.out = 1;   // straight into the void's own light
    Object.assign(player, { x: GATE.x, z: GATE.z - 1.2, eye: EYE, fy: GATE.PL, yaw: 0, pitch: -0.05, seated: false, seat: null });   // on the plinth, looking back down the path
    gate.side = -1; gate.armed = false;
  });

  // ----- inside a repo -----
  const EXIT_Z = 26;   // the way out, 26 m in front of the first bookcases (you arrive 9 m inside it, clear of its pull)
  const TX = -3000, BW = 2.4, BH = 2.0, BD = 0.36, GX = 3.3, GY = 2.9, GZ = 5, PER = 56, SLOT = (BW - 0.12) / 14, SHELF = (BH - 0.1) / 4, WC = 8, WB = 4, WK = 3;
  const EXT = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', html: 'HTML', css: 'CSS', scss: 'SCSS',
    java: 'Java', cs: 'C#', cpp: 'C++', cc: 'C++', h: 'C', c: 'C', go: 'Go', rs: 'Rust', sh: 'Shell', swift: 'Swift', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', dart: 'Dart',
    vue: 'Vue', svelte: 'Svelte', lua: 'Lua', ipynb: 'Jupyter Notebook', gd: 'GDScript', astro: 'Astro' };
  const DOCS = { md: '#d8c6a0', txt: '#cdbf9f', json: '#8f9a6a', yml: '#9a7f6a', yaml: '#9a7f6a', lock: '#6d6a64', svg: '#c78a5a', png: '#7a8fa6', jpg: '#7a8fa6', gif: '#7a8fa6', ico: '#7a8fa6' };
  const bookColor = (p) => { const e = (/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase(); return EXT[e] ? langColor(EXT[e]) : DOCS[e] || '#8a7a66'; };
  // A texture atlas per instanced mesh: each instance picks its cell with an aUv offset (as the folder tabs do).
  const atlasMat = (o) => {
    const cell = { value: new THREE.Vector2(1, 1) }, m = new THREE.MeshBasicMaterial(o);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.cell = cell;
      sh.vertexShader = 'attribute vec2 aUv;\nuniform vec2 cell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = vMapUv * cell + aUv;');
    };
    m.cell = cell.value;
    return m;
  };
  const tess = { n: 'T', label: 'INSIDE', title: 'Inside', sound: 'tess', on: false, carless: true, fly: true, colliders: [], hits: [], composer: null, vel: new THREE.Vector3(), t: null };
  const caseG = mergedBoxes([[0.04, BH, BD, -BW / 2 + 0.02, 0, 0], [0.04, BH, BD, BW / 2 - 0.02, 0, 0], [BW, 0.05, BD, 0, BH / 2 - 0.025, 0], [BW, 0.05, BD, 0, -BH / 2 + 0.025, 0],
    ...[1, 2, 3].map((s) => [BW - 0.08, 0.02, BD, 0, BH / 2 - 0.05 - s * SHELF, 0])], mat('#fff')).geometry;
  const caseBackG = new THREE.PlaneGeometry(BW - 0.06, BH - 0.06).translate(0, 0, -BD / 2 + 0.005), bookG = new THREE.BoxGeometry(1, 1, 1), unitG = new THREE.PlaneGeometry(1, 1);
  const plaqueG = new THREE.PlaneGeometry(1.5, 0.19);
  const caseM = mat('#2b1e14', { roughness: 0.6 }), bookM_ = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const glowTex = (() => { const g = makeCanvas(128, 128), c = g.ctx, r = c.createRadialGradient(64, 64, 4, 64, 64, 92); r.addColorStop(0, '#ffffff'); r.addColorStop(1, '#3a3026'); c.fillStyle = r; c.fillRect(0, 0, 128, 128); g.tex.needsUpdate = true; return g.tex; })();
  const caseBackM = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.5, 0.92, 0.42), side: THREE.DoubleSide });
  const bookGlowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.55), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const threadM = new THREE.LineBasicMaterial({ color: new THREE.Color(1.4, 0.95, 0.42), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  {
    const S = tess.scene = new THREE.Scene(), dark = new THREE.Color('#070403');
    S.background = dark; S.fog = new THREE.Fog(dark, 5, 44);
    S.environment = scene.environment; S.environmentIntensity = 0.12;
    const key = new THREE.DirectionalLight('#ffd7a0', 0.7); key.position.set(4, 6, 12);
    S.add(tess.hemi = new THREE.HemisphereLight('#ffd9a0', '#140b05', 0.35), key);
    tess.look = { exposure: 1.1, hemi: 0.35, sky: new THREE.Color('#ffd9a0'), ground: new THREE.Color('#140b05'), env: 0.12, bloom: 2.2, grade: 1, lights: [[key, 0.7]], aoSkip1: true };
    S.add(tess.root = new THREE.Group());
    tess.exit = makeGate(S, 0, 0, EXIT_Z, [2.2, 2.1, 2.0], [0.9, 0.82, 0.7]);   // the way back: white, the archive through it
    tess.exit.u.uOpen.value = tess.exit.u.uReady.value = 1;
    tess.pulled = new THREE.Mesh(bookG, new THREE.MeshStandardMaterial({ roughness: 0.75 })); Object.assign(tess.pulled, { visible: false, matrixAutoUpdate: false }); S.add(tess.pulled);
    // Dust in the light, wrapping round you so it never runs out.
    const N = 1400, pos = new Float32Array(N * 3), R = rng(7);
    for (let i = 0; i < N * 3; i++) pos[i] = R() * 30;
    tess.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
      vertexShader: `uniform vec3 uCam; uniform float uTime; varying float vA;
        void main() {
          vec3 p = mod(position + vec3(0.05, 0.11, 0.03) * uTime - uCam + 15.0, 30.0) - 15.0;
          vA = smoothstep(15.0, 4.0, length(p));
          vec4 mv = modelViewMatrix * vec4(p + uCam, 1.0); gl_PointSize = 26.0 / -mv.z; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.6, 1.15, 0.6, vA * smoothstep(0.5, 0.0, d) * 0.7); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    tess.dust.frustumCulled = false; tess.dust.layers.set(1); S.add(tess.dust);
  }

  // The whole history takes a while the first time (a call per commit): the server answers 202 with how far it's got until then.
  async function loadTree(f, progress) {
    if (tess.t?.repo === f) return true;
    for (;;) {
      const r = await fetch(`/api/repos/${encodeURIComponent(f.owner)}/${encodeURIComponent(f.name)}/tree`).then(async (x) => ({ s: x.status, j: await x.json() })).catch(() => null);
      if (!r || r.s >= 400) return false;
      if (r.s === 200) { buildTess(f, r.j); return true; }
      if (!progress(r.j)) return false;
      await new Promise((ok) => setTimeout(ok, 700));
    }
  }
  function buildTess(f, d) {
    for (const o of [...tess.root.children]) { tess.root.remove(o); o.dispose?.(); if (o.geometry !== caseG && o.geometry !== caseBackG && o.geometry !== bookG && o.geometry !== unitG && o.geometry !== plaqueG) o.geometry.dispose(); if (o.material.map && o.material.map !== glowTex) { o.material.map.dispose(); o.material.dispose(); } }
    const commits = d.commits || [], K = Math.max(1, commits.length);
    // The tree at each commit, newest first: slice 0 is now, and each one after undoes the commit before it. Rather than a file
    // list per layer (there can be thousands), each file keeps the runs of layers it exists in: life[i] = [from, to, from, to...].
    const idx = new Map(), paths = [], size = [], life = [], open = new Map();
    const add = (p, s) => { if (!idx.has(p)) { if (paths.length >= 5000) return -1; idx.set(p, paths.length); paths.push(p); size.push(s || 0); life.push([]); } return idx.get(p); };
    for (const [p, s] of d.files) { const i = add(p, s); if (i >= 0) open.set(i, 0); }
    const close = (p, k) => { const i = idx.get(p); if (i !== undefined && open.has(i)) { life[i].push(open.get(i), k); open.delete(i); } };
    const reopen = (p, s, k) => { const i = add(p, s); if (i >= 0 && !open.has(i)) open.set(i, k); };
    for (let k = 1; k < K; k++) for (const [fn, st, prev] of commits[k - 1].files) {
      if (st === 'added') close(fn, k - 1);
      else if (st === 'removed') reopen(fn, size[idx.get(fn)] || 2000, k);
      else if (st === 'renamed') { close(fn, k - 1); if (prev) reopen(prev, size[idx.get(fn)] || 2000, k); }
    }
    for (const [i, from] of open) life[i].push(from, K - 1);
    const slices = Array.from({ length: K }, (_, k) => {
      const c = commits[k] || { sha: d.head || '', message: '', author: '', date: null, files: [] };
      return { c, touched: new Set(c.files.map(([fn]) => idx.get(fn)).filter((i) => i !== undefined)) };
    });
    // Folders, laid out as the tree: each one's bookcases over its subfolders', a row per level down.
    const dirs = new Map(), byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
    const dirOf = (p) => {
      let x = dirs.get(p);
      if (x) return x;
      const cut = p.lastIndexOf('/');
      dirs.set(p, x = { path: p, name: p ? p.slice(cut + 1) : f.name, depth: p ? p.split('/').length : 0, files: [], kids: [] });
      if (p) dirOf(cut < 0 ? '' : p.slice(0, cut)).kids.push(x);
      return x;
    };
    dirOf('');
    paths.forEach((p, i) => { const cut = p.lastIndexOf('/'); dirOf(cut < 0 ? '' : p.slice(0, cut)).files.push(i); });
    let next = 0;
    const place = (x) => {
      x.files.sort((a, b) => byName(paths[a], paths[b])); x.kids.sort((a, b) => byName(a.name, b.name));
      x.cases = Math.max(1, Math.ceil(x.files.length / PER));
      const start = next;
      for (const k of x.kids) place(k);
      if (next - start < x.cases) next = start + x.cases;
      x.col = start + (next - start - x.cases) / 2;
    };
    place(dirs.get(''));
    const caseAt = (x, c) => new THREE.Vector3(TX + (x.col + c) * GX, -x.depth * GY, 0);
    const cases = [], rows = new Map();
    for (const x of dirs.values()) for (let c = 0; c < x.cases; c++) {
      const cs = { d: x, c, p: caseAt(x, c) };
      cases.push(cs);
      if (!rows.has(x.depth)) rows.set(x.depth, []);
      rows.get(x.depth).push(cs);
    }
    // Each file's book and spine label, in its layer's space (a layer is the same thing GZ further back).
    const at = new Array(paths.length);
    for (const x of dirs.values()) x.files.forEach((i, r) => {
      const c = Math.floor(r / PER), q = r % PER, sh = Math.floor(q / 14), o = caseAt(x, c), Rr = rng(hash(paths[i]));
      const t = clamp(0.028 + (0.11 * Math.log10(size[i] + 10)) / 6, 0.03, SLOT - 0.012), h = SHELF * (0.62 + 0.3 * Rr()), dep = 0.24 + 0.06 * Rr();
      const base = o.y + BH / 2 - 0.05 - (sh + 1) * SHELF + 0.01, bx = o.x - BW / 2 + 0.06 + ((q % 14) + 0.5) * SLOT, bz = BD / 2 - dep / 2 - 0.015, lean = Rr() < 0.12 ? (Rr() - 0.5) * 0.2 : 0;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, base + h / 2, bz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean)), new THREE.Vector3(t, h, dep));
      const lm = new THREE.Matrix4().compose(new THREE.Vector3(bx, base + h / 2, bz + dep / 2 + 0.001), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean + Math.PI / 2)), new THREE.Vector3(h * 0.9, t * 0.8, 1));
      at[i] = { m, lm, y: base + h / 2, h, color: new THREE.Color(bookColor(paths[i])).multiplyScalar(0.5 + 0.25 * Rr()) };
    });
    // Spine labels (file names) and plaques (folder names), one atlas each.
    const SC = { w: 192, h: 28, cols: 10 }, labelCap = Math.min(paths.length, SC.cols * Math.floor(8192 / SC.h));
    const spines = makeCanvas(SC.cols * SC.w, 2 ** Math.ceil(Math.log2(Math.max(64, Math.ceil(labelCap / SC.cols) * SC.h)))), sc = spines.ctx;
    sc.font = `600 18px ${FONT}`; sc.fillStyle = '#f3e3c0'; sc.textBaseline = 'middle';
    for (let i = 0; i < labelCap; i++) sc.fillText(fit(sc, paths[i].slice(paths[i].lastIndexOf('/') + 1), SC.w - 12), (i % SC.cols) * SC.w + 6, Math.floor(i / SC.cols) * SC.h + SC.h / 2);
    spines.tex.needsUpdate = true;
    const labelUv = (i) => [(i % SC.cols) / SC.cols, 1 - ((Math.floor(i / SC.cols) + 1) * SC.h) / spines.H];
    const PC = { w: 512, h: 64, cols: 4 }, dl = [...dirs.values()].slice(0, PC.cols * 128);
    const plates = makeCanvas(PC.cols * PC.w, 2 ** Math.ceil(Math.log2(Math.max(64, Math.ceil(dl.length / PC.cols) * PC.h)))), pc = plates.ctx;
    dl.forEach((x, j) => {
      const px = (j % PC.cols) * PC.w, py = Math.floor(j / PC.cols) * PC.h;
      x.cell = j; x.uv = [(j % PC.cols) / PC.cols, 1 - ((Math.floor(j / PC.cols) + 1) * PC.h) / plates.H];
      pc.fillStyle = '#1a120a'; pc.fillRect(px, py, PC.w, PC.h); pc.strokeStyle = '#8a6a3a'; pc.lineWidth = 3; pc.strokeRect(px + 3, py + 3, PC.w - 6, PC.h - 6);
      pc.fillStyle = '#e8c27a'; pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.font = `600 30px ${MONO}`;
      pc.fillText(fit(pc, x.path ? `${x.name}/` : x.name, PC.w - 30), px + PC.w / 2, py + PC.h / 2 + 1);
    });
    plates.tex.needsUpdate = true;
    // Instanced meshes, refilled for the layers near you (see tessWindow).
    const KC = Math.min(K, 2 * WC + 1), KB = Math.min(K, 2 * WB + 1);
    const inst = (g, m, n, layer) => { const x = new THREE.InstancedMesh(g, m, Math.max(1, n)); x.count = 0; x.frustumCulled = false; if (layer) x.layers.set(1); tess.root.add(x); return x; };
    const alive = (i, k) => { const r = life[i]; for (let j = 0; j < r.length; j += 2) if (k >= r[j] && k <= r[j + 1]) return true; return false; };
    const T = tess.t = { repo: f, K, paths, size, life, alive, slices, dirs, cases, rows, at, labelCap, labelUv, cur: -1, held: null, capped: d.capped };
    T.frames = inst(caseG, caseM, cases.length * KC); T.backs = inst(caseBackG, caseBackM, cases.length * KC);
    T.plaques = inst(plaqueG.clone(), atlasMat({ map: plates.tex, color: new THREE.Color(1.15, 1.1, 1.05) }), dl.length * KC);
    T.plaques.material.cell.set(1 / PC.cols, PC.h / plates.H);
    T.plaqueUv = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, dl.length * KC) * 2), 2); T.plaques.geometry.setAttribute('aUv', T.plaqueUv);
    T.books = inst(bookG, bookM_, paths.length * KB); T.books.castShadow = false;
    T.glow = inst(bookG, bookGlowM, paths.length * KB, true);
    T.labels = inst(unitG.clone(), atlasMat({ map: spines.tex, transparent: true, alphaTest: 0.15, color: new THREE.Color(1.0, 0.92, 0.78), depthWrite: false }), labelCap * KB, true);
    T.labels.material.cell.set(1 / SC.cols, SC.h / spines.H);
    T.labelUvA = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, labelCap * KB) * 2), 2); T.labels.geometry.setAttribute('aUv', T.labelUvA);
    // Golden threads: four through each bookcase's corners, from out toward the gateway back through every layer into the dark;
    // and in the layers near you, one from every folder down to each subfolder, and beams along each row (see tessWindow).
    const L = [], seg = (x0, y0, z0, x1, y1, z1) => L.push(x0, y0, z0, x1, y1, z1), zEnd = -(K - 1) * GZ - 40;
    for (const cs of cases) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) seg(cs.p.x + (sx * BW) / 2, cs.p.y + (sy * BH) / 2, EXIT_Z - 6, cs.p.x + (sx * BW) / 2, cs.p.y + (sy * BH) / 2, zEnd);
    const mid = (x) => caseAt(x, (x.cases - 1) / 2);
    let x0 = Infinity, x1 = -Infinity, deep = 0;
    for (const cs of cases) { x0 = Math.min(x0, cs.p.x); x1 = Math.max(x1, cs.p.x); deep = Math.max(deep, cs.d.depth); }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(L, 3)), threadM);
    lines.layers.set(1); lines.frustumCulled = false; tess.root.add(lines);
    const layer = [];   // one layer's links and beams, at z = 0
    for (const x of dirs.values()) for (const kid of x.kids) { const a = mid(x), b = mid(kid); layer.push(a.x, a.y - BH / 2, 0, b.x, b.y + BH / 2 + 0.3, 0); }
    for (const r of rows.keys()) for (const dy of [-BH / 2, BH / 2]) layer.push(x0 - 6, -r * GY + dy, -BD / 2, x1 + 6, -r * GY + dy, -BD / 2);
    T.layerL = layer;
    T.links = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(layer.length * KC), 3)), threadM);
    T.links.layers.set(1); T.links.frustumCulled = false; tess.root.add(T.links);
    T.top = clamp((K * GZ) / 25, 60, 320);   // top speed: the whole history in about 25 s flat out
    // A card hanging over each layer near you: which commit it is.
    T.cards = Array.from({ length: Math.min(K, 2 * WK + 1) }, () => {
      const cv = makeCanvas(640, 160), m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, depthWrite: false, color: new THREE.Color(1.2, 1.15, 1.1) }));
      m.layers.set(1); tess.root.add(m);
      return { cv, m, k: -1 };
    });
    T.rootP = mid(dirs.get(''));
    T.box = { x0: x0 - BW / 2 - 8, x1: x1 + BW / 2 + 8, y0: -deep * GY - BH / 2 - 6, y1: BH / 2 + 6, z0: zEnd + 20 };
    tess.exit.g.position.set(T.rootP.x, T.rootP.y, EXIT_Z);
  }

  // Refill the instanced meshes for the layers around layer k0: bookcases further out, books (and the glow on the ones the
  // layer's commit touched) closer in. Books are rebuilt from per-file matrices, shifted back GZ a layer.
  function tessWindow(k0, force) {
    const T = tess.t;
    if (!T || (k0 === T.cur && !force)) return;
    const moved = k0 !== T.cur, m = new THREE.Matrix4(), GLOW = new THREE.Vector3(1.3, 1.04, 1.04);
    T.cur = k0;
    let n = 0, np = 0, nb = 0, nl = 0, ng = 0;
    for (let k = Math.max(0, k0 - WC); k <= Math.min(T.K - 1, k0 + WC); k++) for (const cs of T.cases) {
      m.makeTranslation(cs.p.x, cs.p.y, -k * GZ); T.frames.setMatrixAt(n, m); T.backs.setMatrixAt(n, m); n++;
      if (cs.c === 0 && cs.d.uv) { m.makeTranslation(cs.p.x, cs.p.y + BH / 2 + 0.17, -k * GZ + BD / 2); T.plaques.setMatrixAt(np, m); T.plaqueUv.setXY(np, ...cs.d.uv); np++; }
    }
    for (let k = Math.max(0, k0 - WB); k <= Math.min(T.K - 1, k0 + WB); k++) {
      const z = -k * GZ, S = T.slices[k];
      for (let i = 0; i < T.paths.length; i++) {
        if (!T.alive(i, k) || (T.held?.k === k && T.held.i === i)) continue;
        const b = T.at[i];
        m.copy(b.m); m.elements[14] += z; T.books.setMatrixAt(nb, m); T.books.setColorAt(nb, b.color); nb++;
        if (S.touched.has(i)) { m.copy(b.m).scale(GLOW); m.elements[14] += z; T.glow.setMatrixAt(ng++, m); }
        if (i < T.labelCap) { m.copy(b.lm); m.elements[14] += z; T.labels.setMatrixAt(nl, m); T.labelUvA.setXY(nl, ...T.labelUv(i)); nl++; }
      }
    }
    T.frames.count = T.backs.count = n; T.plaques.count = np; T.books.count = nb; T.labels.count = nl; T.glow.count = ng;
    for (const x of [T.frames, T.backs, T.plaques, T.books, T.labels, T.glow]) x.instanceMatrix.needsUpdate = true;
    if (T.books.instanceColor) T.books.instanceColor.needsUpdate = true;
    T.plaqueUv.needsUpdate = T.labelUvA.needsUpdate = true;
    if (!moved) return;
    const pos = T.links.geometry.attributes.position, A = pos.array, LL = T.layerL;
    let o = 0;
    for (let k = Math.max(0, k0 - WC); k <= Math.min(T.K - 1, k0 + WC); k++, o += LL.length) for (let j = 0; j < LL.length; j += 3) { A[o + j] = LL[j]; A[o + j + 1] = LL[j + 1]; A[o + j + 2] = LL[j + 2] - k * GZ; }
    T.links.geometry.setDrawRange(0, o / 3); pos.needsUpdate = true;
    const ks = []; for (let k = Math.max(0, k0 - WK); k <= Math.min(T.K - 1, k0 + WK); k++) ks.push(k);
    const free = T.cards.filter((c) => !ks.includes(c.k));
    for (const k of ks) if (!T.cards.some((c) => c.k === k)) paintCard(free.pop(), k);
    stripSync();
  }
  const ago = (k) => (k ? `${k} commit${k > 1 ? 's' : ''} back` : 'now');
  function paintCard(card, k) {
    const T = tess.t, c = T.slices[k].c, { ctx: x, W, H } = card.cv;
    card.k = k;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(20,12,5,.55)'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(232,194,122,.6)'; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, H - 2);
    x.fillStyle = '#ffd58f'; x.font = `700 30px ${MONO}`; x.fillText(`${ago(k).toUpperCase()}  ·  ${(c.sha || '').slice(0, 7)}`, 22, 44);
    x.fillStyle = '#f3e3c0'; x.font = `500 26px ${FONT}`; x.fillText(fit(x, c.message || '—', W - 44), 22, 92);
    x.fillStyle = '#a8946c'; x.font = `500 20px ${FONT}`; x.fillText(fit(x, [c.author, c.date && new Date(c.date).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '), W - 44), 22, 132);
    card.cv.tex.needsUpdate = true;
    card.m.position.set(T.rootP.x, T.rootP.y + BH / 2 + 1.2, -k * GZ);
  }

  // The bottom strip: which layer you're in, where it is in time, and how to move.
  const stripEl = document.createElement('div');
  stripEl.className = 'of-tstrip';
  hud.appendChild(stripEl);
  function stripSync() {
    const T = tess.t, k = T.cur, c = T.slices[k].c;
    stripEl.innerHTML = `<b>${escapeHtml(T.repo.name)}</b> · ${ago(k)} · <code>${escapeHtml((c.sha || '').slice(0, 7))}</code> ${escapeHtml(c.message || '')}
      ${T.K <= 60 ? `<div class="bar">${T.slices.map((_, j) => `<i${j === k ? ' class="on"' : ''}></i>`).join('')}</div>`
        : `<div class="tl"><i style="left:${(k / (T.K - 1)) * 100}%"></i><span>now</span><span>${T.K - 1} commits back${T.capped ? ' (as far as the archive reaches)' : ' · the first commit'}</span></div>`}
      <small><kbd>W</kbd><kbd>S</kbd> fly where you look · <kbd>A</kbd><kbd>D</kbd> sideways · <kbd>Space</kbd> up · <kbd>C</kbd> down · hold <kbd>Shift</kbd> to build speed · deeper is further back in time · the way out is behind where you came in</small>`;
  }

  tess.enter = () => {
    const T = tess.t, r = T.rootP;
    Object.assign(player, { x: r.x, z: EXIT_Z - 9, eye: r.y - 0.4, yaw: 0, pitch: 0.02, seated: false, seat: null });
    tess.vel.set(0, 0, 0); tess.prevZ = EXIT_Z - 9; tess.armed = false;
    tessWindow(0, true);
    hud.classList.add('of-tess');
    toast(`<b>INSIDE ${escapeHtml(T.repo.name.toUpperCase())}</b> · the further in, the further back`);
  };
  tess.leave = () => {
    const T = tess.t;
    if (!tess.warping) pullFx(0);
    tess.boost = 0;
    if (camera.fov !== FOV0 && !tess.warping) { camera.fov = FOV0; camera.updateProjectionMatrix(); }
    if (T?.held) { T.held = null; tess.pulled.visible = false; tessWindow(T.cur, true); }
    pageEl.classList.remove('on');
    if (mode === 'read') mode = 'free';
    hud.classList.remove('of-tess');
  };
  tess.bound = (p) => {
    const b = tess.t.box;
    p.x = clamp(p.x, b.x0, b.x1); p.z = clamp(p.z, b.z0, EXIT_Z + 0.6); p.eye = clamp(p.eye ?? EYE, b.y0, b.y1);
  };
  tess.fx = (dt, t) => {
    const T = tess.t;
    if (!T) return;
    tessWindow(clamp(Math.round(-player.z / GZ), 0, T.K - 1));
    const u = tess.dust.material.uniforms; u.uCam.value.copy(camera.position); u.uTime.value = t;
    tess.exit.u.uTime.value = t; tess.exit.dial.rotation.z += dt * 0.15;
    for (const c of T.cards) c.m.lookAt(camera.position.x, c.m.position.y, camera.position.z);   // turned to face you
    const h = T.held;
    if (h) {
      h.e = h.to ? Math.min(1, h.e + dt / 0.35) : Math.max(0, h.e - dt / 0.3);
      const e = ease(h.e), b = T.at[h.i];
      tess.pulled.matrix.copy(b.m); tess.pulled.matrix.elements[14] += -h.k * GZ + e * 0.45; tess.pulled.matrix.elements[13] += e * 0.04;
      tess.pulled.matrixWorldNeedsUpdate = true;
      if (!h.e && !h.to) { T.held = null; tess.pulled.visible = false; tessWindow(T.cur, true); }
    }
    const g = tess.exit.g.position;   // through the white ring: back to the archive
    if (tess.prevZ < g.z && player.z >= g.z && Math.hypot(player.x - g.x, player.eye - g.y) < 1.8 && mode === 'free') exitTess();
    tess.prevZ = player.z;
    const d = Math.hypot(player.x - g.x, player.eye - g.y, player.z - g.z);
    if (d > PULL + 0.5) tess.armed = true;
    const s = tess.armed && player.z < g.z && mode === 'free' ? pullOf(d) : 0;
    if (s) { pullTo(dt, s, g.x, g.y, g.z + 0.8, true); tess.vel.multiplyScalar(1 - Math.min(1, s * 3 * dt)); }
    pullFx(s, WARP_OUT, g);
  };
  // What you're looking at: the books are in planes (each layer's front, or back if you're looking forward in time), so find
  // where the ray crosses the nearest few and which bookcase, shelf and slot that is.
  tess.pick = (ray) => {
    const T = tess.t;
    if (!T) return null;
    const o = ray.ray.origin, dv = ray.ray.direction;
    let best = null;
    if (Math.abs(dv.z) < 1e-4) return null;
    for (let k = Math.max(0, T.cur - 2); k <= Math.min(T.K - 1, T.cur + 2); k++) {
      const s = (-k * GZ + (dv.z < 0 ? BD / 2 : -BD / 2) - o.z) / dv.z;
      if (s <= 0 || s > 7 || (best && s >= best.s)) continue;
      const x = o.x + dv.x * s, y = o.y + dv.y * s, cs = T.rows.get(Math.round(-y / GY))?.find((c) => Math.abs(x - c.p.x) < BW / 2);
      if (!cs || Math.abs(y - cs.p.y) > BH / 2) continue;
      const sh = Math.floor((cs.p.y + BH / 2 - 0.05 - y) / SHELF), sl = Math.floor((x - (cs.p.x - BW / 2 + 0.06)) / SLOT);
      const i = sh >= 0 && sh < 4 && sl >= 0 && sl < 14 ? cs.d.files[cs.c * PER + sh * 14 + sl] : undefined;
      best = { s, k, i: i !== undefined && T.alive(i, k) && Math.abs(y - T.at[i].y) < T.at[i].h / 2 ? i : null };
    }
    return best?.i != null ? { action: 'book', book: { k: best.k, i: best.i } } : null;
  };
  tess.map = () => {   // a side view of the tree with you in it, and where you are in time down the right
    const c = mapCtx, W = 440, H = 330, T = tess.t, b = T.box, k = Math.min((W - 70) / (b.x1 - b.x0), (H - 70) / (b.y1 - b.y0));
    const sx = (x) => 20 + (x - b.x0) * k, sy = (y) => 50 + (b.y1 - y) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#ffd58f'; c.font = '600 20px system-ui'; c.fillText(fit(c, `INSIDE · ${T.repo.name}`, W - 40), 16, 30);
    c.fillStyle = 'rgba(255,213,143,.45)';
    for (const cs of T.cases) c.fillRect(sx(cs.p.x - BW / 2), sy(cs.p.y + BH / 2), Math.max(2, BW * k), Math.max(2, BH * k));
    c.fillStyle = '#fff'; c.beginPath(); c.arc(sx(player.x), sy(player.eye), 5, 0, Math.PI * 2); c.fill();
    const t0 = 50, t1 = H - 20, u = clamp(-player.z / Math.max(1, (T.K - 1) * GZ), 0, 1);
    c.fillStyle = 'rgba(255,213,143,.25)'; c.fillRect(W - 24, t0, 4, t1 - t0);
    c.fillStyle = '#ffd58f'; c.fillRect(W - 30, t0 + u * (t1 - t0) - 2, 16, 4);
  };
  const flyV = new THREE.Vector3(), FOV0 = camera.fov;
  function flyPlayer(dt) {   // inside a repo you float: where you look, plus up and down
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('KeyQ') ? 1 : 0);
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw), cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    flyV.set(-sy * cp * f + cy * s, sp * f + up, -cy * cp * f - sy * s);
    if (flyV.lengthSq() > 1) flyV.normalize();
    // Shift: faster, and the longer you hold it on the move the more it builds, up to a long glide (60 m/s after ~7 s);
    // let go or stop and it eases off. The view widens a touch with speed.
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight'), going = flyV.lengthSq() > 0.01;
    tess.boost = shift && going ? Math.min(1, (tess.boost || 0) + dt / 7) : Math.max(0, (tess.boost || 0) - dt / 1.2);
    const speed = shift ? lerp(9, tess.t?.top || 60, tess.boost ** 2) : 3.5;
    tess.vel.lerp(flyV.multiplyScalar(speed), Math.min(1, dt * (tess.vel.length() > speed ? 1.6 : 2.5)));
    const fov = FOV0 + 14 * clamp((tess.vel.length() - 6) / 50, 0, 1) + 6 * clamp((tess.vel.length() - 60) / 260, 0, 1) + 16 * (tess.pullS || 0);
    if (!tess.warping && Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix(); }
    player.x += tess.vel.x * dt; player.eye += tess.vel.y * dt; player.z += tess.vel.z * dt;
    tess.bound(player);
    setCam({ x: player.x, y: player.eye + Math.sin(performance.now() / 1300) * 0.02, z: player.z, yaw: player.yaw, pitch: player.pitch });
  }

  // Reading a book: it slides off the shelf toward you and opens as a page (the .of-page overlay), as it was in that commit.
  const pageEl = document.createElement('div');
  pageEl.className = 'of-page';
  hud.appendChild(pageEl);
  style.textContent += `
    .of-hud .of-fade { position: absolute; inset: 0; overflow: hidden; display: none; pointer-events: none; }
    .of-hud .of-fade.on { display: block !important; }
    .of-fade .rays { position: absolute; left: 50%; top: 50%; width: 260vmax; height: 260vmax; margin: -130vmax 0 0 -130vmax; opacity: 0;
      background: repeating-conic-gradient(var(--ray) 0deg .5deg, transparent .5deg 3.1deg); -webkit-mask: radial-gradient(circle, transparent 3%, #000 22%, #000 60%, transparent 72%); mask: radial-gradient(circle, transparent 3%, #000 22%, #000 60%, transparent 72%); }
    .of-fade .rays.b { background: repeating-conic-gradient(var(--ray) 0deg .25deg, transparent .25deg 5.3deg); }
    .of-fade .flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(circle, var(--flash) 0%, var(--flash) 18%, var(--bg) 75%); }
    .of-tstrip { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); display: none; text-align: center; background: rgba(15,10,5,.78); border: 1px solid rgba(255,200,120,.25); border-radius: 10px; padding: 7px 14px; color: #f0dcb4; }
    .of-tess .of-tstrip { display: block; }
    .of-tess .of-legend, .of-tess .of-count, .of-tess .of-time { display: none; }
    .of-tstrip b { color: #ffd58f; } .of-tstrip code { font: 12px ${MONO}; color: #c9a25c; }
    .of-tstrip small { display: block; color: #a8946c; font-size: 11px; } .of-tstrip kbd { font: inherit; font-weight: 600; color: #ffe2ad; background: rgba(255,213,143,.12); border-radius: 4px; padding: 0 4px; margin: 0 1px; }
    .of-tstrip .bar { display: flex; gap: 3px; justify-content: center; margin: 5px 0 4px; } .of-tstrip .bar i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,213,143,.22); }
    .of-tstrip .bar i.on { background: #ffd58f; box-shadow: 0 0 8px #ffb347; }
    .of-tstrip .tl { position: relative; height: 4px; margin: 8px 6px 16px; border-radius: 2px; background: rgba(255,213,143,.22); }
    .of-tstrip .tl i { position: absolute; top: -3px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: #ffd58f; box-shadow: 0 0 8px #ffb347; }
    .of-tstrip .tl span { position: absolute; top: 7px; left: 0; font-size: 10px; color: #a8946c; } .of-tstrip .tl span + span { left: auto; right: 0; }
    .of-hud .of-page { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(20,12,4,.3), rgba(5,3,1,.75)); }
    .of-hud .of-page.on { display: flex !important; }
    .of-page .pp { width: min(1000px, 92vw); height: min(760px, calc(100vh - 80px)); display: flex; flex-direction: column; background: #14100b; border: 1px solid #6b5530; border-radius: 10px; box-shadow: 0 0 90px rgba(255,170,70,.2); color: #ecdcbc; animation: of-pp-in .35s ease-out; }
    @keyframes of-pp-in { from { transform: scale(.94); opacity: 0; } }
    .of-page .hd { padding: 14px 18px 10px; border-bottom: 1px solid #3a2e1c; }
    .of-page .hd b { font: 600 16px ${MONO}; color: #ffd58f; overflow-wrap: anywhere; }
    .of-page .hd small { display: block; color: #a8946c; font-size: 12px; margin-top: 3px; overflow-wrap: anywhere; }
    .of-page .bd { flex: 1; overflow: auto; overscroll-behavior: contain; padding: 12px 0; }
    .of-page .code { font: 12.5px/1.55 ${MONO}; margin: 0; counter-reset: ln; white-space: pre; tab-size: 4; }
    .of-page .code span { display: block; padding-right: 18px; }
    .of-page .code span::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 46px; padding-right: 14px; text-align: right; color: #5e4f36; }
    .of-page .md { padding: 0 24px; font: 14px/1.6 system-ui, sans-serif; }
    .of-page .md h2, .of-page .md h3, .of-page .md h4, .of-page .md h5, .of-page .md h6, .of-page .md h7 { color: #ffd58f; font-size: 16px; margin: 16px 0 6px; } .of-page .md h2 { font-size: 21px; }
    .of-page .md pre { background: #0b0805; padding: 8px 10px; overflow-x: auto; font: 12px/1.45 ${MONO}; } .of-page .md code { background: #2a2014; padding: 0 3px; font-family: ${MONO}; }
    .of-page .md p, .of-page .md ul, .of-page .md ol, .of-page .md blockquote { margin: 0 0 10px; overflow-wrap: anywhere; } .of-page .md .tr { white-space: pre; font: 12px ${MONO}; }
    .of-page a { color: #ffc46b; } .of-page .n { color: #a8946c; font-style: italic; padding: 0 18px; }
    .of-page .btns { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid #3a2e1c; }
    .of-page .btns > * { font: 600 13px system-ui, sans-serif; background: #3a2c18; color: #ffe2ad; border: 1px solid #6b5530; border-radius: 7px; padding: 7px 13px; cursor: pointer; text-decoration: none; }
    .of-page .btns > :hover { background: #4d3a1f; } .of-page kbd { font: inherit; opacity: .7; }
    .of-folder .co { font: 700 12px "Courier New", monospace; letter-spacing: .14em; color: #5d574c; margin: 2px 0 8px; }
    .of-folder .co b { color: #b8352b; font-size: 17px; letter-spacing: .1em; border: 1px dashed #b8352b; padding: 1px 8px; margin-left: 6px; }
  `;
  pageEl.addEventListener('click', (e) => { if (e.target === pageEl || e.target.closest('[data-act=back]')) closeBook(true); });
  let pageTurnAt = 0;
  pageEl.addEventListener('scroll', (e) => {
    const el = e.target, now = performance.now();
    if (Math.abs(el.scrollTop - (el.turned || 0)) > 500 && now - pageTurnAt > 250) { el.turned = el.scrollTop; pageTurnAt = now; sfx.cabinet('page', camera.position, 0.12); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!pageEl.classList.contains('on') || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); closeBook(false);
  }, true);
  function readBook(b) {
    const T = tess.t;
    if (!T || T.held || mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    mode = 'read'; keys.clear(); tess.vel.set(0, 0, 0);
    T.held = { ...b, e: 0, to: 1 };
    tessWindow(T.cur, true);
    tess.pulled.material.color.copy(T.at[b.i].color); tess.pulled.visible = true;
    sfx.cabinet('book', new THREE.Vector3().setFromMatrixPosition(T.at[b.i].m).setZ(-b.k * GZ), 0.4);
    const c = T.slices[b.k].c, p = T.paths[b.i];
    pageEl.innerHTML = pageHtml(T, b, null); pageEl.classList.add('on');
    fetch(`/api/repos/${encodeURIComponent(T.repo.owner)}/${encodeURIComponent(T.repo.name)}/blob?ref=${encodeURIComponent(c.sha)}&path=${encodeURIComponent(p)}`)
      .then(async (x) => (x.ok ? x.json() : { error: (await x.json().catch(() => ({}))).error || `HTTP ${x.status}` })).catch((e) => ({ error: e.message }))
      .then((r) => { if (T.held?.i === b.i && T.held.k === b.k && T.held.to) pageEl.innerHTML = pageHtml(T, b, r); });
  }
  function closeBook(relock) {
    const T = tess.t;
    if (!T?.held?.to) return;
    T.held.to = 0;
    pageEl.classList.remove('on');
    sfx.cabinet('book', camera.position, 0.3);
    if (mode === 'read') mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();
  }
  function pageHtml(T, b, r) {
    const p = T.paths[b.i], c = T.slices[b.k].c, s = escapeHtml;
    const when = c.date ? new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    let body;
    if (!r) body = '<p class="n">Taking it off the shelf…</p>';
    else if (r.error) body = `<p class="n">Couldn’t read it: ${s(r.error)}</p>`;
    else if (r.text == null) body = `<p class="n">Nothing to read here: it’s ${s(r.why)}.</p>`;
    else if (/\.(md|markdown)$/i.test(p)) body = `<div class="md">${readmeHtml(r.text, T.repo.url, c.sha)}</div>`;
    else body = `<pre class="code">${r.text.replace(/\n$/, '').split('\n').map((l) => `<span>${s(l) || ' '}</span>`).join('')}</pre>${r.cut ? '<p class="n">…and on (cut short here).</p>' : ''}`;
    const url = `${T.repo.url}/blob/${c.sha}/${p.split('/').map(encodeURIComponent).join('/')}`;
    return `<div class="pp"><div class="hd"><b>${s(p)}</b><small>${fmtSize(T.size[b.i])} · as it was ${b.k ? `${b.k} commit${b.k > 1 ? 's' : ''} ago` : 'now'} · ${s(c.sha.slice(0, 7))} “${s(c.message)}”${when ? ` · ${s(when)}` : ''}${T.slices[b.k].touched.has(b.i) ? ' · this commit changed it' : ''}</small></div>
      <div class="bd">${body}</div><div class="btns"><a href="${s(url)}" target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a><button data-act="back">Put it back <kbd>Esc</kbd></button></div></div>`;
  }
  function tessHover(h) {
    if (h.action === 'gatekey') return `<b>The gateway</b><div class="m">${escapeHtml(gate.msg)}</div><div class="k">${h.key ? `Click to ${h.key === 'CLOSE' ? 'close the gateway' : `press ${h.key === 'GO' ? 'ENTER' : h.key === '⌫' ? 'delete' : h.key}`}` : 'Enter a repo’s coordinates (they’re in its folder)'}</div>`;
    const T = tess.t, { k, i } = h.book, p = T.paths[i];
    return `<b>${escapeHtml(p.slice(p.lastIndexOf('/') + 1))}</b><div class="m">${escapeHtml(p)}</div><div class="m">${fmtSize(T.size[i])}${T.slices[k].touched.has(i) ? ' · changed in this commit' : ''}</div>
      <div class="k">Click to read it as it was ${k ? `${k} commit${k > 1 ? 's' : ''} ago` : 'now'}</div>`;
  }
  // Another floor's car: a freestanding stone shaft and the same car as the office's, facing -x at LIFT.x about z = 0, with
  // its own doors, hall lantern, call button and floor panel (moved onto your car's z when you arrive, see setFloor).
  function liftShaft() {
    const lift = new THREE.Group(), fx = LIFT.x + 0.05, front = LIFT.x + 0.1, cx = front + CAR.d / 2, back = front + CAR.d, sw = CAR.w / 2 + 0.3, top = ROOM.h;
    const stone = [[0.1, top, sw - DOOR.w / 2, fx, top / 2, -(sw + DOOR.w / 2) / 2], [0.1, top, sw - DOOR.w / 2, fx, top / 2, (sw + DOOR.w / 2) / 2], [0.1, top - DOOR.h, DOOR.w, fx, (top + DOOR.h) / 2, 0],
      [back + 0.2 - front, top, 0.3, (front + back + 0.2) / 2, top / 2, -sw + 0.15], [back + 0.2 - front, top, 0.3, (front + back + 0.2) / 2, top / 2, sw - 0.15],
      [0.2, top, CAR.w, back + 0.1, top / 2, 0], [back + 0.2 - front, top - CAR.h - 0.04, CAR.w, (front + back + 0.2) / 2, (top + CAR.h + 0.04) / 2, 0]];
    for (let y = 0.9; y < top; y += 0.9) for (const s of y > DOOR.h ? [0] : [-1, 1]) stone.push([0.012, 0.006, s ? sw - DOOR.w / 2 - 0.08 : sw * 2, LIFT.x - 0.001, y, s * (sw + DOOR.w / 2 + 0.08) / 2]);   // panel joints, not across the doorway
    lift.add(mergedBoxes(stone.map((b) => [...b, b[1] === 0.006 ? '#5d5852' : '#77716a']), mat('#ffffff', { vertexColors: true, roughness: 0.55 })));
    const steel = [[0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, 0], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, 0], [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, 0],
      [0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, DOOR.w / 2 + 0.3], [back + 0.24 - LIFT.x, 0.03, sw * 2 + 0.02, (LIFT.x + back + 0.24) / 2, top + 0.015, 0]];
    for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, s * (DOOR.w / 2 + 0.04)]);
    const steelM = liftSteelM;   // the office's brushed steel, so doors and surrounds match on every floor
    lift.add(mergedBoxes(steel, steelM));
    const car = [[CAR.d, 0.02, CAR.w, cx, 0.01, 0, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, 0, '#232426'], [0.04, CAR.h, CAR.w, back, CAR.h / 2, 0, '#8a6446'],
      [0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, 0, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, CAR.w / 2 - 0.03, '#5a5f66']];
    for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, s * CAR.w / 2, '#aeb4ba'], [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, s * (CAR.w / 2 - 0.06), '#dfe2e5']);
    lift.add(mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })), mergedBoxes([[0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, 0]], mat('#dfe4e8', { metalness: 1, roughness: 0.05 })),
      mergedBoxes([[CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, 0]], new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 })));
    const leaves = [-1, 1].map((s) => box(lift, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, s * DOOR.w / 4, { material: steelM, shadow: false }));
    const ind = { ind: makeScreen(lift, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, 0), floor: ARCHIVE, dir: 0 };
    ind.ind.mesh.rotation.y = -Math.PI / 2;
    const callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(lift, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, DOOR.w / 2 + 0.3, { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    const callHit = hitBox(lift, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, DOOR.w / 2 + 0.3, { action: 'liftcall', reach: 2.5 });
    const panel = carPanel(lift, 0); paintPanel(panel, null);
    return { lift, leaves, ind, callM, callHit, panel };
  }
  // Going to (F) or leaving (null) another floor, behind closed doors.
  function setFloor(F) {
    if (away === F) return;
    if (away) { away.on = false; away.leave?.(); }
    away = F;
    if (F) {
      F.on = true; F.out = 0;
      F.enter(mine.L.z); F.scene?.updateMatrixWorld();
      tvQuiet();
    }
    cssRenderer.domElement.style.visibility = F ? 'hidden' : '';
    sfx.setAway(!!F, F?.sound);
  }
  // Inside the car it's lit like the office car upstairs; stepping out of the doorway, your eyes adjust to the floor's own `look`:
  // exposure, hemisphere light, environment and extra lights, and the office's bloom and grade scaled by look.bloom/grade.
  function renderFloor(F) {
    const w = container.clientWidth, h = container.clientHeight, L = F.look;
    if (!F.composer) {
      const c = F.composer = new EffectComposer(renderer);
      c.setPixelRatio(renderer.getPixelRatio());
      c.addPass(new RenderPass(F.scene, camera));
      const ao = F.gtao = new GTAOPass(F.scene, camera, 512, 512);
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
      if (L.aoSkip1) { const aoRender = ao.render.bind(ao); ao.render = (...a) => { camera.layers.disable(1); aoRender(...a); camera.layers.enable(1); }; }
      F.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), bloom.strength, bloom.radius, bloom.threshold);
      F.grade = new ShaderPass(grade.material.clone());
      c.addPass(ao); c.addPass(F.bloom); c.addPass(new OutputPass()); c.addPass(F.grade);
      c.setSize(w, h);
    }
    F.gtao.enabled = hq;
    // Only the car itself is office-lit: the switch happens across the doorway (0.4 m inside to 0.3 m out), eased over ~1 s,
    // so walking up to the lift from the floor never dims anything.
    F.out = F.carless ? 1 : damp(F.out ?? 0, clamp((LIFT.x + 0.4 - player.x) / 0.7, 0, 1), 3, 1 / 60);
    const k = ease(F.out);
    renderer.toneMappingExposure = lerp(officeExposure, L.exposure, k);
    F.hemi.intensity = lerp(hemi.intensity, L.hemi, k);
    F.hemi.color.copy(hemi.color).lerp(L.sky, k); F.hemi.groundColor.copy(hemi.groundColor).lerp(L.ground, k);
    for (const [light, v] of L.lights) light.intensity = v * k;
    F.bloom.strength = bloom.strength * lerp(1, L.bloom, k); F.bloom.enabled = hq && F.bloom.strength > 0.004;
    F.grade.enabled = hq; F.grade.uniforms.amount.value = lerp(1, L.grade, k);
    F.scene.environmentIntensity = lerp(scene.environmentIntensity, L.env, k);
    F.composer.render();
    renderer.setRenderTarget(null);
    const gl = renderer.getContext();   // full alpha everywhere: no dashboard hole down here (see renderFrame)
    gl.colorMask(false, false, false, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.colorMask(true, true, true, true);
    renderer.state.buffers.color.reset();
  }
  function drawArchiveMap() {
    const x0 = GATE.x - 8, x1 = LIFT.x + 6, z0 = ARCH.z - 8, z1 = GATE.z + 8, k = Math.min(400 / (x1 - x0), 270 / (z1 - z0));
    const c = mapCtx, W = 440, H = 330, sx = (x) => W / 2 + (x - (x0 + x1) / 2) * k, sz = (z) => H / 2 + 18 + (z - (z0 + z1) / 2) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(sx(ARCH.x), sz(ARCH.z), ARCH.r * k, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (const b of arch.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(3, (b.maxX - b.minX) * k), Math.max(3, (b.maxZ - b.minZ) * k));
    c.font = '600 20px system-ui'; c.fillText('THE ARCHIVE · B2', 16, 30);
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Lift', sx(LIFT.x) - 6, sz(arch.lift.position.z) - 18); c.fillText('Cabinet', sx(ARCH.x) - 26, sz(ARCH.z) + 26); c.fillText('Gateway', sx(GATE.x) - 28, sz(GATE.z) + 34);
    c.fillRect(sx(GATE.x - GATE.PW / 2), sz(GATE.z - GATE.PD / 2 - 1.2), GATE.PW * k, (GATE.PD + 2.4) * k);
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }

  // ----- THE ROOF (R) -----
  // The tower's roof terrace, over the office in the same scene, so the sky, sun, city, clouds and shadows are the ones
  // you see from your desk. Paving and decking inside a glass balustrade; a lounge, a fire table and a café under festoon
  // lights (on at dusk with the lamps); planters, a herb bed and a BBQ; a helipad; the plant (condensers, a water tank,
  // vents) behind a louvred screen; and the lift overrun your car opens out of, under a mast with a red aviation light.
  // Built at deck height 0 in roof.g, which sits at ROOF_Y and is only shown while you're up here.
  const ROOF_Y = ROOM.h + 0.5, EDGE = { x: 20.3, z: 15.3 }, HELI = { x: -9.5, z: 8.6, r: 5.6 };
  const roof = { n: ROOF, label: 'ROOF', title: 'Roof terrace', y: ROOF_Y, sound: 'roof', g: new THREE.Group(), colliders: [], cars: [], fans: [] };
  {
    const G = roof.g, c0 = colliders.length, s0 = seats.length, R = rng(5050);
    G.position.y = ROOF_Y; G.visible = false; world.add(G);
    const flat = (w, d, m, x, z, y = 0.002) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; G.add(p); return p; };
    // Paving: big pale concrete slabs, a little uneven in tone. Decking: weathered hardwood boards.
    const pave = makeCanvas(512, 512), pc = pave.ctx;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 128 + R() * 20; pc.fillStyle = `rgb(${v},${v - 2},${v - 6})`; pc.fillRect(i * 128, j * 128, 128, 128); }
    for (let i = 0; i < 9000; i++) { pc.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '50,48,44'},${R() * 0.07})`; pc.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
    pc.fillStyle = '#6d6a64'; for (let k = 0; k <= 4; k++) { pc.fillRect(k * 128 - 2, 0, 4, 512); pc.fillRect(0, k * 128 - 2, 512, 4); }
    pave.tex.wrapS = pave.tex.wrapT = THREE.RepeatWrapping; pave.tex.repeat.set(40.6 / 2.4, 30.6 / 2.4); pave.tex.needsUpdate = true;
    const deck = makeCanvas(512, 512), dc = deck.ctx;
    for (let j = 0; j < 8; j++) for (let x = 0; x < 512;) {
      const len = 160 + R() * 260, v = R(); dc.fillStyle = `rgb(${128 + v * 30},${100 + v * 22},${78 + v * 16})`; dc.fillRect(x, j * 64, len, 64);
      for (let g = 0; g < 14; g++) { dc.fillStyle = `rgba(60,40,28,${0.06 + R() * 0.08})`; dc.fillRect(x, j * 64 + 4 + R() * 56, len, 1 + R() * 2); }
      dc.fillStyle = '#3b2c22'; dc.fillRect(x, j * 64, 3, 64); x += len;
    }
    dc.fillStyle = '#2a201a'; for (let j = 0; j < 8; j++) dc.fillRect(0, j * 64, 512, 5);
    deck.tex.wrapS = deck.tex.wrapT = THREE.RepeatWrapping; deck.tex.needsUpdate = true;
    const slabM = mat('#8f8c86', { roughness: 0.9 });
    box(G, EDGE.x * 2, 0.3, EDGE.z * 2, '', 0, -0.15, 0, { material: slabM });
    flat(EDGE.x * 2, EDGE.z * 2, new THREE.MeshStandardMaterial({ map: pave.tex, roughness: 0.92 }), 0, 0);
    const TER = { x0: -19.6, x1: 16.6, z0: -14.0, z1: -4.0 };   // the decked terrace, south side
    const dt = deck.tex.clone(); dt.repeat.set((TER.x1 - TER.x0) / 2.6, (TER.z1 - TER.z0) / 1.3); dt.needsUpdate = true;
    box(G, TER.x1 - TER.x0, 0.03, TER.z1 - TER.z0, '', (TER.x0 + TER.x1) / 2, 0.015, (TER.z0 + TER.z1) / 2, { material: new THREE.MeshStandardMaterial({ map: dt, roughness: 0.8 }) });

    // The edge: a stone upstand, frameless glass on top and a steel handrail you can lean on.
    const up = [], rail = [], joints = [], H = 1.12, gw = 0.35;
    for (const s of [-1, 1]) {
      up.push([EDGE.x * 2, 0.3, gw, 0, 0.15, s * (EDGE.z - gw / 2)], [gw, 0.3, EDGE.z * 2 - gw * 2, s * (EDGE.x - gw / 2), 0.15, 0]);
      rail.push([EDGE.x * 2 - 0.2, 0.05, 0.07, 0, H, s * (EDGE.z - gw / 2)], [0.07, 0.05, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), H, 0],
        [EDGE.x * 2 - 0.2, 0.09, 0.08, 0, 0.345, s * (EDGE.z - gw / 2)], [0.08, 0.09, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), 0.345, 0]);
      for (let x = -EDGE.x + 1.9; x < EDGE.x - 1; x += 1.9) joints.push([0.012, H - 0.39, 0.03, x, (H + 0.39) / 2, s * (EDGE.z - gw / 2)]);
      for (let z = -EDGE.z + 1.9; z < EDGE.z - 1; z += 1.9) joints.push([0.03, H - 0.39, 0.012, s * (EDGE.x - gw / 2), (H + 0.39) / 2, z]);
      // Colliders at the glass, so you can walk right up to the rail and look over.
      roof.colliders.push({ minX: -EDGE.x, maxX: EDGE.x, minZ: s > 0 ? EDGE.z - gw / 2 - 0.05 : -EDGE.z, maxZ: s > 0 ? EDGE.z : -EDGE.z + gw / 2 + 0.05 },
        { minX: s > 0 ? EDGE.x - gw / 2 - 0.05 : -EDGE.x, maxX: s > 0 ? EDGE.x : -EDGE.x + gw / 2 + 0.05, minZ: -EDGE.z, maxZ: EDGE.z });
    }
    G.add(mergedBoxes(up, mat('#b9b4aa', { roughness: 0.85 })), mergedBoxes([...rail, ...joints], mat('#c9cdd2', { metalness: 0.85, roughness: 0.3 })));
    const glassM = new THREE.MeshStandardMaterial({ color: '#d6e8ee', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const pane = mergedBoxes([0, 1].flatMap((i) => [-1, 1].map((s) => i ? [0.02, H - 0.39, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), (H + 0.39) / 2, 0] : [EDGE.x * 2 - 0.2, H - 0.39, 0.02, 0, (H + 0.39) / 2, s * (EDGE.z - gw / 2)])), glassM);
    pane.castShadow = false; G.add(pane);

    // The lift overrun: two cars over the core, the same cars as downstairs, stone portal under a canopy, zinc above.
    const top = 3.3, fx = LIFT.x + 0.05, cx = LIFT.x + 0.1 + CAR.d / 2, back = LIFT.x + 0.1 + CAR.d, z0 = CORE.z0 - 0.2, z1 = CORE.z1 + 0.2, x1 = EDGE.x - gw;
    const stone = [], zinc = [], steel = [], car = [], mirror = [], glow = [];
    const edges = [z0, ...lifts.flatMap((L) => [L.z - DOOR.w / 2, L.z + DOOR.w / 2]), z1];
    for (let k = 0; k < edges.length; k += 2) stone.push([0.1, top, edges[k + 1] - edges[k], fx, top / 2, (edges[k] + edges[k + 1]) / 2]);
    zinc.push([x1 - LIFT.x, top, 0.1, (LIFT.x + x1) / 2, top / 2, z0 + 0.05], [x1 - LIFT.x, top, 0.1, (LIFT.x + x1) / 2, top / 2, z1 - 0.05],
      [x1 - LIFT.x + 0.2, 0.25, z1 - z0 + 0.2, (LIFT.x + x1) / 2, top + 0.125, (z0 + z1) / 2], [0.1, top, z1 - z0, x1 - 0.05, top / 2, (z0 + z1) / 2]);
    for (let x = LIFT.x + 0.5; x < x1; x += 0.5) for (const s of [-1, 1]) zinc.push([0.03, top, 0.03, x, top / 2, s > 0 ? z1 + 0.01 : z0 - 0.01]);   // standing seams
    steel.push([1.3, 0.1, z1 - z0 + 0.6, LIFT.x - 0.6, 2.95, (z0 + z1) / 2], [0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, LIFT.z]);   // canopy, call panel
    roof.callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(G, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, LIFT.z, { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : roof.callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    const steelM = liftSteelM;   // the office's brushed steel, so doors and surrounds match on every floor
    for (const L of lifts) {
      const z = L.z;
      stone.push([0.1, top - DOOR.h, DOOR.w, fx, (top + DOOR.h) / 2, z]);
      for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, z + s * (DOOR.w / 2 + 0.04)]);
      steel.push([0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, z], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, z], [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, z]);
      car.push([CAR.d, 0.02, CAR.w, cx, 0.01, z, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, z, '#232426'], [0.04, CAR.h, CAR.w, back, CAR.h / 2, z, '#8a6446']);
      for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, z + s * CAR.w / 2, '#aeb4ba'], [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, z + s * (CAR.w / 2 - 0.06), '#dfe2e5']);
      car.push([0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, z, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, z + CAR.w / 2 - 0.03, '#5a5f66']);
      mirror.push([0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, z]);
      glow.push([CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, z]);
      // Doors and lantern in a group on the car's z, so they slide like every floor's (see myLift).
      const dg = new THREE.Group(); dg.position.z = z; G.add(dg);
      const ind = makeScreen(dg, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, 0);
      ind.mesh.rotation.y = -Math.PI / 2;
      roof.cars.push({ z, leaves: [-1, 1].map((s) => box(dg, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, s * DOOR.w / 4, { material: steelM, shadow: false })), ind: { ind, floor: L.floor, dir: 0 } });
    }
    G.add(mergedBoxes(stone, mat('#77716a', { roughness: 0.55 })), mergedBoxes(zinc, mat('#5d636a', { metalness: 0.5, roughness: 0.55 })), mergedBoxes(steel, steelM),
      mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })), mergedBoxes(mirror, mat('#dfe4e8', { metalness: 1, roughness: 0.05 })));
    const carLight = mergedBoxes(glow, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 }));
    carLight.castShadow = false; G.add(carLight);
    roof.callHit = hitBox(G, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
    roof.panel = carPanel(G, 0); paintPanel(roof.panel, null);   // one, moved into your car (see roof.enter)
    roof.colliders.push({ minX: LIFT.x, maxX: EDGE.x, minZ: z0, maxZ: z1 });
    // A plaque by the doors, like the floor sign downstairs.
    const sign = makeScreen(G, 0.9, 0.6, 360, 240, LIFT.x - 0.012, 1.6, z0 + 0.62), sc = sign.ctx;
    sign.mesh.rotation.y = -Math.PI / 2;
    sc.fillStyle = '#26282b'; sc.fillRect(0, 0, 360, 240); sc.fillStyle = '#d97757'; sc.fillRect(26, 40, 5, 90);
    sc.font = `200 104px ${FONT}`; sc.fillStyle = '#f2efe8'; sc.fillText('R', 44, 128);
    sc.font = `600 22px ${FONT}`; sc.fillStyle = '#c3c2b7'; sc.fillText('ROOF', 130, 72); sc.font = `400 20px ${FONT}`; sc.fillText('Terrace · Helipad', 130, 104);
    sc.fillStyle = '#9a9890'; sc.font = `400 17px ${FONT}`; sc.fillText('Please don’t lean over the glass', 26, 196);
    sign.mesh.material = new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.5 }); sign.tex.needsUpdate = true;
    // The mast on the overrun: a tapered pole, two arms of antennas and the red light on top (it blinks with the city's).
    const mx = 19.2, mz = 1.6, mh = 9;
    cyl(G, 0.05, 0.1, mh, '#b8bcc0', mx, top + 0.25 + mh / 2, mz, { mat: { metalness: 0.7, roughness: 0.4 }, seg: 10 });
    for (const [y, l] of [[top + 4, 1.4], [top + 6.5, 1]]) {
      box(G, l, 0.05, 0.05, '#b8bcc0', mx, y, mz);
      for (const s of [-1, 1]) cyl(G, 0.02, 0.02, 1.1, '#e5e5e2', mx + s * l / 2, y + 0.3, mz, { seg: 6 });
    }
    const dish = cyl(G, 0.32, 0.05, 0.14, '#e9e8e4', mx - 0.2, top + 2.6, mz, { seg: 20 }); dish.rotation.z = Math.PI / 2 - 0.3;
    const av = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), city.av); av.position.set(mx, top + 0.3 + mh, mz); G.add(av);

    // Planters: long ones of swaying grasses along the edge, big square ones with a small tree.
    const planterM = mat('#3d4042', { roughness: 0.7 }), soilM = mat('#3b2c22', { roughness: 1 });
    const { strap, twig, stem, add } = plantKit(), p = new THREE.Vector3(), d = new THREE.Vector3(), col = new THREE.Color();
    const grass = (x, z, n, h) => {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = R() * 0.08, hh = h * (0.6 + R() * 0.5);
        p.set(x + Math.cos(a) * r, ROOF_Y + 0.5, z + Math.sin(a) * r); d.set(Math.cos(a) * (0.15 + R() * 0.35), 1, Math.sin(a) * (0.15 + R() * 0.35));
        add(strap, p, d, hh * 0.22, hh, R() * 3, col.setRGB(0.95 + R() * 0.25, 1.0, 0.55 + R() * 0.25));
      }
    };
    const planter = (x0, x1, z) => {
      G.add(mergedBoxes([[x1 - x0, 0.5, 0.6, (x0 + x1) / 2, 0.25, z]], planterM)); box(G, x1 - x0 - 0.08, 0.02, 0.52, '', (x0 + x1) / 2, 0.49, z, { material: soilM, shadow: false });
      for (let x = x0 + 0.25; x < x1 - 0.15; x += 0.42) grass(x + (R() - 0.5) * 0.1, z + (R() - 0.5) * 0.25, 7, 0.75);
      roof.colliders.push({ minX: x0, maxX: x1, minZ: z - 0.3, maxZ: z + 0.3 });
    };
    planter(-19.7, -9.4, -14.55); planter(-6.4, 6.2, -14.55); planter(8.6, 16.8, -14.55);
    for (const z of [-11.6, -6.6, 6.5, 11]) { G.add(mergedBoxes([[0.6, 0.5, 3.4, -19.55, 0.25, z]], planterM)); for (let k = -1.5; k <= 1.5; k += 0.42) grass(-19.55, z + k, 7, 0.75); roof.colliders.push({ minX: -19.85, maxX: -19.25, minZ: z - 1.7, maxZ: z + 1.7 }); }
    const tree = (x, z) => {
      G.add(mergedBoxes([[1.2, 0.7, 1.2, x, 0.35, z]], planterM)); box(G, 1.1, 0.02, 1.1, '', x, 0.69, z, { material: soilM, shadow: false });
      const y0 = ROOF_Y + 0.7, tint = new THREE.Color(0.85 + R() * 0.15, 1, 0.75 + R() * 0.2);
      add(stem, p.set(x, y0, z), d.set(0.05, 1, 0.03), 0.06, 1.9);
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + R(); p.set(x, y0 + 1.4 + R() * 0.4, z); d.set(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6); add(stem, p, d, 0.025, 0.9); }
      for (let i = 0; i < 120; i++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u), f = 0.45 + R() * 0.55;
        d.set(Math.cos(a) * k, u * 0.6 + 0.2, Math.sin(a) * k);
        p.set(x + d.x * 0.95 * f, y0 + 2.35 + d.y * 0.75 * f, z + d.z * 0.95 * f); d.y += 0.3;
        const h = 0.36 + R() * 0.16;
        add(twig, p, d, h * 0.9, h, (R() - 0.5) * 1.2, col.copy(tint).multiplyScalar((0.55 + 0.45 * f) * (0.85 + R() * 0.3)));
      }
      roof.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
    };
    tree(-7.9, -14.1); tree(7.4, -14.1); tree(15.6, -4.9); tree(-19.1, -4.6); tree(-19.1, 2.2); tree(4.2, 13.9);

    // The lounge by the lift, and round the fire table: sofas you can sit on.
    sofa(11, -12.1, 0, 2.6, '#d9d3c7', G); sofa(11, -7.5, Math.PI, 2.6, '#d9d3c7', G); sofa(8.3, -9.8, Math.PI / 2, 1.05, '#c26a3d', G); sofa(13.7, -9.8, -Math.PI / 2, 1.05, '#c26a3d', G);
    G.add(mergedBoxes([[1.6, 0.36, 0.8, 11, 0.2, -9.8, '#8a6a4a'], [1.5, 0.03, 0.7, 11, 0.395, -9.8, '#a8835d']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
    roof.colliders.push({ minX: 10.2, maxX: 11.8, minZ: -10.2, maxZ: -9.4 });
    sofa(-1.5, -12.6, 0, 2.8, '#5f6f68', G); sofa(-4.4, -10.2, Math.PI / 2, 2.2, '#5f6f68', G); sofa(1.4, -10.2, -Math.PI / 2, 2.2, '#5f6f68', G);
    const fire = new THREE.MeshStandardMaterial({ color: '#2a1a10', emissive: '#ff7a2a', emissiveIntensity: 1.2, roughness: 0.6 });
    lamps.push({ mat: fire, eBase: 2.2 });
    G.add(mergedBoxes([[1.8, 0.42, 1.0, -1.5, 0.21, -10.2]], mat('#4a4c4e', { roughness: 0.6 }))); box(G, 1.2, 0.02, 0.36, '', -1.5, 0.43, -10.2, { material: fire, shadow: false });
    roof.colliders.push({ minX: -2.4, maxX: -0.6, minZ: -10.7, maxZ: -9.7 });

    // Café: round tables with two chairs each, two under parasols, and the BBQ by the planters.
    const chairM = mat('#2f3236', { metalness: 0.5, roughness: 0.45 }), slatM = mat('#a87447', { roughness: 0.6 });
    const cafeChair = (x, z, rotY) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; G.add(g);
      g.add(mergedBoxes([[0.03, 0.45, 0.03, -0.2, 0.225, -0.2], [0.03, 0.45, 0.03, 0.2, 0.225, -0.2], [0.03, 0.45, 0.03, -0.2, 0.225, 0.2], [0.03, 0.45, 0.03, 0.2, 0.225, 0.2],
        [0.03, 0.42, 0.03, -0.2, 0.66, -0.2], [0.03, 0.42, 0.03, 0.2, 0.66, -0.2]], chairM));
      g.add(mergedBoxes([[0.46, 0.03, 0.44, 0, 0.46, 0], [0.44, 0.1, 0.02, 0, 0.72, -0.21], [0.44, 0.1, 0.02, 0, 0.86, -0.21]], slatM));
      const seat = addSeat(g, 'Chair', 0, SEATED_EYE);
      g.traverse((o) => { if (o.isMesh) o.userData.seat = seat; });
    };
    const canopy = new THREE.ConeGeometry(1.5, 0.45, 8, 1, true);
    [[-16.2, -7.2, 1], [-12.6, -7.2, 0], [-16.2, -11, 0], [-12.6, -11, 1], [-9, -7.2, 0]].forEach(([x, z, shade], i) => {
      cyl(G, 0.4, 0.4, 0.03, '#e8e4dc', x, 0.74, z, { seg: 28 }); cyl(G, 0.03, 0.03, 0.72, '#2f3236', x, 0.37, z, { seg: 8 }); cyl(G, 0.22, 0.22, 0.02, '#2f3236', x, 0.01, z, { seg: 20 });
      cafeChair(x - 0.72, z, Math.PI / 2); cafeChair(x + 0.72, z, -Math.PI / 2);
      if (shade) {
        cyl(G, 0.02, 0.02, 2.5, '#d9d6cf', x, 1.25, z, { seg: 8 });
        const c = new THREE.Mesh(canopy, mat(i ? '#d97757' : '#e9e3d6', { roughness: 0.9, side: THREE.DoubleSide })); c.position.set(x, 2.35, z); c.castShadow = c.receiveShadow = true; G.add(c);
      }
      roof.colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
    });
    G.add(mergedBoxes([[1.5, 0.85, 0.65, -3.6, 0.425, -13.8, '#c9cdd2'], [1.1, 0.25, 0.55, -3.6, 1.0, -13.8, '#2b2d30'], [0.5, 0.03, 0.03, -3.6, 0.95, -14.15, '#c9cdd2'],
      [0.2, 0.02, 0.5, -2.7, 0.86, -13.8, '#8a6a4a']], mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.35 })));
    roof.colliders.push({ minX: -4.35, maxX: -2.85, minZ: -14.15, maxZ: -13.45 });
    // A herb bed along the path from the lift: raised timber, rosemary, thyme, basil, chives.
    for (const x of [3.2, 6.6]) {
      G.add(mergedBoxes([[2.8, 0.55, 0.9, x, 0.275, 3.5]], slatM)); box(G, 2.7, 0.02, 0.8, '', x, 0.54, 3.5, { material: soilM, shadow: false });
      for (let k = 0; k < 9; k++) {
        const hx = x - 1.15 + k * 0.29, tint = [[0.7, 1, 0.8], [0.9, 1.05, 0.6], [1.1, 1.2, 0.5], [0.8, 0.95, 0.9]][k % 4];
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4 + R(), h = 0.24 + R() * 0.14;
          p.set(hx + Math.cos(a) * 0.03, ROOF_Y + 0.55, 3.5 + (R() - 0.5) * 0.4); d.set(Math.cos(a) * (0.3 + R() * 0.5), 1, Math.sin(a) * (0.3 + R() * 0.5));
          add(k % 4 === 2 ? twig : strap, p, d, h * (k % 4 === 2 ? 0.8 : 0.4), h, R() * 3, col.setRGB(tint[0], tint[1], tint[2]).multiplyScalar(0.8 + R() * 0.3));
        }
      }
      roof.colliders.push({ minX: x - 1.4, maxX: x + 1.4, minZ: 3.05, maxZ: 3.95 });
    }

    // Festoon lights over the terrace: zigzag strings between black poles, warm bulbs that come on with the lamps.
    const poles = [-18.6, -10.4, -2.2, 6, 14.2].flatMap((x) => [[x, -13.6], [x, -4.4]]), H2 = 3.1;
    for (const [x, z] of poles) { cyl(G, 0.04, 0.05, H2, '#1e1f21', x, H2 / 2, z, { seg: 8 }); roof.colliders.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1 }); }
    const wire = [], bulbs = [];
    for (let i = 0; i + 2 < poles.length; i++) {
      const [ax, az] = poles[i], [bx, bz] = poles[i + (i % 2 ? 1 : 3)] || poles[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.5);
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const u = k / n, q = new THREE.Vector3(lerp(ax, bx, u), H2 - 0.1 - Math.sin(Math.PI * u) * 0.7, lerp(az, bz, u));
        if (prev) wire.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        if (k && k < n) bulbs.push(q);
        prev = q;
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    G.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1a1a1a' })));
    const bulbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 10, 6), glowMat(2.6, '#fff4dc'), bulbs.length);
    bulbs.forEach((q, i) => bulbIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(q.x, q.y - 0.06, q.z)));
    G.add(bulbIM);

    // The helipad, flush on the north side: painted pad, H, and green edge lights that come on at dusk.
    const hp = makeCanvas(1024, 1024), hc = hp.ctx, M = 512;
    hc.fillStyle = '#4a4d50'; hc.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 5000; i++) { hc.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '0,0,0'},${R() * 0.06})`; hc.fillRect(R() * 1024, R() * 1024, 2, 2); }
    hc.lineWidth = 26; hc.strokeStyle = '#f2f0ea'; hc.beginPath(); hc.arc(M, M, 470, 0, Math.PI * 2); hc.stroke();
    hc.lineWidth = 40; hc.strokeStyle = '#e8c33a'; hc.beginPath(); hc.arc(M, M, 330, 0, Math.PI * 2); hc.stroke();
    hc.fillStyle = '#f2f0ea'; hc.fillRect(M - 150, M - 200, 70, 400); hc.fillRect(M + 80, M - 200, 70, 400); hc.fillRect(M - 80, M - 35, 160, 70);
    hc.font = `600 52px ${FONT}`; hc.textAlign = 'center'; hc.fillText('6.0', M, M + 280); hp.tex.needsUpdate = true;
    const padM = new THREE.MeshStandardMaterial({ map: hp.tex, roughness: 0.85 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(HELI.r, HELI.r, 0.04, 72), [mat('#3a3c3e'), padM, padM]);
    pad.rotation.y = Math.PI / 2; pad.position.set(HELI.x, 0.02, HELI.z); pad.receiveShadow = true; G.add(pad);
    const greenM = new THREE.MeshStandardMaterial({ color: '#cfe8cf', emissive: '#3dff6a', emissiveIntensity: 0, roughness: 0.3 });
    lamps.push({ mat: greenM, eBase: 3 });
    const edge = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), greenM, 16);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; edge.setMatrixAt(i, new THREE.Matrix4().makeTranslation(HELI.x + Math.cos(a) * (HELI.r + 0.2), 0.05, HELI.z + Math.sin(a) * (HELI.r + 0.2))); }
    G.add(edge);
    // Windsock by the pad.
    cyl(G, 0.035, 0.045, 3.2, '#d9d6cf', -16.6, 1.6, 13.8, { seg: 8 }); roof.colliders.push({ minX: -16.7, maxX: -16.5, minZ: 13.7, maxZ: 13.9 });
    const sockT = makeCanvas(256, 64); for (let i = 0; i < 5; i++) { sockT.ctx.fillStyle = i % 2 ? '#f2f0ea' : '#ff6a1a'; sockT.ctx.fillRect(i * 52, 0, 52, 64); } sockT.tex.needsUpdate = true;
    const sockG = new THREE.CylinderGeometry(0.1, 0.24, 1.4, 14, 1, true); sockG.rotateZ(Math.PI / 2); sockG.translate(0.7, 0, 0);
    roof.sock = new THREE.Mesh(sockG, new THREE.MeshStandardMaterial({ map: sockT.tex, roughness: 0.9, side: THREE.DoubleSide }));
    roof.sock.position.set(-16.6, 3.05, 13.8); roof.sock.castShadow = true; G.add(roof.sock);

    // The plant: two condensers with spinning fans, an air handler with its ducts, a water tank on legs, mushroom vents,
    // all behind a louvred screen open to the north.
    const plantM = mat('#c3c6c8', { metalness: 0.4, roughness: 0.5 }), darkM = mat('#2b2d30', { roughness: 0.6 });
    for (const x of [9.6, 12.6]) {
      const body = [[2.4, 1.3, 1.2, x, 0.65, 12.6]];
      for (let y = 0.2; y < 1.2; y += 0.08) body.push([2.42, 0.02, 1.22, x, y, 12.6]);
      G.add(mergedBoxes(body, plantM));
      for (const dx of [-0.6, 0.6]) {
        cyl(G, 0.5, 0.5, 0.06, '', x + dx, 1.32, 12.6, { material: darkM, seg: 24 });
        const fan = new THREE.Group(); fan.position.set(x + dx, 1.36, 12.6); G.add(fan); roof.fans.push(fan);
        for (let b = 0; b < 4; b++) { const bl = box(fan, 0.42, 0.01, 0.12, '#55595e', 0.21, 0, 0, { shadow: false }); bl.position.set(Math.cos(b * Math.PI / 2) * 0.21, 0, Math.sin(b * Math.PI / 2) * 0.21); bl.rotation.y = -b * Math.PI / 2; bl.rotation.x = 0.3; }
      }
      roof.colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: 12, maxZ: 13.2 });
    }
    G.add(mergedBoxes([[4.2, 1.7, 1.8, 13.2, 0.85, 7.4], [0.8, 0.8, 1.9, 10.7, 0.5, 7.4], [0.9, 0.9, 3.4, 15.8, 0.45, 10], [4.4, 0.1, 2, 13.2, 1.75, 7.4]], plantM));
    roof.colliders.push({ minX: 10.3, maxX: 15.3, minZ: 6.5, maxZ: 8.3 }, { minX: 15.35, maxX: 16.25, minZ: 8.3, maxZ: 11.7 });
    cyl(G, 1.2, 1.2, 2.4, '#9aa3a8', 17.9, 1.8, 12.4, { mat: { metalness: 0.4, roughness: 0.45 }, seg: 28 });
    G.add(mergedBoxes([[0.1, 0.6, 0.1, 17.1, 0.3, 11.6], [0.1, 0.6, 0.1, 18.7, 0.3, 11.6], [0.1, 0.6, 0.1, 17.1, 0.3, 13.2], [0.1, 0.6, 0.1, 18.7, 0.3, 13.2], [2.6, 0.08, 2.6, 17.9, 0.6, 12.4]], darkM));
    for (const y of [1.2, 2.4]) cyl(G, 1.215, 1.215, 0.04, '#7d868b', 17.9, y, 12.4, { seg: 28, shadow: false });
    roof.colliders.push({ minX: 16.6, maxX: 19.2, minZ: 11.1, maxZ: 13.7 });
    for (const [x, z] of [[2.2, 7.2], [3.6, 9.4], [2.4, 11.8], [0.2, 8.8]]) {
      cyl(G, 0.11, 0.11, 0.6, '#b8bcc0', x, 0.3, z, { seg: 12 }); cyl(G, 0.26, 0.26, 0.1, '#b8bcc0', x, 0.68, z, { seg: 16 });
      roof.colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
    }
    const lou = [];
    for (let y = 0.15; y < 1.9; y += 0.14) lou.push([11, 0.1, 0.03, 13.3, y, 5.6], [0.03, 0.1, 5, 7.8, y, 8.1]);
    for (let x = 7.8; x <= 18.8; x += 1.83) lou.push([0.06, 1.95, 0.06, x, 0.975, 5.6]);
    for (let z = 5.6; z <= 10.6; z += 1.66) lou.push([0.06, 1.95, 0.06, 7.8, 0.975, z]);
    G.add(mergedBoxes(lou, mat('#6f7479', { metalness: 0.4, roughness: 0.5 })));
    roof.colliders.push({ minX: 7.8, maxX: 18.8, minZ: 5.5, maxZ: 5.7 }, { minX: 7.7, maxX: 7.9, minZ: 5.6, maxZ: 10.6 });

    roof.colliders.push(...colliders.splice(c0));   // the sofas' and planters' own
    for (const st of seats.slice(s0)) st.floor = ROOF;
    roof.hits = [roof.callHit, roof.panel.mesh];
    roof.map = drawRoofMap;
    roof.enter = (z) => {
      const c = roof.cars.find((k) => k.z === z) || roof.cars[0];
      Object.assign(roof, { leaves: c.leaves, ind: c.ind });
      roof.panel.mesh.position.z = z + 0.68;
      G.visible = true;
    };
    roof.leave = () => { G.visible = false; };
    roof.bound = (p) => { p.x = clamp(p.x, -EDGE.x + 0.5, EDGE.x - 0.5); p.z = clamp(p.z, -EDGE.z + 0.5, EDGE.z - 0.5); };
    roof.fx = (dt, t) => {
      for (const [i, f] of roof.fans.entries()) f.rotation.y += dt * (7 + i);
      roof.sock.rotation.set(Math.sin(t * 1.3) * 0.05, 2.4 + Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.83) * 0.1, -0.25 + Math.sin(t * 0.5) * 0.12);
      roof.cars.forEach((c, i) => { Object.assign(c.ind, { floor: lifts[i].floor, dir: lifts[i].dir }); paintIndicator(c.ind); });   // the other car's lantern
    };
    addFloor(roof);
  }
  function drawRoofMap() {
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(181,138,95,.35)'; c.fillRect(sx(-19.6), sz(-14), sx(16.6) - sx(-19.6), sz(-4) - sz(-14));
    c.strokeStyle = 'rgba(232,195,58,.7)'; c.lineWidth = 3; c.beginPath(); c.arc(sx(HELI.x), sz(HELI.z), HELI.r * W / 40, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of roof.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Helipad', sx(HELI.x) - 36, sz(HELI.z) + 7); c.fillText('Terrace', sx(-4), sz(-8)); c.fillText('Plant', sx(11), sz(10));
    c.font = '600 15px system-ui'; c.fillText('Lift', sx(LIFT.x) - 36, sz(LIFT.z) + 5);
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }

  // ----- SERVER HALL (47) -----
  // This machine as a data-centre hall: a vestibule off the lift with an access-controlled door, then a 40 x 38 m raised-floor
  // hall, 5 m high: seven contained cold-aisle pods (14 rows, A-N) of 42U racks in two blocks either side of a cross aisle,
  // ladder racks and cable trays overhead, CRACs along both long walls, a staging/build area, and a glass-walled NOC office
  // at the far end where John, the sysadmin, sits (click him to talk; /api/john).
  // In the first cold aisle, straight in from the door, row A's first three racks hold a 2U unit per live Claude session
  // (`srv.slots`, colour-coded like the people, LEDs blinking with what it's doing, click for its details) and row B's first
  // three are the machine itself: CPU per core, memory, load, top processes, a disk array per volume, switches and the UPS
  // (polled from /api/machine every 3 s while you're here). The NOC wall and its repeater over the cross aisle graph it all.
  // Built about the car at z = 0 in `srv.root`, moved onto your car's z when you arrive. Generic racks are instanced from a
  // few templates; all LEDs are one InstancedMesh, and only the racks within 15 m of you get theirs updated.
  const SV = { x0: -26, x1: 14.5, z0: -19, z1: 19, vz: 2.2, h: 5, dw: 0.6, dh: 2.2 }, RK = { w: 0.6, d: 1.07, h: 2.0, U: 0.04445, base: 0.08, fw: 0.45 };
  const POD = 4.54, PODS = [0, -1, 1, -2, 2, -3, 3], LETTERS = 'ABCDEFGHIJKLMN';
  // Rows by pod: the low row faces +z into the pod's cold aisle, the high row -z. Pod 0's are A and B, in line with the door.
  const ROWS = PODS.flatMap((k, i) => [{ id: LETTERS[i * 2], z: k * POD - 1.135, f: 1, pod: k }, { id: LETTERS[i * 2 + 1], z: k * POD + 1.135, f: -1, pod: k }]);
  const BLOCKS = [{ x: (i) => 12.1 - i * RK.w, n: 10, first: 1 }, { x: (i) => 2.7 - i * RK.w, n: 24, first: 11 }];
  for (const B of BLOCKS) { B.x0 = B.x(B.n - 1) - RK.w / 2; B.x1 = B.x(0) + RK.w / 2; }
  const RACKX = BLOCKS[0].x, AISLES = PODS.map((k) => k * POD), SLOTS = 54;
  const NOC = { x0: SV.x0, x1: -17, z0: 4, z1: SV.z1, h: 3 }, STAGE = { x0: SV.x0, x1: -14, z0: -17.5, z1: -2 };
  const srv = { n: 47, label: 'SERVERS', title: 'Server Hall', on: false, composer: null, colliders: [], fixed: [], hits: [], slots: [], m: null,
    hist: { cpu: [], mem: [], load: [], sess: [], net: [] }, polledAt: 0, tick: 0, paintAt: 0, nocAt: 0, doors: [], aisleDoors: [], john: null };
  // John: a Person with grey hair in a ponytail, glasses, a grey beard, a flannel shirt and a bit of a belly, at his desk
  // (J: the desk's x, z). His `mood` (type, sip, lean, read) is set in srv.fx; he turns his head to you while you talk.
  function makeJohn(parent, J) {
    const p = new Person('john-sysadmin', '#7a2e2a'), grey = mat('#c8c5bf', { roughness: 0.95 }), shirt = mat('#7a2e2a', { roughness: 0.9 });
    const pl = makeCanvas(128, 128), c = pl.ctx;   // red and black flannel
    c.fillStyle = '#7a2420'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(20,16,16,.55)'; c.fillRect(0, 40, 128, 36); c.fillRect(40, 0, 36, 128);
    c.fillStyle = 'rgba(20,16,16,.35)'; c.fillRect(0, 100, 128, 8); c.fillRect(100, 0, 8, 128);
    c.fillStyle = 'rgba(230,200,150,.25)'; c.fillRect(0, 86, 128, 3); c.fillRect(86, 0, 3, 128);
    pl.tex.wrapS = pl.tex.wrapT = THREE.RepeatWrapping; pl.tex.repeat.set(2, 2); pl.tex.needsUpdate = true;
    const flannel = new THREE.MeshStandardMaterial({ map: pl.tex, roughness: 0.95 });
    p.root.remove(p.label);
    p.root.traverse((o) => { if (o.material === shirt) o.material = flannel; if (o.geometry === G.torso) o.scale.set(1.2, 1, 0.86); });
    for (const o of [...p.head.children]) if ([G.hairCap, G.hairLong, G.bun].includes(o.geometry)) p.head.remove(o);
    const add = (geo, m, x, y, z, parent = p.head) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(G.hairCap, grey, 0, 0.004, -0.014).rotation.x = -0.42;   // receding a bit
    const tail = new THREE.Group(); tail.position.set(0, -0.01, -0.115); tail.rotation.x = 0.28; p.head.add(tail);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 10), mat('#2a2522'), 0, -0.01, 0, tail);
    add(new THREE.CapsuleGeometry(0.026, 0.2, 4, 8), grey, 0, -0.13, -0.006, tail).scale.set(1, 1, 0.8);
    add(new THREE.SphereGeometry(0.08, 14, 10), grey, 0, -0.07, 0.055).scale.set(1, 0.72, 0.75);   // beard
    const frameM = mat('#1c1c1c', { roughness: 0.4, metalness: 0.4 });
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(0.026, 0.004, 6, 18), frameM, s * 0.042, 0.016, 0.112);
      add(new THREE.BoxGeometry(0.004, 0.004, 0.11), frameM, s * 0.07, 0.02, 0.06);
    }
    add(new THREE.BoxGeometry(0.03, 0.004, 0.004), frameM, 0, 0.02, 0.114);
    p.mug.children[0].material = mat('#2c4a73');
    p.waitStyle = () => 'lean';
    const base = p.targets.bind(p);
    p.mood = 'type';
    p.targets = (t) => {
      p.spot = { pose: p.mood === 'lean' ? 'wait' : 'type', rotY: Math.PI / 2 };
      const j = base(t);
      if (p.mood === 'sip') { p.mug.visible = true; Object.assign(j, { sh0: -1.1, el0: -2.1, shy0: 0, shz0: 0.12, headX: -0.1 }); }
      if (p.mood === 'read') Object.assign(j, { el0: -0.67, el1: -0.67, headX: 0.05 });
      return j;
    };
    p.root.traverse((o) => { o.userData = { action: 'john', reach: 3.5 }; });
    p.root.position.set(J.x - 0.64, 0, J.z); p.rotY = Math.PI / 2; p.root.rotation.y = p.rotY;
    parent.add(p.root);
    return p;
  }
  const lbl = (c, text, x, y, font, color, align = 'left') => { c.font = font; c.fillStyle = color; c.textAlign = align; c.fillText(text, x, y); c.textAlign = 'left'; };
  {
    const SC = srv.scene = new THREE.Scene(), root = srv.root = new THREE.Group();
    SC.background = new THREE.Color('#0d1117');
    const H = SV.h;
    SC.environment = scene.environment; SC.environmentIntensity = 0.35;
    const key = new THREE.DirectionalLight('#e6efff', 0.8); key.position.set(-2, 14, 4); key.target.position.set(-6, 0, -1); root.add(key.target);
    SC.add(srv.hemi = new THREE.HemisphereLight('#dfe9ff', '#3a4250', 1.0), key, root);
    srv.look = { exposure: 1.0, hemi: 1.0, sky: new THREE.Color('#dfe9ff'), ground: new THREE.Color('#3a4250'), env: 0.35, bloom: 1.5, grade: 1, lights: [[key, 0.8]] };
    const R = rng(47);
    // A face of `w` x `h` at (x, y, z) facing rotY, textured from a canvas rect [px, py, pw, ph] of a W x H canvas.
    const quadGeo = (list, cw, ch) => {
      const pos = [], uv = [], idx = [];
      for (const [x, y, z, w, h, rotY, [px, py, pw, ph]] of list) {
        const rx = Math.cos(rotY) * w / 2, rz = -Math.sin(rotY) * w / 2, n = pos.length / 3;
        pos.push(x - rx, y - h / 2, z - rz, x + rx, y - h / 2, z + rz, x + rx, y + h / 2, z + rz, x - rx, y + h / 2, z - rz);
        const u0 = px / cw, u1 = (px + pw) / cw, v0 = 1 - (py + ph) / ch, v1 = 1 - py / ch;
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const quads = (list, material, cw, ch) => { const m = new THREE.Mesh(quadGeo(list, cw, ch), material); root.add(m); return m; };
    // Flat on the floor (or a ceiling, facing down), textures repeating every `tile` metres: one mesh for many rects.
    const flats = (list, material, tile, y = 0, down = false) => {
      const m = new THREE.Mesh(mergeGeometries(list.map(([x0, x1, z0, z1]) => {
        const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
        return g.rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      })), material);
      root.add(m); return m;
    };
    const sign = (w, h, x, y, z, rotY, ppm, draw, o = {}) => {
      const c = makeCanvas(Math.round(w * ppm), Math.round(h * ppm)); draw(c.ctx, c.W, c.H); c.tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), o.basic ? new THREE.MeshBasicMaterial({ map: c.tex }) : new THREE.MeshStandardMaterial({ map: c.tex, roughness: 0.6, ...o.mat }));
      m.position.set(x, y, z); m.rotation.y = rotY; root.add(m); return Object.assign(m, { c });
    };

    // Floors: raised-floor tiles (perforated in the cold aisles), anti-static vinyl in the vestibule; a dark open soffit.
    const tile = (perf) => {
      const t = makeCanvas(256, 256), c = t.ctx;
      c.fillStyle = '#b4b9c0'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '50,55,60'},${R() * 0.06})`; c.fillRect(R() * 256, R() * 256, 2, 2); }
      if (perf) { c.fillStyle = '#23272c'; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { c.beginPath(); c.arc(20 + i * 14.4, 20 + j * 14.4, 4.2, 0, Math.PI * 2); c.fill(); } }
      c.strokeStyle = '#5e646c'; c.lineWidth = 6; c.strokeRect(0, 0, 256, 256);
      t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true; return t.tex;
    };
    flats([[SV.x0, SV.x1, SV.z0, SV.z1]], new THREE.MeshStandardMaterial({ map: tile(false), roughness: 0.55, metalness: 0.1 }), 0.6);
    flats(AISLES.flatMap((z) => BLOCKS.map((B) => [B.x0, B.x1, z - 0.6, z + 0.6])), new THREE.MeshStandardMaterial({ map: tile(true), roughness: 0.5, metalness: 0.15 }), 0.6, 0.003);
    flats([[SV.x1, LIFT.x, -SV.vz, SV.vz]], mat('#3b3f45', { roughness: 0.7 }), 1, 0.001);
    flats([[SV.x0, SV.x1, SV.z0, SV.z1]], mat('#1b1f25', { roughness: 0.9 }), 1, H, true);
    flats([[SV.x1, LIFT.x, -SV.vz, SV.vz]], mat('#20242a', { roughness: 0.9 }), 1, ROOM.h, true);

    // Walls: the hall's four, the vestibule's two, and the partition between them with the access door's opening at z = 0.
    const wallC = '#c4c8ce', sk = '#2b2f35', t = 0.12, walls = [], DW = SV.dw, DH = SV.dh;   // DW: half the door opening
    const wall = (x0, x1, z0, z1, h = H) => walls.push([x1 - x0 || t, h, z1 - z0 || t, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, wallC]);
    wall(SV.x0 - t, SV.x0 - t, SV.z0, SV.z1); wall(SV.x0, SV.x1, SV.z0 - t / 2, SV.z0 - t / 2); wall(SV.x0, SV.x1, SV.z1 + t / 2, SV.z1 + t / 2);
    wall(SV.x1, SV.x1, SV.z0, -DW); wall(SV.x1, SV.x1, DW, SV.z1);
    walls.push([t, H - DH, DW * 2, SV.x1, (H + DH) / 2, 0, wallC]);
    wall(SV.x1, LIFT.x, -SV.vz - t / 2, -SV.vz - t / 2, ROOM.h); wall(SV.x1, LIFT.x, SV.vz + t / 2, SV.vz + t / 2, ROOM.h);
    for (const s of [-1, 1]) walls.push([0.1, ROOM.h, SV.vz - CAR.w / 2 - 0.3, LIFT.x + 0.05, ROOM.h / 2, s * (SV.vz + CAR.w / 2 + 0.3) / 2, '#77716a']);
    for (const [x0, x1, z] of [[SV.x0, SV.x1, SV.z0 + 0.01], [SV.x0, SV.x1, SV.z1 - 0.01], [SV.x1 + 0.07, LIFT.x, -SV.vz + 0.01], [SV.x1 + 0.07, LIFT.x, SV.vz - 0.01]]) walls.push([x1 - x0, 0.1, 0.02, (x0 + x1) / 2, 0.05, z, sk]);
    for (const [z0, z1] of [[SV.z0, -DW], [DW, SV.z1]]) walls.push([0.02, 0.1, z1 - z0, SV.x1 - 0.07, 0.05, (z0 + z1) / 2, sk]);
    walls.push([0.02, 0.1, SV.z1 - SV.z0, SV.x0 + 0.01, 0.05, 0, sk]);
    root.add(mergedBoxes(walls, mat('#ffffff', { vertexColors: true, roughness: 0.85 })));
    srv.fixed.push({ minX: SV.x1 - 0.08, maxX: SV.x1 + 0.08, minZ: SV.z0, maxZ: -DW + 0.08 }, { minX: SV.x1 - 0.08, maxX: SV.x1 + 0.08, minZ: DW - 0.08, maxZ: SV.z1 });

    // Light: long cold-white LED battens over every aisle, and round the walls (emissive only; the bloom does the rest).
    const battens = [];
    for (const k of PODS) for (const B of BLOCKS) for (const dz of [0, POD / 2]) battens.push([B.x1 - B.x0, 0.05, 0.14, (B.x0 + B.x1) / 2, H - 0.04, k * POD + dz]);
    for (const B of BLOCKS) battens.push([B.x1 - B.x0, 0.05, 0.14, (B.x0 + B.x1) / 2, H - 0.04, -3 * POD - POD / 2]);
    for (let z = -16; z <= 16; z += 4) battens.push([0.14, 0.05, 2.4, 4.7, H - 0.04, z], [0.14, 0.05, 2.4, -18.5, H - 0.04, z]);
    battens.push([2.4, 0.05, 0.14, (SV.x1 + LIFT.x) / 2, ROOM.h - 0.03, 0]);
    root.add(mergedBoxes(battens, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e4efff', emissiveIntensity: 2.2 })));

    // The rack face atlas: generic servers (1U, 2U with 12 or 24 bays, 4U, a switch, a patch panel, blanking) and rears.
    const FA = makeCanvas(512, 768), fc = FA.ctx;
    const DES = { '1U': [0, 52], blank: [52, 52], sw: [104, 52], patch: [156, 52], '2U12': [208, 104], '2U24': [312, 104], '4U': [416, 208], rear: [624, 104] };
    const bez = (y, h, col) => { fc.fillStyle = col; fc.fillRect(0, y, 512, h); fc.fillStyle = 'rgba(255,255,255,.08)'; fc.fillRect(0, y, 512, 2); fc.fillStyle = 'rgba(0,0,0,.5)'; fc.fillRect(0, y + h - 2, 512, 2); };
    const vents = (x0, y0, w, h, step = 6) => { fc.fillStyle = '#0b0c0e'; for (let x = x0; x < x0 + w; x += step) for (let y = y0; y < y0 + h; y += step) fc.fillRect(x, y, step - 2, step - 2); };
    bez(0, 52, '#2a2d32'); vents(20, 10, 300, 32); fc.fillStyle = '#c8ccd2'; fc.fillRect(340, 18, 60, 14); lbl(fc, 'R640', 344, 30, `600 11px ${FONT}`, '#2a2d32');
    bez(52, 52, '#1b1d20'); for (let x = 24; x < 490; x += 18) { fc.fillStyle = '#111214'; fc.fillRect(x, 66, 10, 24); }
    bez(104, 52, '#24272b'); for (let i = 0; i < 24; i++) for (let j = 0; j < 2; j++) { fc.fillStyle = '#0a0b0c'; fc.fillRect(40 + i * 17, 110 + j * 21, 13, 14); }
    bez(156, 52, '#1d1f22'); for (let i = 0; i < 24; i++) { fc.fillStyle = '#e8e8e8'; fc.fillRect(40 + i * 17, 168, 13, 11); fc.fillStyle = ['#2a6fd6', '#e3c23a', '#d9534f', '#3a3d42'][i % 7 % 4]; fc.fillRect(42 + i * 17, 182, 9, 10); }
    bez(208, 104, '#2b2e33'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { fc.fillStyle = '#16181b'; fc.fillRect(30 + i * 100, 216 + j * 30, 92, 26); fc.fillStyle = '#3a3e44'; fc.fillRect(34 + i * 100, 220 + j * 30, 60, 18); }
    bez(312, 104, '#2b2e33'); for (let i = 0; i < 24; i++) { fc.fillStyle = '#16181b'; fc.fillRect(24 + i * 18, 320, 15, 88); fc.fillStyle = '#4a4e55'; fc.fillRect(26 + i * 18, 324, 11, 6); }
    bez(416, 208, '#2a2c30'); vents(24, 432, 380, 120, 8); fc.fillStyle = '#d97757'; fc.fillRect(24, 570, 70, 22); lbl(fc, 'STORAGE', 100, 587, `600 15px ${FONT}`, '#9aa0a8');
    bez(624, 104, '#18191c'); for (let i = 0; i < 2; i++) { fc.fillStyle = '#2c2f34'; fc.fillRect(20 + i * 90, 634, 80, 84); vents(28 + i * 90, 642, 64, 50, 6); }
    for (let i = 0; i < 9; i++) { fc.strokeStyle = ['#2a6fd6', '#e3c23a', '#2a6fd6', '#7a7f87', '#d9534f'][i % 5]; fc.lineWidth = 5; fc.beginPath(); fc.moveTo(220 + i * 30, 640); fc.bezierCurveTo(230 + i * 30, 700, 300 + i * 18, 690, 330 + i * 18, 728); fc.stroke(); }
    FA.tex.needsUpdate = true;
    const faceM = new THREE.MeshStandardMaterial({ map: FA.tex, roughness: 0.55, metalness: 0.35 });

    // LEDs: one InstancedMesh; `leds` holds every one's position and how to colour it (`dyn`: those that change).
    const leds = [], dyn = [], C = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);
    const LED = { g: C(0.15, 1, 0.3, 3), b: C(0.2, 0.5, 1, 3.2), a: C(1, 0.55, 0.05, 3), r: C(1, 0.08, 0.05, 3), w: C(0.9, 0.95, 1, 2.6), off: C(0.03, 0.035, 0.04) };
    // `ry`: which way it faces (0: +z). `sink`: a rack template's own list (see the racks below) instead of the room's.
    const led = (x, y, z, col, fn, ry = 0, sink) => { const o = { x, y, z, col, fn, ry }; if (sink) sink.push(o); else { leds.push(o); if (fn) dyn.push(o); } return o; };
    // Where a pixel of a face lands: face centre (x, y, z), facing f (+1: +z), w x h metres for a pw x ph pixel rect.
    const at = (x, y, z, f, w, h, pw, ph, sink) => (px, py, cb) => led(x + f * (px / pw - 0.5) * w, y + (0.5 - py / ph) * h, z + f * 0.004, cb[0], cb[1], f > 0 ? 0 : Math.PI, sink);
    const blinky = (duty, col) => [LED.off, (o) => (Math.random() < duty ? col : LED.off)];
    const faces = [], rears = [], bodies = [], doors = [], tags = [];
    const unitY = (u, n) => RK.base + (u - 1 + n / 2) * RK.U;
    const face = (rx, row, u, d, T) => {   // T: a rack template ({ faces, leds }), built about x = z = 0 facing +z
      const [py, ph] = DES[d], n = Math.round(ph / 52), y = unitY(u, n), z = row.z + row.f * (RK.d / 2 - 0.03), h = n * RK.U - 0.002;
      (T?.faces || faces).push([rx, y, z, RK.fw, h, row.f > 0 ? 0 : Math.PI, [0, py, 512, ph]]);
      const p = at(rx, y, z, row.f, RK.fw, h, 512, ph, T?.leds), act = 0.04 + R() * 0.5, col = R() < 0.8 ? LED.g : LED.b;
      if (d === '1U') { p(470, 26, [LED.g]); p(486, 26, blinky(act, col)); }
      if (d === '2U12') { for (let i = 0; i < 4; i++) p(104 + i * 100, 230 - py, R() < 0.85 ? blinky(act * 0.6, LED.g) : [LED.off]); p(486, 20, [LED.b]); }
      if (d === '2U24') { for (let i = 0; i < 24; i += 4) p(31 + i * 18, 404 - py, blinky(act * 0.5, LED.g)); p(486, 20, [LED.g]); }
      if (d === '4U') { p(470, 60, [LED.g]); p(486, 60, blinky(act, LED.a)); }
      if (d === 'sw') for (let i = 0; i < 24; i += T ? 2 : 1) p(46 + i * 17, 26, R() < 0.75 ? blinky(0.15 + R() * 0.5, LED.g) : [LED.off]);
      return n;
    };
    // The racks: steel frames, the faces (generic servers, except the live racks filled in below), rears, mesh doors, tags.
    const meshTex = (() => {
      const t = makeCanvas(64, 64), c = t.ctx;
      c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#000';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(8 + i * 16 + (j % 2) * 8, 8 + j * 16, 6, 0, Math.PI * 2); c.fill(); }
      t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(14, 46); t.tex.colorSpace = THREE.NoColorSpace; t.tex.needsUpdate = true; return t.tex;
    })();
    // Every rack's frame and rear is one InstancedMesh each; a generic rack's front (servers, mesh door) is one of a few
    // templates, each its own InstancedMesh, and its LEDs are copied into the room's at its place. The live racks
    // (A01-A03, B01-B03) have no door and get their own faces below.
    const live = new Set(['A0', 'A1', 'A2', 'B0', 'B1', 'B2']), O = { z: 0, f: 1 }, fz0 = RK.d / 2;
    bodies.push([0.02, RK.h, RK.d, -RK.w / 2 + 0.01, RK.h / 2, 0, '#15171a'], [0.02, RK.h, RK.d, RK.w / 2 - 0.01, RK.h / 2, 0, '#15171a'],
      [RK.w, 0.04, RK.d, 0, RK.h - 0.02, 0, '#15171a'], [RK.w, RK.base, RK.d, 0, RK.base / 2, 0, '#0c0d0f'], [RK.w - 0.04, RK.h - 0.12, 0.01, 0, RK.h / 2, 0, '#0f1012']);
    for (const s of [-1, 1]) bodies.push([0.016, RK.h - 0.12, 0.012, s * 0.232, RK.h / 2, fz0 - 0.035, '#9ca2aa']);   // front rails
    for (let u = 1; u <= 42; u += 2) rears.push([0, unitY(u, 2), -(RK.d / 2 - 0.03), RK.fw, 2 * RK.U - 0.002, Math.PI, [0, 624, 512, 104]]);
    doors.push([0, RK.h / 2 + 0.03, fz0 + 0.01, RK.w - 0.03, RK.h - 0.1, 0, [0, 0, 64, 64]]);
    const TPL = [...Array(8)].map((_, k) => {
      const T = { faces: [], leds: [], at: [] }, empty = k >= 6 ? 14 + k * 3 : 43;   // two half-empty ones
      face(0, O, 42, R() < 0.7 ? 'sw' : 'patch', T);
      for (let u = 1; u < 42;) {
        if (u >= empty) { face(0, O, u, 'blank', T); u++; continue; }
        const r = R(), d = u <= 38 && r < 0.08 ? '4U' : u <= 40 && r < 0.34 ? '2U12' : u <= 40 && r < 0.48 ? '2U24' : r < 0.86 ? '1U' : 'blank';
        u += face(0, O, u, d, T);
      }
      return T;
    });
    srv.racks = []; srv.ledGroups = [];
    const rackM = new THREE.Matrix4(), place = [];
    for (const row of ROWS) for (const B of BLOCKS) for (let i = 0; i < B.n; i++) {
      const x = B.x(i), z = row.z, f = row.f, name = `${row.id}${String(B.first + i).padStart(2, '0')}`, ry = f > 0 ? 0 : Math.PI;
      const r = { name, x, z, f, ry, live: B.n === 10 && live.has(row.id + i) };
      if (!r.live) r.tpl = Math.floor(R() * TPL.length), TPL[r.tpl].at.push(r);
      tags.push({ name, x, z: z + f * fz0, f });
      srv.racks.push(r); place.push(r);
    }
    const inst = (geo, material, list) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((r, i) => m.setMatrixAt(i, rackM.makeRotationY(r.ry).setPosition(r.x, 0, r.z)));
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); root.add(m); return m;
    };
    srv.body = inst(mergedBoxes(bodies, null).geometry, mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.5 }), place);
    srv.rear = inst(quadGeo(rears, 512, 768), faceM, place);
    const doorM = new THREE.MeshStandardMaterial({ color: '#1a1c20', metalness: 0.6, roughness: 0.45, alphaMap: meshTex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    inst(quadGeo(doors, 64, 64), doorM, place.filter((r) => !r.live));
    for (const T of TPL) if (T.at.length) inst(quadGeo(T.faces, 512, 768), faceM, T.at);
    for (const B of BLOCKS) for (const row of ROWS) srv.fixed.push({ minX: B.x0, maxX: B.x1, minZ: row.z - RK.d / 2, maxZ: row.z + RK.d / 2 });
    {   // rack tags over each front, from one canvas
      const T = makeCanvas(512, 2048), c = T.ctx;
      tags.forEach((g, i) => { const px = (i % 8) * 64, py = Math.floor(i / 8) * 32; c.fillStyle = '#e9ecef'; c.fillRect(px + 2, py + 2, 60, 28); lbl(c, g.name, px + 32, py + 23, `700 19px ${MONO}`, '#14161a', 'center'); });
      T.tex.needsUpdate = true;
      quads(tags.map((g, i) => [g.x, RK.h - 0.06, g.z + g.f * 0.012, 0.12, 0.06, g.f > 0 ? 0 : Math.PI, [(i % 8) * 64, Math.floor(i / 8) * 32, 64, 32]]), new THREE.MeshStandardMaterial({ map: T.tex, roughness: 0.6 }), 512, 2048);
    }

    // The live racks' faces: an atlas per kind, self-lit a little (LCDs, backlit plates), repainted a couple of times a second.
    const atlas = (w, h) => { const a = makeCanvas(w, h); return { a, m: new THREE.MeshStandardMaterial({ map: a.tex, emissiveMap: a.tex, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 }) }; };
    // Sessions: 18 x 2U per rack in A01-A03, top down; a cell of 340 x 70 px each.
    const SA = srv.sa = atlas(1020, 1260), slotFaces = [];
    for (let k = 0; k < SLOTS; k++) {
      const r = Math.floor(k / 18), j = k % 18, row = ROWS[0], x = RACKX(r), u = 37 - j * 2, y = unitY(u, 2), z = row.z + RK.d / 2 - 0.03, h = 2 * RK.U - 0.002;
      const cell = [(k % 3) * 340, Math.floor(k / 3) * 70, 340, 70];
      slotFaces.push([x, y, z, RK.fw, h, 0, cell]);
      const p = at(x, y, z, 1, RK.fw, h, 340, 70), s = { k, cell, sid: null, state: 'empty', since: 0, dirty: true };
      s.hit = hitBox(root, RK.fw, h, 0.03, x, y, z + 0.01, { screen: true, reach: 4 });
      const on = () => s.state === 'live' || s.state === 'boot';
      p(326, 16, [LED.off, () => (on() ? LED.b : LED.off)]);
      p(326, 35, [LED.off, (o, t) => {   // activity: busy with work, a slow blink idle, off when down
        if (!on()) return LED.off;
        const ss = s.sess;
        if (s.state === 'boot') return (t * 8 + k) % 2 < 1 ? LED.a : LED.off;
        if (ss?.status === 'working') return Math.random() < 0.35 + 0.6 * Math.min(1, (ss.proc?.cpu || 0) / 80) ? LED.g : LED.off;
        return (t + k * 0.37) % 2.5 < 0.12 ? LED.g : LED.off;
      }]);
      p(326, 54, [LED.off, (o, t) => !on() ? LED.off : s.sess?.status === 'working' || s.state === 'boot' ? LED.g : s.sess?.status === 'idle' ? C(0.15, 1, 0.3, 1.2) : (t % 1 < 0.5 ? LED.a : LED.off)]);
      for (let b = 0; b < 4; b++) p(272 + b * 13, 62, [LED.off, () => (on() && s.sess?.status === 'working' && Math.random() < 0.25 + 0.5 * Math.min(1, (s.sess?.proc?.cpu || 0) / 100) ? LED.g : LED.off)]);
      srv.slots.push(s);
    }
    quads(slotFaces, SA.m, 1020, 1260);
    for (let r = 0; r < 3; r++) for (const [u, d] of [[42, 'sw'], [41, 'patch'], [40, 'blank'], [39, 'blank'], [2, 'blank'], [1, 'blank']]) face(RACKX(r), ROWS[0], u, d);

    // The machine: CPU, memory, load and the top processes in B01; a disk array per volume and the UPS in B02; switches in B03.
    const IA = srv.ia = atlas(1024, 1024), infraFaces = [], cols = [0, 0];
    const lit = (k, n) => (k / n < 0.6 ? LED.g : k / n < 0.85 ? LED.a : LED.r);
    srv.units = [];
    const unit = (r, u, n, title, paint, ledsFn, info) => {
      const row = ROWS[1], x = RACKX(r), y = unitY(u, n), z = row.z - RK.d / 2 + 0.03, h = n * RK.U - 0.002, ph = n * 44, col = cols[0] <= cols[1] ? 0 : 1;
      const cell = [col * 512, cols[col], 512, ph]; cols[col] += ph;
      infraFaces.push([x, y, z, RK.fw, h, Math.PI, cell]);
      const p = at(x, y, z, -1, RK.fw, h, 512, ph), U = { title, cell, paint, info };
      ledsFn?.((px, py, fn) => p(px, py, [LED.off, fn]));
      U.hit = hitBox(root, RK.fw, h, 0.03, x, y, z - 0.01, { action: 'info', reach: 4, info: () => `<b>${title}</b><div class="m">${info?.() || ''}</div>` });
      srv.units.push(U);
    };
    const m = () => srv.m, cores = () => m()?.cores || [];
    const NC = Math.max(1, navigator.hardwareConcurrency || 8);
    unit(0, 36, 6, 'Compute', (c, W, H) => {
      const cs = cores();
      lbl(c, (m()?.hostname || 'this machine').toUpperCase(), 14, 30, `700 20px ${MONO}`, '#e8eef6');
      lbl(c, fit(c, m()?.cpuModel || '', 200), 14, 52, `400 13px ${FONT}`, '#8a93a0');
      lbl(c, `CPU ${Math.round(cs.reduce((a, b) => a + b, 0) / (cs.length || 1))}%`, 14, 92, `700 26px ${MONO}`, '#5dff9b');
      lbl(c, `${cs.length || NC} cores`, 14, 116, `400 13px ${FONT}`, '#8a93a0');
    }, (p) => { for (let i = 0; i < Math.min(16, NC); i++) for (let j = 0; j < 12; j++) p(240 + i * 16, 250 - j * 19, () => ((cores()[i] || 0) > (j + 0.5) * 100 / 12 ? lit(j, 12) : LED.off)); },
    () => `${cores().length} cores · ${cores().map((v) => v + '%').join(' ')}`);
    const mem = () => (m()?.mem ? m().mem.used / m().mem.total : 0), GB = (b) => (b / 2 ** 30).toFixed(1);
    unit(0, 32, 3, 'Memory', (c) => {
      lbl(c, 'MEMORY', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      if (m()?.mem) lbl(c, `${GB(m().mem.used)} / ${GB(m().mem.total)} GB · ${Math.round(mem() * 100)}%`, 14, 58, `600 15px ${MONO}`, '#5dff9b');
      for (let i = 0; i < 16; i++) { c.fillStyle = '#16191d'; c.fillRect(240 + i * 16, 10, 12, 100); c.fillStyle = '#2d6b3c'; c.fillRect(242 + i * 16, 14, 8, 86); }
    }, (p) => { for (let i = 0; i < 30; i++) p(14 + i * 7.6, 112, () => (mem() > (i + 0.5) / 30 ? lit(i, 30) : LED.off)); }, () => m()?.mem ? `${GB(m().mem.used)} of ${GB(m().mem.total)} GB in use` : '');
    unit(0, 28, 3, 'Load', (c) => {
      lbl(c, 'LOAD', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      (m()?.load || []).forEach((v, i) => lbl(c, `${['1m', '5m', '15m'][i]} ${v.toFixed(2)}`, 14 + i * 150, 60, `600 15px ${MONO}`, '#5dff9b'));
    }, (p) => { for (let r = 0; r < 3; r++) for (let i = 0; i < 40; i++) p(14 + i * 12, 80 + r * 14, () => ((m()?.load?.[r] || 0) / NC > (i + 0.5) / 40 * 1.5 ? lit(i, 40) : LED.off)); },
    () => `load ${(m()?.load || []).map((v) => v.toFixed(2)).join(' · ')} on ${NC} cores`);
    unit(0, 14, 12, 'Top processes', (c, W, H) => {
      c.fillStyle = '#04100a'; c.fillRect(12, 12, W - 24, H - 24);
      lbl(c, 'PID     CPU%    RSS   COMMAND', 24, 42, `600 17px ${MONO}`, '#3fbf74');
      (m()?.top || []).slice(0, 8).forEach((q, i) => lbl(c, `${String(q.pid).padEnd(7)} ${q.cpu.toFixed(1).padStart(5)} ${String(q.rssMB).padStart(5)}M  ${q.name}`.slice(0, 44), 24, 80 + i * 52, `500 17px ${MONO}`, q.cpu > 50 ? '#ffb347' : '#5dff9b'));
    }, null, () => (m()?.top || []).slice(0, 5).map((q) => `${escapeHtml(q.name)} ${q.cpu.toFixed(0)}%`).join(' · '));
    const disk = (v) => m()?.disks?.[v];
    for (let v = 0; v < 6; v++) unit(1, 37 - v * 3, 2, `Disk array ${v + 1}`, (c) => {
      const d = disk(v);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#16181b'; c.fillRect(200 + i * 50, 8 + j * 38, 46, 34); c.fillStyle = d ? '#3a3e44' : '#22252a'; c.fillRect(204 + i * 50, 12 + j * 38, 30, 26); }
      lbl(c, d ? fit(c, d.mount, 170) : 'NO VOLUME', 12, 30, `700 15px ${MONO}`, d ? '#e8eef6' : '#5a6068');
      if (d) lbl(c, `${GB(d.used)}/${GB(d.size)} GB`, 12, 58, `500 13px ${MONO}`, '#8ab4ff');
      if (d) lbl(c, `${Math.round(d.used / d.size * 100)}%`, 12, 80, `700 15px ${MONO}`, d.used / d.size > 0.85 ? '#ff6b5b' : '#5dff9b');
    }, (p) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const b = j * 6 + i; p(240 + i * 50, 16 + j * 38, () => { const d = disk(v); return !d ? LED.off : b < Math.ceil(d.used / d.size * 12) ? (Math.random() < 0.06 ? LED.w : LED.b) : C(0.1, 0.25, 0.5, 0.4); }); } },
    () => { const d = disk(v); return d ? `${escapeHtml(d.mount)} · ${GB(d.used)} of ${GB(d.size)} GB used (${escapeHtml(d.dev)})` : 'Empty bay: no volume'; });
    const batt = () => m()?.battery;
    unit(1, 3, 3, 'UPS', (c) => {
      lbl(c, 'UPS', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      const b = batt();
      lbl(c, b ? `${b.pct}% · ${b.ac ? 'ON MAINS' : 'ON BATTERY'}` : 'MAINS · NO BATTERY', 14, 60, `600 15px ${MONO}`, b && !b.ac ? '#ffb347' : '#5dff9b');
      if (m()) lbl(c, `UP ${F.dur(m().uptime * 1000)}`, 14, 90, `500 14px ${MONO}`, '#8a93a0');
    }, (p) => { for (let i = 0; i < 20; i++) p(260 + i * 11, 40, () => ((batt()?.pct ?? 100) > (i + 0.5) * 5 ? lit(19 - i, 20) : LED.off)); p(260, 90, () => (batt()?.ac === false ? LED.a : LED.g)); },
    () => (batt() ? `Battery ${batt().pct}% · ${escapeHtml(batt().state)}` : 'On mains') + (m() ? ` · up ${F.dur(m().uptime * 1000)}` : ''));
    const rate = (b) => (b > 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB/s` : `${(b / 1024).toFixed(0)} KB/s`), traffic = () => (m()?.net ? m().net.rx + m().net.tx : 0);
    for (const [u, k] of [[38, 0], [36, 1]]) unit(2, u, 1, `Switch ${k + 1}`, (c) => {
      for (let i = 0; i < 24; i++) for (let j = 0; j < 1; j++) { c.fillStyle = '#0a0b0c'; c.fillRect(96 + i * 17, 10, 13, 16); }
      lbl(c, `SW${k + 1}`, 12, 28, `700 15px ${MONO}`, '#e8eef6');
    }, (p) => { for (let i = 0; i < 24; i++) { const up = i < 18 - k * 6; p(102 + i * 17, 34, () => (!up ? LED.off : Math.random() < Math.min(0.9, 0.05 + Math.log10(1 + traffic() / 2048) * 0.22) ? LED.a : LED.g)); } },
    () => (m()?.net ? `↓ ${rate(m().net.rx)} · ↑ ${rate(m().net.tx)}` : ''));
    unit(2, 31, 2, 'Uplink', (c) => {
      lbl(c, 'UPLINK', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      if (m()?.net) { lbl(c, `↓ ${rate(m().net.rx)}`, 14, 62, `600 15px ${MONO}`, '#8ab4ff'); lbl(c, `↑ ${rate(m().net.tx)}`, 200, 62, `600 15px ${MONO}`, '#5dff9b'); }
    }, (p) => { p(470, 30, () => LED.g); p(486, 30, () => (Math.random() < 0.2 + Math.min(0.7, traffic() / 2 ** 20) ? LED.a : LED.off)); }, () => (m()?.net ? `↓ ${rate(m().net.rx)} · ↑ ${rate(m().net.tx)}` : ''));
    quads(infraFaces, IA.m, 1024, 1024);
    {   // the rest of the machine racks: patch panels and blanking
      const used = new Map([[0, [[36, 6], [32, 3], [28, 3], [14, 12]]], [1, [...Array(6)].map((_, v) => [37 - v * 3, 2]).concat([[3, 3]])], [2, [[38, 1], [36, 1], [31, 2]]]]);
      for (const [r, list] of used) for (let u = 1; u <= 42; u++) if (!list.some(([a, n]) => u >= a && u < a + n)) face(RACKX(r), ROWS[1], u, r === 2 && u % 4 === 1 ? 'patch' : 'blank');
    }
    quads(faces, faceM, 512, 768);   // the live racks' switches, patch panels and blanking

    // Containment: a glass roof over every cold aisle and sliding glass doors at both ends, opening as you come (instanced
    // leaves, only the doors near you move). A sign over each end.
    const glassM = new THREE.MeshStandardMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const aluM = mat('#aab0b8', { metalness: 0.8, roughness: 0.3 }), alu = [], roofs = [], aisleSigns = [];
    const AS = makeCanvas(512, 512);
    PODS.forEach((k, pi) => {
      const z = k * POD, nm = `${ROWS[pi * 2].id}/${ROWS[pi * 2 + 1].id}`;
      { const c = AS.ctx, px = (pi % 2) * 256, py = Math.floor(pi / 2) * 64; c.fillStyle = '#1f5fbf'; c.fillRect(px, py, 256, 64); lbl(c, `COLD AISLE ${nm}`, px + 128, py + 44, `700 30px ${FONT}`, '#fff', 'center'); }
      for (const B of BLOCKS) {
        const x0 = B.x0 - 0.3, x1 = B.x1 + 0.3;
        roofs.push([x0, x1, z - 0.6, z + 0.6]);
        for (const s of [-1, 1]) alu.push([x1 - x0, 0.05, 0.04, (x0 + x1) / 2, RK.h + 0.05, z + s * 0.6]);
        for (const x of [x0, x1]) {
          alu.push([0.06, 0.12, 1.3, x, RK.h + 0.02, z]);
          for (const s of [-1, 1]) alu.push([0.06, RK.h, 0.05, x, RK.h / 2, z + s * 0.65]);
          const out = x === x1 ? 1 : -1;
          aisleSigns.push([x + out * 0.035, 1.75, z, 0.5, 0.125, out > 0 ? Math.PI / 2 : -Math.PI / 2, [(pi % 2) * 256, Math.floor(pi / 2) * 64, 256, 64]]);
          srv.aisleDoors.push({ x, z, k: 0, e: -1 });
        }
      }
    });
    AS.tex.needsUpdate = true;
    quads(aisleSigns, new THREE.MeshBasicMaterial({ map: AS.tex }), 512, 512);
    flats(roofs, glassM, 1, RK.h + 0.05).castShadow = false;
    root.add(mergedBoxes(alu, aluM));
    {   // the leaves: two per door, a glass pane and its aluminium frame
      const n = srv.aisleDoors.length * 2;
      srv.leafGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, RK.h - 0.06, 0.6), glassM, n);
      srv.leafFrame = new THREE.InstancedMesh(mergedBoxes([[0.03, 0.04, 0.6, 0, (RK.h - 0.06) / 2, 0], [0.03, 0.04, 0.6, 0, -(RK.h - 0.06) / 2, 0], [0.03, RK.h - 0.06, 0.03, 0, 0, 0.285], [0.03, RK.h - 0.06, 0.03, 0, 0, -0.285]], null).geometry, aluM, n);
      root.add(srv.leafGlass, srv.leafFrame);
    }

    // Overhead, on threaded rods from the soffit: a wire-basket tray over every row (data, with bundles and drops into the
    // racks), a ladder rack over every hot aisle (power), cross ladder racks along the cross aisle and the far end, and
    // the red suppression pipework at the top.
    const tray = [], cable = [], pipe = [], rods = [];
    const ladder = (x0, x1, z0, z1, y, list) => {   // along x if x1 - x0 > z1 - z0
      const alongX = x1 - x0 > z1 - z0, w = alongX ? z1 - z0 : x1 - x0, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const s of [-1, 1]) list.push(alongX ? [len, 0.08, 0.02, cx, y, cz + s * w / 2] : [0.02, 0.08, len, cx + s * w / 2, y, cz]);
      for (let a = 0.15; a < len; a += 0.3) list.push(alongX ? [0.025, 0.02, w, x0 + a, y - 0.03, cz] : [w, 0.02, 0.025, cx, y - 0.03, z0 + a]);
      for (let a = 0.6; a < len; a += 1.8) for (const s of [-1, 1]) rods.push(alongX ? [0.012, H - y, 0.012, x0 + a, (H + y) / 2, cz + s * w / 2] : [0.012, H - y, 0.012, cx + s * w / 2, (H + y) / 2, z0 + a]);
    };
    for (const row of ROWS) for (const B of BLOCKS) {
      const z = row.z, y = 2.45, xa = B.x0 - 0.2, xb = B.x1 + 0.2;
      for (const s of [-1, 1]) tray.push([xb - xa, 0.05, 0.012, (xa + xb) / 2, y, z + s * 0.15]);
      for (let x = xa; x < xb; x += 0.2) tray.push([0.008, 0.008, 0.3, x, y - 0.025, z]);
      for (let x = xa + 0.6; x < xb; x += 1.8) rods.push([0.012, H - y, 0.012, x, (H + y) / 2, z - 0.15], [0.012, H - y, 0.012, x, (H + y) / 2, z + 0.15]);
      [['#2a6fd6', -0.08], ['#e3c23a', 0], ['#7a7f87', 0.08]].forEach(([col, dz], i) => cable.push([xb - xa, 0.035 + i * 0.01, 0.07, (xa + xb) / 2, y + 0.02, z + dz, col]));
      for (let i = 0; i < B.n; i += 2) cable.push([0.05, y - RK.h, 0.05, B.x(i), (y + RK.h) / 2, z - row.f * 0.3, i % 4 ? '#e3c23a' : '#2a6fd6']);
    }
    for (const k of [...PODS, -4]) for (const B of BLOCKS) {
      const z = k * POD + POD / 2;
      if (k === -4 || k === 3) continue;
      ladder(B.x0 - 0.2, B.x1 + 0.2, z - 0.25, z + 0.25, 3.0, tray);
      for (const [col, dz] of [['#1a1a1a', -0.1], ['#b3261e', 0.02], ['#1a1a1a', 0.12]]) cable.push([B.x1 - B.x0 + 0.3, 0.04, 0.06, (B.x0 + B.x1) / 2, 3.03, z + dz, col]);
    }
    ladder(4.45, 4.95, -17, 17, 3.5, tray); ladder(-13.25, -12.75, -17, 17, 3.5, tray);
    for (const x of [4.7, -13]) for (const [col, dx] of [['#2a6fd6', -0.1], ['#e3c23a', 0.05]]) cable.push([0.07, 0.05, 33.6, x + dx, 3.53, 0, col]);
    for (const z of [-POD * 2 - 2.27, -2.27, POD * 2 - 2.27, POD * 2 + 2.27]) {
      pipe.push([SV.x1 - SV.x0 - 0.4, 0.06, 0.06, (SV.x0 + SV.x1) / 2, H - 0.3, z]);
      for (let x = SV.x0 + 1.5; x < SV.x1; x += 3) pipe.push([0.03, 0.14, 0.03, x, H - 0.4, z], [0.08, 0.03, 0.08, x, H - 0.48, z]);
    }
    pipe.push([0.06, 0.06, SV.z1 - SV.z0 - 1, SV.x1 - 0.4, H - 0.3, 0]);
    root.add(mergedBoxes(tray, mat('#b8bec6', { metalness: 0.85, roughness: 0.35 })), mergedBoxes(rods, mat('#7d838b', { metalness: 0.8, roughness: 0.4 })),
      mergedBoxes(cable, mat('#ffffff', { vertexColors: true, roughness: 0.7 })), mergedBoxes(pipe, mat('#b3261e', { roughness: 0.45, metalness: 0.2 })));

    // CRACs along both long walls, facing into the hot aisles' ends: cream cabinets, grilles, one shared display texture
    // (return air follows the CPU); each says its name on hover.
    srv.cracs = [];
    const crac = [], grilles = [], screens = [];
    const GR = makeCanvas(256, 128); GR.ctx.fillStyle = '#26282b'; GR.ctx.fillRect(0, 0, 256, 128); GR.ctx.fillStyle = '#121315'; for (let y = 4; y < 128; y += 9) GR.ctx.fillRect(4, y, 248, 5); GR.tex.needsUpdate = true;
    let ci = 0;
    for (const side of [-1, 1]) for (const x of [11.4, 6.6, 0.8, -4.8, -10.4]) {
      if (side > 0 && x < -9) continue;   // the NOC office is there
      const z = side * (SV.z1 - 0.45), nm = `CRAC-${String(++ci).padStart(2, '0')}`, f = -side, fz = z + f * 0.45;
      crac.push([1.8, 1.95, 0.85, x, 0.975, z, '#d9d6cd'], [1.6, 0.5, 0.02, x, 0.4, fz + f * 0.005, '#3a3c3f']);
      grilles.push([x, 1.45, fz + f * 0.006, 1.58, 0.68, f > 0 ? 0 : Math.PI, [0, 0, 256, 128]]);
      screens.push([x + f * 0.55, 0.95, fz + f * 0.008, 0.26, 0.12, f > 0 ? 0 : Math.PI, [0, 0, 208, 96]]);
      srv.cracs.push({ nm, x, z });
      srv.fixed.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.43, maxZ: z + 0.43 });
      srv.units.push({ hit: hitBox(root, 1.8, 1.95, 0.9, x, 0.975, z, { action: 'info', reach: 4, info: () => `<b>${nm}</b><div class="m">${cracText(z).join(' · ')}</div>` }) });
    }
    root.add(mergedBoxes(crac, mat('#ffffff', { vertexColors: true, roughness: 0.6, metalness: 0.2 })));
    quads(grilles, new THREE.MeshStandardMaterial({ map: GR.tex, roughness: 0.6, metalness: 0.5 }), 256, 128);
    const CD = srv.cracScreen = makeCanvas(208, 96);
    quads(screens, new THREE.MeshBasicMaterial({ map: CD.tex, color: new THREE.Color(1.25, 1.25, 1.25) }), 208, 96);
    const cracText = (z) => { const cs = cores(), load = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 20; return [`SUPPLY ${(17.6 + (z > 0 ? 0.4 : 0)).toFixed(1)}°C`, `RETURN ${(23 + load * 0.09 + (z > 0 ? 0.3 : 0)).toFixed(1)}°C`, `RH ${44 + (z > 0 ? 2 : 0)}%`]; };
    srv.paintCracs = () => { const c = CD.ctx; c.fillStyle = '#071019'; c.fillRect(0, 0, CD.W, CD.H); lbl(c, 'CRAC · AUTO', 8, 20, `700 16px ${MONO}`, '#8ab4ff'); cracText(-1).forEach((tx, i) => lbl(c, tx, 8, 44 + i * 20, `500 14px ${MONO}`, '#cfe3ff')); CD.tex.needsUpdate = true; };

    // The NOC: a big wall in the glass office at the far end, and a double-sided repeater over the cross aisle, one canvas.
    const noc = srv.noc = makeScreen(root, 4.4, 2.475, 1280, 720, SV.x0 + 0.08, 1.65, 11.5); noc.mesh.rotation.y = Math.PI / 2;
    root.add(mergedBoxes([[0.06, 2.56, 4.5, SV.x0 + 0.04, 1.65, 11.5], [0.3, 0.3, 0.3, 4.7, H - 0.4, 0], [0.04, H - 3.55, 0.04, 4.7, (H + 3.55) / 2, 0], [0.12, 1.06, 1.86, 4.7, 3.0, 0]], mat('#0c0d0f', { roughness: 0.4 })));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0125), noc.mesh.material); m.position.set(4.7 + s * 0.061, 3.0, 0); m.rotation.y = s * Math.PI / 2; root.add(m); }
    Object.assign(noc.mesh.userData, { action: 'info', reach: 12, info: () => '<b>NOC wall</b><div class="m">This machine, live</div>' });
    srv.units.push({ hit: noc.mesh });

    // The KVM crash cart, parked in the cross aisle by the first pod.
    {
      const x = 4.2, z = -2.6, g = new THREE.Group(), steel = mat('#5d636b', { metalness: 0.7, roughness: 0.4 });
      g.position.set(x, 0, z); g.rotation.y = 2.2; root.add(g);
      const parts = [[0.5, 0.02, 0.4, 0, 0.9, 0], [0.5, 0.02, 0.4, 0, 0.35, 0], [0.12, 0.3, 0.02, 0, 1.06, -0.12]];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([0.025, 0.86, 0.025, sx * 0.23, 0.48, sz * 0.18]);
      g.add(mergedBoxes(parts, steel));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.03, 0.03, 0.025, '#111', sx * 0.23, 0.03, sz * 0.18, { seg: 10 }).rotation.z = Math.PI / 2;
      box(g, 0.42, 0.28, 0.025, '#151618', 0, 1.25, -0.12);
      const scr = makeScreen(g, 0.39, 0.25, 312, 200, 0, 1.25, -0.106), c = scr.ctx;
      c.fillStyle = '#000'; c.fillRect(0, 0, 312, 200);
      srv.kvm = scr;
      box(g, 0.4, 0.015, 0.14, '#202226', 0, 0.918, 0.06); box(g, 0.05, 0.012, 0.08, '#202226', 0.16, 0.918, 0.07);
      box(g, 0.3, 0.12, 0.22, '#2a2c30', 0, 0.42, 0);
      srv.fixed.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
      srv.units.push({ hit: hitBox(g, 0.5, 1.4, 0.4, 0, 0.7, 0, { action: 'info', reach: 3, info: () => `<b>KVM crash cart</b><div class="m">Console on ${escapeHtml(m()?.hostname || 'this machine')}</div>` }) });
    }
    // By the door, inside: the emergency power off and an extinguisher.
    {
      const x = SV.x1 - 0.07, z = -1.3;
      root.add(mergedBoxes([[0.04, 0.22, 0.22, x, 1.4, z, '#f2c230'], [0.03, 0.4, 0.3, x + 0.02, 1.05, -1.9, '#b3261e']], mat('#ffffff', { vertexColors: true, roughness: 0.5 })));
      cyl(root, 0.05, 0.05, 0.05, '#c0221a', x - 0.04, 1.4, z, { seg: 20 }).rotation.z = Math.PI / 2;
      sign(0.3, 0.1, x - 0.001, 1.62, z, -Math.PI / 2, 600, (c, W, H) => { c.fillStyle = '#b3261e'; c.fillRect(0, 0, W, H); lbl(c, 'EMERGENCY POWER OFF', W / 2, H * 0.68, `800 ${H * 0.42}px ${FONT}`, '#fff', 'center'); });
      cyl(root, 0.08, 0.08, 0.55, '#c0221a', x - 0.12, 0.3, -1.9, { seg: 16 });
      srv.units.push({ hit: hitBox(root, 0.1, 0.3, 0.3, x - 0.03, 1.45, z, { action: 'info', reach: 3, info: () => '<b>Emergency power off</b><div class="m">Kills every rack in the hall. Don’t.</div>' }) });
    }

    // The staging/build area in the far corner: ESD benches with a server opened up, a half-built rack on castors, spares
    // shelving, boxes on a pallet, and yellow floor markings.
    {
      const S = STAGE, parts = [], card = [];
      const mark = []; for (const [x0, x1, z0, z1] of [[S.x0 + 0.2, S.x1, S.z1 - 0.05, S.z1], [S.x1 - 0.05, S.x1, S.z0, S.z1]]) mark.push([x0, x1, z0, z1]);
      flats(mark, mat('#e3c23a', { roughness: 0.6 }), 1, 0.004);
      for (const z of [-15.6, -12.2]) {   // benches against the far wall
        const x = S.x0 + 0.45;
        parts.push([0.85, 0.04, 2.2, x, 0.9, z, '#4b5563'], [0.86, 0.006, 2.1, x, 0.923, z, '#3767a6'], [0.04, 0.88, 0.04, x - 0.38, 0.44, z - 1.05, '#9aa0a8'], [0.04, 0.88, 0.04, x + 0.38, 0.44, z - 1.05, '#9aa0a8'],
          [0.04, 0.88, 0.04, x - 0.38, 0.44, z + 1.05, '#9aa0a8'], [0.04, 0.88, 0.04, x + 0.38, 0.44, z + 1.05, '#9aa0a8'], [0.8, 0.02, 2.1, x, 0.25, z, '#6b7280'], [0.05, 0.7, 2.2, x - 0.42, 1.27, z, '#9aa0a8'],
          [0.03, 0.03, 2.1, x - 0.38, 1.55, z, '#4b5563']);
        srv.fixed.push({ minX: S.x0, maxX: x + 0.45, minZ: z - 1.1, maxZ: z + 1.1 });
      }
      // an open 1U on the first bench: chassis, fans, DIMMs, a heatsink, its lid beside it
      const ox = S.x0 + 0.45, oz = -15.6;
      parts.push([0.45, 0.044, 0.7, ox, 0.95, oz, '#2a2d32'], [0.44, 0.004, 0.68, ox + 0.0, 0.93, oz + 0.75, '#5d636b'], [0.12, 0.03, 0.12, ox, 0.98, oz + 0.05, '#b8bec6']);
      for (let i = 0; i < 6; i++) parts.push([0.05, 0.035, 0.04, ox - 0.15 + i * 0.06, 0.975, oz - 0.2, '#16181b']);
      for (let i = 0; i < 8; i++) parts.push([0.006, 0.03, 0.13, ox + 0.1 + i * 0.012, 0.975, oz + 0.05, '#1f6f3a']);
      parts.push([0.25, 0.08, 0.18, ox, 0.97, -12.6, '#c9b28a'], [0.05, 0.02, 0.18, ox + 0.2, 0.93, -12.0, '#e3c23a'], [0.3, 0.2, 0.4, ox, 1.03, -11.6, '#2a2d32']);   // a box of screws, a cable tester, a drive caddy box
      // half-built rack on castors
      const hx = -20, hz = -13.5;
      for (const [w, h, d, x, y, z] of [[0.02, 2, 1.07, -0.29, 1.08, 0], [0.02, 2, 1.07, 0.29, 1.08, 0], [0.6, 0.04, 1.07, 0, 2.06, 0], [0.6, 0.06, 1.07, 0, 0.11, 0]]) parts.push([w, h, d, hx + x, y, hz + z, '#15171a']);
      for (const [x, z] of [[-0.25, -0.45], [0.25, -0.45], [-0.25, 0.45], [0.25, 0.45]]) parts.push([0.06, 0.08, 0.06, hx + x, 0.04, hz + z, '#111']);
      for (let u = 0; u < 5; u++) parts.push([0.45, 0.04, 0.8, hx, 0.2 + u * 0.045, hz, u % 2 ? '#2a2d32' : '#2b2e33']);
      srv.fixed.push({ minX: hx - 0.32, maxX: hx + 0.32, minZ: hz - 0.55, maxZ: hz + 0.55 });
      // spares shelving on the south wall
      for (const x of [-23.6, -21.4]) {
        for (const y of [0.15, 0.6, 1.05, 1.5, 1.95]) parts.push([1.9, 0.02, 0.5, x, y, S.z0 - 1.15, '#9aa0a8']);
        for (const sx of [-0.93, 0.93]) for (const sz of [-0.23, 0.23]) parts.push([0.025, 2, 0.025, x + sx, 1, S.z0 - 1.15 + sz, '#9aa0a8']);
        for (const y of [0.16, 0.61, 1.06, 1.51]) for (let i = 0; i < 4; i++) if (R() < 0.8) card.push([0.36 + R() * 0.1, 0.18 + R() * 0.2, 0.36, x - 0.7 + i * 0.46, y + 0.1 + R() * 0.02, S.z0 - 1.15, R() < 0.3 ? '#2a2d32' : '#b08a5a']);
        srv.fixed.push({ minX: x - 0.96, maxX: x + 0.96, minZ: S.z0 - 1.45, maxZ: S.z0 - 0.85 });
      }
      // boxed servers on a pallet, one box open
      const px = -17.2, pz = -5.2;
      parts.push([1.2, 0.14, 1.0, px, 0.07, pz, '#a07b4f']);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) card.push([0.55, 0.28, 0.95, px - 0.29 + j * 0.58, 0.28 + i * 0.29, pz, '#b08a5a'], [0.56, 0.06, 0.96, px - 0.29 + j * 0.58, 0.3 + i * 0.29, pz, '#c9b28a']);
      card.push([0.6, 0.35, 0.8, px + 1.1, 0.175, pz + 0.6, '#b08a5a'], [0.6, 0.02, 0.4, px + 1.1, 0.4, pz + 0.95, '#b08a5a']);
      srv.fixed.push({ minX: px - 0.6, maxX: px + 1.42, minZ: pz - 0.5, maxZ: pz + 1.0 });
      root.add(mergedBoxes(parts, mat('#ffffff', { vertexColors: true, roughness: 0.6, metalness: 0.3 })), mergedBoxes(card, mat('#ffffff', { vertexColors: true, roughness: 0.95 })));
      sign(2.4, 0.5, S.x0 + 0.07, 2.9, -10, Math.PI / 2, 300, (c, W, H) => { c.fillStyle = '#e3c23a'; c.fillRect(0, 0, W, H); c.fillStyle = '#111'; for (let x = -H; x < W; x += 40) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + 20, H); c.lineTo(x + 20 + H * 0.2, H * 0.8); c.lineTo(x + H * 0.2, H * 0.8); c.fill(); } lbl(c, 'STAGING · BUILD AREA', W / 2, H * 0.55, `800 ${H * 0.36}px ${FONT}`, '#111', 'center'); });
      srv.units.push({ hit: hitBox(root, 0.9, 1, 2.2, S.x0 + 0.45, 0.6, -15.6, { action: 'info', reach: 3.5, info: () => '<b>Build bench</b><div class="m">Someone’s halfway through a DIMM swap. Again.</div>' }) });
    }

    // The NOC office: glass on its two open sides (a doorway near the floor end), a dark roof, the NOC wall, a console
    // facing it, and John's desk by the glass looking out over the floor.
    {
      const N = NOC, gl = [], fr = [], doorZ = [N.z0 + 0.6, N.z0 + 1.8];
      gl.push([N.x1 - N.x0, N.h - 0.1, 0.02, (N.x0 + N.x1) / 2, (N.h - 0.1) / 2 + 0.05, N.z0], [0.02, N.h - 0.1, N.z1 - doorZ[1], N.x1, (N.h - 0.1) / 2 + 0.05, (doorZ[1] + N.z1) / 2], [0.02, N.h - 0.1, doorZ[0] - N.z0, N.x1, (N.h - 0.1) / 2 + 0.05, (N.z0 + doorZ[0]) / 2]);
      for (let x = N.x0 + 1.5; x < N.x1; x += 1.5) fr.push([0.05, N.h, 0.06, x, N.h / 2, N.z0]);
      for (let z = doorZ[1] + 1.5; z < N.z1; z += 1.5) fr.push([0.06, N.h, 0.05, N.x1, N.h / 2, z]);
      for (const z of [...doorZ, N.z0]) fr.push([0.08, N.h, 0.08, N.x1, N.h / 2, z]);
      fr.push([N.x1 - N.x0, 0.06, 0.08, (N.x0 + N.x1) / 2, 0.03, N.z0], [N.x1 - N.x0, 0.08, 0.08, (N.x0 + N.x1) / 2, N.h - 0.04, N.z0], [0.08, 0.08, N.z1 - N.z0, N.x1, N.h - 0.04, (N.z0 + N.z1) / 2],
        [0.08, 0.06, N.z1 - doorZ[1], N.x1, 0.03, (doorZ[1] + N.z1) / 2], [0.08, N.h - 2.2, doorZ[1] - doorZ[0], N.x1, (N.h + 2.2) / 2, (doorZ[0] + doorZ[1]) / 2]);
      const pane = mergedBoxes(gl, glassM); pane.castShadow = false; root.add(pane);
      root.add(mergedBoxes(fr, mat('#2b2f35', { metalness: 0.6, roughness: 0.4 })));
      root.add(mergedBoxes([[N.x1 - N.x0 + 0.1, 0.12, N.z1 - N.z0 + 0.1, (N.x0 + N.x1) / 2, N.h + 0.06, (N.z0 + N.z1) / 2]], mat('#2a2e35', { roughness: 0.8 })));
      flats([[N.x0, N.x1, N.z0, N.z1]], mat('#3a3f47', { roughness: 0.9 }), 1, N.h - 0.002, true);
      flats([[N.x0, N.x1, N.z0, N.z1]], mat('#4a4f57', { roughness: 0.85 }), 1, 0.002);   // carpet tiles
      root.add(mergedBoxes([[1.2, 0.02, 0.6, -21.5, N.h - 0.012, 8], [1.2, 0.02, 0.6, -21.5, N.h - 0.012, 15]], new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f7ff', emissiveIntensity: 1.6 })));
      srv.fixed.push({ minX: N.x0, maxX: N.x1 + 0.05, minZ: N.z0 - 0.05, maxZ: N.z0 + 0.05 }, { minX: N.x1 - 0.05, maxX: N.x1 + 0.05, minZ: doorZ[1], maxZ: N.z1 }, { minX: N.x1 - 0.05, maxX: N.x1 + 0.05, minZ: N.z0, maxZ: doorZ[0] });
      sign(1.4, 0.3, N.x1 + 0.03, 2.6, (doorZ[1] + N.z1) / 2 + 1.5, Math.PI / 2, 300, (c, W, H) => { c.fillStyle = '#1d2228'; c.fillRect(0, 0, W, H); lbl(c, 'NOC', 20, H * 0.72, `800 ${H * 0.6}px ${FONT}`, '#d97757'); lbl(c, 'Network Operations', 120, H * 0.66, `500 ${H * 0.36}px ${FONT}`, '#e8eef6'); });
      // the console facing the wall: a long desk, three monitors showing the NOC
      const cx = -22.6, desk = [[0.8, 0.04, 3.2, cx, 0.74, 11.5, '#2a2c30'], [0.04, 0.7, 3.1, cx + 0.38, 0.37, 11.5, '#1d1f22']];
      for (const dz of [-1, 0, 1]) desk.push([0.04, 0.42, 0.04, cx - 0.2, 0.97, 11.5 + dz, '#111'], [0.025, 0.36, 0.6, cx - 0.24, 1.18, 11.5 + dz, '#111']);
      root.add(mergedBoxes(desk, mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
      for (const dz of [-1, 0, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.315), noc.mesh.material); m.position.set(cx - 0.26, 1.18, 11.5 + dz); m.rotation.y = -Math.PI / 2; root.add(m); }
      srv.fixed.push({ minX: cx - 0.4, maxX: cx + 0.4, minZ: 9.9, maxZ: 13.1 });
    }
    // John's desk, against the glass: two monitors (his terminals), a keyboard, a mug, papers, manuals, a rubber duck.
    {
      const dx = -17.85, dz = 12.6, J = srv.jdesk = { x: dx, z: dz }, parts = [];
      parts.push([0.75, 0.04, 1.7, dx, 0.74, dz, '#6b5440'], [0.04, 0.72, 0.04, dx - 0.33, 0.36, dz - 0.8, '#222'], [0.04, 0.72, 0.04, dx + 0.33, 0.36, dz - 0.8, '#222'],
        [0.04, 0.72, 0.04, dx - 0.33, 0.36, dz + 0.8, '#222'], [0.04, 0.72, 0.04, dx + 0.33, 0.36, dz + 0.8, '#222'], [0.45, 0.6, 0.4, dx, 0.42, dz + 0.55, '#3a3d42']);   // a pedestal
      for (const o of [-0.33, 0.33]) parts.push([0.04, 0.38, 0.04, dx + 0.22, 0.95, dz + o, '#111'], [0.2, 0.012, 0.18, dx + 0.22, 0.765, dz + o, '#111'], [0.025, 0.33, 0.58, dx + 0.2, 1.14, dz + o, '#111']);
      parts.push([0.16, 0.015, 0.44, dx - 0.15, 0.768, dz, '#1d1f22'], [0.1, 0.02, 0.06, dx - 0.12, 0.77, dz + 0.36, '#1d1f22']);   // keyboard, mouse
      parts.push([0.22, 0.003, 0.3, dx - 0.05, 0.763, dz - 0.6, '#f2f0ea'], [0.22, 0.003, 0.3, dx - 0.02, 0.766, dz - 0.62, '#e9e6dc'], [0.24, 0.08, 0.3, dx + 0.15, 0.8, dz - 0.65, '#7a2a2a'], [0.24, 0.05, 0.3, dx + 0.15, 0.865, dz - 0.66, '#1f4f7a']);   // papers, manuals
      parts.push([0.06, 0.06, 0.003, dx + 0.19, 1.3, dz - 0.62, '#f7e36b'], [0.06, 0.06, 0.003, dx + 0.19, 1.28, dz + 0.04, '#f7a8c8']);   // sticky notes on the bezels
      root.add(mergedBoxes(parts, mat('#ffffff', { vertexColors: true, roughness: 0.6 })));
      J.mug = new THREE.Group(); cyl(J.mug, 0.042, 0.038, 0.1, '#2c4a73', 0, 0.05, 0); cyl(J.mug, 0.038, 0.038, 0.005, '#3a2516', 0, 0.098, 0, { shadow: false });
      J.mug.position.set(dx - 0.15, 0.76, dz - 0.4); root.add(J.mug);
      const duck = new THREE.Group(); duck.position.set(dx + 0.1, 0.76, dz + 0.72); duck.rotation.y = -2.4;
      cyl(duck, 0.035, 0.04, 0.05, '#f2c230', 0, 0.025, 0, { seg: 12 }); cyl(duck, 0.022, 0.022, 0.035, '#f2c230', 0, 0.06, 0.02, { seg: 12 }); box(duck, 0.02, 0.008, 0.02, '#e07a1a', 0, 0.058, 0.045); root.add(duck);
      J.scr = [-0.33, 0.33].map((o) => { const s = makeScreen(root, 0.54, 0.3, 512, 284, dx + 0.185, 1.14, dz + o); s.mesh.rotation.y = -Math.PI / 2; return s; });
      // his chair
      const cx = dx - 0.75, ch = new THREE.Group(); ch.position.set(cx, 0, dz); root.add(ch);
      ch.add(mergedBoxes([[0.5, 0.08, 0.5, 0, 0.43, 0, '#1d1f22'], [0.08, 0.6, 0.48, -0.27, 0.78, 0, '#1d1f22'], [0.05, 0.36, 0.05, 0, 0.21, 0, '#555'], [0.55, 0.03, 0.06, 0, 0.04, 0, '#333'], [0.06, 0.03, 0.55, 0, 0.04, 0, '#333']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
      srv.fixed.push({ minX: dx - 0.38, maxX: dx + 0.4, minZ: dz - 0.85, maxZ: dz + 0.85 }, { minX: cx - 0.3, maxX: cx + 0.3, minZ: dz - 0.3, maxZ: dz + 0.3 });
    }

    // The vestibule: signage, the fire suppression panel and the access-controlled door into the hall.
    sign(1.6, 0.55, SV.x1 + 0.07, 2.55, 0, Math.PI / 2, 400, (c, W, H) => {
      c.fillStyle = '#1d2228'; c.fillRect(0, 0, W, H); c.fillStyle = '#d97757'; c.fillRect(24, 26, 8, H - 52);
      lbl(c, '47  SERVER HALL', 50, 92, `300 70px ${FONT}`, '#f2efe8'); lbl(c, 'AUTHORISED PERSONNEL ONLY · CARD ACCESS', 52, 150, `600 22px ${FONT}`, '#c3c2b7');
      lbl(c, 'Cold aisles A/B–M/N · NOC · Staging', 52, 190, `400 22px ${FONT}`, '#9a9890');
    });
    for (const s of [-1, 1]) sign(0.42, 0.56, SV.x1 + 0.07, 1.5, s * 1.1, Math.PI / 2, 400, s < 0 ? (c, W, H) => {
      c.fillStyle = '#f5f5f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#b3261e'; c.fillRect(0, 0, W, 56);
      lbl(c, 'WARNING', W / 2, 40, `800 32px ${FONT}`, '#fff', 'center');
      ['This room is protected', 'by an FM-200 gaseous', 'fire suppression', 'system. On alarm,', 'leave the room', 'immediately.'].forEach((tx, i) => lbl(c, tx, W / 2, 96 + i * 24, `500 15px ${FONT}`, '#222', 'center'));
    } : (c, W, H) => {
      c.fillStyle = '#f5f5f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#1f5fbf'; c.fillRect(0, 0, W, 56);
      lbl(c, 'NOTICE', W / 2, 40, `800 32px ${FONT}`, '#fff', 'center');
      ['No food or drink', 'beyond this point.', '', 'ESD: earth yourself', 'before touching', 'any equipment.'].forEach((tx, i) => lbl(c, tx, W / 2, 96 + i * 24, `500 18px ${FONT}`, '#222', 'center'));
    });
    {
      const z = SV.vz, x = 16.2;
      root.add(mergedBoxes([[0.42, 0.56, 0.08, x, 1.45, z - 0.04, '#b3261e'], [0.22, 0.3, 0.06, x + 0.45, 1.3, z - 0.03, '#f2c230'], [0.14, 0.14, 0.05, x - 0.42, 1.35, z - 0.025, '#1f5fbf']], mat('#ffffff', { vertexColors: true, roughness: 0.5 })));
      const fp = sign(0.36, 0.42, x, 1.47, z - 0.081, Math.PI, 500, (c, W, H) => {
        c.fillStyle = '#e9e6df'; c.fillRect(0, 0, W, H); lbl(c, 'FM-200', W / 2, 34, `800 26px ${FONT}`, '#b3261e', 'center'); lbl(c, 'EXTINGUISHING CONTROL', W / 2, 58, `600 12px ${FONT}`, '#333', 'center');
        c.fillStyle = '#071019'; c.fillRect(20, 70, W - 40, 50); lbl(c, 'SYSTEM HEALTHY · ARMED', W / 2, 101, `600 14px ${MONO}`, '#5dff9b', 'center');
        ['POWER', 'ARMED', 'FAULT', 'DISCHARGE', 'ALARM'].forEach((tx, i) => lbl(c, tx, 52, 146 + i * 13, `600 10px ${FONT}`, '#333'));
      });
      const p = (px, py, col, fn) => led(fp.position.x - (px / 180 - 0.5) * 0.36, 1.47 + (0.5 - py / 210) * 0.42, z - 0.085, col, fn, Math.PI);
      p(34, 142, LED.g); p(34, 155, LED.a); p(34, 168, LED.off); p(34, 181, LED.off); p(34, 194, LED.off);
      sign(0.2, 0.06, x + 0.45, 1.5, z - 0.061, Math.PI, 500, (c, W, H) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, W, H); lbl(c, 'MANUAL RELEASE', W / 2, H * 0.68, `800 ${H * 0.5}px ${FONT}`, '#222', 'center'); });
      cyl(root, 0.06, 0.06, 0.05, '#e9e6df', 16.2, 2.6, z - 0.03, { seg: 20 }).rotation.x = Math.PI / 2;   // sounder/strobe
      srv.units.push({ hit: hitBox(root, 1.2, 0.6, 0.12, x, 1.45, z - 0.06, { action: 'info', reach: 3, info: () => '<b>Fire suppression</b><div class="m">FM-200 clean agent · system healthy · armed</div>' }) });
    }
    {   // the access door: a steel frame lining the opening, and a leaf that slides into the wall once the reader lets you through
      const x = SV.x1, fw = 0.07, fd = t + 0.06;   // frame: jambs 7 cm wide, proud of the wall by 3 cm each side
      const frame = [[fd, DH, fw, x, DH / 2, -DW + fw / 2], [fd, DH, fw, x, DH / 2, DW - fw / 2], [fd, fw, DW * 2, x, DH - fw / 2, 0], [fd, 0.012, DW * 2 - fw * 2, x, 0.006, 0],
        [0.012, DH - fw, 0.02, x - 0.035, (DH - fw) / 2, -DW + fw - 0.01], [0.012, DH - fw, 0.02, x + 0.035, (DH - fw) / 2, DW - fw + 0.01]];   // stops, flush with the jambs' faces
      for (const s of [-1, 1]) frame.push([0.012, DH + fw, fw * 2, x + s * (fd / 2 + 0.006), (DH + fw) / 2, -DW + 0.035], [0.012, DH + fw, fw * 2, x + s * (fd / 2 + 0.006), (DH + fw) / 2, DW - 0.035],
        [0.012, fw * 2, DW * 2 + fw * 2, x + s * (fd / 2 + 0.006), DH + fw / 2, 0]);   // architraves over the joint with the wall
      root.add(mergedBoxes(frame, mat('#8d949c', { metalness: 0.7, roughness: 0.35 })));
      const lw = DW * 2 - fw * 2 + 0.03, lh = DH - fw - 0.012 + 0.01, leaf = new THREE.Group();   // into the jambs and head a little: no light round it
      leaf.add(mergedBoxes([[0.05, lh, lw, 0, 0.012 + lh / 2, 0, '#7d848c'], [0.056, 0.5, 0.2, 0, 1.55, 0.18, '#22303d'], [0.056, 0.02, 0.24, 0, 1.31, 0.18, '#5d636b'], [0.056, 0.02, 0.24, 0, 1.81, 0.18, '#5d636b']],
        mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.3 })));
      leaf.position.set(x, 0, 0); root.add(leaf);
      const pocket = DW * 2 - fw;   // how far it slides: fully behind the +z jamb, into the wall
      box(root, 0.04, 0.14, 0.09, '#1a1c20', x + fd / 2 + 0.02, 1.2, DW + 0.2);
      led(x + fd / 2 + 0.041, 1.24, DW + 0.2, LED.r, () => (srv.doors.at(-1)?.k > 0.05 ? LED.g : LED.r), Math.PI / 2);
      srv.doors.push({ x, z: 0, leaves: [leaf], k: 0, access: true, pocket });
      sign(0.3, 0.12, x - fd / 2 - 0.002, DH + 0.25, 0, -Math.PI / 2, 500, (c, W, H) => { c.fillStyle = '#1b7f3a'; c.fillRect(0, 0, W, H); lbl(c, 'EXIT  ➜', W / 2, H * 0.72, `800 ${H * 0.55}px ${FONT}`, '#fff', 'center'); }, { basic: true });
    }
    const lifted = sign(0.6, 0.6, 9.4, 0.004, -2.27 + 0.3, 0, 100, (c, W, H) => { c.fillStyle = '#05070a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e3c23a'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 8 + i * 9); c.bezierCurveTo(20, 20 + i * 4, 40, 10, W, 14 + i * 7); c.stroke(); } });   // one tile up in the hot aisle
    lifted.rotation.x = -Math.PI / 2;

    // LEDs: unlit quads, bright enough to bloom. The room's own first (always updated), then each generic rack's copy of
    // its template's, contiguous per rack so the near ones can be updated and uploaded as one range (see srv.fx).
    srv.ledAlways = leds.length;
    for (const r of srv.racks) {
      if (r.live) continue;
      const g = { x: r.x, z: r.z, a: leds.length, dyn: [] }, cos = Math.cos(r.ry), sin = Math.sin(r.ry);
      for (const o of TPL[r.tpl].leds) { const q = { x: r.x + o.x * cos + o.z * sin, y: o.y, z: r.z - o.x * sin + o.z * cos, col: o.col, fn: o.fn, ry: r.ry }; leds.push(q); if (q.fn) g.dyn.push(q); }
      g.b = leds.length - 1; srv.ledGroups.push(g);
    }
    const ledIM = srv.leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.008, 0.006), new THREE.MeshBasicMaterial({ toneMapped: false }), leds.length), mx = new THREE.Matrix4();
    leds.forEach((o, i) => { ledIM.setMatrixAt(i, mx.makeRotationY(o.ry).setPosition(o.x, o.y, o.z)); ledIM.setColorAt(i, o.col); o.i = i; });
    ledIM.instanceMatrix.needsUpdate = true; ledIM.computeBoundingSphere(); root.add(ledIM);
    srv.dyn = dyn;
    Object.assign(srv, liftShaft()); root.add(srv.lift);
    srv.john = makeJohn(root, srv.jdesk);
    srv.hits = [srv.callHit, srv.panel.mesh, ...srv.slots.map((s) => s.hit), ...srv.units.map((u) => u.hit), srv.john.root, srv.body, srv.rear];
    srv.sound = { tone: 'fans', hums: [...PODS.flatMap((k) => BLOCKS.map((B) => [(B.x0 + B.x1) / 2, 1.4, k * POD, 0.55])), ...srv.cracs.map((c) => [c.x, 1.2, c.z, 0.5])],
      clicks: srv.racks.filter((_, i) => i % 3 === 0).map((r) => [r.x, 1, r.z]), relays: [...srv.cracs.map((c) => [c.x, 1.0, c.z]), [16.2, 1.5, SV.vz]] };
    srv.baseSound = JSON.parse(JSON.stringify(srv.sound));
    srv.atlases = [SA, IA];
    addFloor(srv);
  }
  srv.enter = (z) => {
    srv.root.position.z = z;
    srv.colliders = srv.fixed.map((b) => ({ ...b, minZ: b.minZ + z, maxZ: b.maxZ + z }));
    srv.static = srv.colliders.length;
    for (const k of ['hums', 'clicks', 'relays']) srv.sound[k] = srv.baseSound[k].map(([x, y, zz, g]) => [x, y, zz + z, g]);
    srv.polledAt = 0; srv.paintAt = srv.nocAt = 0;
  };
  srv.bound = (p) => {
    const z0 = srv.root.position.z, lz = p.z - z0;
    if (p.x > SV.x1 + 0.06) { p.z = z0 + clamp(lz, -SV.vz + 0.3, SV.vz - 0.3); p.x = Math.min(p.x, LIFT.x - 0.3); }
    else { p.x = Math.max(p.x, SV.x0 + 0.3); p.z = z0 + clamp(lz, SV.z0 + 0.3, SV.z1 - 0.3); }
  };
  async function pollMachine() {
    srv.polledAt = performance.now();
    try {
      const m = srv.m = await (await fetch('/api/machine')).json(), h = srv.hist, push = (k, v) => { h[k].push(v); if (h[k].length > 120) h[k].shift(); };
      push('cpu', m.cores.length ? m.cores.reduce((a, b) => a + b, 0) / m.cores.length : 0);
      push('mem', m.mem ? m.mem.used / m.mem.total * 100 : 0);
      push('load', m.load[0]);
      push('sess', S?.live.length || 0);
      push('net', m.net ? (m.net.rx + m.net.tx) / 1024 : 0);
      const ts = new Date().toTimeString().slice(0, 8), log = srv.jlog ||= [];
      log.push(`${ts} ${m.hostname} kernel: load ${m.load[0].toFixed(2)} mem ${Math.round(h.mem.at(-1))}%`);
      for (const s of S?.live || []) if (s.status !== srv.jseen?.[s.sessionId]) { log.push(`${ts} claude[${s.pid}]: ${sessName(s)} -> ${s.status}`); (srv.jseen ||= {})[s.sessionId] = s.status; }
      if (Math.random() < 0.3) log.push(`${ts} sshd[${4000 + Math.floor(Math.random() * 5000)}]: Accepted publickey for john from 10.47.0.${Math.floor(Math.random() * 250)}`);
      if (log.length > 40) log.splice(0, log.length - 40);
      srv.nocAt = 0;
    } catch {}
  }
  // Sessions into slots: a new session takes the slot that's been empty longest and boots; one that ends powers down,
  // its plate stays a minute, then the slot is blanked.
  function syncSlots(now) {
    const live = new Map((S?.live || []).map((s) => [s.sessionId, s]));
    for (const s of srv.slots) {
      const ss = s.sid && live.get(s.sid);
      if (ss) { s.sess = ss; if (s.state === 'off') { s.state = 'boot'; s.since = now; } if (s.state === 'boot' && now - s.since > 2500) s.state = 'live'; live.delete(s.sid); }
      else if (s.sid && s.state !== 'off') { s.state = 'off'; s.since = now; }
      else if (s.state === 'off' && now - s.since > 60e3) Object.assign(s, { sid: null, sess: null, state: 'empty', since: now });
      s.hit.userData.sessionId = s.state === 'live' || s.state === 'boot' ? s.sid : null;
    }
    for (const ss of live.values()) {
      const s = srv.slots.filter((x) => x.state === 'empty').sort((a, b) => a.since - b.since || a.k - b.k)[0];
      if (!s) break;
      Object.assign(s, { sid: ss.sessionId, sess: ss, state: 'boot', since: now });
      s.hit.userData.sessionId = ss.sessionId;
    }
  }
  const sessName = (s) => s.name || s.statusline?.name || s.transcript?.title || s.sessionId.slice(0, 8);
  function paintSlot(s, now) {
    const c = srv.sa.a.ctx, [x, y, w, h] = s.cell, ss = s.sess, col = s.sid ? dash.colorHex(s.sid) : '#444';
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
    if (s.state === 'empty') {
      c.fillStyle = '#1b1d20'; c.fillRect(0, 0, w, h);
      for (let i = 18; i < w - 10; i += 14) { c.fillStyle = '#101113'; c.fillRect(i, 14, 8, h - 28); }
    } else {
      const off = s.state === 'off';
      c.fillStyle = '#25292e'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, w, 2); c.fillStyle = '#0d0f11'; c.fillRect(0, h - 3, w, 3);
      c.fillStyle = off ? '#3a3d42' : col; c.fillRect(6, 6, 8, h - 12);
      c.fillStyle = off ? '#55585e' : col; c.fillRect(20, 12, 100, h - 24);
      const name = ss ? sessName(ss) : '';
      c.font = `700 9px ${MONO}`; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(`CC-${String(s.k + 1).padStart(2, '0')}`, 25, 24);
      c.font = `700 15px ${FONT}`; c.fillStyle = '#111'; c.fillText(fit(c, name, 92), 25, 44);
      c.fillStyle = '#05080a'; c.fillRect(128, 9, 134, h - 18);
      if (!off) {
        const lines = s.state === 'boot' ? ['BOOTING…', `POST ${'█'.repeat(1 + Math.floor((now - s.since) / 350) % 8)}`, ''] : [
          name, `CPU ${(ss?.proc?.cpu ?? 0).toFixed(1).padStart(5)}%  ${String(ss?.proc?.rssMB ?? 0).padStart(4)}M`,
          ss?.status === 'working' ? 'WORKING' : ss?.status === 'idle' ? `IDLE ${F.dur(now - (ss.statusSince || now))}` : String(ss?.status || '').toUpperCase()];
        lines.forEach((tx, i) => { c.font = `600 ${i ? 12 : 13}px ${MONO}`; c.fillStyle = i === 2 && ss?.status !== 'working' && ss?.status !== 'idle' ? '#ffb347' : '#5dff9b'; c.fillText(fit(c, tx, 124), 133, 24 + i * 16); });
      } else { c.font = `600 10px ${MONO}`; c.fillStyle = '#5a6068'; c.fillText('POWERED OFF', 140, h / 2 + 4); }
      for (let b = 0; b < 4; b++) { c.fillStyle = '#16181b'; c.fillRect(266 + b * 13, 9, 11, h - 18); c.fillStyle = '#3a3e44'; c.fillRect(268 + b * 13, 12, 7, h - 34); }
    }
    c.restore();
  }
  function paintUnits() {
    const c = srv.ia.a.ctx;
    for (const U of srv.units) {
      if (!U.paint) continue;
      const [x, y, w, h] = U.cell;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
      c.fillStyle = '#23272c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, w, 2); c.fillStyle = '#0d0f11'; c.fillRect(0, h - 3, w, 3);
      U.paint(c, w, h);
      c.restore();
    }
  }
  function paintNoc(now) {
    const { ctx: c, W, H } = srv.noc, m = srv.m, h = srv.hist;
    c.fillStyle = '#070b10'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f1620'; c.fillRect(0, 0, W, 64);
    lbl(c, 'NOC', 28, 43, `800 30px ${FONT}`, '#d97757');
    lbl(c, m ? `${m.hostname} · ${m.os} · ${m.arch} · up ${F.dur(m.uptime * 1000)}` : 'waiting for /api/machine…', 100, 42, `500 22px ${FONT}`, '#c9d4e3');
    lbl(c, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), W - 28, 43, `600 26px ${MONO}`, '#e8eef6', 'right');
    const tileT = (x, y, w, hh, title, big, sub, vals, color, max) => {
      c.fillStyle = '#0d131b'; c.fillRect(x, y, w, hh); c.strokeStyle = '#1b2633'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, hh - 2);
      lbl(c, title, x + 18, y + 32, `700 16px ${FONT}`, '#7f8da0');
      lbl(c, big, x + 18, y + 78, `700 40px ${MONO}`, '#f2f5f9');
      if (sub) lbl(c, fit(c, sub, w - 36), x + 18, y + 104, `500 15px ${FONT}`, '#7f8da0');
      if (vals?.length > 1) {   // the last 6 minutes, against `max` (or its own peak)
        const gx = x + 18, gy = y + 120, gw = w - 36, gh = hh - 136, top = max ?? (Math.max(...vals) * 1.15 || 1);
        c.strokeStyle = '#1b2633'; c.lineWidth = 1; for (let i = 0; i <= 2; i++) { c.beginPath(); c.moveTo(gx, gy + gh * i / 2); c.lineTo(gx + gw, gy + gh * i / 2); c.stroke(); }
        const px = (i) => gx + gw * (1 - (vals.length - 1 - i) / 119);
        c.beginPath();
        vals.forEach((v, i) => { const py = gy + gh * (1 - Math.min(1, v / top)); i ? c.lineTo(px(i), py) : c.moveTo(px(i), py); });
        c.strokeStyle = color; c.lineWidth = 2.5; c.stroke();
        c.lineTo(px(vals.length - 1), gy + gh); c.lineTo(px(0), gy + gh); c.closePath(); c.globalAlpha = 0.18; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
      }
    };
    const cs = m?.cores || [], cpu = h.cpu.at(-1) ?? 0;
    const col = (v) => (v < 60 ? '#5dff9b' : v < 85 ? '#ffb347' : '#ff6b5b');
    tileT(24, 84, 400, 300, 'CPU', `${Math.round(cpu)}%`, `${cs.length} cores · ${m?.cpuModel || ''}`, h.cpu, col(cpu), 100);
    {   // per-core bars under the CPU tile's number
      const x = 230, y = 104, bw = Math.min(14, 170 / Math.max(1, cs.length));
      cs.forEach((v, i) => { c.fillStyle = '#16202b'; c.fillRect(x + i * (bw + 3), y, bw, 60); c.fillStyle = col(v); c.fillRect(x + i * (bw + 3), y + 60 - v * 0.6, bw, v * 0.6); });
    }
    const memP = h.mem.at(-1) ?? 0;
    tileT(440, 84, 400, 300, 'MEMORY', `${Math.round(memP)}%`, m?.mem ? `${(m.mem.used / 2 ** 30).toFixed(1)} of ${(m.mem.total / 2 ** 30).toFixed(1)} GB` : '', h.mem, col(memP), 100);
    tileT(856, 84, 400, 300, 'LOAD', m ? m.load[0].toFixed(2) : '–', m ? `5m ${m.load[1].toFixed(2)} · 15m ${m.load[2].toFixed(2)}` : '', h.load, '#8ab4ff');
    const live = S?.live || [], working = live.filter((s) => s.status === 'working').length;
    tileT(24, 400, 400, 296, 'CLAUDE SESSIONS', String(live.length), `${working} working · today ${F.usd(S?.totals?.todayCost || 0)} API-eq.`, h.sess, '#d97757');
    {   // disks
      const x = 440, y = 400, w = 400;
      c.fillStyle = '#0d131b'; c.fillRect(x, y, w, 296); c.strokeStyle = '#1b2633'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, 294);
      lbl(c, 'DISKS', x + 18, y + 32, `700 16px ${FONT}`, '#7f8da0');
      (m?.disks || []).slice(0, 5).forEach((d, i) => {
        const p = d.used / d.size, yy = y + 64 + i * 46;
        lbl(c, fit(c, d.mount, 230), x + 18, yy, `500 16px ${MONO}`, '#c9d4e3'); lbl(c, `${Math.round(p * 100)}% of ${(d.size / 2 ** 30).toFixed(0)} GB`, x + w - 18, yy, `500 15px ${MONO}`, '#7f8da0', 'right');
        c.fillStyle = '#16202b'; c.fillRect(x + 18, yy + 8, w - 36, 10); c.fillStyle = col(p * 100); c.fillRect(x + 18, yy + 8, (w - 36) * p, 10);
      });
    }
    const net = m?.net, rate = (b) => (b > 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB/s` : `${(b / 1024).toFixed(0)} KB/s`);
    tileT(856, 400, 400, 296, 'NETWORK', net ? rate(net.rx + net.tx) : '–', net ? `↓ ${rate(net.rx)} · ↑ ${rate(net.tx)}${m.battery ? ` · battery ${m.battery.pct}%${m.battery.ac ? ' (AC)' : ''}` : ''}` : '', h.net, '#8ab4ff');
    srv.noc.tex.needsUpdate = true;
  }
  function paintKvm() {
    const { ctx: c, W, H } = srv.kvm, m = srv.m;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const lines = [`${m?.os || 'macOS'} (${m?.hostname || 'localhost'}) (console)`, '', `${m?.hostname || 'localhost'} login: root`, 'Password:', `Last login: ${new Date(Date.now() - 864e5).toDateString()} on console`, `root@${m?.hostname || 'localhost'}:~# uptime`,
      m ? ` up ${F.dur(m.uptime * 1000)}, load averages: ${m.load.map((v) => v.toFixed(2)).join(' ')}` : '', `root@${m?.hostname || 'localhost'}:~# ${Date.now() % 1000 < 500 ? '█' : ''}`];
    lines.forEach((tx, i) => lbl(c, fit(c, tx, W - 16), 8, 20 + i * 18, `500 12px ${MONO}`, '#c8c8c8'));
    srv.kvm.tex.needsUpdate = true;
  }
  // Per frame while you're here: doors, LEDs (15 Hz), faces (2 Hz), the NOC (1 Hz), polling (every 3 s).
  function paintJohnScreens() {
    const [a, b] = srv.jdesk.scr, m = srv.m;
    for (const { ctx: c, W, H } of [a, b]) { c.fillStyle = '#0b0f0c'; c.fillRect(0, 0, W, H); }
    { const c = a.ctx, cs = m?.cores || [];
      lbl(c, `john@${m?.hostname || 'localhost'}: ~ $ htop`, 10, 22, `600 15px ${MONO}`, '#9fe8a8');
      cs.forEach((v, i) => { const y = 40 + i * 16; lbl(c, String(i + 1).padStart(2), 10, y + 11, `500 12px ${MONO}`, '#5ec2d8'); c.fillStyle = '#1b2a1e'; c.fillRect(34, y, 200, 11); c.fillStyle = v < 60 ? '#4ade80' : v < 85 ? '#facc15' : '#f87171'; c.fillRect(34, y, v * 2, 11); });
      if (m?.mem) lbl(c, `Mem ${(m.mem.used / 2 ** 30).toFixed(1)}G/${(m.mem.total / 2 ** 30).toFixed(1)}G  Load ${m.load.map((v) => v.toFixed(2)).join(' ')}`, 250, 52, `500 13px ${MONO}`, '#d1fae5');
      c.fillStyle = '#4ade80'; c.fillRect(248, 68, 260, 16); lbl(c, '  PID  CPU%  MEM  COMMAND', 250, 80, `700 13px ${MONO}`, '#06260f');
      (m?.top || []).slice(0, 10).forEach((q, i) => lbl(c, `${String(q.pid).padStart(5)} ${q.cpu.toFixed(1).padStart(5)} ${String(q.rssMB).padStart(4)}M ${q.name}`.slice(0, 36), 250, 100 + i * 17, `500 13px ${MONO}`, '#d1fae5'));
      a.tex.needsUpdate = true; }
    { const c = b.ctx;
      lbl(c, `john@${m?.hostname || 'localhost'}: ~ $ journalctl -f`, 10, 22, `600 15px ${MONO}`, '#9fe8a8');
      (srv.jlog || []).slice(-15).forEach((l, i) => lbl(c, fit(c, l, b.W - 20), 10, 46 + i * 16, `500 12px ${MONO}`, /claude/.test(l) ? '#fcd34d' : '#cbd5c0'));
      if (Date.now() % 1000 < 500) { c.fillStyle = '#9fe8a8'; c.fillRect(10, 46 + Math.min(15, (srv.jlog || []).length) * 16 - 10, 8, 13); }
      b.tex.needsUpdate = true; }
  }
  // Per frame while you're here: doors (only those near you move), John, LEDs (15 Hz, only racks within 15 m), faces (2 Hz),
  // the NOC (1 Hz), polling (every 3 s).
  const _mx = new THREE.Matrix4(), _look = new THREE.Vector3();
  srv.fx = (dt, t) => {
    const now = Date.now(), z0 = srv.root.position.z, px = player.x, pz = player.z - z0;
    if (performance.now() - srv.polledAt > 3000) pollMachine();
    srv.colliders.length = srv.static;
    for (const d of srv.doors) {   // the access door
      const was = d.k;
      d.k = clamp(d.k + (Math.hypot(px - d.x, pz - d.z) < 1.6 ? dt / 0.7 : -dt / 0.9), 0, 1);
      if (!was && d.k) sfx.slide({ x: d.x, z: d.z + z0 }, true);
      d.leaves[0].position.z = ease(d.k) * d.pocket;
      if (d.k < 0.7) srv.colliders.push({ minX: d.x - 0.1, maxX: d.x + 0.1, minZ: z0 - SV.dw, maxZ: z0 + SV.dw });
    }
    let moved = false;
    srv.aisleDoors.forEach((d, i) => {
      const near = (px - d.x) ** 2 + (pz - d.z) ** 2 < 3.6;
      if (near || d.k > 0) { const was = d.k; d.k = clamp(d.k + (near ? dt / 0.6 : -dt / 0.9), 0, 1); if (!was && d.k) sfx.slide({ x: d.x, z: d.z + z0 }, true); }
      if (d.k < 0.7) srv.colliders.push({ minX: d.x - 0.05, maxX: d.x + 0.05, minZ: z0 + d.z - 0.6, maxZ: z0 + d.z + 0.6 });
      const e = ease(d.k);
      if (e === d.e) return;
      d.e = e; moved = true;
      for (const s of [0, 1]) { _mx.makeTranslation(d.x, RK.h / 2 - 0.02, d.z + (s ? 1 : -1) * (0.3 + e * 0.58)); srv.leafGlass.setMatrixAt(i * 2 + s, _mx); srv.leafFrame.setMatrixAt(i * 2 + s, _mx); }
    });
    if (moved) for (const im of [srv.leafGlass, srv.leafFrame]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    const jn = srv.john, cyc = (t + 5) % 52;
    jn.mood = johnChat.open ? 'lean' : cyc < 14 ? 'type' : cyc < 18 ? 'sip' : cyc < 29 ? 'type' : cyc < 37 ? 'lean' : cyc < 43 ? 'read' : 'type';
    jn.lookAt = johnChat.open ? _look.set(camera.position.x, 0, camera.position.z - z0) : null;   // his root is in srv.root's space
    jn.update(t, dt);
    srv.jdesk.mug.visible = jn.mood !== 'sip';
    if ((srv.tick += dt) > 1 / 15) {
      srv.tick = 0;
      const im = srv.leds, col = im.instanceColor;
      for (const o of srv.dyn) im.setColorAt(o.i, o.fn(o, t));
      let lo = Infinity, hi = -1;
      for (const g of srv.ledGroups) {
        if ((g.x - px) ** 2 + (g.z - pz) ** 2 > 225) continue;
        for (const o of g.dyn) im.setColorAt(o.i, o.fn(o, t));
        if (g.a < lo) lo = g.a;
        if (g.b > hi) hi = g.b;
      }
      col.clearUpdateRanges(); col.addUpdateRange(0, srv.ledAlways * 3);
      if (hi >= lo) col.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
      col.needsUpdate = true;
    }
    if (now - srv.paintAt > 500) {
      srv.paintAt = now;
      syncSlots(now);
      for (const s of srv.slots) paintSlot(s, now);
      paintUnits(); srv.paintCracs();
      for (const A of srv.atlases) A.a.tex.needsUpdate = true;
      paintKvm(); paintJohnScreens();
    }
    if (now - srv.nocAt > 1000) { srv.nocAt = now; paintNoc(now); }
  };
  srv.map = () => {
    const c = mapCtx, W = 440, H = 330, z0 = srv.root.position.z, k = Math.min((W - 20) / (LIFT.x + 1 - SV.x0), (H - 50) / (SV.z1 - SV.z0)), sx = (x) => 10 + (x - SV.x0) * k, sz = (z) => 44 + (z - z0 - SV.z0) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(sx(SV.x0), sz(SV.z0 + z0), (SV.x1 - SV.x0) * k, (SV.z1 - SV.z0) * k); c.fillRect(sx(SV.x1), sz(-SV.vz + z0), (LIFT.x - SV.x1) * k, SV.vz * 2 * k);
    c.fillStyle = 'rgba(80,140,255,.3)'; for (const z of AISLES) for (const B of BLOCKS) c.fillRect(sx(B.x0), sz(z - 0.6 + z0), (B.x1 - B.x0) * k, 1.2 * k);
    c.fillStyle = 'rgba(217,119,87,.35)'; c.fillRect(sx(NOC.x0), sz(NOC.z0 + z0), (NOC.x1 - NOC.x0) * k, (NOC.z1 - NOC.z0) * k);
    c.fillStyle = 'rgba(227,194,58,.25)'; c.fillRect(sx(STAGE.x0), sz(STAGE.z0 + z0), (STAGE.x1 - STAGE.x0) * k, (STAGE.z1 - STAGE.z0) * k);
    c.fillStyle = 'rgba(255,255,255,.5)'; for (const b of srv.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(1.5, (b.maxX - b.minX) * k), Math.max(1.5, (b.maxZ - b.minZ) * k));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText('SERVER HALL · 47', 16, 28);
    c.font = '600 12px system-ui'; c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillText('Sessions · Machine', sx(6.4), sz(z0 - 2.4));
    c.fillText('NOC · John', sx(NOC.x0) + 4, sz(NOC.z0 + z0) + 14); c.fillText('Staging', sx(STAGE.x0) + 4, sz(STAGE.z0 + z0) + 14); c.fillText('Lift', sx(LIFT.x) - 26, sz(z0) + 4);
    const jp = srv.john.root.position; c.fillStyle = '#d97757'; c.beginPath(); c.arc(sx(jp.x), sz(jp.z + z0), 4, 0, Math.PI * 2); c.fill();
    const ppx = sx(camera.position.x), ppz = sz(camera.position.z);
    c.save(); c.translate(ppx, ppz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
  };

  // ----- sounds (see sounds.js; M mutes) -----
  const sfx = createSounds({ camera, rugs, glass: { minX: 6, maxX: 20, minZ: -15, maxZ: -3.5 }, lift: LIFT, coffee: { x: -16.5, y: 1.25, z: 14.5, onBrew: () => kitchen.brew(false) }, doorPos: { x: 7.7, z: -3.5 },
    roof: { minX: -EDGE.x, maxX: EDGE.x, minZ: -EDGE.z, maxZ: EDGE.z } });

  // ----- people sync -----
  const people = new Map();
  let overlays = localStorage.officeOverlays !== 'off';   // see setOverlays (H)
  let first = true;
  let S = null;
  const routeOut = (p) => (p.spot ? [...p.spot.route].reverse().slice(1) : []);
  function sendTo(p, target, instant) {
    if (p.spot === target) return;
    if (instant) { p.spot = target; p.place(target); return; }
    p.path = [...routeOut(p), ...target.route].map((q) => ({ ...q }));
    p.spot = target;
  }
  function sync(state) {
    S = state;
    const seen = new Set();
    for (const s of state.live) {
      seen.add(s.sessionId);
      let p = people.get(s.sessionId);
      if (!p) {
        p = new Person(s.sessionId, dash.colorHex(s.sessionId));
        p.label.visible = overlays;
        people.set(s.sessionId, p);
        world.add(p.root);
        if (!first) arrive(p);
      } else if (p.leaving) {   // back before the lift took them: that one carries on leaving, this session arrives afresh
        people.delete(s.sessionId); people.set({}, p);
        p = new Person(s.sessionId, dash.colorHex(s.sessionId));
        p.label.visible = overlays;
        people.set(s.sessionId, p);
        world.add(p.root);
        arrive(p);
      }
      p.session = s;
      const atDesk = s.status !== 'idle';
      if (!p.desk) { p.desk = desks.find((d) => !d.owner); if (p.desk) p.desk.owner = p; }
      let target;
      if (atDesk && p.desk) {
        if (p.idle) { p.idle.occupant = null; p.idle = null; }
        target = { ...p.desk.spot, pose: s.status === 'working' ? 'type' : 'wait' };
        if (p.spot?.key === target.key) { p.spot.pose = target.pose; target = p.spot; }
      } else {
        if (!p.idle) { p.idle = IDLE_ORDER.find((q) => !q.occupant) || null; if (p.idle) p.idle.occupant = p; }
        target = p.idle || LOBBY;
      }
      if (p.lift) p.want = target; else sendTo(p, target, first);
    }
    for (const [id, p] of people) {
      if (seen.has(id) || p.leaving) continue;
      p.leaving = true;
      if (p.idle) p.idle.occupant = null;
      if (p.desk) p.desk.owner = null;
      leave(p);
    }
    first = false;
    for (const d of desks) setClutter(d, d.owner && !d.owner.leaving ? clutterFor(d.owner.session, state.now || Date.now()) : 0);
    const atDesks = state.live.filter((x) => x.status !== 'idle').length;
    countEl.innerHTML = `<b>${atDesks}</b> at desks · <b>${state.live.length - atDesks}</b> in the breakroom${state.totals.subagentsActive ? ` · <b>${state.totals.subagentsActive}</b> subagents` : ''}`;
    paintScreens(true);
  }

  let lastPaint = 0;
  function paintScreens(force) {
    const now = performance.now();
    if (!S || (!force && now - lastPaint < 1000)) return;
    lastPaint = now;
    for (const d of desks) {
      const s = d.owner?.session;
      const key = s ? (s.status === 'idle' ? 'away' : 'live') : 'off';
      if (key === 'off' && d.painted === 'off') continue;
      if (!s) drawOff(d.scr);
      else if (s.status === 'idle') drawAway(d.scr, s, d.owner.color);
      else drawSession(d.scr, s, d.owner.color);
      d.painted = key;
      d.scr.mesh.userData.sessionId = d.codeScr.mesh.userData.sessionId = s?.sessionId;
      d.scr.mesh.userData.screen = d.codeScr.mesh.userData.screen = true;
      d.scr.tex.needsUpdate = true;
      paintCode(d, now, true);
    }
    for (const p of people.values()) if (p.session && !p.leaving) p.setLabel(p.session);
    drawUsage(usageScr, S); usageScr.tex.needsUpdate = true;
    drawRoster(rosterScr, S); rosterScr.tex.needsUpdate = true;
    drawWall(wallTV, S); wallTV.tex.needsUpdate = true;
    if (tokenRoll.target !== S.totals.todayTokens) Object.assign(tokenRoll, { from: tokenRoll.shown ?? S.totals.todayTokens, target: S.totals.todayTokens, at: performance.now() });
    drawFeed(feedTV, S); feedTV.tex.needsUpdate = true;
    if (breakBoard.list) breakBoard.dirty = true;
  }
  // Typing animation: a new edit is revealed over 1.5-9 s (faster for big edits); already-seen edits show in full.
  function paintCode(d, now, force) {
    const s = d.owner?.session;
    if (!s || s.status === 'idle') {
      if (d.codePainted !== 'off') { drawOff(d.codeScr); d.codeScr.tex.needsUpdate = true; d.codePainted = 'off'; }
      return;
    }
    const code = s.code, id = code?.id || 'none';
    if (d.codeId !== id) {
      const fresh = d.codeId !== undefined && code;
      d.codeId = id;
      d.codeAnim = fresh ? { start: now, dur: clamp(code.added.length / 0.09, 1500, 9000) } : null;
    }
    const a = d.codeAnim, typing = a && now - a.start < a.dur, recent = a && now - a.start < a.dur + 4000;
    if (!force && !recent) return;
    if (!force && now - (d.codeDrawn || 0) < (typing ? 70 : 500)) return;
    d.codeDrawn = now;
    const len = code ? code.added.length : 0;
    const shown = typing ? Math.max(1, Math.floor(len * ease(clamp((now - a.start) / a.dur, 0, 1)))) : len;
    drawCode(d.codeScr, s, d.owner.color, shown, recent ? Math.floor(now / 450) % 2 === 0 : null);
    d.codeScr.tex.needsUpdate = true;
    d.codePainted = 'code';
  }

  dash.onUpdate(sync);

  // ----- player -----
  const player = { x: OWNER.x, z: OWNER.z + 1.45, eye: SEATED_EYE, yaw: 0, pitch: 0, seated: true };
  const keys = new Set();
  let locked = false, active = false, mode = 'idle', anim = null;

  // Square-on to whichever screen holds the page (the monitor, or the open MacBook), filling the view.
  const lapAt = new THREE.Vector3(), lapN = new THREE.Vector3();
  function fillPose() {
    if (!laptop.shown) {
      const d = (center.h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      return { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z + d, yaw: 0, pitch: 0 };
    }
    // Close enough that the lid's screen covers the whole view, whatever the window's shape.
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max((lapScr.h / 2) / tv, (lapScr.w / 2) / (tv * camera.aspect));
    lapScreen();
    return { x: lapAt.x + lapN.x * d, y: lapAt.y + lapN.y * d, z: lapAt.z + lapN.z * d, yaw: Math.atan2(lapN.x, lapN.z), pitch: Math.asin(-lapN.y) };
  }
  function seatedPose() {
    if (laptop.shown) {
      const st = laptop.seat, y = st.eye;
      lapScreen();
      return { x: st.x, y, z: st.z, yaw: Math.atan2(st.x - lapAt.x, st.z - lapAt.z), pitch: Math.atan2(lapAt.y - y, Math.hypot(lapAt.x - st.x, lapAt.z - st.z)), seat: st };
    }
    const x = OWNER.x, z = OWNER.z + 1.45, y = SEATED_EYE;
    return { x, y, z, yaw: 0, pitch: Math.atan2(screenWorld.y - y, z - screenWorld.z) };
  }
  function lapScreen() {
    hole.updateWorldMatrix(true, false);
    hole.getWorldPosition(lapAt);
    lapN.set(0, 0, 1).transformDirection(hole.matrixWorld);
  }
  // Clicking the MacBook sits you in the nearer free armchair (or the one you're in) and opens it toward you; it shuts when
  // you get up. Once the screen's awake, clicking it again flies into your desktop like the office computer.
  function openLaptop() {
    const L = laptop;
    if (L.open) { if (L.shown) { document.exitPointerLock(); dash.setView('desktop'); } return; }
    const near = (st) => Math.hypot(st.x - player.x, st.z - player.z);
    const st = L.seats.includes(player.seat) ? player.seat : L.seats.filter((q) => !seatTaken(q)).sort((a, b) => near(a) - near(b))[0];
    if (!st) return;
    sitIn(st);
    if (player.seat !== st) return;
    Object.assign(L, { seat: st, open: true });
    player.pitch = Math.atan2(0.52 - st.eye, 0.9);
  }
  function laptopFx(dt) {
    const L = laptop, p = L.poseFor(L.seat);
    if (L.open && mode === 'free' && player.seat !== L.seat) L.open = false;
    L.g.position.x = damp(L.g.position.x, p.x, 8, dt); L.g.position.z = damp(L.g.position.z, p.z, 8, dt);
    L.g.rotation.y += angDiff(L.g.rotation.y, p.r) * Math.min(1, dt * 8);
    L.k = L.open ? Math.min(1, L.k + dt / 0.8) : Math.max(0, L.k - dt / 0.8);
    L.pivot.rotation.x = lerp(Math.PI / 2, -0.38, ease(L.k));
    // The screen wakes partway up and goes dark the moment you stand.
    const shown = L.open && L.k > 0.55;
    if (shown !== L.shown) { L.shown = shown; placeHole(); }
    L.light.intensity = shown ? 0.04 + 0.08 * (1 - daylight) : 0;   // a faint spill on the keys, not a lamp
    L.deckM.emissiveIntensity = ease(L.k) * (1 - daylight) * 0.3;
  }
  function setCam(p) { camera.position.set(p.x, p.y, p.z); camera.rotation.set(p.pitch, p.yaw, 0); }
  function camPose() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x }; }
  function tween(from, to, ms, done) {
    anim = { from, to, ms: REDUCED ? 1 : ms, start: performance.now(), done };
  }
  function stepTween(now) {
    if (!anim) return;
    const u = clamp((now - anim.start) / anim.ms, 0, 1), e = ease(u), { from: a, to: b } = anim;
    setCam({ x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), yaw: a.yaw + angDiff(a.yaw, b.yaw) * e, pitch: lerp(a.pitch, b.pitch, e) });
    if (u >= 1) { const d = anim.done; anim = null; d?.(); }
  }
  function teleport(x, z, look, seated = false) {
    Object.assign(player, { x, z, seated, seat: null, eye: seated ? SEATED_EYE : EYE });
    player.yaw = Math.atan2(-(look.x - x), -(look.z - z));
    player.pitch = Math.atan2((look.y ?? EYE) - player.eye, Math.hypot(look.x - x, look.z - z));
  }

  function collide(p, r = 0.3) {
    if (p === player && carCollide(p)) return;
    for (const b of away ? away.colliders : colliders) {
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
      else {
        const pen = [[p.x - b.minX, -1, 0], [b.maxX - p.x, 1, 0], [p.z - b.minZ, 0, -1], [b.maxZ - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        if (pen[1]) p.x = pen[1] < 0 ? b.minX - r : b.maxX + r; else p.z = pen[2] < 0 ? b.minZ - r : b.maxZ + r;
      }
    }
    if (away) { away.bound(p); return; }
    p.x = clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
    p.z = clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
  }

  const seatTaken = (st) => !st.floor && [...people.values()].some((p) => Math.hypot(p.root.position.x - st.x, p.root.position.z - st.z) < 0.4);
  function sitIn(st) {
    if (seatTaken(st)) return;
    Object.assign(player, { x: st.x, z: st.z, seated: true, seat: st, eye: player.eye });
    player.yaw = st.rotY + Math.PI; player.pitch = -0.08;
  }
  function movePlayer(dt) {
    if (away?.fly) { flyPlayer(dt); return; }
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    if (f || s) {
      // Stand up: step forward out of the chair (or back from your own desk, which has no seat entry).
      if (player.seated) {
        const st = player.seat;
        if (st) { player.x += Math.sin(st.rotY) * 0.55; player.z += Math.cos(st.rotY) * 0.55; } else player.z += 0.25;
        player.seated = false; player.seat = null;
      }
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 4.4) * dt, n = Math.hypot(f, s);
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      player.x += ((-sy * f + cy * s) / n) * speed;
      player.z += ((-cy * f - sy * s) / n) * speed;
      collide(player);
    }
    player.eye = damp(player.eye, player.seated ? player.seat?.eye ?? SEATED_EYE : EYE, 5, dt);
    const bob = (f || s) && !player.seated ? Math.sin(performance.now() / 140) * 0.025 : 0;
    player.fy = damp(player.fy || 0, away?.ground?.(player.x, player.z) || 0, 14, dt);   // up steps (the gateway's plinth)
    setCam({ x: player.x, y: player.eye + bob + (away?.y || 0) + player.fy, z: player.z, yaw: player.yaw, pitch: player.pitch });
  }

  // ----- input -----
  renderer.domElement.addEventListener('click', (e) => {
    sfx.unlock();
    if (mode === 'chat') { closeChat(true); return; }
    if (mode !== 'free') return;
    if (!locked) { renderer.domElement.requestPointerLock(); return; }
    if (!hover) return;
    const a = hover.action && ctx.actionOf(hover.action);
    if (a?.click) a.click(hover, e);
    else if (hover.sessionId && hover.screen) { document.exitPointerLock(); dash.openDrawer(hover.sessionId); }
    else if (hover.sessionId) openChat(hover.sessionId);
    else if (hover.seat) sitIn(hover.seat);
    else if (hover.tv) {
      if (hover.tv.cfg && !e.shiftKey) useTv(hover.tv);
      else { document.exitPointerLock(); openTvPanel(hover.tv); }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    hud.classList.toggle('of-locked', locked);
    if (!locked) keys.clear();
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked || mode !== 'free') return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.4, 1.4);
  });
  const TELEPORTS = {
    Digit1: () => teleport(-2.5, 0.8, { x: -9, y: 1.0, z: -9 }),
    Digit2: () => teleport(-6.5, 2.2, { x: -13, y: 1.0, z: 8 }),
    Digit3: () => { const p = seatedPose(); teleport(p.x, p.z, { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z }, true); },
    Digit4: () => teleport(14.6, 0.6, { x: LIFT.x, y: 1.6, z: LIFT.z }),
    Digit5: () => teleport(12.4, 1.4, { x: 17, y: 1.2, z: 6.5 }),
  };
  document.addEventListener('keydown', (e) => {
    if (!active || mode !== 'free' || e.metaKey || e.ctrlKey || e.target.closest?.('input, select, textarea')) return;
    if (ctx.onKey(e)) return;
    if (locked) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  for (const k of Object.keys(TELEPORTS)) ctx.key(k, (e) => { if (away || (mine.L?.state === 'travel' && inMyCar())) toast('Take the lift back to the office'); else TELEPORTS[e.code](); return true; });
  ctx.key('KeyG', () => { setQuality(!hq); return true; });
  ctx.key('KeyH', () => { setOverlays(!overlays); return true; });
  ctx.key('KeyM', () => { dash.setSound({ on: !dash.sound.on }); sfx.unlock(); toast(`Sounds ${dash.sound.on ? 'on' : 'off'} · <kbd>M</kbd> to ${dash.sound.on ? 'mute' : 'unmute'}`); return true; });
  ctx.key('KeyT', () => { setSpeed(SPEEDS[(SPEEDS.indexOf(clockState.speed) + 1) % SPEEDS.length]); return true; });
  ctx.key('KeyE', () => { if (!hover?.tv) return false; document.exitPointerLock(); openTvPanel(hover.tv); return true; });
  ctx.key('KeyE', () => { if (!hover?.sessionId) return false; document.exitPointerLock(); dash.openDrawer(hover.sessionId); return true; });

  // ----- using a TV -----
  // Clicking a TV frames it square-on and frees the mouse: the cursor maps onto the page through the screen's UVs, and keys
  // go to the page until Esc. The bar below has back/forward/reload/home, the address, and the TV's volume.
  const tvBar = hud.querySelector('.of-tvbar'), tvUrl = tvBar.querySelector('input[name=u]'), tvVol = tvBar.querySelector('input[type=range]');
  const tvMuteBtn = tvBar.querySelector('[data-act=mute]'), osdEl = hud.querySelector('.of-osd');
  const BTN = ['left', 'middle', 'right'];
  const mods = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  function useTv(t) {
    if (!t?.cfg || !active) return;
    if (document.pointerLockElement) document.exitPointerLock();
    using = t; mode = 'tv'; keys.clear(); t.dirty = true;
    hud.classList.add('of-using');
    tvBarSync();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max(t.h / 2 / half / 0.82, t.w / 2 / (half * camera.aspect) / 0.92);
    tween(camPose(), { x: t.center.x + t.normal.x * d, y: t.center.y, z: t.center.z + t.normal.z * d, yaw: Math.atan2(t.normal.x, t.normal.z), pitch: 0 }, 700);
  }
  function leaveTv(relock) {
    if (!using) return;
    using.dirty = true; using = null;
    hud.classList.remove('of-using');
    tvUrl.blur();
    if (mode !== 'tv') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600, () => { if (mode === 'tv') mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function tvBarSync() {
    if (!using) return;
    const c = using.cfg;
    if (document.activeElement !== tvUrl) tvUrl.value = using.page?.url || c.url;
    if (document.activeElement !== tvVol) tvVol.value = c.volume;
    tvMuteBtn.textContent = c.muted ? '🔇' : c.volume ? '🔊' : '🔈';
    tvMuteBtn.title = `${c.muted ? 'Unmute' : 'Mute'} (${ALT}M)`;
    hud.querySelector('.of-tvname').textContent = using.name;
  }
  let osdT = 0;
  function tvVolume(patch) {
    const c = { ...using.cfg, ...patch };
    dash.patchTv(using.id, patch);
    osdEl.textContent = c.muted ? '🔇  Muted' : `${c.volume ? '🔊' : '🔈'}  ${c.volume}%`;
    osdEl.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(() => osdEl.classList.remove('on'), 1100);
  }
  const volStep = (d) => tvVolume({ volume: clamp(using.cfg.volume + d, 0, 100), muted: false });
  tvBar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !using) return;
    if (b.dataset.nav) tvSend({ t: 'nav', id: using.id, act: b.dataset.nav });
    else if (b.dataset.act === 'mute') tvVolume({ muted: !using.cfg.muted });
    else if (b.dataset.act === 'setup') openTvPanel(using);
    else if (b.dataset.act === 'leave') leaveTv(true);
    b.blur();
  });
  tvVol.addEventListener('input', () => using && tvVolume({ volume: +tvVol.value, muted: false }));
  tvVol.addEventListener('change', () => tvVol.blur());
  tvBar.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (using && tvUrl.value.trim()) tvSend({ t: 'nav', id: using.id, act: 'go', url: dash.normUrl(tvUrl.value) });
    tvUrl.blur();
  });
  tvUrl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); tvUrl.blur(); tvBarSync(); } });

  const tvRay = new THREE.Raycaster(), tvNdc = new THREE.Vector2();
  let tvMove = null;   // latest mousemove, sent once per frame
  function tvMouse(e, type, extra) {
    if (mode !== 'tv' || !using || anim) return;
    const r = renderer.domElement.getBoundingClientRect();
    tvNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    tvRay.setFromCamera(tvNdc, camera);
    const hit = tvRay.intersectObject(using.scr.mesh)[0];
    if (!hit) return;
    const press = type === 'mousePressed' || type === 'mouseReleased';
    tvSend({ t: 'mouse', id: using.id, type, x: hit.uv.x, y: 1 - hit.uv.y, button: press ? BTN[e.button] || 'none' : e.buttons & 1 ? 'left' : 'none',
      buttons: e.buttons, clickCount: press ? e.detail || 1 : 0, mods: mods(e), ...extra });
  }
  const gl = renderer.domElement;
  gl.addEventListener('mousemove', (e) => { if (mode === 'tv') tvMove = e; });
  gl.addEventListener('mousedown', (e) => { document.activeElement?.blur?.(); tvMouse(e, 'mousePressed'); });
  gl.addEventListener('mouseup', (e) => tvMouse(e, 'mouseReleased'));
  gl.addEventListener('contextmenu', (e) => { if (mode === 'tv') e.preventDefault(); });
  gl.addEventListener('wheel', (e) => {
    if (mode !== 'tv' || !using) return;
    e.preventDefault();
    if (e.altKey) return volStep(e.deltaY < 0 ? 5 : -5);
    const k = [1, 40, 720][e.deltaMode] || 1;
    tvMouse(e, 'mouseWheel', { dx: e.deltaX * k, dy: e.deltaY * k });
  }, { passive: false });
  // ⌘A/C/X/Z need explicit editing commands on a Mac; ⌘V is sent as text from the paste event; other ⌘ shortcuts stay the dashboard's.
  const CMDS = { KeyA: 'selectAll', KeyC: 'copy', KeyX: 'cut', KeyZ: 'undo' };
  const VOL_KEYS = { KeyM: () => tvVolume({ muted: !using.cfg.muted }), Minus: () => volStep(-10), Equal: () => volStep(10) };
  function tvKey(e) {
    if (mode !== 'tv' || !using || e.target.closest?.('input, select, textarea, #drawer')) return;
    const down = e.type === 'keydown';
    if (e.code === 'Escape') { if (down) { e.preventDefault(); leaveTv(); } return; }
    if (e.altKey && !e.metaKey && !e.ctrlKey && VOL_KEYS[e.code]) { e.preventDefault(); if (down) VOL_KEYS[e.code](); return; }
    if ((e.metaKey || (e.ctrlKey && !IS_MAC)) && e.code === 'KeyV') return;
    if (e.metaKey && !CMDS[e.code] && e.key !== 'Meta') return;
    e.preventDefault();
    const text = !down ? '' : e.key === 'Enter' ? '\r' : e.key.length === 1 && !e.ctrlKey && !e.metaKey ? e.key : '';
    tvSend({ t: 'key', id: using.id, type: !down ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown', key: e.key, code: e.code, keyCode: e.keyCode, text,
      mods: mods(e), loc: e.location, cmd: down && e.metaKey ? CMDS[e.code] : undefined });
  }
  document.addEventListener('keydown', tvKey);
  document.addEventListener('keyup', tvKey);
  document.addEventListener('paste', (e) => {
    if (mode !== 'tv' || !using || e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    tvSend({ t: 'text', id: using.id, text: e.clipboardData.getData('text') });
  });

  // ----- drawing on a whiteboard -----
  // Clicking a board frames it square-on and frees the mouse (or pen): the pointer draws through the board's UVs into its ink
  // layer, which is saved to localStorage shortly after each change. Esc (or Done) goes back to walking.
  const wbBar = hud.querySelector('.of-wbbar'), wbIn = hud.querySelector('.of-wbtext'), WB_SIZES = { S: 4, M: 8, L: 15 };
  const wb = { b: null, tool: 'pen', color: WB_COLORS[0], size: 'M', stroke: null, text: null, saveT: 0 };
  const wbRay = new THREE.Raycaster(), wbNdc = new THREE.Vector2(), wbV = new THREE.Vector3(), wbQ = new THREE.Quaternion();
  function useBoard(b) {
    if (!b || !active || mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    wb.b = b; mode = 'board'; keys.clear();
    if (wb.tool === 'text') wb.tool = 'pen';
    hud.classList.add('of-boarding');
    hud.querySelector('.of-wbname').textContent = b.name;
    wbSync();
    const m = b.scr.mesh, c = m.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(wbQ));
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max(b.h / 2 / half / 0.72, b.w / 2 / (half * camera.aspect) / 0.84);
    tween(camPose(), { x: c.x + n.x * d, y: c.y, z: c.z + n.z * d, yaw: Math.atan2(n.x, n.z), pitch: 0 }, 700);
  }
  function leaveBoard(relock) {
    if (!wb.b) return;
    wbText(false); wbEnd(); wbSave(true);
    wb.b = null;
    hud.classList.remove('of-boarding');
    gl.style.cursor = '';
    if (mode !== 'board') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600, () => { if (mode === 'board') mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function wbSync() {
    const b = wb.b;
    if (!b) return;
    for (const el of wbBar.querySelectorAll('button')) {
      const { c, t, s: sz, a } = el.dataset;
      if (c || t || sz) el.setAttribute('aria-pressed', String(c ? c === wb.color && wb.tool !== 'eraser' : t ? t === wb.tool : sz === wb.size));
      if (a === 'undo') el.disabled = !b.undo.length;
      if (a === 'redo') el.disabled = !b.redo.length;
      if (a === 'list') { el.hidden = !b.live; el.setAttribute('aria-pressed', String(b.list)); }
      if (a === 'reset') el.hidden = !b.draw;
    }
    gl.style.cursor = wb.tool === 'text' ? 'text' : wb.tool === 'eraser' ? 'cell' : 'crosshair';
  }
  // Pointer to board canvas pixels, or null off the board.
  function wbAt(e) {
    const r = gl.getBoundingClientRect();
    wbNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    wbRay.setFromCamera(wbNdc, camera);
    const hit = wbRay.intersectObject(wb.b.scr.mesh)[0];
    return hit ? { x: hit.uv.x * wb.b.scr.W, y: (1 - hit.uv.y) * wb.b.scr.H } : null;
  }
  const wbK = (b) => b.scr.W / b.w / 430;   // line widths are tuned for ~430 px per metre of board
  function wbPush() {
    const b = wb.b;
    b.undo.push(b.ictx.getImageData(0, 0, b.ink.width, b.ink.height));
    if (b.undo.length > 20) b.undo.shift();
    b.redo.length = 0;
    wbSync();
  }
  function wbLine(a, z, pressure) {
    const b = wb.b, c = b.ictx, er = wb.tool === 'eraser';
    c.save();
    c.globalCompositeOperation = er ? 'destination-out' : 'source-over';
    c.strokeStyle = wb.color; c.lineCap = c.lineJoin = 'round';
    c.lineWidth = WB_SIZES[wb.size] * wbK(b) * (er ? 5 : 1) * (pressure > 0 && pressure !== 0.5 ? 0.5 + pressure : 1);   // pens: pressure; mice report 0.5
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(z.x + 0.01, z.y); c.stroke();
    c.restore();
    b.dirty = true;
  }
  function wbEnd() {
    if (!wb.stroke) return;
    wb.stroke = null;
    wbSave();
  }
  function wbSave(now) {
    clearTimeout(wb.saveT);
    const b = wb.b;
    if (!b) return;
    const save = () => {
      try { localStorage[`officeBoard:${b.id}`] = b.ink.toDataURL('image/png'); }
      catch { toast("Couldn't save the whiteboard: browser storage is full"); }
    };
    if (now) save(); else wb.saveT = setTimeout(save, 400);
  }
  function wbHistory(from, to) {
    const b = wb.b;
    if (!b || !from.length) return;
    to.push(b.ictx.getImageData(0, 0, b.ink.width, b.ink.height));
    b.ictx.putImageData(from.pop(), 0, 0);
    b.dirty = true; wbSave(); wbSync();
  }
  // Text: an input floats where you clicked, at the size it'll be on the board; Enter (or clicking elsewhere) writes it.
  function wbText(open, e, at) {
    if (wb.text) {
      const t = wb.text, v = wbIn.value.trim();
      wb.text = null; wbIn.style.display = 'none';
      if (v && t.b === wb.b) {
        wbPush();
        const c = t.b.ictx;
        c.font = `400 ${t.px}px ${MARKER}`; c.fillStyle = t.color; c.fillText(v, t.x, t.y);
        t.b.dirty = true; wbSave();
      }
    }
    if (!open) return;
    const b = wb.b, px = (18 + WB_SIZES[wb.size] * 3) * wbK(b) * 1.4;
    // Board pixels to screen pixels, from the board's projected height.
    const m = b.scr.mesh, r = gl.getBoundingClientRect(), hr = hud.getBoundingClientRect();
    const top = m.localToWorld(wbV.set(0, b.h / 2, 0)).project(camera).y, bot = m.localToWorld(wbV.set(0, -b.h / 2, 0)).project(camera).y;
    const scale = ((top - bot) / 2 * r.height) / b.scr.H, fs = px * scale;
    wb.text = { b, x: at.x, y: at.y, px, color: wb.color };
    Object.assign(wbIn.style, { display: 'block', left: `${e.clientX - hr.left}px`, top: `${e.clientY - hr.top - fs * 0.95}px`, fontSize: `${fs}px`, color: wb.color });
    wbIn.value = '';
    setTimeout(() => wbIn.focus());
  }
  wbIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); wbText(false); }
    if (e.key === 'Escape') { e.preventDefault(); wbIn.value = ''; wbText(false); }
  });
  wbIn.addEventListener('blur', () => setTimeout(() => { if (wb.text && document.activeElement !== wbIn) wbText(false); }, 0));
  gl.addEventListener('pointerdown', (e) => {
    if (mode !== 'board' || !wb.b || anim || e.button !== 0) return;
    const p = wbAt(e);
    if (wb.tool === 'text') { if (p) { e.preventDefault(); wbText(true, e, p); } else wbText(false); return; }
    if (!p) return;
    wbText(false); wbPush();
    wb.stroke = { last: p };
    gl.setPointerCapture(e.pointerId);
    wbLine(p, p, e.pressure);
  });
  gl.addEventListener('pointermove', (e) => {
    if (!wb.stroke || mode !== 'board') return;
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const p = wbAt(ev);
      if (p) { wbLine(wb.stroke.last || p, p, ev.pressure); }
      wb.stroke.last = p;   // off the board breaks the line
    }
  });
  gl.addEventListener('pointerup', wbEnd);
  gl.addEventListener('pointercancel', wbEnd);
  wbBar.addEventListener('click', (e) => {
    const el = e.target.closest('button'), b = wb.b;
    if (!el || !b) return;
    const { c, t, s: sz, a } = el.dataset;
    if (c) { wb.color = c; if (wb.tool === 'eraser') wb.tool = 'pen'; }
    if (t) wb.tool = t;
    if (sz) wb.size = sz;
    if (a === 'undo') wbHistory(b.undo, b.redo);
    if (a === 'redo') wbHistory(b.redo, b.undo);
    if (a === 'wipe' || a === 'reset') { wbPush(); a === 'wipe' ? b.ictx.clearRect(0, 0, b.ink.width, b.ink.height) : inkDefault(b); b.dirty = true; wbSave(); }
    if (a === 'list') { b.list = !b.list; localStorage[`officeBoardList:${b.id}`] = b.list ? 'on' : 'off'; b.dirty = true; }
    if (a === 'leave') { leaveBoard(true); return; }
    wbSync();
    el.blur();
  });
  document.addEventListener('keydown', (e) => {
    if (mode !== 'board' || !wb.b || e.target.closest?.('input, select, textarea, #drawer')) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (e.code === 'Escape') { e.preventDefault(); leaveBoard(); return; }
    if (cmd && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.shiftKey || e.code === 'KeyY' ? wbHistory(wb.b.redo, wb.b.undo) : wbHistory(wb.b.undo, wb.b.redo); return; }
    if (cmd || e.altKey) return;
    const tool = { KeyP: 'pen', KeyB: 'pen', KeyE: 'eraser', KeyT: 'text' }[e.code], n = /^Digit([1-6])$/.exec(e.code);
    if (tool) wb.tool = tool;
    else if (n) { wb.color = WB_COLORS[n[1] - 1]; if (wb.tool === 'eraser') wb.tool = 'pen'; }
    else return;
    e.preventDefault(); wbSync();
  });

  // ----- talking to a session -----
  // Clicking a person opens their conversation (right) and a message bar (bottom); keys go to the bar until Esc. The log,
  // polling and sending are shared with the desktop's Messages app (chat.js).
  const chatEl = hud.querySelector('.of-chat'), chatLog = chatEl.querySelector('.of-chatlog'), chatBar = hud.querySelector('.of-chatbar');
  const chatIn = chatBar.querySelector('textarea');
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
  { const b = makeCanvas(128, 96), c = b.ctx;
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(8, 6, 112, 64, 22); c.moveTo(40, 68); c.lineTo(30, 92); c.lineTo(62, 68); c.fill();
    c.fillStyle = '#3987e5'; for (const x of [40, 64, 88]) { c.beginPath(); c.arc(x, 38, 8, 0, Math.PI * 2); c.fill(); }
    bubble.material.map = b.tex; bubble.scale.set(0.42, 0.315, 1); bubble.visible = false; bubble.layers.set(1); }
  let bubbleT = 0;
  const talk = chatView({ log: chatLog, input: chatIn, send: chatBar.querySelector('button'), status: chatBar.querySelector('.st'), keys: ' · <kbd>Esc</kbd> back',
    onUpdate: renderChatHead,
    onSent(id) {
      const p = people.get(id);
      if (p) { p.root.add(bubble); bubble.position.y = 2.5; bubble.visible = true; clearTimeout(bubbleT); bubbleT = setTimeout(() => (bubble.visible = false), 4000); }
    } });
  function openChat(id) {
    if (!CAN_CHAT) { dash.openDrawer(id); return; }
    if (mode !== 'free' && mode !== 'chat') return;
    if (document.pointerLockElement) document.exitPointerLock();
    mode = 'chat'; keys.clear();
    hud.classList.add('of-chatting');
    const p = people.get(id);
    if (p) p.lookAt = camera.position;
    talk.open(id);
    renderChatHead();
    setTimeout(() => chatIn.focus());
  }
  function closeChat(relock) {
    if (johnChat.open) { closeJohn(relock); return; }
    if (!talk.id) return;
    const p = people.get(talk.id);
    if (p) p.lookAt = null;
    talk.close();
    hud.classList.remove('of-chatting');
    if (mode === 'chat') mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function renderChatHead() {
    const s = S?.live.find((x) => x.sessionId === talk.id), st = s ? statusOf(s) : { text: 'ENDED', color: '#9a9890' };
    chatEl.querySelector('i').style.background = dash.colorHex(talk.id);
    chatEl.querySelector('b').textContent = s ? titleOf(s) : 'Session ended';
    const sm = chatEl.querySelector('small');
    sm.textContent = s ? `${st.text}${s.status === 'idle' ? ` · ${F.dur(Date.now() - s.statusSince)}` : ''} · ${s.name}` : '';
    sm.style.color = st.color;
  }
  chatEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.act === 'details') dash.openDrawer(talk.id);
    else if (b?.dataset.act === 'close') closeChat();
  });
  // ----- talking to John (the server hall) -----
  // The same panel and bar, cloned: John isn't a session, so his messages go to POST /api/john (claude -p on the server,
  // with a snapshot of the machine and sessions) and live only here. A bubble over his head while he thinks.
  const johnEl = chatEl.cloneNode(true), johnBar = chatBar.cloneNode(true);
  johnEl.classList.add('of-john'); johnBar.classList.add('of-john'); hud.append(johnEl, johnBar);
  johnEl.querySelector('[data-act=details]').remove();
  johnEl.querySelector('i').style.background = '#7a2e2a';
  johnEl.querySelector('b').textContent = 'John';
  johnEl.querySelector('small').textContent = 'Sysadmin · Server hall, floor 47';
  const johnLog = johnEl.querySelector('.of-chatlog'), johnIn = johnBar.querySelector('textarea'), johnSt = johnBar.querySelector('.st');
  johnIn.maxLength = 600; johnIn.placeholder = 'Ask John about the servers';
  const johnChat = { open: false, busy: false, msgs: [{ role: 'john', text: 'Alright? Pull up a chair. What d’you want to know about the boxes?' }], note: null };
  function renderJohn() {
    johnLog.innerHTML = johnChat.msgs.map((m) => (m.role === 'user' ? `<div class="u">${escapeHtml(m.text)}</div>` : `<div class="${m.lunch || m.error ? 'n' : 'a'}">${escapeHtml(m.text)}</div>`)).join('')
      + (johnChat.busy ? '<div class="n typing">John is typing</div>' : '');
    johnLog.scrollTop = johnLog.scrollHeight;
    johnSt.className = 'st' + (johnChat.note ? ' bad' : '');
    johnSt.innerHTML = johnChat.note ? escapeHtml(johnChat.note) : 'He reads the live stats, nothing else · <kbd>Enter</kbd> send · <kbd>Esc</kbd> back';
    johnIn.disabled = johnBar.querySelector('button').disabled = johnChat.busy;
  }
  async function askJohn() {
    const text = johnIn.value.trim();
    if (!text || johnChat.busy) return;
    const history = johnChat.msgs.filter((m) => !m.lunch && !m.error).slice(-10).map(({ role, text }) => ({ role, text }));
    johnChat.msgs.push({ role: 'user', text }); johnIn.value = ''; johnIn.style.height = '';
    johnChat.busy = true; johnChat.note = null; renderJohn();
    srv.john.root.add(bubble); bubble.position.y = 2.0; bubble.visible = true;
    const r = await fetch('/api/john', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history }) })
      .then((x) => x.json()).catch((e) => ({ error: e.message }));
    johnChat.busy = false; bubble.visible = false;
    if (r.reply) johnChat.msgs.push({ role: 'john', text: r.reply, lunch: r.lunch, error: r.error });
    else { johnChat.note = `John didn’t hear you: ${r.error || 'no answer'}`; johnChat.msgs.pop(); johnIn.value = text; }
    renderJohn();
    if (johnChat.open) johnIn.focus();
  }
  function openJohn() {
    if (!CAN_CHAT) { toast('John only talks to people on this computer'); return; }
    if (mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    mode = 'chat'; keys.clear(); johnChat.open = true;
    hud.classList.add('of-johnning');
    renderJohn();
    setTimeout(() => johnIn.focus());
  }
  function closeJohn(relock) {
    johnChat.open = false;
    hud.classList.remove('of-johnning');
    johnIn.blur();
    if (mode === 'chat') mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();
  }
  johnEl.addEventListener('click', (e) => { if (e.target.closest('button')?.dataset.act === 'close') closeJohn(); });
  johnBar.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); askJohn(); });
  johnIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askJohn(); } });
  johnIn.addEventListener('input', () => { johnIn.style.height = ''; johnIn.style.height = Math.min(johnIn.scrollHeight + 2, innerHeight * 0.3) + 'px'; });
  document.addEventListener('keydown', (e) => {
    if (!johnChat.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeJohn(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest?.('input, select, textarea') && !johnIn.disabled) johnIn.focus();
  }, true);

  // Esc closes the chat (or just the drawer, if Details is open); typing anywhere goes to the message bar.
  document.addEventListener('keydown', (e) => {
    if (!talk.id || document.body.classList.contains('drawer')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChat(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest?.('input, select, textarea') && !chatIn.disabled) chatIn.focus();
  }, true);

  // ----- hover / inspect -----
  const ray = new THREE.Raycaster();
  ray.far = 14;
  ray.camera = camera;
  let hover = null;
  function updateHover() {
    hover = null;
    if (locked && mode === 'free') {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const targets = away ? [...away.hits] : ctx.collectTargets([]);
      for (const st of seats) if ((st.floor || 48) === (away?.n ?? 48) && st.obj !== player.seat?.obj && Math.hypot(st.x - player.x, st.z - player.z) < 4) targets.push(st.obj);
      hover = away?.pick?.(ray) || null;   // a floor can find what you're looking at itself (inside a repo)
      if (!hover) for (const hit of ray.intersectObjects(targets, true)) {
        const ud = hit.object.userData;
        if (ud.reach && hit.distance > ud.reach) { if (ud.glass || hit.object.material.transparent) continue; break; }
        if (ud.action) { hover = { action: ud.action, door: ud.door, board: ud.board, blind: ud.blind || ud.blindAt?.(hit.point), floor: ud.floorAt?.(hit.uv), key: ud.keyAt?.(hit.uv), drawer: ud.drawerAt?.(hit.point), folder: ud.folderAt?.(hit.instanceId), info: ud.info }; break; }
        if (ud.tv) { hover = { tv: tvs.find((t) => t.id === ud.tv) }; break; }
        if (ud.sessionId) { hover = { sessionId: ud.sessionId, screen: !!ud.screen }; break; }
        if ((ud.seat || ud.seatAt) && hit.distance < 3) { hover = { seat: ud.seat || ud.seatAt(hit.point) }; break; }
        if (hit.object.isMesh && !hit.object.isSprite) break;
      }
    }
    if (!hover) { targetEl.style.display = 'none'; return; }
    targetEl.style.display = 'block';
    const a = hover.action && ctx.actionOf(hover.action);
    if (a?.hover) { targetEl.innerHTML = a.hover(hover); return; }
    if (hover.seat) {
      const taken = seatTaken(hover.seat);
      targetEl.innerHTML = `<b>${hover.seat.name}</b><div class="k">${taken ? 'Someone’s sitting here' : 'Click to sit · move to stand up'}</div>`;
      return;
    }
    if (hover.tv) {
      const c = hover.tv.cfg;
      targetEl.innerHTML = `<b>${escapeHtml(hover.tv.name)} TV</b><div class="m">${c ? escapeHtml(hostOf(c.url)) : 'Off'}</div>
        <div class="k">${c ? 'Click to use it · E (or Shift+click) to set it up' : 'Click to choose what it shows'}</div>`;
      return;
    }
    const s = S?.live.find((x) => x.sessionId === hover.sessionId);
    if (!s) { targetEl.style.display = 'none'; return; }
    const st = statusOf(s), tr = s.transcript || {};
    const doing = s.status !== 'idle' && tr.pendingTool ? `${tr.pendingTool.name}: ${tr.pendingTool.detail || ''}` : s.status === 'idle' ? `idle for ${F.dur(Date.now() - s.statusSince)}` : 'thinking';
    targetEl.innerHTML = `<b>${escapeHtml(titleOf(s))}</b><div class="m"><span style="color:${st.color}">${st.text}</span> · ${F.usd(s.cost)}${s.statusline?.context ? ` · ${s.statusline.context.used_percentage}% context` : ''}</div>
      <div class="m">${escapeHtml(doing.slice(0, 90))}</div><div class="k">${escapeHtml(s.name)} · ${CAN_CHAT && !hover.screen ? 'click to talk · E for details' : 'click for full details'}</div>`;
  }

  // The click actions: what each does, and what its hover card says.
  const machineHover = (h) => (h.action === 'computer' && !laptop.shown ? '<b>Your computer</b><div class="k">Click to sit down and use it</div>'
    : `<b>Your MacBook</b><div class="k">${laptop.shown ? 'Click to use it' : laptop.open ? 'Waking up…' : 'Click to sit down and open it'}</div>`);
  ctx.action('computer', { hover: machineHover, click: () => { document.exitPointerLock(); dash.setView('desktop'); } });
  ctx.action('laptop', { hover: machineHover, click: () => openLaptop() });
  ctx.action('cabinet', { hover: (h) => cabinetHover(h), click: (h) => toggleDrawer(h.drawer) });
  ctx.action('folder', { hover: (h) => cabinetHover(h), click: (h) => pickUp(h.folder) });
  ctx.action('gatekey', { hover: (h) => tessHover(h), click: (h) => gatePress(h.key) });
  ctx.action('book', { hover: (h) => tessHover(h), click: (h) => readBook(h.book) });
  const liftHover = (h) => {
    const L = mine.L, f = h.floor;
    return h.action === 'liftpanel' ? `<b>${floorName(f)} · ${FLOORS.find((F) => F.n === f)?.title}</b><div class="k">${!L || L.state === 'travel' ? '' : f === Math.round(L.floor) ? 'You’re here · click to open the doors' : mine.goal === f ? 'On its way' : 'Click to go'}</div>`
      : `<b>Lift</b><div class="k">${mine.call ? 'Called · waiting for a free car' : L && (L.state === 'open' || L.state === 'opening') ? 'Doors open · walk in' : L?.state === 'travel' ? 'On its way' : 'Click to call it'}</div>`;
  };
  ctx.action('liftcall', { hover: liftHover, click: () => callLift() });
  ctx.action('liftpanel', { hover: liftHover, click: (h) => pressFloor(h.floor) });
  ctx.action('info', { hover: (h) => h.info() });
  ctx.action('john', { hover: () => `<b>John</b><div class="m">Sysadmin · ${srv.john.mood === 'sip' ? 'sipping a coffee' : srv.john.mood === 'lean' ? 'leaning back' : 'tapping away at a terminal'}</div><div class="k">${CAN_CHAT ? 'Click to talk to him' : 'He only talks to people on this computer'}</div>`,
    click: () => openJohn() });
  ctx.action('coffee', { hover: () => `<b>Coffee machine</b><div class="k">${kitchen.brewing() ? 'Brewing…' : 'Click to make a flat white'}</div>`, click: () => kitchen.brew() });
  ctx.action('blinds', { hover: (h) => `<b>${h.blind.name}</b><div class="k">Click to ${['lower the blinds', 'close the slats', 'raise the blinds'][h.blind.to * 2]}</div>`,
    click: (h) => { h.blind.to = h.blind.to === 1 ? 0 : h.blind.to + 0.5; dash.putOffice({ blinds: { [h.blind.key]: h.blind.to } }); } });
  ctx.action('door', { hover: (h) => `<b>${h.door.name}</b><div class="k">Click to ${h.door.to ? 'close' : 'open'}</div>`,
    click: (h) => { const d = h.door; d.to = d.to ? 0 : 1; if (d === door) dash.putOffice({ door: d.to }); } });
  ctx.action('board', { hover: (h) => `<b>${h.board.name[0].toUpperCase() + h.board.name.slice(1)}</b><div class="k">Click to draw on it</div>`, click: (h) => useBoard(h.board) });
  // What you can point at in the office, nearest first when it's a tie.
  ctx.hoverTargets(() => [lifts.callHit, ...lifts.map((L) => L.panel.mesh)], 10);
  ctx.hoverTargets(() => [hole], 20);
  ctx.hoverTargets(() => [laptop.g], 30);
  ctx.hoverTargets(() => [kitchen.hit], 40);
  ctx.hoverTargets(() => doors.map((d) => d.pivot), 50);
  ctx.hoverTargets(() => desks.flatMap((d) => [d.scr.mesh, d.codeScr.mesh]), 60);
  ctx.hoverTargets(() => tvs.map((t) => t.scr.mesh), 70);
  ctx.hoverTargets(() => boards.map((b) => b.scr.mesh), 80);
  ctx.hoverTargets(() => [...new Set(Object.values(blinds).flatMap((b) => b.runs.map((r) => r.slats.parent)))], 90);
  ctx.hoverTargets(() => world.children.filter((o) => o.userData.glass), 100);
  ctx.hoverTargets(() => [...people.values()].map((p) => p.root), 110);

  // ----- minimap -----
  function drawMap() {
    if (away) { away.map(); return; }
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    ctx.drawMinimap(c, sx, sz);
  }
  ctx.minimap((c, sx, sz) => {   // areas, everything solid, and their names
    c.fillStyle = 'rgba(181,138,95,.35)'; c.fillRect(sx(-19.9), sz(2.6), sx(-2) - sx(-19.9), sz(14.9) - sz(2.6));
    c.fillStyle = 'rgba(86,98,115,.55)'; c.fillRect(sx(6), sz(-15), sx(20) - sx(6), sz(-3.5) - sz(-15));
    c.fillStyle = 'rgba(120,160,185,.4)';
    for (const r of [[14, 20, 2.5, 12.5], [-1.8, 3.4, 11.2, 15]]) c.fillRect(sx(r[0]), sz(r[2]), sx(r[1]) - sx(r[0]), sz(r[3]) - sz(r[2]));
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Desks', sx(-12), sz(-0.6)); c.fillText('Breakroom', sx(-12), sz(13.6)); c.fillText(dash.officeName(), sx(9), sz(-13.4)); c.fillText('Lounge', sx(8), sz(13.6));
  }, 10);
  ctx.minimap((c, sx, sz) => {   // the lifts
    c.fillStyle = 'rgba(200,205,212,.9)';
    for (const L of lifts) c.fillRect(sx(LIFT.x) - 3, sz(L.z - DOOR.w / 2), 4, sz(L.z + DOOR.w / 2) - sz(L.z - DOOR.w / 2));
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Lifts', sx(LIFT.x) - 44, sz(-2.6));
  }, 20);
  ctx.minimap((c, sx, sz) => {   // everyone, ringed green while they work
    for (const p of people.values()) {
      if (!p.root.visible) continue;
      c.fillStyle = p.color; c.beginPath(); c.arc(sx(p.root.position.x), sz(p.root.position.z), 7, 0, Math.PI * 2); c.fill();
      if (p.session?.status === 'working') { c.strokeStyle = '#22c55e'; c.lineWidth = 3; c.stroke(); }
    }
  }, 30);
  ctx.minimap((c, sx, sz) => {   // you
    const px = sx(camera.position.x), pz = sz(camera.position.z), yaw = camera.rotation.y;
    c.save(); c.translate(px, pz); c.rotate(-yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }, 40);

  // ----- post-processing -----
  // Transparent things live on layer 1 so the AO pass and the hole's depth pre-pass ignore them.
  world.traverse((o) => { if (o.isSprite || (o.material && o.material.transparent)) o.layers.set(1); });
  camera.layers.enable(1);
  renderer.shadowMap.autoUpdate = false;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 512, 512);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => { camera.layers.disable(1); gtaoRender(...a); camera.layers.enable(1); };
  composer.addPass(gtao);
  // Screen-space light rays: radial blur of the brightest pixels toward the sun's screen position.
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2() }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength; varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec2 delta = (vUv - sunPos) / 64.0 * 0.95, uv = vUv;
        float decay = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          uv -= delta;
          vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
          acc += min(s * max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.1, 0.0), vec3(3.0)) * decay;
          decay *= 0.966;
        }
        gl_FragColor = vec4(base.rgb + acc * strength / 64.0, base.a);
      }`,
  });
  composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.55, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, amount: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, mix(1.0, 1.12, amount));
        c.rgb *= mix(1.0, mix(0.8, 1.0, smoothstep(0.95, 0.35, length(vUv - 0.5))), amount);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  let hq = localStorage.officeQuality !== 'low';
  function setQuality(on) {
    hq = on; localStorage.officeQuality = on ? 'high' : 'low';
    gtao.enabled = bloom.enabled = grade.enabled = on;
    shafts.visible = on;
  }
  setQuality(hq);
  // H hides every overlay: HUD panels, minimap, hover cards and the name tags over people. Only the crosshair stays.
  let toastTimer = 0;
  function setOverlays(on, quiet) {
    overlays = on; localStorage.officeOverlays = on ? 'on' : 'off';
    hud.classList.toggle('of-bare', !on);
    for (const p of people.values()) p.label.visible = on;
    if (!quiet) toast(`Overlays ${on ? 'shown' : 'hidden'} · <kbd>H</kbd> to ${on ? 'hide' : 'show'}`);
  }
  function toast(html) {
    const t = hud.querySelector('.of-toast');
    t.innerHTML = html;
    t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }
  setOverlays(overlays, true);
  const sunScreen = new THREE.Vector3(), camFwd = new THREE.Vector3();
  const holeScene = new THREE.Scene(), holeProxy = new THREE.Mesh(hole.geometry, holeM);
  holeProxy.matrixAutoUpdate = false;
  holeScene.add(holeProxy);
  const depthOnlyM = new THREE.MeshBasicMaterial({ colorWrite: false });
  function renderFrame() {
    camera.getWorldDirection(camFwd);
    sunScreen.copy(sunDir).multiplyScalar(500).add(camera.position).project(camera);
    rays.uniforms.sunPos.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
    rays.uniforms.strength.value = raysStrength * sstep(0.15, 0.55, camFwd.dot(sunDir)) * 1.2;
    rays.enabled = hq && rays.uniforms.strength.value > 0.01;
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    // The canvas is transparent so the dashboard can show through the hole, which means any pixel the passes leave
    // below full alpha lets the (white) page behind flash through. Force alpha to 1 everywhere first, then punch.
    renderer.setRenderTarget(null);
    const gl = renderer.getContext();
    gl.colorMask(false, false, false, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.colorMask(true, true, true, true);
    renderer.state.buffers.color.reset();   // three caches the mask and clear colour; make it resend both
    // Re-punch the dashboard hole: depth of opaque geometry, then the hole writes alpha 0 where it's visible.
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.disable(1);
    // A Color background force-clears the canvas, so drop it for the depth-only pass.
    const bg = scene.background;
    scene.background = null;
    scene.overrideMaterial = depthOnlyM;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.enable(1);
    holeProxy.matrix.copy(hole.matrixWorld);
    renderer.render(holeScene, camera);
    renderer.autoClear = true;
  }

  // ----- loop -----
  let raf = 0, lastT = performance.now();
  const clock0 = performance.now();
  // Each frame, in this order: see ctx.onFrame.
  ctx.onFrame((dt, t) => {
    for (const [id, p] of people) {
      p.update(t, dt);
      // A desk chair turns with whoever's sitting in it (spinning while they wait), and settles back when they leave it.
      const d = p.desk, seated = d && !p.path.length && p.spot?.key === d.spot.key;
      if (d) d.chair.rotation.y = seated ? p.rotY : d.chair.rotation.y + angDiff(d.chair.rotation.y, d.rotY) * Math.min(1, dt * 4);
    }
    for (const d of desks) if (!d.owner && d.chair.rotation.y !== d.rotY) d.chair.rotation.y += angDiff(d.chair.rotation.y, d.rotY) * Math.min(1, dt * 4);
  }, 10);
  ctx.onFrame((dt) => liftFx(dt), 20);
  ctx.onFrame((dt, t, now) => {
    // Roll the board's token counter up to the latest total over 1.5 s, repainting the board at ~12 fps while it moves.
    if (S && tokenRoll.shown !== tokenRoll.target && now - (tokenRoll.painted || 0) > 80) {
      const u = clamp((now - tokenRoll.at) / 1500, 0, 1);
      tokenRoll.shown = u >= 1 ? tokenRoll.target : tokenRoll.from + (tokenRoll.target - tokenRoll.from) * ease(u);
      tokenRoll.painted = now;
      drawFeed(feedTV, S); feedTV.tex.needsUpdate = true;
    }
  }, 30);
  ctx.onFrame((dt, t) => {
    // Ping pong rally when both ends are manned and settled.
    const [a, b] = pp.map((q) => q.occupant);
    const rally = a && b && !a.path.length && !b.path.length && a.spot === pp[0] && b.spot === pp[1];
    ball.visible = !!rally;
    if (rally) {
      const P = 1.05, k = (t % (2 * P)) / P, dir = k < 1, u = dir ? k : k - 1;
      const x0 = PP.x - 1.45, x1 = PP.x + 1.45;
      const z = PP.z + 0.35 * Math.sin(t * 0.9);
      ball.position.set(dir ? lerp(x0, x1, u) : lerp(x1, x0, u), 0.79 + 0.32 * Math.abs(Math.sin(u * Math.PI * 2 * 0.75 + 0.1)), z);
      a.swing = dir ? Math.max(0, 1 - u * 4) : Math.max(0, (u - 0.75) * 4);
      b.swing = dir ? Math.max(0, (u - 0.75) * 4) : Math.max(0, 1 - u * 4);
      a.root.position.z = damp(a.root.position.z, z, 4, dt); b.root.position.z = damp(b.root.position.z, z, 4, dt);
      sfx.rally(k, ball.position);
    }
  }, 40);
  ctx.onFrame((dt, t) => {
    const simDate = new Date(simNow());
    updateSky(simDate, t);
    updateClock(simDate);
    updateClocks(simDate);
  }, 50);
  ctx.onFrame((dt) => officeFx(dt), 60);
  ctx.onFrame((dt, t) => kitchen.update(dt, t), 70);
  ctx.onFrame((dt, t) => {
    if (mode === 'free') movePlayer(dt);
    if (mode === 'free' && mine.L?.state === 'travel' && inMyCar()) {   // the ride: a faint sway, strongest mid-shaft
      const k = Math.sin(Math.PI * mine.k);
      camera.position.y += Math.sin(t * 11) * 0.003 * k - 0.012 * Math.sin(Math.PI * Math.min(1, mine.k * 6));
      camera.rotation.z = Math.sin(t * 1.9) * 0.0035 * k;
    }
  }, 80);
  ctx.onFrame((dt) => laptopFx(dt), 90);
  ctx.onFrame((dt, t, now) => stepTween(now), 100);
  ctx.onFrame((dt, t) => sfx.update(t, dt, { people, door, blinds, free: mode === 'free' }), 110);
  ctx.onFrame(() => paintScreens(false), 120);
  ctx.onFrame(() => { for (const b of boards) if (b.dirty) paintBoard(b); }, 130);
  ctx.onFrame((dt, t, now) => {
    if (tvMove) { tvMouse(tvMove, 'mouseMoved'); tvMove = null; }
    if (!away) updateTVs(now);
  }, 140);
  ctx.onFrame(() => { for (const d of desks) if (d.codeAnim) paintCode(d, performance.now(), false); }, 150);
  ctx.onFrame(() => updateHover(), 160);
  ctx.onFrame(() => drawMap(), 170);
  ctx.onFrame(() => sky.position.copy(camera.position), 180);
  ctx.onFrame((dt, t) => away?.fx?.(dt, t), 190);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - lastT) / 1000, 0, 0.05);   // the first rAF stamp can predate lastT
    lastT = now;
    const t = (now - clock0) / 1000;
    ctx.runFrame(dt, t, now);
    if (away?.scene) { renderFloor(away); return; }
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
    if (active) away?.scene ? renderFloor(away) : renderFrame();   // setSize clears the canvas; redraw now so the blank frame never reaches the screen
  }
  new ResizeObserver(resize).observe(container);

  window.__office = { ctx, openChat, closeChat, talk, get mode() { return mode; }, teleport: (k) => TELEPORTS[k](), openTv: (id) => openTvPanel(tvs.find((t) => t.id === id)), useTv: (id) => useTv(tvs.find((t) => t.id === id)), leaveTv,
    boards, useBoard: (id) => useBoard(boards.find((b) => b.id === id)), leaveBoard, wb,
    tvPoint: (id, u, v) => { const t = tvs.find((x) => x.id === id), p = t.scr.mesh.localToWorld(new THREE.Vector3((u - 0.5) * t.w, (0.5 - v) * t.h, 0)).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
    tvs: () => tvs.map((t) => ({ id: t.id, live: t.live, frame: !!t.frame, url: t.page?.url, title: t.page?.title, dist: t.dist })), seats, sitIn, openLaptop, laptop, kitchen, player, keys, camera, people, blinds, door, doors, collide, colliders, desks, idleSpots, lifts, sfx, mine, arch, roof, srv, FLOORS, openJohn, johnChat, setFloor, get away() { return away; }, callLift,
    goFloor: (n) => {   // debug: straight into your car at floor n, doors opening (headless tests can't sit through a ride)
      const L = mine.L || lifts.find(spare); if (!L) return false;
      Object.assign(mine, { L, call: false, goal: null }); L.player = true;
      Object.assign(player, { x: LIFT.x + 1, z: L.z, seated: false, seat: null, eye: EYE });
      L.floor = n; L.dir = 0; setFloor(n === 48 ? null : FLOORS.find((F) => F.n === n)); setLift(L, 'opening'); return true;
    }, pressFloor, setSpeed, clockState, setTime: (ms) => Object.assign(clockState, { speed: 0.0001, simBase: ms, realBase: Date.now() }) };

  return {
    // Adopt your desktop onto the monitor, then pull back from it to the chair.
    show() {
      active = true;
      resetLift();
      tvSocket();
      sfx.setActive(true);
      dash.desktop?.mount(domScreen);
      resize();
      setCam(fillPose());
      mode = 'intro';
      hud.classList.add('hidden');
      lastT = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      const seat = seatedPose();
      setTimeout(() => tween(fillPose(), seat, 2600, () => {
        Object.assign(player, { x: seat.x, z: seat.z, eye: seat.y, yaw: seat.yaw, pitch: seat.pitch, seated: true, seat: seat.seat ?? null });
        mode = 'free';
        hud.classList.remove('hidden');
      }), REDUCED ? 0 : 350);
    },
    // Fly back into the monitor, then hand the desktop back to the page.
    hide() {
      return new Promise((resolve) => {
        if (document.pointerLockElement) document.exitPointerLock();
        closeChat();
        dash.closeDrawer();
        if (using) { using.dirty = true; using = null; hud.classList.remove('of-using'); }
        leaveBoard();
        if (away) { resetLift(); setCam(seatedPose()); }
        hud.classList.add('hidden');
        mode = 'outro';
        if (laptop.open) { laptop.k = 1; laptopFx(0); }
        const from = camPose(), to = fillPose();
        const dist = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
        tween(from, to, clamp(dist * 260, 1100, 2800), () => {
          requestAnimationFrame(() => {
            dash.desktop?.mount(document.body);
            cancelAnimationFrame(raf);
            tvQuiet();
            active = false;
            sfx.setActive(false);
            mode = 'idle';
            resolve();
          });
        });
      });
    },
  };
}
