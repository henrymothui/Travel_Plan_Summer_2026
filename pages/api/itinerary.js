import {
  getDays,
  saveDays,
  validateDays,
  canPersistItinerary,
} from "../../lib/itinerary-store";
import { isEditUnlocked } from "../../lib/edit-session";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { days, source } = await getDays();
      return res.status(200).json({
        days,
        source,
        unlocked: isEditUnlocked(req),
      });
    } catch (error) {
      console.error("GET /api/itinerary failed", error);
      return res.status(500).json({ error: "Failed to load itinerary" });
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

    const days = req.body?.days;
    const validationError = validateDays(days);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const { days: saved, source } = await saveDays(days);
      return res.status(200).json({ days: saved, source });
    } catch (error) {
      console.error("PUT /api/itinerary failed", error);
      return res.status(500).json({ error: "Failed to save itinerary" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ error: "Method not allowed" });
}
