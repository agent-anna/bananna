const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();
const Q_PATH = path.join(ROOT, "strayd/promo-queue.json");
const DB_PATH = path.join(ROOT, "strayd/songs-db.json");
const OUT = path.join(ROOT, "promo-gate");
const mode = (process.env.PROMO_MODE || "PREPARE_DAILY").trim();
const targetId = (process.env.PROMO_TASK_ID || "").trim();
const note = (process.env.PROMO_NOTE || "").trim();
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function run() {
  const raw = JSON.parse(fs.readFileSync(Q_PATH, "utf8"));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, "utf8")) : null;
  const songs = db && Array.isArray(db.songs) ? db.songs : [];
  let item = (targetId && items.find(x => String(x.id).toLowerCase() === targetId.toLowerCase() || String(x.title).toLowerCase() === targetId.toLowerCase())) || items.find(x => x.status === "awaiting_review") || items.find(x => !x.status || x.status === "pending");
  if (!item && mode === "PREPARE_DAILY" && songs.length > 0) {
    const queuedIds = new Set(items.map(x => String(x.id).toLowerCase()));
    const nextSong = (targetId && songs.find(s => String(s.id).toLowerCase() === targetId.toLowerCase() || String(s.title).toLowerCase() === targetId.toLowerCase())) || songs.find(s => (!s.promoStatus || s.promoStatus === "unqueued") && !queuedIds.has(String(s.id).toLowerCase()));
    if (nextSong) {
      item = { id: nextSong.id, title: nextSong.title, artist: nextSong.artist || "Martin Strayd", art: nextSong.art, link: nextSong.portalUrl || "https://martinstrayd.github.io/artist/", status: "pending", visualStyle: "Realistic live-action only (no cartoon)" };
      items.push(item);
    }
  }
  if (!item) { console.log("NO_ITEM"); return; }
  const now = new Date().toISOString();
  item.status = mode === "OK_PUSH" ? "pushed" : mode === "FAIL" ? "failed" : "awaiting_review";
  if (mode === "OK_PUSH") item.pushedAt = now; else if (mode === "FAIL") { item.failedAt = now; item.failReason = note || "FAIL"; } else item.preparedAt = now;
  if (db && songs.length > 0) {
    const dbSong = songs.find(s => String(s.id).toLowerCase() === String(item.id).toLowerCase());
    if (dbSong) dbSong.promoStatus = item.status;
    db.updatedAt = now;
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
  }
  fs.mkdirSync(OUT, { recursive: true });
  const pkg = { updatedAt: now, mode, item, visualRule: "Realistic live-action only (no cartoon)", xPost: `${item.artist} — "${item.title}" (${item.id}) ${item.link} #MartinStrayd #STRAYD`, fbPost: `"${item.title}" — ${item.artist}\nDirect MP3 + art bundle: ${item.link}`, liveActionPrompt: `STRICTLY REALISTIC LIVE-ACTION CINEMATOGRAPHY ONLY — NO CARTOON. Real camera footage for "${item.title}" by ${item.artist} using art "${item.art}".` };
  fs.writeFileSync(path.join(OUT, "latest-package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  const html = `<!doctype html><html><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px"><h1>${esc(item.title)} (${esc(item.id)})</h1><p>Artist: ${esc(item.artist)} | Status: <b>${esc(item.status)}</b> | Visual: Realistic live-action only (no cartoon)</p><p>Link: ${esc(item.link)}</p><pre>${esc(JSON.stringify(pkg, null, 2))}</pre></body></html>`;
  fs.writeFileSync(path.join(OUT, "latest-review.html"), html, "utf8");
  if (Array.isArray(raw)) fs.writeFileSync(Q_PATH, JSON.stringify(items, null, 2) + "\n", "utf8"); else { raw.items = items; raw.lastUpdated = now; fs.writeFileSync(Q_PATH, JSON.stringify(raw, null, 2) + "\n", "utf8"); }
  console.log("DONE:" + mode + ":" + item.id + ":" + item.status);
}
run();
