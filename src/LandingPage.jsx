import { useNavigate } from "react-router-dom";
import { FontImport } from "./components";
import teamDickImg  from "./teamdick.png";
import teamBallsImg from "./teamballs.png";

const TEAMS = [
  {
    id:     "team-dick",
    name:   "TEAM DICK",
    day:    "Tuesday",
    color:  "#c8a84b",
    border: "#c8a84b66",
    glow:   "#c8a84b33",
    image:  teamDickImg,
    path:   "/team-dick",
  },
  {
    id:     "team-balls",
    name:   "TEAM BALLS",
    day:    "Thursday",
    color:  "#60a5fa",
    border: "#60a5fa66",
    glow:   "#60a5fa33",
    image:  teamBallsImg,
    path:   "/team-balls",
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
              position: "relative",
              backgroundImage: `url(${team.image})`,
              backgroundSize: "cover",
              backgroundPosition: "top center",
              border: `2px solid ${team.border}`,
              borderRadius: 12, padding: 0,
              cursor: "pointer", textAlign: "center",
              transition: "all 0.2s",
              width: 320, height: 230,
              overflow: "hidden",
              boxShadow: "0 4px 24px #00000088",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.border = `2px solid ${team.color}`;
              e.currentTarget.style.boxShadow = `0 0 40px ${team.glow}, 0 4px 24px #00000088`;
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.border = `2px solid ${team.border}`;
              e.currentTarget.style.boxShadow = "0 4px 24px #00000088";
              e.currentTarget.style.transform = "translateY(0) scale(1)";
            }}
          >
            {/* Dark overlay at bottom for the day label */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(transparent, #000000ee)",
              padding: "32px 16px 14px",
            }}>
              <div style={{
                fontSize: 13, color: team.color,
                letterSpacing: "0.25em", fontFamily: "'Cinzel', serif",
                fontWeight: 700, textShadow: `0 0 12px ${team.color}, 0 2px 4px #000`,
              }}>
                {team.day.toUpperCase()} RAID
              </div>
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
              background: "#0d0d1a",
              border: `1px solid ${team.color}55`,
              borderRadius: 6, color: team.color + "99", cursor: "pointer",
              padding: "8px 20px", fontSize: 11,
              fontFamily: "'Cinzel', serif", letterSpacing: "0.1em",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color=team.color; e.currentTarget.style.borderColor=team.color; }}
            onMouseLeave={e => { e.currentTarget.style.color=team.color+"99"; e.currentTarget.style.borderColor=team.color+"55"; }}
          >
            {team.name} Admin
          </button>
        ))}
      </div>
    </div>
  );
}
