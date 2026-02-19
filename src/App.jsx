import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PublicView from "./PublicView";
import AdminView  from "./AdminView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<PublicView />} />
        <Route path="/admin" element={<AdminView />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
