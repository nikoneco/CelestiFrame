const GOOGLE_MAPS_BASE = "https://www.google.com/maps";

function coordinateQuery(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("緯度が正しくありません");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("経度が正しくありません");
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function mapsUrl(action, parameter, location) {
  const url = new URL(`${GOOGLE_MAPS_BASE}/${action}/`);
  url.searchParams.set("api", "1");
  url.searchParams.set(parameter, coordinateQuery(location));
  return url.toString();
}

export function buildGoogleMapsDirectionsUrl(location) {
  return mapsUrl("dir", "destination", location);
}

export function buildGoogleMapsSearchUrl(location) {
  return mapsUrl("search", "query", location);
}
