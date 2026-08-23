import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.js";
import { RequireAdmin } from "./auth/RequireAdmin.js";
import { AdminShell } from "./components/AdminShell.js";
import { ClubSeasonDrillPage } from "./pages/ClubSeasonDrillPage.js";
import { CollectorsPage } from "./pages/CollectorsPage.js";
import { KitDrillPage } from "./pages/KitDrillPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { StamdataPage } from "./pages/StamdataPage.js";
import "./styles/admin.css";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/" element={<Navigate to="/stamdata" replace />} />
              <Route path="/stamdata" element={<StamdataPage />} />
              <Route path="/stamdata/kits/:kitId" element={<KitDrillPage />} />
              <Route
                path="/stamdata/club-seasons/:clubId/:seasonId"
                element={<ClubSeasonDrillPage />}
              />
              <Route path="/collectors" element={<CollectorsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/stamdata" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
