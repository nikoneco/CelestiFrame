import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaceQuery, searchPlaces } from "../js/map/geocoder.js";

test("normalizePlaceQuery trims and collapses whitespace", () => {
  assert.equal(normalizePlaceQuery("  東京   スカイツリー "), "東京 スカイツリー");
});

test("searchPlaces builds a restricted Japanese query and normalizes results", async () => {
  let requestedUrl;
  const results = await searchPlaces("東京スカイツリー", {
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => [{ osm_type: "way", osm_id: 1, display_name: "東京スカイツリー, 東京都", type: "attraction", lat: "35.7101", lon: "139.8107" }],
      };
    },
  });
  assert.equal(requestedUrl.searchParams.get("limit"), "5");
  assert.equal(requestedUrl.searchParams.get("countrycodes"), "jp");
  assert.equal(requestedUrl.searchParams.get("accept-language"), "ja");
  assert.deepEqual(results[0], {
    id: "way-1",
    displayName: "東京スカイツリー, 東京都",
    type: "attraction",
    latitude: 35.7101,
    longitude: 139.8107,
  });
});

test("searchPlaces rejects short queries before requesting", async () => {
  await assert.rejects(() => searchPlaces("東", { fetchImpl: () => assert.fail("fetch should not run") }), /2文字以上/);
});

test("searchPlaces rejects overlong queries before requesting", async () => {
  await assert.rejects(
    () => searchPlaces("東".repeat(121), { fetchImpl: () => assert.fail("fetch should not run") }),
    /120文字以内/,
  );
});
