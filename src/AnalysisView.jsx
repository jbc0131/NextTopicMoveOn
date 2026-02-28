import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSnapshots, isFirebaseConfigured } from "./firebase";
import { FontImport } from "./components";
import teamDickImg  from "./teamdick.png";
import teamBallsImg from "./teamballs.png";

const FIREBASE_OK = isFirebaseConfigured();

const TEAM_IMAGES = {
  "team-dick":  teamDickImg,
  "team-balls": teamBallsImg,
};

function toEmbedUrl(url) {
  if (!url) return null;
  if (!url.includes("docs.google.com/spreadsheets")) return null;
  const base = url.replace(/\/(edit|view|htmlview|pub)(\?.*)?$/, "/htmlview");
  return `${base}?rm=minimal#gid=548293748`;
}

export default function AnalysisView({ teamId, teamName }) {
  const navigate = useNavigate();
  const [snapshots,    setSnapshots]    = useState([]);
  const [selectedSnap, setSelectedSnap] = useState(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!FIREBASE_OK) { setLoading(false); return; }
    fetchSnapshots(teamId)
      .then(snaps => {
        const locked = snaps.filter(s => s.locked);
        setSnapshots(locked);
        if (locked.length) setSelectedSnap(locked[0]);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [teamId]);

  const embedUrl = toEmbedUrl(selectedSnap?.sheetUrl);

  const headerBtn = {
    background: "#12121e", border: "1px solid #2a2a40", borderRadius: 4,
    color: "#888", cursor: "pointer", padding: "4px 10px",
    fontSize: 9, fontFamily: "'Cinzel', serif", letterSpacing: "0.06em",
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#08081a" }}>
      <FontImport />

      {/* Header */}
      <div style={{
        background: "#06060f",
        borderBottom: "1px solid #1a1a2a",
        height: 110, display: "flex", alignItems: "center", padding: "0 16px", gap: 14, flexShrink: 0,
      }}>
        {/* Team logo — clickable */}
        <img
          src={TEAM_IMAGES[teamId]}
          alt={teamName}
          onClick={() => navigate(`/${teamId}`)}
          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0, cursor: "pointer" }}
        />

        <div>
          <div style={{ fontSize: 13, color: "#c8a84b", fontFamily: "'Cinzel Decorative', serif" }}>
            📊 ROLE PERFORMANCE BREAKDOWN
          </div>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.1em", marginTop: 3, fontFamily: "'Cinzel', serif" }}>
            {teamName}
          </div>
        </div>

        {snapshots.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
            <span style={{ fontSize: 9, color: "#666", fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>WEEK</span>
            <select
              value={selectedSnap?.id || ""}
              onChange={e => setSelectedSnap(snapshots.find(s => s.id === e.target.value) || null)}
              style={{ background: "#12121e", border: "1px solid #2a2a40", borderRadius: 4, color: "#c8a84b", padding: "4px 10px", fontSize: 10, fontFamily: "'Cinzel', serif", cursor: "pointer", outline: "none" }}
            >
              {snapshots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.raidDate || new Date(s.savedAt).toLocaleDateString()}{s.raidLeader ? ` · ${s.raidLeader}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedSnap?.sheetUrl && (
          <a href={selectedSnap.sheetUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 9, color: "#60a5fa", fontFamily: "'Cinzel', serif", textDecoration: "none", marginLeft: 4 }}>
            ↗ Open in Google Sheets
          </a>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => navigate(`/${teamId}`)} style={headerBtn}>← Public</button>
          <button onClick={() => navigate(`/${teamId}/admin`)} style={headerBtn}>Admin</button>
        </div>
      </div>

      {/* States */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#555", fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em" }}>LOADING…</span>
        </div>
      )}

      {!loading && snapshots.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>🔒</div>
          <div style={{ fontSize: 13, color: "#666", fontFamily: "'Cinzel', serif" }}>No locked raid weeks found</div>
          <div style={{ fontSize: 10, color: "#444", fontFamily: "'Cinzel', serif", textAlign: "center", maxWidth: 340 }}>
            Lock a raid week in the admin view to enable analysis.
          </div>
          <button onClick={() => navigate(`/${teamId}/admin`)}
            style={{ ...headerBtn, color: "#c8a84b", border: "1px solid #c8a84b44", marginTop: 8, padding: "6px 16px" }}>
            → Go to Admin
          </button>
        </div>
      )}

      {!loading && snapshots.length > 0 && !embedUrl && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div style={{ fontSize: 13, color: "#666", fontFamily: "'Cinzel', serif" }}>No sheet linked for this week</div>
          <div style={{ fontSize: 10, color: "#444", fontFamily: "'Cinzel', serif", textAlign: "center", maxWidth: 380 }}>
            To add one: go to Admin, view this locked week, and paste a Google Sheet URL into the second field before re-locking — or ask an admin to update it.
          </div>
          <button onClick={() => navigate(`/${teamId}/admin`)}
            style={{ ...headerBtn, color: "#c8a84b", border: "1px solid #c8a84b44", marginTop: 8, padding: "6px 16px" }}>
            → Go to Admin
          </button>
        </div>
      )}

      {!loading && embedUrl && (
        <iframe
          key={embedUrl}
          src={embedUrl}
          style={{ flex: 1, border: "none", width: "100%" }}
          title="RPB Analysis Sheet"
          allowFullScreen
        />
      )}
    </div>
  );
}
