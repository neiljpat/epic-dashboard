# CLAUDE.md — EPIC Dashboard

Constraints for working in this repo. This file holds things that stay true.
Anything that rots — balances, deadlines, what is deployed today — belongs in
`HANDOFF.md` or in the output of `node preflight.js`, never here.

**Before you change anything: `node preflight.js`. Before you push: `node preflight.js --build`.**
There is no test suite and no CI. That script is the entire safety net.

---

## What this is

A single-page encrypted dashboard for a five-member private investment club,
served from GitHub Pages, with a Cloudflare Worker (`epic-dek-store`) holding
the mutable slice: per-member key records, inter-member settlements, and member
payment preferences.

Members log in with an email and password in the browser. The password unwraps a
per-member copy of a shared data-encryption key (DEK); the DEK decrypts one blob
containing the whole portfolio. Nothing is decrypted server-side, and there is no
server beyond the Worker.

---

## 1. Source custody — the thing that will actually hurt you

**The repo cannot rebuild itself.** Three files produce the deployed artifact and
none of them are tracked:

| File | Holds | Tracked |
|---|---|---|
| `build-encrypted.js` | every portfolio figure, member, call, distribution, expense | no |
| `template.html` | all UI and application logic | no |
| `.secrets.json` | the DEK and all five member passwords | no |
| `index.html` | the encrypted build output | **yes, deployed** |

Consequences:

- A clone of this repo is **read-only in practice**. You cannot change a number
  in it. The plaintext exists only on the owner's Mac.
- **If `.secrets.json` is lost, the deployed dashboard is permanently
  undecryptable.** There is no escrow and no recovery path. Backing it up
  off-machine is the single highest-value maintenance act in this project.
  `preflight.js` will keep warning until `EPIC_BACKUP_DIR` points at a current
  off-machine copy.
- `build-encrypted.js` **prints all five member passwords to stdout on every
  run.** Never run it with output going anywhere persistent, shared, or logged.
  `preflight.js --build` suppresses its stdout deliberately — do the same.

## 2. This repo is PUBLIC

Everything tracked is world-readable, permanently, including through git history
and GitHub's blob cache after deletion.

**Nothing tracked may contain a portfolio figure, a member payment identifier, a
phone number, an SSN, or a tax identifier.** Encryption protects `index.html`;
it does nothing for a Markdown file sitting next to it. This has been violated by
documentation written *inside this repo* — including by the very document that
audited for it — so treat it as an active hazard, not a solved problem.

`preflight.js` enforces this by **discovery, not by needle**: it reads the real
identifiers and figures out of the plaintext source at runtime and hunts for them
in tracked files. Never replace that with a list of known-bad strings. The one
audit that used a fixed needle list reported "none found" while four real figures
sat in a tracked doc.

Member email addresses are a known, accepted exception in `index.html` — login
maps email to a wrapped-DEK entry client-side, so the list must ship to the
browser. Their presence in `worker/src/index.js` and `docs/DRIVE-SETUP.md` is a
choice, not a necessity, and is the owner's call.

Source documents (PDFs, statements, K-1s, returns) are **never** tracked. They
live under `docs/source/` on disk, gitignored by extension, and reach members
through Google Drive. Redacted tax returns live outside the repo entirely.

## 3. Build, verify, deploy

```
node preflight.js --build      # rebuild, parse-check, verify deploy + worker
git add index.html && git commit && git push      # Pages deploys from master
```

- **Builds are never byte-reproducible.** Every run draws a fresh random IV for
  the data blob and for each member's wrapped DEK, so a no-op rebuild still
  produces a different `index.html` and dirties the tree. The *salts* and
  passwords are persisted in `.secrets.json` and reused — it is the IVs that
  vary. Do not go looking for a bug in this.
- **`kid = base64(SHA-256(DEK ‖ email))` is DEK-derived, so kids are stable
  across rebuilds.** A normal data change does not require reissuing the
  Worker's `MEMBER_KIDS` secret.
- **`--rotate` (or a missing `.secrets.json`) regenerates the DEK and every
  password.** That invalidates all five members' logins *and* changes every kid,
  which means `MEMBER_KIDS` must be re-put to the Worker or the ledger silently
  stops authenticating. Only rotate deliberately.
- The parse-check exists because a syntax error in the generated inline script
  reaches five members' browsers as a blank page with no other warning.
- The Worker deploys separately (`cd worker && npx wrangler deploy`). It lags the
  Pages deploy by design — it only changes when `worker/src/index.js` changes.

## 4. Data invariants

**A capital call or settlement must be written in two places**: the holding's
`called` aggregate *and* the `CALLS` array. Updating only the aggregate produces
correct totals with the event missing from the Activity table — a failure mode
that looks like nothing is wrong. `preflight.js` checks this for recent years.

The `CALLS` array is a **partial** log for older years by design; some holdings
have no rows at all for their early calls. So the aggregate is authoritative for
totals, and `CALLS` is authoritative for what members can *see*. When they
disagree for a recent year, that is a defect.

**The Ledger tracks money owed between members only.** Capital calls are
informational — members wire funds directly to the funds, never through the
managing member. Do not fold capital calls into ledger balances. The owner has
been explicit about this.

`MEMBERS[].share` must sum to 1.0. Expense allocation `"equal"` means 1/N, not
pro-rata by share; `"pro-rata"` means by share.

## 5. The Worker contract

Auth is the `X-Member-Kid` **header**, compared in constant time against the
`MEMBER_KIDS` secret. Not a query parameter, not a bearer token.

**Curl the API before you touch the UI.** A client/worker shape mismatch once
made `PUT /payments` return `{"ok":true}` while storing all-null fields — auth
passed because `kid` happened to sit at the top level in both shapes, so every
layer looked healthy. Three unnecessary "fixes" shipped before anyone curled the
endpoint. When a write reports success but the data round-trips wrong, the
contract is the suspect, not the DOM.

**One contract mismatch means audit every contract.** The same bug class was
sitting unexercised in `POST /settlements` at the same time.

**Never use a real member identifier as a test fixture.** Testing against a
production email once destroyed a member's live payment record. Use a synthetic
key.

**Settlement writes must be idempotent.** Confirming the same payment three times
once inverted a member's balance. `_findMatchingLiveSettlement` gates all three
entry points; keep it that way.

Translation layers between client and worker shapes are where fields go to die —
one silently dropped `status` turned "mark as paid" into "create a pending row".
When you rebuild a request body explicitly, enumerate what you dropped.

## 6. Redaction, if you ever handle returns again

**Verify by discovery, never by needle.** Strip non-digits and hunt for any
nine-digit run. A pass that matched only `###-##-####` missed bare nine-digit
SSNs, space-separated ones, and — worst — PDF417 barcodes on every partner form
encoding the SSN in plaintext, which blacking out the visible field would never
have touched.

Then check you did not over-redact: destroying a partner name because it shares a
table column with a masked SSN is the other failure.

Never ship a scanned, image-only document as "redacted" when OCR cannot resolve
what you were redacting.

## 7. Habits

- **Run `date` before anything date-sensitive.** This repo is full of real
  deadlines and several have been assumed wrong.
- Deal in what you measured from the live systems, not what a document says was
  true. `HANDOFF.md` carries state and rots; `preflight.js` re-measures.
- Financial figures are the product. A cosmetic bug is an annoyance; a wrong
  number is the whole failure mode. Verify arithmetic against source statements,
  and label estimates as estimates in the `source` field.
