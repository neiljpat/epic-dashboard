# HANDOFF — EPIC Dashboard

**Written 2026-08-17.** Every figure below was measured from the live systems on that date, not recalled.

There is **no repo-level `CLAUDE.md`**. The hard-won constraints of this codebase are currently undocumented and live only in this file's "Working agreements" section and in people's heads. Writing a proper `CLAUDE.md` is worth doing; this document is not a substitute, because it carries *state* (which rots) rather than *constraints* (which persist).

---

## 1. The single most important fact

**You cannot rebuild this dashboard from the repo. The source is gitignored.**

The repo contains the *built, encrypted* `index.html`. It does not contain the two files that produce it:

| File | Size | Purpose | In git? |
|---|---|---|---|
| `build-encrypted.js` | 106 KB | **All portfolio data** — holdings, NAV history, capital calls, distributions, expenses, members, K-1 status | **NO — gitignored** |
| `template.html` | 208 KB | **All UI and application logic** — login, crypto, ledger, rendering | **NO — gitignored** |
| `.secrets.json` | 857 B | **The DEK and all five member passwords** | **NO — gitignored** |
| `index.html` | 1.1 MB | Encrypted build output | yes (tracked, deployed) |

Verified with `git check-ignore`, not by reading `.gitignore`.

Consequences a new agent must understand before touching anything:

- **A clone of this repo is read-only in practice.** You can serve it. You cannot change a number in it, because the plaintext is only in `build-encrypted.js` on Neil's Mac.
- **If that Mac is lost, the data is unrecoverable.** `.secrets.json` holds the only copy of the DEK. Without it, the committed `index.html` is undecryptable ciphertext. There is no escrow.
- The canonical working copy is `~/Documents/Claude/Projects/Personal Investment Dashboard/epic-dashboard` on Neil's machine.

Deployment state itself is **clean** — see §2. The gap here is source custody, not deploy drift.

---

## 2. What is actually deployed

Both surfaces are in sync. This was checked against the platforms, not a changelog.

| Surface | Running version | Verified how | Date |
|---|---|---|---|
| GitHub Pages | commit `3a169f6f`, build status `built` | `gh api .../pages/builds/latest` | 2026-08-17 21:06 UTC |
| Live HTML | **byte-identical** to local `index.html` (sha256 `817f32f3b67da63a…`) | fetched and hashed | 2026-08-17 |
| Cloudflare Worker | version `b8fc3f9d-fa31-40fa-a72e-8bb8068bf64f` | `wrangler deployments list` | 2026-05-25 22:40 UTC |
| Worker ↔ local source | all four post-May feature markers present in `worker/src/index.js` | grep + live behaviour | 2026-08-17 |

Worker health, live: unauthenticated `GET /settlements` → **401**; authenticated → **200**. All five member `kid` values in `worker-config.json` authenticate successfully against the live Worker (5/5 → HTTP 200). Worker secrets present: `ADMIN_TOKEN`, `MEMBER_KIDS`.

**The Worker has not been redeployed since 2026-05-25.** That is correct, not stale — no Worker source changes have been made since.

**The build is not reproducible.** `build-encrypted.js` generates a fresh random IV (line 1111) and fresh per-member salts (lines 1090, 1103) on every run. A no-op rebuild produces a byte-different `index.html` and will always dirty the tree. The DEK and passwords *are* reused from `.secrets.json`, so member logins survive rebuilds, and `kid = SHA-256(DEK ‖ email)` is DEK-derived — therefore **kids are stable across rebuilds** and the Worker's `MEMBER_KIDS` secret does not need reissuing after a normal data change. Delete `.secrets.json` only if you intend to rotate everything, which invalidates all passwords *and* the Worker secret.

---

## 3. Branch map

| Branch | Ahead of trunk | Head | Tree | Tests | Gate | Contents |
|---|---|---|---|---|---|---|
| `master` (trunk) | 0 / 0 vs `origin/master` | `3a169f6` | **dirty** (see below) | **0 — none exist** | n/a | everything |

There is **one branch**. No stacked branches. No other worktrees (`git worktree list` → single entry). Remote exists: `https://github.com/neiljpat/epic-dashboard`.

**There is no test suite at all.** No `package.json` at repo root, no test files, no CI. "Test count: 0" is literal. Every change this session was verified by hand — build, JS parse check, then live-site or curl verification. If you add automation, that is net-new.

**Uncommitted work:** 17 tracked scaffolding files (`.gitkeep` × 15, `docs/source/**/README.md` × 2) are **deleted in the working tree but not committed**. This predates this session. The directories still exist on disk because they hold gitignored PDFs (240 of them). Decide deliberately: commit the deletions, or `git restore` them. Do not let it linger as permanent noise in `git status`.

---

## 4. This repo is PUBLIC

Confirmed: `gh repo view --json visibility` → `"PUBLIC"`.

Audit of all tracked files:

| Check | Result |
|---|---|
| Private keys, API keys, tokens (`sk-…`, `AKIA…`, PEM blocks) | **none found** |
| SSNs (`###-##-####`) | **none found** |
| Portfolio figures in plaintext (spot-checked 1064300, 349053, 108000, 1195900, 413748) | **none — all encrypted** |
| Member email addresses | **present in 3 tracked files** |

The encryption is doing its job. The one real exposure is **identifiers, not credentials**: all five members' personal Gmail addresses appear in `index.html`, `worker/src/index.js` (as `ALLOWED_EMAILS` / `MANAGING_MEMBER_EMAIL`), and `docs/DRIVE-SETUP.md`.

In `index.html` this is **architecturally unavoidable** — login maps email → wrapped-DEK entry client-side, so the address list must ship to the browser. In the Worker source and the docs it is a choice. Five people's personal email addresses on a public GitHub repo is an owner decision, not an agent decision (§5).

---

## 5. Decisions waiting on the owner

| Decision | Depends on | If deferred |
|---|---|---|
| **Tau Ventures Fund II — was the $43,200 wired?** Dashboard shows `status: "Pending"`, `dueDate: 2026-07-24`. That is **24 days past due** as of 2026-08-17. | Only Neil knows whether the wire went out. | Dashboard misstates called-ITD and unfunded commitment for Tau II, and the members' capital-call email trail is the only record. |
| **NY $1,000 penalty — send the abatement request?** Assessment `L-064035112-8`, tax period 12/31/2025, **$0 tax, $1,000 pure late-filing penalty**. A short request is drafted (in conversation, not in this repo) but **not sent**. | Jon Van Wormer (Liberty Tax) to file it. | Statutory reply deadline to preserve appeal rights is **2026-10-21**. Pay-by date was 2026-08-13 — already passed; interest accrues at roughly $17/month. |
| **2024 return carries the same Schedule L defect that was fixed for 2025.** Verified directly from the 2024 PDF: Form 1065 item F "Total assets" blank, Schedules L/M-1/M-2 present but empty, K-1 Item L capital accounts blank on all five partners. The 2025 return's own Schedule L puts 12/31/2024 assets at **$1,085,618** — over the $1M threshold, so the small-partnership exception likely did not apply in 2024 either. | Owner + accountant: amend 2024, or accept the risk. | An unamended year sits with an incorrect Schedule B Q4 answer and blank partner capital accounts. |
| **Member emails in a public repo** (§4). | Owner's tolerance. Removing from `worker/src/index.js` and `docs/DRIVE-SETUP.md` is feasible; removing from `index.html` is not without re-architecting login. | Status quo persists. |
| **Sign Form 8879-PE for the 2025 return.** | Jon must first resend member K-1 packages — the standalone copies he sent had **blank Item L capital accounts** (they were the pre-revision versions). | 2025 return remains unfiled. Federal due date under extension was 2026-09-15. |

---

## 6. Known defects and gaps

**Ledger nets to zero by cancellation, not by clean bookkeeping.** Computed from live data on 2026-08-17: all four non-managing members sit at exactly **$0.00** (within the $1.00 tolerance). But that balance is produced by `$1,286.91` of expenses still flagged `settledOn: null` and `$3,814.00` of distributions still flagged undisbursed, offset by four confirmed live Worker settlements:

| From → To | Amount | Confirmed |
|---|---|---|
| Neil → Daniel Peterson | $802.06 | 2026-05-26 |
| Brian Peterson → Neil | $151.44 | 2026-05-27 |
| Neil → Nathan Stoll | $802.06 | 2026-05-30 |
| Neil → Saurabh Sharma | $272.34 | 2026-05-30 |

The arithmetic is right today. It is fragile: the source items should be marked `settledOn` / `disbursedOn` in `build-encrypted.js` so the balance is zero because nothing is outstanding, rather than zero because two non-zero quantities happen to cancel.

**Betaworks Q2 2026 NAV is an estimate, and is labelled as one.** `nav.value = 86038`, `source: "Pro-rata of Q2 2026 fund-level statement (EPIC cap account pending)"`. Derived from LP-class capital of $31.0M at the 180k/64.88M commitment share. No EPIC-specific capital statement has arrived. Replace when it does. (The identical situation for Nava in Q1 resolved with the estimate landing **exactly** on the reported figure, which is encouraging but not evidence.)

**Two members have no live payment record.** Live `GET /payments` returns entries for Neil, Dan, and Saurabh only. **Nathan and Brian fall through to the encrypted seed defaults** in `build-encrypted.js` — Nathan's seeded Zelle is a phone number (`6507763641`), Brian's is his email. Those seeds have never been confirmed by the members themselves.

**Brian's standalone 2025 K-1 could not be redacted.** Jon supplied it as a pure scan — 19 image-only pages, no text layer. OCR at 400 dpi reads the partnership EIN but **cannot resolve the SSN**, so its location can't be established reliably and no verified redaction is possible. His SSN *is* correctly redacted inside the full return. Do not ship that standalone file as "redacted".

**Redacted returns live outside the repo** at `~/Downloads/EPIC Partnership Returns (REDACTED)/` (2024, 153 pp; 2025, 196 pp). Verified clean across visible text, all extraction modes, digit-normalised discovery scan, every decompressed stream object, raw bytes, metadata, annotations, form fields, 149 decoded barcodes, and OCR of the 12 image-only pages. They are **not** in git and must never be — see §4.

---

## 7. What is unverified

Treat everything in this section as a claim, not a fact.

- **Betaworks NAV $86,038** — pro-rata estimate. Not from an EPIC statement.
- **Whether the 2025 NY IT-204 was ever e-filed.** The penalty is exactly 5 partners × $50 × 4 months, which is consistent with a filing around mid-July 2026 — but that is inference from the amount, not confirmation. If it is still unfiled the penalty is still accruing to a $1,250 cap.
- **Whether NY was required for 2024.** The 2024 package contains **no NY forms at all** (CA and IL only, confirmed by scanning all 153 pages). If Dan was already a NY resident in 2024, an obligation may have existed and gone unmet. Nobody has checked when Dan's NY residency began.
- **The Betaworks wire memo-field instruction is mine, not theirs.** The capital-call PDF says only "Wire instructions available in FundPanel". The FundPanel screen shows no reference/memo field. Instructing members to put "El Pen Investment Company LLC" in the memo is my inference from how the Tau II notice worked. It is sensible — five individual wires must reconcile to one LP commitment — but it is unconfirmed with Betaworks.
- **Payment status of three pending calls**: Tau II $43,200 (due 2026-07-24), and Ensemble VC II $4,738.15 each for Neil and Dan (due 2026-05-28, personal holdings, ~2.5 months past due).
- **Q2 2026 statements not yet received** for Tau I, Tau II, Tau Opportunity, Nava, Torramics, and Zero Capital. Their NAVs are as of 2025-12-31 or earlier and are therefore stale by two quarters.
- **Betaworks has EPIC's legal name wrong** — "El Pen Investment **Corporation** LLC" on both the capital call and the 2025 K-1. Correct name is "El Pen Investment **Company** LLC". Not corrected with them.

---

## 8. What I got wrong this session

Read this section. The traps are re-enterable.

**I destroyed a member's live data by using his production record as a test fixture.** While testing the secondary-payment-method feature I issued `PUT /payments/dlpeters@gmail.com` with throwaway values and then `DELETE`d it as cleanup. Dan had saved real Zelle and Venmo details shortly before. He noticed and re-entered them (live record now shows `updatedAt: 2026-05-26T02:27:56Z`, Zelle `415-866-9264`, Venmo `@Conviction-Dan`), so the damage is repaired — but I caused it and did not detect it. **Never use a real identifier as a test fixture against production KV.** Use a synthetic key.

**I chased UI ghosts for four rounds because a broken API returned success.** The client sent `PUT /payments` as `{payments: {...}, kid}` while the Worker destructured the fields flat off the body. Because `kid` sat at the top level in both shapes, **auth passed and the endpoint returned `{"ok":true}` while storing all-null fields.** Every layer looked healthy. I blamed form re-rendering, then Cloudflare KV eventual consistency, then DOM rebuild races, and shipped three unnecessary "fixes" before finally curling the endpoint directly and seeing the nulls. **When a write reports success but the data round-trips wrong, curl the API before touching the UI.**

**The same class of bug was sitting in `POST /settlements`** — client sending `from`/`to` display names against a Worker expecting `fromEmail`/`fromName`/`toEmail`/`toName`. It would have failed on the first real member use. I found it only because I went looking after the first one. One contract mismatch means you check every contract.

**I forwarded a field into a translation layer and dropped it.** `workerPostSettlement` rebuilt the request body explicitly and silently omitted `status`, so "Mark as paid" created `pending` rows instead of `confirmed` ones. Neil caught it: *"I marked brian to neil as paid, but I don't think anything happened."*

**I shipped a confirmation flow with no idempotency.** Three confirmed $151.44 rows for the same payment drove Brian's balance to **−$302.91**, inverting who owed whom. Neil caught it. `_findMatchingLiveSettlement` (±2¢ tolerance) now gates all three entry points.

**My first redaction pass would have leaked SSNs.** I matched only `###-##-####`. That missed **bare nine-digit** SSNs on the CA 568 forms, **space-separated** ones on the NY IT-204-IP forms, and — most seriously — **PDF417 barcodes on every NY partner form encoding the SSN in plaintext**, which no amount of black-boxing the visible field would touch. Only byte-level and barcode-decode verification caught them. **Verify redaction by discovery — strip non-digits and hunt for any nine-digit run — never by searching for needles you already know.**

**Then I over-corrected and destroyed data I meant to keep**, blacking out partner names on the K-K1 Comparison Worksheet because the masked SSN and the name occupied the same column. Rebuilt with word-level targeting.

**I updated an aggregate and forgot its line-item array.** Adding the Tau II capital call, I bumped `HOLDINGS.tau2.called[2026]` but not the `CALLS` array, so the call never appeared in the Activity table. Neil caught it: *"Did you add this capital call to the dashboard?"* **Capital calls and settlements must be written in two places.**

---

## 9. Outstanding manual actions (human only)

1. **Confirm whether the Tau II $43,200 was wired** and flip `status` to `"Paid"` in `build-encrypted.js`, or chase it. 24 days past due.
2. **Send the NY penalty abatement request to Jon.** Hard deadline **2026-10-21**.
3. **Get refreshed member K-1 packages from Jon** (blank Item L on the ones already received), then sign Form 8879-PE.
4. **Send the Betaworks capital-call email** to the four members — $18,000 due 2026-08-31, split $5,000 / $5,000 / $2,500 / $500 plus Neil's own $5,000. Draft exists in conversation. Wire details come from FundPanel and are deliberately absent from the notice PDF.
5. **Confirm with Betaworks** (a) whether a wire memo reference is required, and (b) correct the legal name from "Corporation" to "Company".
6. **Back up `.secrets.json`, `template.html`, and `build-encrypted.js` off this Mac.** This is the highest-value item on the list. Losing `.secrets.json` makes the deployed dashboard permanently undecryptable.
7. **Decide the public-repo email question** (§4).
8. Tell members that if anyone receives an email "correcting" the Betaworks wire details, treat it as fraudulent and phone Neil. Capital-call wire fraud is the standard attack and the fund deliberately keeps banking details behind FundPanel.

---

## 10. Working agreements that produced good results

Each of these is here because it was earned in this repo, not because it is good general advice.

- **Curl the API before debugging the UI.** Cost of ignoring it: four rounds and three pointless commits on the `/payments` bug.
- **Verify by discovery, not by needle.** Applies beyond redaction — ask "what does this file actually contain" before "does it contain X". Cost of ignoring it: three separate SSN leak classes survived a redaction that looked complete.
- **Build → parse-check → verify live, every time.** The pattern used all session: `node build-encrypted.js`, then extract the inline `<script>` and run it through `new Function()` to catch syntax errors, then confirm against the deployed URL. There are no tests; this is the entire safety net.
- **Data changes touch two places.** A capital call or settlement goes in both the holding's aggregate and the corresponding `CALLS` / `SETTLEMENTS` array.
- **Never test against production identifiers.**
- **Run `date` before anything date-sensitive.** This repo is full of real deadlines and several were near or past when assumed otherwise.
- **The Ledger tracks money owed *between members* only.** Capital calls are informational — members wire funds directly to the funds. Owner was explicit about this; do not fold capital calls into ledger balances.
