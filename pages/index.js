import Head from "next/head";
import Link from "next/link";
import { Fraunces, Outfit } from "next/font/google";
import { useEffect, useState } from "react";
import { COVER_KEYS, COVER_PRESETS, resolveCoverKey } from "../lib/covers";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

const emptyTripForm = {
  brand: "",
  title: "",
  subtitle: "",
  dates: "",
  route: "",
  hotels: "",
  cover: "mist",
};

function CoverThumb({ cover, tripId, className = "" }) {
  const key = resolveCoverKey(cover, tripId);
  const preset = COVER_PRESETS[key];
  return (
    <span
      className={`cover-thumb ${preset.thumbClass}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
}

function TripForm({ title, values, onChange, onSubmit, onCancel, submitLabel, saving }) {
  return (
    <form
      className="activity-form trip-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="form-title">{title}</p>
      <div className="form-grid">
        <label className="form-field">
          <span>Brand</span>
          <input
            type="text"
            maxLength={80}
            value={values.brand}
            onChange={(event) => onChange({ ...values, brand: event.target.value })}
            placeholder="e.g. Central Coast"
            disabled={saving}
          />
        </label>
        <label className="form-field">
          <span>Dates</span>
          <input
            type="text"
            maxLength={80}
            value={values.dates}
            onChange={(event) => onChange({ ...values, dates: event.target.value })}
            placeholder="e.g. August 8 – 12"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Title</span>
          <input
            type="text"
            required
            maxLength={120}
            value={values.title}
            onChange={(event) => onChange({ ...values, title: event.target.value })}
            placeholder="Trip name"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Subtitle</span>
          <textarea
            rows={2}
            maxLength={400}
            value={values.subtitle}
            onChange={(event) => onChange({ ...values, subtitle: event.target.value })}
            placeholder="Short description"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Route</span>
          <input
            type="text"
            maxLength={160}
            value={values.route}
            onChange={(event) => onChange({ ...values, route: event.target.value })}
            placeholder="e.g. Ha Noi → Hue → Da Nang"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Hotels</span>
          <input
            type="text"
            maxLength={160}
            value={values.hotels}
            onChange={(event) => onChange({ ...values, hotels: event.target.value })}
            placeholder="Where you’re staying"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Cover</span>
          <select
            value={values.cover}
            onChange={(event) => onChange({ ...values, cover: event.target.value })}
            disabled={saving}
          >
            {COVER_KEYS.map((key) => (
              <option key={key} value={key}>
                {COVER_PRESETS[key].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TripsHome() {
  const [trips, setTrips] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [unlockBuzz, setUnlockBuzz] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [formValues, setFormValues] = useState(emptyTripForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/trips");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load trips");
        }
        if (!cancelled) {
          setTrips(Array.isArray(data.trips) ? data.trips : []);
          setCanEdit(Boolean(data.unlocked));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Failed to load trips");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!unlockSuccess) return;
    const timer = setTimeout(() => {
      setCanEdit(true);
      setShowUnlock(false);
      setUnlockSuccess(false);
      setPin("");
    }, 1400);
    return () => clearTimeout(timer);
  }, [unlockSuccess]);

  useEffect(() => {
    if (!unlockBuzz) return;
    const timer = setTimeout(() => setUnlockBuzz(false), 450);
    return () => clearTimeout(timer);
  }, [unlockBuzz]);

  async function unlockEdit(event) {
    event.preventDefault();
    if (unlockSuccess) return;
    setAuthBusy(true);
    setAuthError("");
    setUnlockBuzz(false);
    try {
      const res = await fetch("/api/itinerary-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Incorrect PIN");
      }
      setPin("");
      setUnlockSuccess(true);
    } catch (error) {
      setAuthError(error.message || "Unlock failed");
      requestAnimationFrame(() => setUnlockBuzz(true));
    } finally {
      setAuthBusy(false);
    }
  }

  function closeUnlockDialog() {
    if (authBusy || unlockSuccess) return;
    setShowUnlock(false);
    setPin("");
    setAuthError("");
    setUnlockBuzz(false);
  }

  async function lockEdit() {
    setAuthBusy(true);
    setAuthError("");
    setUnlockSuccess(false);
    try {
      await fetch("/api/itinerary-lock", { method: "POST" });
    } catch {
      // Still lock locally even if the request fails
    } finally {
      setCanEdit(false);
      setShowUnlock(false);
      setFormMode(null);
      setPin("");
      setAuthBusy(false);
    }
  }

  function openCreateForm() {
    if (!canEdit) return;
    setSaveError("");
    setFormMode({ mode: "create" });
    setFormValues(emptyTripForm);
  }

  function openEditForm(trip) {
    if (!canEdit) return;
    setSaveError("");
    setFormMode({ mode: "edit", tripId: trip.id });
    setFormValues({
      brand: trip.brand || "",
      title: trip.title || "",
      subtitle: trip.subtitle || "",
      dates: trip.dates || "",
      route: trip.route || "",
      hotels: trip.hotels || "",
      cover: resolveCoverKey(trip.cover, trip.id),
    });
  }

  function closeForm() {
    setFormMode(null);
    setFormValues(emptyTripForm);
    setSaveError("");
  }

  async function saveForm() {
    if (!canEdit) {
      setSaveError("Unlock required to save changes");
      return;
    }

    const title = formValues.title.trim();
    if (!title) {
      setSaveError("Title is required");
      return;
    }

    const payload = {
      brand: formValues.brand.trim() || "Trip",
      title,
      subtitle: formValues.subtitle.trim(),
      dates: formValues.dates.trim(),
      route: formValues.route.trim(),
      hotels: formValues.hotels.trim(),
      cover: resolveCoverKey(formValues.cover),
    };

    setSaving(true);
    setSaveError("");
    try {
      if (formMode?.mode === "edit") {
        const res = await fetch(`/api/trips/${formMode.tripId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) setCanEdit(false);
          throw new Error(data.error || "Failed to save trip");
        }
        const summary = data.summary ?? data.trip;
        setTrips((prev) =>
          prev
            .map((trip) =>
              trip.id === formMode.tripId
                ? {
                    ...trip,
                    ...summary,
                    dayCount: summary.dayCount ?? trip.dayCount,
                  }
                : trip,
            )
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
        );
      } else {
        const res = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) setCanEdit(false);
          throw new Error(data.error || "Failed to create trip");
        }
        const created = data.trip;
        setTrips((prev) => [
          {
            id: created.id,
            brand: created.brand,
            title: created.title,
            subtitle: created.subtitle,
            dates: created.dates,
            route: created.route,
            hotels: created.hotels,
            cover: created.cover,
            dayCount: Array.isArray(created.days) ? created.days.length : 1,
            updatedAt: created.updatedAt,
          },
          ...prev,
        ]);
      }
      closeForm();
    } catch (error) {
      setSaveError(error.message || "Failed to save trip");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrip(trip) {
    if (!canEdit || !trip?.id) return;
    const confirmed = window.confirm(
      `Delete “${trip.title}”? This removes the whole itinerary.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) setCanEdit(false);
        throw new Error(data.error || "Failed to delete trip");
      }
      setTrips((prev) => prev.filter((item) => item.id !== trip.id));
      if (formMode?.mode === "edit" && formMode.tripId === trip.id) {
        closeForm();
      }
    } catch (error) {
      setSaveError(error.message || "Failed to delete trip");
    } finally {
      setSaving(false);
    }
  }

  const isCreating = formMode?.mode === "create";

  return (
    <>
      <Head>
        <title>Family trips · Shared itineraries</title>
        <meta
          name="description"
          content="Family trips — shared itineraries for traveling together."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/family-trips-mark.svg?v=2" type="image/svg+xml" />
      </Head>

      <div className={`${display.variable} ${sans.variable} page`}>
        <div className="atmosphere" aria-hidden="true" />

        <header className="trips-hero">
          <div className="trips-hero-copy">
            <div className="brand-lockup">
              <img
                className="brand-mark"
                src="/family-trips-mark.svg?v=2"
                alt=""
                width={56}
                height={56}
              />
              <h1 className="trips-brand">Family trips</h1>
            </div>
          </div>
        </header>

        <main className="trips-main">
          <div className="section-head section-head-row">
            <h2 className="section-label">Shared Itineraries</h2>
            <div className="edit-access">
              {canEdit ? (
                <button
                  type="button"
                  className="text-action text-action-accent"
                  onClick={lockEdit}
                  disabled={authBusy}
                >
                  Lock editing
                </button>
              ) : (
                <button
                  type="button"
                  className="text-action text-action-accent"
                  onClick={() => {
                    setShowUnlock(true);
                    setAuthError("");
                    setUnlockBuzz(false);
                  }}
                >
                  Unlock to edit
                </button>
              )}
            </div>
          </div>
          {loadError ? <p className="inline-error">{loadError}</p> : null}
          {saveError && !formMode ? (
            <p className="inline-error">{saveError}</p>
          ) : null}

          {showUnlock && !canEdit ? (
            <div
              className="unlock-overlay"
              role="presentation"
              onClick={closeUnlockDialog}
            >
              <form
                className={`unlock-dialog${unlockBuzz ? " is-buzzing" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="unlock-dialog-title"
                onSubmit={unlockEdit}
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="unlock-dialog-title" className="form-title">
                  Unlock to edit
                </h3>
                {unlockSuccess ? (
                  <p className="unlock-success" role="status">
                    Unlock successfully done
                  </p>
                ) : (
                  <>
                    <p className="unlock-dialog-lede">
                      Enter the shared PIN to create or edit trips.
                    </p>
                    <label className="form-field">
                      Edit PIN
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="current-password"
                        placeholder="Enter PIN"
                        value={pin}
                        onChange={(event) => setPin(event.target.value)}
                        disabled={authBusy}
                        required
                        autoFocus
                      />
                    </label>
                    {authError ? <p className="inline-error">{authError}</p> : null}
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={authBusy}
                      >
                        {authBusy ? "Unlocking…" : "Unlock"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={closeUnlockDialog}
                        disabled={authBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          ) : null}

          {!hydrated ? (
            <div className="trips-empty-state">
              <img
                src="/family-trips-mark.svg?v=2"
                alt=""
                width={40}
                height={40}
                className="empty-mark"
              />
              <p>Loading family trips…</p>
            </div>
          ) : trips.length === 0 && !isCreating ? (
            <div className="trips-empty-state">
              <img
                src="/family-trips-mark.svg?v=2"
                alt=""
                width={40}
                height={40}
                className="empty-mark"
              />
              <p>
                {canEdit
                  ? "No trips yet — create one for the family."
                  : "No trips yet. Unlock to create one."}
              </p>
            </div>
          ) : (
            <ul className="trip-list">
              {trips.map((trip, index) => {
                const isEditing =
                  canEdit &&
                  formMode?.mode === "edit" &&
                  formMode.tripId === trip.id;

                return (
                  <li
                    key={trip.id}
                    className={`trip-row${isEditing ? " is-editing" : ""}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {isEditing ? (
                      <>
                        {saveError ? (
                          <p className="inline-error">{saveError}</p>
                        ) : null}
                        <TripForm
                          title="Edit trip"
                          values={formValues}
                          onChange={setFormValues}
                          onSubmit={saveForm}
                          onCancel={closeForm}
                          submitLabel="Save trip"
                          saving={saving}
                        />
                      </>
                    ) : (
                      <>
                        <Link href={`/trips/${trip.id}`} className="trip-link">
                          <CoverThumb cover={trip.cover} tripId={trip.id} />
                          <span className="trip-link-copy">
                            <span className="trip-link-brand">
                              {trip.brand || "Trip"}
                            </span>
                            <span className="trip-link-title">{trip.title}</span>
                            {trip.subtitle ? (
                              <span className="trip-link-subtitle">
                                {trip.subtitle}
                              </span>
                            ) : null}
                            <span className="trip-link-meta">
                              {trip.dates ? <span>{trip.dates}</span> : null}
                              {trip.dates && trip.dayCount ? (
                                <span className="dot" aria-hidden="true" />
                              ) : null}
                              <span>
                                {trip.dayCount}{" "}
                                {trip.dayCount === 1 ? "day" : "days"}
                              </span>
                            </span>
                          </span>
                        </Link>
                        {canEdit ? (
                          <div className="trip-row-actions">
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => openEditForm(trip)}
                              disabled={saving}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-action text-action-danger"
                              onClick={() => deleteTrip(trip)}
                              disabled={saving}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit ? (
            isCreating ? (
              <div className="add-form-wrap">
                {saveError ? <p className="inline-error">{saveError}</p> : null}
                <TripForm
                  title="New trip"
                  values={formValues}
                  onChange={setFormValues}
                  onSubmit={saveForm}
                  onCancel={closeForm}
                  submitLabel="Create trip"
                  saving={saving}
                />
              </div>
            ) : (
              <button
                type="button"
                className="text-action text-action-create"
                onClick={openCreateForm}
              >
                + Create trip
              </button>
            )
          ) : null}
        </main>

        <footer className="footer">
          <p>© {new Date().getFullYear()} TD. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
