// KaraAdmin v3 — teamless, no teamId prop
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  surface, border, text, accent, intent, font, fontSize,
  fontWeight, radius, space, btnStyle, inputStyle, layout,
} from "../../shared/theme";
import {
  getRole, getClass, getColor, getSpecDisplay, cycleSpec,
  CLASS_COLORS, CLASS_SPECS, ROLE_COLORS,
  KARA_TUE_TEAMS, KARA_THU_TEAMS, KARA_ALL_ROWS,
} from "../../shared/constants";
import {
  AppShell, ModuleHeader, KaraPlayerBadge,
  EmptyState, ConfirmDialog, toast, SaveStatus,
  LoadingSpinner, ParseScoresPanel,
} from "../../shared/components";
import {
  saveKaraState, fetchKaraState,
  isFirebaseConfigured,
} from "../../shared/firebase";
import { useWarcraftLogs, getScoreForPlayer, getScoreColor } from "../../shared/useWarcraftLogs";
import { saveState, loadState } from "../../shared/constants";

const FIREBASE_OK = isFirebaseConfigured();

// ── Utility ───────────────────────────────────────────────────────────────────
const CLASS_SPEC_MAP = {
  Warrior:  ["Arms","Fury","Protection"],
  Paladin:  ["Holy","Protection1","Retribution"],
  Hunter:   ["Beast Mastery","Marksmanship","Survival"],
  Rogue:    ["Assassination","Combat","Subtlety"],
  Priest:   ["Discipline","Holy1","Shadow"],
  Shaman:   ["Elemental","Enhancement","Restoration"],
  Mage:     ["Arcane","Fire","Frost"],
  Warlock:  ["Affliction","Demonology","Destruction"],
  Druid:    ["Balance","Feral","Restoration1","Guardian"],
};
const SPEC_DISPLAY_MAP = { Protection1: "Protection", Holy1: "Holy", Restoration1: "Restoration" };
const specLabel = s => SPEC_DISPLAY_MAP[s] || s;

// ── Assignment drop row ───────────────────────────────────────────────────────
function KaraDropRow({ rowCfg, assignedIds, allRosters, onDrop, onClear, onSpecCycle, onDragStart, assignments, extraStyle }) {
  const [over, setOver] = useState(false);
  const dropRef = useRef(null);
  const ids   = assignedIds ? (Array.isArray(assignedIds) ? assignedIds : [assignedIds]) : [];
  const slots = ids.map(id => allRosters.find(s => s.id === id)).filter(Boolean);

  return (
    <div
      ref={dropRef}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => { if (!dropRef.current?.contains(e.relatedTarget)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(rowCfg.key); }}
      style={{
        display: "flex", alignItems: "center", gap: space[2],
        padding: `${space[1]}px ${space[3]}px`,
        minHeight: layout.rowHeight,
        background: over ? `${accent.blue}12` : "transparent",
        borderLeft: `2px solid ${over ? accent.blue : border.subtle}`,
        borderBottom: `1px solid ${border.subtle}`,
        transition: "all 0.1s",
        ...extraStyle,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: space[1], alignItems: "center" }}>
        {slots.map(slot => (
          <div key={slot.id} onDoubleClick={() => onClear(rowCfg.key, slot.id)} style={{ cursor: "pointer" }}>
            <KaraPlayerBadge
              slot={slot}
              onSpecCycle={onSpecCycle}
              onDragStart={onDragStart ? (e, s) => onDragStart(e, s, rowCfg.key) : undefined}
            />
          </div>
        ))}
        {over && <span style={{ fontSize: fontSize.xs, color: accent.blue, fontStyle: "italic" }}>drop here</span>}
      </div>
    </div>
  );
}

// ── Night section (3 teams) ───────────────────────────────────────────────────
function NightSection({ night, teams, color, assignments, allRosters, onDrop, onClear, onDragStart, onSpecCycle, onCopyDiscord, discordCopied }) {
  const UTILITY = {
    removeCurse: { label: "Remove Curse", icon: "🧹", specs: new Set(["Balance","Restoration","Feral","Guardian","Arcane","Fire","Frost","Elemental","Enhancement","Restoration1"]) },
    dispelMagic: { label: "Dispel Magic", icon: "✨", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution"]) },
    curePoison:  { label: "Cure Poison",  icon: "🧪", specs: new Set(["Balance","Restoration","Feral","Guardian","Elemental","Enhancement","Restoration1","Holy","Protection1","Retribution"]) },
    cureDisease: { label: "Cure Disease", icon: "💊", specs: new Set(["Holy","Holy1","Discipline","Shadow","Protection1","Retribution","Elemental","Enhancement","Restoration1"]) },
    interrupt:   { label: "Interrupt",    icon: "⚡", specs: new Set(["Arms","Fury","Protection","Assassination","Combat","Subtlety","Enhancement","Retribution","Protection1","Feral","Guardian"]) },
    bloodlust:   { label: "Bloodlust",    icon: "🥁", specs: new Set(["Elemental","Enhancement","Restoration1"]) },
  };

  return (
    <div style={{ marginBottom: space[6] }}>
      {/* Night header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: space[3],
        padding: `${space[2]}px ${space[3]}px`,
        background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.base,
        position: "relative",
      }}>
        <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color, fontFamily: font.sans, letterSpacing: "0.08em" }}>
          {night === "tue" ? "TUESDAY" : "THURSDAY"}
        </span>
        <button
          onClick={onCopyDiscord}
          style={{ ...btnStyle("default"), position: "absolute", right: space[3], fontSize: fontSize.xs }}
        >
          {discordCopied ? "✓ Posted!" : "💬 Post to Discord"}
        </button>
      </div>

      {/* Teams */}
      <div style={{ display: "flex", gap: space[3], alignItems: "flex-start" }}>
        {teams.map((team, i) => {
          const allRows     = [...team.g1, ...team.g2];
          const teamPlayers = allRows
            .flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : [])
            .map(id => allRosters.find(p => p.id === id)).filter(Boolean);
          const tankCount   = teamPlayers.filter(p => getRole(p) === "Tank").length;
          const healerCount = teamPlayers.filter(p => getRole(p) === "Healer").length;
          const firstTank   = teamPlayers.find(p => getRole(p) === "Tank");
          const teamLabel   = firstTank ? `Team ${firstTank.name}` : `Team ${i + 1}`;
          const filledCount = teamPlayers.length;
          const has = {};
          Object.keys(UTILITY).forEach(k => { has[k] = teamPlayers.some(p => UTILITY[k].specs.has(p.specName)); });

          return (
            <div key={i} style={{
              flex: 1, background: surface.panel, border: `1px solid ${color}33`,
              borderRadius: radius.lg, overflow: "hidden",
            }}>
              {/* Team header */}
              <div style={{
                padding: `${space[2]}px ${space[3]}px`,
                borderBottom: `1px solid ${color}22`,
                display: "flex", alignItems: "center", gap: space[2],
                background: `${color}08`,
              }}>
                <span style={{ fontSize: fontSize.sm, color, fontFamily: font.sans, fontWeight: fontWeight.bold }}>{teamLabel.toUpperCase()}</span>
                <span style={{ fontSize: fontSize.xs, color: "#4C90F0", fontFamily: font.sans }}>🛡 {tankCount}</span>
                <span style={{ fontSize: fontSize.xs, color: "#32A467", fontFamily: font.sans }}>💚 {healerCount}</span>
                <span style={{ fontSize: fontSize.xs, color: text.muted, marginLeft: "auto", fontFamily: font.sans }}>{filledCount}/10</span>
              </div>

              {/* Utility tracker */}
              {filledCount > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: `${space[1]}px ${space[2]}px`, borderBottom: `1px solid ${color}11`, background: surface.base }}>
                  {Object.entries(UTILITY).map(([k, u]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: font.sans, padding: "1px 5px", borderRadius: radius.sm,
                      background: has[k] ? `${intent.success}15` : `${intent.danger}15`,
                      border: `1px solid ${has[k] ? intent.success + "33" : intent.danger + "33"}`,
                      color: has[k] ? intent.success : `${intent.danger}88`,
                    }}>
                      {u.icon} {u.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Groups */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {[team.g1, team.g2].map((group, gi) => {
                  const filled = group.filter(r => assignments[r.key]).length;
                  return (
                    <div key={`header-${gi}`} style={{
                      padding: `3px ${space[2]}px`,
                      borderBottom: `1px solid ${color}11`,
                      borderRight: gi === 0 ? `1px solid ${color}18` : "none",
                      display: "flex", justifyContent: "space-between",
                    }}>
                      <span style={{ fontSize: 9, color: `${color}88`, fontFamily: font.sans, letterSpacing: "0.1em" }}>GROUP {gi + 1}</span>
                      <span style={{ fontSize: 9, color: text.muted, fontFamily: font.sans }}>{filled}/5</span>
                    </div>
                  );
                })}
                {team.g1.map((row, idx) => {
                  const g2Row = team.g2[idx];
                  return [row, g2Row].map((r, gi) => (
                    <KaraDropRow
                      key={r.key}
                      rowCfg={r}
                      assignedIds={assignments[r.key]}
                      allRosters={allRosters}
                      onDrop={onDrop}
                      onClear={onClear}
                      onDragStart={onDragStart}
                      onSpecCycle={onSpecCycle}
                      assignments={assignments}
                      extraStyle={gi === 0 ? { borderRight: `1px solid ${color}18` } : undefined}
                    />
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conflict modal ────────────────────────────────────────────────────────────
function ConflictModal({ conflicts, resolved, onChange, onConfirm }) {
  const allFilled = conflicts.every(c => {
    const r = resolved[c.discordId];
    return r?.tueName?.trim() && r?.thuName?.trim();
  });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.lg, padding: space[6], width: 520, maxWidth: "95vw", maxHeight: "80vh", overflowY: "auto", fontFamily: font.sans }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: text.primary, marginBottom: space[2] }}>⚔ Character Conflicts Detected</div>
        <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[4], lineHeight: 1.6 }}>
          These players are signed up on <span style={{ color: intent.success }}>Tuesday</span> and{" "}
          <span style={{ color: accent.blue }}>Thursday</span> on <strong style={{ color: text.primary }}>different characters</strong>.
          Set the WarcraftLogs character name for each night so parse scores work correctly.
        </div>
        {conflicts.map(({ discordId, tueSlot, thuSlot }) => {
          const r = resolved[discordId] || { tueName: tueSlot.name, thuName: thuSlot.name };
          return (
            <div key={discordId} style={{ marginBottom: space[3], padding: space[3], background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base }}>
              <div style={{ fontSize: fontSize.sm, color: text.secondary, marginBottom: space[2] }}>
                🎮 {tueSlot.name} <span style={{ color: text.muted, fontSize: fontSize.xs }}>· {discordId}</span>
              </div>
              <div style={{ display: "flex", gap: space[3] }}>
                {[["tue", tueSlot, intent.success, "TUESDAY"], ["thu", thuSlot, accent.blue, "THURSDAY"]].map(([night, slot, color, label]) => (
                  <div key={night} style={{ flex: 1 }}>
                    <div style={{ fontSize: fontSize.xs, color, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[1] }}>{label}</div>
                    <div style={{ fontSize: fontSize.xs, color: CLASS_COLORS[slot.className] || text.muted, marginBottom: space[2] }}>{slot.specName} {slot.className}</div>
                    <input
                      value={r[night === "tue" ? "tueName" : "thuName"]}
                      onChange={e => onChange(discordId, night === "tue" ? "tueName" : "thuName", e.target.value)}
                      placeholder="WCL character name…"
                      style={{ ...inputStyle, width: "100%", color, borderColor: `${color}44`, fontSize: fontSize.sm }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <button
          onClick={onConfirm}
          disabled={!allFilled}
          style={{ ...btnStyle(allFilled ? "success" : "default"), width: "100%", height: 36, justifyContent: "center", marginTop: space[2] }}
        >
          {allFilled ? "✓ Confirm & Import" : `Fill in all names (${conflicts.filter(c => { const r = resolved[c.discordId]; return r?.tueName?.trim() && r?.thuName?.trim(); }).length}/${conflicts.length} done)`}
        </button>
      </div>
    </div>
  );
}

// ── Manual add player ─────────────────────────────────────────────────────────
function ManualAddPlayer({ onAdd, rosterTue, rosterThu }) {
  const [open,       setOpen]       = useState(false);
  const [name,       setName]       = useState("");
  const [cls,        setCls]        = useState("Warrior");
  const [spec,       setSpec]       = useState("Arms");
  const [linkId,     setLinkId]     = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkFocus,  setLinkFocus]  = useState(false);
  const [error,      setError]      = useState("");
  const linkRef = useRef(null);

  const specs = CLASS_SPECS[cls] || [];
  const handleClass = c => { setCls(c); setSpec(CLASS_SPECS[c][0].specName); };

  // Deduplicated roster for the link dropdown
  const linkOptions = useMemo(() => {
    const seen = new Set();
    return [...(rosterTue || []), ...(rosterThu || [])].filter(p => {
      if (p.manual) return false;
      const key = p._discordId || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rosterTue, rosterThu]);

  const filteredOptions = useMemo(() => {
    if (!linkSearch.trim()) return linkOptions;
    const q = linkSearch.toLowerCase();
    return linkOptions.filter(p => p.name.toLowerCase().includes(q));
  }, [linkOptions, linkSearch]);

  const selectedPlayer = linkId ? linkOptions.find(p => (p._discordId || p.id) === linkId) : null;

  const handleSelectLink = (p) => {
    setLinkId(p._discordId || p.id);
    setLinkSearch(p.name);
    setLinkFocus(false);
  };

  const handleClearLink = () => {
    setLinkId(""); setLinkSearch(""); linkRef.current?.focus();
  };

  const handleAdd = () => {
    if (!name.trim()) { setError("Enter a name"); return; }
    const player = {
      id:        `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name:      name.trim(),
      className: cls,
      specName:  spec,
      color:     CLASS_COLORS[cls] || "#aaa",
      manual:    true,
    };
    if (linkId) player._discordId = linkId;
    onAdd(player);
    setName(""); setCls("Warrior"); setSpec("Arms"); setLinkId(""); setLinkSearch(""); setError(""); setOpen(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      width: "100%", background: "transparent",
      border: `1px dashed ${border.subtle}`, borderRadius: radius.base,
      color: text.muted, padding: `${space[1]}px`, cursor: "pointer",
      fontFamily: font.sans, fontSize: fontSize.xs, marginTop: space[1],
    }}>
      + Add Player Manually
    </button>
  );

  const color = CLASS_COLORS[cls] || "#aaa";
  return (
    <div style={{ background: surface.card, border: `1px solid ${border.subtle}`, borderRadius: radius.base, padding: space[2], marginTop: space[1], display: "flex", flexDirection: "column", gap: space[1] }}>
      <div style={{ fontSize: fontSize.xs, color: text.muted, fontFamily: font.sans, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Add Player</div>
      <input
        autoFocus value={name}
        onChange={e => { setName(e.target.value); setError(""); }}
        onKeyDown={e => e.key === "Enter" && handleAdd()}
        placeholder="Character name"
        style={{ ...inputStyle, width: "100%", fontSize: fontSize.xs }}
      />
      {error && <div style={{ fontSize: 10, color: intent.danger, fontFamily: font.sans }}>{error}</div>}
      <select value={cls} onChange={e => handleClass(e.target.value)} style={{ ...inputStyle, color, fontSize: fontSize.xs, cursor: "pointer" }}>
        {Object.keys(CLASS_SPECS).map(c => (
          <option key={c} value={c} style={{ color: CLASS_COLORS[c] || "#fff", background: surface.base }}>{c}</option>
        ))}
      </select>
      <select value={spec} onChange={e => setSpec(e.target.value)} style={{ ...inputStyle, fontSize: fontSize.xs, cursor: "pointer" }}>
        {specs.map(s => (
          <option key={s.specName} value={s.specName} style={{ background: surface.base }}>
            {s.specName.replace(/\d+$/, "")} ({s.role})
          </option>
        ))}
      </select>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <input
            ref={linkRef}
            value={linkSearch}
            onChange={e => { setLinkSearch(e.target.value); setLinkId(""); }}
            onFocus={() => setLinkFocus(true)}
            onBlur={() => setTimeout(() => setLinkFocus(false), 150)}
            placeholder="Link to Discord (optional)"
            style={{ ...inputStyle, width: "100%", fontSize: fontSize.xs, color: selectedPlayer ? accent.blue : text.primary }}
          />
          {(linkId || linkSearch) && (
            <button onClick={handleClearLink} style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }} title="Clear">×</button>
          )}
        </div>
        {selectedPlayer && (
          <div style={{ fontSize: 9, color: accent.blue, fontFamily: font.sans, marginTop: 2 }}>
            Linked to {selectedPlayer.name}
          </div>
        )}
        {linkFocus && !linkId && filteredOptions.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: surface.panel, border: `1px solid ${border.subtle}`, borderRadius: radius.sm,
            maxHeight: 120, overflowY: "auto", marginTop: 2,
          }}>
            {filteredOptions.map(p => (
              <div
                key={p._discordId || p.id}
                onMouseDown={() => handleSelectLink(p)}
                style={{
                  padding: `3px ${space[2]}px`, cursor: "pointer", fontSize: fontSize.xs,
                  fontFamily: font.sans, color: CLASS_COLORS[getClass(p)] || text.primary,
                  background: "transparent",
                }}
                onMouseEnter={e => e.currentTarget.style.background = surface.overlay}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: space[1] }}>
        <button onClick={handleAdd} style={{ ...btnStyle("success"), flex: 1, fontSize: fontSize.xs, height: 26 }}>Add</button>
        <button onClick={() => { setOpen(false); setError(""); setName(""); setLinkId(""); setLinkSearch(""); }} style={{ ...btnStyle("default"), flex: 1, fontSize: fontSize.xs, height: 26 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Roster sidebar ────────────────────────────────────────────────────────────
function KaraRosterPanel({ karaNight, setKaraNight, rosterTue, rosterThu, assignments, roleFilter, setRoleFilter, onDragStart, onSpecCycle, wclScores, wclLoading, wclError, wclLastFetch, onWclRefetch, onWclNameChange, onAddManual, onRemovePlayer }) {
  const karaKeys       = new Set(KARA_ALL_ROWS.map(r => r.key));
  const activeRoster   = karaNight === "tue" ? rosterTue : rosterThu;
  const karaAssignedIds = new Set(
    Object.entries(assignments).filter(([k]) => karaKeys.has(k)).flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
  );

  const seenNames  = new Set();
  const filtered   = activeRoster.filter(s => {
    if (roleFilter !== "All" && getRole(s) !== roleFilter) return false;
    if (seenNames.has(s.name.toLowerCase())) return false;
    seenNames.add(s.name.toLowerCase());
    return true;
  });

  const unplaced = filtered.filter(s => !karaAssignedIds.has(s.id));
  const placed   = filtered.filter(s =>  karaAssignedIds.has(s.id));
  const sorted   = [...unplaced, ...placed];

  return (
    <div style={{
      width: layout.rosterWidth, flexShrink: 0,
      background: surface.panel, borderRight: `1px solid ${border.subtle}`,
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${border.subtle}`, fontSize: fontSize.xs, color: text.muted, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Kara Roster · {activeRoster.length}
      </div>

      {/* Night toggle */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border.subtle}` }}>
        {[["tue", "Tuesday"], ["thu", "Thursday"]].map(([night, label]) => (
          <button key={night} onClick={() => setKaraNight(night)} style={{
            flex: 1, padding: `${space[1]}px`, fontSize: fontSize.xs, cursor: "pointer",
            border: "none", fontFamily: font.sans,
            background: karaNight === night ? surface.card : "transparent",
            color: karaNight === night ? accent.blue : text.muted,
            borderBottom: karaNight === night ? `2px solid ${accent.blue}` : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      {/* Role filter */}
      <div style={{ display: "flex", gap: 2, padding: space[2], borderBottom: `1px solid ${border.subtle}` }}>
        {["All","Tank","Healer","DPS"].map(r => {
          const rc = r === "Tank" ? ROLE_COLORS.Tank : r === "Healer" ? ROLE_COLORS.Healer : r === "DPS" ? ROLE_COLORS.DPS : null;
          return (
            <button key={r} onClick={() => setRoleFilter(r)} style={{
              flex: 1, padding: "2px 0", fontSize: 9, cursor: "pointer",
              border: "1px solid", borderRadius: radius.sm, fontFamily: font.sans,
              background: roleFilter === r ? (rc?.tag || surface.overlay) : surface.base,
              borderColor: roleFilter === r ? `${text.muted}66` : border.subtle,
              color: roleFilter === r ? text.primary : text.muted,
            }}>{r}</button>
          );
        })}
      </div>

      {/* Players */}
      <div style={{ padding: `${space[1]}px ${space[2]}px`, fontSize: 9, color: accent.blue, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${border.subtle}` }}>
        {filtered.length} players · {karaAssignedIds.size} placed
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: space[2], display: "flex", flexDirection: "column", gap: 3 }}>
        {sorted.map((s, idx) => {
          const isPlaced = karaAssignedIds.has(s.id);
          if (idx === unplaced.length && placed.length > 0) {
            // Insert divider between unplaced and placed
          }
          return (
            <div key={s.id} style={{ position: "relative", opacity: isPlaced ? 0.35 : 1, transition: "opacity 0.15s", display: "flex", alignItems: "center", gap: 2 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <KaraPlayerBadge
                  slot={s}
                  onSpecCycle={isPlaced ? null : onSpecCycle}
                  onDragStart={isPlaced ? null : (e, slot) => onDragStart(e, slot, null)}
                />
              </div>
              {isPlaced ? (
                <span style={{ fontSize: 9, color: accent.blue, fontFamily: font.sans, pointerEvents: "none", flexShrink: 0 }}>✓</span>
              ) : (
                <button
                  onClick={() => onRemovePlayer(s.id)}
                  title={`Remove ${s.name}`}
                  style={{ background: "none", border: "none", color: text.disabled, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = intent.danger}
                  onMouseLeave={e => e.currentTarget.style.color = text.disabled}
                >×</button>
              )}
            </div>
          );
        })}
        <ManualAddPlayer onAdd={onAddManual} rosterTue={rosterTue} rosterThu={rosterThu} />
      </div>
    </div>
  );
}

// ── Main KaraAdmin ────────────────────────────────────────────────────────────
export default function KaraAdmin() {
  const [roster,        setRoster]        = useState([]);
  const [rosterTue,     setRosterTue]     = useState([]);
  const [rosterThu,     setRosterThu]     = useState([]);
  const [assignments,   setAssignments]   = useState({});
  const [specOverrides, setSpecOverrides] = useState({});
  const [raidDateTue,   setRaidDateTue]   = useState("");
  const [raidDateThu,   setRaidDateThu]   = useState("");
  const [karaNight,     setKaraNight]     = useState("tue");
  const [roleFilter,    setRoleFilter]    = useState("All");
  const [dragSlot,      setDragSlot]      = useState(null);
  const [dragSourceKey, setDragSourceKey] = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [jsonErrorTue,  setJsonErrorTue]  = useState("");
  const [jsonErrorThu,  setJsonErrorThu]  = useState("");
  const [saveStatus,    setSaveStatus]    = useState(FIREBASE_OK ? "idle" : "offline");
  const [hasUnsaved,    setHasUnsaved]    = useState(false);
  const [discordCopiedTue, setDiscordCopiedTue] = useState(false);
  const [discordCopiedThu, setDiscordCopiedThu] = useState(false);
  const [parsesOpen,    setParsesOpen]    = useState(false);
  const [pendingConflicts,   setPendingConflicts]   = useState([]);
  const [pendingResolved,    setPendingResolved]    = useState({});
  const [pendingImportQueue, setPendingImportQueue] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDiscordNight, setConfirmDiscordNight] = useState(null);
  const autoSaveTimer  = useRef(null);
  const fileRefTue     = useRef();
  const fileRefThu     = useRef();
  const commitImportRef = useRef(null);

  const { scores: wclScores, loading: wclLoading, error: wclError, lastFetch: wclLastFetch, refetch: wclRefetch } =
    useWarcraftLogs(roster, { teamId: "shared", module: "kara" });

  const handleWclNameChange = useCallback((playerId, newName) => {
    const update = s => s.id !== playerId ? s : { ...s, wclName: newName };
    setRosterTue(prev => prev.map(update));
    setRosterThu(prev => prev.map(update));
    setRoster(prev => prev.map(update));
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      let s = null;
      if (FIREBASE_OK) {
        try { s = await fetchKaraState(); } catch (e) { console.warn(e); }
      }
      if (!s) s = loadState("shared", "kara");
      if (s) {
        if (s.rosterTue)     setRosterTue(s.rosterTue);
        if (s.rosterThu)     setRosterThu(s.rosterThu);
        if (s.assignments)   setAssignments(s.assignments);
        if (s.specOverrides) setSpecOverrides(s.specOverrides);
        if (s.raidDateTue)   setRaidDateTue(s.raidDateTue);
        if (s.raidDateThu)   setRaidDateThu(s.raidDateThu);
        // Rebuild combined roster
        const combined = [...(s.rosterTue || []), ...(s.rosterThu || [])];
        setRoster(combined);
      }
    }
    load();
    document.title = "NTMO · Karazhan Admin";
  }, []);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    setHasUnsaved(true);
    if (!FIREBASE_OK) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
      saveState(state, "shared", "kara");
      try {
        setSaveStatus("saving");
        await saveKaraState(state);
        setSaveStatus("saved");
        setHasUnsaved(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
    }, 4000);
  }, [rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu]);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const state = { rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu };
    saveState(state, "shared", "kara");
    if (!FIREBASE_OK) { setSaveStatus("offline"); return; }
    setSaveStatus("saving");
    try {
      await saveKaraState(state);
      setSaveStatus("saved"); setHasUnsaved(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 4000); }
  }, [rosterTue, rosterThu, assignments, specOverrides, raidDateTue, raidDateThu]);

  // ── Spec cycle ────────────────────────────────────────────────────────────
  const handleSpecCycle = useCallback((playerId) => {
    const update = s => {
      if (s.id !== playerId) return s;
      const { specName: nextSpec, baseClass } = cycleSpec(s);
      return { ...s, specName: nextSpec, className: nextSpec, baseClass };
    };
    setRosterTue(prev => prev.map(update));
    setRosterThu(prev => prev.map(update));
    setRoster(prev => prev.map(update));
    setSpecOverrides(prev => {
      const player = [...rosterTue, ...rosterThu].find(s => s.id === playerId);
      if (!player) return prev;
      const { specName: nextSpec } = cycleSpec(player);
      return { ...prev, [playerId]: nextSpec };
    });
  }, [rosterTue, rosterThu]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportJSON = useCallback((text, night) => {
    try {
      const data = JSON.parse(text);
      if (!data.slots) throw new Error("No 'slots' array found");
      const otherNight = night === "tue" ? "thu" : "tue";
      const otherSlots = roster.filter(p => p.karaNight === otherNight);

      if (otherSlots.length > 0) {
        const normalizedOther = otherSlots.map(p => ({ ...p, id: p._discordId || p.id.replace(/_tue$|_thu$/, "") }));
        const tueSlots = night === "tue" ? data.slots : normalizedOther;
        const thuSlots = night === "thu" ? data.slots : normalizedOther;
        setPendingImportQueue({ tueSlots, thuSlots });
      } else {
        const queue = night === "tue"
          ? { tueSlots: data.slots, thuSlots: [] }
          : { tueSlots: [], thuSlots: data.slots };
        commitImportRef.current(queue, []);
      }
      if (night === "tue") setJsonErrorTue(""); else setJsonErrorThu("");
    } catch (e) {
      if (night === "tue") setJsonErrorTue(e.message); else setJsonErrorThu(e.message);
    }
  }, [roster]);

  const commitImport = useCallback((queue, resolvedConflicts) => {
    const { tueSlots, thuSlots } = queue;
    const conflictIds = new Set(resolvedConflicts.map(c => c.discordId));

    const buildSlots = (slots, night) => slots.flatMap(slot => {
      if (conflictIds.has(slot.id)) {
        const resolved     = resolvedConflicts.find(c => c.discordId === slot.id);
        const resolvedName = night === "tue" ? resolved?.resolvedNames?.tueName : resolved?.resolvedNames?.thuName;
        return [{ ...slot, id: `${slot.id}_${night}`, karaNight: night, name: resolvedName || slot.name, wclName: resolvedName || undefined, _discordId: slot.id }];
      }
      return [{ ...slot, karaNight: night }];
    });

    const finalTue = buildSlots(tueSlots, "tue");
    const finalThu = buildSlots(thuSlots, "thu");

    setRoster(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      const nightsBeingImported = new Set();
      if (tueSlots.length) nightsBeingImported.add("tue");
      if (thuSlots.length) nightsBeingImported.add("thu");
      for (const [id, p] of byId) {
        if (nightsBeingImported.has(p.karaNight) || p.manual || !p.karaNight) byId.delete(id);
      }
      [...finalTue, ...finalThu].forEach(slot => {
        const existing = byId.get(slot.id);
        byId.set(slot.id, { ...(existing || {}), ...slot, wclName: slot.wclName ?? existing?.wclName });
      });
      const merged  = [...byId.values()];
      const validIds = new Set(merged.map(p => p.id));
      setRosterTue(merged.filter(p => p.karaNight === "tue"));
      setRosterThu(merged.filter(p => p.karaNight === "thu"));
      setAssignments(prev => {
        const next = {};
        for (const [key, ids] of Object.entries(prev)) {
          const arr  = Array.isArray(ids) ? ids : [ids];
          const kept = arr.filter(id => validIds.has(id));
          if (kept.length) next[key] = kept.length === 1 ? kept[0] : kept;
        }
        return next;
      });
      return merged;
    });
    setPendingImportQueue(null); setPendingConflicts([]); setPendingResolved({});
  }, [roster]);

  commitImportRef.current = commitImport;

  useEffect(() => {
    if (!pendingImportQueue) return;
    const { tueSlots, thuSlots } = pendingImportQueue;
    if (!tueSlots.length || !thuSlots.length) return;
    const thuById   = new Map(thuSlots.map(s => [s.id, s]));
    const conflicts = tueSlots.reduce((acc, tueSlot) => {
      const thuSlot = thuById.get(tueSlot.id);
      if (thuSlot && thuSlot.className !== tueSlot.className) acc.push({ discordId: tueSlot.id, tueSlot, thuSlot });
      return acc;
    }, []);
    if (conflicts.length === 0) {
      commitImport(pendingImportQueue, []);
    } else {
      const initialResolved = {};
      conflicts.forEach(({ discordId, tueSlot, thuSlot }) => {
        const existingTue = roster.find(p => p.id === `${discordId}_tue`);
        const existingThu = roster.find(p => p.id === `${discordId}_thu`);
        initialResolved[discordId] = { tueName: existingTue?.wclName ?? tueSlot.name, thuName: existingThu?.wclName ?? thuSlot.name };
      });
      setPendingConflicts(conflicts); setPendingResolved(initialResolved);
    }
  }, [pendingImportQueue, commitImport, roster]);

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const karaKeys = new Set(KARA_ALL_ROWS.map(r => r.key));

  const handleDragStart = useCallback((e, slot, sourceKey = null) => {
    setDragSlot(slot); setDragSourceKey(sourceKey);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback((key) => {
    if (!dragSlot) return;
    const playerId = dragSlot.id;
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      if (existing.includes(playerId) && dragSourceKey === key) return prev;
      const allRosters = [...rosterTue, ...rosterThu];
      const dragName   = dragSlot.name.toLowerCase();
      // Skip duplicate check when swapping between two assigned slots
      const isSwap = dragSourceKey && dragSourceKey !== key && existing.length > 0;
      if (!isSwap) {
        const alreadyPlaced = Object.entries(prev)
          .filter(([k]) => karaKeys.has(k) && k !== dragSourceKey)
          .flatMap(([, ids]) => Array.isArray(ids) ? ids : [ids])
          .some(id => { const p = allRosters.find(s => s.id === id); return p && p.name.toLowerCase() === dragName; });
        if (alreadyPlaced) { toast({ message: `${dragSlot.name} is already assigned to a Karazhan team`, type: "danger" }); return prev; }
      }
      let next = { ...prev };
      if (dragSourceKey && dragSourceKey !== key) {
        // Swap: move target slot's players into the source slot
        if (isSwap) {
          next[dragSourceKey] = existing;
        } else {
          const srcExisting = next[dragSourceKey] ? (Array.isArray(next[dragSourceKey]) ? next[dragSourceKey] : [next[dragSourceKey]]) : [];
          const srcUpdated  = srcExisting.filter(id => id !== playerId);
          if (srcUpdated.length === 0) delete next[dragSourceKey]; else next[dragSourceKey] = srcUpdated;
        }
      }
      next[key] = [playerId];
      return next;
    });
    setDragSlot(null); setDragSourceKey(null);
  }, [dragSlot, dragSourceKey, rosterTue, rosterThu, karaKeys]);

  const handleClear = useCallback((key, playerId) => {
    setAssignments(prev => {
      const existing = prev[key] ? (Array.isArray(prev[key]) ? prev[key] : [prev[key]]) : [];
      const updated  = existing.filter(id => id !== playerId);
      const n = { ...prev };
      if (updated.length === 0) delete n[key]; else n[key] = updated;
      return n;
    });
  }, []);

  // ── Remove player from roster ─────────────────────────────────────────────
  const handleRemovePlayer = useCallback((playerId) => {
    setRosterTue(prev => prev.filter(s => s.id !== playerId));
    setRosterThu(prev => prev.filter(s => s.id !== playerId));
    setRoster(prev => prev.filter(s => s.id !== playerId));
    setAssignments(prev => {
      const next = {};
      for (const [key, ids] of Object.entries(prev)) {
        const arr = Array.isArray(ids) ? ids : [ids];
        const kept = arr.filter(id => id !== playerId);
        if (kept.length) next[key] = kept.length === 1 ? kept[0] : kept;
      }
      return next;
    });
  }, []);

  // ── Discord post ──────────────────────────────────────────────────────────
  const copyNightDiscord = useCallback(async (night, teams, setCopied) => {
    const allRosters = [...rosterTue, ...rosterThu];
    const nightLabel = night === "tue" ? "Tuesday" : "Thursday";
    const formatPlayer = (p) => {
      const discordId = p._discordId || p.id;
      return (discordId && !discordId.startsWith("manual_")) ? `<@${discordId}>` : p.name;
    };
    const formatGroup = (ids) => ids
      .map(id => allRosters.find(s => s.id === id)).filter(Boolean)
      .map(formatPlayer)
      .join(" ");
    const lines = [`🏰 ${nightLabel} Karazhan Roster`, ""];
    teams.forEach((team, i) => {
      const g1Ids = team.g1.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
      const g2Ids = team.g2.flatMap(r => assignments[r.key] ? (Array.isArray(assignments[r.key]) ? assignments[r.key] : [assignments[r.key]]) : []);
      if (!g1Ids.length && !g2Ids.length) return;
      const teamPlayers = [...g1Ids, ...g2Ids].map(id => allRosters.find(s => s.id === id)).filter(Boolean);
      const firstTank = teamPlayers.find(p => getRole(p) === "Tank");
      const teamName = firstTank ? `Team ${firstTank.name}` : `Team ${i + 1}`;
      lines.push(`> **${teamName}**`);
      if (g1Ids.length) lines.push(`> G1: ${formatGroup(g1Ids)}`);
      if (g2Ids.length) lines.push(`> G2: ${formatGroup(g2Ids)}`);
      lines.push("");
    });
    const content = lines.join("\n").trimEnd();
    try {
      const res = await fetch("/api/post-kara-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, night }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Discord webhook failed, falling back to clipboard:", e);
      await navigator.clipboard.writeText(content);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  }, [rosterTue, rosterThu, assignments]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const allRosters      = [...rosterTue, ...rosterThu];

  if (roster.length === 0 && !showImport) {
    return (
      <AppShell adminMode parsePanelContent={<ParseScoresPanel scores={wclScores} roster={[...rosterTue, ...rosterThu]} module="kara" loading={wclLoading} error={wclError} lastFetch={wclLastFetch} onRefetch={wclRefetch} onWclNameChange={handleWclNameChange} showRefresh />}>
        <ModuleHeader icon="🏰" title="Karazhan Admin" breadcrumb="Karazhan" />
        <EmptyState icon="🏰" title="No roster imported" message="Import Tuesday and Thursday JSONs to get started" action="Import Roster" onAction={() => setShowImport(true)} />
      </AppShell>
    );
  }

  return (
    <AppShell adminMode parsePanelContent={<ParseScoresPanel scores={wclScores} roster={[...rosterTue, ...rosterThu]} module="kara" loading={wclLoading} error={wclError} lastFetch={wclLastFetch} onRefetch={wclRefetch} onWclNameChange={handleWclNameChange} showRefresh />}>
      {/* Conflict modal */}
      {pendingConflicts.length > 0 && (
        <ConflictModal
          conflicts={pendingConflicts}
          resolved={pendingResolved}
          onChange={(discordId, field, value) => setPendingResolved(prev => ({ ...prev, [discordId]: { ...(prev[discordId] || {}), [field]: value } }))}
          onConfirm={() => {
            const resolvedConflicts = pendingConflicts.map(c => ({ ...c, resolvedNames: pendingResolved[c.discordId] || { tueName: c.tueSlot.name, thuName: c.thuSlot.name } }));
            commitImport(pendingImportQueue, resolvedConflicts);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Assignments"
        message="This will remove all Karazhan assignments. This cannot be undone."
        confirmLabel="Clear All"
        dangerous
        onConfirm={() => { setAssignments({}); setConfirmClearOpen(false); }}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={!!confirmDiscordNight}
        title="Post to Discord"
        message="This will tag everyone in this roster in Discord. Are you sure you want to publish these rosters?"
        confirmLabel="Post"
        onConfirm={() => {
          const night = confirmDiscordNight;
          setConfirmDiscordNight(null);
          const teams = night === "tue" ? KARA_TUE_TEAMS : KARA_THU_TEAMS;
          const setCopied = night === "tue" ? setDiscordCopiedTue : setDiscordCopiedThu;
          copyNightDiscord(night, teams, setCopied);
        }}
        onCancel={() => setConfirmDiscordNight(null)}
      />

      {/* Module header */}
      <ModuleHeader
        icon="🏰"
        title="Karazhan Admin"
        breadcrumb="Karazhan"
        actions={<>
          <SaveStatus status={saveStatus} />
          <button onClick={() => setShowImport(v => !v)} style={btnStyle("default")}>
            📂 {rosterTue.length || rosterThu.length ? `Roster (${rosterTue.length}T / ${rosterThu.length}H)` : "Import JSON"}
          </button>
          <button onClick={() => setConfirmClearOpen(true)} style={btnStyle("danger")}>🗑 Clear</button>
          <button onClick={handleSave} style={btnStyle(hasUnsaved ? "warning" : "success")}>
            {FIREBASE_OK ? `${hasUnsaved ? "● " : ""}☁ Save` : "💾 Save"}
          </button>
        </>}
      />

      {/* Import panel */}
      {showImport && (
        <div style={{ padding: space[3], background: surface.panel, borderBottom: `1px solid ${border.subtle}`, display: "flex", gap: space[3] }}>
          {[["tue", "Tuesday", jsonErrorTue, setJsonErrorTue, fileRefTue, rosterTue.length], ["thu", "Thursday", jsonErrorThu, setJsonErrorThu, fileRefThu, rosterThu.length]].map(([night, label, err, setErr, ref, count]) => (
            <div key={night} style={{ flex: 1 }}>
              <div style={{ fontSize: fontSize.xs, color: night === "tue" ? intent.success : accent.blue, fontWeight: fontWeight.medium, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: space[1] }}>
                📅 {label} Raid JSON
              </div>
              <textarea
                placeholder={`Paste ${label} JSON…`}
                onChange={e => { if (e.target.value.trim()) handleImportJSON(e.target.value.trim(), night); }}
                style={{ ...inputStyle, width: "100%", height: 70, resize: "vertical", fontFamily: font.mono, fontSize: fontSize.xs, padding: space[2], borderColor: err ? intent.danger : border.subtle }}
              />
              {err && <div style={{ fontSize: fontSize.xs, color: intent.danger, marginTop: 2 }}>⚠ {err}</div>}
              {count > 0 && !err && <div style={{ fontSize: fontSize.xs, color: intent.success, marginTop: 2 }}>✓ {count} players</div>}
              <button onClick={() => ref.current.click()} style={{ ...btnStyle("default"), marginTop: space[1], fontSize: fontSize.xs }}>📁 Upload .json</button>
              <input ref={ref} type="file" accept=".json" onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => handleImportJSON(ev.target.result.trim(), night); r.readAsText(f); e.target.value = ""; }} style={{ display: "none" }} />
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Roster sidebar */}
        <KaraRosterPanel
          karaNight={karaNight}
          setKaraNight={setKaraNight}
          rosterTue={rosterTue}
          rosterThu={rosterThu}
          assignments={assignments}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          onDragStart={handleDragStart}
          onSpecCycle={handleSpecCycle}
          wclScores={wclScores}
          wclLoading={wclLoading}
          wclError={wclError}
          wclLastFetch={wclLastFetch}
          onWclRefetch={wclRefetch}
          onWclNameChange={handleWclNameChange}
          activeTabForScores="kara"
          onAddManual={slot => {
            const nightSlot = { ...slot, karaNight: karaNight };
            if (karaNight === "tue") setRosterTue(prev => [...prev, nightSlot]);
            else setRosterThu(prev => [...prev, nightSlot]);
            setRoster(prev => [...prev, nightSlot]);
          }}
          onRemovePlayer={handleRemovePlayer}
        />

        {/* Assignment area */}
        <div style={{ flex: 1, overflowY: "auto", padding: space[4] }}>
          <NightSection
            night="tue" teams={KARA_TUE_TEAMS} color={intent.success}
            assignments={assignments} allRosters={allRosters}
            onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} onSpecCycle={handleSpecCycle}
            onCopyDiscord={() => setConfirmDiscordNight("tue")}
            discordCopied={discordCopiedTue}
          />
          <NightSection
            night="thu" teams={KARA_THU_TEAMS} color={accent.blue}
            assignments={assignments} allRosters={allRosters}
            onDrop={handleDrop} onClear={handleClear} onDragStart={handleDragStart} onSpecCycle={handleSpecCycle}
            onCopyDiscord={() => setConfirmDiscordNight("thu")}
            discordCopied={discordCopiedThu}
          />
        </div>
      </div>
    </AppShell>
  );
}
