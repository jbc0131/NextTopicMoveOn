export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { content, night } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: "Missing content" });
  }

  const webhookUrl = night === "thu"
    ? process.env.DISCORD_KARA_THURS_WEBHOOK_URL
    : process.env.DISCORD_KARA_TUES_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: `Discord webhook URL not configured for ${night || "unknown"} night` });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Discord webhook error:", response.status, text);
      return res.status(500).json({ error: "Discord webhook failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Discord webhook error:", e);
    return res.status(500).json({ error: "Discord webhook failed" });
  }
}
