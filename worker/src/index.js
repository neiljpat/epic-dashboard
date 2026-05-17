/**
 * EPIC DEK Store — Cloudflare Worker
 *
 * Simple key-value store for encrypted DEKs (data encryption keys).
 * Each EPIC member can store their own re-encrypted DEK here after
 * changing their password. The dashboard checks this store first,
 * then falls back to the HTML-embedded keys.
 *
 * The stored values are already AES-256-GCM encrypted — even if this
 * worker is compromised, the attacker still needs the user's password.
 *
 * Security:
 *   - GET is public (encrypted blobs are useless without password)
 *   - PUT requires per-member `kid` proof (base64 SHA-256(DEK || email))
 *     in the JSON body. Each member has a unique kid stored in MEMBER_KIDS
 *     (set as a Worker secret / env var with JSON value
 *     {"email": "kid", ...}). A member proves possession of the DEK by
 *     including the kid; they cannot overwrite another member's blob
 *     because they don't know the other member's kid.
 *   - DELETE is admin-only — requires Authorization: Bearer ADMIN_TOKEN.
 *     No client-side path uses DELETE. Invoke via curl from terminal
 *     to reset a member's key back to the HTML-embedded original.
 *   - CORS headers for browser enforcement (defense in depth)
 *   - Payload size limit prevents abuse
 *
 * Endpoints:
 *   GET    /keys/:email  → { salt, payload } or 404
 *   PUT    /keys/:email  → stores { salt, payload }; body must include
 *                          kid matching MEMBER_KIDS[email]; returns 200
 *   DELETE /keys/:email  → removes stored key (admin-only recovery
 *                          endpoint — invoke via curl from terminal),
 *                          requires Bearer ADMIN_TOKEN, returns 200
 */

const ALLOWED_ORIGINS = [
  "https://neiljpat.github.io",
  "http://localhost:8891",  // local dev
  "http://127.0.0.1:8891",
];

const ALLOWED_EMAILS = [
  "neilpatel83@gmail.com",
  "dlpeters@gmail.com",
  "nathan@nathanstoll.com",
  "saurabhnsharma@gmail.com",
  "brian.j.peterson@gmail.com",
];

const MAX_PAYLOAD_BYTES = 4096; // encrypted DEK should be ~100-200 bytes

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.find(o => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Constant-time string comparison to avoid timing leaks on kid validation.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function parseMemberKids(env) {
  const raw = env.MEMBER_KIDS;
  if (!raw) {
    console.warn("MEMBER_KIDS env var is empty — all PUTs will be rejected. Set it via `wrangler secret put MEMBER_KIDS`.");
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch (e) {
    console.warn("Failed to parse MEMBER_KIDS JSON:", e.message);
    return {};
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/keys\/([^/]+)$/);

    if (!match) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const email = decodeURIComponent(match[1]).toLowerCase();

    // Only allow known emails
    if (!ALLOWED_EMAILS.includes(email)) {
      return new Response(JSON.stringify({ error: "Email not recognized" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const key = `dek:${email}`;

    // GET — retrieve stored encrypted DEK (public — blob is useless without password)
    if (request.method === "GET") {
      const value = await env.DEK_STORE.get(key);
      if (!value) {
        return new Response(JSON.stringify({ error: "No custom key stored" }), {
          status: 404,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(value, {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // PUT — store encrypted DEK (requires per-member kid proof)
    if (request.method === "PUT") {
      // Check payload size
      const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return new Response(JSON.stringify({ error: "Payload too large" }), {
          status: 413,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Validate shape — salt, payload, and kid must be non-empty strings
      if (typeof body.salt !== "string" || typeof body.payload !== "string" ||
          typeof body.kid !== "string" ||
          !body.salt || !body.payload || !body.kid) {
        return new Response(JSON.stringify({ error: "Missing or invalid salt/payload/kid" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Validate kid against per-member registry
      const memberKids = parseMemberKids(env);
      const expectedKid = memberKids[email];
      if (!expectedKid || !timingSafeEqual(body.kid, expectedKid)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await env.DEK_STORE.put(key, JSON.stringify({ salt: body.salt, payload: body.payload }));

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // DELETE — admin-only recovery endpoint. Invoke via curl from terminal:
    //   curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
    //     https://epic-dek-store.<account>.workers.dev/keys/<email>
    // Removes the member's stored encrypted DEK, reverting them to the
    // HTML-embedded original (which they unlock with their original password).
    if (request.method === "DELETE") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await env.DEK_STORE.delete(key);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
