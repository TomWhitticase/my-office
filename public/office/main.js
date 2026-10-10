// @ts-check
// 3D first-person office view of the live dashboard.
// Working sessions sit at desks with their stats on screen; idle ones hang out in the breakroom.
// Your own glass office holds your computer: the centre monitor is the real, live desktop (desktop.js),
// projected with CSS3DRenderer behind a hole punched in the WebGL scene.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { createSounds } from '../sounds.js';
import { EYE, LIFT, REDUCED, clamp, colliders, dash } from './util.js';
import { installSpots, installSync } from './people.js';
import { createCtx } from './ctx.js';
import { CSS, hudHTML } from './hud.js';
import { install as installFurniture } from './world/furniture.js';
import { install as installDesks } from './world/desks.js';
import { install as installBreakroom, installCozy } from './world/breakroom.js';
import { install as installLounge, installVending } from './world/lounge.js';
import { install as installDarts } from './world/darts.js';
import { install as installMyOffice, installScreen, installDesk } from './world/my-office.js';
import { install as installTaskBoard } from './world/task-board.js';
import { install as installKitchen } from './world/kitchen.js';
import { install as installGuitars } from './world/guitars.js';
import { install as installDrinks } from './world/drinks-cabinet.js';
import { install as installMeetingRooms } from './world/meeting-rooms.js';
import { install as installAllHands } from './world/all-hands.js';
import { install as installFittings } from './world/fittings.js';
import { install as installClocks } from './world/clocks.js';
import { install as installSky } from './world/sky.js';
import { install as installShell, installReception } from './world/shell.js';
import { install as installReceptionist } from './systems/receptionist.js';
import { install as installCity } from './world/city.js';
import { install as installWhiteboards, installDrawing } from './world/whiteboards.js';
import { install as installTVs, installUse } from './systems/tvs.js';
import { install as installLiftLobby, installCycle, installRiding, installShafts } from './systems/lifts.js';
import { install as installPlayer } from './systems/player.js';
import { install as installArchive } from './floors/archive.js';
import { install as installGateway } from './floors/gateway.js';
import { install as installArchiveEntrance } from './floors/archive-entrance.js';
import { install as installRoof } from './floors/roof.js';
import { install as installHelicopter } from './floors/helicopter.js';
import { install as installRoofBar } from './floors/roof-bar.js';
import { install as installServerHall } from './floors/server-hall.js';
import { install as installRestricted } from './floors/restricted.js';
import { install as installEmptyFloors } from './floors/empty-floors.js';
import { install as installCctv } from './systems/cctv.js';
import { installUse as installTaskBoardUse } from './systems/task-board.js';
import { install as installTerminals } from './systems/terminals.js';
import { install as installAvatar } from './systems/avatar.js';
import { install as installChat } from './systems/chat.js';
import { install as installHover } from './systems/hover.js';
import { install as installMinimap } from './systems/minimap.js';
import { install as installPost, installRender } from './systems/post.js';

// ---------- the office ----------
/** @param {HTMLElement} container */
export function mountOffice(container) {
  const style = document.createElement('style');
  style.textContent = CSS;
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
  hud.innerHTML = hudHTML(ALT, IS_MAC);
  container.appendChild(hud);
  const targetEl = hud.querySelector('.of-target'), mapCanvas = /** @type {HTMLCanvasElement} */ (hud.querySelector('.of-map')), mapCtx = mapCanvas.getContext('2d'),
    countEl = hud.querySelector('.of-count');

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
  installTaskBoard(ctx);   // the cork task board on my office's north wall
  installGuitars(ctx);
  installDrinks(ctx);

  installScreen(ctx);
  const { syncCss, layoutCenterMonitor, domScreen } = ctx;

  installMeetingRooms(ctx);

  installFittings(ctx);

  installLiftLobby(ctx);
  const { lifts } = ctx;

  installVending(ctx);
  installDarts(ctx);   // the dartboard on the lounge pillar, its scoreboard and the beanbags behind the oche
  installAllHands(ctx);

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
  installArchiveEntrance(ctx);   // after the gateway: it wraps the floor's enter, leave, fx and ground

  installRoof(ctx);
  const { EDGE, roof } = ctx;
  installHelicopter(ctx);
  installRoofBar(ctx);   // the bar on the roof terrace

  installServerHall(ctx);
  const { srv } = ctx;
  installRestricted(ctx);   // B3, behind a code; before the cameras (two of its are dead)
  installEmptyFloors(ctx);   // 46, 45 and 44, vacant: the office's shell with nothing in it

  installCctv(ctx);

  // ----- sounds (see sounds.js; M mutes) -----
  const sfx = createSounds({ camera, rugs, glass: { minX: 6, maxX: 20, minZ: -15, maxZ: -3.5 }, lift: LIFT,
    coffee: { x: -16.5, y: 1.25, z: 14.5, onBrew: () => kitchen.brew(false) }, doorPos: { x: 7.7, z: -3.5 },
    roof: { minX: -EDGE.x, maxX: EDGE.x, minZ: -EDGE.z, maxZ: EDGE.z } });

  installSync(ctx);
  const { people } = ctx;
  installTerminals(ctx);   // the terminal pane on each desk's code monitor

  installPlayer(ctx);
  const { sitIn, openLaptop, collide, tween, camPose, setCam, laptopFx, fillPose, seatedPose, player, keys, TELEPORTS } = ctx;

  installUse(ctx);
  const { leaveTv, useTv } = ctx;

  installDrawing(ctx);
  installTaskBoardUse(ctx);   // using the task board (wraps leaveBoard, so before it's read here)
  const { leaveBoard, useBoard, wb } = ctx;

  installChat(ctx);
  installReceptionist(ctx);   // Rosie at reception (wraps closeChat, so before it's read here)
  const { openChat, closeChat, openJohn, talk, johnChat, rosie, openRosie } = ctx;

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
  installAvatar(ctx);   // after post's layer sort: its name tag is a sprite, kept off your view's layers

  // ----- loop -----
  let raf = 0, lastT = performance.now(), firstShow = true;   // firstShow: the page has just loaded (see show)
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
    // setSize clears the canvas; redraw now so the blank frame never reaches the screen
    if (ctx.active) ctx.away?.scene ? renderFloor(ctx.away) : renderFrame();
  }
  new ResizeObserver(resize).observe(container);

  /** @type {any} */ (window).__office = { ctx, openChat, closeChat, talk, get mode() { return ctx.mode; }, teleport: (k) => TELEPORTS[k](),
    openTv: (id) => openTvPanel(tvs.find((t) => t.id === id)), useTv: (id) => useTv(tvs.find((t) => t.id === id)), leaveTv,
    boards, useBoard: (id) => useBoard(boards.find((b) => b.id === id)), leaveBoard, wb,
    tvPoint: (id, u, v) =>
      { const t = tvs.find((x) => x.id === id), p = t.scr.mesh.localToWorld(new THREE.Vector3((u - 0.5) * t.w, (0.5 - v) * t.h, 0)).project(camera),
      r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
    tvs: () => tvs.map((t) => ({ id: t.id, live: t.live, frame: !!t.frame, url: t.page?.url, title: t.page?.title, dist: t.dist })), seats, sitIn, openLaptop,
      laptop, kitchen, player, keys, camera, people, blinds, door, doors, collide, colliders, desks, idleSpots, lifts, sfx, mine, arch, roof, srv, FLOORS,
      openJohn, johnChat, rosie, openRosie, setFloor, get away() { return ctx.away; }, callLift, heli: ctx.heli, cctv: ctx.cctv,
    goFloor: (n) => {   // debug: straight into your car at floor n, doors opening (headless tests can't sit through a ride)
      const L = mine.L || lifts.find(spare); if (!L) return false;
      Object.assign(mine, { L, call: false, goal: null }); L.player = true;
      Object.assign(player, { x: LIFT.x + 1, z: L.z, seated: false, seat: null, eye: EYE });
      L.floor = n; L.dir = 0; setFloor(n === 48 ? null : FLOORS.find((F) => F.n === n)); setLift(L, 'opening'); return true;
    }, pressFloor, setSpeed, clockState, setTime: (ms) => Object.assign(clockState, { mode: 0.0001, speed: 0.0001, simBase: ms, realBase: Date.now() }) };

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
      // The first time the page shows the office, pull back to wherever you last were (if anywhere but your desk);
      // coming back from your computer, you're at your desk.
      const back = firstShow && !laptop.shown ? ctx.restorePose() : null;
      firstShow = false;
      const seat = back || seatedPose();
      setTimeout(() => tween(fillPose(), seat, back ? 3200 : 2600, () => {
        Object.assign(player, { x: seat.x, z: seat.z, eye: seat.y, yaw: seat.yaw, pitch: seat.pitch, seated: back ? back.seated : true, seat: seat.seat ?? null });
        ctx.mode = 'free';
        hud.classList.remove('hidden');
      }), REDUCED ? 0 : 350);
    },
    // Fly back into the monitor, then hand the desktop back to the page.
    hide() {
      return new Promise(/** @param {(v?: any) => void} resolve */ (resolve) => {
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
            ctx.cctv.resume();   // the Security app's feeds keep the office going
            sfx.setActive(false);
            ctx.mode = 'idle';
            resolve();
          });
        });
      });
    },
  };
}
