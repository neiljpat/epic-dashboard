#!/usr/bin/env node
/**
 * preflight.js — the safety net for the EPIC dashboard.
 *
 * This repo has no test suite and no CI. Every change used to be verified by
 * hand, which is how a capital call once shipped invisible (aggregate bumped,
 * CALLS array not) and how member payment identifiers once reached a public
 * repo. This script makes those checks mechanical.
 *
 *   node preflight.js            # read-only: repo, deploy, worker, data
 *   node preflight.js --build    # additionally rebuild + parse-check index.html
 *   node preflight.js --offline  # skip anything that touches the network
 *
 * Exit code 0 = all PASS/WARN, 1 = at least one FAIL.
 *
 * SAFETY PROPERTIES OF THIS SCRIPT:
 *   - It never prints a member password, a DEK, or a `kid`.
 *   - `--build` suppresses the builder's stdout, which prints all five member
 *     passwords in clear text. Never run `node build-encrypted.js` with its
 *     output going anywhere persistent or shared.
 *   - It is tracked in a PUBLIC repo, so it hardcodes no figures and no
 *     personal identifiers. Everything sensitive is read at runtime from
 *     gitignored files.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARGS     = process.argv.slice(2);
const DO_BUILD = ARGS.includes('--build');
const OFFLINE  = ARGS.includes('--offline');

const REPO      = 'neiljpat/epic-dashboard';
const PAGES_URL = 'https://neiljpat.github.io/epic-dashboard/';
const DEK_API   = 'https://epic-dek-store.neilpatel83.workers.dev';
// Years for which the CALLS activity log is expected to be complete. Older
// years are itemised only partially by design (e.g. Nava and Cherish have no
// CALLS rows at all), so a whole-history equality check is not an invariant.
const COMPLETE_FROM_YEAR = 2025;

const SECRET_FILES = [
  'build-encrypted.js', 'template.html', '.secrets.json',
  'credentials.txt', 'worker-config.json',
];

let fails = 0, warns = 0;
const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const trySh = (cmd, opts) => { try { return sh(cmd, opts); } catch { return null; } };

function section(name) { console.log(`\n\x1b[1m${name}\x1b[0m`); }
function pass(msg)  { console.log(`  \x1b[32mPASS\x1b[0m  ${msg}`); }
function fail(msg)  { console.log(`  \x1b[31mFAIL\x1b[0m  ${msg}`); fails++; }
function warn(msg)  { console.log(`  \x1b[33mWARN\x1b[0m  ${msg}`); warns++; }
function info(msg)  { console.log(`  info  ${msg}`); }

// ---------------------------------------------------------------------------
// Load the plaintext DATA object out of build-encrypted.js.
//
// build-encrypted.js is a script with side effects (it writes index.html,
// credentials.txt and worker-config.json, and prints every member password),
// so it cannot simply be require()d. Instead the DATA object literal is sliced
// out by brace-matching and evaluated on its own.
// ---------------------------------------------------------------------------
function loadData() {
  const file = 'build-encrypted.js';
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex(l => l.startsWith('const DATA = {'));
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const literal = lines.slice(start, end + 1).join('\n')
    .replace(/^const DATA = /, '').replace(/;\s*$/, '');
  try { return eval('(' + literal + ')'); } catch (e) { return { _error: e.message }; }
}

// ===========================================================================
section('SOURCE CUSTODY');
// ===========================================================================
{
  for (const f of SECRET_FILES) {
    const ignored = trySh(`git check-ignore -q ${JSON.stringify(f)} && echo yes`) === 'yes';
    const exists  = fs.existsSync(f);
    if (!ignored)     fail(`${f} is NOT gitignored — it must never be committed`);
    else if (!exists) warn(`${f} is gitignored but missing from disk`);
    else              pass(`${f} present and gitignored`);
  }
  for (const f of SECRET_FILES) {
    const n = parseInt(trySh(`git log --all --oneline -- ${JSON.stringify(f)} | wc -l`) || '0', 10);
    if (n > 0) fail(`${f} appears in ${n} commit(s) — history contains secrets`);
  }
  if (SECRET_FILES.every(f => !parseInt(trySh(`git log --all --oneline -- ${JSON.stringify(f)} | wc -l`) || '0', 10)))
    pass('no secret file appears anywhere in git history');

  // The source of truth exists only here. Warn if no off-machine copy is
  // registered. See CLAUDE.md "Source custody".
  const backup = process.env.EPIC_BACKUP_DIR;
  if (!backup)                    warn('EPIC_BACKUP_DIR not set — no off-machine backup of .secrets.json is being checked');
  else if (!fs.existsSync(backup)) fail(`EPIC_BACKUP_DIR=${backup} does not exist`);
  else {
    const stale = SECRET_FILES.filter(f => {
      const b = path.join(backup, f);
      return !fs.existsSync(b) || fs.statSync(b).mtimeMs < fs.statSync(f).mtimeMs - 1000;
    });
    if (stale.length) fail(`backup stale or missing for: ${stale.join(', ')}`);
    else              pass(`off-machine backup current for all ${SECRET_FILES.length} source files`);
  }
}

// ===========================================================================
section('PUBLIC-REPO HYGIENE');
// ===========================================================================
{
  const tracked = (trySh('git ls-files') || '').split('\n').filter(Boolean);
  const D = loadData();

  // Structural patterns: SSNs and phone numbers should never appear in a
  // tracked file regardless of whose they are.
  const structural = [
    [/\b\d{3}-\d{2}-\d{4}\b/g,  'SSN-shaped'],
    [/\b\d{3}-\d{3}-\d{4}\b/g,  'phone-shaped'],
    [/(?<![\d.])\d{10}(?![\d.])/g, 'bare 10-digit run'],
  ];
  let structHits = 0;
  for (const f of tracked) {
    if (f === 'index.html') continue; // ciphertext; base64 trips digit runs
    let body; try { body = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const [re, label] of structural) {
      for (const m of body.matchAll(re)) {
        const line = body.slice(0, m.index).split('\n').length;
        fail(`${f}:${line} contains a ${label} value`); structHits++;
      }
    }
  }
  if (!structHits) pass('no SSN- or phone-shaped values in tracked files');

  // Verify by DISCOVERY, not by needle: pull the real identifiers and figures
  // out of the plaintext source, then hunt for them in tracked files.
  if (D && !D._error) {
    const needles = new Map(); // needle -> description
    for (const m of D.MEMBERS || []) {
      for (const k of ['zelle', 'venmo', 'paypal']) {
        const v = m.payments && m.payments[k];
        if (v && !String(v).includes('@gmail') && String(v).length > 4)
          needles.set(String(v).replace(/^@/, ''), `${m.name}'s ${k} identifier`);
      }
    }
    const figures = new Set();
    const addFig = n => {
      if (typeof n !== 'number' || !isFinite(n)) return;
      if (Math.abs(n) >= 1000) figures.add(n);
    };
    for (const h of D.HOLDINGS || []) {
      addFig(h.nav && h.nav.value);
      Object.values(h.called || {}).forEach(addFig);
      Object.values(h.distributed || {}).forEach(addFig);
    }
    (D.CLUB_EXPENSES || []).forEach(e => addFig(e.amount));
    (D.SETTLEMENTS   || []).forEach(s => addFig(s.amount));

    let leaks = 0;
    for (const f of tracked) {
      if (f === 'index.html') continue;
      let body; try { body = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const [needle, desc] of needles) {
        if (body.includes(needle)) { fail(`${f} exposes ${desc}`); leaks++; }
      }
      for (const n of figures) {
        // Match the figure as a human writes it: bare, comma-grouped, or
        // with cents. No literal example here on purpose — this file is
        // tracked in a public repo and would flag its own comment.
        const plain = String(n);
        const comma = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
        const re = new RegExp(`(?<![\\d.,])(${plain.replace('.', '\\.')}|${comma.replace(/[.]/g, '\\.')})(?![\\d])`);
        if (re.test(body)) { fail(`${f} exposes a plaintext portfolio figure (${comma})`); leaks++; }
      }
    }
    if (!leaks) pass(`no member payment identifier or portfolio figure (of ${figures.size} checked) in tracked files`);
  } else {
    warn('could not load DATA — skipped discovery-based leak scan');
  }

  const vis = OFFLINE ? null : trySh(`gh repo view ${REPO} --json visibility --jq .visibility`);
  if (vis === 'PUBLIC') {
    info('repo visibility is PUBLIC — everything tracked is world-readable');
    const emailHits = tracked.filter(f => {
      if (f === 'index.html') return false;
      try { return /@gmail\.com|@nathanstoll\.com/.test(fs.readFileSync(f, 'utf8')); } catch { return false; }
    });
    if (emailHits.length) info(`member emails present in: ${emailHits.join(', ')} (known, owner decision — see CLAUDE.md)`);
  } else if (vis) info(`repo visibility is ${vis}`);
}

// ===========================================================================
section('DATA INVARIANTS');
// ===========================================================================
{
  const D = loadData();
  if (!D)             fail('build-encrypted.js not found or DATA not locatable');
  else if (D._error)  fail(`DATA failed to parse: ${D._error}`);
  else {
    pass(`DATA parses — ${D.HOLDINGS.length} holdings, ${D.CALLS.length} calls, ${D.MEMBERS.length} members`);

    const shareSum = (D.MEMBERS || []).reduce((a, m) => a + m.share, 0);
    if (Math.abs(shareSum - 1) > 1e-6) fail(`MEMBERS shares sum to ${shareSum}, not 1.0`);
    else pass(`MEMBERS shares sum to 1.0`);

    const ids = new Set((D.HOLDINGS || []).map(h => h.id));
    const orphans = (D.CALLS || []).filter(c => !ids.has(c.holdingId));
    if (orphans.length) orphans.forEach(c => fail(`CALLS entry ${c.date} "${c.fund}" has unknown holdingId "${c.holdingId}"`));
    else pass('every CALLS entry maps to a known holding');

    // THE TWO-PLACES RULE. A capital call must be written in both the
    // holding's `called` aggregate and the CALLS array. Checked only for years
    // the activity log claims to cover completely.
    const detail = {};
    for (const c of D.CALLS || []) {
      const y = new Date(c.date).getUTCFullYear();
      (detail[c.holdingId] ??= {})[y] = (detail[c.holdingId][y] || 0) + c.amount;
    }
    let mismatched = 0;
    for (const h of D.HOLDINGS || []) {
      const agg = h.called || {};
      const years = new Set([...Object.keys(agg), ...Object.keys(detail[h.id] || {})].map(Number));
      for (const y of [...years].filter(y => y >= COMPLETE_FROM_YEAR).sort()) {
        const a = +(agg[y] || 0), d = +((detail[h.id] || {})[y] || 0);
        if (Math.abs(a - d) > 1.0) {
          fail(`${h.id} ${y}: called aggregate and CALLS rows disagree by ${(a - d).toFixed(2)} — a call is written in only one place`);
          mismatched++;
        }
      }
    }
    if (!mismatched) pass(`two-places rule holds for every holding from ${COMPLETE_FROM_YEAR} onward`);

    let over = 0;
    for (const h of D.HOLDINGS || []) {
      const called = Object.values(h.called || {}).reduce((a, b) => a + b, 0);
      if (h.commitment && called > h.commitment + 0.01) { fail(`${h.id} called ${called} exceeds commitment ${h.commitment}`); over++; }
    }
    if (!over) pass('no holding is called beyond its commitment');

    // Past-due calls are a reporting fact, not a code defect — surfaced so a
    // stale `status: "Pending"` cannot sit unnoticed for a month again.
    const today = new Date(new Date().toISOString().slice(0, 10));
    const pending = (D.CALLS || []).filter(c => c.status !== 'Paid');
    for (const c of pending) {
      const due = c.dueDate || c.date;
      const days = Math.round((today - new Date(due)) / 864e5);
      const who = c.visibleTo === 'all' ? 'EPIC' : 'personal';
      if (days > 0) warn(`${who} call "${c.fund}" still Pending — due ${due}, ${days} days past due`);
      else info(`${who} call "${c.fund}" due ${due} (${-days} days out)`);
    }
    if (!pending.length) pass('no pending capital calls');

    // Ledger source items. The balance nets to zero today, but by cancellation
    // between unsettled expenses / undisbursed distributions and live worker
    // settlements — not because nothing is outstanding. See CLAUDE.md.
    const unsettled = (D.CLUB_EXPENSES || []).filter(e => !e.settledOn);
    const undisbursed = (D.DISTRIBUTIONS || []).filter(d => !d.disbursedOn && d.visibleTo === 'all');
    if (unsettled.length || undisbursed.length)
      info(`ledger: ${unsettled.length} expense(s) with settledOn:null, ${undisbursed.length} EPIC distribution(s) with disbursedOn:null`);
  }
}

// ===========================================================================
section('BUILD');
// ===========================================================================
{
  if (!fs.existsSync('template.html')) fail('template.html missing — the UI source is gone');
  else {
    const t = fs.readFileSync('template.html', 'utf8');
    for (const ph of ['__ENCRYPTED_DATA__', '__MEMBER_KEYS__']) {
      if (t.includes(ph)) pass(`template.html contains ${ph}`);
      else fail(`template.html missing ${ph} — the build will refuse to run`);
    }
  }

  if (DO_BUILD) {
    const before = trySh('shasum -a 256 index.html');
    try {
      // stdout suppressed on purpose: the builder prints every member password.
      execSync('node build-encrypted.js', { stdio: ['ignore', 'ignore', 'pipe'] });
      pass('build completed (stdout suppressed — it prints member passwords)');
    } catch (e) { fail(`build failed: ${String(e.stderr || e).slice(0, 300)}`); }

    // Parse-check the generated inline script. This is what catches a syntax
    // error before it reaches five members' browsers.
    try {
      const html = fs.readFileSync('index.html', 'utf8');
      const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
      let checked = 0;
      for (const b of blocks) { if (b.trim()) { new Function(b); checked++; } }
      pass(`parse-checked ${checked} inline <script> block(s) — no syntax errors`);
    } catch (e) { fail(`generated index.html has a JS syntax error: ${e.message}`); }

    const after = trySh('shasum -a 256 index.html');
    if (before && after && before !== after)
      info('index.html changed (expected — every build uses fresh random IVs, so builds are never byte-reproducible)');
  } else {
    info('skipped rebuild (pass --build to rebuild and parse-check)');
  }
}

// ===========================================================================
section('DEPLOY SYNC');
// ===========================================================================
if (OFFLINE) info('skipped (--offline)');
else {
  const head = trySh('git rev-parse HEAD');
  trySh('git fetch -q origin');
  const remote = trySh('git rev-parse origin/master');
  if (head && remote && head === remote) pass(`local HEAD matches origin/master (${head.slice(0, 7)})`);
  else fail(`local HEAD ${String(head).slice(0, 7)} != origin/master ${String(remote).slice(0, 7)} — unpushed or behind`);

  const dirty = trySh('git status --porcelain');
  if (dirty) warn(`working tree is dirty:\n${dirty.split('\n').map(l => '          ' + l).join('\n')}`);
  else pass('working tree clean');

  const pages = trySh(`gh api repos/${REPO}/pages/builds/latest --jq '.status + " " + .commit'`);
  if (!pages) warn('could not read GitHub Pages build status');
  else {
    const [status, commit] = pages.split(' ');
    if (status !== 'built')       fail(`Pages build status is "${status}"`);
    else if (commit !== head)     fail(`Pages is serving ${String(commit).slice(0, 7)}, HEAD is ${String(head).slice(0, 7)}`);
    else                          pass(`Pages built and serving HEAD (${String(commit).slice(0, 7)})`);
  }

  const localHash = (trySh('shasum -a 256 index.html') || '').split(/\s+/)[0];
  const tmp = path.join(require('os').tmpdir(), 'epic_live_check.html');
  const code = trySh(`curl -s -o ${tmp} -w '%{http_code}' ${PAGES_URL}`);
  if (code !== '200') fail(`live site returned HTTP ${code}`);
  else {
    const liveHash = (trySh(`shasum -a 256 ${tmp}`) || '').split(/\s+/)[0];
    if (liveHash === localHash) pass('live site is byte-identical to local index.html');
    else fail(`live site differs from local index.html (live ${liveHash.slice(0, 12)}, local ${localHash.slice(0, 12)})`);
  }
  try { fs.unlinkSync(tmp); } catch {}
}

// ===========================================================================
section('WORKER');
// ===========================================================================
if (OFFLINE) info('skipped (--offline)');
else {
  for (const ep of ['/settlements', '/payments']) {
    const code = trySh(`curl -s -o /dev/null -w '%{http_code}' ${DEK_API}${ep}`);
    if (code === '401') pass(`unauthenticated GET ${ep} → 401`);
    else                fail(`unauthenticated GET ${ep} → ${code} (expected 401)`);
  }

  if (!fs.existsSync('worker-config.json')) warn('worker-config.json missing — skipped authenticated checks');
  else {
    const cfg = JSON.parse(fs.readFileSync('worker-config.json', 'utf8'));
    let kids = cfg.memberKids || cfg.MEMBER_KIDS || {};
    if (typeof kids === 'string') kids = JSON.parse(kids);
    let ok = 0;
    for (const [email, kid] of Object.entries(kids)) {
      // kid is a bearer credential — never printed.
      const code = trySh(`curl -s -o /dev/null -w '%{http_code}' -H ${JSON.stringify('X-Member-Kid: ' + kid)} ${DEK_API}/settlements`);
      if (code === '200') ok++;
      else fail(`${email} failed to authenticate against the worker (HTTP ${code})`);
    }
    const n = Object.keys(kids).length;
    if (ok === n) pass(`all ${n} member kids authenticate (${ok}/${n} → 200)`);

    // A kid is derived from the DEK, so it is stable across rebuilds. If these
    // ever stop matching, MEMBER_KIDS must be reissued to the worker secret.
    if (n && ok !== n) info('if the DEK was rotated, reissue MEMBER_KIDS: see CLAUDE.md "Rotating"');
  }

  const src = fs.existsSync('worker/src/index.js') ? fs.readFileSync('worker/src/index.js', 'utf8') : '';
  const markers = ['handlePaymentsItem', 'MANAGING_MEMBER_EMAIL', 'timingSafeEqual', 'MAX_SETTLEMENT_BYTES'];
  const missing = markers.filter(m => !src.includes(m));
  if (missing.length) warn(`worker/src/index.js missing expected marker(s): ${missing.join(', ')}`);
  else pass('worker source contains all expected feature markers');
}

// ===========================================================================
console.log('');
const verdict = fails ? `\x1b[31m${fails} FAIL\x1b[0m` : '\x1b[32mall checks passed\x1b[0m';
console.log(`\x1b[1mpreflight: ${verdict}${warns ? `, \x1b[33m${warns} WARN\x1b[0m` : ''}\x1b[0m`);
process.exit(fails ? 1 : 0);
