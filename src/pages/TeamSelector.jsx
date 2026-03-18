import { useNavigate } from "react-router-dom";
import { surface, border, text, accent, intent, font, fontSize, fontWeight, radius, space, btnStyle } from "../shared/theme";
import { RAID_TEAMS } from "../shared/constants";
import { ToastContainer } from "../shared/components";

export default function TeamSelector() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh", background: surface.base,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: font.sans, padding: space[6],
    }}>
      <ToastContainer />

      {/* Logo mark */}
      <div style={{ marginBottom: space[6], textAlign: "center" }}>
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

      {/* Team cards */}
      <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 600 }}>
        {RAID_TEAMS.map(team => (
          <button
            key={team.id}
            onClick={() => navigate(`/${team.id}`)}
            style={{
              flex: "1 1 240px", minWidth: 220, maxWidth: 280,
              background: surface.panel, border: `1px solid ${border.subtle}`,
              borderRadius: radius.lg, padding: space[6],
              cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
              display: "flex", flexDirection: "column", gap: space[2],
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
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary }}>{team.name}</div>
            <div style={{ fontSize: fontSize.sm, color: text.muted }}>{team.night} raids</div>
            <div style={{ display: "flex", gap: space[1], marginTop: space[2] }}>
              {["Karazhan", "25-Man", "History"].map(m => (
                <span key={m} style={{
                  fontSize: fontSize.xs, color: text.muted,
                  background: surface.base, border: `1px solid ${border.subtle}`,
                  borderRadius: radius.sm, padding: "1px 6px",
                }}>{m}</span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: space[8], fontSize: fontSize.xs, color: text.disabled, fontFamily: font.sans }}>
        Raid Assignments Platform · v2.0
      </div>
    </div>
  );
}
