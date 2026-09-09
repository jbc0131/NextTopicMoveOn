// api/positioning-upload.js
// Vercel serverless — stores raid positioning images in Vercel Blob.
//
// Admin-gated: the same signed ntmo_auth cookie that gates /admin pages is
// verified here, so a forged request from a non-admin is rejected server-side.
// The Firebase credentials in the client bundle are public, which is why the
// upload cannot be a client-side check.
//
// POST   { moduleKey, teamId, bossSlug, contentType, dataBase64 } → { url, pathname }
// DELETE { pathname }                                             → { ok: true }
//
// The manifest of which images belong to which boss lives in Firestore
// (raid/{teamId}/{moduleKey}/positioning) and is written by the client after a
// successful upload — Firestore is already world-writable in this project, so
// guarding the manifest server-side would buy nothing. The file bytes are what
// actually need protecting.

import crypto from "crypto";
import { put, del } from "@vercel/blob";

const COOKIE_NAME  = "ntmo_auth";
const MAX_BYTES    = 3 * 1024 * 1024; // client downscales well under this; base64 must fit Vercel's 4.5MB body cap
const ALLOWED_MIME = new Set(["image/webp", "image/png", "image/jpeg"]);
const EXT_BY_MIME  = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
const SLUG_RE      = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");

  // Both are hex-ish base64url of fixed length; bail before timingSafeEqual throws.
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=");
  });
  return cookies;
}

function requireAdmin(req, res) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    res.status(503).json({ error: "Auth is not configured on this deployment." });
    return null;
  }

  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const payload = token ? verify(token, authSecret) : null;

  if (!payload) {
    res.status(401).json({ error: "Sign in to upload positioning images." });
    return null;
  }
  if (!payload.isAdmin) {
    res.status(403).json({ error: "Positioning images can only be changed by raid admins." });
    return null;
  }
  return payload;
}

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Image storage is not configured. Add the Vercel Blob integration to this project.",
    });
  }

  const admin = requireAdmin(req, res);
  if (!admin) return undefined;

  if (req.method === "DELETE") {
    const { pathname } = req.body || {};
    if (!pathname || typeof pathname !== "string") {
      return res.status(400).json({ error: "pathname is required" });
    }
    // Only ever delete inside our own prefix, whatever the caller sends.
    if (!pathname.startsWith("positioning/")) {
      return res.status(400).json({ error: "Refusing to delete outside positioning/" });
    }
    try {
      await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: `Delete failed: ${err.message}` });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { moduleKey, teamId, bossSlug, contentType, dataBase64 } = req.body || {};

  for (const [label, value] of [["moduleKey", moduleKey], ["teamId", teamId], ["bossSlug", bossSlug]]) {
    if (!value || typeof value !== "string" || !SLUG_RE.test(value)) {
      return res.status(400).json({ error: `Invalid ${label}` });
    }
  }
  if (!ALLOWED_MIME.has(contentType)) {
    return res.status(400).json({ error: "Only PNG, JPEG and WebP images are accepted." });
  }
  if (typeof dataBase64 !== "string" || !dataBase64) {
    return res.status(400).json({ error: "dataBase64 is required" });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    return res.status(400).json({ error: "Image data was not valid base64." });
  }
  if (!buffer.length) return res.status(400).json({ error: "Image was empty." });
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ error: "Image is too large even after downscaling." });
  }

  const ext      = EXT_BY_MIME[contentType];
  const unique   = `${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
  const pathname = `positioning/${moduleKey}/${teamId}/${bossSlug}-${unique}.${ext}`;

  try {
    const blob = await put(pathname, buffer, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      // Images are immutable — a replacement gets a brand new pathname.
      cacheControlMaxAge: 31536000,
      addRandomSuffix: false,
    });
    return res.status(200).json({
      url:        blob.url,
      pathname:   blob.pathname,
      uploadedBy: admin.globalName || admin.username || "",
    });
  } catch (err) {
    return res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
}
