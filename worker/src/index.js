/**
 * EPIC Worker — DEK store + Club ledger backend
 *
 * Endpoints:
 *
 *   /keys/:email
 *     GET    → fetch the member's stored encrypted DEK (public; blob is
 *              useless without password)
 *     PUT    → store re-encrypted DEK; body requires `kid` matching
 *              MEMBER_KIDS[email]
 *     DELETE → admin-only recovery; requires `Authorization: Bearer ADMIN_TOKEN`
 *
 *   /settlements
 *     GET    → list all settlement claims (any valid kid in
 *              `X-Member-Kid` header)
 *     POST   → submit a new pending claim; body has fromEmail, toEmail,
 *              amount, method, note + submitter's `kid`
 *
 *   /settlements/:id
 *     PATCH  → confirm/dispute a claim; body has `status` +
 *              actor's `kid`. Allowed actors: manager OR the `to` party.
 *     DELETE → remove a claim; allowed: manager OR original submitter.
 *
 *   /payments
 *     GET    → list all member payment-method overrides
 *              (any valid kid in `X-Member-Kid`)
 *
 *   /payments/:email
 *     PUT    → set/replace a member's payment-method overrides;
 *              body requires `kid` matching MEMBER_KIDS[email]
 *     DELETE → remove a member's overrides (revert to encrypted defaults);
 *              requires `kid` matching MEMBER_KIDS[email]
 */

const ALLOWED_ORIGINS = [
  "https://neiljpat.github.io",
  "http://localhost:8891",
  "http://127.0.0.1:8891",
];

const ALLOWED_EMAILS = [
  "neilpatel83@gmail.com",
  "dlpeters@gmail.com",
  "nathan@nathanstoll.com",
  "saurabhnsharma@gmail.com",
  "brian.j.peterson@gmail.com",
];

const MANAGING_MEMBER_EMAIL = "neilpatel83@gmail.com";

const MAX_DEK_BYTES = 4096;
const MAX_SETTLEMENT_BYTES = 2048;
const MAX_PAYMENT_BYTES = 2048;

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.find(o => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Member-Kid, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function parseMemberKids(env) {
  if (!env.MEMBER_KIDS) return {};
  try {
    const parsed = JSON.parse(env.MEMBER_KIDS);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Find an email whose kid matches the provided value (in constant time
// across all known emails). Returns the matching email or null.
function emailForKid(memberKids, kid) {
  if (typeof kid !== "string" || !kid) return null;
  for (const email of Object.keys(memberKids)) {
    if (timingSafeEqual(kid, memberKids[email])) return email;
  }
  return null;
}

// --- Route handlers --------------------------------------------------------

async function handleKeys(request, env, cors, match) {
  const email = decodeURIComponent(match[1]).toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) return json({ error: "Email not recognized" }, 403, cors);
  const key = `dek:${email}`;

  if (request.method === "GET") {
    const value = await env.DEK_STORE.get(key);
    if (!value) return json({ error: "No custom key stored" }, 404, cors);
    return new Response(value, { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (request.method === "PUT") {
    const cl = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (cl > MAX_DEK_BYTES) return json({ error: "Payload too large" }, 413, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }
    if (typeof body.salt !== "string" || typeof body.payload !== "string" ||
        typeof body.kid !== "string" || !body.salt || !body.payload || !body.kid) {
      return json({ error: "Missing or invalid salt/payload/kid" }, 400, cors);
    }
    const memberKids = parseMemberKids(env);
    const expectedKid = memberKids[email];
    if (!expectedKid || !timingSafeEqual(body.kid, expectedKid)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    await env.DEK_STORE.put(key, JSON.stringify({ salt: body.salt, payload: body.payload }));
    return json({ ok: true }, 200, cors);
  }

  if (request.method === "DELETE") {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    await env.DEK_STORE.delete(key);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Method not allowed" }, 405, cors);
}

async function listSettlements(env) {
  const list = await env.DEK_STORE.list({ prefix: "settle:" });
  const items = [];
  for (const k of list.keys) {
    const v = await env.DEK_STORE.get(k.name);
    if (v) {
      try { items.push(JSON.parse(v)); } catch {}
    }
  }
  return items.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}

async function handleSettlementsCollection(request, env, cors) {
  const memberKids = parseMemberKids(env);

  if (request.method === "GET") {
    const callerKid = request.headers.get("X-Member-Kid") || "";
    if (!emailForKid(memberKids, callerKid)) return json({ error: "Unauthorized" }, 401, cors);
    const items = await listSettlements(env);
    return json({ items }, 200, cors);
  }

  if (request.method === "POST") {
    const cl = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (cl > MAX_SETTLEMENT_BYTES) return json({ error: "Payload too large" }, 413, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }

    const { fromEmail, fromName, toEmail, toName, amount, method, note, kid, status: bodyStatus } = body || {};
    if (!ALLOWED_EMAILS.includes(fromEmail) || !ALLOWED_EMAILS.includes(toEmail)) {
      return json({ error: "Unknown member" }, 400, cors);
    }
    if (typeof amount !== "number" || amount <= 0 || amount > 1e6) {
      return json({ error: "Invalid amount" }, 400, cors);
    }
    // Allowed actors: the sender (typical claim), the recipient (recording an
    // out-of-band payment they received), or the manager (recording anything).
    if (typeof kid !== "string") return json({ error: "Unauthorized" }, 401, cors);
    const actorEmail = emailForKid(memberKids, kid);
    if (!actorEmail) return json({ error: "Unauthorized" }, 401, cors);
    const isManager   = actorEmail === MANAGING_MEMBER_EMAIL;
    const isSender    = actorEmail === fromEmail;
    const isRecipient = actorEmail === toEmail;
    if (!isManager && !isSender && !isRecipient) {
      return json({ error: "Forbidden" }, 403, cors);
    }
    // Initial status: sender posting → pending (other side must confirm).
    // Recipient or manager posting → may declare it confirmed directly.
    let initialStatus = "pending";
    if ((isRecipient || isManager) && bodyStatus === "confirmed") {
      initialStatus = "confirmed";
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry = {
      id,
      fromEmail, fromName: String(fromName || ""),
      toEmail, toName: String(toName || ""),
      amount: Math.round(amount * 100) / 100,
      method: String(method || ""),
      note: String(note || ""),
      submittedAt: now,
      submittedBy: actorEmail,
      status: initialStatus,
      confirmedAt: initialStatus === "confirmed" ? now : null,
    };
    await env.DEK_STORE.put(`settle:${id}`, JSON.stringify(entry));
    return json({ id, status: initialStatus }, 201, cors);
  }

  return json({ error: "Method not allowed" }, 405, cors);
}

async function handleSettlementsItem(request, env, cors, id) {
  const memberKids = parseMemberKids(env);
  const key = `settle:${id}`;
  const existing = await env.DEK_STORE.get(key);
  if (!existing) return json({ error: "Not found" }, 404, cors);
  const entry = JSON.parse(existing);

  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }
    const { status, kid, note } = body || {};
    if (!["pending", "confirmed", "disputed"].includes(status)) {
      return json({ error: "Invalid status" }, 400, cors);
    }
    // Allowed actors: manager OR the "to" party of the settlement
    const actorEmail = emailForKid(memberKids, kid);
    if (!actorEmail) return json({ error: "Unauthorized" }, 401, cors);
    if (actorEmail !== MANAGING_MEMBER_EMAIL && actorEmail !== entry.toEmail) {
      return json({ error: "Forbidden" }, 403, cors);
    }
    entry.status = status;
    entry.confirmedAt = status === "confirmed" ? new Date().toISOString() : entry.confirmedAt;
    if (typeof note === "string") entry.note = note;
    await env.DEK_STORE.put(key, JSON.stringify(entry));
    return json({ ok: true, item: entry }, 200, cors);
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }
    const { kid } = body || {};
    const actorEmail = emailForKid(memberKids, kid);
    if (!actorEmail) return json({ error: "Unauthorized" }, 401, cors);
    // Any party (sender or recipient) or the manager can delete.
    if (
      actorEmail !== MANAGING_MEMBER_EMAIL &&
      actorEmail !== entry.fromEmail &&
      actorEmail !== entry.toEmail
    ) {
      return json({ error: "Forbidden" }, 403, cors);
    }
    await env.DEK_STORE.delete(key);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Method not allowed" }, 405, cors);
}

async function listPayments(env) {
  const list = await env.DEK_STORE.list({ prefix: "payments:" });
  const out = {};
  for (const k of list.keys) {
    const email = k.name.slice("payments:".length);
    const v = await env.DEK_STORE.get(k.name);
    if (v) {
      try { out[email] = JSON.parse(v); } catch {}
    }
  }
  return out;
}

async function handlePaymentsCollection(request, env, cors) {
  const memberKids = parseMemberKids(env);
  if (request.method === "GET") {
    const callerKid = request.headers.get("X-Member-Kid") || "";
    if (!emailForKid(memberKids, callerKid)) return json({ error: "Unauthorized" }, 401, cors);
    const items = await listPayments(env);
    return json({ items }, 200, cors);
  }
  return json({ error: "Method not allowed" }, 405, cors);
}

async function handlePaymentsItem(request, env, cors, email) {
  email = email.toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) return json({ error: "Email not recognized" }, 403, cors);
  const memberKids = parseMemberKids(env);
  const key = `payments:${email}`;

  if (request.method === "PUT") {
    const cl = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (cl > MAX_PAYMENT_BYTES) return json({ error: "Payload too large" }, 413, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }
    const { zelle, venmo, paypal, preferred, notes, kid } = body || {};
    if (!timingSafeEqual(kid || "", memberKids[email] || "")) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    if (preferred && !["zelle", "venmo", "paypal"].includes(preferred)) {
      return json({ error: "Invalid preferred method" }, 400, cors);
    }
    const sanitize = v => v == null ? null : String(v).slice(0, 200);
    const entry = {
      zelle:    sanitize(zelle),
      venmo:    sanitize(venmo),
      paypal:   sanitize(paypal),
      preferred: preferred || null,
      notes:    sanitize(notes) || "",
      updatedAt: new Date().toISOString(),
    };
    await env.DEK_STORE.put(key, JSON.stringify(entry));
    return json({ ok: true, item: entry }, 200, cors);
  }

  if (request.method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, cors); }
    const { kid } = body || {};
    if (!timingSafeEqual(kid || "", memberKids[email] || "")) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    await env.DEK_STORE.delete(key);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Method not allowed" }, 405, cors);
}

// --- Router ----------------------------------------------------------------

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const p = url.pathname;

    let m;
    if ((m = p.match(/^\/keys\/([^/]+)$/)))           return handleKeys(request, env, cors, m);
    if (p === "/settlements")                          return handleSettlementsCollection(request, env, cors);
    if ((m = p.match(/^\/settlements\/([^/]+)$/)))     return handleSettlementsItem(request, env, cors, m[1]);
    if (p === "/payments")                             return handlePaymentsCollection(request, env, cors);
    if ((m = p.match(/^\/payments\/([^/]+)$/)))        return handlePaymentsItem(request, env, cors, decodeURIComponent(m[1]));

    return json({ error: "Not found" }, 404, cors);
  },
};
