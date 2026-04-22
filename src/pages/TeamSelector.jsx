import { useNavigate } from "react-router-dom";
import { surface, border, text, accent, font, fontSize, fontWeight, radius, space, btnStyle } from "../shared/theme";
import { RAID_TEAMS } from "../shared/constants";
import { ToastContainer, LoadingSpinner } from "../shared/components";
import { useAuth, getLoginUrl } from "../shared/auth";

const RAID_MODULES = [
  { id: "gruulmag", label: "T4 - Gruul's / Mags" },
  { id: "ssc",      label: "T5 - Serpentshrine Cavern" },
  { id: "tk",       label: "T5 - Tempest Keep" },
];

const TEAM_EMOJI = { "team-dick": "🍆", "team-balls": "🍒" };

function DiscordLoginGate() {
  return (
    <div style={{ height: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.sans }}>
      <div style={{
        background: surface.panel, border: `1px solid ${border.subtle}`,
        borderRadius: "12px", padding: "32px", width: 340, maxWidth: "90vw",
        display: "flex", flexDirection: "column", gap: "12px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "6px", background: accent.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", fontWeight: 600, margin: "0 auto", marginBottom: "12px" }}>N</div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: text.primary }}>Next Topic Move On</div>
          <div style={{ fontSize: "11px", color: text.muted, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>TBC Anniversary · Dreamscythe</div>
        </div>
        <div style={{ fontSize: "13px", color: text.secondary, textAlign: "center", lineHeight: 1.5 }}>
          Sign in with Discord to access the raid platform. You must be a member of the NTMO server.
        </div>
        <a
          href={getLoginUrl("/")}
          style={{
            ...btnStyle("primary"), width: "100%", justifyContent: "center", height: 40,
            textDecoration: "none", display: "flex", alignItems: "center", gap: "8px",
            background: "#5865F2", borderColor: "#4752C4", color: "#fff",
          }}
        >
          <svg width="20" height="15" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9a.2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.7 58.7 0 0070.5 45.7v-.2c1.4-15-2.3-28.1-9.8-39.7a.2.2 0 00-.1 0zM23.7 37.3c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.1 6.3 7-2.8 7-6.3 7zm23.2 0c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.1 6.3 7-2.8 7-6.3 7z" fill="white"/></svg>
          Sign in with Discord
        </a>
      </div>
    </div>
  );
}

export default function TeamSelector() {
  const navigate = useNavigate();
  const auth = useAuth();

  // Loading
  if (auth.loading) {
    return (
      <div style={{ height: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (!auth.authenticated) {
    return <DiscordLoginGate />;
  }

  return (
    <div style={{
      minHeight: "100vh", background: surface.base,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      fontFamily: font.sans, padding: space[6],
    }}>
      <ToastContainer />

      {/* Logo mark */}
      <div style={{ marginTop: space[6], marginBottom: space[6], textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: radius.lg,
          background: accent.blue, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 28, color: "#fff",
          fontWeight: fontWeight.bold, margin: "0 auto", marginBottom: space[3],
        }}>N</div>
        <div style={{ fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: text.primary, letterSpacing: "-0.01em" }}>
          Next Topic Move On
        </div>
        <div style={{ fontSize: fontSize.sm, color: text.muted, marginTop: space[1] }}>
          TBC Anniversary · Dreamscythe · US
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", gap: space[6] }}>
        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "flex-start" }}>
          <SimpleCard
            title="Karazhan"
            subtitle="10-man · Teamless"
            onClick={() => navigate("/kara")}
          />
          {RAID_TEAMS.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onNavigate={navigate}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "flex-start" }}>
          <SimpleCard
            title="Combat Log Analytics"
            subtitle="WCL reports, fight breakdowns"
            onClick={() => navigate("/rpb")}
          />
          <SimpleCard
            title="Professions"
            subtitle="Guild crafter directory"
            external
            onClick={() => window.open("https://professions.nexttopicmoveon.com/", "_blank", "noopener noreferrer")}
          />
        </div>
      </div>

      <div style={{ marginTop: space[8], marginBottom: space[4], fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>
        Raid Assignments Platform · v2.0
      </div>
    </div>
  );
}

function SimpleCard({ title, subtitle, onClick, external }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 240px", minWidth: 220, maxWidth: 320,
        background: surface.panel, border: `1px solid ${border.subtle}`,
        borderRadius: radius.lg, padding: space[5],
        cursor: "pointer", textAlign: "left",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex", flexDirection: "column", gap: space[1],
        fontFamily: font.sans,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accent.blue;
        e.currentTarget.style.background = surface.card;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = border.subtle;
        e.currentTarget.style.background = surface.panel;
      }}
    >
      <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary }}>
        {title}
        {external && <span style={{ fontSize: fontSize.xs, color: text.disabled, marginLeft: 6 }}>↗</span>}
      </div>
      {subtitle && <div style={{ fontSize: fontSize.sm, color: text.muted }}>{subtitle}</div>}
    </button>
  );
}

function TeamCard({ team, onNavigate }) {
  const emoji = TEAM_EMOJI[team.id] || "⚔";
  return (
    <div
      style={{
        flex: "1 1 260px", minWidth: 240, maxWidth: 340,
        background: surface.panel, border: `1px solid ${border.subtle}`,
        borderRadius: radius.lg, padding: space[5],
        display: "flex", flexDirection: "column", gap: space[3],
        fontFamily: font.sans,
      }}
    >
      {/* Team header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
          <span style={{ fontSize: 22 }}>{emoji}</span>
          <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary }}>{team.name}</span>
        </div>
        <div style={{ fontSize: fontSize.sm, color: text.muted, marginTop: 2 }}>{team.night} raids</div>
      </div>

      {/* Sub-cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: space[1] }}>
        {RAID_MODULES.map(mod => (
          <button
            key={mod.id}
            onClick={() => onNavigate(`/${team.id}/${mod.id}`)}
            style={{
              background: surface.base, border: `1px solid ${border.subtle}`,
              borderRadius: radius.base,
              padding: `${space[2]}px ${space[3]}px`,
              cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
              color: text.secondary, fontFamily: font.sans, fontSize: fontSize.sm,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = accent.blue;
              e.currentTarget.style.background = surface.card;
              e.currentTarget.style.color = text.primary;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = border.subtle;
              e.currentTarget.style.background = surface.base;
              e.currentTarget.style.color = text.secondary;
            }}
          >
            <span>{mod.label}</span>
            <span style={{ color: text.disabled, fontSize: fontSize.sm }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
