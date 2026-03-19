import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLoginUrl, useAuth } from "../../shared/auth";
import {
  fetchRpbRaidBundle,
  fetchRpbRaidList,
  saveRpbRaidImport,
} from "../../shared/firebase";
import {
  surface, border, text, accent, intent, font, fontSize, fontWeight, radius, space, btnStyle, inputStyle, panelStyle,
} from "../../shared/theme";
import { LoadingSpinner, ToastContainer, toast } from "../../shared/components";

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "https://nexttopicmoveon.com";
  }
  return "";
}

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDuration(ms) {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function DiscordLoginGate() {
  return (
    <div style={{ minHeight: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.sans }}>
      <div style={{
        ...panelStyle,
        width: 360,
        maxWidth: "90vw",
        padding: space[6],
        display: "flex",
        flexDirection: "column",
        gap: space[3],
      }}>
        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: text.primary }}>RPB</div>
        <div style={{ fontSize: fontSize.base, color: text.secondary, lineHeight: 1.5 }}>
          Sign in with Discord to access the RPB workspace.
        </div>
        <a
          href={getLoginUrl("/rpb")}
          style={{
            ...btnStyle("primary"),
            width: "100%",
            height: 40,
            justifyContent: "center",
            textDecoration: "none",
            background: "#5865F2",
            borderColor: "#4752C4",
            color: "#fff",
          }}
        >
          Sign in with Discord
        </a>
      </div>
    </div>
  );
}

export default function RpbPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { raidId } = useParams();

  const [reportUrl, setReportUrl] = useState("");
  const [raids, setRaids] = useState([]);
  const [selectedRaid, setSelectedRaid] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRaid, setLoadingRaid] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRaids() {
      setLoadingList(true);
      try {
        const nextRaids = await fetchRpbRaidList();
        if (!cancelled) {
          setRaids(nextRaids);
          if (!raidId && nextRaids[0]?.id) {
            navigate(`/rpb/${nextRaids[0].id}`, { replace: true });
          }
        }
      } catch (error) {
        if (!cancelled) toast({ message: `Failed to load saved raids: ${error.message}`, type: "danger" });
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    loadRaids();
    return () => { cancelled = true; };
  }, [navigate, raidId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaid() {
      if (!raidId) {
        setSelectedRaid(null);
        setSelectedPlayerId("");
        return;
      }

      setLoadingRaid(true);
      try {
        const raid = await fetchRpbRaidBundle(raidId);
        if (!cancelled) {
          setSelectedRaid(raid);
          setSelectedPlayerId(raid?.players?.[0]?.id || "");
        }
      } catch (error) {
        if (!cancelled) toast({ message: `Failed to load raid: ${error.message}`, type: "danger" });
      } finally {
        if (!cancelled) setLoadingRaid(false);
      }
    }

    loadRaid();
    return () => { cancelled = true; };
  }, [raidId]);

  const selectedPlayer = useMemo(() => {
    return selectedRaid?.players?.find(player => String(player.id) === String(selectedPlayerId)) || null;
  }, [selectedRaid, selectedPlayerId]);

  async function handleImport(event) {
    event.preventDefault();
    if (!reportUrl.trim()) {
      toast({ message: "Enter a Warcraft Logs report URL or report ID.", type: "warning" });
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(`${getApiBase()}/api/rpb-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportUrl }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");

      const savedRaidId = await saveRpbRaidImport(data);
      const nextRaids = await fetchRpbRaidList();
      setRaids(nextRaids);
      setReportUrl("");
      toast({ message: `Imported ${data.title}`, type: "success" });
      navigate(`/rpb/${savedRaidId}`);
    } catch (error) {
      toast({ message: `Import failed: ${error.message}`, type: "danger", duration: 5000 });
    } finally {
      setImporting(false);
    }
  }

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", background: surface.base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (!auth.fallback && !auth.authenticated) {
    return <DiscordLoginGate />;
  }

  return (
    <div style={{ minHeight: "100vh", background: surface.base, color: text.primary, fontFamily: font.sans }}>
      <ToastContainer />

      <div style={{
        borderBottom: `1px solid ${border.subtle}`,
        background: surface.panel,
        padding: `${space[4]}px ${space[6]}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space[4],
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold }}>RPB Workspace</div>
          <div style={{ fontSize: fontSize.sm, color: text.muted }}>
            Import Warcraft Logs reports, persist them to Firestore, and browse raid/player data.
          </div>
        </div>

        <form onSubmit={handleImport} style={{ display: "flex", gap: space[2], flex: "1 1 440px", maxWidth: 680 }}>
          <input
            value={reportUrl}
            onChange={event => setReportUrl(event.target.value)}
            placeholder="Paste a Warcraft Logs report URL or report ID"
            style={{ ...inputStyle, flex: 1, height: 36 }}
          />
          <button type="submit" disabled={importing} style={{ ...btnStyle("primary", importing), height: 36, opacity: importing ? 0.7 : 1 }}>
            {importing ? <LoadingSpinner size={14} /> : "Import"}
          </button>
        </form>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "320px minmax(0, 1fr)",
        gap: space[4],
        padding: space[4],
      }}>
        <div style={{ ...panelStyle, minHeight: 400 }}>
          <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}` }}>
            <div style={{ fontSize: fontSize.sm, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Saved Raids
            </div>
          </div>

          <div style={{ padding: space[2], display: "flex", flexDirection: "column", gap: space[2] }}>
            {loadingList && (
              <div style={{ padding: space[4], display: "flex", justifyContent: "center" }}>
                <LoadingSpinner size={20} />
              </div>
            )}

            {!loadingList && raids.length === 0 && (
              <div style={{ padding: space[4], color: text.muted, fontSize: fontSize.sm }}>
                No persisted raids yet. Import your first report to create one.
              </div>
            )}

            {raids.map(raid => {
              const active = raid.id === raidId;
              return (
                <button
                  key={raid.id}
                  onClick={() => navigate(`/rpb/${raid.id}`)}
                  style={{
                    background: active ? `${accent.blue}18` : "transparent",
                    border: `1px solid ${active ? accent.blue : border.subtle}`,
                    borderRadius: radius.base,
                    color: text.primary,
                    textAlign: "left",
                    padding: space[3],
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>{raid.title || raid.reportId}</div>
                  <div style={{ fontSize: fontSize.sm, color: text.secondary }}>{raid.zone || "Unknown Zone"}</div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted }}>
                    {raid.playerCount || 0} players • {raid.fightCount || 0} fights
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: text.disabled }}>
                    {formatDate(raid.importedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
          {loadingRaid && (
            <div style={{ ...panelStyle, padding: space[6], display: "flex", justifyContent: "center" }}>
              <LoadingSpinner size={24} />
            </div>
          )}

          {!loadingRaid && !selectedRaid && (
            <div style={{ ...panelStyle, padding: space[6], color: text.muted }}>
              Choose a saved raid or import a new report to begin.
            </div>
          )}

          {!loadingRaid && selectedRaid && (
            <>
              <div style={{ ...panelStyle, padding: space[4], display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: space[3] }}>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Report</div>
                  <div style={{ marginTop: 6, fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>{selectedRaid.title}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Zone</div>
                  <div style={{ marginTop: 6 }}>{selectedRaid.zone || "Unknown"}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Imported</div>
                  <div style={{ marginTop: 6 }}>{formatDate(selectedRaid.importedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Counts</div>
                  <div style={{ marginTop: 6 }}>{selectedRaid.players.length} players • {selectedRaid.fights.length} fights</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.8fr)", gap: space[4] }}>
                <div style={{ display: "flex", flexDirection: "column", gap: space[4], minWidth: 0 }}>
                  <div style={{ ...panelStyle }}>
                    <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Fights
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["Fight", "Result", "Duration"].map(header => (
                              <th key={header} style={{ textAlign: "left", padding: space[3], fontSize: fontSize.xs, color: text.muted, borderBottom: `1px solid ${border.subtle}` }}>
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRaid.fights.map(fight => (
                            <tr key={fight.id}>
                              <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}` }}>{fight.name}</td>
                              <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}`, color: fight.kill ? intent.success : intent.warning }}>
                                {fight.kill ? "Kill" : "Wipe"}
                              </td>
                              <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}`, color: text.secondary }}>
                                {formatDuration(fight.durationMs)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ ...panelStyle }}>
                    <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Players
                    </div>
                    <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["Name", "Class", "Deaths", "Tracked Casts", "Friendly Fire"].map(header => (
                              <th key={header} style={{ textAlign: "left", padding: space[3], fontSize: fontSize.xs, color: text.muted, borderBottom: `1px solid ${border.subtle}` }}>
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRaid.players.map(player => {
                            const active = String(player.id) === String(selectedPlayerId);
                            return (
                              <tr
                                key={player.id}
                                onClick={() => setSelectedPlayerId(player.id)}
                                style={{ background: active ? `${accent.blue}14` : "transparent", cursor: "pointer" }}
                              >
                                <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}` }}>{player.name}</td>
                                <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}`, color: text.secondary }}>{player.type}</td>
                                <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}` }}>{player.deaths}</td>
                                <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}` }}>{player.trackedCastCount}</td>
                                <td style={{ padding: space[3], borderBottom: `1px solid ${border.subtle}` }}>{player.hostilePlayerDamage}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div style={{ ...panelStyle, minWidth: 0 }}>
                  <div style={{ padding: space[4], borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.sm, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Player Detail
                  </div>

                  {!selectedPlayer && (
                    <div style={{ padding: space[4], color: text.muted }}>
                      Select a player to inspect their persisted raid record.
                    </div>
                  )}

                  {selectedPlayer && (
                    <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[4] }}>
                      <div>
                        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold }}>{selectedPlayer.name}</div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginTop: 4 }}>{selectedPlayer.type}</div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space[3] }}>
                        <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[3] }}>
                          <div style={{ fontSize: fontSize.xs, color: text.muted }}>Deaths</div>
                          <div style={{ marginTop: 6, fontSize: fontSize.lg }}>{selectedPlayer.deaths}</div>
                        </div>
                        <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[3] }}>
                          <div style={{ fontSize: fontSize.xs, color: text.muted }}>Tracked Casts</div>
                          <div style={{ marginTop: 6, fontSize: fontSize.lg }}>{selectedPlayer.trackedCastCount}</div>
                        </div>
                        <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[3] }}>
                          <div style={{ fontSize: fontSize.xs, color: text.muted }}>Friendly Fire</div>
                          <div style={{ marginTop: 6, fontSize: fontSize.lg }}>{selectedPlayer.hostilePlayerDamage}</div>
                        </div>
                        <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[3] }}>
                          <div style={{ fontSize: fontSize.xs, color: text.muted }}>Active Time</div>
                          <div style={{ marginTop: 6, fontSize: fontSize.lg }}>{formatDuration(selectedPlayer.activeTimeMs)}</div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>Persisted summary payload</div>
                        <pre style={{
                          margin: 0,
                          padding: space[3],
                          background: surface.base,
                          border: `1px solid ${border.subtle}`,
                          borderRadius: radius.base,
                          color: text.secondary,
                          fontFamily: font.mono,
                          fontSize: 12,
                          lineHeight: 1.5,
                          overflow: "auto",
                          maxHeight: 360,
                        }}>
                          {JSON.stringify(selectedPlayer.summary || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
