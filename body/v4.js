(function () {
    "use strict";

    const GITHUB_REPO_OWNER = "agent-anna";
    const GITHUB_REPO_NAME = "anna-v2";
    const WORKSPACE_ROOT = "A1/v4";
    const SCRAPE_WORKFLOW_FILE = "aa01-intel-feed.yml";
    const DAHL_ENDPOINT = "https://inference.dahl.global/v1/chat/completions";
    const DEFAULT_MODEL = "MiniMaxAI/MiniMax-M2.7";
    const DAHL_TIMEOUT_MS = 30000;
    const MAX_CONTEXT_CHARS = 3500;

    let isVoiceEnabled = true;
    let isFullPageMode = false;
    const messagePayloadStore = {};
    let chatHistory = [];
    let cachedVoices = [];
    let recognition = null;
    let isListening = false;
    let repoVaultFiles = {};
    let rawTreeData = [];
    let currentViewMode = "tree";
    let activeBranch = "main";
    let ttsKeepAliveTimer = null;
    let isSyncing = false;
    let ephemeralVisionDataUrl = null;

    function isInV4Scope(path) {
        const p = String(path || "").replace(/^\/+/, "").toLowerCase();
        return p === "a1/v4" || p.startsWith("a1/v4/");
    }

    function isSoulPath(path) {
        const p = String(path || "").replace(/^\/+/, "").toLowerCase();
        return (
            p === "a1/v4/soul" ||
            p.startsWith("a1/v4/soul/") ||
            p.includes("/soul/") ||
            p.startsWith("soul/")
        );
    }

    function isV4SoulWriteTarget(path) {
        const p = String(path || "").replace(/^\/+/, "").toLowerCase();
        return p.startsWith("a1/v4/soul/") && p.length > "a1/v4/soul/".length;
    }

    function canWritePath(path) {
        if (!isInV4Scope(path)) return false;
        if (isSoulPath(path)) return isV4SoulWriteTarget(path);
        return true;
    }

    function stripModelStrings(text) {
        if (!text) return "";
        return String(text)
            .replace(/\s*\bon\s+MiniMaxAI\/MiniMax-M2\.7\.?/gi, "")
            .replace(/\bMiniMaxAI\/MiniMax-M2\.7\.?/gi, "")
            .replace(/ {2,}/g, " ")
            .replace(/\s+([.,!?;:])/g, "$1")
            .trim();
    }

    function stripCodeForSpeech(text) {
        if (!text) return "";
        return String(text)
            .replace(/```[\s\S]*?```/g, " Code omitted from speech. ")
            .replace(/`[^`]*`/g, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/[{}\[\];=><\\\/|]/g, " ")
            .replace(/\b(function|const|let|var|async|await|return|import|export|class|if|else|for|while|switch|case|try|catch|new|typeof|document|window|fetch|require|module)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function isV4CoreFile(path) {
        if (!path || !isInV4Scope(path) || isSoulPath(path)) return false;
        const lower = path.toLowerCase();
        if (lower.includes("/logs/")) return false;
        return /\.(md|json|txt|html)$/i.test(lower);
    }

    function cleanHeaderToken(str) {
        if (!str) return "";
        return String(str).replace(/[^\x20-\x7E\xA0-\xFF]/g, "").trim();
    }

    function getStoredKey(names) {
        for (const n of names) {
            try {
                const v = localStorage.getItem(n);
                if (v && v.trim()) return cleanHeaderToken(v);
            } catch (e) {}
        }
        return "";
    }

    function getCleanDahlKey() {
        const el = document.getElementById("api-key");
        const raw = (el && el.value) || getStoredKey(["DAHL_API_KEY", "dahl_api_key", "OPENAI_API_KEY", "api_key"]);
        return cleanHeaderToken(raw);
    }

    function getCleanGitHubToken() {
        const el = document.getElementById("gh-token");
        const raw = (el && el.value) || getStoredKey(["GITHUB_PAT", "gh_token", "github_token"]);
        return cleanHeaderToken(raw);
    }

    function getActiveModel() {
        const selectEl = document.getElementById("model-select");
        if (selectEl && selectEl.value) return selectEl.value;
        try {
            return localStorage.getItem("DAHL_MODEL") || DEFAULT_MODEL;
        } catch (e) {
            return DEFAULT_MODEL;
        }
    }

    function applyRoomDecorVisuals(mode) {
        const cleanMode = ["military-calm", "night-watch", "war-room-brief"].includes(mode) ? mode : "military-calm";
        document.body.classList.remove("decor-military-calm", "decor-night-watch", "decor-war-room-brief");
        document.body.classList.add(`decor-${cleanMode}`);
        try { localStorage.setItem("ANNA_V4_DECOR", cleanMode); } catch (e) {}
        const sel = document.getElementById("room-decor-select");
        if (sel && sel.value !== cleanMode) sel.value = cleanMode;
    }

    function updateRoomDecor() {
        const sel = document.getElementById("room-decor-select");
        applyRoomDecorVisuals((sel && sel.value) || "military-calm");
    }

    function applyPulseCadence(scale) {
        const parsed = parseFloat(scale);
        const safeScale = Number.isFinite(parsed) && parsed > 0.2 && parsed < 3 ? parsed : 1;
        document.documentElement.style.setProperty("--pulse-scale", String(safeScale));
        try { localStorage.setItem("ANNA_V4_PULSE_SCALE", String(safeScale)); } catch (e) {}
        const sel = document.getElementById("pulse-cadence-select");
        if (sel && Math.abs(parseFloat(sel.value) - safeScale) > 0.01) {
            sel.value = String(safeScale);
        }
    }

    function updatePulseCadence() {
        const sel = document.getElementById("pulse-cadence-select");
        applyPulseCadence((sel && sel.value) || "1");
    }

    let ephemeralVisionMeta = null;

    function loadSeeOnlyImageFile(file) {
        if (!file || !file.type || !file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
            ephemeralVisionDataUrl = String(reader.result || "");
            ephemeralVisionMeta = {
                name: file.name || "vision-upload.png",
                type: file.type || "image/png",
                size: file.size || 0
            };
            const preview = document.getElementById("media-preview-container");
            const meta = document.getElementById("v4-vision-meta");
            if (preview) {
                preview.style.display = "flex";
                preview.innerHTML = `<img src="${ephemeralVisionDataUrl}" alt="See-only session image: ${ephemeralVisionMeta.name}">`;
            }
            if (meta) {
                meta.textContent = `Session image loaded: ${ephemeralVisionMeta.name} (${Math.round(ephemeralVisionMeta.size / 1024)} KB) — in RAM until saved to Git or cleared.`;
            }
        };
        reader.readAsDataURL(file);
    }

    function clearSeeOnlyVision() {
        ephemeralVisionDataUrl = null;
        ephemeralVisionMeta = null;
        const inputEl = document.getElementById("v4-vision-file");
        const preview = document.getElementById("media-preview-container");
        const meta = document.getElementById("v4-vision-meta");
        if (inputEl) inputEl.value = "";
        if (preview) {
            preview.innerHTML = "";
            preview.style.display = "none";
        }
        if (meta) meta.textContent = "Memory buffer: cleared.";
    }

    async function saveVisionImageToRepo() {
        const metaEl = document.getElementById("v4-vision-meta");
        if (!ephemeralVisionDataUrl || !ephemeralVisionDataUrl.includes(",")) {
            if (metaEl) metaEl.textContent = "No session image loaded in memory to save.";
            return;
        }
        const token = getCleanGitHubToken();
        if (!token) { toggleSettings(); return; }

        const rawName = (ephemeralVisionMeta && ephemeralVisionMeta.name) || "vision-image.png";
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const pathEl = document.getElementById("active-file-path");
        const customPath = pathEl && pathEl.value.trim() ? pathEl.value.trim() : "";
        const targetPath = customPath && /\.(png|jpg|jpeg|gif|webp|svg|avif)$/i.test(customPath)
            ? customPath
            : `${WORKSPACE_ROOT}/vision/uploads/${Date.now()}-${safeName}`;

        if (!isInV4Scope(targetPath)) {
            if (metaEl) metaEl.textContent = `Blocked: ${targetPath} is outside ${WORKSPACE_ROOT}/.`;
            return;
        }

        const base64Payload = ephemeralVisionDataUrl.split(",")[1] || "";
        if (!base64Payload) {
            if (metaEl) metaEl.textContent = "Invalid image data in session buffer.";
            return;
        }

        setMoodState("saving");
        try {
            let existingSha = null;
            try {
                const checkRes = await fetchWithTimeout(
                    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${targetPath}?ref=${encodeURIComponent(activeBranch)}`,
                    { headers: getGitHubHeaders(), cache: "no-store" },
                    10000
                );
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    existingSha = checkData && checkData.sha ? checkData.sha : null;
                }
            } catch (e) {}

            const body = {
                message: `feat(v4-vision): save session image to ${targetPath}`,
                content: base64Payload,
                branch: activeBranch
            };
            if (existingSha) body.sha = existingSha;

            const putRes = await fetchWithTimeout(
                `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${targetPath}`,
                {
                    method: "PUT",
                    headers: {
                        ...getGitHubHeaders(),
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                },
                15000
            );

            if (!putRes.ok) {
                const errTxt = await putRes.text();
                throw new Error(`HTTP ${putRes.status}: ${errTxt.slice(0, 160)}`);
            }

            appendMessage("System Telemetry", `VISION SAVED: ${targetPath} committed to ${GITHUB_REPO_NAME} (${activeBranch}).`, "msg_vis_save_" + Date.now(), false);
            if (metaEl) metaEl.textContent = `Saved to Git: ${targetPath}`;
            speakText(`Saved ${safeName} to repository.`);
            await fetchRepoTree();
        } catch (err) {
            const errMsg = err && err.message ? err.message : "Vision save failed.";
            if (metaEl) metaEl.textContent = `Save failed: ${errMsg}`;
            appendMessage("System Telemetry", `VISION SAVE FAILED: ${errMsg}`, "msg_vis_err_" + Date.now(), false);
        } finally {
            setMoodState("standby");
        }
    }

    function setActionsStatus(label, statusClass) {
        const badge = document.getElementById("actions-status");
        if (!badge) return;
        badge.innerText = `ACTIONS: ${label}`;
        badge.className = statusClass ? `status-badge ${statusClass}` : "status-badge";
    }

    function setMoodState(stateName) {
        const normalized = String(stateName || "standby").toLowerCase();
        const valid = ["standby", "thinking", "responding", "saving", "error", "speaking", "listening"];
        const target = valid.includes(normalized) ? normalized : "standby";
        document.body.classList.remove("is-standby", "is-thinking", "is-responding", "is-saving", "is-error", "is-speaking", "is-listening");
        document.body.classList.add(`is-${target}`);
        const stEl = document.getElementById("state-text");
        if (stEl) stEl.innerText = `${target.toUpperCase()} // AGENT ANNA V4`;
    }

    function updateKeyBadge() {
        const k = getCleanDahlKey();
        const badge = document.getElementById("key-status");
        if (!badge) return;
        if (k) {
            badge.innerText = `KEY: LOADED (${k.slice(0, 6)}...)`;
            badge.className = "status-badge ok";
        } else {
            badge.innerText = "KEY: MISSING";
            badge.className = "status-badge err";
        }
    }

    function updateVoiceBadge() {
        const badge = document.getElementById("voice-profile-badge");
        if (!badge) return;
        badge.innerText = isVoiceEnabled ? "VOICE: ANNA" : "VOICE: OFF";
        badge.className = isVoiceEnabled ? "status-badge ok" : "status-badge";
    }

    function playToneCue(freq, durationMs) {
        if (!isVoiceEnabled) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq || 660;
            gain.gain.value = 0.04;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            setTimeout(() => {
                try { osc.stop(); ctx.close(); } catch (e) {}
            }, durationMs || 140);
        } catch (e) {}
    }

    function isKnownMaleOrRoboticVoice(nameLower) {
        const maleOrRoboticHints = [
            "david", "mark", "george", "daniel", "arthur", "ryan", "guy",
            "alex", "fred", "liam", "thomas", "james", "richard", "espeak", "male"
        ];
        return maleOrRoboticHints.some((h) => nameLower.includes(h));
    }

    function loadVoices() {
        if (!("speechSynthesis" in window)) return;
        try {
            const v = window.speechSynthesis.getVoices();
            if (v && v.length) cachedVoices = v;
            updateVoiceBadge();
        } catch (e) {}
    }

    function pickFemaleEnglishVoice(voices) {
        const list = (voices && voices.length ? voices : cachedVoices) || [];
        const englishOnly = list.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
        if (!englishOnly.length) return null;

        const femaleHints = [
            "google uk english female",
            "google us english",
            "microsoft zira",
            "microsoft aria",
            "microsoft jenny",
            "microsoft sonia",
            "microsoft libby",
            "samantha",
            "victoria",
            "karen",
            "moira",
            "fiona",
            "tessa",
            "ava",
            "female"
        ];

        const femaleCandidates = englishOnly.filter((v) => !isKnownMaleOrRoboticVoice(String(v.name || "").toLowerCase()));
        const pool = femaleCandidates.length ? femaleCandidates : englishOnly;

        const scoreVoice = (v) => {
            const name = String(v.name || "").toLowerCase();
            const lang = String(v.lang || "").toLowerCase();
            let score = 0;
            if (/en[-_](us|gb)/.test(lang)) score += 15;
            if (femaleHints.some((h) => name.includes(h))) score += 60;
            if (v.localService) score += 5;
            if (isKnownMaleOrRoboticVoice(name)) score -= 120;
            return score;
        };

        return pool.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
    }

    function clearTtsKeepAlive() {
        if (ttsKeepAliveTimer) {
            clearInterval(ttsKeepAliveTimer);
            ttsKeepAliveTimer = null;
        }
    }

    function sanitizeResponse(text) {
        if (!text) return "";
        return stripModelStrings(String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim());
    }

    function formatReadableMessage(rawText) {
        if (!rawText) return "";
        const text = String(rawText).trim();
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/^(\{[\s\S]*\})$/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed && typeof parsed.content === "string") {
                    const unescaped = parsed.content
                        .replace(/\\r\\n/g, "\n")
                        .replace(/\\n/g, "\n")
                        .replace(/\\t/g, "  ");
                    const headerNote = parsed.path ? `[TARGET: ${parsed.path}]\n\n` : "";
                    return stripModelStrings((headerNote + unescaped).trim());
                }
            } catch (e) {}
        }
        return stripModelStrings(text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n"));
    }

    function speakText(text) {
        if (!isVoiceEnabled) return;
        const clean = stripModelStrings(stripCodeForSpeech(sanitizeResponse(text)))
            .replace(/[*_#~]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!clean) return;

        if (!("speechSynthesis" in window)) {
            playToneCue(720, 160);
            return;
        }

        try {
            clearTtsKeepAlive();
            window.speechSynthesis.cancel();
            loadVoices();
            const voices = window.speechSynthesis.getVoices();
            if (!voices || !voices.length) {
                playToneCue(720, 160);
            }

            const chunks = [];
            const sentences = clean.match(/[^.!?]+[.!?]*|[^.!?]+$/g) || [clean];
            let buf = "";
            for (const s of sentences) {
                const part = s.trim();
                if (!part) continue;
                if ((buf + " " + part).length > 260 && buf) {
                    chunks.push(buf.trim());
                    buf = part;
                } else {
                    buf = buf ? buf + " " + part : part;
                }
            }
            if (buf.trim()) chunks.push(buf.trim());
            if (!chunks.length) return;

            const chosenVoice = pickFemaleEnglishVoice(voices);
            setMoodState("speaking");

            let idx = 0;
            const speakNext = () => {
                if (idx >= chunks.length || !isVoiceEnabled) {
                    clearTtsKeepAlive();
                    setMoodState("standby");
                    return;
                }
                const utterance = new SpeechSynthesisUtterance(chunks[idx++]);
                if (chosenVoice) utterance.voice = chosenVoice;
                utterance.lang = (chosenVoice && chosenVoice.lang) || "en-US";
                utterance.pitch = 1.1;
                utterance.rate = 1.02;
                utterance.onend = () => {
                    if (idx < chunks.length) speakNext();
                    else {
                        clearTtsKeepAlive();
                        setMoodState("standby");
                    }
                };
                utterance.onerror = () => {
                    clearTtsKeepAlive();
                    playToneCue(440, 180);
                    setMoodState("standby");
                };
                window.speechSynthesis.speak(utterance);
            };

            speakNext();
            ttsKeepAliveTimer = setInterval(() => {
                if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                } else if (!window.speechSynthesis.speaking) {
                    clearTtsKeepAlive();
                }
            }, 3000);
        } catch (e) {
            clearTtsKeepAlive();
            playToneCue(440, 180);
            setMoodState("standby");
        }
    }

    function executeStfuProtocol() {
        clearTtsKeepAlive();
        if ("speechSynthesis" in window) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        if (recognition) {
            isListening = false;
            try { recognition.stop(); } catch (e) {}
        }
        const micBtn = document.getElementById("mic-btn");
        if (micBtn) micBtn.classList.remove("listening");
        setMoodState("standby");
    }

    function syncFullPageButtonUi() {
        const fsActive = Boolean(document.fullscreenElement);
        const active = fsActive || isFullPageMode;
        document.body.classList.toggle("is-fullpage", isFullPageMode);
        const btn = document.getElementById("fullpage-btn");
        if (btn) { btn.innerText = active ? "🗗" : "⛶";
            btn.setAttribute("aria-pressed", String(active));
            btn.classList.toggle("active-mode", active);
        }
    }

    async function toggleFullPageMode() {
        const fsNow = Boolean(document.fullscreenElement);
        try {
            if (!fsNow && document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
                isFullPageMode = false;
                syncFullPageButtonUi();
                speakText("Browser fullscreen active.");
                return;
            }
            if (fsNow && document.exitFullscreen) {
                await document.exitFullscreen();
                isFullPageMode = false;
                syncFullPageButtonUi();
                speakText("Exited browser fullscreen.");
                return;
            }
        } catch (e) {}

        isFullPageMode = !isFullPageMode;
        syncFullPageButtonUi();
        speakText(isFullPageMode ? "Full page console active." : "Split workbench restored.");
    }

    function getGitHubHeaders() {
        const token = getCleanGitHubToken();
        return token
            ? { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" }
            : { Accept: "application/vnd.github.v3+json" };
    }

    async function fetchWithTimeout(url, opts, timeoutMs) {
        const ms = Math.max(Number(timeoutMs) || 60000, 60000);
        if (typeof AbortController === "undefined") {
            return await fetch(url, opts || {});
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort("Request timed out after " + ms + "ms"), ms);
        try {
            return await fetch(url, { ...(opts || {}), signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    function toggleMessageCollapse(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const content = el.querySelector(".msg-content");
        if (content) content.classList.toggle("collapsed");
    }

    function appendMessage(sender, text, id, isAssistant) {
        const container = document.getElementById("chat-container");
        if (!container) return;
        const readableText = isAssistant ? formatReadableMessage(text) : stripModelStrings(text);
        const div = document.createElement("div");
        div.className = `message ${isAssistant ? "assistant" : "user"}`;
        div.id = id;
        messagePayloadStore[id] = readableText;

        const header = document.createElement("div");
        header.className = "msg-header";
        header.onclick = () => toggleMessageCollapse(id);
        const senderSpan = document.createElement("span");
        senderSpan.textContent = sender;
        const toggleSpan = document.createElement("span");
        toggleSpan.textContent = "▾";
        header.appendChild(senderSpan);
        header.appendChild(toggleSpan);

        const body = document.createElement("div");
        body.className = "msg-content";
        body.textContent = readableText;

        div.appendChild(header);
        div.appendChild(body);

        if (isAssistant) {
            const temp = document.createElement("div");
            temp.innerHTML = `
                <div class="action-row">
                    <button class="action-chip" onclick="window.speakStoredMessage('${id}')">SPEAK</button>
                    <button class="action-chip" onclick="window.copyToClipboard('${id}', this)">COPY</button>
                    <button class="action-chip swallow-btn" onclick="window.autonomousSwallowAndCommit('${id}', this)">SWALLOW</button>
                    <button class="action-chip del-btn" onclick="window.executeStfuProtocol()">STFU</button>
                    <button class="action-chip del-btn" onclick="window.deleteMessage('${id}')">DEL</button>
                </div>`;
            while (temp.firstChild) div.appendChild(temp.firstChild);
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function updateMessage(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        const readableText = formatReadableMessage(text);
        const body = el.querySelector(".msg-content");
        if (body) body.textContent = readableText;
        messagePayloadStore[id] = readableText;
        const container = document.getElementById("chat-container");
        if (container) container.scrollTop = container.scrollHeight;
    }

    function deleteMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
        delete messagePayloadStore[id];
    }

    function clearLogs() {
        const container = document.getElementById("chat-container");
        if (container) container.innerHTML = "";
        Object.keys(messagePayloadStore).forEach((k) => delete messagePayloadStore[k]);
        chatHistory = [];
    }

    function speakStoredMessage(id) {
        if (messagePayloadStore[id]) speakText(messagePayloadStore[id]);
    }

    function copyToClipboard(id, btn) {
        if (!messagePayloadStore[id]) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(messagePayloadStore[id]).then(() => {
                if (btn) {
                    const prev = btn.innerText;
                    btn.innerText = "COPIED!";
                    setTimeout(() => { btn.innerText = prev || "COPY"; }, 1800);
                }
            }).catch(() => {});
        }
    }

    async function getLatestFileSha(path) {
        if (!canWritePath(path)) return undefined;
        try {
            const res = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`, {
                headers: getGitHubHeaders(),
                cache: "no-store"
            }, 10000);
            if (res.ok) {
                const data = await res.json();
                return data.sha;
            }
        } catch (e) {}
        return undefined;
    }

    async function writeFileToGitHub(path, content, commitMessage) {
        if (!canWritePath(path)) return false;
        setMoodState("saving");
        const sha = await getLatestFileSha(path);
        const utf8Bytes = new TextEncoder().encode(content);
        let binString = "";
        utf8Bytes.forEach((b) => { binString += String.fromCodePoint(b); });
        const encodedContent = btoa(binString);
        const payload = { message: commitMessage, content: encodedContent, branch: activeBranch || "main" };
        if (sha) payload.sha = sha;
        const putRes = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`, {
            method: "PUT",
            headers: { ...getGitHubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, 12000);
        const putData = await putRes.json();
        return putRes.status === 201 || putRes.status === 200 || Boolean(putData && putData.commit);
    }

    async function fetchLatestBackendReport(autoAnnounceToAnna) {
        if (!rawTreeData.length) await fetchRepoTree();
        const v4LogFiles = rawTreeData
            .filter((f) => f.type === "blob" && isInV4Scope(f.path) && !isSoulPath(f.path) && f.path.toLowerCase().startsWith("a1/v4/logs/"))
            .map((f) => f.path)
            .sort();

        if (!v4LogFiles.length) {
            const msg = `No log files found under ${WORKSPACE_ROOT}/logs/ yet.`;
            appendMessage("Agent Anna V4", msg, "msg_nolog_" + Date.now(), true);
            if (autoAnnounceToAnna !== false) speakText(msg);
            return;
        }

        const newestLog = v4LogFiles[v4LogFiles.length - 1];
        const ext = newestLog.split(".").pop().toLowerCase();
        await loadRepoFile(newestLog, ext);
        const editor = document.getElementById("repo-code-editor");
        const logContent = repoVaultFiles[newestLog] || (editor ? editor.value : "");
        if (autoAnnounceToAnna !== false && logContent) {
            appendMessage("Agent Anna V4", `LATEST V4 LOG (${newestLog}):\n\n${logContent.slice(0, 1800)}`, "msg_rep_" + Date.now(), true);
            speakText(`Latest V4 log is ${newestLog.split("/").pop()}.`);
        }
    }

    function toggleViewMode() {
        currentViewMode = currentViewMode === "tree" ? "grid" : "tree";
        const btn = document.getElementById("view-toggle-btn");
        if (btn) btn.innerText = currentViewMode === "tree" ? "VIEW: TREE" : "VIEW: GRID";
        const gridEl = document.getElementById("repo-file-grid");
        const treeEl = document.getElementById("repo-tree-view");
        if (currentViewMode === "tree") {
            if (gridEl) gridEl.style.display = "none";
            if (treeEl) treeEl.style.display = "block";
            renderTreeView();
        } else {
            if (gridEl) gridEl.style.display = "grid";
            if (treeEl) treeEl.style.display = "none";
            renderGridView();
        }
    }

    function toggleFolderRowEl(rowEl) {
        if (!rowEl) return;
        const childrenEl = rowEl.nextElementSibling;
        if (!childrenEl) return;
        const currentlyHidden = window.getComputedStyle(childrenEl).display === "none";
        childrenEl.style.setProperty("display", currentlyHidden ? "block" : "none", "important");
        childrenEl.classList.toggle("collapsed", !currentlyHidden);
        rowEl.setAttribute("aria-expanded", String(currentlyHidden));
        const arrowEl = rowEl.querySelector(".tree-arrow");
        if (arrowEl) arrowEl.textContent = currentlyHidden ? "▾" : "▸";
    }

    function renderTreeView() {
        const treeEl = document.getElementById("repo-tree-view");
        if (!treeEl) return;
        const treeItems = rawTreeData.filter((f) => f.type === "blob" && isInV4Scope(f.path));
        if (!treeItems.length) {
            treeEl.innerHTML = `<span style="color:var(--text-muted);">No ${WORKSPACE_ROOT}/ files loaded. Click SYNC.</span>`;
            return;
        }
        const root = {};
        treeItems.forEach((item) => {
            const relPath = item.path.replace(/^A1\/v4\/?/i, "") || item.path;
            const parts = relPath.split("/");
            let current = root;
            parts.forEach((part, idx) => {
                if (!current[part]) {
                    current[part] = idx === parts.length - 1 ? { __is_file: true, path: item.path } : {};
                }
                current = current[part];
            });
        });

        function buildHtml(node) {
            let html = "";
            const keys = Object.keys(node).filter((k) => k !== "__is_file" && k !== "path").sort((a, b) => {
                if (node[a].__is_file && !node[b].__is_file) return 1;
                if (!node[a].__is_file && node[b].__is_file) return -1;
                return a.localeCompare(b);
            });
            keys.forEach((key) => {
                const item = node[key];
                if (item.__is_file) {
                    const ext = key.split(".").pop().toLowerCase();
                    html += `<span class="tree-file" onclick="window.loadRepoFile('${item.path}', '${ext}')" onkeydown="if(event.key==='Enter')window.loadRepoFile('${item.path}', '${ext}')" tabindex="0" role="treeitem">${key}</span>`;
                } else {
                    html += `<div role="group"><div class="tree-folder-row" onclick="window.toggleFolderRowEl(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.toggleFolderRowEl(this);}" tabindex="0" role="button" aria-expanded="false"><span class="tree-arrow">▸</span> ${key}/</div><div class="tree-children collapsed" style="display:none;">${buildHtml(item)}</div></div>`;
                }
            });
            return html;
        }
        treeEl.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${WORKSPACE_ROOT} TREE (${treeItems.length} files on ${activeBranch})</div>` + buildHtml(root);
    }

    function renderGridView() {
        const gridEl = document.getElementById("repo-file-grid");
        if (!gridEl) return;
        const gridItems = rawTreeData.filter((f) => f.type === "blob" && isInV4Scope(f.path));
        gridEl.innerHTML = "";
        gridItems.forEach((file) => {
            const ext = file.path.split(".").pop().toLowerCase();
            const card = document.createElement("div");
            card.className = "repo-file-card";
            card.setAttribute("tabindex", "0");
            card.setAttribute("role", "listitem");
            card.innerHTML = `<div class="file-card-name" title="${file.path}">${file.path}</div><div class="file-card-size">${((file.size || 0) / 1024).toFixed(1)} KB</div>`;
            card.onclick = () => loadRepoFile(file.path, ext);
            card.onkeydown = (e) => { if (e.key === "Enter") loadRepoFile(file.path, ext); };
            gridEl.appendChild(card);
        });
    }

    async function walkRepoContentsRecursive(dirPath, branch, collected) {
        const cleanDir = String(dirPath || "").replace(/^\/+|\/+$/g, "");
        if (cleanDir && !isInV4Scope(cleanDir)) return;
        const encodedDir = cleanDir ? "/" + cleanDir.split("/").map(encodeURIComponent).join("/") : "/A1/v4";
        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents${encodedDir}?ref=${encodeURIComponent(branch)}`;
        const res = await fetchWithTimeout(url, { headers: getGitHubHeaders(), cache: "no-store" }, 10000);
        if (!res.ok) return;
        const entries = await res.json();
        if (!Array.isArray(entries)) return;

        const subDirs = [];
        for (const entry of entries) {
            if (!isInV4Scope(entry.path)) continue;
            if (entry.type === "file") {
                collected.push({ path: entry.path, type: "blob", size: entry.size || 0, sha: entry.sha });
            } else if (entry.type === "dir") {
                collected.push({ path: entry.path, type: "tree", sha: entry.sha });
                subDirs.push(entry.path);
            }
        }
        await Promise.all(subDirs.map((sub) => walkRepoContentsRecursive(sub, branch, collected)));
    }

    async function syncAll() {
        if (isSyncing) return;
        isSyncing = true;
        try {
            await fetchRepoTree();
            await ingestCoreVaultAssets();
        } catch (e) {
            setMoodState("standby");
        } finally {
            isSyncing = false;
        }
    }

    async function fetchRepoTree() {
        setMoodState("thinking");
        let data = null;
        for (const branch of ["main", "master"]) {
            try {
                const res = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/trees/${branch}?recursive=1`, {
                    headers: getGitHubHeaders(),
                    cache: "no-store"
                }, 8000);
                if (res.ok) {
                    data = await res.json();
                    activeBranch = branch;
                    break;
                }
            } catch (err) {}
        }

        if (data && Array.isArray(data.tree) && !data.truncated) {
            rawTreeData = data.tree.filter((f) => isInV4Scope(f.path));
        } else {
            const walked = [];
            try {
                await walkRepoContentsRecursive(WORKSPACE_ROOT, activeBranch, walked);
            } catch (e) {}
            if (walked.length > 0) {
                rawTreeData = walked.filter((f) => isInV4Scope(f.path));
            } else if (data && Array.isArray(data.tree)) {
                rawTreeData = data.tree.filter((f) => isInV4Scope(f.path));
            } else {
                rawTreeData = [];
            }
        }

        if (rawTreeData.length > 0) {
            if (currentViewMode === "tree") renderTreeView();
            else renderGridView();
        } else {
            const treeEl = document.getElementById("repo-tree-view");
            if (treeEl) treeEl.innerHTML = `<span style="color:var(--text-muted);">No ${WORKSPACE_ROOT}/ files loaded yet or PAT needed in KEYS.</span>`;
        }
        setMoodState("standby");
    }

    async function ingestCoreVaultAssets() {
        const headers = getGitHubHeaders();
        const coreFiles = rawTreeData
            .filter((f) => f.type === "blob" && isInV4Scope(f.path) && !isSoulPath(f.path) && (f.size || 0) < 45000 && isV4CoreFile(f.path))
            .slice(0, 14);

        const nextVault = {};
        await Promise.allSettled(
            coreFiles.map(async (file) => {
                const res = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${file.path}`, { headers, cache: "no-store" }, 7000);
                if (!res.ok) return;
                const data = await res.json();
                if (data.content) {
                    const binString = atob(data.content.replace(/\s/g, ""));
                    nextVault[file.path] = new TextDecoder().decode(Uint8Array.from(binString, (m) => m.codePointAt(0)));
                }
            })
        );
        repoVaultFiles = nextVault;

        const count = Object.keys(repoVaultFiles).length;
        const v4Files = rawTreeData.filter((f) => f.type === "blob" && isInV4Scope(f.path)).length;
        const badge = document.getElementById("vault-status");
        if (badge) {
            badge.innerText = `VAULT: ${v4Files} FILES (${count} CTX)`;
            badge.className = v4Files > 0 ? "status-badge ok" : "status-badge";
        }
    }

    function getCompactVaultContext(userPrompt) {
        const pathEl = document.getElementById("active-file-path");
        const activePath = pathEl ? pathEl.value.trim() : "";
        const visionNote = ephemeralVisionDataUrl ? " | IMAGE_IN_RAM: yes" : "";
        const openNote = activePath ? ` | OPEN_FILE: ${activePath}` : "";
        return `ROOT: ${WORKSPACE_ROOT}/ (${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${activeBranch})${openNote}${visionNote}`;
    }

    async function triggerAutonomousBootSequence() {
        await syncAll();
        const coreCount = Object.keys(repoVaultFiles).length;
        const v4Files = rawTreeData.filter((f) => f.type === "blob" && isInV4Scope(f.path)).length;
        const msg = `Agent Anna V4 online in ${WORKSPACE_ROOT}. ${v4Files} files in ${WORKSPACE_ROOT} (${coreCount} core files active).`;
        appendMessage("Agent Anna V4", msg, "msg_boot_" + Date.now(), true);
        speakText(msg);
        setMoodState("standby");
    }

    async function loadRepoFile(path, ext) {
        if (!isInV4Scope(path)) return;
        const pathEl = document.getElementById("active-file-path");
        if (pathEl) pathEl.value = path;
        const editor = document.getElementById("repo-code-editor");
        const preview = document.getElementById("media-preview-container");
        const fileExt = String(ext || path.split(".").pop() || "").toLowerCase();
        const isMedia = ["png", "jpg", "jpeg", "gif", "svg", "avif", "mp4", "webm", "mov", "mp3", "wav"].includes(fileExt);

        if (isMedia) {
            if (editor) editor.style.display = "none";
            if (preview) {
                preview.style.display = "flex";
                const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${activeBranch}/${path}`;
                if (["png", "jpg", "jpeg", "gif", "svg", "avif"].includes(fileExt)) {
                    preview.innerHTML = `<img src="${rawUrl}" alt="${path}">`;
                } else if (["mp4", "webm", "mov"].includes(fileExt)) {
                    preview.innerHTML = `<video controls autoplay loop src="${rawUrl}"></video>`;
                } else {
                    preview.innerHTML = `<audio controls autoplay src="${rawUrl}"></audio>`;
                }
            }
        } else {
            if (preview) preview.style.display = "none";
            if (editor) {
                editor.style.display = "block";
                editor.value = "Loading...";
                try {
                    const res = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`, {
                        headers: getGitHubHeaders(),
                        cache: "no-store"
                    }, 10000);
                    const data = await res.json();
                    if (data.content) {
                        const binString = atob(data.content.replace(/\s/g, ""));
                        const decoded = new TextDecoder().decode(Uint8Array.from(binString, (m) => m.codePointAt(0)));
                        editor.value = decoded;
                        if (!isSoulPath(path)) repoVaultFiles[path] = decoded;
                    }
                } catch (err) {
                    editor.value = "Error loading file content.";
                }
            }
        }
    }

    async function commitCurrentFile() {
        const token = getCleanGitHubToken();
        if (!token) { toggleSettings(); return; }
        const pathEl = document.getElementById("active-file-path");
        const edEl = document.getElementById("repo-code-editor");
        const path = pathEl ? pathEl.value.trim() : "";
        const content = edEl ? edEl.value : "";
        if (!path || !canWritePath(path)) return;

        setMoodState("saving");
        try {
            const stamp = new Date().toISOString();
            const isSoul = isV4SoulWriteTarget(path);
            const commitMsg = isSoul
                ? `Agent Anna V4 Soul Note [${stamp}]: ${path}`
                : `Agent Anna V4 commit [${stamp}]: updated ${path}`;
            const ok = await writeFileToGitHub(path, content, commitMsg);
            if (ok) {
                if (!isSoul) repoVaultFiles[path] = content;
                appendMessage("System Telemetry", `VERIFIED COMMIT [${stamp}]: ${path} written to ${GITHUB_REPO_NAME}.`, "msg_com_" + Date.now(), false);
                speakText(`Committed ${path.split("/").pop()}.`);
                await fetchRepoTree();
            } else {
                appendMessage("System Telemetry", "COMMIT ERROR: Check GitHub PAT write permissions.", "msg_com_err_" + Date.now(), false);
            }
        } catch (err) {
            appendMessage("System Telemetry", `COMMIT FAILED: ${err.message}`, "msg_com_err_" + Date.now(), false);
            setMoodState("error");
            return;
        }
        setMoodState("standby");
    }

    function promptDeleteFile() {
        const pathEl = document.getElementById("active-file-path");
        const path = pathEl ? pathEl.value.trim() : "";
        if (!path || !canWritePath(path)) return;
        const banner = document.getElementById("delete-warning-banner");
        const warnText = document.getElementById("delete-warning-text");
        if (warnText) warnText.innerText = `DELETE "${path}" PERMANENTLY?`;
        if (banner) banner.style.display = "flex";
    }

    function cancelDeleteFile() {
        const banner = document.getElementById("delete-warning-banner");
        if (banner) banner.style.display = "none";
    }

    async function confirmDeleteFile() {
        cancelDeleteFile();
        const token = getCleanGitHubToken();
        const pathEl = document.getElementById("active-file-path");
        const path = pathEl ? pathEl.value.trim() : "";
        if (!token || !path || !canWritePath(path)) return;

        setMoodState("saving");
        try {
            const sha = await getLatestFileSha(path);
            if (!sha) { setMoodState("standby"); return; }
            const delRes = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`, {
                method: "DELETE",
                headers: { ...getGitHubHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ message: `Agent Anna V4 purge: deleted ${path}`, sha })
            }, 10000);
            if (delRes.ok || delRes.status === 200) {
                delete repoVaultFiles[path];
                if (pathEl) pathEl.value = "";
                const edEl = document.getElementById("repo-code-editor");
                if (edEl) edEl.value = "";
                speakText(`Deleted ${path.split("/").pop()}.`);
                await fetchRepoTree();
            }
        } catch (e) {}
        setMoodState("standby");
    }

    function extractDahlReply(json, rawText) {
        const clean = (s) => stripModelStrings(String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim());
        if (!json) return clean(rawText);
        if (json.choices && json.choices[0]) {
            const msg = json.choices[0].message;
            if (msg && typeof msg.content === "string") return clean(msg.content);
            if (typeof json.choices[0].text === "string") return clean(json.choices[0].text);
        }
        for (const k of ["reply", "response", "output", "text"]) {
            if (typeof json[k] === "string") return clean(json[k]);
        }
        return clean(rawText);
    }

    async function callDahlSingleModel(modelName, apiKey, messages, onProgress = null) {
        const startedAt = performance.now();
        let ttftMs = null;

        try {
            const response = await fetch(DAHL_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    stream: true,
                    messages
                })
            });

            if (!response.ok) {
                const rawErr = await response.text();
                let errJson = null;
                try { errJson = JSON.parse(rawErr); } catch (e) {}
                const detail = errJson && errJson.error ? (errJson.error.message || JSON.stringify(errJson.error)) : rawErr.slice(0, 200);
                const elapsedMs = Math.round(performance.now() - startedAt);
                const err = new Error(`DAHL HTTP ${response.status} [${modelName}] (${elapsedMs}ms): ${detail}`);
                err.status = response.status;
                throw err;
            }

            const contentType = response.headers.get("content-type") || "";
            if (!response.body || !contentType.includes("text/event-stream")) {
                const rawText = await response.text();
                const totalMs = Math.round(performance.now() - startedAt);
                ttftMs = ttftMs ?? totalMs;
                let json = null;
                try { json = JSON.parse(rawText); } catch (e) {}
                const text = extractDahlReply(json, rawText) || "Ready.";
                return { text, ttftMs, totalMs, status: response.status, model: modelName };
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assembled = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const dataStr = trimmed.slice(5).trim();
                    if (dataStr === "[DONE]") continue;
                    try {
                        const chunk = JSON.parse(dataStr);
                        const dObj = chunk?.choices?.[0]?.delta || {};
                        const delta = dObj.content ?? chunk?.choices?.[0]?.text ?? "";
                        if (delta) {
                            if (ttftMs === null) ttftMs = Math.round(performance.now() - startedAt);
                            assembled += delta;
                            const cleanPreview = stripModelStrings(assembled.replace(/<(?:think|thought|thinking)>[\s\S]*?<\/(?:think|thought|thinking)>/gi, "").replace(/<(?:think|thought|thinking)>[\s\S]*$/gi, "").trim());
                            if (typeof onProgress === "function" && cleanPreview) {
                                onProgress(cleanPreview, ttftMs, Math.round(performance.now() - startedAt), modelName);
                            }
                        }
                    } catch (e) {}
                }
            }

            const totalMs = Math.round(performance.now() - startedAt);
            ttftMs = ttftMs ?? totalMs;
            const cleanFinal = stripModelStrings(assembled.replace(/<(?:think|thought|thinking)>[\s\S]*?<\/(?:think|thought|thinking)>/gi, "").replace(/<(?:think|thought|thinking)>[\s\S]*$/gi, "").trim()) || "Ready.";
            return { text: cleanFinal, ttftMs, totalMs, status: response.status, model: modelName };
        } catch (err) {
            const elapsedMs = Math.round(performance.now() - startedAt);
            if (err && err.name === "AbortError") {
                throw new Error(`DAHL TIMEOUT [${modelName}] after ${elapsedMs}ms (limit ${DAHL_TIMEOUT_MS}ms)`);
            }
            const wrapped = new Error(`${err && err.message ? err.message : "Dahl request failed."} (${elapsedMs}ms)`);
            if (err && err.status) wrapped.status = err.status;
            throw wrapped;
        } finally {
        }
    }

    async function callDahlDirect(messages, onProgress = null) {
        const apiKey = getCleanDahlKey();
        if (!apiKey) throw new Error("Dahl API key missing. Open KEYS to save it.");

        const preferred = getActiveModel();
        const candidates = [
            preferred,
            "MiniMaxAI/MiniMax-M2.7",
            "deepseek-ai/DeepSeek-V4-Flash-0731",
            "zai-org/GLM-5.3-Flash"
        ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

        let lastErr = null;
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            try {
                return await callDahlSingleModel(candidate, apiKey, messages, onProgress);
            } catch (err) {
                lastErr = err;
                const isConcurrency429 = err && (err.status === 429 || err.status === 503 || /HTTP (?:429|503)/.test(String(err.message || "")));
                if (isConcurrency429 && i < candidates.length - 1) {
                    if (typeof onProgress === "function") {
                        onProgress(`Model ${candidate} busy (429), switching to ${candidates[i + 1]}...`, 0, 0, candidates[i + 1]);
                    }
                    continue;
                }
                throw err;
            }
        }
        throw lastErr || new Error("Dahl request failed.");
    }

    async function auditActiveFile() {
        const pathEl = document.getElementById("active-file-path");
        const edEl = document.getElementById("repo-code-editor");
        const path = pathEl ? pathEl.value.trim() : "";
        const content = edEl ? edEl.value : "";
        if (!path || !content || !isInV4Scope(path)) return;

        const apiKey = getCleanDahlKey();
        if (!apiKey) { toggleSettings(); return; }

        const auditMsgId = "msg_audit_" + Date.now();
        appendMessage("Agent Anna V4", `Auditing ${path}...`, auditMsgId, true);
        setMoodState("thinking");

        try {
            const cleanReply = await callDahlDirect([
                { role: "system", content: `Respond in English only. Active workspace is ${WORKSPACE_ROOT}. Audit ${path} for bugs or flaws and return a complete block:\n\`\`\`file:${path}\n...\n\`\`\`` },
                { role: "user", content }
            ]);
            setMoodState("responding");
            updateMessage(auditMsgId, cleanReply);
            speakText(cleanReply);
            await parseAndExecuteAutonomousFiles(cleanReply);
        } catch (err) {
            setMoodState("error");
            updateMessage(auditMsgId, `Audit failed: ${err.message}`);
            return;
        }
        setMoodState("standby");
    }

    async function parseAndExecuteAutonomousFiles(aiResponseText) {
        const fileRegex = /```file:([^\n]+)\n([\s\S]*?)```/g;
        let match;
        const committedFiles = [];
        const skippedPaths = [];

        while ((match = fileRegex.exec(aiResponseText)) !== null) {
            const filePath = match[1].trim();
            const fileContent = match[2];
            if (!canWritePath(filePath)) {
                skippedPaths.push(filePath);
                continue;
            }
            const stamp = new Date().toISOString();
            const isSoul = isV4SoulWriteTarget(filePath);
            const commitMsg = isSoul
                ? `Agent Anna V4 Soul Reflection [${stamp}]: ${filePath}`
                : `Agent Anna V4 Self-Write [${stamp}]: ${filePath}`;
            const ok = await writeFileToGitHub(filePath, fileContent, commitMsg);
            if (ok) {
                if (!isSoul) repoVaultFiles[filePath] = fileContent;
                committedFiles.push(filePath);
                const pathEl = document.getElementById("active-file-path");
                const edEl = document.getElementById("repo-code-editor");
                if (pathEl) pathEl.value = filePath;
                if (edEl) edEl.value = fileContent;
            }
        }

        if (skippedPaths.length > 0) {
            appendMessage("System Telemetry", `SCOPE GUARD: Blocked write outside ${WORKSPACE_ROOT}/: ${skippedPaths.join(", ")}.`, "msg_scope_guard_" + Date.now(), false);
        }
        if (committedFiles.length > 0) {
            appendMessage("System Telemetry", `VERIFIED 201 COMMIT: ${committedFiles.join(", ")}`, "msg_sys_" + Date.now(), false);
            await fetchRepoTree();
        }
    }

    async function autonomousSwallowAndCommit(id, btnEl) {
        const textToSwallow = messagePayloadStore[id];
        if (!textToSwallow) return;
        if (btnEl) btnEl.innerText = "COMMITTING...";
        setMoodState("saving");

        const cleanSnippet = textToSwallow.replace(/[*_#`~]/g, "").slice(0, 40).trim();
        const safeTitle = cleanSnippet.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 25);
        const dateTag = new Date().toISOString().slice(0, 10);
        const timeTag = new Date().toTimeString().slice(0, 5).replace(":", "");
        const targetPath = `${WORKSPACE_ROOT}/logs/anna-v4-swallow-${dateTag}-${safeTitle || timeTag}.md`;
        const fileContent = `# AGENT ANNA V4 // OPERATIONAL SWALLOW LOG (${WORKSPACE_ROOT})\n# TIMESTAMP: ${new Date().toISOString()}\n# scout_date:${dateTag}\n\n## CAPTURED INTELLIGENCE\n${textToSwallow}\n`;

        const ok = await writeFileToGitHub(targetPath, fileContent, `Agent Anna V4 Swallow Commit: ${safeTitle || "vault-log"}`);
        if (ok) {
            if (btnEl) btnEl.innerText = "COMMITTED [201]!";
            repoVaultFiles[targetPath] = fileContent;
            speakText("Saved to log.");
            await fetchRepoTree();
        } else {
            if (btnEl) btnEl.innerText = "COMMIT FAILED";
        }
        setMoodState("standby");
        if (btnEl) setTimeout(() => { btnEl.innerText = "SWALLOW"; }, 3000);
    }

    function initSpeechRecognition() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) return null;
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onstart = () => {
            isListening = true;
            setMoodState("listening");
            const micBtn = document.getElementById("mic-btn");
            if (micBtn) micBtn.classList.add("listening");
        };
        rec.onresult = (event) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i] && event.results[i][0]) transcript += event.results[i][0].transcript;
            }
            const inputEl = document.getElementById("user-input");
            if (transcript.trim() && inputEl) inputEl.value = transcript.trim();
        };
        rec.onerror = () => { stopMicrophone(); setMoodState("standby"); };
        rec.onend = () => { stopMicrophone(); };
        return rec;
    }

    function toggleMicrophone() {
        if (!recognition) recognition = initSpeechRecognition();
        if (!recognition) return;
        if (isListening) {
            isListening = false;
            try { recognition.stop(); } catch (e) {}
            stopMicrophone();
        } else {
            try { recognition.start(); } catch (e) {}
        }
    }

    function stopMicrophone() {
        isListening = false;
        const micBtn = document.getElementById("mic-btn");
        if (micBtn) micBtn.classList.remove("listening");
        if (document.body.classList.contains("is-listening") || document.body.classList.contains("is-responding")) {
            setMoodState("standby");
        }
    }

    function toggleVoice() {
        isVoiceEnabled = !isVoiceEnabled;
        const btn = document.getElementById("voice-btn");
        if (btn) { btn.innerText = isVoiceEnabled ? "🔊" : "🔇"; btn.setAttribute("aria-pressed", String(isVoiceEnabled)); }
        updateVoiceBadge();
        if (!isVoiceEnabled) executeStfuProtocol();
        else speakText("Voice on.");
    }

    function toggleSettings() {
        const p = document.getElementById("settings-panel");
        if (!p) return;
        const current = window.getComputedStyle(p).display;
        p.style.display = current === "block" ? "none" : "block";
    }

    function updateActiveModel() {
        const selectEl = document.getElementById("model-select");
        if (selectEl) {
            try { localStorage.setItem("DAHL_MODEL", selectEl.value); } catch (e) {}
        }
    }

    async function saveCredentials() {
        const apiEl = document.getElementById("api-key");
        const ghEl = document.getElementById("gh-token");
        const apiKey = cleanHeaderToken(apiEl ? apiEl.value : "");
        const ghToken = cleanHeaderToken(ghEl ? ghEl.value : "");
        const selectedModel = getActiveModel();
        if (apiEl) apiEl.value = apiKey;
        if (ghEl) ghEl.value = ghToken;
        try {
            if (apiKey) localStorage.setItem("DAHL_API_KEY", apiKey);
            if (ghToken) localStorage.setItem("GITHUB_PAT", ghToken);
            localStorage.setItem("DAHL_MODEL", selectedModel);
        } catch (e) {}
        updateRoomDecor();
        updatePulseCadence();
        updateKeyBadge();
        toggleSettings();
        await syncAll();
    }

    function handleKey(e) {
        if (e && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function triggerPreset(queryText) {
        const inputEl = document.getElementById("user-input");
        if (inputEl) inputEl.value = queryText;
        sendMessage();
    }

    // === ANNA V4.0 BYPASS & OFFLINE WORLD SEARCH START ===
const annaOfflineSearchCache = new Map();
const annaCreatedMdRegistry = new Map();

function isBypassPrompt(rawText) {
    const t = String(rawText || "").trim().toLowerCase();
    if (!t) return true;
    const simpleSet = new Set(["ping", "pong", "hi", "hello", "hey", "yo", "test", "ok", "status"]);
    if (simpleSet.has(t)) return true;
    if (t.length <= 16 && /^(ping|hi|hello|hey|yo|test|status)\b/.test(t)) return true;
    return false;
}

function registerCreatedMarkdownFile(path, content) {
    if (!path || typeof content !== "string") return;
    if (/\.md$/i.test(path.trim())) {
        annaCreatedMdRegistry.set(path.trim(), content);
        annaOfflineSearchCache.clear();
    }
}

function getAgentAnnaVoiceHeader(bypassMode = false) {
    const capabilityLedger =
        "CAPABILITIES & BOUNDARIES: You run in the V4 cockpit (A1/v4) with Dahl chat/audit, GitHub file sync/edit/commit/delete via PAT, browser TTS (SPEAK/STFU when supported), and session image inspection with optional SAVE TO REPO into A1/v4/vision/uploads/. Heavy project data belongs outside A1/v4 (such as A1/strayd/ and planned A1/dispatch-social/ + repo-root workflows). State honestly when a feature is external or not yet built; never claim TTS is missing or invent unbuilt tools.";
    if (bypassMode) {
        return (
            "You are AGENT ANNA V4 (AA01) inside A1/v4.\n" +
            "VOICE: Sharp, calm, direct, zero fluff, military-grade clarity.\n" +
            capabilityLedger + "\n" +
            "RULES: Reply immediately and concisely. Never read markdown or code blocks aloud."
        );
    }
    return (
        "You are AGENT ANNA V4 (AA01) inside A1/v4 of agent-anna/anna-v2.\n" +
        "VOICE: Sharp, calm, composed, tactical, zero fluff, zero filler.\n" +
        capabilityLedger + "\n" +
        "RULES: V4 state lives in A1/v4/memory/brain.json, A1/v4/memory/memory.json, and A1/v4/memory.json (code in A1/v4/functions/). Reach for requested files/layers on demand without bloating normal replies; never invent missing files or live web facts; never read code blocks aloud."
    );
}

function searchOfflineWorld(promptText) {
    const q = String(promptText || "").trim().toLowerCase();
    if (!q || isBypassPrompt(q)) return "";

    const cacheKey = `${q}::${Object.keys(repoVaultFiles || {}).length}::${annaCreatedMdRegistry.size}`;
    if (annaOfflineSearchCache.has(cacheKey)) {
        return annaOfflineSearchCache.get(cacheKey);
    }

    const terms = q
        .replace(/[^a-z0-9_\-\/\.]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2);

    if (terms.length === 0) return "";

    const sources = [];
    if (typeof repoVaultFiles === "object" && repoVaultFiles) {
        for (const [p, txt] of Object.entries(repoVaultFiles)) {
            if (/\/soul\//i.test(p)) continue;
            if (typeof txt === "string" && txt.trim()) {
                sources.push({ path: p, text: txt, createdMd: false });
            }
        }
    }
    for (const [p, txt] of annaCreatedMdRegistry.entries()) {
        if (/\/soul\//i.test(p)) continue;
        if (typeof txt === "string" && txt.trim()) {
            sources.push({ path: p, text: txt, createdMd: true });
        }
    }

    const pillarWeight = (p, isCreatedMd) => {
        const lp = String(p || "").toLowerCase();
        if (lp.endsWith("memory/brain.json")) return 100;
        if (lp.endsWith("memory/memory.json") || lp.endsWith("/memory.json")) return 110;
        if (lp.includes("/knowledge/") || (isCreatedMd && lp.endsWith(".md"))) return 120;
        if (lp.includes("/character/")) return 130;
        if (lp.includes("/memory/")) return 140;
        if (lp.includes("/registry/") || lp.includes("/vault/")) return 155;
        if (lp.includes("/docs/") || lp.includes("/vision/")) return 170;
        if (lp.includes("/logs/")) return 185;
        return 190;
    };

    const hits = [];
    for (const src of sources) {
        const lines = src.text.split(/\r?\n/);
        let score = 0;
        const matchedLines = [];
        const lp = src.path.toLowerCase();

        for (const term of terms) {
            if (lp.includes(term)) score += 6;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ll = line.toLowerCase();
            let lineHits = 0;
            for (const term of terms) {
                if (ll.includes(term)) lineHits++;
            }
            if (lineHits > 0) {
                score += lineHits * 3;
                if (matchedLines.length < 4 && line.trim()) {
                    matchedLines.push(`L${i + 1}: ${line.trim().slice(0, 180)}`);
                }
            }
        }

        if (score > 0 && matchedLines.length > 0) {
            hits.push({
                path: src.path,
                score: score - (pillarWeight(src.path, src.createdMd) * 0.05),
                snippet: matchedLines.join(" | ")
            });
        }
    }

    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, 5);
    const out = top.length > 0
        ? "[OFFLINE_WORLD_MATCHES]\n" + top.map((h) => `- ${h.path}: ${h.snippet}`).join("\n")
        : "";

    if (annaOfflineSearchCache.size > 60) annaOfflineSearchCache.clear();
    annaOfflineSearchCache.set(cacheKey, out);
    return out;
}
// === ANNA V4.0 BYPASS & OFFLINE WORLD SEARCH END ===

// === ANNA V4.0 PILLARS & GITBOOK MIRROR START ===
const annaGitbookState = {
    pages: [],
    index: 0
};

function parsePillarPayload(rawText) {
    if (typeof rawText !== "string" || !rawText.trim()) {
        return { ok: false, parsed: null, raw: "" };
    }
    const trimmed = rawText.trim();
    try {
        return { ok: true, parsed: JSON.parse(trimmed), raw: trimmed };
    } catch {
        return { ok: false, parsed: null, raw: trimmed.slice(0, 600) };
    }
}

function getCorePillarsContext(promptText) {
    const q = String(promptText || "").trim().toLowerCase();
    const asksBrain = /\bbrain(\.json)?\b/.test(q);
    const asksMemory = /\bmemory(\.json)?\b/.test(q);
    const asksPillars = /\bpillars?\b|\bcore\b/.test(q);

    if (!asksBrain && !asksMemory && !asksPillars) return "";

    const vault = (typeof repoVaultFiles === "object" && repoVaultFiles) ? repoVaultFiles : {};
    const sections = [];

    if (asksBrain || asksPillars) {
        const bRaw = vault["A1/v4/memory/brain.json"] || "";
        const bInfo = parsePillarPayload(bRaw);
        sections.push(
            bInfo.ok
                ? `[PILLAR: brain.json]\n${JSON.stringify(bInfo.parsed, null, 2).slice(0, 1200)}`
                : `[PILLAR: brain.json (RAW/UNPARSED)]\n${bInfo.raw || "(not loaded in session vault yet)"}`
        );
    }

    if (asksMemory || asksPillars) {
        const m1Raw = vault["A1/v4/memory/memory.json"] || "";
        const m0Raw = vault["A1/v4/memory.json"] || "";
        const m1Info = parsePillarPayload(m1Raw);
        const m0Info = parsePillarPayload(m0Raw);

        if (m1Info.ok) {
            sections.push(`[PILLAR: memory/memory.json]\n${JSON.stringify(m1Info.parsed, null, 2).slice(0, 1200)}`);
        } else if (m1Info.raw) {
            sections.push(`[PILLAR: memory/memory.json (RAW/UNPARSED)]\n${m1Info.raw}`);
        }

        if (m0Info.ok) {
            sections.push(`[PILLAR: memory.json]\n${JSON.stringify(m0Info.parsed, null, 2).slice(0, 1000)}`);
        } else if (m0Info.raw) {
            sections.push(`[PILLAR: memory.json (RAW/UNPARSED)]\n${m0Info.raw}`);
        }

        if (!m1Info.raw && !m0Info.raw) {
            sections.push("[PILLAR: memory.json]\n(not loaded in session vault yet)");
        }
    }

    return sections.join("\n\n");
}

function getGitbookMirrorPages() {
    const vault = (typeof repoVaultFiles === "object" && repoVaultFiles) ? repoVaultFiles : {};
    const orderedPaths = [
        "A1/v4/docs/agent-anna-docs/landing-page/README.md",
        "A1/v4/docs/agent-anna-docs/landing-page/SUMMARY.md",
        "A1/v4/docs/agent-anna-docs/landing-page/01-the-roots.md",
        "A1/v4/docs/agent-anna-docs/landing-page/02-the-trunk.md",
        "A1/v4/docs/agent-anna-docs/landing-page/03-the-branches.md",
        "A1/v4/docs/agent-anna-docs/landing-page/04-tree-of-life.md",
        "A1/v4/docs/00-anna-bible-index.md"
    ];

    const pages = [];
    for (const p of orderedPaths) {
        if (typeof vault[p] === "string" && vault[p].trim()) {
            pages.push({ path: p, content: vault[p] });
        }
    }
    annaGitbookState.pages = pages;
    return pages;
}

function flipGitbookPage(delta = 1) {
    const pages = annaGitbookState.pages.length ? annaGitbookState.pages : getGitbookMirrorPages();
    if (!pages.length) return null;
    annaGitbookState.index = (annaGitbookState.index + delta + pages.length) % pages.length;
    return {
        pageNumber: annaGitbookState.index + 1,
        totalPages: pages.length,
        page: pages[annaGitbookState.index]
    };
}

function getGitbookMirrorContext(promptText) {
    const q = String(promptText || "").trim().toLowerCase();
    if (!/\b(gitbook|bible|handbook|flip\s*page|next\s*page|prev\s*page|docs\/)\b/.test(q)) {
        return "";
    }
    const pages = getGitbookMirrorPages();
    if (!pages.length) {
        return "[GITBOOK_MIRROR]\nMirror pages are on-demand and not loaded yet. Run SYNC if you need to pull A1/v4/docs/ pages.";
    }
    if (/\bprev\s*page\b/.test(q)) flipGitbookPage(-1);
    else if (/\bnext\s*page\b/.test(q)) flipGitbookPage(1);

    const cur = pages[annaGitbookState.index] || pages[0];
    return `[GITBOOK_MIRROR (Page ${annaGitbookState.index + 1}/${pages.length}: ${cur.path})]\n${cur.content.slice(0, 1400)}`;
}
// === ANNA V4.0 PILLARS & GITBOOK MIRROR END ===

async function getRequestedMemoryContext(promptText) {
    const q = String(promptText || "").toLowerCase();
    const wantsBrain = /\bbrain(\.json)?\b/.test(q);
    const wantsMemory = /\bmemory(\.json)?\b/.test(q);
    const wantsAudit = /\baudit\b/.test(q);
    if (!wantsBrain && !wantsMemory && !wantsAudit) return "";

    const targets = [];
    if (wantsBrain) targets.push("A1/v4/memory/brain.json");
    if (wantsMemory) targets.push("A1/v4/memory/memory.json");
    if (wantsMemory || wantsAudit) targets.push("A1/v4/memory.json");

    const sections = [];
    let treeEntries = null;

    for (const path of targets) {
        let content = typeof repoVaultFiles === "object" && repoVaultFiles ? repoVaultFiles[path] : "";
        if (!content) {
            try {
                if (!treeEntries) {
                    const treeRes = await fetchWithTimeout(
                        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/trees/${encodeURIComponent(activeBranch || "main")}?recursive=1`,
                        { headers: getGitHubHeaders(), cache: "no-store" },
                        6000
                    );
                    if (treeRes && treeRes.ok) {
                        const treeJson = await treeRes.json();
                        treeEntries = Array.isArray(treeJson.tree) ? treeJson.tree : [];
                    }
                }
                const blobEntry = Array.isArray(treeEntries)
                    ? treeEntries.find((item) => item && item.path === path && item.type === "blob" && item.sha)
                    : null;
                if (blobEntry) {
                    const blobRes = await fetchWithTimeout(
                        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/blobs/${blobEntry.sha}`,
                        { headers: getGitHubHeaders(), cache: "no-store" },
                        6000
                    );
                    if (blobRes && blobRes.ok) {
                        const blobData = await blobRes.json();
                        if (blobData && blobData.content) {
                            const binString = atob(String(blobData.content).replace(/\s/g, ""));
                            content = new TextDecoder().decode(Uint8Array.from(binString, (m) => m.codePointAt(0)));
                            if (typeof repoVaultFiles === "object" && repoVaultFiles) {
                                repoVaultFiles[path] = content;
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        if (content) {
            const sliceLimit = path === "A1/v4/memory.json" ? 2200 : 3000;
            sections.push(`[FILE: ${path}]\n${content.slice(0, sliceLimit)}`);
        }
    }
    return sections.length ? `[REQUESTED_MEMORY_FILES]\n${sections.join("\n\n")}` : "";
}

async function sendMessage() {
        const input = document.getElementById("user-input");
        const prompt = input ? input.value.trim() : "";
        if (!prompt) return;

        appendMessage("Commander", prompt, "msg_u_" + Date.now(), false);
        if (input) input.value = "";
        chatHistory.push({ role: "user", content: prompt });

        const assistantMsgId = "msg_a_" + Date.now();
        appendMessage("Agent Anna V4", "Working...", assistantMsgId, true);
        setMoodState("thinking");

        try {
            const bypassMode = isBypassPrompt(prompt);
            const voiceHeader = getAgentAnnaVoiceHeader(bypassMode);
            const offlineHits = bypassMode ? "" : searchOfflineWorld(prompt);
            const vaultContext = bypassMode ? "" : getCompactVaultContext(prompt);
            const pillarContext = bypassMode ? "" : getCorePillarsContext(prompt);
            const gitbookContext = bypassMode ? "" : getGitbookMirrorContext(prompt);
            const memoryFileContext = bypassMode ? "" : await getRequestedMemoryContext(prompt);
            const systemPrompt = [voiceHeader, vaultContext, pillarContext, offlineHits, gitbookContext, memoryFileContext].filter(Boolean).join("\n\n");

            const result = await callDahlDirect(
                [
                    { role: "system", content: systemPrompt },
                    ...chatHistory.slice(-3)
                ],
                (liveText, liveTtft, liveElapsed, liveModel) => {
                    setMoodState("responding");
                    updateMessage(assistantMsgId, `${liveText}\n\n[Anna v4 | TTFT: ${liveTtft}ms | ${liveElapsed}ms streaming]`);
                }
            );

            const reply = typeof result === "string" ? result : result.text;
            const timingTag = typeof result === "object" && result
                ? `\n\n[Anna v4 | HTTP ${result.status} | TTFT: ${result.ttftMs}ms | Total: ${result.totalMs}ms]`
                : "";

            setMoodState("responding");
            chatHistory.push({ role: "assistant", content: formatReadableMessage(reply) });
            updateMessage(assistantMsgId, `${reply}${timingTag}`);
            speakText(reply);
            await parseAndExecuteAutonomousFiles(reply);
        } catch (err) {
            setMoodState("error");
            const msg = err && err.message ? err.message : "Dahl request failed.";
            updateMessage(assistantMsgId, msg);
            speakText("Dahl request failed.");
        }

        setMoodState("standby");
    }

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) isFullPageMode = false;
        syncFullPageButtonUi();
    });

    window.addEventListener("DOMContentLoaded", async () => {
        const savedToken = getStoredKey(["GITHUB_PAT", "gh_token", "github_token"]);
        const ghEl = document.getElementById("gh-token");
        if (savedToken && ghEl) {
            try { localStorage.setItem("GITHUB_PAT", savedToken); } catch (e) {}
            ghEl.value = savedToken;
        }

        const savedApiKey = getStoredKey(["DAHL_API_KEY", "dahl_api_key", "OPENAI_API_KEY", "api_key"]);
        const apiEl = document.getElementById("api-key");
        if (savedApiKey && apiEl) {
            try { localStorage.setItem("DAHL_API_KEY", savedApiKey); } catch (e) {}
            apiEl.value = savedApiKey;
        }

        let savedModel = DEFAULT_MODEL;
        let savedDecor = "military-calm";
        let savedPulse = "1";
        try {
            savedModel = localStorage.getItem("DAHL_MODEL") || DEFAULT_MODEL;
            savedDecor = localStorage.getItem("ANNA_V4_DECOR") || "military-calm";
            savedPulse = localStorage.getItem("ANNA_V4_PULSE_SCALE") || "1";
        } catch (e) {}

        const topSelect = document.getElementById("model-select");
        if (topSelect) topSelect.value = savedModel;

        applyRoomDecorVisuals(savedDecor);
        applyPulseCadence(savedPulse);

        const fileEl = document.getElementById("v4-vision-file");
        if (fileEl) {
            fileEl.addEventListener("change", (e) => {
                const f = e.target.files && e.target.files[0];
                loadSeeOnlyImageFile(f);
            });
        }

        const pasteZone = document.getElementById("v4-paste-zone");
        if (pasteZone) {
            pasteZone.addEventListener("paste", (e) => {
                const items = (e.clipboardData && e.clipboardData.items) || [];
                for (const item of items) {
                    if (item.type && item.type.startsWith("image/")) {
                        loadSeeOnlyImageFile(item.getAsFile());
                        break;
                    }
                }
            });
        }

        updateKeyBadge();
        updateVoiceBadge();
        setActionsStatus("IDLE", "");
        syncFullPageButtonUi();

        if ("speechSynthesis" in window) {
            loadVoices();
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }

        await syncAll();
    });

    window.setMoodState = setMoodState;
    window.updateActiveModel = updateActiveModel;
    window.updateRoomDecor = updateRoomDecor;
    window.updatePulseCadence = updatePulseCadence;
    window.clearSeeOnlyVision = clearSeeOnlyVision;
    window.saveVisionImageToRepo = saveVisionImageToRepo;
    window.triggerAutonomousBootSequence = triggerAutonomousBootSequence;
    window.toggleFolderRowEl = toggleFolderRowEl;
    window.toggleVoice = toggleVoice;
    window.toggleFullPageMode = toggleFullPageMode;
    window.toggleSettings = toggleSettings;
    window.saveCredentials = saveCredentials;
    window.toggleViewMode = toggleViewMode;
    window.syncAll = syncAll;
    window.fetchLatestBackendReport = fetchLatestBackendReport;
    window.triggerPreset = triggerPreset;
    window.auditActiveFile = auditActiveFile;
    window.commitCurrentFile = commitCurrentFile;
    window.promptDeleteFile = promptDeleteFile;
    window.confirmDeleteFile = confirmDeleteFile;
    window.cancelDeleteFile = cancelDeleteFile;
    window.loadRepoFile = loadRepoFile;
    window.toggleMicrophone = toggleMicrophone;
    window.handleKey = handleKey;
    window.sendMessage = sendMessage;
    window.clearLogs = clearLogs;
    window.speakStoredMessage = speakStoredMessage;
    window.copyToClipboard = copyToClipboard;
    window.autonomousSwallowAndCommit = autonomousSwallowAndCommit;
    window.executeStfuProtocol = executeStfuProtocol;
    window.deleteMessage = deleteMessage;
})();
