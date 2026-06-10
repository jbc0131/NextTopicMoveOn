// ── /api/discord-interactions.js ─────────────────────────────────────────────
// Discord Interactions endpoint for NTMO roster applications.
//
// Flow:
//   1. Applicant clicks "Apply Now" button (posted once via /api/discord-setup)
//   2. Modal page 1 (Character Basics) → ephemeral "saved" message + Continue
//   3. Modal page 2 (Raiding Details)  → ephemeral "saved" message + Continue
//   4. Modal page 3 (Final Questions)  → bot creates private ticket channel
//      visible to GOAT role + the applicant, posts summary embed with
//      Approve / Deny buttons, prompts applicant for gear screenshot
//   5. Officer clicks Approve/Deny → verdict posted, channel renamed,
//      Delete Ticket button appears
//
// State between modal pages is carried in the ephemeral message embeds —
// Discord sends the message back on the next button click, so no database
// staging is needed. Abandoned applications leave nothing behind.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   DISCORD_PUBLIC_KEY   — from Developer Portal → General Information
//   DISCORD_BOT_TOKEN    — from Developer Portal → Bot
//   GOAT_ROLE_ID         — right-click GOAT role → Copy Role ID
//   TICKET_CATEGORY_ID   — (optional) category to create ticket channels under

export const config = { api: { bodyParser: false } }; // raw body needed for signature check

import crypto from "node:crypto";

const API = "https://discord.com/api/v10";

// ── Application questions (3 modal pages, max 5 questions per page) ──────────
// style: 1 = short input, 2 = paragraph. Labels max 45 chars (Discord limit).
// Keep max_length ≤ 900 so answers fit in embed fields (1024 char cap).
const PAGES = [
  {
    title: "Character Basics",
    questions: [
      { id: "char_name",   label: "Character Name",                 style: 1, max: 100 },
      { id: "class_spec",  label: "Class / Spec",                   style: 1, max: 100 },
      { id: "attunements", label: "Attunements (SSC / TK / BT / Hyjal)", style: 1, max: 200,
        placeholder: "e.g. SSC + TK attuned, working on BT/Hyjal" },
      { id: "wcl",         label: "WCL Character Page Link",        style: 1, max: 300 },
    ],
  },
  {
    title: "Raiding Details",
    questions: [
      { id: "team",         label: "Team Preference",               style: 1, max: 100,
        placeholder: "Tuesday (Team Dick) / Thursday (Team Balls) / Either" },
      { id: "availability", label: "Can you reliably make invites?", style: 2, max: 500 },
      { id: "professions",  label: "Professions",                   style: 1, max: 200 },
      { id: "alts",         label: "Raiding Alts",                  style: 2, max: 500 },
    ],
  },
  {
    title: "Final Questions",
    questions: [
      { id: "prev_guild", label: "Previous Guild & Why You're Leaving", style: 2, max: 900 },
      { id: "goals",      label: "What are you looking for from NTMO?", style: 2, max: 900 },
    ],
  },
];

// Permissions granted to GOAT + applicant inside the ticket channel
const VIEW_CHANNEL        = 1n << 10n;
const SEND_MESSAGES       = 1n << 11n;
const EMBED_LINKS         = 1n << 14n;
const ATTACH_FILES        = 1n << 15n;
const READ_MESSAGE_HISTORY = 1n << 16n;
const TICKET_PERMS = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | ATTACH_FILES | READ_MESSAGE_HISTORY).toString();

// ── Request handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await readRawBody(req);
  if (!verifySignature(req, rawBody)) {
    return res.status(401).json({ error: "invalid request signature" });
  }

  const interaction = JSON.parse(rawBody);

  try {
    switch (interaction.type) {
      case 1: // PING — Discord verifies the endpoint with this
        return res.json({ type: 1 });

      case 3: // MESSAGE_COMPONENT — button clicks
        return await handleButton(interaction, res);

      case 5: // MODAL_SUBMIT
        return await handleModalSubmit(interaction, res);

      default:
        return res.json({ type: 4, data: { content: "Unhandled interaction type.", flags: 64 } });
    }
  } catch (err) {
    console.error("discord-interactions error:", err);
    return res.json({
      type: 4,
      data: { content: "⚠️ Something went wrong — try again or ping an officer.", flags: 64 },
    });
  }
}

// ── Button routing ────────────────────────────────────────────────────────────
async function handleButton(interaction, res) {
  const id = interaction.data.custom_id;

  // "Apply Now" on the pinned message → open page 1
  if (id === "apply_start") return res.json(buildModal(0));

  // "Continue" on the ephemeral saved-progress messages → open page 2 / 3
  if (id === "apply_continue_1") return res.json(buildModal(1));
  if (id === "apply_continue_2") return res.json(buildModal(2));

  // Officer verdict buttons (custom_id encodes the applicant's user id)
  if (id.startsWith("app_approve_")) return verdict(interaction, res, "approve", id.split("_").pop());
  if (id.startsWith("app_deny_"))    return verdict(interaction, res, "deny",    id.split("_").pop());

  // Delete the ticket channel
  if (id === "app_delete") {
    await discord(`/channels/${interaction.channel_id}`, "DELETE");
    // Channel is gone, so the ack has nowhere to land — deferred-update is the
    // quietest way to satisfy Discord's response requirement.
    return res.json({ type: 6 });
  }

  return res.json({ type: 4, data: { content: "Unknown button.", flags: 64 } });
}

// ── Modal pages ───────────────────────────────────────────────────────────────
function buildModal(pageIdx) {
  const page = PAGES[pageIdx];
  return {
    type: 9, // MODAL
    data: {
      custom_id: `apply_page_${pageIdx}`,
      title: `NTMO Application — ${page.title}`,
      components: page.questions.map(q => ({
        type: 1, // action row (one per input)
        components: [{
          type: 4, // text input
          custom_id: q.id,
          label: q.label,
          style: q.style,
          required: true,
          max_length: q.max,
          ...(q.placeholder ? { placeholder: q.placeholder } : {}),
        }],
      })),
    },
  };
}

// ── Modal submissions ─────────────────────────────────────────────────────────
async function handleModalSubmit(interaction, res) {
  const pageIdx = Number(interaction.data.custom_id.split("_").pop());
  const newAnswers = extractAnswers(interaction);

  // Answers from earlier pages ride along on the ephemeral message the
  // Continue button lived on — merge them with this page's answers.
  const priorFields = interaction.message?.embeds?.[0]?.fields ?? [];
  const fields = [...priorFields, ...newAnswers];

  const isLastPage = pageIdx === PAGES.length - 1;

  if (!isLastPage) {
    // Show running summary + Continue button for the next page
    const nextPage = pageIdx + 1;
    return res.json({
      type: 4,
      data: {
        flags: 64, // ephemeral — only the applicant sees this
        embeds: [{
          title: `Application progress — part ${nextPage} of ${PAGES.length} saved ✅`,
          description: `Click **Continue** to fill out **${PAGES[nextPage].title}**.`,
          color: 0x5865f2,
          fields,
        }],
        components: [{
          type: 1,
          components: [{
            type: 2, style: 1,
            label: `Continue (${nextPage + 1}/${PAGES.length})`,
            custom_id: `apply_continue_${nextPage}`,
          }],
        }],
      },
    });
  }

  // ── Final page submitted → create the ticket channel ──────────────────────
  const applicant = interaction.member?.user ?? interaction.user;
  const charName = fields.find(f => f.name === "Character Name")?.value ?? applicant.username;
  const channel = await createTicketChannel(interaction.guild_id, applicant.id, charName);

  // Summary embed + officer verdict buttons + gear screenshot prompt
  await discord(`/channels/${channel.id}/messages`, "POST", {
    content: `<@${applicant.id}> — thanks for applying to **Next Topic Move On**! ` +
             `Please **drop a screenshot of your gear** below 👇 and an officer will be with you shortly.`,
    embeds: [{
      title: `📝 Roster Application — ${charName}`,
      description: `Submitted by <@${applicant.id}> (\`${applicant.username}\`)`,
      color: 0xf0b232,
      fields,
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: "✅ Approve", custom_id: `app_approve_${applicant.id}` },
        { type: 2, style: 4, label: "❌ Deny",    custom_id: `app_deny_${applicant.id}` },
      ],
    }],
  });

  return res.json({
    type: 4,
    data: {
      flags: 64,
      content: `🎉 Application submitted! Head over to <#${channel.id}> to drop your gear screenshot and chat with the officers.`,
    },
  });
}

function extractAnswers(interaction) {
  const pageIdx = Number(interaction.data.custom_id.split("_").pop());
  const byId = Object.fromEntries(
    interaction.data.components.flatMap(row => row.components).map(c => [c.custom_id, c.value])
  );
  return PAGES[pageIdx].questions.map(q => ({
    name: q.label,
    value: (byId[q.id] || "—").slice(0, 1024),
  }));
}

// ── Ticket channel ────────────────────────────────────────────────────────────
async function createTicketChannel(guildId, applicantId, charName) {
  const slug = charName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "applicant";

  const overwrites = [
    // @everyone (role id === guild id) — hide the channel
    { id: guildId, type: 0, deny: VIEW_CHANNEL.toString() },
    // GOAT officers
    { id: process.env.GOAT_ROLE_ID, type: 0, allow: TICKET_PERMS },
    // The applicant
    { id: applicantId, type: 1, allow: TICKET_PERMS },
  ];

  return discord(`/guilds/${guildId}/channels`, "POST", {
    name: `app-${slug}`,
    type: 0, // text channel
    topic: `Roster application — <@${applicantId}>`,
    ...(process.env.TICKET_CATEGORY_ID ? { parent_id: process.env.TICKET_CATEGORY_ID } : {}),
    permission_overwrites: overwrites,
  });
}

// ── Approve / Deny ────────────────────────────────────────────────────────────
async function verdict(interaction, res, action, applicantId) {
  const approved = action === "approve";
  const officer = interaction.member?.user ?? interaction.user;

  // Announce the verdict in the ticket channel
  await discord(`/channels/${interaction.channel_id}/messages`, "POST", {
    content: approved
      ? `✅ **Application approved** by <@${officer.id}>! Welcome to NTMO, <@${applicantId}> — ` +
        `an officer will follow up with a guild invite and your team assignment.`
      : `❌ **Application denied** by <@${officer.id}>. Thanks for your interest, <@${applicantId}> — ` +
        `best of luck out there.`,
  });

  // Rename the channel to reflect the outcome (best-effort — heavily rate
  // limited by Discord at 2 renames / 10 min, fine for a one-time action)
  const newName = interaction.channel?.name?.replace(/^app-/, approved ? "approved-" : "denied-");
  if (newName) {
    await discord(`/channels/${interaction.channel_id}`, "PATCH", { name: newName }).catch(() => {});
  }

  // Swap the buttons on the summary message: disabled verdict + Delete Ticket
  return res.json({
    type: 7, // UPDATE_MESSAGE — edits the message the button was on
    data: {
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: approved ? 3 : 4,
            label: approved ? "✅ Approved" : "❌ Denied",
            custom_id: "app_verdict_done",
            disabled: true,
          },
          { type: 2, style: 2, label: "🗑️ Delete Ticket", custom_id: "app_delete" },
        ],
      }],
    },
  });
}

// ── Discord REST helper ───────────────────────────────────────────────────────
async function discord(path, method, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Discord API ${method} ${path} → ${r.status}: ${text}`);
  }
  return r.status === 204 ? null : r.json();
}

// ── Signature verification (Ed25519, required by Discord) ────────────────────
function verifySignature(req, rawBody) {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (!signature || !timestamp) return false;

  try {
    // Wrap Discord's raw 32-byte public key in a DER/SPKI header so Node's
    // crypto can consume it without any external dependency.
    const der = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex"),
    ]);
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
