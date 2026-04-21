export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { night, messageId, content, embeds } = req.body || {};
  if (!content && !(Array.isArray(embeds) && embeds.length)) {
    return res.status(400).json({ error: "Missing content or embeds" });
  }

  const webhookUrl = night === "thu"
    ? process.env.DISCORD_KARA_THURS_WEBHOOK_URL
    : process.env.DISCORD_KARA_TUES_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: `Discord webhook URL not configured for ${night || "unknown"} night` });
  }

  const payload = JSON.stringify({
    content: content ?? "",
    embeds:  embeds  ?? [],
    allowed_mentions: { parse: ["users", "roles"] },
  });

  try {
    if (messageId) {
      const editRes = await fetch(`${webhookUrl}/messages/${messageId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    payload,
      });
      if (editRes.ok) {
        const data = await editRes.json();
        return res.status(200).json({ ok: true, messageId: data.id, updated: true });
      }
      if (editRes.status !== 404) {
        const text = await editRes.text();
        console.error("Discord edit error:", editRes.status, text);
        return res.status(500).json({ error: "Discord edit failed" });
      }
      // 404: underlying message was deleted — fall through to create fresh
    }

    const postUrl = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`;
    const postRes = await fetch(postUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    payload,
    });
    if (!postRes.ok) {
      const text = await postRes.text();
      console.error("Discord post error:", postRes.status, text);
      return res.status(500).json({ error: "Discord post failed" });
    }
    const data = await postRes.json();
    return res.status(200).json({ ok: true, messageId: data.id, updated: false });
  } catch (e) {
    console.error("Discord webhook error:", e);
    return res.status(500).json({ error: "Discord webhook failed" });
  }
}
