import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import PublicView  from "./PublicView";
import AdminView   from "./AdminView";

const TEAMS = {
  "team-dick":  { name: "TEAM DICK  ·  Tuesday"  },
  "team-balls": { name: "TEAM BALLS  ·  Thursday" },
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page — pick your team */}
        <Route path="/" element={<LandingPage />} />

        {/* Team Dick */}
        <Route path="/team-dick"
          element={<PublicView teamId="team-dick" teamName={TEAMS["team-dick"].name} />} />
        <Route path="/team-dick/admin"
          element={<AdminView  teamId="team-dick" teamName={TEAMS["team-dick"].name} />} />

        {/* Team Balls */}
        <Route path="/team-balls"
          element={<PublicView teamId="team-balls" teamName={TEAMS["team-balls"].name} />} />
        <Route path="/team-balls/admin"
          element={<AdminView  teamId="team-balls" teamName={TEAMS["team-balls"].name} />} />

        {/* Legacy /admin redirect → landing */}
        <Route path="/admin" element={<Navigate to="/" replace />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
