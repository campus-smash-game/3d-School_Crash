import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Node state regressions with a minimal DOM double, not a browser or device test.
// This does not verify CSS layout, native touch dispatch, WebGL, or mobile frame rate.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'artifacts');
await mkdir(artifactDirectory, { recursive: true });
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const source = await readFile(path.join(root, 'src/controls.ts'), 'utf8');
const {stops:campusStops}=JSON.parse(await readFile(path.join(root,'public/data/shuttle-stops.json'),'utf8'));
assert.equal(campusStops.length,15);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  fileName: 'controls.ts',
});
const compiledPath = path.join(artifactDirectory, 'controls-test.mjs');
await writeFile(compiledPath, compiled.outputText);
const { Controls } = await import(pathToFileURL(compiledPath).href);
const physicsSource=await readFile(path.join(root,'src/physics.ts'),'utf8');
const physicsPath=path.join(artifactDirectory,'physics-controls-test.mjs');
await writeFile(physicsPath,ts.transpileModule(physicsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {Simulation}=await import(pathToFileURL(physicsPath).href);
await RAPIER.init();

class ClassList {
  values = new Set();
  constructor(value = '') { value.split(/\s+/).filter(Boolean).forEach((name) => this.values.add(name)); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force = !this.contains(name)) {
    if (force) this.add(name); else this.remove(name);
    return force;
  }
}

class ElementDouble extends EventTarget {
  constructor(tagName, id = '', attributes = '') {
    super();
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.attributes = new Map();
    this.captures = new Set();
    this.disabled = /\sdisabled(?:\s|=|$)/.test(attributes);
    this.classList = new ClassList(attributes.match(/\bclass="([^"]*)"/)?.[1]);
    this._value = '';
    this.ownerDocument = null;
  }
  set value(value) { this._value = value; }
  get value() { return this._value || this.children[0]?.value || ''; }
  get selectedOptions() { return this.children.filter((child) => child.value === this.value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
  replaceChildren() { this.children = []; this._value = ''; }
  append(child) { this.children.push(child); }
  focus() { this.ownerDocument.activeElement = this; }
}

function emit(element, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  element.dispatchEvent(event);
  return event;
}

function fixture({ coarse = true, pointerLock = false, width = 390, height = 844 } = {}) {
  const document = new ElementDouble('document');
  const elements = new Map();
  const all = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const [, tag, attributes] = match;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1] ?? '';
    const element = new ElementDouble(tag, id, attributes);
    element.ownerDocument = document;
    if (id) elements.set(id, element);
    all.push(element);
  }
  document.body = all.find((element) => element.tagName === 'BODY');
  document.activeElement = document.body;
  document.hidden = false;
  document.pointerLockElement = null;
  document.exits = 0;
  document.getElementById = (id) => elements.get(id) ?? null;
  document.createElement = (tag) => {
    const element = new ElementDouble(tag);
    element.ownerDocument = document;
    return element;
  };
  document.querySelector = (selector) => all.find((element) => element.classList.contains(selector.slice(1))) ?? null;
  document.querySelectorAll = (selector) => all.filter((element) => element.classList.contains(selector.slice(1)));
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    document.exits++;
    emit(document, 'pointerlockchange');
  };
  const window = new ElementDouble('window');
  window.performance = globalThis.performance;
  window.reloads = 0;
  window.location = { reload: () => window.reloads++ };
  globalThis.document = document;
  globalThis.window = window;
  globalThis.matchMedia = () => ({ matches: coarse });
  const get = (id) => {
    const element = elements.get(id);
    assert.ok(element, `index.html must contain #${id}`);
    return element;
  };
  const canvas = get('game');
  canvas.rect = { left: 0, top: 0, right: width, bottom: height, width, height };
  const moveTop = height * (width > height ? .3 : .32);
  get('move-zone').rect = { left: 0, top: moveTop, right: width * .46, bottom: height, width: width * .46, height: height - moveTop };
  if (pointerLock) canvas.requestPointerLock = () => {
    document.pointerLockElement = canvas;
    emit(document, 'pointerlockchange');
  };
  const controls = new Controls(canvas);
  return { controls, document, window, canvas, get, all, width, height };
}

function start(f) {
  if (!f.get('travel-select').children.length) f.controls.setShuttleStops(campusStops);
  f.controls.setReady();
  emit(f.get('start-button'), 'click');
  assert.equal(f.controls.active, true);
}

function threePointers(f) {
  emit(f.get('move-zone'), 'pointerdown', { pointerId: 1, clientX: 70, clientY: f.height * .8, pointerType: 'touch' });
  emit(f.get('move-zone'), 'pointermove', { pointerId: 1, clientX: 70, clientY: f.height * .8 - 50, pointerType: 'touch' });
  emit(f.canvas, 'pointerdown', { pointerId: 2, clientX: f.width * .7, clientY: f.height * .4, pointerType: 'touch' });
  emit(f.canvas, 'pointermove', { pointerId: 2, clientX: f.width * .7 + 20, clientY: f.height * .4 - 10, pointerType: 'touch' });
  emit(f.get('attack-button'), 'pointerdown', { pointerId: 3, pointerType: 'touch' });
}

function touchLook(f, x, y) {
  const scale = Math.max(1, Math.min(1.8, 600 / Math.min(f.width, f.height)));
  return { x: x * scale, y: y * scale };
}

function assertIdle(f) {
  assert.equal(f.controls.moveX, 0);
  assert.equal(f.controls.moveZ, 0);
  assert.equal(f.controls.sprint, false);
  assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 });
  assert.equal(f.controls.consumeAttack(), false);
  assert.equal(f.controls.consumePulse(), false);
  assert.equal(f.controls.consumeJump(), false);
  for (const element of f.all) assert.equal(element.captures.size, 0, `capture retained by #${element.id}`);
}

const originalGlobals = Object.fromEntries(['document', 'window', 'matchMedia'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const results = [];
function check(name, run, options) {
  let f;
  try {
    f = fixture(options);
    const details = run(f) ?? {};
    results.push({ name, status: 'passed', ...details });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    console.error(error.stack);
  } finally {
    if (f) clearTimeout(f.controls.toastTimer);
  }
}

try {
  check('initial start uses the selected campus stop once and resume keeps the player position', (f) => {
    const calls = [];
    f.controls.onStart = (id) => calls.push(id);
    f.controls.setShuttleStops([{id:'shuttle-gate',name:'정문'},{id:'shuttle-301',name:'301동'}]);
    assert.deepEqual(f.get('travel-select').children.map(option=>option.value),['shuttle-gate','shuttle-301']);
    f.get('travel-select').value='shuttle-301';
    start(f);
    assert.deepEqual(calls,['shuttle-301']);
    assert.equal(f.get('travel-select').value,'shuttle-301');
    f.controls.pause();
    emit(f.get('start-button'),'click');
    assert.deepEqual(calls,['shuttle-301',undefined]);
  });

  check('the location button uses the same initial stop path and later allows fast travel', (f) => {
    const starts=[], travels=[];
    f.controls.onStart=id=>starts.push(id);
    f.controls.onTravel=id=>travels.push(id);
    f.controls.setShuttleStops([{id:'shuttle-gate',name:'정문'},{id:'shuttle-302',name:'302동'}]);
    f.controls.setReady();
    f.get('travel-select').value='shuttle-302';
    emit(f.get('travel-button'),'click');
    assert.deepEqual(starts,['shuttle-302']);
    assert.deepEqual(travels,[]);
    f.controls.pause();
    emit(f.get('travel-button'),'click');
    assert.deepEqual(travels,['shuttle-302']);
    assert.deepEqual(starts,['shuttle-302',undefined]);
  });

  for (const coarse of [false, true]) check('all fifteen shuttle stops remain the only choices through every pause entry '+(coarse?'touch':'desktop'), (f) => {
    const starts=[],travels=[],expected=campusStops.map(stop=>stop.id);
    f.controls.onStart=id=>starts.push(id);f.controls.onTravel=id=>travels.push(id);
    f.controls.setShuttleStops(campusStops);f.controls.setReady();
    const assertStops=()=>assert.deepEqual(f.get('travel-select').children.map(option=>option.value),expected);
    assertStops();f.get('travel-select').value=expected[4];emit(f.get('start-button'),'click');
    assert.deepEqual(starts,[expected[4]]);assertStops();
    const pauseEntries=[()=>emit(f.document,'keydown',{code:'Escape',repeat:false}),()=>emit(f.document,'keydown',{code:'KeyM',repeat:false}),()=>emit(f.get('pause-button'),'click'),()=>emit(f.get('map-button'),'click')];
    for(const pause of pauseEntries){
      pause();assert.equal(f.controls.active,false);assert.equal(f.get('ui').dataset.state,'paused');assertStops();assertIdle(f);
      f.get('travel-select').value=expected[9];emit(f.get('start-button'),'click');
      assert.equal(f.controls.active,true);assert.equal(starts.at(-1),undefined);assert.deepEqual(travels,[]);assertStops();
    }
    emit(f.get('pause-button'),'click');
    f.get('travel-select').value='way/389628348';emit(f.get('travel-button'),'click');
    assert.equal(f.controls.active,false);assert.deepEqual(travels,[]);
    f.get('travel-select').value=expected[9];emit(f.get('travel-button'),'click');
    assert.equal(f.controls.active,true);assert.deepEqual(travels,[expected[9]]);assertStops();assertIdle(f);
    return{stopCount:expected.length,pauseEntries:['Escape','M','pause-button','map-button'],resumeWithoutTravel:true,invalidBuildingRejected:true};
  },{coarse,pointerLock:!coarse});

  check('loading blocks play and settings until initialization finishes', (f) => {
    assert.equal(f.get('start-button').disabled, true);
    for (const id of ['quality', 'sound-button', 'reset-button', 'travel-select', 'travel-button']) assert.equal(f.get(id).disabled, true);
    emit(f.get('start-button'), 'click');
    assert.equal(f.controls.active, false, 'the internal guard must also reject a stale synthetic click');
    f.controls.setReady();
    assert.equal(f.get('start-button').disabled, true, 'first play requires a shuttle stop');
    emit(f.get('start-button'), 'click');
    assert.equal(f.controls.active, false);
    f.controls.setShuttleStops([{ id: 'gate', name: '정문' }]);
    assert.equal(f.get('start-button').disabled, false);
    assert.equal(f.get('travel-button').disabled, false);
    assert.equal(f.get('quality').disabled, false);
  });

  check('three touch pointers independently move, look, and fire', (f) => {
    start(f);
    threePointers(f);
    assert.ok(f.controls.moveZ > .9);
    assert.deepEqual(f.controls.consumeLook(), touchLook(f, 20, -10));
    assert.equal(f.controls.consumeAttack(), true);
    assert.equal(f.controls.consumeAttack(), false);
    assert.ok(f.controls.moveZ > .9);
    assert.equal(f.get('move-zone').hasPointerCapture(1), true);
    assert.equal(f.canvas.hasPointerCapture(2), true);
    assert.equal(f.get('attack-button').hasPointerCapture(3), true);
    emit(f.canvas, 'pointermove', { pointerId: 99, clientX: 999, clientY: 999 });
    assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 });
  });

  check('dynamic stick begins exactly where the finger touches with no initial movement', (f) => {
    start(f);
    const zone = f.get('move-zone');
    emit(zone, 'pointerdown', { pointerId: 1, clientX: 120, clientY: 680, pointerType: 'touch' });
    assert.equal(f.get('joystick').style.left, '120px');
    assert.equal(f.get('joystick').style.top, '680px');
    assert.equal(f.get('joystick').classList.contains('engaged'), true);
    assert.equal(f.controls.moveX, 0);
    assert.equal(f.controls.moveZ, 0);
    emit(zone, 'pointermove', { pointerId: 1, clientX: 122, clientY: 678 });
    assert.equal(f.controls.moveX, 0, 'tiny touch jitter must remain inside the radial dead zone');
    assert.equal(f.controls.moveZ, 0);
    emit(zone, 'pointermove', { pointerId: 1, clientX: 120, clientY: 668 });
    const slow = f.controls.moveZ;
    assert.ok(slow > .1 && slow < .3);
    emit(zone, 'pointermove', { pointerId: 1, clientX: 120, clientY: 656 });
    const medium = f.controls.moveZ;
    assert.ok(medium > slow && medium < .7);
    emit(zone, 'pointermove', { pointerId: 1, clientX: 120, clientY: 610 });
    assert.equal(f.controls.moveZ, 1);
    assert.equal(f.controls.sprint, false, 'full stick deflection must not abruptly change walking speed');
    emit(zone, 'pointerup', { pointerId: 1 });
    assert.equal(f.get('joystick').classList.contains('engaged'), false);
    assertIdle(f);
    emit(zone, 'pointerdown', { pointerId: 2, clientX: 35, clientY: 530 });
    assert.equal(f.get('joystick').style.left, '35px');
    assert.equal(f.get('joystick').style.top, '530px');
    assert.equal(f.controls.moveZ, 0, 'the second touch must use its own origin');
  });

  check('movement and look keep their initial roles when fingers cross the screen', (f) => {
    start(f);
    emit(f.get('move-zone'), 'pointerdown', { pointerId: 1, clientX: 90, clientY: 600, pointerType: 'touch' });
    emit(f.get('move-zone'), 'pointermove', { pointerId: 1, clientX: 320, clientY: 500, pointerType: 'touch' });
    assert.ok(f.controls.moveX > .8);
    assert.ok(Math.abs(Math.hypot(f.controls.moveX, f.controls.moveZ) - 1) < 1e-9);
    assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 });
    const movement = [f.controls.moveX, f.controls.moveZ];
    emit(f.canvas, 'pointerdown', { pointerId: 2, clientX: 310, clientY: 420, pointerType: 'touch' });
    emit(f.canvas, 'pointermove', { pointerId: 2, clientX: 100, clientY: 420, pointerType: 'touch' });
    assert.deepEqual(f.controls.consumeLook(), touchLook(f, -210, 0));
    assert.deepEqual([f.controls.moveX, f.controls.moveZ], movement);
    emit(f.canvas, 'pointerup', { pointerId: 2 });
    emit(f.canvas, 'pointerdown', { pointerId: 3, clientX: 70, clientY: 100, pointerType: 'touch' });
    emit(f.canvas, 'pointermove', { pointerId: 3, clientX: 90, clientY: 110, pointerType: 'touch' });
    assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 }, 'a left-side touch outside the movement area must not rotate the camera');
  });

  check('movement, looking, jumping, and firing support four simultaneous pointers', (f) => {
    start(f);
    threePointers(f);
    emit(f.get('jump-button'), 'pointerdown', { pointerId: 4, pointerType: 'touch' });
    assert.equal(f.controls.consumeJump(), true);
    assert.equal(f.controls.consumeAttack(), true);
    assert.ok(f.controls.moveZ > .9);
    assert.deepEqual(f.controls.consumeLook(), touchLook(f, 20, -10));
    assert.equal(f.get('jump-button').hasPointerCapture(4), true);
    emit(f.get('jump-button'), 'pointercancel', { pointerId: 4 });
    assert.equal(f.get('jump-button').hasPointerCapture(4), false);
    assert.equal(f.canvas.hasPointerCapture(2), true);
    assert.equal(f.get('move-zone').hasPointerCapture(1), true);
    emit(f.get('pulse-button'), 'pointerdown', { pointerId: 5, pointerType: 'touch' });
    assert.equal(f.controls.consumePulse(), true);
    emit(f.get('map-button'), 'click');
    assert.equal(f.controls.active, false);
    assertIdle(f);
  });

  check('a touch on a hybrid device activates mobile controls before play', (f) => {
    f.controls.setShuttleStops(campusStops);
    f.controls.setReady();
    emit(f.get('start-button'), 'pointerdown', { pointerId: 1, pointerType: 'touch' });
    emit(f.get('start-button'), 'click');
    assert.equal(f.document.body.classList.contains('touch'), true);
    assert.equal(f.document.pointerLockElement, null);
    emit(f.canvas, 'pointerdown', { pointerId: 2, clientX: 100, clientY: 600, pointerType: 'touch' });
    emit(f.canvas, 'pointermove', { pointerId: 2, clientX: 100, clientY: 540, pointerType: 'touch' });
    assert.equal(f.controls.moveZ, 1);
    assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 });
    emit(f.canvas, 'pointercancel', { pointerId: 2 });
    assertIdle(f);
  }, { coarse: false, pointerLock: true });

  check('pointer cancellation releases only its own control', (f) => {
    start(f);
    threePointers(f);
    f.controls.consumeLook();
    f.controls.consumeAttack();
    emit(f.get('move-zone'), 'pointercancel', { pointerId: 1 });
    assert.equal(f.controls.moveZ, 0);
    assert.equal(f.canvas.hasPointerCapture(2), true);
    assert.equal(f.get('attack-button').hasPointerCapture(3), true);
    emit(f.get('move-zone'), 'pointerdown', { pointerId: 4, clientX: 110, clientY: 630 });
    emit(f.get('move-zone'), 'pointermove', { pointerId: 4, clientX: 110, clientY: 580 });
    emit(f.get('move-zone'), 'lostpointercapture', { pointerId: 1 });
    assert.ok(f.controls.moveZ > .9, 'an old pointer must not cancel the replacement pointer');
    emit(f.canvas, 'pointercancel', { pointerId: 2 });
    emit(f.canvas, 'pointermove', { pointerId: 2, clientX: 500, clientY: 500 });
    assert.deepEqual(f.controls.consumeLook(), { x: 0, y: 0 });
    emit(f.get('attack-button'), 'pointercancel', { pointerId: 3 });
    assert.equal(f.get('attack-button').classList.contains('pressed'), false);
    emit(f.get('attack-button'), 'pointerdown', { pointerId: 5 });
    assert.equal(f.controls.consumeAttack(), true);
  });

  check('pause releases pointer captures and pending input without drift on resume', (f) => {
    start(f);
    threePointers(f);
    emit(f.document, 'keydown', { code: 'KeyD', repeat: false });
    emit(f.document, 'keydown', { code: 'Space', repeat: false });
    f.controls.pause();
    assert.equal(f.controls.active, false);
    assert.equal(f.get('ui').dataset.state, 'paused');
    assertIdle(f);
    emit(f.get('start-button'), 'click');
    assert.equal(f.controls.active, true);
    assertIdle(f);
  });

  check('window blur pauses and clears simultaneous input', (f) => {
    start(f);
    threePointers(f);
    emit(f.window, 'blur');
    assert.equal(f.controls.active, false);
    assertIdle(f);
  });

  check('a hidden document pauses and clears input', (f) => {
    start(f);
    threePointers(f);
    f.document.hidden = true;
    emit(f.document, 'visibilitychange');
    assert.equal(f.controls.active, false);
    assertIdle(f);
  });

  check('resize clears stale touches while leaving play active', (f) => {
    start(f);
    threePointers(f);
    emit(f.window, 'resize');
    assert.equal(f.controls.active, true);
    assertIdle(f);
  });

  check('orientation changes clear dynamic stick and action captures before new touches', (f) => {
    start(f);
    threePointers(f);
    emit(f.get('jump-button'), 'pointerdown', { pointerId: 4, pointerType: 'touch' });
    emit(f.window, 'orientationchange');
    assert.equal(f.controls.active, true);
    assert.equal(f.get('joystick').classList.contains('engaged'), false);
    assertIdle(f);
    emit(f.get('move-zone'), 'pointermove', { pointerId: 1, clientX: 500, clientY: 100 });
    emit(f.canvas, 'pointermove', { pointerId: 2, clientX: 200, clientY: 200 });
    assertIdle(f);
    emit(f.get('move-zone'), 'pointerdown', { pointerId: 5, clientX: 115, clientY: 300 });
    emit(f.get('move-zone'), 'pointermove', { pointerId: 5, clientX: 115, clientY: 250 });
    assert.equal(f.controls.moveZ, 1);
    assert.equal(f.get('joystick').style.top, '300px');
  }, { width: 844, height: 390 });

  check('a late pointer-lock grant after pause is immediately released', (f) => {
    start(f);
    f.controls.pause();
    f.document.pointerLockElement = f.canvas;
    emit(f.document, 'pointerlockchange');
    assert.equal(f.document.pointerLockElement, null);
    assert.equal(f.document.exits, 1);
    assert.equal(f.controls.active, false);
  }, { coarse: false });

  check('error state disables play, travel, and reset and exposes reload behavior', (f) => {
    start(f);
    threePointers(f);
    f.controls.setShuttleStops([{ id: 'gate', name: '정문' }]);
    let resets = 0;
    let travels = 0;
    f.controls.onReset = () => resets++;
    f.controls.onTravel = () => travels++;
    f.controls.setError('Test GPU context loss');
    assert.equal(f.controls.active, false);
    assert.equal(f.get('ui').dataset.state, 'error');
    assert.equal(f.get('error-message').textContent, 'Test GPU context loss');
    for (const id of ['start-button', 'quality', 'sound-button', 'reset-button', 'travel-select', 'travel-button']) assert.equal(f.get(id).disabled, true);
    assertIdle(f);
    emit(f.get('start-button'), 'click');
    emit(f.get('reset-button'), 'click');
    emit(f.get('travel-button'), 'click');
    assert.equal(f.controls.active, false);
    assert.equal(resets, 0);
    assert.equal(travels, 0);
    emit(f.get('reload-button'), 'click');
    assert.equal(f.window.reloads, 1);
  });

  check('shuttle travel selects the exact destination and resumes with clean input', (f) => {
    f.controls.setShuttleStops([{ id: 'stop-gate', name: '정문 정류장' }, { id: 'stop-library', name: '도서관 정류장' }]);
    start(f);
    threePointers(f);
    emit(f.get('map-button'), 'click');
    assert.equal(f.controls.active, false);
    assert.equal(f.document.activeElement, f.get('travel-select'));
    assertIdle(f);
    f.get('travel-select').value = 'stop-library';
    const travels = [];
    f.controls.onTravel = (id) => travels.push(id);
    emit(f.get('travel-button'), 'click');
    assert.deepEqual(travels, ['stop-library']);
    assert.equal(f.controls.active, true);
    assertIdle(f);
    const event = emit(f.document, 'keydown', { code: 'KeyM', repeat: false });
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.controls.active, false);
    assert.equal(f.document.activeElement, f.get('travel-select'));
  });

  check('shuttle list updates preserve selection while nearby-building labels stay separate', (f) => {
    start(f);
    f.controls.setShuttleStops([{ id: 'stop-gate', name: '정문 정류장' }, { id: 'stop-library', name: '도서관 정류장' }]);
    f.get('travel-select').value = 'stop-library';
    f.controls.setShuttleStops([{ id: 'stop-library', name: '도서관 정류장' }, { id: 'stop-dorm', name: '기숙사 정류장' }]);
    assert.equal(f.get('travel-select').value, 'stop-library');
    f.controls.updateLocation('기숙사');
    assert.equal(f.get('location-name').textContent, '기숙사');
    assert.equal(f.get('minimap-location').textContent, '기숙사');
    f.controls.setShuttleStops([]);
    assert.equal(f.get('travel-button').disabled, true);
    assert.equal(f.get('travel-select').disabled, true);
  });

  check('keyboard movement is normalized and actions are consumed once', (f) => {
    start(f);
    emit(f.document, 'keydown', { code: 'KeyW', repeat: false });
    emit(f.document, 'keydown', { code: 'KeyD', repeat: false });
    emit(f.document, 'keydown', { code: 'ShiftLeft', repeat: false });
    assert.ok(Math.abs(Math.hypot(f.controls.moveX, f.controls.moveZ) - 1) < 1e-9);
    assert.equal(f.controls.sprint, true);
    emit(f.document, 'keydown', { code: 'Space', repeat: false });
    emit(f.document, 'keydown', { code: 'KeyE', repeat: false });
    emit(f.document, 'keydown', { code: 'KeyF', repeat: false });
    assert.equal(f.controls.consumeJump(), true);
    assert.equal(f.controls.consumePulse(), true);
    assert.equal(f.controls.consumeAttack(), true);
    assert.equal(f.controls.consumeJump(), false);
    emit(f.document, 'keydown', { code: 'Space', repeat: true });
    assert.equal(f.controls.consumeJump(), false, 'held keyboard Space must remain a one-shot action');
    emit(f.document, 'keydown', { code: 'KeyE', repeat: true });
    assert.equal(f.controls.consumePulse(), false);
    emit(f.document, 'keydown', { code: 'Escape', repeat: false });
    assert.equal(f.controls.active, false);
    assertIdle(f);
  });

  check('desktop pointer lock feeds look and fire and unlock pauses', (f) => {
    start(f);
    assert.equal(f.document.pointerLockElement, f.canvas);
    emit(f.document, 'mousemove', { movementX: 30, movementY: -12 });
    assert.deepEqual(f.controls.consumeLook(), { x: 30, y: -12 });
    emit(f.canvas, 'pointerdown', { pointerId: 1, button: 0, pointerType: 'mouse' });
    assert.equal(f.controls.consumeAttack(), true);
    emit(f.canvas, 'pointerdown', { pointerId: 1, button: 2, pointerType: 'mouse' });
    assert.equal(f.controls.consumePulse(), true);
    f.document.exitPointerLock();
    assert.equal(f.controls.active, false);
    assertIdle(f);
  }, { coarse: false, pointerLock: true });

  check('mouse drag remains usable when pointer lock is unavailable', (f) => {
    start(f);
    emit(f.canvas, 'pointerdown', { pointerId: 1, clientX: 80, clientY: 90, pointerType: 'mouse' });
    emit(f.canvas, 'pointermove', { pointerId: 1, clientX: 100, clientY: 110, pointerType: 'mouse' });
    assert.deepEqual(f.controls.consumeLook(), { x: 20, y: 20 });
    emit(f.document, 'keydown', { code: 'KeyF', repeat: false });
    assert.equal(f.controls.consumeAttack(), true);
    assert.equal(f.controls.active, true);
  }, { coarse: false });

  check('touch jump stays requested while held and a quick tap remains one request', (f) => {
    start(f);const button=f.get('jump-button');
    emit(button,'pointerdown',{pointerId:7,pointerType:'touch'});
    for(let frame=0;frame<6;frame++)assert.equal(f.controls.consumeJump(),true);
    emit(button,'pointerup',{pointerId:7,pointerType:'touch'});assert.equal(f.controls.consumeJump(),false);assert.equal(button.hasPointerCapture(7),false);
    emit(button,'pointerdown',{pointerId:8,pointerType:'touch'});emit(button,'pointerup',{pointerId:8,pointerType:'touch'});
    assert.equal(f.controls.consumeJump(),true);assert.equal(f.controls.consumeJump(),false);
    return{heldRequests:6,quickTapRequests:1};
  });

  check('cancel, lost capture and lifecycle changes clear held and pending touch jump', (f) => {
    start(f);const button=f.get('jump-button');let pointerId=20;
    for(const event of['pointercancel','lostpointercapture']){emit(button,'pointerdown',{pointerId,pointerType:'touch'});emit(button,event,{pointerId,pointerType:'touch'});assert.equal(f.controls.consumeJump(),false);pointerId++;}
    const interrupts=[()=>f.controls.pause(),()=>emit(f.window,'blur'),()=>emit(f.get('map-button'),'click'),()=>emit(f.window,'resize'),()=>emit(f.window,'orientationchange'),()=>f.controls.setError('test')];
    for(const interrupt of interrupts){start(f);emit(button,'pointerdown',{pointerId,pointerType:'touch'});assert.equal(f.controls.consumeJump(),true);interrupt();assertIdle(f);pointerId++;}
    return{releasePaths:8};
  });

  check('holding touch jump before landing reaches the actual Simulation grounded jump', (f) => {
    start(f);const sim=new Simulation([],[],new THREE.Vector3(0,1.7,0),{minX:-30,maxX:30,minZ:-30,maxZ:30});const dt=1/60;
    try{
      for(let i=0;i<40;i++)sim.step(dt,0,0,false);assert.ok(sim.grounded);
      emit(f.document,'keydown',{code:'Space',repeat:false});sim.step(dt,0,0,f.controls.consumeJump());emit(f.document,'keyup',{code:'Space'});
      let falling=false;for(let i=0;i<100;i++){sim.step(dt,0,0,f.controls.consumeJump());if(!sim.grounded&&sim.velocityY<0&&sim.player.translation().y<1.12){falling=true;break;}}
      assert.ok(falling,'fixture must press while still airborne and descending');const pressHeight=sim.player.translation().y;
      emit(f.get('jump-button'),'pointerdown',{pointerId:8,pointerType:'touch'});let landed=false,rebounded=false,framesToRebound=0;
      for(let i=0;i<25;i++){sim.step(dt,0,0,f.controls.consumeJump());if(sim.grounded)landed=true;if(landed&&sim.velocityY>0){rebounded=true;framesToRebound=i+1;break;}}
      assert.ok(landed&&rebounded,'a held airborne request must survive until grounded');
      emit(f.get('jump-button'),'pointerup',{pointerId:8,pointerType:'touch'});assert.equal(f.controls.consumeJump(),false);
      let furtherJumps=0,previousVelocity=sim.velocityY;for(let i=0;i<150;i++){sim.step(dt,0,0,f.controls.consumeJump());if(previousVelocity<=0&&sim.velocityY>0)furtherJumps++;previousVelocity=sim.velocityY;}
      assert.ok(sim.grounded);assert.equal(furtherJumps,0);return{pressHeight,framesToRebound,furtherJumpsAfterRelease:0,actualSimulation:true};
    }finally{sim.world.free();}
  });

  check('a real mouse click returns from touch to desktop without firing then touch can resume', (f) => {
    start(f);assert.equal(f.document.pointerLockElement,null);
    emit(f.canvas,'pointerdown',{pointerId:10,pointerType:'mouse',button:0,clientX:300,clientY:300});
    assert.equal(f.document.body.classList.contains('touch'),false);assert.equal(f.document.pointerLockElement,f.canvas);assert.equal(f.controls.consumeAttack(),false);assert.equal(f.controls.consumePulse(),false);
    emit(f.document,'mousemove',{movementX:14,movementY:-6});assert.deepEqual(f.controls.consumeLook(),{x:14,y:-6});
    emit(f.canvas,'pointerdown',{pointerId:10,pointerType:'mouse',button:0});assert.equal(f.controls.consumeAttack(),true);
    emit(f.canvas,'pointerdown',{pointerId:11,pointerType:'touch',clientX:300,clientY:300});assert.equal(f.document.body.classList.contains('touch'),true);assert.equal(f.document.pointerLockElement,null);assert.equal(f.controls.active,true);assert.equal(f.controls.consumeAttack(),false);
    emit(f.canvas,'pointermove',{pointerId:11,pointerType:'touch',clientX:310,clientY:310});assert.deepEqual(f.controls.consumeLook(),touchLook(f,10,10));
    emit(f.document,'pointerlockerror');assert.equal(f.controls.dragMode,false);assert.equal(f.controls.active,true);
    return{transitionClickFired:false,desktopAndTouchRestored:true};
  },{coarse:true,pointerLock:true});

  check('mouse compatibility events cannot steal active touch controls or trigger fire', (f) => {
    start(f);threePointers(f);emit(f.get('jump-button'),'pointerdown',{pointerId:4,pointerType:'touch'});f.controls.consumeAttack();f.controls.consumeLook();
    const movement=[f.controls.moveX,f.controls.moveZ];
    for(const element of[f.canvas,f.get('move-zone'),f.get('pulse-button')])emit(element,'pointerdown',{pointerId:9,pointerType:'mouse',button:0,clientX:300,clientY:300});
    assert.equal(f.document.body.classList.contains('touch'),true);assert.equal(f.document.pointerLockElement,null);assert.deepEqual([f.controls.moveX,f.controls.moveZ],movement);assert.equal(f.controls.consumeAttack(),false);assert.equal(f.controls.consumePulse(),false);assert.equal(f.controls.consumeJump(),true);assert.equal(f.canvas.hasPointerCapture(2),true);
    emit(f.get('move-zone'),'pointerup',{pointerId:1});emit(f.canvas,'pointerup',{pointerId:2});emit(f.get('attack-button'),'pointerup',{pointerId:3});emit(f.get('jump-button'),'pointerup',{pointerId:4});
    emit(f.canvas,'pointerdown',{pointerId:9,pointerType:'mouse',button:0,sourceCapabilities:{firesTouchEvents:true},clientX:300,clientY:300});
    assert.equal(f.document.body.classList.contains('touch'),true);assert.equal(f.document.pointerLockElement,null);assertIdle(f);
    return{activeTouchProtected:true,markedTouchDerivedMouseIgnoredAfterRelease:true};
  },{coarse:true,pointerLock:true});

  check('mouse return through the movement region retains the existing drag fallback', (f) => {
    start(f);emit(f.get('move-zone'),'pointerdown',{pointerId:7,pointerType:'mouse',button:0,clientX:70,clientY:600});
    assert.equal(f.document.body.classList.contains('touch'),false);assert.equal(f.controls.dragMode,true);assert.equal(f.controls.moveX,0);assert.equal(f.controls.consumeAttack(),false);assert.equal(f.get('move-zone').hasPointerCapture(7),false);
    emit(f.canvas,'pointerdown',{pointerId:7,pointerType:'mouse',button:0,clientX:200,clientY:300});emit(f.canvas,'pointermove',{pointerId:7,pointerType:'mouse',clientX:213,clientY:304});
    assert.deepEqual(f.controls.consumeLook(),{x:13,y:4});assert.equal(f.controls.consumeAttack(),false);
    emit(f.document,'keydown',{code:'KeyF',repeat:false});assert.equal(f.controls.consumeAttack(),true);
  });

  check('mouse start after touch pause selects desktop input and stale lock movement cannot rotate touch view', (f) => {
    start(f);f.controls.pause();emit(f.get('start-button'),'pointerdown',{pointerId:10,pointerType:'mouse',button:0});emit(f.get('start-button'),'click');assert.equal(f.document.pointerLockElement,f.canvas);assert.equal(f.document.body.classList.contains('touch'),false);assert.equal(f.controls.consumeAttack(),false);
    f.document.exitPointerLock=()=>{f.document.exits++;};
    emit(f.canvas,'pointerdown',{pointerId:11,pointerType:'touch',button:0,clientX:300,clientY:300});
    assert.equal(f.document.pointerLockElement,f.canvas,'the native lock release is intentionally still pending');assert.equal(f.controls.consumeAttack(),false);assert.equal(f.canvas.hasPointerCapture(11),true);
    emit(f.document,'mousemove',{movementX:100,movementY:100});assert.deepEqual(f.controls.consumeLook(),{x:0,y:0});f.document.pointerLockElement=null;emit(f.document,'pointerlockchange');assert.equal(f.controls.active,true);
  },{coarse:true,pointerLock:true});

  check('HUD target highlighting and recharge reflect supplied state', (f) => {
    f.controls.updateHud(3, 12, 59.6, 'Building', .25);
    assert.equal(f.get('destroyed-count').textContent, '3');
    assert.equal(f.get('score-progress').style.width, '25%');
    assert.equal(f.get('charge-progress').style.width, '25%');
    assert.equal(f.get('pulse-button').classList.contains('cooldown'), true);
    assert.equal(f.document.querySelector('.crosshair').classList.contains('has-target'), true);
    f.controls.updateHud(3, 12, 60, '', 1);
    assert.equal(f.get('target-label').textContent, '');
    assert.equal(f.document.querySelector('.crosshair').classList.contains('has-target'), false);
    assert.equal(f.get('pulse-button').classList.contains('cooldown'), false);
  });

  await writeFile(path.join(artifactDirectory, 'controls-verification.json'), JSON.stringify({
    verifiedAt: new Date().toISOString(),
    environment: 'Node.js, transpiled real controls.ts, minimal DOM/EventTarget doubles; one held-jump landing check uses actual Simulation/Rapier',
    limitations: 'Not a browser, rendering, native-touch, WebGL, or physical mobile performance test.',
    sourceHashes:[{file:'src/controls.ts',sha256:createHash('sha256').update(source).digest('hex')},{file:'src/physics.ts',sha256:createHash('sha256').update(physicsSource).digest('hex')},{file:'public/data/shuttle-stops.json',sha256:createHash('sha256').update(await readFile(path.join(root,'public/data/shuttle-stops.json'))).digest('hex')}],
    tests: results,
  }, null, 2));
  const failures = results.filter((result) => result.status === 'failed');
  console.log(`Controls checks: ${results.length - failures.length} passed, ${failures.length} failed. DOM doubles and one actual Simulation landing case; no browser or device was used.`);
  if (failures.length) process.exitCode = 1;
} finally {
  for (const [name, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
