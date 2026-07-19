import {
  listTrips,
  createTrip,
  validateTripMeta,
  canPersistItinerary,
} from "../../../lib/trip-store";
import { isEditUnlocked } from "../../../lib/edit-session";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { trips, source } = await listTrips();
      return res.status(200).json({
        trips,
        source,
        unlocked: isEditUnlocked(req),
      });
    } catch (error) {
      console.error("GET /api/trips failed", error);
      return res.status(500).json({ error: "Failed to load trips" });
    }
  }

  if (req.method === "POST") {
    if (!process.env.EDIT_PIN || !process.env.SESSION_SECRET) {
      return res.status(503).json({ error: "Edit mode is not configured" });
    }

    if (!isEditUnlocked(req)) {
      return res.status(401).json({ error: "Unlock required" });
    }

    if (!canPersistItinerary()) {
      return res.status(503).json({
        error:
          "Redis is not configured. Add Upstash env vars to save shared changes.",
      });
    }

    const body = req.body ?? {};
    const metaError = validateTripMeta(body, { requireTitle: true });
    if (metaError) {
      return res.status(400).json({ error: metaError });
    }

    try {
      const { trip, source } = await createTrip({
        brand: typeof body.brand === "string" ? body.brand.trim() : "New Trip",
        title: body.title.trim(),
        subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() : "",
        dates: typeof body.dates === "string" ? body.dates.trim() : "",
        route: typeof body.route === "string" ? body.route.trim() : "",
        hotels: typeof body.hotels === "string" ? body.hotels.trim() : "",
        cover: typeof body.cover === "string" ? body.cover : undefined,
      });
      return res.status(201).json({ trip, source });
    } catch (error) {
      console.error("POST /api/trips failed", error);
      return res.status(500).json({ error: "Failed to create trip" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed" });
}
