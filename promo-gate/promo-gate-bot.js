(() => {
  const DEFAULT_CFG = {
    owner: "agent-anna",
    repo: "anna-v2",
    branch: "main",
    workflowFile: "daily-song-promo.yml",
    packagePath: "promo-gate/latest-package.json",
    reviewPath: "promo-gate/latest-review.html",
    queuePath: "strayd/promo-queue.json",
    publishWebhookUrl: "",
    token: ""
  };

  const PROMO_BIBLE = [
    "1. IDENTITY: Portal is STRAYD. Never rebrand or drift into unrelated apps. Music is Martin Strayd played/promoted with Kunda Cafe.",
    "2. VISUAL LAW: Strictly realistic live-action cinematography only. ZERO cartoon, ZERO anime, ZERO illustration.",
    "3. TRUTH OVER GUESSWORK: Never claim a post went live on X, TikTok, or YouTube without a confirmed API/webhook response.",
    "4. GATE DISCIPLINE: Prepare -> Inspect latest-review.html / latest-package.json -> GO PUSH (dispatch workflow) -> Verify run & commit.",
    "5. SECRET SAFETY: Keep PATs in local browser storage or GitHub Secrets; never paste live tokens into chat."
  ].join("\n");

  const STORAGE_KEY = "veg_anna_aa01_promo_gate_cfg_v1";

  function loadCfg() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULT_CFG, ...saved };
    } catch {
      return { ...DEFAULT_CFG };
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function ghHeaders(token) {
    const h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token && token.trim()) {
      h.Authorization = `Bearer ${token.trim()}`;
    }
    return h;
  }

  function decodeB64Utf8(b64) {
    const clean = (b64 || "").replace(/\s+/g, "");
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchRepoFile(cfg, path) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(cfg.branch)}`;
    const res = await fetch(url, { headers: ghHeaders(cfg.token) });
    if (!res.ok) {
      throw new Error(`GET ${path} failed (${res.status})`);
    }
    const data = await res.json();
    return decodeB64Utf8(data.content);
  }

  async function fetchLatestRuns(cfg) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflowFile}/runs?per_page=3`;
    const res = await fetch(url, { headers: ghHeaders(cfg.token) });
    if (!res.ok) {
      throw new Error(`GET workflow runs failed (${res.status})`);
    }
    const data = await res.json();
    return data.workflow_runs || [];
  }

  async function dispatchWorkflow(cfg, { mode, task_id = "", note = "" }) {
    if (!cfg.token || !cfg.token.trim()) {
      throw new Error("GitHub PAT required in Promo Bot settings to dispatch workflow.");
    }
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflowFile}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...ghHeaders(cfg.token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: cfg.branch,
        inputs: {
          mode: String(mode || "PREPARE_DAILY"),
          task_id: String(task_id || ""),
          note: String(note || "STRAYDO PUSH")
        }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Dispatch failed (${res.status}): ${errText}`);
    }
    return true;
  }

  async function triggerExternalPublish(cfg, pkg) {
    if (!cfg.publishWebhookUrl || !cfg.publishWebhookUrl.trim()) {
      return {
        dispatched: false,
        reason: "No publishWebhookUrl configured yet (workflow committed repo package only; X/TikTok/YouTube webhook not connected)."
      };
    }
    const res = await fetch(cfg.publishWebhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portal: "VEG ANNA AA01",
        visualRule: "Realistic live-action only (no cartoon)",
        package: pkg
      })
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Publish webhook failed (${res.status}): ${text}`);
    }
    return { dispatched: true, response: text };
  }

  function renderBotPanel(containerId = "veg-anna-promo-bot") {
    let host = document.getElementById(containerId);
    if (!host) {
      host = document.createElement("section");
      host.id = containerId;
      document.body.appendChild(host);
    }

    let cfg = loadCfg();
    let currentPkg = null;

    host.innerHTML = `
      <div style="font-family:system-ui,Segoe UI,sans-serif;background:#0f141c;color:#eef3f8;border:1px solid #263244;border-radius:12px;padding:16px;margin:16px 0;max-width:960px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #222e3f;padding-bottom:10px;">
          <div>
            <div style="font-size:12px;letter-spacing:.08em;color:#8ab4f8;text-transform:uppercase;">VEG ANNA AA01 — Promo Gate Bot</div>
            <div id="pgb-status" style="font-size:14px;margin-top:4px;color:#cbd5e1;">Ready. Click Sync State to read latest-package.json & runs.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="pgb-sync" style="padding:8px 12px;border-radius:8px;border:1px solid #3b82f6;background:#1d4ed8;color:#fff;cursor:pointer;">Sync State</button>
            <button id="pgb-prepare" style="padding:8px 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#f8fafc;cursor:pointer;">Run PREPARE_DAILY</button>
            <button id="pgb-go-push" style="padding:8px 14px;border-radius:8px;border:1px solid #10b981;background:#059669;color:#fff;font-weight:700;cursor:pointer;">GO PUSH</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px;">
          <label style="font-size:12px;color:#94a3b8;">GitHub PAT (saved locally)
            <input id="pgb-token" type="password" value="${cfg.token.replace(/"/g, "&quot;")}" placeholder="ghp_..." style="width:100%;margin-top:4px;padding:7px;border-radius:6px;border:1px solid #334155;background:#090d12;color:#fff;">
          </label>
          <label style="font-size:12px;color:#94a3b8;">GO PUSH Mode
            <input id="pgb-mode" type="text" value="APPROVE_DAILY" style="width:100%;margin-top:4px;padding:7px;border-radius:6px;border:1px solid #334155;background:#090d12;color:#fff;">
          </label>
          <label style="font-size:12px;color:#94a3b8;">Task ID
            <input id="pgb-task" type="text" value="STRAYD-ID-001" style="width:100%;margin-top:4px;padding:7px;border-radius:6px;border:1px solid #334155;background:#090d12;color:#fff;">
          </label>
          <label style="font-size:12px;color:#94a3b8;">Optional Publish Webhook (X / TikTok / YT)
            <input id="pgb-hook" type="text" value="${cfg.publishWebhookUrl.replace(/"/g, "&quot;")}" placeholder="https://..." style="width:100%;margin-top:4px;padding:7px;border-radius:6px;border:1px solid #334155;background:#090d12;color:#fff;">
          </label>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
          <div style="background:#090d12;border:1px solid #1e293b;border-radius:8px;padding:10px;">
            <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">Current Package (A1/promo-gate/latest-package.json)</div>
            <pre id="pgb-pkg" style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#e2e8f0;max-height:240px;overflow:auto;">Not synced yet.</pre>
          </div>
          <div style="background:#090d12;border:1px solid #1e293b;border-radius:8px;tail-height:240px;padding:10px;">
            <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">Anna Promo Bible & Run Log</div>
            <pre id="pgb-log" style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#cbd5e1;max-height:240px;overflow:auto;">${PROMO_BIBLE}</pre>
          </div>
        </div>
      </div>
    `;

    const $ = (id) => host.querySelector(id);
    const setStatus = (msg, isErr = false) => {
      const el = $("#pgb-status");
      el.textContent = msg;
      el.style.color = isErr ? "#f87171" : "#6ee7b7";
    };
    const appendLog = (line) => {
      const el = $("#pgb-log");
      el.textContent = `[${new Date().toISOString()}] ${line}\n` + el.textContent;
    };

    const readInputsToCfg = () => {
      cfg = {
        ...cfg,
        token: $("#pgb-token").value.trim(),
        publishWebhookUrl: $("#pgb-hook").value.trim()
      };
      saveCfg(cfg);
      return cfg;
    };

    async function syncAll() {
      readInputsToCfg();
      setStatus("Syncing latest-package.json and workflow runs...");
      try {
        const [pkgRaw, runs] = await Promise.all([
          fetchRepoFile(cfg, cfg.packagePath),
          fetchLatestRuns(cfg)
        ]);
        currentPkg = JSON.parse(pkgRaw);
        $("#pgb-pkg").textContent = JSON.stringify(currentPkg, null, 2);
        const topRun = runs[0];
        const runSummary = topRun
          ? `Run #${topRun.id} (${topRun.event}) -> status=${topRun.status}, conclusion=${topRun.conclusion || "pending"}`
          : "No workflow runs found.";
        setStatus(`Synced ${currentPkg.item?.id || "package"} | ${runSummary}`);
        appendLog(`SYNC OK: ${runSummary}`);
      } catch (err) {
        setStatus(err.message, true);
        appendLog(`SYNC ERR: ${err.message}`);
      }
    }

    $("#pgb-sync").addEventListener("click", syncAll);

    $("#pgb-prepare").addEventListener("click", async () => {
      readInputsToCfg();
      const taskId = $("#pgb-task").value.trim() || "STRAYD-ID-001";
      setStatus(`Dispatching PREPARE_DAILY for ${taskId}...`);
      try {
        await dispatchWorkflow(cfg, { mode: "PREPARE_DAILY", task_id: taskId, note: "VEG ANNA AA01 PREPARE_DAILY" });
        appendLog(`DISPATCHED PREPARE_DAILY (${taskId})`);
        setStatus(`Dispatched PREPARE_DAILY (${taskId}). Waiting 5s to check run...`);
        setTimeout(syncAll, 5000);
      } catch (err) {
        setStatus(err.message, true);
        appendLog(`DISPATCH ERR: ${err.message}`);
      }
    });

    $("#pgb-go-push").addEventListener("click", async () => {
      readInputsToCfg();
      const mode = $("#pgb-mode").value.trim() || "APPROVE_DAILY";
      const taskId = $("#pgb-task").value.trim() || currentPkg?.item?.id || "STRAYD-ID-001";
      setStatus(`GO PUSH -> dispatching ${mode} for ${taskId}...`);
      try {
        await dispatchWorkflow(cfg, { mode, task_id: taskId, note: "VEG ANNA AA01 GO PUSH" });
        appendLog(`GO PUSH DISPATCHED: mode=${mode}, task_id=${taskId}`);

        const pub = await triggerExternalPublish(cfg, currentPkg);
        if (pub.dispatched) {
          appendLog(`PUBLISH WEBHOOK OK: ${pub.response}`);
        } else {
          appendLog(`NOTE: ${pub.reason}`);
        }

        setStatus(`GO PUSH sent (${mode}). Checking workflow run in 5s...`);
        setTimeout(syncAll, 5000);
      } catch (err) {
        setStatus(err.message, true);
        appendLog(`GO PUSH ERR: ${err.message}`);
      }
    });

    window.VegAnnaPromoBot = { syncAll, dispatchWorkflow, PROMO_BIBLE, cfg };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => renderBotPanel());
  } else {
    renderBotPanel();
  }
})();
