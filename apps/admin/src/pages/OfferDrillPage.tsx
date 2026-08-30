import { type Offer, offerSchema } from "@kit/api-contract";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { BackLink } from "../components/BackLink.js";
import { Switch } from "../components/Switch.js";

export function OfferDrillPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [monthProductId, setMonthProductId] = useState("");
  const [yearProductId, setYearProductId] = useState("");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialDays, setTrialDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    apiFetch<Offer>("/admin/billing/offer", { token })
      .then((body) => {
        const offer = offerSchema.parse(body);
        setMonthProductId(offer.monthProductId);
        setYearProductId(offer.yearProductId);
        setTrialEnabled(offer.trialEnabled);
        setTrialDays(offer.trialDays);
        setError(null);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load offer");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiFetch<Offer>("/admin/billing/offer", {
        token,
        method: "PATCH",
        body: JSON.stringify({
          monthProductId,
          yearProductId,
          trialEnabled,
          trialDays,
        }),
      });
      const offer = offerSchema.parse(updated);
      setMonthProductId(offer.monthProductId);
      setYearProductId(offer.yearProductId);
      setTrialEnabled(offer.trialEnabled);
      setTrialDays(offer.trialDays);
    } catch (submitError) {
      setSaveError(submitError instanceof Error ? submitError.message : "Failed to save offer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/collectors" />
        <h2>Offers</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}
      {saveError ? <div className="banner-error">{saveError}</div> : null}

      {loading ? (
        <p className="type-body">Loading offer…</p>
      ) : (
        <form className="offer-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="month-product-id">Month IAP product id</label>
            <input
              id="month-product-id"
              type="text"
              value={monthProductId}
              onChange={(event) => setMonthProductId(event.target.value)}
              required
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="year-product-id">Year IAP product id</label>
            <input
              id="year-product-id"
              type="text"
              value={yearProductId}
              onChange={(event) => setYearProductId(event.target.value)}
              required
              disabled={saving}
            />
          </div>
          <div className="field field-switch">
            <span id="trial-enabled-label">Trial on</span>
            <Switch
              checked={trialEnabled}
              disabled={saving}
              label="Trial on"
              onCheckedChange={setTrialEnabled}
            />
          </div>
          <div className="field">
            <label htmlFor="trial-days">Trial days</label>
            <input
              id="trial-days"
              type="number"
              min={0}
              step={1}
              value={trialDays}
              onChange={(event) => setTrialDays(Number.parseInt(event.target.value, 10) || 0)}
              required
              disabled={saving}
            />
          </div>
          <div className="toolbar toolbar--actions">
            <button
              type="button"
              className="btn btn-tertiary"
              onClick={() => navigate("/collectors")}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
