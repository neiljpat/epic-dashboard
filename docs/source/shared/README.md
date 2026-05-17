# Shared documents

Everything in this folder is **safe to share with members** via Google Drive.

This folder structure mirrors the Drive folder layout. To bootstrap the Drive setup, drag this entire `shared/` folder into your Google Drive.

## What goes here

- ✅ Quarterly capital account statements (per fund)
- ✅ Distribution notices
- ✅ Capital call notices
- ✅ **Fund-level K-1s** (the K-1 the fund issues to EPIC LLC — single doc per fund per year)
- ✅ Annual reports / GP letters
- ✅ Schedule of investments / portfolio updates

## What does NOT go here

- ❌ El Pen LLC K-1s to individual members (PII — goes in `../admin-only/el-pen-llc/`)
- ❌ Personal investment docs (goes in `../admin-only/personal/<member>/`)
- ❌ Subscription agreements, side letters, wire info (goes in `../admin-only/`)

## Folder per fund

Folder names match the fund's display name (slug-cased). Inside each, organize by year.

```
shared/
├── tau-ventures-fund-i/
│   ├── 2020/
│   ├── 2021/
│   │   ├── 2021-K1-to-EPIC.pdf
│   │   └── 2021-Q1-capital-account.pdf
│   └── ...
├── tau-ventures-fund-ii/
├── tau-opportunity-fund/
├── nava-ventures/
├── fpv-fund-i/
├── betaworks-3.0/
├── cherish-health/
├── torramics/
└── zero-capital-fund-i/
```
