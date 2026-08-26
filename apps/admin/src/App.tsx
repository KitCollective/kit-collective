import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.js";
import { RequireAdmin } from "./auth/RequireAdmin.js";
import { AdminShell } from "./components/AdminShell.js";
import { ClubDrillPage } from "./pages/ClubDrillPage.js";
import { ClubSeasonDrillPage } from "./pages/ClubSeasonDrillPage.js";
import { CollectorJerseyDrillPage } from "./pages/CollectorJerseyDrillPage.js";
import { CollectorsPage } from "./pages/CollectorsPage.js";
import { CollectorUserDrillPage } from "./pages/CollectorUserDrillPage.js";
import { KitDrillPage } from "./pages/KitDrillPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SeasonDrillPage } from "./pages/SeasonDrillPage.js";
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
              <Route path="/stamdata/clubs/:clubId" element={<ClubDrillPage />} />
              <Route path="/stamdata/seasons/:seasonId" element={<SeasonDrillPage />} />
              <Route path="/stamdata/kits/:kitId" element={<KitDrillPage />} />
              <Route
                path="/stamdata/club-seasons/:clubId/:seasonId"
                element={<ClubSeasonDrillPage />}
              />
              <Route path="/collectors" element={<CollectorsPage />} />
              <Route path="/collectors/:userId" element={<CollectorUserDrillPage />} />
              <Route
                path="/collectors/:userId/jerseys/:jerseyId"
                element={<CollectorJerseyDrillPage />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/stamdata" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
