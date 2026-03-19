// api/auth/me.js
// Vercel serverless — returns current auth state from the signed cookie.

import crypto from "crypto";

const COOKIE_NAME = "ntmo_auth";

function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");

  if (signature !== expected) return null;

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

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return res.status(200).json({ authenticated: false });
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return res.status(200).json({ authenticated: false });
  }

  const payload = verify(token, authSecret);
  if (!payload) {
    return res.status(200).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      discordId: payload.discordId,
      username: payload.username,
      globalName: payload.globalName,
      avatar: payload.avatar,
    },
  });
}
