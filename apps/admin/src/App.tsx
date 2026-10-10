import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.js";
import { RequireAdmin } from "./auth/RequireAdmin.js";
import { AdminShell } from "./components/AdminShell.js";
import { AccountPage } from "./pages/AccountPage.js";
import { ClubDrillPage } from "./pages/ClubDrillPage.js";
import { ClubSeasonDrillPage } from "./pages/ClubSeasonDrillPage.js";
import { CollectorJerseyDrillPage } from "./pages/CollectorJerseyDrillPage.js";
import { CollectorsPage } from "./pages/CollectorsPage.js";
import { CollectorUserDrillPage } from "./pages/CollectorUserDrillPage.js";
import { KitDrillPage } from "./pages/KitDrillPage.js";
import { LeagueDrillPage } from "./pages/LeagueDrillPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { MasterDataPage } from "./pages/MasterDataPage.js";
import { OfferDrillPage } from "./pages/OfferDrillPage.js";
import { PlayerDrillPage } from "./pages/PlayerDrillPage.js";
import { ResetCompletePage } from "./pages/ResetCompletePage.js";
import { ResetRequestPage } from "./pages/ResetRequestPage.js";
import { SeasonDrillPage } from "./pages/SeasonDrillPage.js";
import { VerifyPage } from "./pages/VerifyPage.js";
import "./styles/admin.css";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/reset" element={<ResetRequestPage />} />
          <Route path="/reset/complete" element={<ResetCompletePage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/" element={<Navigate to="/stamdata" replace />} />
              <Route path="/stamdata" element={<MasterDataPage />} />
              <Route path="/stamdata/clubs/:clubId" element={<ClubDrillPage />} />
              <Route path="/stamdata/leagues/:leagueId" element={<LeagueDrillPage />} />
              <Route path="/stamdata/players/:playerId" element={<PlayerDrillPage />} />
              <Route path="/stamdata/seasons/:seasonId" element={<SeasonDrillPage />} />
              <Route path="/stamdata/kits/:kitId" element={<KitDrillPage />} />
              <Route
                path="/stamdata/club-seasons/:clubId/:seasonId"
                element={<ClubSeasonDrillPage />}
              />
              <Route path="/collectors" element={<CollectorsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/collectors/offers" element={<OfferDrillPage />} />
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
