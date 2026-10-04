/**
 * When the sun comes up for this player. Pure arithmetic (the NOAA sunrise
 * approximation, good to a minute or two away from the poles) plus a guess at
 * where the player is: their own location if they shared it, else their time
 * zone's main city, else a point on their UTC offset's meridian.
 */

export interface Coords {
  lat: number;
  lon: number;
  /** How we know: 'device' (they shared it), 'zone' (their time zone's city) or 'offset'. */
  source: 'device' | 'zone' | 'offset';
}

/** The window before sunrise in which the warning shows. */
export const DAWN_WINDOW_MIN = 30;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (v: number, max: number) => ((v % max) + max) % max;

/** Sunrise on the UTC calendar day of `day`, as a Date, or null when the sun doesn't rise (polar night/day). */
export function sunriseOn(day: Date, lat: number, lon: number): Date | null {
  const start = Date.UTC(day.getUTCFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - start) / 86_400_000);
  const lngHour = lon / 15;
  const t = n + (6 - lngHour) / 24;
  const m = 0.9856 * t - 3.289;
  const l = norm(m + 1.916 * Math.sin(rad(m)) + 0.02 * Math.sin(rad(2 * m)) + 282.634, 360);
  let ra = norm(deg(Math.atan(0.91764 * Math.tan(rad(l)))), 360);
  ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
  ra /= 15;
  const sinDec = 0.39782 * Math.sin(rad(l));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1) return null;
  const h = (360 - deg(Math.acos(cosH))) / 15;
  const ut = norm(h + ra - 0.06571 * t - 6.622 - lngHour, 24);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + ut * 3_600_000);
}

/** The first sunrise after `now` (looking up to three days ahead, which covers any time zone). */
export function nextSunrise(now: Date, c: Pick<Coords, 'lat' | 'lon'>): Date | null {
  for (let d = -1; d <= 2; d++) {
    const s = sunriseOn(new Date(now.getTime() + d * 86_400_000), c.lat, c.lon);
    if (s && s.getTime() > now.getTime()) return s;
  }
  return null;
}

export interface DawnState {
  /** Minutes until sunrise, inside the warning window; null outside it. */
  minutes: number | null;
  /** 0 at the start of the window, 1 at sunrise. */
  progress: number;
  sunrise: Date | null;
}

export function dawnState(now: Date, c: Pick<Coords, 'lat' | 'lon'>): DawnState {
  const sunrise = nextSunrise(now, c);
  if (!sunrise) return { minutes: null, progress: 0, sunrise };
  const left = (sunrise.getTime() - now.getTime()) / 60_000;
  if (left > DAWN_WINDOW_MIN) return { minutes: null, progress: 0, sunrise };
  return { minutes: Math.max(0, Math.ceil(left)), progress: 1 - left / DAWN_WINDOW_MIN, sunrise };
}

/** Main cities for common time zones: close enough for a warning, and no permission prompt. */
const ZONES: Record<string, [number, number]> = {
  'America/New_York': [40.71, -74.01], 'America/Detroit': [42.33, -83.05], 'America/Toronto': [43.65, -79.38],
  'America/Montreal': [45.5, -73.57], 'America/Halifax': [44.65, -63.57], 'America/St_Johns': [47.56, -52.71],
  'America/Chicago': [41.88, -87.63], 'America/Winnipeg': [49.9, -97.14], 'America/Mexico_City': [19.43, -99.13],
  'America/Denver': [39.74, -104.99], 'America/Phoenix': [33.45, -112.07], 'America/Edmonton': [53.55, -113.49],
  'America/Los_Angeles': [34.05, -118.24], 'America/Vancouver': [49.28, -123.12], 'America/Anchorage': [61.22, -149.9],
  'Pacific/Honolulu': [21.31, -157.86], 'America/Sao_Paulo': [-23.55, -46.63], 'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Bogota': [4.71, -74.07], 'America/Lima': [-12.05, -77.04], 'America/Santiago': [-33.45, -70.67],
  'Europe/London': [51.51, -0.13], 'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14],
  'Europe/Paris': [48.86, 2.35], 'Europe/Madrid': [40.42, -3.7], 'Europe/Berlin': [52.52, 13.4],
  'Europe/Amsterdam': [52.37, 4.9], 'Europe/Brussels': [50.85, 4.35], 'Europe/Rome': [41.9, 12.5],
  'Europe/Vienna': [48.21, 16.37], 'Europe/Prague': [50.08, 14.44], 'Europe/Warsaw': [52.23, 21.01],
  'Europe/Stockholm': [59.33, 18.07], 'Europe/Oslo': [59.91, 10.75], 'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Helsinki': [60.17, 24.94], 'Europe/Athens': [37.98, 23.73], 'Europe/Istanbul': [41.01, 28.98],
  'Europe/Bucharest': [44.43, 26.1], 'Europe/Budapest': [47.5, 19.04], 'Europe/Kyiv': [50.45, 30.52],
  'Europe/Moscow': [55.76, 37.62], 'Africa/Cairo': [30.04, 31.24], 'Africa/Johannesburg': [-26.2, 28.05],
  'Africa/Lagos': [6.52, 3.38], 'Africa/Nairobi': [-1.29, 36.82], 'Asia/Dubai': [25.2, 55.27],
  'Asia/Kolkata': [28.61, 77.21], 'Asia/Bangkok': [13.76, 100.5], 'Asia/Singapore': [1.35, 103.82],
  'Asia/Shanghai': [31.23, 121.47], 'Asia/Hong_Kong': [22.32, 114.17], 'Asia/Taipei': [25.03, 121.57],
  'Asia/Seoul': [37.57, 126.98], 'Asia/Tokyo': [35.68, 139.69], 'Asia/Manila': [14.6, 120.98],
  'Asia/Jakarta': [-6.21, 106.85], 'Australia/Perth': [-31.95, 115.86], 'Australia/Adelaide': [-34.93, 138.6],
  'Australia/Brisbane': [-27.47, 153.03], 'Australia/Sydney': [-33.87, 151.21], 'Australia/Melbourne': [-37.81, 144.96],
  'Pacific/Auckland': [-36.85, 174.76],
};

/** Best guess without asking: the time zone's city, else the offset's meridian at a mid latitude. */
export function guessCoords(timeZone: string | undefined, offsetMinutes: number): Coords {
  const z = timeZone ? ZONES[timeZone] : undefined;
  if (z) return { lat: z[0], lon: z[1], source: 'zone' };
  return { lat: 40, lon: (-offsetMinutes / 60) * 15, source: 'offset' };
}

/** Where the browser keeps a location the player chose to share. */
export const COORDS_KEY = 'coterie-dawn-coords';

/** This player's coordinates: the ones they shared, else a guess from the time zone. Browser only. */
export function localCoords(): Coords {
  try {
    const saved = JSON.parse(localStorage.getItem(COORDS_KEY) ?? 'null');
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') return { lat: saved.lat, lon: saved.lon, source: 'device' };
  } catch {
    // No storage: guess.
  }
  return guessCoords(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().getTimezoneOffset());
}

/** "2 h 14 m" until the next sunrise, or null when there isn't one (polar night). */
export function untilDawn(now: Date, c: Pick<Coords, 'lat' | 'lon'>): string | null {
  const s = nextSunrise(now, c);
  if (!s) return null;
  const mins = Math.max(0, Math.round((s.getTime() - now.getTime()) / 60_000));
  return `${Math.floor(mins / 60)} h ${mins % 60} m`;
}
