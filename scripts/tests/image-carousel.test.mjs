import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const file = "src/components/home/ImageCarousel.tsx";
const images = [
  { image: "storage/phone.webp", link: "/search/celulares", title: "Celulares: ilustración de categoría" },
  { image: "/storage/computer.webp", link: "computadores", title: "Computadores: ilustración de categoría" },
  { image: "https://images.example.test/accessory.webp", link: "/search/accesorios", title: "Accesorios: ilustración de categoría" },
];
const ImageFixture = ({ src, alt, className }) => React.createElement("img", { src, alt, className });
const IconFixture = (props) => React.createElement("svg", props);
function load(file, dependencies, globals = {}) {
  const fixtureModule = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, { ...globals, module: fixtureModule, exports: fixtureModule.exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return fixtureModule.exports;
}
const documentContract = load("src/lib/storefront-experience/document.ts", {});
const dependencies = (react) => ({
  react, "react/jsx-runtime": jsx,
  "next/link": { __esModule: true, default: "a" },
  "next/image": { __esModule: true, default: ImageFixture },
  "@heroicons/react/24/solid": { PauseIcon: IconFixture, PlayIcon: IconFixture },
  "@/components/common/Shimmer": { Shimmer: "shimmer-fixture" },
  "@/lib/storefront-experience/document": documentContract,
});
const walk = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
const nodes = (node, predicate) => walk(node).filter(predicate);
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

// Runs the actual component's handlers/effects with deterministic hooks and
// browser signals. It is a unit harness, not a DOM or physical-touch proof.
function harness({ values = images, editorial = true, reduced = false } = {}) {
  let props = { options: { images: values }, editorial }, cursor = 0, dirty = false, tree, sequence = 0;
  const state = [], effects = [], subscriptions = [], timers = new Map(), timeouts = new Map(), focus = [];
  let pending = [];
  const motionListeners = new Set(), visibilityListeners = new Set(), blurListeners = new Set();
  const media = { matches: reduced, addEventListener: (_name, fn) => motionListeners.add(fn), removeEventListener: (_name, fn) => motionListeners.delete(fn) };
  const browserDocument = { hidden: false, addEventListener: (_name, fn) => visibilityListeners.add(fn), removeEventListener: (_name, fn) => visibilityListeners.delete(fn) };
  const browserWindow = { location: { origin: "https://fixture.example.test" }, matchMedia: () => media,
    addEventListener: (_name, fn) => blurListeners.add(fn), removeEventListener: (_name, fn) => blurListeners.delete(fn) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => {
      const next = typeof value === "function" ? value(state[i]) : value;
      if (!Object.is(next, state[i])) { state[i] = next; dirty = true; }
    }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useCallback(callback, deps) { const i = cursor++; if (!same(state[i]?.deps, deps)) state[i] = { callback, deps }; return state[i].callback; },
    useEffect(callback, deps) { const i = cursor++; if (!same(effects[i]?.deps, deps)) pending.push(() => {
      effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: callback() };
    }); },
    useSyncExternalStore(subscribe, snapshot) { const i = cursor++; if (!subscriptions[i]) subscriptions[i] = subscribe(() => { dirty = true; }); return snapshot(); },
  };
  const Carousel = load(file, dependencies(hooks), { window: browserWindow, document: browserDocument,
    setInterval(fn, delay) { assert.equal(delay, 5000); const id = ++sequence; timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id),
    setTimeout(fn) { const id = ++sequence; timeouts.set(id, fn); return id; }, clearTimeout: id => timeouts.delete(id),
  }).default;
  const flush = () => {
    let attempts = 0;
    do {
      assert.ok(attempts++ < 20, "Render must settle"); cursor = 0; dirty = false; pending = []; tree = Carousel(props);
      for (const node of walk(tree)) if (typeof node.props?.ref === "function") node.props.ref({ focus() { focus.push(node.props["aria-label"]); } });
      for (const effect of pending) effect();
    } while (dirty);
    return tree;
  };
  const invoke = (node, name, event = {}) => { assert.equal(typeof node?.props[name], "function", `Missing actual handler ${name}`); node.props[name](event); flush(); };
  const panel = () => nodes(tree, n => n.props?.className?.includes("aspect-[1.97/1]"))[0];
  const slides = () => nodes(tree, n => n.props?.["aria-roledescription"] === "diapositiva");
  const dots = () => nodes(tree, n => n.type === "button" && /^Mostrar diapositiva/.test(n.props["aria-label"]));
  const pause = () => nodes(tree, n => n.type === "button" && !/^Mostrar diapositiva/.test(n.props["aria-label"]))[0];
  flush();
  return {
    get tree() { return tree; }, timers, timeouts, focus, panel, slides, dots, pause, invoke,
    active: () => slides().findIndex(n => n.props["aria-hidden"] === false),
    tick() { for (const callback of [...timers.values()]) callback(); flush(); },
    update(values) { props = { ...props, options: { images: values } }; flush(); },
    motion(value) { media.matches = value; motionListeners.forEach(fn => fn()); flush(); },
    visibility(value) { browserDocument.hidden = value; visibilityListeners.forEach(fn => fn()); flush(); },
    blur() { blurListeners.forEach(fn => fn()); flush(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); subscriptions.forEach(cleanup => cleanup?.()); },
    listeners: () => motionListeners.size + visibilityListeners.size + blurListeners.size,
  };
}
const pointer = (x, y = 20, extra = {}) => ({ pointerId: 1, isPrimary: true, button: 0, pointerType: "touch", clientX: x, clientY: y, target: { closest: () => null }, ...extra });
const keyboard = (key) => ({ key, altKey: false, ctrlKey: false, metaKey: false, prevented: false, preventDefault() { this.prevented = true; } });

test("three slides retain layout, titles and distinct editorial/legacy destinations; only the active link is interactive", () => {
  const h = harness();
  assert.equal(h.slides().length, 3);
  assert.equal(h.active(), 0);
  assert.equal(h.panel().props.className, "group relative w-full overflow-hidden rounded-xl md:rounded-2xl aspect-[1.97/1]");
  assert.deepEqual(nodes(h.tree, n => n.type === "a").map(n => n.props.href), ["/search/celulares", "/search/computadores", "/search/accesorios"]);
  for (let i = 0; i < 3; i++) {
    const slide = h.slides()[i], link = nodes(slide, n => n.type === "a")[0];
    assert.equal(slide.props.inert, i !== 0);
    assert.equal(link.props.tabIndex, i === 0 ? 0 : -1);
    if (i) assert.match(slide.props.className, /pointer-events-none/);
  }
  assert.equal(nodes(h.tree, n => n.type === ImageFixture)[0].props.alt, images[0].title);
  h.unmount();
  const legacy = harness({ values: [{ ...images[0], link: "old-category" }], editorial: false });
  assert.equal(nodes(legacy.tree, n => n.type === "a")[0].props.href, "/search/old-category");
  legacy.unmount();
});

test("SSR and first client image destinations are deterministic without window-origin rewriting", () => {
  const Carousel = load(file, dependencies(React)).default;
  const markup = renderToStaticMarkup(React.createElement(Carousel, { options: { images }, editorial: true }));
  assert.match(markup, /src="\/storage\/phone.webp"/);
  assert.match(markup, /aria-roledescription="carrusel"/);
  assert.equal((markup.match(/inert=""/g) || []).length, 2);
  const h = harness();
  assert.equal(nodes(h.tree, n => n.type === ImageFixture)[0].props.src, "/storage/phone.webp");
  h.unmount();
});

test("one bounded autoplay timer cycles all three slides and is cleared on unmount", () => {
  const h = harness();
  assert.equal(h.timers.size, 1);
  for (const index of [1, 2, 0]) { h.tick(); assert.equal(h.active(), index); assert.equal(h.timers.size, 1); }
  h.unmount();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners(), 0);
});

test("manual pause and dot navigation survive hover exit, focus and arbitrary time without stale restart timeouts", () => {
  const h = harness();
  h.invoke(h.pause(), "onClick");
  assert.equal(h.timers.size, 0);
  h.invoke(h.panel(), "onPointerEnter", { pointerType: "mouse" });
  h.invoke(h.panel(), "onPointerLeave");
  assert.equal(h.timers.size, 0);
  h.invoke(h.pause(), "onClick");
  assert.equal(h.timers.size, 1);
  h.invoke(h.dots()[2], "onClick");
  assert.equal(h.active(), 2);
  assert.equal(h.timers.size, 0);
  assert.equal(h.timeouts.size, 0);
  h.invoke(h.panel(), "onPointerLeave"); h.tick();
  assert.equal(h.active(), 2);
  h.invoke(h.pause(), "onClick"); h.invoke(h.panel(), "onFocusCapture");
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("pointer focus before click cannot reverse Pause intent; keyboard focus pauses and explicit activation resumes", () => {
  const h = harness();
  const pointerPress = () => {
    const button = h.pause();
    const event = pointer(30, 20, { pointerType: "mouse", target: { closest: () => button } });
    button.props.onPointerDown?.(event);
    h.invoke(h.panel(), "onPointerDown", event);
  };
  h.invoke(h.panel(), "onPointerEnter", { pointerType: "mouse" });
  assert.equal(h.pause().props["aria-label"], "Pausar carrusel");
  pointerPress();
  h.invoke(h.panel(), "onFocusCapture");
  h.invoke(h.panel(), "onLostPointerCapture");
  h.invoke(h.pause(), "onClick", { detail: 1 });
  h.invoke(h.panel(), "onPointerLeave");
  assert.equal(h.timers.size, 0, "The first pointer click on Pause must stay paused after hover ends");
  assert.equal(h.pause().props["aria-label"], "Reanudar carrusel");
  pointerPress();
  h.invoke(h.panel(), "onFocusCapture");
  h.invoke(h.pause(), "onClick", { detail: 1 });
  assert.equal(h.timers.size, 1);
  h.invoke(h.panel(), "onFocusCapture");
  assert.equal(h.timers.size, 0);
  h.invoke(h.pause(), "onClick", { detail: 0 });
  assert.equal(h.timers.size, 1, "Keyboard activation explicitly resumes after focus paused rotation");
  h.invoke(h.pause(), "onClick", { detail: 0 });
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("hover and hidden-document pauses are independent and never create parallel timers", () => {
  const h = harness();
  h.invoke(h.panel(), "onPointerEnter", { pointerType: "mouse" }); assert.equal(h.timers.size, 0);
  h.visibility(true); h.invoke(h.panel(), "onPointerLeave"); assert.equal(h.timers.size, 0);
  h.visibility(false); assert.equal(h.timers.size, 1);
  h.invoke(h.panel(), "onPointerEnter", { pointerType: "touch" }); assert.equal(h.timers.size, 1);
  h.unmount();
});

test("reduced-motion disables rotation and shimmer, keeps manual navigation and cleans subscriptions", () => {
  const h = harness({ reduced: true });
  assert.equal(h.timers.size, 0); assert.equal(h.pause().props.disabled, true);
  assert.equal(nodes(h.tree, n => n.type === "shimmer-fixture").length, 0);
  assert.ok(h.slides().every(n => n.props.className.includes("motion-reduce:transition-none")));
  h.invoke(h.dots()[1], "onClick"); assert.equal(h.active(), 1);
  h.motion(false); assert.equal(h.timers.size, 0, "Preference changes do not override a user's manual pause");
  h.invoke(h.pause(), "onClick"); assert.equal(h.timers.size, 1);
  h.motion(true); assert.equal(h.timers.size, 0);
  h.unmount(); assert.equal(h.listeners(), 0);
});

test("arrow, Home and End keys select bounded slides, pause playback and move focus out of an inactive link", () => {
  const h = harness();
  for (const [key, expected] of [["ArrowLeft", 2], ["ArrowRight", 0], ["End", 2], ["Home", 0]]) {
    const event = keyboard(key); h.invoke(h.panel(), "onKeyDown", event);
    assert.equal(event.prevented, true); assert.equal(h.active(), expected);
    assert.equal(h.focus.at(-1), `Mostrar diapositiva ${expected + 1} de 3`);
    assert.equal(h.timers.size, 0);
  }
  const ordinary = keyboard("Tab"); h.invoke(h.panel(), "onKeyDown", ordinary); assert.equal(ordinary.prevented, false);
  const modified = { ...keyboard("ArrowRight"), ctrlKey: true }; h.invoke(h.panel(), "onKeyDown", modified); assert.equal(modified.prevented, false);
  h.unmount();
});

test("horizontal swipe advances once and suppresses its link click; vertical scroll and taps retain native behavior", () => {
  const h = harness();
  assert.equal(h.panel().props.style.touchAction, "pan-y");
  h.invoke(h.panel(), "onPointerDown", pointer(180)); assert.equal(h.timers.size, 0, "A held gesture cannot race the autoplay timer");
  h.tick(); assert.equal(h.active(), 0); h.invoke(h.panel(), "onPointerUp", pointer(70));
  assert.equal(h.active(), 1); assert.equal(h.timers.size, 0);
  h.invoke(h.panel(), "onLostPointerCapture");
  const click = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  h.invoke(h.panel(), "onClickCapture", click); assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  h.invoke(h.panel(), "onPointerDown", pointer(50, 20)); h.invoke(h.panel(), "onPointerUp", pointer(45, 150));
  assert.equal(h.active(), 1);
  const tap = { ...click, prevented: false, stopped: false }; h.invoke(h.panel(), "onClickCapture", tap); assert.equal(tap.prevented, false);
  h.unmount();
});

test("completed swipe keeps its compatibility-click suppression through pointer leave", () => {
  const h = harness();
  h.invoke(h.panel(), "onPointerDown", pointer(190));
  h.invoke(h.panel(), "onPointerUp", pointer(40));
  h.invoke(h.panel(), "onLostPointerCapture");
  h.invoke(h.panel(), "onPointerLeave");
  const click = { detail: 1, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  h.invoke(h.panel(), "onClickCapture", click);
  assert.equal(h.active(), 1);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  h.unmount();
});

test("swipe without compatibility click cannot swallow keyboard activation or a new pointer press", () => {
  const h = harness();
  const swipe = () => { h.invoke(h.panel(), "onPointerDown", pointer(190)); h.invoke(h.panel(), "onPointerUp", pointer(40)); };
  swipe();
  const keyboardClick = { detail: 0, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  h.invoke(h.panel(), "onClickCapture", keyboardClick);
  assert.equal(keyboardClick.prevented, false);
  assert.equal(keyboardClick.stopped, false);
  h.invoke(h.pause(), "onClick", keyboardClick); assert.equal(h.timers.size, 1);
  swipe();
  const button = h.pause();
  const press = pointer(30, 20, { target: { closest: () => button } });
  button.props.onPointerDown?.(press);
  h.invoke(h.panel(), "onPointerDown", press);
  const pointerClick = { ...keyboardClick, detail: 1 };
  h.invoke(h.panel(), "onClickCapture", pointerClick);
  assert.equal(pointerClick.prevented, false, "A new button press is not the previous swipe's compatibility click");
  h.invoke(h.pause(), "onClick", pointerClick); assert.equal(h.timers.size, 1);
  h.unmount();
});

test("cancel, pointer exit, lost capture, window blur and a second pointer cannot leak a stale gesture", () => {
  const h = harness();
  for (const cancel of ["onPointerCancel", "onPointerLeave", "onLostPointerCapture", "blur"]) {
    h.invoke(h.panel(), "onPointerDown", pointer(190));
    if (cancel === "blur") h.blur(); else h.invoke(h.panel(), cancel);
    h.invoke(h.panel(), "onPointerUp", pointer(40)); assert.equal(h.active(), 0);
  }
  h.invoke(h.panel(), "onPointerDown", pointer(190));
  h.invoke(h.panel(), "onPointerDown", pointer(500, 20, { pointerId: 2, isPrimary: false }));
  h.invoke(h.panel(), "onPointerUp", pointer(40, 20, { pointerId: 2 })); assert.equal(h.active(), 0);
  h.invoke(h.panel(), "onPointerUp", pointer(40)); assert.equal(h.active(), 1);
  h.unmount();
});

test("loaded images stop shimmer; an image error is bounded to its slide and leaves its category link usable", () => {
  const h = harness();
  const original = nodes(h.tree, n => n.type === ImageFixture);
  h.invoke(original[0], "onLoad"); assert.equal(nodes(h.tree, n => n.type === "shimmer-fixture").length, 2);
  h.invoke(original[1], "onError");
  assert.equal(nodes(h.tree, n => n.type === ImageFixture).length, 2);
  const fallback = nodes(h.tree, n => n.props?.role === "img");
  assert.equal(fallback.length, 1); assert.match(fallback[0].props["aria-label"], /Computadores.*imagen no disponible/);
  h.invoke(h.dots()[1], "onClick"); assert.equal(nodes(h.slides()[1], n => n.type === "a")[0].props.href, "/search/computadores");
  h.update([{ ...images[1], image: "/storage/replacement.webp" }]); assert.equal(nodes(h.tree, n => n.type === ImageFixture).length, 1);
  h.unmount();
});

test("empty, missing and single-slide data do not rotate; shrinking an edited list always keeps an active slide", () => {
  for (const values of [[], undefined, null]) { const h = harness(); h.update(values); assert.equal(h.tree, null); assert.equal(h.timers.size, 0); h.unmount(); }
  const h = harness(); h.invoke(h.dots()[2], "onClick"); h.update([images[0]]);
  assert.equal(h.active(), 0); assert.equal(h.timers.size, 0); assert.equal(h.dots().length, 0);
  h.update([]); assert.equal(h.tree, null); assert.equal(h.timers.size, 0);
  h.unmount();
});

test("actual controls keep the existing monochrome palette with 44px targets and contrast over the lightest possible image", () => {
  const h = harness();
  const controls = nodes(h.tree, n => n.props?.["aria-label"] === "Controles del carrusel")[0];
  assert.match(controls.props.className, /bg-black\/60/);
  assert.match(controls.props.className, /(?:^| )bottom-1(?: |$)/);
  assert.match(controls.props.className, /(?:^| )py-0(?: |$)/);
  assert.match(controls.props.className, /md:bottom-6/);
  assert.match(controls.props.className, /md:py-2/);
  for (const button of [h.pause(), ...h.dots()]) assert.match(button.props.className, /h-11 w-11/);
  const inactive = nodes(h.dots()[1], n => n.type === "span")[0];
  assert.match(inactive.props.className, /bg-white\/80/);
  const linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const background = 1 - Number(controls.props.className.match(/bg-black\/(\d+)/)[1]) / 100;
  const dotAlpha = Number(inactive.props.className.match(/bg-white\/(\d+)/)[1]) / 100;
  const inactiveColor = dotAlpha + background * (1 - dotAlpha);
  assert.ok((linear(1) + 0.05) / (linear(background) + 0.05) >= 4.5);
  assert.ok((linear(inactiveColor) + 0.05) / (linear(background) + 0.05) >= 3);
  h.unmount();
});

test("blank/invalid editorial links remain unlinked, missing image has a safe fallback, and existing editor capacity is not clamped to Demo's three", () => {
  const h = harness({ values: [{ image: "", title: "Sin imagen", link: "javascript:alert(1)" }, { ...images[0], link: "" }] });
  assert.equal(nodes(h.tree, n => n.type === "a").length, 0);
  assert.equal(nodes(h.tree, n => n.props?.role === "img").length, 1);
  h.update(Array.from({ length: 20 }, (_, i) => ({ ...images[0], title: `Imagen ${i + 1}` })));
  assert.equal(h.slides().length, 20); assert.equal(h.dots().length, 20);
  h.invoke(h.panel(), "onKeyDown", keyboard("End")); assert.equal(h.active(), 19);
  h.unmount();
});
