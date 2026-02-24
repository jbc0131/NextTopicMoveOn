import { useNavigate } from "react-router-dom";
import { FontImport } from "./components";

const TEAMS = [
  {
    id:       "team-dick",
    name:     "TEAM DICK",
    day:      "Tuesday",
    icon:     "⚔",
    color:    "#c8a84b",
    bg:       "#1a1000",
    border:   "#c8a84b44",
    glow:     "#c8a84b22",
    path:     "/team-dick",
  },
  {
    id:       "team-balls",
    name:     "TEAM BALLS",
    day:      "Thursday",
    icon:     "🔥",
    color:    "#60a5fa",
    bg:       "#001020",
    border:   "#60a5fa44",
    glow:     "#60a5fa22",
    path:     "/team-balls",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh", background: "#06060f",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Cinzel', serif", padding: "24px",
    }}>
      <FontImport />

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontSize: 28, color: "#c8a84b",
          fontFamily: "'Cinzel Decorative', serif",
          letterSpacing: "0.06em", marginBottom: 8,
        }}>
          ⚔ NEXT TOPIC MOVE ON
        </div>
        <div style={{ fontSize: 13, color: "#444", letterSpacing: "0.2em" }}>
          DREAMSCYTHE  ·  SELECT YOUR RAID TEAM
        </div>
      </div>

      {/* Team cards */}
      <div style={{
        display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center",
      }}>
        {TEAMS.map(team => (
          <button
            key={team.id}
            onClick={() => navigate(team.path)}
            style={{
              background: team.bg,
              border: `1px solid ${team.border}`,
              borderRadius: 12, padding: "40px 52px",
              cursor: "pointer", textAlign: "center",
              transition: "all 0.2s",
              minWidth: 240,
              boxShadow: `0 0 0 transparent`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.border = `1px solid ${team.color}`;
              e.currentTarget.style.boxShadow = `0 0 32px ${team.glow}`;
              e.currentTarget.style.transform = "translateY(-3px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.border = `1px solid ${team.border}`;
              e.currentTarget.style.boxShadow = "0 0 0 transparent";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>{team.icon}</div>
            <div style={{
              fontSize: 22, color: team.color,
              fontFamily: "'Cinzel Decorative', serif",
              letterSpacing: "0.04em", marginBottom: 10,
            }}>
              {team.name}
            </div>
            <div style={{
              fontSize: 11, color: team.color + "88",
              letterSpacing: "0.18em",
            }}>
              {team.day.toUpperCase()} RAID
            </div>
          </button>
        ))}
      </div>

      {/* Subtle admin links */}
      <div style={{
        marginTop: 64, display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center",
      }}>
        {TEAMS.map(team => (
          <button
            key={team.id}
            onClick={() => navigate(`${team.path}/admin`)}
            style={{
              background: "none", border: "1px solid #1a1a1a",
              borderRadius: 4, color: "#2a2a2a", cursor: "pointer",
              padding: "4px 14px", fontSize: 10,
              fontFamily: "'Cinzel', serif", letterSpacing: "0.08em",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color="#555"; e.currentTarget.style.borderColor="#555"; }}
            onMouseLeave={e => { e.currentTarget.style.color="#2a2a2a"; e.currentTarget.style.borderColor="#1a1a1a"; }}
          >
            {team.name} Admin
          </button>
        ))}
      </div>
    </div>
  );
}
