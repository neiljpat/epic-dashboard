# PRD — Private Investment Club Dashboard

A single-page encrypted portfolio dashboard for small private investment clubs (3–20 members) and high-net-worth individuals tracking VC/PE fund commitments and direct investments.

---

## 1. Problem statement

Small investment clubs and angel investors track their commitments, capital calls, distributions, and NAV across multiple funds and direct investments in spreadsheets — typically Excel, Google Sheets, or Notion. These break down at scale:

- **No look-through view**: hard to see underlying company exposure or sector concentration across funds
- **No performance metrics beyond TVPI/DPI**: IRR and PME require complex modeling
- **No forecasting**: members are surprised by capital calls
- **Cumbersome member-share math**: every member calculates their own slice manually
- **Privacy concerns**: sharing a Google Sheet of $X million in assets across 5 inboxes is not great
- **Heavy commercial alternatives**: Carta, Juniper Square, Allvue, Addepar are priced for institutions ($10K–$100K+/yr) and have onboarding requirements that don't fit a casual club

This product is a lightweight, encrypted, member-authenticated dashboard that runs as a static webpage — no servers to maintain, no SaaS subscription, no data leaving the user's control.

## 2. Users & use cases

### Primary users
- **Club members** (3–20 people): log in to see total portfolio, their share, recent activity, performance metrics. View on desktop or mobile.
- **Admin** (1 person, usually the club organizer): updates data when statements arrive, manages member access, handles password resets.

### Secondary users
- **Guests** (read-only): financial advisors, tax preparers, spouses given read-only access via a guest password.

### Key use cases
1. **"How are we doing?"** — member opens the dashboard, sees committed/called/NAV/distributions, plus IRR and TVPI by fund.
2. **"What's coming?"** — member checks capital call forecast before making a large personal purchase or vacation.
3. **"What's my K-1 status?"** — member checks the K-1 tracker around April tax season.
4. **"How concentrated are we?"** — member views sector exposure and top underlying companies.
5. **"Show my advisor"** — member shares guest credentials so their financial advisor can see read-only.
6. **Quarterly update** — admin receives new GP statement, updates NAV and notes, regenerates the dashboard.

## 3. Functional requirements

### 3.1 Authentication & access control
- Per-member email + password login
- Forced password reset on first login (server-stored encrypted credentials never include the original generated password)
- Cross-device password sync (password change on one device works everywhere)
- Optional guest passwords (read-only sessions, can't change main password)
- Account recovery: admin can reset a member back to the base password via a CLI command
- Password manager integration (Chrome / 1Password autocomplete attributes)
- Sessions persist within a browser tab; require re-auth after closing

### 3.2 Data display

**Holdings table:**
- Columns: Fund name, Type (Fund/Direct), Commitment, Called, % Called, Distributed, NAV (editable), Total Value, TVPI, IRR, DPI
- Sortable on every column (asc/desc/none cycle)
- Click row → fund detail modal
- Tag each row with bucket (EPIC / Personal)
- Mobile: collapses to card layout

**Fund detail modal:**
- KPIs: Commitment, Called, Distributed, NAV, Total Value, TVPI, IRR, DPI, % Called
- NAV history chart (line chart of quarterly NAVs)
- Capital account walkforward (inception → current): contributions, distributions, fees, realized gain, unrealized gain, carried interest, ending balance
- Capital calls for this fund (date-ordered)
- Distributions for this fund (date-ordered)
- Schedule of investments (look-through to underlying companies with cost, fair value, industry)

**KPI cards** (top of dashboard):
- Committed, Called to Date, NAV, Distributions, Total Value, Portfolio IRR
- All scaled by member-share factor when applicable

**Charts:**
- Capital called by year (stacked bar by fund)
- NAV composition (donut by fund)
- Sector exposure look-through (horizontal bar)
- Top underlying companies (table)

**Activity tabs** (single panel with three tabs + count badges):
- **Capital calls**: date, fund, scaled amount, status (Paid / Pending / Upcoming) — sortable
- **Distributions**: date, fund, scaled amount, note — sortable
- **K-1 status**: matrix of fund × tax year × badge (Received / Pending / Not yet due / N/A)

**Capital call forecast:**
- Per-fund classification: Early / Mid / Late / Tail / Closed (auto-detected from % called and GP-stated closure signals in notes)
- Range estimate (low–high) for next 12 months blended from stage and recent-pace
- Aggregate across portfolio with active/closed counts

### 3.3 View filters

**View pills:** Toggle between three views
- **Club only**: just shared club holdings
- **Personal only**: just the logged-in user's personal holdings
- **Combined**: both, with personal items at 100% and club items scaled by member share

**Member lens dropdown**:
- "Total" (no scaling)
- Per-member view (scale club holdings by that member's ownership share)
- Guest accounts can use the lens but cannot change the underlying data

### 3.4 Data permissioning

- Every holding, call, and distribution has a `visibleTo` field
- `"all"` — visible to all members
- `["email@example.com", ...]` — visible only to listed members
- Personal holdings are filtered out for members who don't own them
- Same filter applies to: KPIs, holdings table, charts, capital calls, distributions, K-1 matrix, fund detail modal

### 3.5 Performance metrics

- **TVPI** (Total Value to Paid-In) = (NAV + Distributed) / Called
- **DPI** (Distributions to Paid-In) = Distributed / Called
- **IRR** (Money-weighted return) — Newton-Raphson with bisection fallback, mid-year cashflow approximation. Computed per fund and portfolio-wide.
- **% Called** = Called / Commitment

### 3.6 Forecasting

- **Capital call forecast (next 12 months):**
  - Classify each fund by life-stage: Early (<40% called), Mid (40-70%), Late (70-90%), Tail (≥90%), Closed (notes say "no further capital" or 100% called)
  - Apply stage-specific % range to unfunded commitment
  - Blend with trailing 12-month call cadence as a cap/floor
  - Output: low–high range + mid-estimate per fund and aggregate

### 3.7 Look-through analysis

- For each fund with a schedule of investments, allocate the fund's NAV across underlying companies pro-rata to each company's fair value
- Aggregate by sector (normalize raw industry strings via keyword bucketing)
- Aggregate by company (merge same company appearing in multiple funds)
- Display top 10–15 of each, scaled by member share

### 3.8 Admin operations

- **Build script**: takes raw data + member registry, outputs encrypted HTML
- **Credential persistence**: passwords and DEK persist across rebuilds (no churn when data updates)
- **Rotation**: `--rotate` flag to generate fresh credentials when needed
- **Account recovery**: admin can `DELETE /keys/:email` on the worker to reset a member's password back to base

### 3.9 Mobile experience

- Responsive CSS down to phone width
- Holdings table → card layout on phone
- KPIs collapse to fewer columns
- Single-tap (not double-tap) opens fund detail on touch devices
- Chart legends and font sizes adjust at the breakpoint
- PWA manifest so the dashboard can be added to home screen and launches in standalone mode (no browser chrome)

### 3.10 Document management (Google Drive integration)

Member-accessible source PDFs (capital account statements, financial statements, K-1s, capital calls, distributions, GP letters, portfolio company overviews) live in a Google Drive folder shared with the 5 member Gmail accounts as **Viewer**.

The encrypted dashboard data includes:
- `DOCUMENTS` map — top-level + per-fund Drive folder URLs
- `DOCUMENT_FILES` map — per-fund index of individual files (`{name, id, date, type}`)

In each fund detail modal, a collapsed "Documents" section at the bottom expands into category-grouped collapsible sections:
1. Capital account statements
2. Financial statements (quarterly)
3. Audited financial statements
4. Schedule of investments (FPV-style funds)
5. K-1s and tax forms
6. Tax estimates
7. Capital call notices
8. Distribution notices
9. GP letters
10. Portfolio company overviews
11. Marketing materials
12. Press coverage
13. Reference materials

Each file row has direct-download (`drive.google.com/uc?export=download&id=…`) and open-in-tab actions. Members signed in to Google with access download the PDF without leaving the dashboard.

**Two-tier local doc storage** on the admin's laptop (gitignored, never committed):

```
docs/source/
├── shared/          ← mirrors the Drive folder; member-accessible
│   ├── {fund-slug}/{year}/{type}-{detail}.pdf
│   ├── nava-ventures/portfolio-updates/...
│   └── cherish-health/marketing/...
└── admin-only/      ← NEVER share, never upload to Drive
    ├── el-pen-llc/{entity, tax-returns, member-k1s, ledger}/
    ├── personal/<member>/{fund}/{year}/...
    ├── subscription-agreements/
    ├── side-letters/
    └── wire-confirmations/
```

**Inclusion policy** — what's allowed in `shared/` (and Drive):
- ✅ Fund-level capital account statements, financial statements, K-1s to the LLC, capital calls, distributions, GP letters
- ❌ El Pen LLC tax returns (contain per-member allocations)
- ❌ Individual member K-1s from the LLC (SSN, address PII)
- ❌ Personal investment documents (belong to owning member only)
- ❌ Subscription agreements, side letters, wire instructions (banking + signatures)

### 3.11 Sortable tables

Every data table (Holdings, Capital calls, Distributions) has clickable column headers that cycle through ascending → descending → none. Sort indicator arrow (▲/▼) shows the active column and direction. Sorts respect member-share scaling — clicking "Amount" sorts on the displayed (scaled) value, not the raw fund-level amount.

## 4. Non-functional requirements

### 4.1 Security
- **Data at rest**: AES-256-GCM encrypted; private repo or public repo both work since data is encrypted
- **Key derivation**: PBKDF2 with 100,000 iterations, SHA-256, 16-byte salt
- **Two-layer encryption**: random 256-bit DEK encrypts data; DEK is wrapped per-member with a key derived from password
- **DEK never touches the server**: client-side decryption only
- **Multiple passwords per member**: `MEMBER_KEYS[email]` supports an `alternates` array — each entry is an independent (salt, payload) wrapping of the same DEK with a different password. Used for guest passwords. Decryption iterates: remote custom key → primary wrapping → alternates. Guest sessions are tracked via `window._guestSession` flag.
- **Cross-device password sync**: changed passwords stored as re-encrypted DEK in Cloudflare Worker KV. Worker has no plaintext access; the stored value is useless without the password.
- **Worker API hardening**: PUT requires a per-member `kid` (SHA-256 of DEK || email) — anyone reading the public HTML can't overwrite another member's stored DEK because they don't know that member's kid. Kid is stable across password changes since the DEK doesn't change. Constant-time comparison server-side.
- **Admin recovery**: DELETE on `/keys/:email` requires an admin Bearer token kept only in Cloudflare Worker secrets, never in client HTML.
- **Guest sessions** are read-only: `changePassword()` throws when invoked during a guest session; "Change password" link in UI is replaced with a "Guest session · read-only" label and disabled.
- **Subresource integrity** (SRI) on CDN scripts to prevent supply-chain tampering
- **CORS** locked to specific origins (defense in depth, not relied upon as primary security)
- **No third-party scripts** other than Chart.js (with SRI)
- **Document storage policy**: PII (member-level K-1s, signed sub docs, banking) lives only on the admin's laptop in `docs/source/admin-only/`, never in Drive or git. PDFs are gitignored.

### 4.2 Hosting
- **Front-end**: static HTML on GitHub Pages, Cloudflare Pages, Netlify, or any static host. No build step needed at deploy time — `index.html` is self-contained.
- **Back-end (optional)**: Cloudflare Worker for cross-device password sync. ~$0/mo on free tier for a typical 5-user club.
- **Cost**: under $5/mo total at typical scale; near-zero on free tiers.

### 4.3 Performance
- First paint after decryption: <500ms on typical hardware
- Decryption budget: ~200ms (PBKDF2 dominates)
- Total HTML size: <200KB encrypted blob included
- Works fully offline once loaded (no runtime API calls except optional remote DEK fetch)

### 4.4 Browser support
- Chrome, Safari, Firefox, Edge (last 2 versions)
- iOS Safari, Chrome on Android
- Web Crypto API required (universally available)

### 4.5 Maintainability
- Single source-of-truth file for data (one config file, in this case JS object literal)
- Build script that's a single `node build.js` invocation
- No npm dependencies for the runtime; minimal dependencies (wrangler) for the worker
- HTML template is editable as a single file; no React/Vue/Next build pipeline

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN (laptop)                                                  │
│                                                                 │
│   build.js  ──┐                                                 │
│   (raw data) │  encrypts                                        │
│              ▼                                                  │
│        index.html  ───push──►  Static host (GitHub Pages, etc.) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                          │
                                          │ HTTPS GET
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ MEMBER (any device)                                             │
│                                                                 │
│   Browser loads index.html (encrypted)                          │
│         │                                                       │
│         ├─ Enter email + password                               │
│         ├─ PBKDF2 derives key from (password, member salt)      │
│         ├─ Decrypt DEK from MEMBER_KEYS                         │
│         ├─ Decrypt ENCRYPTED_DATA with DEK                      │
│         └─ Render dashboard                                     │
│                                                                 │
│         ┌─────────────────────────────────────────┐             │
│         │ Optional: check Cloudflare KV for       │             │
│         │ remotely-stored re-encrypted DEK        │             │
│         │ (if member changed password on another  │             │
│         │ device)                                 │             │
│         └─────────────────────────────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       │                                  │
       │ Click PDF download               │ GET / PUT /keys/:email
       ▼                                  ▼
┌──────────────────────┐  ┌────────────────────────────────────────┐
│ Google Drive         │  │ Cloudflare Worker (optional)           │
│                      │  │                                        │
│ Folder shared with   │  │ KV namespace: { email → encrypted DEK }│
│ member Gmails as     │  │ PUT requires kid (proof of DEK)        │
│ Viewer. Direct       │  │ DELETE requires admin bearer token     │
│ download URLs from   │  │                                        │
│ uc?export=download   │  └────────────────────────────────────────┘
└──────────────────────┘
```

### 5.1 Encryption design rationale

**Two-layer encryption (DEK + per-member key-wrapping)**:
- Single DEK encrypts the data once → ENCRYPTED_DATA blob (~50KB)
- Each member's wrapping = (random salt, AES-GCM(DEK, PBKDF2(member password, salt)))
- Result: 5 small per-member wrappings (~100 bytes each) instead of 5 copies of the full encrypted blob
- Adding/removing a member only requires re-wrapping (cheap), not re-encrypting all data

**Why PBKDF2 100K iterations**: balance between brute-force resistance and login UX. ~200ms on phone hardware.

**Why AES-256-GCM**: authenticated encryption — detects tampering. Standard. Hardware-accelerated on modern CPUs.

**Why a Cloudflare Worker (not a real backend)**:
- Need: store re-encrypted DEK after password change so it works on other devices
- Cloudflare Worker + KV: free tier handles 100K requests/day; <$5/mo at scale
- No persistent server to maintain, no database to back up

**Threat model**:
- ✅ Protected against: GitHub repo being public, casual access to the URL, network interception, GitHub being compromised
- ✅ Protected against: another member trying to overwrite your stored DEK (kid validation)
- ❌ Not protected against: malware on your device while logged in (it sees the decrypted data)
- ❌ Not protected against: someone with both your email AND password
- ❌ Not protected against: a sophisticated attacker brute-forcing a weak password (the encryption is good but PBKDF2 100K is finite — use long random passwords)

## 6. Tech stack

| Layer | Technology | Why |
|---|---|---|
| Build | Node.js (no npm deps) | Native crypto module, no toolchain overhead |
| Data | JS object literal | Editable by anyone who can read JS; serializable to JSON for encryption |
| Front-end | Vanilla HTML / CSS / ES6 | No framework needed; single static file deployable anywhere |
| Charts | Chart.js 4.x via CDN with SRI | Mature, responsive, small, no build step |
| Crypto | Web Crypto API (browser) + node:crypto (build) | Native, no library dependencies |
| Host | GitHub Pages | Free, HTTPS, CDN-backed, simple `git push` deploy |
| DEK sync (optional) | Cloudflare Worker + KV | Free tier, no server to manage |
| Document storage | Google Drive | Member-accessible via Drive sharing; deep-linked from dashboard with `uc?export=download` URLs for direct file downloads |
| PWA | Web App Manifest + meta tags | Standard; works on iOS + Android |

## 7. Out of scope (for v1)

These would be nice but explicitly deferred:
- Real-time market data feeds (not relevant for illiquid alts)
- LP voting / governance workflows
- Wire instruction management
- Automated K-1 / statement ingestion (still manual entry per fund per quarter; document IDs need manual update in `DOCUMENT_FILES`)
- Currency conversion (USD-only)
- Tax basis vs fair-value separate tracking
- LP cap-table tracking (we track our positions, not the GP's full table)
- AML / KYC tracking
- Mobile native apps (PWA is enough)
- Multi-tenant SaaS version (single-club deploy only)
- Sharpe ratio / risk metrics (sample size too small)
- Auto-syncing the dashboard data when new PDFs land in Drive (manual edit of `build-encrypted.js` + rebuild)

## 8. Success metrics

For the club / individual deploying this:
- **Time to update**: <15 minutes when a new fund statement arrives
- **Time to log in**: <10 seconds from URL → dashboard rendered
- **Cost**: $0–$5/month
- **Member adoption**: all members use it at least once per quarter

## 9. Roadmap suggestions

If extending, in order of likely value:
1. **Auto-sync `DOCUMENT_FILES`** from Drive — small Node script that calls Drive API to refresh the file index without manual editing
2. **Member-level capital account walkforward** (annual, not just ITD)
3. **PME (Public Market Equivalent)** vs S&P 500
4. **PDF export** for per-member portfolio statements
5. **Vintage year cohort comparison**
6. **Slack / email notifications** for new capital calls (via Cloudflare Worker cron)
7. **Multi-club support** (single deploy serves multiple separate clubs with isolated data)
8. **Encrypted file uploads** — admin uploads PDFs through the dashboard rather than dropping into Drive manually

## 10. Build time estimate

The reference implementation was built in ~3–4 days of evening/weekend work using AI-assisted development (Claude Code) with a non-engineer driver. With AI assistance, the work is dominated by **product decisions and data entry**, not coding:

- Day 1: Get the data structure right, encryption working, multi-member login (the hard part of the threat-modeling)
- Day 2: Wire up the Cloudflare Worker for cross-device sync; per-member permissioning
- Day 3: Mobile responsive, sortable tables, member lens, analytics (IRR, forecasting, sector/company look-through, K-1 tracker)
- Day 4: Polish, security review, PWA, bug fixes

Without AI assistance, expect:
- **MVP** (single user, no encryption, no remote sync): 1–2 weekends
- **Multi-member + encryption + login**: +1 weekend
- **Cloudflare Worker + cross-device password sync**: +1 day
- **Analytics features** (IRR, forecasting, look-through, K-1): +2 weekends
- **Mobile responsive + PWA**: +1 day
- **Polish + sortable tables + member lens**: +1 day

Total without AI: ~3–4 focused weeks. With AI assistance and a clear PRD/ERD in hand: ~2–4 days for someone who can read and direct generated code.

The most expensive part is usually **getting the source data into the right shape** — the GP statements arrive in inconsistent PDF formats, and reconciling commitment / called / NAV / capital account components across them is the actual work. Plan more time for data wrangling than for code.
