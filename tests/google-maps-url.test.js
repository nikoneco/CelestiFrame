import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsSearchUrl } from "../js/map/google-maps-url.js";

const location = { latitude: 35.360625, longitude: 138.727363 };

test("Google Maps directions uses the shooting point as its destination", () => {
  const url = new URL(buildGoogleMapsDirectionsUrl(location));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("destination"), "35.360625,138.727363");
  assert.equal(url.searchParams.has("origin"), false);
});

test("Google Maps search pins the supplied location", () => {
  const url = new URL(buildGoogleMapsSearchUrl(location));
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "35.360625,138.727363");
});

test("Google Maps URLs reject invalid coordinates", () => {
  assert.throws(() => buildGoogleMapsSearchUrl({ latitude: 91, longitude: 0 }), /緯度/);
  assert.throws(() => buildGoogleMapsDirectionsUrl({ latitude: 0, longitude: 181 }), /経度/);
});
