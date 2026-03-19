// api/auth/callback.js
// Vercel serverless — Discord OAuth2 callback.
// Exchanges code for token, checks guild roles via bot token, sets signed auth cookie.

import crypto from "crypto";

const DISCORD_API = "https://discord.com/api/v10";
const COOKIE_NAME = "ntmo_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
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

function errorRedirect(res, message) {
  const params = new URLSearchParams({ error: message });
  res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(message)}` });
  res.end();
}

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return errorRedirect(res, "No authorization code received");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const adminRoleIds = (process.env.DISCORD_ALLOWED_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const memberRoleIds = (process.env.DISCORD_MEMBER_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const authSecret = process.env.AUTH_SECRET;

  if (!clientId || !clientSecret || !botToken || !guildId || !authSecret) {
    return errorRedirect(res, "Server auth not configured");
  }

  const allAllowedRoleIds = [...new Set([...adminRoleIds, ...memberRoleIds])];
  if (allAllowedRoleIds.length === 0) {
    return errorRedirect(res, "No allowed roles configured");
  }

  const redirectUri = `${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://nexttopicmoveon.com"}/api/auth/callback`;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Discord token exchange failed:", tokenRes.status, text);
      return errorRedirect(res, "Discord login failed");
    }

    const tokenData = await tokenRes.json();

    // 2. Get user identity
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return errorRedirect(res, "Failed to fetch Discord identity");
    }

    const user = await userRes.json();

    // 3. Check guild membership and roles via bot token
    const memberRes = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${user.id}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        return errorRedirect(res, "You are not a member of the NTMO Discord server");
      }
      console.error("Guild member fetch failed:", memberRes.status);
      return errorRedirect(res, "Failed to verify server membership");
    }

    const member = await memberRes.json();

    // 4. Check if user has any allowed role (member or admin)
    const hasAccess = member.roles.some(roleId => allAllowedRoleIds.includes(roleId));

    if (!hasAccess) {
      return errorRedirect(res, "You do not have permission to access this site. Contact an officer.");
    }

    // 5. Determine if user is admin
    const isAdmin = adminRoleIds.length > 0 && member.roles.some(roleId => adminRoleIds.includes(roleId));

    // 6. Build JWT and set cookie
    const payload = {
      discordId: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar,
      isAdmin,
      roles: member.roles.filter(r => allAllowedRoleIds.includes(r)),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
    };

    const token = sign(payload, authSecret);

    // Get return URL from cookie
    const cookies = parseCookies(req.headers.cookie);
    const returnTo = cookies.ntmo_return ? decodeURIComponent(cookies.ntmo_return) : "/kara/admin";

    // Set auth cookie and clear return cookie
    res.setHeader("Set-Cookie", [
      `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${COOKIE_MAX_AGE}`,
      `ntmo_return=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    ]);

    res.writeHead(302, { Location: returnTo });
    res.end();

  } catch (err) {
    console.error("Auth callback error:", err);
    return errorRedirect(res, "Authentication failed");
  }
}
