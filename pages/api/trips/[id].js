import {
  getTrip,
  updateTrip,
  deleteTrip,
  validateTripMeta,
  validateDays,
  canPersistItinerary,
  tripSummary,
} from "../../../lib/trip-store";
import { isEditUnlocked } from "../../../lib/edit-session";

export default async function handler(req, res) {
  const { id } = req.query;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Trip id is required" });
  }

  if (req.method === "GET") {
    try {
      const { trip, source } = await getTrip(id);
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      return res.status(200).json({
        trip,
        source,
        unlocked: isEditUnlocked(req),
      });
    } catch (error) {
      console.error("GET /api/trips/[id] failed", error);
      return res.status(500).json({ error: "Failed to load trip" });
    }
  }

  if (req.method === "PUT") {
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
    const patch = {};

    if (
      body.brand !== undefined ||
      body.title !== undefined ||
      body.subtitle !== undefined ||
      body.dates !== undefined ||
      body.route !== undefined ||
      body.hotels !== undefined
    ) {
      const meta = {
        brand: body.brand,
        title: body.title,
        subtitle: body.subtitle,
        dates: body.dates,
        route: body.route,
        hotels: body.hotels,
      };
      const metaError = validateTripMeta(meta, {
        requireTitle: body.title !== undefined,
      });
      if (metaError) {
        return res.status(400).json({ error: metaError });
      }

      for (const field of [
        "brand",
        "title",
        "subtitle",
        "dates",
        "route",
        "hotels",
      ]) {
        if (typeof body[field] === "string") {
          patch[field] = body[field].trim();
        }
      }
    }

    if (body.days !== undefined) {
      const daysError = validateDays(body.days);
      if (daysError) {
        return res.status(400).json({ error: daysError });
      }
      patch.days = body.days;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No trip fields to update" });
    }

    try {
      const { trip, source } = await updateTrip(id, patch);
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      return res.status(200).json({ trip, source, summary: tripSummary(trip) });
    } catch (error) {
      console.error("PUT /api/trips/[id] failed", error);
      return res.status(500).json({ error: "Failed to save trip" });
    }
  }

  if (req.method === "DELETE") {
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

    try {
      const { deleted, source } = await deleteTrip(id);
      if (!deleted) {
        return res.status(404).json({ error: "Trip not found" });
      }
      return res.status(200).json({ ok: true, source });
    } catch (error) {
      console.error("DELETE /api/trips/[id] failed", error);
      return res.status(500).json({ error: "Failed to delete trip" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
