# Source documents

This folder holds source documents (PDFs, statements, K-1s, etc.) on the admin's laptop. **PDFs in this folder are NOT tracked in git** — see `.gitignore`. Distribution to members happens via Google Drive, never via this public repo.

## Structure

```
docs/source/
├── shared/         ← mirrors the Drive folder; member-accessible
│   ├── tau-ventures-fund-i/<year>/...
│   ├── betaworks-3.0/<year>/...
│   └── ... (one folder per fund)
└── admin-only/     ← NEVER share, NEVER upload to Drive
    ├── el-pen-llc/                 — operating agreement, member K-1s, etc.
    ├── personal/<member>/          — personal investment docs
    ├── subscription-agreements/    — LP sub docs
    ├── side-letters/               — LP side letters
    └── wire-confirmations/         — banking info
```

## Workflow

When a new statement / K-1 / distribution notice arrives:

1. **Fund-level docs** (capital account statements, distribution notices, capital call notices, fund-level K-1s, GP letters) → drop in the matching `shared/<fund>/<year>/` folder, then upload to the same path in Google Drive.

2. **PII / per-member docs** (El Pen LLC K-1s to individual members, sub docs, operating agreement, wire info) → drop in `admin-only/` only. Never share.

3. **Personal investment docs** (e.g. Neil's Cherish Health SAFE, Dan's Ensemble VC II docs) → `admin-only/personal/<member>/`. These belong to the owning member, not the club.

## Why nothing here is in git

The repo is public (GitHub Pages requirement). Even fund-level documents that are technically already in the encrypted dashboard data should not be sitting in clear text in a public repo. The dashboard is the canonical "encrypted view" of the data; Drive is the canonical "documents view"; this local folder is the admin's working copy that bridges the two.

## Bootstrapping

If you're setting this up fresh, drop your existing PDFs into the matching subfolders. The folder structure mirrors what Google Drive should look like — drag the entire `shared/` folder into Drive and you're done.
