import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TeamSelector    from "./pages/TeamSelector";
import TeamDashboard   from "./pages/TeamDashboard";
import KaraPublic      from "./modules/kara/KaraPublic";
import KaraAdmin       from "./modules/kara/KaraAdmin";
import TwentyFivePublic from "./modules/25man/TwentyFivePublic";
import TwentyFiveAdmin  from "./modules/25man/TwentyFiveAdmin";
import HistoryView     from "./modules/history/HistoryView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root — team selector */}
        <Route path="/" element={<TeamSelector />} />

        {/* Team Dick */}
        <Route path="/team-dick"                element={<TeamDashboard   teamId="team-dick"  />} />
        <Route path="/team-dick/kara"           element={<KaraPublic      teamId="team-dick"  />} />
        <Route path="/team-dick/kara/admin"     element={<KaraAdmin       teamId="team-dick"  />} />
        <Route path="/team-dick/25man"          element={<TwentyFivePublic teamId="team-dick" />} />
        <Route path="/team-dick/25man/admin"    element={<TwentyFiveAdmin  teamId="team-dick" />} />
        <Route path="/team-dick/history"        element={<HistoryView     teamId="team-dick"  />} />

        {/* Team Balls */}
        <Route path="/team-balls"               element={<TeamDashboard   teamId="team-balls" />} />
        <Route path="/team-balls/kara"          element={<KaraPublic      teamId="team-balls" />} />
        <Route path="/team-balls/kara/admin"    element={<KaraAdmin       teamId="team-balls" />} />
        <Route path="/team-balls/25man"         element={<TwentyFivePublic teamId="team-balls" />} />
        <Route path="/team-balls/25man/admin"   element={<TwentyFiveAdmin  teamId="team-balls" />} />
        <Route path="/team-balls/history"       element={<HistoryView     teamId="team-balls" />} />

        {/* Legacy redirects — old routes silently redirect, never linked from new UI */}
        <Route path="/team-dick/admin"          element={<Navigate to="/team-dick/kara/admin"  replace />} />
        <Route path="/team-balls/admin"         element={<Navigate to="/team-balls/kara/admin" replace />} />
        <Route path="/team-dick/analysis"       element={<Navigate to="/team-dick/history"     replace />} />
        <Route path="/team-balls/analysis"      element={<Navigate to="/team-balls/history"    replace />} />
        <Route path="/admin"                    element={<Navigate to="/"                       replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
