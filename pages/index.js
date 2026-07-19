import Head from "next/head";
import { Fraunces, Outfit } from "next/font/google";
import { useEffect, useState } from "react";
import { days, trip, typeLabels } from "../data/itinerary";

const STORAGE_KEY = "central-coast-itinerary-done";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

function activityKey(dayId, item, index) {
  return `${dayId}::${index}::${item.time}::${item.title}`;
}

export default function Home() {
  const [activeId, setActiveId] = useState(days[0].id);
  const [animKey, setAnimKey] = useState(0);
  const [completed, setCompleted] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const active = days.find((d) => d.id === activeId) ?? days[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setCompleted(parsed);
        }
      }
    } catch {
      // Ignore corrupted storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      // Ignore quota / private mode failures
    }
  }, [completed, hydrated]);

  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [activeId]);

  function selectDay(id) {
    setActiveId(id);
  }

  function scrollToItinerary() {
    document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleActivity(key) {
    setCompleted((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const dayDoneCount = active.activities.filter(
    (item, index) => completed[activityKey(active.id, item, index)],
  ).length;
  const dayTotal = active.activities.length;

  return (
    <>
      <Head>
        <title>{`${trip.brand} · ${trip.title}`}</title>
        <meta name="description" content={trip.subtitle} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={`${display.variable} ${sans.variable} page`}>
        <div className="atmosphere" aria-hidden="true" />

        <header className="hero">
          <p className="brand">{trip.brand}</p>
          <h1 className="hero-title">{trip.title}</h1>
          <p className="hero-lede">{trip.subtitle}</p>
          <div className="hero-meta">
            <span>{trip.dates}</span>
            <span className="dot" aria-hidden="true" />
            <span>{trip.route}</span>
            <span className="dot" aria-hidden="true" />
            <span>{trip.hotels}</span>
          </div>
          <button type="button" className="cta" onClick={scrollToItinerary}>
            Open the itinerary
          </button>
        </header>

        <main id="itinerary" className="itinerary">
          <div className="section-head">
            <h2>Day by day</h2>
            <p>Choose a day to see times, transport, meals, and stops. Tick items as you go — progress is saved on this device.</p>
          </div>

          <div className="tabs" role="tablist" aria-label="Trip days">
            {days.map((day) => {
              const selected = day.id === activeId;
              const done = day.activities.filter(
                (item, index) => completed[activityKey(day.id, item, index)],
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

          <section
            key={animKey}
            className="day-panel"
            role="tabpanel"
            aria-label={`${active.label}: ${active.theme}`}
          >
            <div className="day-intro">
              <p className="day-kicker">
                {active.label} · {active.date} · {active.city}
              </p>
              <h3>{active.theme}</h3>
              <p className="day-summary">{active.summary}</p>
              <p className="day-progress" aria-live="polite">
                {dayDoneCount} of {dayTotal} completed
              </p>
            </div>

            <ol className="timeline">
              {active.activities.map((item, index) => {
                const key = activityKey(active.id, item, index);
                const isDone = Boolean(completed[key]);
                return (
                  <li
                    key={key}
                    className={`timeline-item${isDone ? " is-done" : ""}`}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
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
                        <span className={`type type-${item.type}`}>
                          {typeLabels[item.type]}
                        </span>
                        <h4>{item.title}</h4>
                        <p>{item.detail}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </main>

        <footer className="footer">
          <p>
            {trip.brand} · {trip.dates}
          </p>
        </footer>
      </div>
    </>
  );
}
