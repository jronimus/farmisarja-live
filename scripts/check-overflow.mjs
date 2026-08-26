// Asserts the page never scrolls sideways, at the widths people actually use.
//
// Horizontal overflow is the one layout bug this project keeps rediscovering by
// eye, always late and always on somebody else's window size. It is cheap to
// test for: a page that fits has documentElement.scrollWidth == clientWidth, and
// when it does not, the offending elements can be named exactly rather than
// hunted. Run it against a dev server:
//
//   npm run dev
//   node scripts/check-overflow.mjs
//
// It loads ?demo=1 on purpose: the demo set is ten managers with long names and
// full transfer lists, so it is both wider than real data and available without
// waiting on the API. The run fails rather than passes if the table never
// appears, because an empty shell fits every width and proves nothing.
//
// Options: --url=http://localhost:5174/?demo=1  --widths=320,390,1280
//
// What it cannot see: content hidden by an ancestor's overflow:hidden. A column
// clipped away rather than pushed out still reports a page that fits, which is
// how the table lost its last column on 1280px windows for weeks. Check widths
// against content separately.
//
// Chrome is driven over the DevTools protocol directly, so this needs no
// dependencies.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 900–1200 is its own layout: the table drops four columns there so it fits a portrait
// monitor or a half-screen window, and that range needs testing like any other.
const DEFAULT_WIDTHS = [320, 360, 375, 390, 414, 768, 800, 900, 1024, 1080, 1200, 1280, 1440, 1920];
const CHROME = process.env.CHROME
  ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("url", "http://localhost:5174/?demo=1");
// Every page, at every width. A nav that fits is not proof the page behind it does.
const urls = [base, `${base}#/hinnat`, `${base}#/uutiset`, `${base}#/tilastot`];
const widths = arg("widths", "").length
  ? arg("widths", "").split(",").map(Number)
  : DEFAULT_WIDTHS;

/** The probe. Runs in the page and reports what sticks out of the viewport. */
const PROBE = `(() => {
  const root = document.documentElement;
  const limit = root.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const over = Math.max(box.right - limit, -box.left);
    if (over <= 1) continue;
    // An element may bleed on purpose as long as an ancestor clips it.
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const overflowX = getComputedStyle(p).overflowX;
      if (overflowX === "hidden" || overflowX === "auto" || overflowX === "scroll") { clipped = true; break; }
    }
    if (clipped) continue;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\\s+/).join(".") : "");
    offenders.push({ name, over: Math.round(over), width: Math.round(box.width) });
  }
  return JSON.stringify({
    scrollWidth: root.scrollWidth,
    clientWidth: limit,
    offenders: offenders.slice(0, 8),
  });
})()`;

/* The highlight picker's menu is absolutely positioned, so a row too wide for it paints
   over the table behind instead of pushing the page: the check above cannot see it, and
   that bug shipped twice. This one opens the menu, walks both of its tabs, and asserts the
   menu contains its own contents. Geometry, not paint — with `overflow:hidden` on the menu
   the same row is clipped rather than spilled, and a clipped owners figure is no better. */
const MENU_PROBE = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const trigger = document.querySelector(".player-picker-button");
  if (!trigger) return JSON.stringify({ skipped: "no picker" });
  trigger.click();
  await wait(150);
  const menu = document.querySelector(".player-picker-menu");
  if (!menu) return JSON.stringify({ skipped: "menu did not open" });
  const offenders = [];
  const check = (tab) => {
    const box = menu.getBoundingClientRect();
    for (const el of menu.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const over = Math.round(Math.max(b.right - box.right, box.left - b.left));
      if (over <= 1) continue;
      const name = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\\s+/).join(".") : "");
      offenders.push({ tab, name, over });
    }
  };
  check("players");
  const rows = menu.querySelectorAll(".player-picker-option").length;
  const clubs = menu.querySelectorAll(".player-picker-tabs button")[1];
  if (clubs) { clubs.click(); await wait(150); check("clubs"); }
  const clubRows = menu.querySelectorAll(".player-picker-option").length;
  document.body.click();
  return JSON.stringify({ rows, clubRows, offenders: offenders.slice(0, 8) });
})()`;

/* Headless Chrome draws overlay scrollbars, so 100vw and the layout width agree
   there and a `width:100vw` bug stays invisible. On a desktop window with a
   classic scrollbar they differ by ~15px and the page is pushed sideways. The
   stylesheets are read directly instead, which catches it at any window size. */
const VIEWPORT_UNITS = `(() => {
  // Only the full-viewport idiom is reported. A capped use such as
  // min(86vw,274px) is safe, because the cap is what wins on a wide window.
  const hits = [];
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.style && /100(vw|dvw|svw|lvw)/.test(rule.cssText)) {
        hits.push({ selector: rule.selectorText, css: rule.cssText.slice(0, 160) });
      }
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* cross-origin, not ours */ }
  }
  return JSON.stringify(hits);
})()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {
      // Chrome is not listening yet.
    }
    await sleep(250);
  }
  throw new Error("Chrome never opened its debugging port");
}

function session(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    // A CDP call that errors carries no result — an evaluate whose execution context was
    // destroyed under it, which is what a dev-server hot reload does mid-measurement. An
    // empty object degrades into "not ready yet" at every call site instead of destructuring
    // undefined and taking the whole run down with it.
    resolve(message.result ?? {});
  });
  return (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const profile = await mkdtemp(join(tmpdir(), "overflow-"));
const port = 9333;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const socket = await connect(port);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
const send = session(socket);
await send("Page.enable");
await send("Runtime.enable");

/** An empty shell fits every width, so wait for real rows before measuring. */
async function waitForContent(send) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { result } = await send("Runtime.evaluate", {
      expression: "document.querySelectorAll('.manager-row, .price-row, .news-row, .stats-line, .data-pending').length",
      returnByValue: true,
    });
    if ((result?.value ?? 0) > 0) {
      await sleep(300); // let webfonts settle before measuring text
      return true;
    }
    await sleep(500);
  }
  return false;
}

const failures = [];
const menuFailures = [];
let menuChecks = 0;
for (const url of urls) {
for (const width of widths) {
  // Below 600px the only real device is a phone, which has overlay scrollbars;
  // a desktop window cannot be dragged that narrow. Emulating a desktop there
  // reserves 15px for a scrollbar that will never exist and reports overflow
  // nobody can see. Above 600px the desktop case is the one that matters.
  const phone = width < 600;
  await send("Emulation.setDeviceMetricsOverride", {
    width, height: 900, deviceScaleFactor: phone ? 2 : 1, mobile: phone,
  });
  await send("Page.navigate", { url });
  if (!await waitForContent(send)) {
    console.error(`FAIL ${width}px ${url} — nothing rendered, so nothing was tested`);
    failures.push({ width, overflow: 0, offenders: [] });
    continue;
  }
  const { result } = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const report = JSON.parse(result.value);
  const overflow = report.scrollWidth - report.clientWidth;
  if (overflow > 1) {
    failures.push({ width, overflow, offenders: report.offenders });
    console.log(`FAIL ${width}px ${url} — page scrolls ${overflow}px sideways`);
    for (const offender of report.offenders) {
      console.log(`       ${offender.name} sticks out ${offender.over}px (width ${offender.width})`);
    }
    if (!report.offenders.length) {
      console.log("       no single element is to blame; look for a min-width on a container");
    }
  } else {
    console.log(`ok   ${width}px  ${url.includes("#/") ? url.slice(url.indexOf("#")) : "/"}`);
  }

  // The picker only exists on the table page, and only where the toolbar shows it.
  if (!url.includes("#/")) {
    // Two attempts. The evaluate comes back without a result when its execution context
    // was destroyed under it — a hot reload landing mid-probe, or the page still settling
    // right after a resize — and that is a transient, not a finding. A real containment
    // failure measures the same geometry on the second run and is still reported.
    let menu = {};
    for (let attempt = 0; attempt < 2 && typeof menu.value !== "string"; attempt += 1) {
      if (attempt) await sleep(500);
      ({ result: menu = {} } = await send("Runtime.evaluate", { expression: MENU_PROBE, returnByValue: true, awaitPromise: true }));
    }
    const menuReport = typeof menu.value === "string" ? JSON.parse(menu.value) : { failed: true };
    if (menuReport.failed) {
      console.error(`FAIL ${width}px menu — the probe did not run`);
      menuFailures.push({ width, offenders: [] });
    } else if (menuReport.skipped) {
      console.log(`     menu ${width}px — skipped, ${menuReport.skipped}`);
    } else if (!menuReport.rows || !menuReport.clubRows) {
      console.error(`FAIL ${width}px menu — a tab rendered no rows, so nothing was tested`);
      menuFailures.push({ width, offenders: [] });
    } else if (menuReport.offenders.length) {
      menuFailures.push({ width, offenders: menuReport.offenders });
      console.log(`FAIL ${width}px menu — the picker paints outside itself`);
      for (const offender of menuReport.offenders) {
        console.log(`       ${offender.tab}: ${offender.name} sticks out ${offender.over}px`);
      }
    } else {
      menuChecks += 1;
      console.log(`ok   ${width}px  picker menu (${menuReport.rows} players, ${menuReport.clubRows} clubs)`);
    }
  }
}
}

const { result: units } = await send("Runtime.evaluate", { expression: VIEWPORT_UNITS, returnByValue: true });
const viewportUnits = JSON.parse(units.value);
if (viewportUnits.length) {
  console.log("\nViewport units in width-affecting properties. These resolve 15px too wide");
  console.log("on any desktop window with a classic scrollbar:");
  for (const hit of viewportUnits) console.log(`       ${hit.css}`);
}

socket.close();
chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

if (failures.length || menuFailures.length || viewportUnits.length) {
  console.error(`\n${failures.length} of ${widths.length * urls.length} widths overflow, `
    + `${menuFailures.length} picker menus paint outside themselves, `
    + `${viewportUnits.length} viewport-unit widths.`);
  process.exit(1);
}
console.log(`\nAll ${widths.length * urls.length} widths and ${menuChecks} picker menus fit.`);
