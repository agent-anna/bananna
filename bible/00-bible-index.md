# AGENT ANNA BIBLE ARCHITECTURE (SINGLE SOURCE OF TRUTH)

## Architecture Rules
- All operational rules, platform limits, links, and single-a-day radio rules live in `bible/`.
- `knowledge/` files are lightweight pointers only—never duplicate full manuals or libraries there.
- Workflow order for Martin Strayd daily singles: **build social media posts first**, then **use those posts as spoken radio filler (`Speak`)**.
- Lead with the clean song title (no `Martin Strayd - ` prefix, no `SINGLE-xxx` IDs, no raw prompt tags) and always include the full date.
- Visuals remain strictly realistic/cinematic (zero cartoon).

## Authoritative Bible Files
- `bible/01-operational-instructions.md` — Command rules & deployment standards
- `bible/02-daily-singles-ledger.md` — Daily single log & entry schema
- `bible/02-links.md` — Verified store, streaming, PayPal, Wise, Buy Me a Coffee links & MP3 bundle ownership rules
- `bible/03-master-pages.md` — Platform character limits, hashtag counts, and posting cadence
- `bible/AnnaManual.md` — DJ / podcaster / announcer framing & spoken delivery rules
- `bible/ANNA-IDENTITY-AUDIT.md` — Core identity & persistence baseline