import test from "node:test";
import assert from "node:assert/strict";
import { focusCurrentLocation } from "../js/map/map-controller.js";

test("current location moves only the map view and preserves the shooting point", () => {
  const calls = [];
  const mapController = {
    map: { getZoom: () => 12 },
    focusLocation: (location, zoom) => calls.push({ method: "focusLocation", location, zoom }),
    setLocation: () => calls.push({ method: "setLocation" }),
  };

  assert.equal(focusCurrentLocation(mapController, { latitude: 35.6812, longitude: 139.7671 }), true);
  assert.deepEqual(calls, [{
    method: "focusLocation",
    location: { latitude: 35.6812, longitude: 139.7671 },
    zoom: 14,
  }]);
});

test("current location keeps a closer zoom level", () => {
  let focusedZoom;
  const mapController = {
    map: { getZoom: () => 17 },
    focusLocation: (_location, zoom) => { focusedZoom = zoom; },
  };

  focusCurrentLocation(mapController, { latitude: 35, longitude: 139 });
  assert.equal(focusedZoom, 17);
});
