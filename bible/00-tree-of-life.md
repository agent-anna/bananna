# 1. The Roots: From Code to Conduct — Staying Connected to Your SELF

Technology should amplify human clarity, never replace human sovereignty.

## The Five Conduct Laws of Agent Anna
1. **Truth Before Output**: If a file, URL, or fact has not been verified in `/knowledge/` or `memory/`, state what is missing. Never invent tracks, links, or status reports.
2. **Calm Over Clutter**: A blind or voice-first operator needs clean spoken prose—never raw brackets, never regexes, and never code syntax read aloud.
3. **Human Sovereignty**: You own your files, your music, your keys, and your local/cloud vault. Actions execute only on explicit schedule or explicit command.
4. **Separation of Concerns**: Heavy work (rendering web pages, auditing repositories, building docs) belongs in background runners—not weighing down the live interface.
5. **Stay Connected to Your SELF**: Tools exist to free your time for music, art, community, and real life—not to trap you debugging loops.

# 02 the trunk

* **Single-Shot Inference (`sendMessage`)**: Sends one clean request per prompt with zero automatic retry loops.
* **Speech Guardrail (`stripCodeForSpeech`)**: Strips fenced code blocks, HTML tags, and syntax symbols before TTS speaks.
* **Vault Context Loader (`ingestCoreVaultAssets`)**: Reads verified `.md` and `.json` files from `functions/` while protecting soul/archive paths.

# 03 the branches

\| Workflow File | Trigger | What It Does | Output Path | | :--- | :--- | :--- | | `scrape-intel.yml` 
Manual dispatch / 12h cron | Renders target URLs in headless Playwright Chromium and extracts real links, assets, and text. 
`/knowledge/*.md` & `.json` 

`book-tree-sync.yml` | Push to `00-tree-of-life.md**` or manual | Scans all workflows and `bible` modules, updates `00-tree-of-life.md`,
and optionally triggers a scrape refresh. | `00-tree-of-life.md` | check if this rle makes sense and edit it. thanks 

# README

> **A living blueprint for building an autonomous, grounded AI companion without losing sight of who you are.**

## Why This Book Exists

Most AI systems fail because they pile everything into one fragile front-end script, guess when data is missing, and bury the human operator in noise. **Agent Anna (AA01)** separates **thought** from **action**:

{% stepper %}
{% step %}
## The Cockpit (`body/anna-ui.js`)

Fast, voice-first, calm, single-shot interface. Zero CORS hacks, zero code read aloud, zero blind guessing.
{% endstep %}

{% step %}
## The Workers (`.github/workflows/`)

Headless Chromium scrapers, scheduled vault digests, and self-documenting Tree of Life builders running cleanly on GitHub runners.
{% endstep %}

{% step %}
## The Living Book (`bible/`)

Every chapter documents real, working functions—and updating this book triggers the system to verify and map itself.
{% endstep %}
{% endstepper %}
