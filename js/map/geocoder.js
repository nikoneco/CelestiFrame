export const DEFAULT_GEOCODER_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export function normalizePlaceQuery(query) {
  return String(query ?? "").trim().replace(/\s+/g, " ");
}

export async function searchPlaces(query, {
  fetchImpl = fetch,
  endpoint = DEFAULT_GEOCODER_ENDPOINT,
  language = "ja",
} = {}) {
  const normalized = normalizePlaceQuery(query);
  if (normalized.length < 2) throw new Error("地名や施設名を2文字以上入力してください");

  const url = new URL(endpoint);
  url.searchParams.set("q", normalized);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", language);

  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    referrerPolicy: "strict-origin-when-cross-origin",
  });
  if (!response.ok) throw new Error(`場所検索に失敗しました（${response.status}）`);
  const payload = await response.json();

  return payload
    .map((item) => ({
      id: `${item.osm_type ?? "place"}-${item.osm_id ?? item.place_id}`,
      displayName: item.display_name,
      type: item.type ?? item.category ?? "place",
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }))
    .filter((item) => item.displayName && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}
