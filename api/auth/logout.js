// api/auth/logout.js
// Vercel serverless — clears the auth cookie and redirects to home.

const COOKIE_NAME = "ntmo_auth";

export default function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawReturn = req.query.returnTo || "/";
  const returnTo = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";

  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
  res.writeHead(302, { Location: returnTo });
  res.end();
}
