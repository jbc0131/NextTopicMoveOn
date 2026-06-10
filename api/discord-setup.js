// ── /api/discord-setup.js ─────────────────────────────────────────────────────
// One-time helper: posts the "Apply Now" message (with button) into
// #📝-roster-application. Hit it once in your browser, then you can delete
// this file from the repo — the button keeps working forever without it.
//
// Usage (after deploy):
//   https://<your-app>.vercel.app/api/discord-setup?secret=YOUR_SETUP_SECRET
//
// Required env vars:
//   DISCORD_BOT_TOKEN  — same as the interactions endpoint
//   APPLY_CHANNEL_ID   — right-click #📝-roster-application → Copy Channel ID
//   SETUP_SECRET       — any random string, just keeps strangers from spamming it

export default async function handler(req, res) {
  if (!process.env.SETUP_SECRET || req.query.secret !== process.env.SETUP_SECRET) {
    return res.status(401).json({ error: "bad secret" });
  }

  const r = await fetch(
    `https://discord.com/api/v10/channels/${process.env.APPLY_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{
          title: "📝 Roster Applications",
          description:
            "Thanks for your interest in applying for a raid spot here at " +
            "**<Next Topic Move On>**! Please click the **Apply Now** button below " +
            "to start your application.\n\n" +
            "*It's fairly quick and lightweight — 12 questions across 3 short pages, " +
            "plus a gear screenshot at the end.*",
          color: 0xf0b232,
        }],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 1, // primary (blurple)
            label: "Apply Now",
            custom_id: "apply_start",
            emoji: { name: "📝" },
          }],
        }],
      }),
    }
  );

  const data = await r.json();
  if (!r.ok) return res.status(500).json({ error: data });
  return res.json({ ok: true, message_id: data.id, note: "Pin the message in Discord, then delete this file." });
}
