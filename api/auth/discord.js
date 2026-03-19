// api/auth/discord.js
// Vercel serverless — redirects user to Discord OAuth2 authorization page.
// Stores the return URL in a cookie so we can redirect back after auth.

export default function handler(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "DISCORD_CLIENT_ID not configured" });
  }

  // Where to send the user back after login (default: /kara/admin)
  const returnTo = req.query.returnTo || "/kara/admin";

  // Set return URL in a short-lived cookie
  res.setHeader("Set-Cookie", `ntmo_return=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);

  const redirectUri = `${process.env.AUTH_DOMAIN || "https://nexttopicmoveon.com"}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
  });

  res.writeHead(302, { Location: `https://discord.com/api/oauth2/authorize?${params}` });
  res.end();
}
