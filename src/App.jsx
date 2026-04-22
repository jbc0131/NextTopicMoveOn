import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TeamSelector     from "./pages/TeamSelector";
import TeamDashboard    from "./pages/TeamDashboard";
import KaraPublic       from "./modules/kara/KaraPublic";
import KaraAdmin        from "./modules/kara/KaraAdmin";
import TwentyFivePublic from "./modules/25man/TwentyFivePublic";
import TwentyFiveAdmin  from "./modules/25man/TwentyFiveAdmin";
import SscPublic        from "./modules/ssc/SscPublic";
import SscAdmin         from "./modules/ssc/SscAdmin";
import RpbPage          from "./modules/rpb/RpbPage";
import ProfilePage      from "./pages/ProfilePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root */}
        <Route path="/" element={<TeamSelector />} />

        {/* Kara — shared, no team */}
        <Route path="/kara"       element={<KaraPublic />} />
        <Route path="/kara/admin" element={<KaraAdmin />} />

        {/* RPB — shared, no team */}
        <Route path="/rpb" element={<RpbPage />} />
        <Route path="/rpb/:raidId" element={<RpbPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Team Dick */}
        <Route path="/team-dick"             element={<TeamDashboard    teamId="team-dick"  />} />
        <Route path="/team-dick/25man"       element={<TwentyFivePublic teamId="team-dick"  />} />
        <Route path="/team-dick/25man/admin" element={<TwentyFiveAdmin  teamId="team-dick"  />} />
        <Route path="/team-dick/ssc"         element={<SscPublic        teamId="team-dick"  />} />
        <Route path="/team-dick/ssc/admin"   element={<SscAdmin         teamId="team-dick"  />} />

        {/* Team Balls */}
        <Route path="/team-balls"             element={<TeamDashboard    teamId="team-balls" />} />
        <Route path="/team-balls/25man"       element={<TwentyFivePublic teamId="team-balls" />} />
        <Route path="/team-balls/25man/admin" element={<TwentyFiveAdmin  teamId="team-balls" />} />
        <Route path="/team-balls/ssc"         element={<SscPublic        teamId="team-balls" />} />
        <Route path="/team-balls/ssc/admin"   element={<SscAdmin         teamId="team-balls" />} />

        {/* Legacy redirects */}
        <Route path="/team-dick/kara"          element={<Navigate to="/kara"          replace />} />
        <Route path="/team-dick/kara/admin"    element={<Navigate to="/kara/admin"    replace />} />
        <Route path="/team-balls/kara"         element={<Navigate to="/kara"          replace />} />
        <Route path="/team-balls/kara/admin"   element={<Navigate to="/kara/admin"    replace />} />
        <Route path="/team-dick/admin"         element={<Navigate to="/kara/admin"    replace />} />
        <Route path="/team-balls/admin"        element={<Navigate to="/kara/admin"    replace />} />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
