// Records the AccountSignal demo walkthrough as crisp frames via the Chrome DevTools screencast.
// Each scene lasts as long as its narration (durations.json), so voice and screen line up.
//   node record.mjs http://localhost:5126
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:5126";
const durations = JSON.parse(readFileSync("durations.json", "utf8"));
const PAD = 0.7; // seconds of breathing room after each narration line
const W = 1280;
const H = 800;

rmSync("frames", { recursive: true, force: true });
mkdirSync("frames");

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

// A visible cursor (headless Chrome draws none) with a click ripple.
await page.addInitScript(() => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 10-7 1.5L8.5 21z" fill="#26251e" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      transform: `translate(${window.__cx ?? 640}px, ${window.__cy ?? 400}px)`,
      filter: "drop-shadow(0 2px 3px rgb(0 0 0 / .25))",
    });
    document.body.appendChild(c);
    addEventListener(
      "mousemove",
      (e) => {
        window.__cx = e.clientX;
        window.__cy = e.clientY;
        c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
      },
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        Object.assign(r.style, {
          position: "fixed",
          left: `${e.clientX - 18}px`,
          top: `${e.clientY - 18}px`,
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "rgb(19 105 230 / .3)",
          zIndex: "2147483646",
          pointerEvents: "none",
          transition: "transform .45s ease-out, opacity .45s ease-out",
        });
        document.body.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transform = "scale(1.8)";
          r.style.opacity = "0";
        });
        setTimeout(() => r.remove(), 500);
      },
      true,
    );
  };
  if (document.body) install();
  else addEventListener("DOMContentLoaded", install);
});

// ── Screencast capture ──────────────────────────────────────────────────
const cdp = await context.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `frames/f${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mouse = { x: 640, y: 400 };
async function moveTo(x, y, ms = 700) {
  // Time-based: however slow each mouse event is, the move takes ~ms.
  const from = { ...mouse };
  const start = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - start) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    if (k >= 1) break;
    await sleep(16);
  }
  mouse = { x, y };
}
async function moveToEl(locator, ms) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("element not visible");
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(locator, ms = 700) {
  await moveToEl(locator, ms);
  await sleep(150);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}
async function scrollBy(dy, ms = 1200) {
  await page.evaluate(
    ([dy, ms]) =>
      new Promise((done) => {
        const start = scrollY;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          scrollTo(0, start + dy * e);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [dy, ms],
  );
}

const marks = [];
let t0 = 0;
async function scene(id, fn) {
  const start = Date.now();
  marks.push({ id, at: (start - t0) / 1000 });
  await fn();
  const want = (durations[id] + PAD) * 1000;
  const left = want - (Date.now() - start);
  if (left > 0) await sleep(left);
  console.log(
    `${id}: ${((Date.now() - start) / 1000).toFixed(1)}s (narration ${durations[id].toFixed(1)}s)`,
  );
}

// Load the first page before recording starts, so the video opens on a finished screen.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.mouse.move(mouse.x, mouse.y);
await sleep(1200);
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 88,
  maxWidth: W,
  maxHeight: H,
  everyNthFrame: 1,
});
t0 = Date.now();
const wallStart = Date.now() / 1000;

await scene("intro", async () => {
  await sleep(600);
  await moveTo(330, 230, 1200);
  await sleep(1500);
  await moveToEl(page.getByRole("button", { name: "Try the demo" }), 1000);
  await sleep(1200);
  await moveTo(900, 330, 1200);
});

await scene("icp", async () => {
  await click(page.getByRole("link", { name: /New analysis/ }), 900);
  await page.waitForURL(/\/icp/);
  await sleep(1400);
  await moveToEl(page.locator("#icp-ind"), 800);
  await sleep(700);
  await scrollBy(320, 1600);
  await sleep(700);
  await scrollBy(380, 1600);
  await sleep(500);
  await moveToEl(page.getByRole("button", { name: /Save and continue/ }), 900);
});

await scene("upload", async () => {
  await click(page.getByRole("button", { name: /Save and continue/ }), 400);
  await page.waitForURL(/\/new$/);
  await sleep(1300);
  await moveTo(520, 420, 900);
  await sleep(1400);
  await click(page.getByRole("button", { name: "Use sample file" }), 900);
  await page.waitForURL(/\/preview$/);
});

await scene("preview", async () => {
  await sleep(700);
  await moveTo(640, 300, 900);
  await sleep(800);
  await scrollBy(360, 1600);
  await sleep(900);
  await scrollBy(320, 1400);
  await sleep(900);
  await scrollBy(-680, 1300);
  await moveToEl(page.getByRole("button", { name: "Continue" }), 900);
});

await scene("review", async () => {
  await click(page.getByRole("button", { name: "Continue" }), 300);
  await page.waitForURL(/\/review$/);
  await page.getByText("Olostep credits").first().waitFor();
  await sleep(1200);
  await moveToEl(page.getByText("Estimated cost"), 1000);
  await sleep(1800);
  await moveToEl(page.getByText("No API key"), 900);
  await sleep(1200);
});

await scene("run", async () => {
  await click(page.getByRole("link", { name: "AccountSignal" }).first(), 900);
  await page.waitForURL(`${BASE}/`);
  await sleep(700);
  await click(page.getByRole("button", { name: "Try the demo" }), 900);
  await page.waitForURL(/\/runs\//);
  await sleep(1200);
  await moveTo(900, 300, 1200);
  await page.getByText("Prioritised accounts").waitFor({ timeout: 30_000 });
});

await scene("results", async () => {
  await moveToEl(page.getByRole("button", { name: /^Act now/ }).first(), 700);
  await sleep(500);
  await scrollBy(420, 1300);
  const dot = page.locator('g[role="link"]').first();
  const b = await dot.boundingBox();
  if (b) await moveTo(b.x + b.width / 2, b.y + b.height / 2, 800);
  await sleep(1300);
  await scrollBy(520, 1300);
  await sleep(400);
});

await scene("account", async () => {
  const card = page.locator('a[href*="/accounts/"]').filter({ hasText: "Nimbus" }).last();
  await click(card, 900);
  await page.waitForURL(/\/accounts\//);
  await sleep(2200);
  await moveTo(420, 380, 900);
  await sleep(1500);
  await scrollBy(560, 1800);
  await sleep(1200);
  await scrollBy(420, 1500);
  await sleep(800);
});

await scene("outro", async () => {
  await click(page.getByRole("link", { name: /demo-accounts\.csv/ }), 900);
  await page.waitForURL(/\/runs\/[^/]+$/);
  await sleep(900);
  await moveToEl(page.getByRole("link", { name: /Export CSV/ }), 1100);
  await sleep(2000);
  await click(page.getByRole("link", { name: "AccountSignal" }).first(), 1000);
  await sleep(1500);
  await moveTo(330, 260, 1200);
});

await sleep(400);
await cdp.send("Page.stopScreencast");
const wallEnd = Date.now() / 1000;
await browser.close();

// ffmpeg concat list: each frame shown until the next one arrives.
const list = [];
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? frames[i + 1].t : frames[i].t + (wallEnd - frames[i].t);
  const dur = Math.max(0.001, next - frames[i].t);
  list.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`);
}
list.push(`file '${frames.at(-1).file}'`);
writeFileSync("frames.txt", list.join("\n") + "\n");
// Offset between the recording clock and the first frame, so audio lines up with video.
const lead = frames[0].t - wallStart;
writeFileSync("marks.json", JSON.stringify({ lead, total: wallEnd - wallStart, marks }, null, 2));
console.log(
  `frames: ${frames.length}, length ${(wallEnd - wallStart).toFixed(1)}s, lead ${lead.toFixed(2)}s`,
);
