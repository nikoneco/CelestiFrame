import { destinationPoint } from "../geometry/destination.js?v=1.8.0";
import { getTarget } from "../astronomy/target-catalog.js?v=1.8.0";

// This is a visual scale for the schematic sky fan, not a physical observing
// distance.  It is converted from pixels for the current Leaflet zoom so the
// fan and its core marker remain legible at normal map sizes.
export const MILKY_WAY_FAN_RADIUS_PIXELS = 170;
const FALLBACK_FAN_RADIUS_METERS = 35000;

export function focusCurrentLocation(mapController, coords, minimumZoom = 14) {
  if (!mapController) return false;
  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const currentZoom = Number(mapController.map?.getZoom?.());
  const zoom = Math.max(Number.isFinite(currentZoom) ? currentZoom : minimumZoom, minimumZoom);
  mapController.focusLocation({ latitude, longitude }, zoom);
  return true;
}

export function directionLineLocations(location, azimuth, origin, distanceMeters = 35000) {
  const celestialDirection = destinationPoint(location, azimuth, distanceMeters);
  if (origin !== "subject") return [location, celestialDirection];
  const cameraCandidateDirection = destinationPoint(location, (azimuth + 180) % 360, distanceMeters);
  return [cameraCandidateDirection, location, celestialDirection];
}

export function milkyWayFanLocations(location, segment, distanceMeters = FALLBACK_FAN_RADIUS_METERS) {
  if (!location || !Array.isArray(segment?.points) || segment.points.length < 2) return [];
  return [location, ...segment.points.map((point) => milkyWayDestination(location, point.azimuth, distanceMeters))];
}

function milkyWayDestination(location, azimuth, distanceMeters) {
  const point = destinationPoint(location, azimuth, distanceMeters);
  // Leaflet renders continuous world copies. Keep a nearby sky direction on
  // the same copy as its origin when a small fan crosses the date line.
  const originLongitude = Number(location.longitude);
  const delta = ((point.longitude - originLongitude + 180) % 360 + 360) % 360 - 180;
  return { ...point, longitude: originLongitude + delta };
}

function displayScaleRadiusMeters(map, location, radiusPixels = MILKY_WAY_FAN_RADIUS_PIXELS) {
  try {
    const viewportWidth = Number(map.getContainer?.()?.clientWidth);
    const boundedPixels = Number.isFinite(viewportWidth) && viewportWidth > 0
      ? Math.min(radiusPixels, Math.max(96, viewportWidth * 0.4))
      : radiusPixels;
    const originPoint = map.latLngToContainerPoint([location.latitude, location.longitude]);
    const targetPoint = L.point(originPoint.x + boundedPixels, originPoint.y);
    const targetLatLng = map.containerPointToLatLng(targetPoint);
    const radius = map.distance([location.latitude, location.longitude], targetLatLng);
    return Number.isFinite(radius) && radius > 0 ? radius : FALLBACK_FAN_RADIUS_METERS;
  } catch {
    return FALLBACK_FAN_RADIUS_METERS;
  }
}

function removeLayer(layer) {
  layer?.remove();
}

function removeLayerBundle(bundle) {
  if (!bundle) return;
  [...bundle.fans.values(), ...bundle.boundaries.values(), bundle.coreLine, bundle.coreMarker].forEach(removeLayer);
}

export function createMapController({
  elementId,
  initialLocation,
  initialZoom,
  onLocationChange,
  onSubjectLocationChange,
  onMapMove,
  onShootingCandidateSelect = () => {},
  tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
}) {
  if (!window.L) throw new Error("Leaflet is unavailable");

  const map = L.map(elementId, { zoomControl: false }).setView(
    [initialLocation.latitude, initialLocation.longitude],
    initialZoom,
  );

  map.attributionControl.setPosition("bottomleft");
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer(tileUrl, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const weatherPane = map.createPane("weather-pane");
  weatherPane.style.zIndex = "350";
  weatherPane.style.pointerEvents = "none";
  const lightPollutionPane = map.createPane("light-pollution-pane");
  lightPollutionPane.style.zIndex = "330";
  lightPollutionPane.style.pointerEvents = "none";

  const markerIcon = L.divIcon({
    className: "",
    html: '<div class="camera-marker" aria-hidden="true"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 20],
  });

  const marker = L.marker([initialLocation.latitude, initialLocation.longitude], {
    draggable: true,
    icon: markerIcon,
    title: "撮影地点",
  }).addTo(map);
  const celestialDirectionLayers = new Map();
  let shootingCandidateLayers = [];
  let cloudOverlayLayers = [];
  let lightPollutionLayer = null;
  let terrainObstructionMarker = null;
  let subjectMarker = null;
  let subjectLine = null;
  const milkyWayDirectionLayers = new Map();
  let latestCelestialDirections = [];
  let refreshCelestialDirections = null;
  const subjectMarkerIcon = L.divIcon({
    className: "",
    html: '<div class="subject-marker" aria-hidden="true"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  marker.on("dragend", () => {
    const { lat, lng } = marker.getLatLng();
    onLocationChange({ latitude: lat, longitude: lng });
  });

  map.on("moveend", () => {
    const center = map.getCenter();
    onMapMove({
      center: { latitude: center.lat, longitude: center.lng },
      zoom: map.getZoom(),
    });
  });

  map.on("zoomend", () => refreshCelestialDirections?.());
  map.on("resize", () => refreshCelestialDirections?.());

  const controller = {
    map,
    focusLocation(location, zoom = 16) {
      map.flyTo([location.latitude, location.longitude], zoom);
    },
    getVisibleBounds() {
      const bounds = map.getBounds();
      return {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };
    },
    setCloudOverlay(cells, { color = "#dceaff" } = {}) {
      cloudOverlayLayers.forEach((layer) => layer.remove());
      cloudOverlayLayers = cells.map((cell) => {
        const density = Math.max(0, Math.min(100, Number(cell?.value) || 0));
        const coverage = density / 100;
        const fillOpacity = coverage === 0 ? 0 : 0.08 + coverage * 0.62;
        return L.rectangle(
          [[cell.bounds.south, cell.bounds.west], [cell.bounds.north, cell.bounds.east]],
          {
            pane: "weather-pane",
            stroke: coverage > 0,
            color,
            weight: 0.8,
            opacity: coverage === 0 ? 0 : 0.08 + coverage * 0.16,
            fill: true,
            fillColor: color,
            fillOpacity,
            interactive: false,
            className: "forecast-cloud-cell",
          },
        ).addTo(map);
      });
    },
    clearCloudOverlay() {
      cloudOverlayLayers.forEach((layer) => layer.remove());
      cloudOverlayLayers = [];
    },
    setLightPollutionOverlay(tileUrl, { dataYear, onLoad = () => {}, onError = () => {} } = {}) {
      lightPollutionLayer?.remove();
      lightPollutionLayer = L.tileLayer(tileUrl, {
        pane: "light-pollution-pane",
        minZoom: 0,
        maxZoom: 19,
        maxNativeZoom: 8,
        opacity: 1,
        bounds: [[20, 120], [50, 160]],
        noWrap: true,
        crossOrigin: true,
        attribution: `Nighttime lights: <a href="https://doi.org/10.5067/VIIRS/VNP46A4.002" target="_blank" rel="noopener noreferrer">NASA VIIRS VNP46A4</a> (${dataYear})`,
        className: "light-pollution-tiles",
      });
      lightPollutionLayer.once("load", onLoad);
      lightPollutionLayer.once("tileerror", onError);
      lightPollutionLayer.addTo(map);
    },
    clearLightPollutionOverlay() {
      lightPollutionLayer?.remove();
      lightPollutionLayer = null;
    },
    setLocation(location, { pan = true } = {}) {
      marker.setLatLng([location.latitude, location.longitude]);
      if (pan) map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 14));
    },
    pickCenter() {
      const center = map.getCenter();
      const location = { latitude: center.lat, longitude: center.lng };
      marker.setLatLng(center);
      onLocationChange(location);
      return location;
    },
    pickSubjectCenter() {
      const center = map.getCenter();
      const location = { latitude: center.lat, longitude: center.lng };
      onSubjectLocationChange(location);
      return location;
    },
    setSubjectLocation(cameraLocation, subjectLocation) {
      if (!subjectMarker) {
        subjectMarker = L.marker([subjectLocation.latitude, subjectLocation.longitude], {
          draggable: true,
          icon: subjectMarkerIcon,
          title: "被写体地点",
        }).addTo(map);
        subjectMarker.on("dragend", () => {
          const { lat, lng } = subjectMarker.getLatLng();
          onSubjectLocationChange({ latitude: lat, longitude: lng });
        });
      } else {
        subjectMarker.setLatLng([subjectLocation.latitude, subjectLocation.longitude]);
      }
      const points = [[cameraLocation.latitude, cameraLocation.longitude], [subjectLocation.latitude, subjectLocation.longitude]];
      if (subjectLine) subjectLine.setLatLngs(points);
      else subjectLine = L.polyline(
        points,
        { color: "#ff6b6b", weight: 2, opacity: 0.78, dashArray: "3 6", interactive: false, className: "subject-direction-line" },
      ).addTo(map);
    },
    clearSubjectLocation() {
      subjectMarker?.remove();
      subjectLine?.remove();
      subjectMarker = null;
      subjectLine = null;
    },
    setCelestialDirections(directions) {
      latestCelestialDirections = Array.isArray(directions) ? directions : [];
      const retained = new Set();
      const retainedMilkyWay = new Set();
      latestCelestialDirections.forEach(({ targetId, location, data, origin }) => {
        const key = `${origin}:${targetId}`;
        const target = getTarget(targetId);
        const color = target?.color || "#dceaff";
        if (targetId === "milkyway") {
          retainedMilkyWay.add(key);
          const existing = milkyWayDirectionLayers.get(key);
          const radiusMeters = displayScaleRadiusMeters(map, location);
          const bundle = existing || {
            fans: new Map(),
            boundaries: new Map(),
            coreLine: null,
            coreMarker: null,
          };
          const segments = Array.isArray(data?.visibleSegments) ? data.visibleSegments : [];
          const retainedEdges = new Set();
          segments.forEach((segment, index) => {
            const edgeKey = String(segment.id ?? `${segment.edgeIndex ?? index}:${index}`);
            const locations = milkyWayFanLocations(location, segment, radiusMeters);
            if (locations.length < 3) return;
            retainedEdges.add(edgeKey);
            const centralWeight = Math.max(0, Math.min(1, Number(segment.centralWeight) || 0));
            if (origin === "camera") {
              const coordinates = locations.map((point) => [point.latitude, point.longitude]);
              const style = {
                color,
                weight: 0,
                opacity: 0,
                fill: true,
                fillColor: color,
                fillOpacity: 0.08 + centralWeight * 0.16,
                interactive: false,
                className: "milkyway-fan milkyway-fan-camera",
              };
              const layer = bundle.fans.get(edgeKey);
              if (layer) layer.setLatLngs(coordinates).setStyle(style);
              else bundle.fans.set(edgeKey, L.polygon(coordinates, style).addTo(map));
              bundle.fans.get(edgeKey).getElement()?.style.setProperty("--milkyway-central-weight", String(centralWeight));
            } else {
              // Subject mode traces the outer fan edge only.  Repeating the
              // origin for every ten-degree wedge would turn the restrained
              // comparison overlay into a distracting radial grid.
              const coordinates = locations.slice(1).map((point) => [point.latitude, point.longitude]);
              const style = {
                color,
                weight: 1.25,
                opacity: 0.34 + centralWeight * 0.22,
                dashArray: "5 7",
                interactive: false,
                className: "milkyway-fan milkyway-fan-subject",
              };
              const layer = bundle.boundaries.get(edgeKey);
              if (layer) layer.setLatLngs(coordinates).setStyle(style);
              else bundle.boundaries.set(edgeKey, L.polyline(coordinates, style).addTo(map));
            }
          });
          const activeLayers = origin === "camera" ? bundle.fans : bundle.boundaries;
          for (const [edgeKey, layer] of activeLayers) {
            if (!retainedEdges.has(edgeKey)) { layer.remove(); activeLayers.delete(edgeKey); }
          }
          if (Number(data?.core?.altitude) >= 0) {
            const coreLocation = milkyWayDestination(location, data.core.azimuth, radiusMeters);
            const originPoint = [location.latitude, location.longitude];
            const corePoint = [coreLocation.latitude, coreLocation.longitude];
            const coreLineStyle = {
              color,
              weight: origin === "camera" ? 1.5 : 1.2,
              opacity: origin === "camera" ? 0.82 : 0.574,
              dashArray: origin === "subject" ? "4 5" : null,
              interactive: false,
              className: `milkyway-core-line milkyway-core-line-${origin}`,
            };
            if (bundle.coreLine) bundle.coreLine.setLatLngs([originPoint, corePoint]).setStyle(coreLineStyle);
            else bundle.coreLine = L.polyline([originPoint, corePoint], coreLineStyle).addTo(map);
            const coreMarkerStyle = {
              radius: 3.6,
              color,
              weight: 1.2,
              opacity: 0.94,
              fillColor: color,
              fillOpacity: 0.96,
              interactive: false,
              className: `milkyway-core-marker milkyway-core-marker-${origin}`,
            };
            if (bundle.coreMarker) bundle.coreMarker.setLatLng(corePoint).setStyle(coreMarkerStyle);
            else bundle.coreMarker = L.circleMarker(corePoint, coreMarkerStyle).addTo(map);
          } else {
            removeLayer(bundle.coreLine);
            removeLayer(bundle.coreMarker);
            bundle.coreLine = null;
            bundle.coreMarker = null;
          }
          milkyWayDirectionLayers.set(key, bundle);
          return;
        }
        retained.add(key);
        const points = directionLineLocations(location, data.azimuth, origin);
        const coordinates = points.map((point) => [point.latitude, point.longitude]);
        const style = {
            color,
            weight: origin === "subject" ? 2.15 : 3,
            opacity: data.isAboveHorizon ? (origin === "subject" ? 0.78 : 0.9) : 0.3,
            dashArray: origin === "subject"
              ? "12 7 2 7"
              : data.isAboveHorizon ? null : "7 8",
            interactive: false,
            className: `celestial-direction-line celestial-direction-${targetId} ${origin}-origin-line`,
          };
        const layer = celestialDirectionLayers.get(key);
        if (layer) layer.setLatLngs(coordinates).setStyle(style);
        else celestialDirectionLayers.set(key, L.polyline(coordinates, style).addTo(map));
      });
      for (const [key, layer] of celestialDirectionLayers) {
        if (!retained.has(key)) { layer.remove(); celestialDirectionLayers.delete(key); }
      }
      for (const [key, bundle] of milkyWayDirectionLayers) {
        if (!retainedMilkyWay.has(key)) {
          removeLayerBundle(bundle);
          milkyWayDirectionLayers.delete(key);
        }
      }
    },
    clearCelestialDirections() {
      celestialDirectionLayers.forEach((layer) => layer.remove());
      celestialDirectionLayers.clear();
      milkyWayDirectionLayers.forEach(removeLayerBundle);
      milkyWayDirectionLayers.clear();
      latestCelestialDirections = [];
    },
    setShootingCandidates(candidates) {
      shootingCandidateLayers.forEach((layer) => layer.remove());
      shootingCandidateLayers = candidates.map((candidate) => {
        const color = getTarget(candidate.body)?.color || "#b58af2";
        const layer = L.circleMarker([candidate.location.latitude, candidate.location.longitude], {
          radius: 8,
          color,
          weight: 2,
          fillColor: "#07111f",
          fillOpacity: 0.88,
          className: `shooting-candidate shooting-candidate-${candidate.body}`,
        }).addTo(map);
        layer.bindTooltip(`${candidate.label} ${candidate.distanceLabel}`, { direction: "top", offset: [0, -7] });
        layer.on("click", () => {
          marker.setLatLng([candidate.location.latitude, candidate.location.longitude]);
          map.flyTo([candidate.location.latitude, candidate.location.longitude], Math.max(map.getZoom(), 13));
          onShootingCandidateSelect(candidate);
        });
        return layer;
      });
    },
    clearShootingCandidates() {
      shootingCandidateLayers.forEach((layer) => layer.remove());
      shootingCandidateLayers = [];
    },
    setTerrainObstruction(location) {
      terrainObstructionMarker?.remove();
      terrainObstructionMarker = L.circleMarker([location.latitude, location.longitude], {
        radius: 7,
        color: "#ff6b6b",
        weight: 2,
        fillColor: "#ff6b6b",
        fillOpacity: 0.42,
      }).addTo(map).bindTooltip("見通しを遮る可能性", { direction: "top" });
    },
    clearTerrainObstruction() {
      terrainObstructionMarker?.remove();
      terrainObstructionMarker = null;
    },
  };

  refreshCelestialDirections = () => {
    if (latestCelestialDirections.length) controller.setCelestialDirections(latestCelestialDirections);
  };
  return controller;
}
