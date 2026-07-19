import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE_NAME = "itinerary_edit";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return secret;
}

function getEditPin() {
  const pin = process.env.EDIT_PIN;
  if (!pin) {
    throw new Error("EDIT_PIN is not configured");
  }
  return pin;
}

function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyPin(pin) {
  if (typeof pin !== "string") return false;
  const expected = getEditPin();
  try {
    return safeEqual(pin, expected);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `edit:${expiresAt}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return false;

  const lastDot = token.lastIndexOf(".");
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!payload || !signature) return false;

  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return false;

  const [, expiresRaw] = payload.split(":");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = decodeURIComponent(value);
  }

  return out;
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

export function buildUnlockCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

export function buildClearCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function isEditUnlocked(req) {
  return getSessionFromRequest(req);
}
