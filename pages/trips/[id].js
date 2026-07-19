import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fraunces, Outfit } from "next/font/google";
import { useEffect, useState } from "react";
import { typeLabels } from "../../data/itinerary";
import { getCoverPreset } from "../../lib/covers";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

const TYPE_OPTIONS = Object.keys(typeLabels);

const emptyForm = {
  time: "12:00",
  type: "sightseeing",
  title: "",
  detail: "",
};

const emptyTrip = {
  id: "",
  brand: "",
  title: "",
  subtitle: "",
  dates: "",
  route: "",
  hotels: "",
  cover: "mist",
  days: [],
};

function doneStorageKey(tripId) {
  return `itinerary-done:${tripId}`;
}

function createId() {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function withActivityIds(sourceDays) {
  return sourceDays.map((day) => ({
    ...day,
    activities: day.activities.map((item, index) => ({
      ...item,
      id: item.id ?? `${day.id}-${index}`,
    })),
  }));
}

function activityKey(dayId, activityId) {
  return `${dayId}::${activityId}`;
}

/** Parse "09:20 AM" / "2:00 PM" into minutes since midnight. */
function parseTimeToMinutes(timeStr) {
  const match = String(timeStr)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === "AM") {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }
  return hours * 60 + minutes;
}

/** "14:30" (input[type=time]) → "02:30 PM" */
function timeInputToDisplay(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "12:00 PM";
  let hours = Number(value.slice(0, 2));
  const minutes = value.slice(3, 5);
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${period}`;
}

/** "09:20 AM" → "09:20" for input[type=time] */
function displayToTimeInput(displayTime) {
  const minutes = parseTimeToMinutes(displayTime);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function sortActivities(activities) {
  return [...activities].sort(
    (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
  );
}

function ActivityForm({ title, values, onChange, onSubmit, onCancel, submitLabel, saving }) {
  return (
    <form
      className="activity-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="form-title">{title}</p>
      <div className="form-grid">
        <label className="form-field">
          <span>Time</span>
          <input
            type="time"
            required
            value={values.time}
            onChange={(event) => onChange({ ...values, time: event.target.value })}
            disabled={saving}
          />
        </label>
        <label className="form-field">
          <span>Type</span>
          <select
            value={values.type}
            onChange={(event) => onChange({ ...values, type: event.target.value })}
            disabled={saving}
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field form-field-full">
          <span>Title</span>
          <input
            type="text"
            required
            maxLength={120}
            value={values.title}
            onChange={(event) => onChange({ ...values, title: event.target.value })}
            placeholder="What happens?"
            disabled={saving}
          />
        </label>
        <label className="form-field form-field-full">
          <span>Details</span>
          <textarea
            rows={3}
            maxLength={400}
            value={values.detail}
            onChange={(event) => onChange({ ...values, detail: event.target.value })}
            placeholder="Notes, address, duration…"
            disabled={saving}
          />
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

export default function TripPage() {
  const router = useRouter();
  const tripId = typeof router.query.id === "string" ? router.query.id : "";

  const [trip, setTrip] = useState(emptyTrip);
  const [activeId, setActiveId] = useState("");
  const [animKey, setAnimKey] = useState(0);
  const [days, setDays] = useState([]);
  const [completed, setCompleted] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [unlockBuzz, setUnlockBuzz] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const active = days.find((d) => d.id === activeId) ?? days[0];

  useEffect(() => {
    if (!router.isReady || !tripId) return;

    let cancelled = false;

    async function load() {
      setHydrated(false);
      setNotFound(false);
      setLoadError("");
      setCompleted({});

      try {
        const rawDone = window.localStorage.getItem(doneStorageKey(tripId));
        if (rawDone) {
          const parsed = JSON.parse(rawDone);
          if (parsed && typeof parsed === "object") {
            setCompleted(parsed);
          }
        }
      } catch {
        // Ignore corrupted storage
      }

      try {
        const res = await fetch(`/api/trips/${tripId}`);
        const data = await res.json();
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || "Failed to load trip");
        }
        if (!cancelled && data.trip) {
          const nextDays = withActivityIds(data.trip.days || []);
          setTrip(data.trip);
          setDays(nextDays);
          setActiveId(nextDays[0]?.id ?? "");
          setCanEdit(Boolean(data.unlocked));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Failed to load trip");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, tripId]);

  useEffect(() => {
    if (!hydrated || !tripId) return;
    try {
      window.localStorage.setItem(
        doneStorageKey(tripId),
        JSON.stringify(completed),
      );
    } catch {
      // Ignore quota / private mode failures
    }
  }, [completed, hydrated, tripId]);

  useEffect(() => {
    setAnimKey((k) => k + 1);
    setFormMode(null);
    setSaveError("");
  }, [activeId]);

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

  function selectDay(id) {
    setActiveId(id);
  }

  function toggleActivity(key) {
    setCompleted((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function openAddForm() {
    if (!canEdit) return;
    setSaveError("");
    setFormMode({ mode: "add" });
    setFormValues(emptyForm);
  }

  function openEditForm(item) {
    if (!canEdit) return;
    setSaveError("");
    setFormMode({ mode: "edit", activityId: item.id });
    setFormValues({
      time: displayToTimeInput(item.time),
      type: item.type,
      title: item.title,
      detail: item.detail,
    });
  }

  function closeForm() {
    setFormMode(null);
    setFormValues(emptyForm);
    setSaveError("");
  }

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

  async function persistDays(nextDays) {
    const res = await fetch(`/api/trips/${tripId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: nextDays }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setCanEdit(false);
      }
      throw new Error(data.error || "Failed to save");
    }
    if (data.trip) {
      setTrip(data.trip);
      setDays(withActivityIds(data.trip.days ?? nextDays));
    } else {
      setDays(withActivityIds(nextDays));
    }
  }

  async function saveForm() {
    const title = formValues.title.trim();
    const detail = formValues.detail.trim();
    if (!canEdit) {
      setSaveError("Unlock required to save changes");
      return;
    }
    if (!title || !formValues.time) {
      setSaveError("Title and time are required");
      return;
    }

    const nextItem = {
      time: timeInputToDisplay(formValues.time),
      type: formValues.type,
      title,
      detail,
    };

    const nextDays = days.map((day) => {
      if (day.id !== activeId) return day;

      let activities;
      if (formMode?.mode === "edit") {
        activities = day.activities.map((item) =>
          item.id === formMode.activityId ? { ...item, ...nextItem } : item,
        );
      } else {
        activities = [...day.activities, { ...nextItem, id: createId() }];
      }

      return { ...day, activities: sortActivities(activities) };
    });

    setSaving(true);
    setSaveError("");
    try {
      await persistDays(nextDays);
      closeForm();
    } catch (error) {
      setSaveError(error.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteActivity(item) {
    if (!canEdit || !item?.id) return;
    const confirmed = window.confirm(`Delete “${item.title}”?`);
    if (!confirmed) return;

    const nextDays = days.map((day) => {
      if (day.id !== activeId) return day;
      return {
        ...day,
        activities: day.activities.filter((activity) => activity.id !== item.id),
      };
    });

    setSaving(true);
    setSaveError("");
    try {
      await persistDays(nextDays);
      setCompleted((prev) => {
        const next = { ...prev };
        delete next[activityKey(activeId, item.id)];
        return next;
      });
      if (formMode?.mode === "edit" && formMode.activityId === item.id) {
        closeForm();
      }
    } catch (error) {
      setSaveError(error.message || "Failed to delete item");
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <>
        <Head>
          <title>Trip not found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <div className={`${display.variable} ${sans.variable} page`}>
          <div className="atmosphere" aria-hidden="true" />
          <main className="trips-main">
            <h1 className="trips-brand" style={{ fontSize: "2.5rem" }}>
              Trip not found
            </h1>
            <p className="trips-lede">This itinerary may have been deleted.</p>
            <Link href="/" className="cta" style={{ display: "inline-flex" }}>
              ← Family trips
            </Link>
          </main>
        </div>
      </>
    );
  }

  const dayDoneCount = active
    ? active.activities.filter((item) =>
        completed[activityKey(active.id, item.id)],
      ).length
    : 0;
  const dayTotal = active?.activities.length ?? 0;
  const isAdding = formMode?.mode === "add";
  const pageTitle = trip.brand
    ? `${trip.brand} · ${trip.title}`
    : trip.title || "Trip";
  const cover = getCoverPreset(trip.cover, trip.id);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={trip.subtitle || trip.title} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/family-trips-mark.svg?v=2" type="image/svg+xml" />
      </Head>

      <div className={`${display.variable} ${sans.variable} page`}>
        <div className="atmosphere" aria-hidden="true" />

        <header className="hero">
          <div className="hero-media" aria-hidden="true">
            {cover.type === "photos" ? (
              cover.images.map((image) => (
                <div
                  key={image.src}
                  className={`hero-photo ${image.className}`}
                >
                  <img
                    src={image.src}
                    alt=""
                    width={image.width}
                    height={image.height}
                    decoding="async"
                  />
                </div>
              ))
            ) : (
              <div className={cover.heroClass} />
            )}
            <div className="hero-veil" />
          </div>

          <div className="hero-copy">
            <p className="brand">{trip.brand || "Trip"}</p>
            <h1 className="hero-title">{trip.title || "Loading…"}</h1>
            {trip.subtitle ? (
              <p className="hero-lede">{trip.subtitle}</p>
            ) : null}
            {(trip.dates || trip.route || trip.hotels) && (
              <div className="hero-meta">
                {trip.dates ? <span>{trip.dates}</span> : null}
                {trip.dates && trip.route ? (
                  <span className="dot" aria-hidden="true" />
                ) : null}
                {trip.route ? <span>{trip.route}</span> : null}
                {(trip.dates || trip.route) && trip.hotels ? (
                  <span className="dot" aria-hidden="true" />
                ) : null}
                {trip.hotels ? <span>{trip.hotels}</span> : null}
              </div>
            )}
          </div>
        </header>

        <main id="itinerary" className="itinerary">
          <div className="section-head">
            <div className="product-bar">
              <Link href="/" className="product-chip">
                <img
                  src="/family-trips-mark.svg?v=2"
                  alt=""
                  width={22}
                  height={22}
                />
                <span>Family trips</span>
              </Link>
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
            <div className="section-head-row">
              <h2>Itinerary by day</h2>
            </div>
            {loadError ? <p className="inline-error">{loadError}</p> : null}
          </div>

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
                      Enter the shared PIN to add or edit itinerary items.
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

          {hydrated && days.length === 0 ? (
            <p className="trips-empty">This trip has no days yet.</p>
          ) : null}

          {days.length > 0 ? (
            <>
              <div
                className="tabs"
                role="tablist"
                aria-label="Trip days"
                style={{ "--day-count": String(days.length) }}
              >
                {days.map((day) => {
                  const selected = day.id === activeId;
                  const done = day.activities.filter(
                    (item) => completed[activityKey(day.id, item.id)],
                  ).length;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`tab${selected ? " is-active" : ""}`}
                      onClick={() => selectDay(day.id)}
                    >
                      <span className="tab-label">{day.label}</span>
                      <span className="tab-date">{day.date}</span>
                      <span className="tab-city">{day.city}</span>
                      <span className="tab-progress">
                        {done}/{day.activities.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {active ? (
                <section
                  key={animKey}
                  className="day-panel"
                  role="tabpanel"
                  aria-label={`${active.label}: ${active.theme}`}
                >
                  <div className="day-intro">
                    <p className="day-kicker">
                      {active.label}
                      {active.date ? ` · ${active.date}` : ""}
                      {active.city ? ` · ${active.city}` : ""}
                    </p>
                    <h3>{active.theme}</h3>
                    {active.summary ? (
                      <p className="day-summary">{active.summary}</p>
                    ) : null}
                    <p className="day-progress" aria-live="polite">
                      {dayDoneCount} of {dayTotal} completed
                    </p>
                    {saveError ? <p className="inline-error">{saveError}</p> : null}
                  </div>

                  <ol className="timeline">
                    {active.activities.map((item, index) => {
                      const key = activityKey(active.id, item.id);
                      const isDone = Boolean(completed[key]);
                      const isEditing =
                        canEdit &&
                        formMode?.mode === "edit" &&
                        formMode.activityId === item.id;

                      return (
                        <li
                          key={item.id}
                          className={`timeline-item${isDone ? " is-done" : ""}${
                            isEditing ? " is-editing" : ""
                          }`}
                          style={{ animationDelay: `${index * 45}ms` }}
                        >
                          {isEditing ? (
                            <>
                              <time className="time">
                                {timeInputToDisplay(formValues.time)}
                              </time>
                              <ActivityForm
                                title="Edit item"
                                values={formValues}
                                onChange={setFormValues}
                                onSubmit={saveForm}
                                onCancel={closeForm}
                                submitLabel="Save changes"
                                saving={saving}
                              />
                            </>
                          ) : (
                            <>
                              <time className="time">{item.time}</time>
                              <div className="activity-row">
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={isDone}
                                    onChange={() => toggleActivity(key)}
                                    aria-label={`Mark complete: ${item.title}`}
                                  />
                                  <span className="check-box" aria-hidden="true" />
                                </label>
                                <div className="activity">
                                  <div className="activity-top">
                                    <span className={`type type-${item.type}`}>
                                      {typeLabels[item.type]}
                                    </span>
                                    {canEdit ? (
                                      <div className="activity-actions">
                                        <button
                                          type="button"
                                          className="text-action"
                                          onClick={() => openEditForm(item)}
                                          disabled={saving}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="text-action text-action-danger"
                                          onClick={() => deleteActivity(item)}
                                          disabled={saving}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <h4>{item.title}</h4>
                                  <p>{item.detail}</p>
                                </div>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {canEdit ? (
                    isAdding ? (
                      <div className="add-form-wrap">
                        {saveError ? (
                          <p className="inline-error">{saveError}</p>
                        ) : null}
                        <ActivityForm
                          title="Add item"
                          values={formValues}
                          onChange={setFormValues}
                          onSubmit={saveForm}
                          onCancel={closeForm}
                          submitLabel="Add to day"
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-action text-action-create"
                        onClick={openAddForm}
                      >
                        + Add item
                      </button>
                    )
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </main>

        <footer className="footer">
          <p>
            <Link href="/" className="footer-back">
              Family trips
            </Link>
            {trip.brand || trip.dates
              ? ` · ${[trip.brand, trip.dates].filter(Boolean).join(" · ")}`
              : null}
          </p>
        </footer>
      </div>
    </>
  );
}
