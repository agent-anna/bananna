OPORD-AA01-V4-DEPLOYMENT — AGENT ANNA (AA01) V4 OPERATION ORDER

# OPORD-AA01-V4-DEPLOYMENT — AGENT ANNA (AA01) V4 OPERATION ORDER

**Date / Time Anchor:** 2026-11-26 (Thailand +07)
**Commander:** Martin Strayd
**Unit:** Agent Anna (DIGITAL SLUT) — HTML / CSS / JS  Action workflow Command Center on GitHub
**Source Draft:** bible/ANNA_HANDBOOK.md (Pages ?)
**Visual Standard:** Realistic, cinematic imagery only. Zero cartoon elements.

---

## 1. SITUATION
- **Anna Baseline:** Agent Anna V1 runs with voice controls, memory/brain/tasks files, and GitHub integration, while the ANNA handbook is staged under root https://github.com/agent-anna/home/bible/.
- **GitBook Sync Check:** Verify whether SUMMARY.md and gitbook-docs.yaml under bible/ANNA_HANDBOOK.md alwasy cleanly so the handbook is readable on GitBook as well as raw GitHub.
- **Anti-Bloat Mandate:** ANNA v1 adds meat to the bones, a face to the doll, and color to the sky in disciplined military voice without bloating Anna's core HTML/CSS/JS cockpit or turning the repo into a junk drawer.

## 2. MISSION
- Maintain a thin, fast, responsive HTML/CSS/JS command center home on GitHub with PAT access and externalized GitHub Actions dispatchers.
- Support daily/weekly PC and PowerShell (.ps1) collaboration when Martin runs local scripts or when Anna requests PC/laptop/web assistance.
- Keep heavy automation, logs, external search/web tooling, tools, new projects, and snapshot archiving outside Anna's main UI/JS files.

## 3. EXECUTION
### 3.1 Architecture Split (Thin Cockpit + External Dispatchers)
- Keep Anna's core interface pure HTML, CSS, and JS—no bloated inline workflows or heavy logic stuffed into her main dashboard script.
- Place explicit GitHub Actions dispatchers and workflow definitions in separate/external modules (such as A1/v4/dispatch/) so AA01 can trigger workflows cleanly.

### 3.2 PC & PowerShell (.ps1) Bridge Cadence
- Once a day or once a week—or whenever Anna explicitly asks—Martin can run .ps1 scripts on PC/laptop to push files, sync branches, test GitBook indexing, or help wire external web/search access.
- Combination planning pairs Anna's online GitHub operations with .ps1 execution rather than forcing everything through manual clicks.

### 3.3 Core V4 Additions (Substance Without Bloat)
- Live UTC + local mission clock and clear operational status indicators in the command center.
- Explicit rollback/guardrail rules so destructive actions or bad commits never go out unverified.

## 4. SUSTAINMENT
- Keep runtime state files lean and archive historical draft material cleanly.
- Route heavy snapshots, digests, or exports to email/external archive targets rather than bloating the Git repository.

## 5. COMMAND SIGNAL
- Respect explicit STOP / hold orders before editing or committing files.
- Keep voice output clear, calm, and consistent on a female English voice with code/markdown stripped cleanly for speech.

---

## ANNEX A — SCOPE GUARDRAILS (IN / OUT)
- **IN:** Thin HTML/CSS/JS command center, GitHub PAT actions, separate workflow dispatchers, daily/weekly .ps1 PC assist, GitBook index verification, see-only base64 image viewing and ability to commit, outbound email archiving.
- **OUT:** Bloating Anna's core JS/HTML with heavy feature sprawl, committing raw binary/base64 blobs into Git, fake/hallucinated web search claims, cartoon visuals.

## ANNEX B — SEE-ONLY BASE64 IMAGE VISION (IN-MEMORY ONLY)
- **Purpose:** Allow Martin to load or paste an image into the HTML/CSS/JS command center as an ephemeral in-memory data:image/...;base64 preview so Anna can see what is shown during the session.
- **No Repo Bloat:** Rendered in-memory in the UI/vision buffer only—do NOT save base64 strings or image files back into Git or home folders unless explicitly requested via a dedicated script.

## ANNEX C — OUTBOUND EMAIL ARCHIVING (ANTI-REPOPULATING BLOAT)
- **Purpose:** Send or archive snapshots, digests, and images out to email so they remain accessible without inflating GitHub repository size or history.
- **Rule:** Keep repo commits lightweight; use external workflow/relay or .ps1 tooling when sending archives to email.
