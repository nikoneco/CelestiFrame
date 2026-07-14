import { destinationPoint } from "../geometry/destination.js";
import { getTarget } from "../astronomy/target-catalog.js?v=1";

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
  let celestialDirectionLayers = [];
  let shootingCandidateLayers = [];
  let cloudOverlayLayers = [];
  let lightPollutionLayer = null;
  let terrainObstructionMarker = null;
  let subjectMarker = null;
  let subjectLine = null;
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

  return {
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
      subjectLine?.remove();
      subjectLine = L.polyline(
        [
          [cameraLocation.latitude, cameraLocation.longitude],
          [subjectLocation.latitude, subjectLocation.longitude],
        ],
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
      celestialDirectionLayers.forEach((layer) => layer.remove());
      celestialDirectionLayers = directions.map(({ targetId, location, data, origin }) => {
        const target = getTarget(targetId);
        const color = target?.color || "#dceaff";
        const points = directionLineLocations(location, data.azimuth, origin);
        return L.polyline(
          points.map((point) => [point.latitude, point.longitude]),
          {
            color,
            weight: origin === "subject" ? 2.15 : 3,
            opacity: data.isAboveHorizon ? (origin === "subject" ? 0.78 : 0.9) : 0.3,
            dashArray: origin === "subject"
              ? "12 7 2 7"
              : targetId === "milkyway" ? "4 5" : data.isAboveHorizon ? null : "7 8",
            interactive: false,
            className: `celestial-direction-line celestial-direction-${targetId} ${origin}-origin-line`,
          },
        ).addTo(map);
      });
    },
    clearCelestialDirections() {
      celestialDirectionLayers.forEach((layer) => layer.remove());
      celestialDirectionLayers = [];
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
}
