/** Atmosphere presets for trip heroes and list thumbnails (client + server safe). */

export const COVER_PRESETS = {
  coast: {
    label: "Coast",
    type: "photos",
    images: [
      { src: "/images/hue.jpg", width: 1800, height: 1197, className: "hero-photo-hue" },
      {
        src: "/images/danang-coast.jpg",
        width: 1800,
        height: 1348,
        className: "hero-photo-danang",
      },
    ],
    thumbClass: "cover-thumb-coast",
  },
  mist: {
    label: "Mist",
    type: "gradient",
    thumbClass: "cover-thumb-mist",
    heroClass: "hero-atmosphere cover-mist",
  },
  sunrise: {
    label: "Sunrise",
    type: "gradient",
    thumbClass: "cover-thumb-sunrise",
    heroClass: "hero-atmosphere cover-sunrise",
  },
  lagoon: {
    label: "Lagoon",
    type: "gradient",
    thumbClass: "cover-thumb-lagoon",
    heroClass: "hero-atmosphere cover-lagoon",
  },
};

export const COVER_KEYS = Object.keys(COVER_PRESETS);

export function isCoverKey(value) {
  return typeof value === "string" && Boolean(COVER_PRESETS[value]);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Pick a valid cover key for a trip (defaults for seed / new trips). */
export function resolveCoverKey(cover, tripId = "") {
  if (isCoverKey(cover)) return cover;
  if (tripId === "central-coast") return "coast";

  const gradients = COVER_KEYS.filter((key) => COVER_PRESETS[key].type === "gradient");
  if (!tripId || !gradients.length) return gradients[0] || "mist";
  return gradients[hashString(tripId) % gradients.length];
}

export function getCoverPreset(cover, tripId = "") {
  return COVER_PRESETS[resolveCoverKey(cover, tripId)];
}
