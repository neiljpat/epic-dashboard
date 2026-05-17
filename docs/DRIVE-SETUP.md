# Google Drive setup for member-accessible fund documents

This dashboard uses Google Drive as the source of truth for fund documents members can download. The dashboard links to per-fund Drive folders from the fund detail modal.

## What goes in Drive

**Include** — fund-level documents EPIC receives as the LP:
- Quarterly capital account statements
- Distribution notices
- Capital call notices
- Fund-level K-1s (the K-1 the fund issues to EPIC LLC as a partner)
- Annual reports / GP letters
- Schedule of investments / portfolio updates

**Exclude** — PII or per-member documents:
- El Pen LLC K-1s to individual members (SSN, addresses, personal allocations)
- El Pen LLC operating agreement (member ownership percentages)
- Subscription agreements / Side letters
- Wire confirmations or banking info
- Personal investments (Neil's personal Cherish SAFE, Dan's personal Ensemble — these belong to the owning member, not the club)

## Setup steps

1. **Create the top-level folder** in your Google Drive:
   ```
   EPIC Investment Documents/
   ```

2. **Create per-fund subfolders** matching the holding IDs in `build-encrypted.js`:
   ```
   EPIC Investment Documents/
   ├── Tau Ventures Fund I/
   ├── Tau Ventures Fund II/
   ├── Tau Opportunity Fund/
   ├── Nava Ventures/
   ├── FPV Fund I/
   ├── Betaworks Ventures 3.0/
   ├── Cherish Health/
   ├── Torramics/
   └── Zero Capital Fund I/
   ```

3. **Inside each fund folder**, organize by year (optional but recommended):
   ```
   Tau Ventures Fund I/
   ├── 2020/
   ├── 2021/
   │   ├── 2021-K1-to-EPIC.pdf
   │   ├── 2021-Q1-capital-account.pdf
   │   ├── 2021-Q2-capital-account.pdf
   │   └── ...
   ├── 2025/
   │   ├── 2025-K1-to-EPIC.pdf
   │   └── 2025-Q4-capital-account.pdf
   └── 2026/
       ├── 2026-Q1-capital-account.pdf
       └── 2026-05-14-distribution-notice.pdf
   ```

4. **Share the top-level folder** with member emails as **Viewer** (not Editor):
   - neilpatel83@gmail.com
   - dlpeters@gmail.com
   - nathan@nathanstoll.com
   - saurabhnsharma@gmail.com
   - brian.j.peterson@gmail.com

   Members will inherit Viewer access to all subfolders. They can view and download but not edit/delete.

5. **Get the folder URLs** — right-click each fund folder → "Get link" → copy the URL. Format will be:
   ```
   https://drive.google.com/drive/folders/1abc...XYZ
   ```

6. **Update `build-encrypted.js`** — fill in the `DATA.DOCUMENTS` map with the URLs:
   ```js
   DOCUMENTS: {
     tau1:      "https://drive.google.com/drive/folders/...",
     tau2:      "https://drive.google.com/drive/folders/...",
     tauopp:    "https://drive.google.com/drive/folders/...",
     nava:      "https://drive.google.com/drive/folders/...",
     fpv:       "https://drive.google.com/drive/folders/...",
     betaworks: "https://drive.google.com/drive/folders/...",
     cherish:   "https://drive.google.com/drive/folders/...",
     torramics: "https://drive.google.com/drive/folders/...",
     zero:      "https://drive.google.com/drive/folders/...",
     _root:     "https://drive.google.com/drive/folders/...",  // top-level folder
   },
   ```

7. **Rebuild and deploy**:
   ```bash
   node build-encrypted.js
   git add index.html
   git commit -m "Wire up Drive document links"
   git push origin master
   ```

## What members see

- **Footer of the dashboard**: "📁 All fund documents (Google Drive)" link to the top-level folder
- **Fund detail modal** (click any holding row): "📄 Open [Fund Name] folder on Google Drive" link to that fund's subfolder

When members click a link, Google Drive will prompt them to sign in with their Google account if not already. As long as their email is on the share list, they'll have Viewer access.

## Bootstrapping with existing PDFs

You have a few PDFs already saved locally in `docs/source/`:
- `docs/source/distributions/2026-05-14-tau-ventures-fund-i.pdf`
- `docs/source/distributions/2026-05-14-tau-ventures-opportunity-fund.pdf`
- `docs/source/distributions/2026-05-14-tau-ventures-fund-ii.pdf`
- `docs/source/statements/2026-Q1-betaworks-3.0-capital-account.pdf`
- `docs/source/statements/2026-Q1-betaworks-3.0-financial-statements.pdf`

You can drag these into the matching Drive subfolders (`Tau Ventures Fund I/2026/`, etc.) as the first batch.

## Ongoing process

When a new statement, K-1, or distribution notice arrives:
1. Drop the PDF into the matching `Fund/Year/` folder in Drive
2. (Optional) keep a copy in `docs/source/` for your own records
3. Members can access it immediately — no rebuild required

The dashboard data (NAV, called, distributed) still needs a rebuild to reflect what's in the new doc, but the doc itself is available the moment you upload it.

## Privacy considerations

- Anyone you add as Viewer can see **all** fund folders in the shared parent folder. The dashboard's per-member permissioning (visibleTo) does NOT extend to Drive — Drive's share list is the access control.
- If you ever need to revoke access for a member, remove their email from the top-level folder's share list in Drive.
- Guests (financial advisors, etc.) who only have a guest password to the dashboard will NOT have Drive access unless you separately share with them.
