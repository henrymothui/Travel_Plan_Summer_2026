import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { days as seedDays, trip as seedTrip } from "../data/itinerary";
import {
  DAYS_KEY,
  withActivityIds,
  validateDays,
  redisConfigured,
  localFileStoreAvailable,
  canPersistItinerary,
} from "./itinerary-store";

export { validateDays, canPersistItinerary, redisConfigured, localFileStoreAvailable };

export const TRIPS_KEY = "itinerary:trips";
const LOCAL_TRIPS_PATH = path.join(process.cwd(), "data", "trips.local.json");
const LOCAL_DAYS_PATH = path.join(process.cwd(), "data", "itinerary.local.json");

function getRedis() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).",
    );
  }

  return new Redis({ url, token });
}

export function createTripId() {
  return `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function seedDefaultTrip() {
  return {
    id: "central-coast",
    brand: seedTrip.brand,
    title: seedTrip.title,
    subtitle: seedTrip.subtitle,
    dates: seedTrip.dates,
    route: seedTrip.route,
    hotels: seedTrip.hotels,
    days: withActivityIds(seedDays),
    updatedAt: Date.now(),
  };
}

export function emptyTripDraft(overrides = {}) {
  const id = overrides.id || createTripId();
  return {
    id,
    brand: overrides.brand ?? "New Trip",
    title: overrides.title ?? "Untitled itinerary",
    subtitle: overrides.subtitle ?? "",
    dates: overrides.dates ?? "",
    route: overrides.route ?? "",
    hotels: overrides.hotels ?? "",
    days: withActivityIds(
      overrides.days ?? [
        {
          id: "day1",
          label: "Day 1",
          date: "",
          city: "",
          theme: "Day 1",
          summary: "",
          activities: [],
        },
      ],
    ),
    updatedAt: Date.now(),
  };
}

export function tripSummary(trip) {
  return {
    id: trip.id,
    brand: trip.brand,
    title: trip.title,
    subtitle: trip.subtitle,
    dates: trip.dates,
    route: trip.route,
    hotels: trip.hotels,
    dayCount: Array.isArray(trip.days) ? trip.days.length : 0,
    updatedAt: trip.updatedAt ?? null,
  };
}

function normalizeTrip(trip) {
  if (!trip || typeof trip !== "object") return null;
  if (typeof trip.id !== "string" || !trip.id) return null;

  return {
    id: trip.id,
    brand: typeof trip.brand === "string" ? trip.brand : "",
    title: typeof trip.title === "string" ? trip.title : "Untitled",
    subtitle: typeof trip.subtitle === "string" ? trip.subtitle : "",
    dates: typeof trip.dates === "string" ? trip.dates : "",
    route: typeof trip.route === "string" ? trip.route : "",
    hotels: typeof trip.hotels === "string" ? trip.hotels : "",
    days: withActivityIds(Array.isArray(trip.days) ? trip.days : []),
    updatedAt:
      typeof trip.updatedAt === "number" && Number.isFinite(trip.updatedAt)
        ? trip.updatedAt
        : Date.now(),
  };
}

function normalizeTrips(trips) {
  if (!Array.isArray(trips)) return [];
  return trips.map(normalizeTrip).filter(Boolean);
}

async function readLegacyLocalDays() {
  try {
    const raw = await fs.readFile(LOCAL_DAYS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return withActivityIds(parsed);
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  return null;
}

async function migrateFromLegacy() {
  if (redisConfigured()) {
    const redis = getRedis();
    const stored = await redis.get(DAYS_KEY);
    if (Array.isArray(stored) && stored.length) {
      const trip = {
        ...seedDefaultTrip(),
        days: withActivityIds(stored),
        updatedAt: Date.now(),
      };
      return [trip];
    }
    return [seedDefaultTrip()];
  }

  if (localFileStoreAvailable()) {
    const legacyDays = await readLegacyLocalDays();
    if (legacyDays) {
      return [
        {
          ...seedDefaultTrip(),
          days: legacyDays,
          updatedAt: Date.now(),
        },
      ];
    }
  }

  return [seedDefaultTrip()];
}

async function readLocalTrips() {
  try {
    const raw = await fs.readFile(LOCAL_TRIPS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const trips = normalizeTrips(parsed?.trips ?? parsed);
    if (trips.length) return trips;
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  return null;
}

async function writeLocalTrips(trips) {
  const normalized = normalizeTrips(trips);
  await fs.mkdir(path.dirname(LOCAL_TRIPS_PATH), { recursive: true });
  await fs.writeFile(
    LOCAL_TRIPS_PATH,
    `${JSON.stringify({ trips: normalized }, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

async function loadAllTrips() {
  if (redisConfigured()) {
    const redis = getRedis();
    const stored = await redis.get(TRIPS_KEY);
    const trips = normalizeTrips(stored?.trips ?? stored);
    if (trips.length) {
      return { trips, source: "redis" };
    }

    const migrated = await migrateFromLegacy();
    await redis.set(TRIPS_KEY, { trips: migrated });
    return { trips: migrated, source: "redis" };
  }

  if (localFileStoreAvailable()) {
    const local = await readLocalTrips();
    if (local) return { trips: local, source: "local" };

    const migrated = await migrateFromLegacy();
    const saved = await writeLocalTrips(migrated);
    return { trips: saved, source: "local" };
  }

  return { trips: [seedDefaultTrip()], source: "seed" };
}

async function persistAllTrips(trips) {
  const normalized = normalizeTrips(trips);

  if (redisConfigured()) {
    const redis = getRedis();
    await redis.set(TRIPS_KEY, { trips: normalized });
    return { trips: normalized, source: "redis" };
  }

  if (localFileStoreAvailable()) {
    const saved = await writeLocalTrips(normalized);
    return { trips: saved, source: "local" };
  }

  throw new Error(
    "No durable store configured. Add Upstash Redis env vars to save shared changes.",
  );
}

export async function listTrips() {
  const { trips, source } = await loadAllTrips();
  return {
    trips: trips
      .slice()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map(tripSummary),
    source,
  };
}

export async function getTrip(id) {
  const { trips, source } = await loadAllTrips();
  const trip = trips.find((item) => item.id === id) ?? null;
  return { trip, source };
}

export async function createTrip(input = {}) {
  const { trips } = await loadAllTrips();
  const trip = emptyTripDraft(input);
  const next = [trip, ...trips];
  const { trips: saved, source } = await persistAllTrips(next);
  return { trip: saved.find((item) => item.id === trip.id), source };
}

export async function updateTrip(id, patch = {}) {
  const { trips } = await loadAllTrips();
  const index = trips.findIndex((item) => item.id === id);
  if (index === -1) return { trip: null, source: null };

  const current = trips[index];
  const nextTrip = normalizeTrip({
    ...current,
    ...patch,
    id: current.id,
    days: patch.days !== undefined ? patch.days : current.days,
    updatedAt: Date.now(),
  });

  const next = trips.slice();
  next[index] = nextTrip;
  const { trips: saved, source } = await persistAllTrips(next);
  return { trip: saved.find((item) => item.id === id) ?? nextTrip, source };
}

export async function deleteTrip(id) {
  const { trips } = await loadAllTrips();
  const next = trips.filter((item) => item.id !== id);
  if (next.length === trips.length) {
    return { deleted: false, source: null };
  }
  const { source } = await persistAllTrips(next);
  return { deleted: true, source };
}

export function validateTripMeta(meta, { requireTitle = true } = {}) {
  if (!meta || typeof meta !== "object") return "trip metadata is required";

  const fields = ["brand", "title", "subtitle", "dates", "route", "hotels"];
  for (const field of fields) {
    if (meta[field] !== undefined && typeof meta[field] !== "string") {
      return `trip.${field} must be a string`;
    }
  }

  if (requireTitle) {
    const title = typeof meta.title === "string" ? meta.title.trim() : "";
    if (!title) return "trip.title is required";
  }

  if (meta.brand !== undefined && meta.brand.length > 80) {
    return "trip.brand is too long";
  }
  if (meta.title !== undefined && meta.title.length > 120) {
    return "trip.title is too long";
  }
  if (meta.subtitle !== undefined && meta.subtitle.length > 400) {
    return "trip.subtitle is too long";
  }

  return null;
}

export function validateTripPayload(trip, { requireDays = true } = {}) {
  const metaError = validateTripMeta(trip, { requireTitle: true });
  if (metaError) return metaError;

  if (requireDays || trip.days !== undefined) {
    if (!Array.isArray(trip.days) || trip.days.length === 0) {
      return "trip.days must be a non-empty array";
    }
    const daysError = validateDays(trip.days);
    if (daysError) return daysError;
  }

  return null;
}
