# ERD — Private Investment Club Dashboard

Logical data model. The reference implementation stores all of this as a single JSON object encrypted with AES-256-GCM, but the same model maps cleanly to any relational, document, or graph database.

---

## Diagram

```
                        ┌──────────────────┐
                        │     Member       │
                        ├──────────────────┤
                        │ email (PK)       │
                        │ name             │
                        │ share %          │◄────────┐
                        │ role (admin/mbr) │         │
                        └──────────────────┘         │
                                                     │ member-share
                                                     │ scaling
                                                     │
              ┌──────────────────┐                   │
              │ HoldingVisibility│◄─────────┐        │
              ├──────────────────┤          │        │
              │ holding_id  (FK) │          │        │
              │ member_email(FK) │          │ many   │
              └──────────────────┘          │ ────── │
                       ▲                    │        │
                       │ many               │        │
                       │                    │        │
                       │ 1                  │        │
                ┌──────┴───────────┐        │        │
                │     Holding      │────────┘        │
                ├──────────────────┤                 │
                │ id (PK)          │                 │
                │ name             │                 │
                │ type (Fund/      │                 │
                │       Direct)    │                 │
                │ bucket (club/    │                 │
                │       personal)  │                 │
                │ commitment       │                 │
                │ nav_value        │                 │
                │ nav_as_of        │                 │
                │ nav_source       │                 │
                │ notes            │                 │
                └────┬─────────────┘                 │
                     │                               │
        ┌────────────┼────────────┬─────────────┐    │
        │            │            │             │    │
        │ 1:M        │ 1:M        │ 1:M         │ 1:M│
        ▼            ▼            ▼             ▼    │
   ┌────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
   │ Call   │  │ Distrib  │  │ NavHist  │  │ Underlying │
   ├────────┤  ├──────────┤  ├──────────┤  │  Company   │
   │ id     │  │ id       │  │ holding  │  ├────────────┤
   │ holding│  │ holding  │  │  _id (FK)│  │ id (PK)    │
   │  _id   │  │  _id (FK)│  │ date     │  │ holding_id │
   │ date   │  │ date     │  │ nav      │  │ name       │
   │ amount │  │ amount   │  │ contrib  │  │ industry   │
   │ status │  │ note     │  │  _itd    │  │ cost       │
   │ visible│  │ visible  │  │ dist_itd │  │ fair_value │
   │  _to   │  │  _to     │  └──────────┘  └────────────┘
   └────────┘  └──────────┘
                                ┌──────────────────┐
                                │ CapAccount       │
                                │  (ITD walk-      │
                                │   forward)       │
                                ├──────────────────┤
                                │ holding_id (FK)  │
                                │ as_of            │
                                │ contributions    │
                                │ distributions    │
                                │ mgmt_fees        │
                                │ syndic_costs     │
                                │ op_income        │
                                │ realized_gain    │
                                │ unrealized_gain  │
                                │ carried_interest │
                                │ ending           │
                                │ note             │
                                └──────────────────┘

                                ┌──────────────────┐
                                │   K1Status       │
                                ├──────────────────┤
                                │ holding_id (FK)  │
                                │ tax_year         │
                                │ status (received │
                                │   / pending /    │
                                │   not_yet_due /  │
                                │   na)            │
                                └──────────────────┘

                                ┌──────────────────┐
                                │  DocumentFolder  │
                                ├──────────────────┤
                                │ holding_id (PK)  │
                                │ drive_folder_url │
                                │ ─────            │
                                │ Plus a special   │
                                │ "_root" entry    │
                                │ for the top-     │
                                │ level Drive      │
                                │ folder.          │
                                └──────────────────┘
                                         │ 1:N
                                         ▼
                                ┌──────────────────┐
                                │  DocumentFile    │
                                ├──────────────────┤
                                │ id (PK,          │
                                │   Drive file ID) │
                                │ holding_id (FK)  │
                                │ name             │
                                │ date             │
                                │ type (Capital    │
                                │   account/Fin.   │
                                │   stmts/K-1/     │
                                │   Capital call/  │
                                │   Distribution/  │
                                │   GP letter/     │
                                │   Portfolio/     │
                                │   Marketing/...) │
                                └──────────────────┘
```

---

## Entity definitions

### Member
The natural person who has login access.

| Field | Type | Notes |
|---|---|---|
| email | string (PK) | Login identifier, lowercase normalized |
| name | string | Display name ("Daniel Peterson") |
| share | decimal | Pro-rata ownership of club-level holdings (0.0–1.0). Sum across all members ≈ 1.0 |
| role | enum | `admin` / `member` / `guest` |
| password_hash | bytes | Per-member salt + PBKDF2-derived key (in this design, this is the wrapped DEK rather than a hash) |
| guest_passwords | string[] | Optional list of alternate read-only passwords this member can give out |

### Holding
A single investment position — either an LP commitment to a fund or a direct investment.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | Stable slug ("tau1", "betaworks", "ensemble_dan") |
| name | string | Display name ("Tau Ventures Fund I") |
| type | enum | `Fund` / `Direct (Preferred)` / `Direct (Common)` / `SAFE` / `Convertible` |
| bucket | enum | `club` (formerly "epic") / `personal` |
| commitment | decimal | Total dollar commitment |
| nav_value | decimal | Current NAV (fair value) |
| nav_as_of | date | NAV reporting date |
| nav_source | string | "GP Q4 2025 capital account" |
| notes | text | Free-form context, displayed in modal |

**Derived fields (computed at render time, not stored):**
- `called` = SUM(Call.amount WHERE holding_id = h.id)
- `distributed` = SUM(Distribution.amount WHERE holding_id = h.id)
- `unfunded` = commitment - called
- `pct_called` = called / commitment
- `total_value` = nav_value + distributed
- `tvpi` = total_value / called
- `dpi` = distributed / called
- `irr` = NPV-zero rate from cashflows [−called@dates, +distributed@dates, +nav@as_of]

### HoldingVisibility (junction table)
Implements the `visibleTo` permissioning. Many-to-many between Holding and Member.

| Field | Type | Notes |
|---|---|---|
| holding_id | string (FK) | |
| member_email | string (FK) | NULL or "*" indicates "all members" |

Alternative: store `visible_to` as a JSONB/array field directly on `Holding` if simpler. The reference implementation does this (`visibleTo: "all"` or `["email", ...]`).

### Call
A capital call event for a holding.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | |
| holding_id | string (FK) | |
| date | date | When the call was made |
| amount | decimal | Total fund-level call amount (not member-share) |
| status | enum | `Paid` / `Pending` / `Upcoming` |
| visible_to | string[] | Per-call visibility (inherits from holding by default) |

### Distribution
A distribution event for a holding.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | |
| holding_id | string (FK) | |
| date | date | |
| amount | decimal | Total fund-level distribution |
| note | text | "Sale of investments; pro rata to all 5 members" |
| visible_to | string[] | |

### NavHistory
Time-series of NAV reports for charting.

| Field | Type | Notes |
|---|---|---|
| holding_id | string (FK) | |
| date | date | |
| nav | decimal | |
| contrib_itd | decimal | Contributions inception-to-date as of this date |
| dist_itd | decimal | Distributions inception-to-date as of this date |

Indexed by (holding_id, date).

### UnderlyingCompany
The schedule-of-investments rows. Each row is one company in one fund's portfolio at a snapshot in time.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | |
| holding_id | string (FK) | The fund that holds this company |
| name | string | "Iterative Health" |
| industry | string | Free-form ("Healthcare AI") — normalized at render time |
| cost | decimal | Fund-level cost basis |
| fair_value | decimal | Fund-level current FV |
| as_of | date | Optional snapshot date |
| round | string | Optional — "Series B", "SAFE", etc. |

**Used for**: sector look-through, top company exposure, fund detail modal schedule-of-investments table.

### CapAccount (ITD walkforward)
Inception-to-date capital account components for a holding. One row per holding (or per (holding, as_of) for historical snapshots).

| Field | Type | Notes |
|---|---|---|
| holding_id | string (FK) | |
| as_of | date | |
| contributions | decimal | Positive |
| distributions | decimal | Stored negative (subtraction) |
| syndication_costs | decimal | Negative |
| mgmt_fees | decimal | Negative |
| interest_income | decimal | |
| op_income | decimal | |
| realized_gain | decimal | |
| unrealized_gain | decimal | |
| carried_interest | decimal | Negative (accrued carry) |
| ending | decimal | Should reconcile to nav_value at as_of |
| note | text | Reconciliation caveats |

### K1Status
Tax document tracking. One row per (holding, tax_year).

| Field | Type | Notes |
|---|---|---|
| holding_id | string (FK) | |
| tax_year | int | |
| status | enum | `received` / `pending` / `not_yet_due` / `na` |

`na` for direct holdings that don't issue K-1s (SAFEs, common stock).

### DocumentFolder
Per-holding Google Drive folder URL for the documents section in the fund modal. One special row keyed `_root` for the parent folder shown in the dashboard footer.

| Field | Type | Notes |
|---|---|---|
| holding_id | string (PK) | Holding's `id`, or the literal `_root` for the top-level folder |
| drive_folder_url | string | `https://drive.google.com/drive/folders/<id>` |

### DocumentFile
A specific file inside a holding's Drive folder. Materialized at build time by enumerating Drive; baked into the encrypted blob. The dashboard renders these grouped by `type`.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | Google Drive file ID |
| holding_id | string (FK) | |
| name | string | Display label (e.g. "Q4 2025 capital account"). Type-prefix is stripped when rendered inside its category section. |
| date | date | YYYY-MM-DD. Quarterly docs use the end-of-quarter date; K-1s and audited stmts use Dec 31; capital calls use the actual due date. Empty for undated reference / marketing materials. |
| type | enum | `Capital account` / `Financial statements` / `Audited fin stmts` / `Schedule` / `K-1` / `Tax estimates` / `Capital call` / `Distribution` / `GP letter` / `Portfolio` / `Marketing` / `Press` / `Reference`. Drives both category grouping and badge display. |

**Used for**: rendering the categorized file list in the fund detail modal's Documents section with direct-download links (`drive.google.com/uc?export=download&id=<id>`).

---

## Cardinality summary

- **Member 1 — N HoldingVisibility N — 1 Holding** (many-to-many via visibility join; a personal holding is visible only to its owning member, club holdings visible to all)
- **Holding 1 — N Call**
- **Holding 1 — N Distribution**
- **Holding 1 — N NavHistory**
- **Holding 1 — N UnderlyingCompany**
- **Holding 1 — 1 CapAccount** (most recent only) / **Holding 1 — N CapAccount** (if storing snapshots)
- **Holding 1 — N K1Status** (one per tax year)
- **Holding 1 — 1 DocumentFolder** (zero or one Drive folder URL per holding; plus a single `_root` entry)
- **Holding 1 — N DocumentFile** (zero or more files per fund's Drive folder)

---

## Reference implementation notes

The reference dashboard stores all of this as a single nested JS object (later JSON-serialized and encrypted):

```js
const DATA = {
  MEMBERS: [ { name, share } ],          // implicit; emails in MEMBERS_AUTH map
  YEARS:   [ 2018, ..., 2026 ],          // for chart axes
  HOLDINGS: [
    {
      id, name, type, bucket, visibleTo,
      commitment,
      called:      { 2024: 45000, 2025: 27000, ... },   // by-year buckets
      distributed: { 2025: 5714.04, 2026: 1613.00 },
      nav: { value, asOf, source },
      notes,
    },
    ...
  ],
  CALLS:         [ { date, fund, holdingId, amount, status, visibleTo } ],
  DISTRIBUTIONS: [ { date, fund, holdingId, amount, note, visibleTo } ],
  NAV_HISTORY: {
    tau1: [ { date, nav, contrib_itd, dist_itd }, ... ],
    ...
  },
  PORTFOLIO_COMPANIES: {
    tau1: [ { co, cost, fv, industry }, ... ],
    ...
  },
  CAP_ACCOUNT_ITD: {
    tau1: { asOf, contributions, distributions, mgmtFees, ..., ending },
    ...
  },
  K1_STATUS: {
    tau1: { 2020: "received", 2021: "received", ..., 2025: "pending" },
    ...
  },
  DOCUMENTS: {
    _root:     "https://drive.google.com/drive/folders/...",  // shared root
    tau1:      "https://drive.google.com/drive/folders/...",
    tau2:      "https://drive.google.com/drive/folders/...",
    // ... per-fund folder URLs ...
  },
  DOCUMENT_FILES: {
    tau1: [
      { name: "Q4 2025 capital account", id: "<drive-file-id>", date: "2025-12-31", type: "Capital account" },
      { name: "2025 K-1 to EPIC",        id: "<drive-file-id>", date: "2025-12-31", type: "K-1" },
      // ... grouped by type in the UI ...
    ],
    ...
  },
};
```

This denormalization is intentional:
- The full data graph is ~50KB encrypted → fast to load and decrypt
- Render functions filter/aggregate in-memory in <50ms
- No JOIN logic needed
- Easy to diff in git when data updates

For a SQL implementation, the table structure above is straight-forward — denormalize for read perf where helpful.

---

## Migration paths

If you're starting from spreadsheets:
1. **Members tab** → `Member` rows
2. **Holdings/Commitments tab** → `Holding` rows
3. **Capital calls tab** → `Call` rows (one per capital call event)
4. **Distributions tab** → `Distribution` rows
5. **Quarterly statements** → `NavHistory` rows
6. **Portfolio company schedules** (from GP statements) → `UnderlyingCompany` rows
7. **Capital account statements** → `CapAccount` rows
8. **Tax records** → `K1Status` rows

The minimum viable model is just **Member**, **Holding**, **Call**, **Distribution**. NavHistory, UnderlyingCompany, CapAccount, K1Status can be added incrementally as the corresponding UI features are built.
