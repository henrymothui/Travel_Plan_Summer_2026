import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { days as seedDays } from "../data/itinerary";

export const DAYS_KEY = "itinerary:days";
const LOCAL_STORE_PATH = path.join(process.cwd(), "data", "itinerary.local.json");

const TYPE_SET = new Set([
  "transport",
  "sightseeing",
  "food",
  "shopping",
  "rest",
]);

export function redisConfigured() {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

/** Local JSON file is for development only — Vercel has no durable filesystem. */
export function localFileStoreAvailable() {
  return !redisConfigured() && process.env.VERCEL !== "1";
}

export function canPersistItinerary() {
  return redisConfigured() || localFileStoreAvailable();
}

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

export function withActivityIds(sourceDays) {
  return sourceDays.map((day) => ({
    ...day,
    activities: day.activities.map((item, index) => ({
      ...item,
      id: item.id ?? `${day.id}-${index}`,
    })),
  }));
}

export function seedItineraryDays() {
  return withActivityIds(seedDays);
}

async function readLocalDays() {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return withActivityIds(parsed);
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
  return null;
}

async function writeLocalDays(days) {
  const normalized = withActivityIds(days);
  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_STORE_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function getDays() {
  if (redisConfigured()) {
    const redis = getRedis();
    const stored = await redis.get(DAYS_KEY);

    if (Array.isArray(stored) && stored.length) {
      return { days: withActivityIds(stored), source: "redis" };
    }

    const seeded = seedItineraryDays();
    await redis.set(DAYS_KEY, seeded);
    return { days: seeded, source: "redis" };
  }

  if (localFileStoreAvailable()) {
    const local = await readLocalDays();
    if (local) return { days: local, source: "local" };
  }

  return { days: seedItineraryDays(), source: "seed" };
}

export async function saveDays(days) {
  if (redisConfigured()) {
    const redis = getRedis();
    const normalized = withActivityIds(days);
    await redis.set(DAYS_KEY, normalized);
    return { days: normalized, source: "redis" };
  }

  if (localFileStoreAvailable()) {
    const normalized = await writeLocalDays(days);
    return { days: normalized, source: "local" };
  }

  throw new Error(
    "No durable store configured. Add Upstash Redis env vars to save shared changes.",
  );
}

export function validateDays(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return "days must be a non-empty array";
  }

  for (const day of days) {
    if (!day || typeof day !== "object") return "invalid day";
    if (typeof day.id !== "string" || !day.id) return "day.id is required";
    if (!Array.isArray(day.activities)) return "day.activities must be an array";

    for (const item of day.activities) {
      if (!item || typeof item !== "object") return "invalid activity";
      if (typeof item.id !== "string" || !item.id) return "activity.id is required";
      if (typeof item.time !== "string" || !item.time) return "activity.time is required";
      if (typeof item.title !== "string" || !item.title.trim()) {
        return "activity.title is required";
      }
      if (typeof item.detail !== "string") return "activity.detail must be a string";
      if (!TYPE_SET.has(item.type)) return "activity.type is invalid";
    }
  }

  return null;
}
