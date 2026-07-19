import {
  verifyPin,
  createSessionToken,
  buildUnlockCookie,
} from "../../lib/edit-session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.EDIT_PIN || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: "Edit mode is not configured" });
  }

  const pin = req.body?.pin;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: "Incorrect PIN" });
  }

  const token = createSessionToken();
  res.setHeader("Set-Cookie", buildUnlockCookie(token));
  return res.status(200).json({ ok: true });
}
