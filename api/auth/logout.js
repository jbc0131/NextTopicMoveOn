// api/auth/logout.js
// Vercel serverless — clears the auth cookie and redirects to home.

const COOKIE_NAME = "ntmo_auth";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
  res.writeHead(302, { Location: req.query.returnTo || "/" });
  res.end();
}
