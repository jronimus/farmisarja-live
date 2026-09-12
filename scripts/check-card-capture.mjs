// Browser regression for Telegram capture: live polling must not prevent card readiness.
// Run against Vite or the deployed site with --url=https://.../.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? "http://localhost:5174/";
const profile = await mkdtemp(join(tmpdir(), "farmisarja-capture-"));
const port = 9334;
const chrome = spawn(process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", windowsHide: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) { socket = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* Chrome is starting. */ }
    await sleep(250);
  }
  assert(socket, "Chrome did not start");
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result?.value;
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1160, height: 1440, deviceScaleFactor: 1, mobile: false });
  const polling = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.captureProbeRequests = 0;
    setInterval(() => { window.captureProbeRequests++; fetch(location.pathname + '?capture-probe=1').catch(() => {}); }, 100);
  ` });
  await mkdir("artifacts/cards", { recursive: true });
  for (const kind of ["deadline", "round", "total", "awards"]) {
    const url = new URL(base);
    url.searchParams.set("card", kind);
    const started = Date.now();
    await send("Page.navigate", { url: url.href });
    let card;
    while (Date.now() - started < 25_000) {
      card = await evaluate(`(() => {
        const card = document.querySelector('.sc-card[data-ready="true"]');
        if (!card) return null;
        const r = card.getBoundingClientRect();
        return { gameweek: card.dataset.gameweek, width: r.width, height: r.height,
          fonts: document.fonts.status, images: [...card.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0),
          requests: window.captureProbeRequests, text: card.innerText };
      })()`);
      if (card) break;
      await sleep(200);
    }
    assert(card, `${kind}: card never became ready within capture timeout`);
    assert.equal(card.width, 1080);
    assert.equal(card.height, 1350);
    assert.equal(card.fonts, "loaded");
    assert(card.images, "Artwork is incomplete");
    assert(card.requests > 1, "Polling was not active");
    const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1160, height: 1440, scale: 1 } });
    await writeFile(`artifacts/cards/capture-${kind}.png`, Buffer.from(data, "base64"));
    console.log(JSON.stringify({ kind, gameweek: card.gameweek, readyMs: Date.now() - started, pollingRequests: card.requests }));
  }
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: polling.identifier });
  // FPL sometimes publishes picks before its live endpoint is ready. Never screenshot
  // the resulting pending model, even though the dashboard itself has finished loading.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const realFetch = window.fetch;
    window.fetch = (...args) => /event\\/\\d+\\/live/.test(String(args[0]))
      ? Promise.resolve(new Response('updating', {status: 503})) : realFetch(...args);
  ` });
  await send("Page.navigate", { url: new URL("?card=deadline", base).href });
  await sleep(6000);
  assert.equal(await evaluate("document.querySelectorAll('.sc-card').length"), 0, "Pending FPL data rendered a card");
  console.log("ok: incomplete FPL data never renders a capturable card");
} finally {
  socket?.close();
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
