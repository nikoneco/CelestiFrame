import { destinationPoint } from "../geometry/destination.js";

export function createMapController({ elementId, initialLocation, initialZoom, onLocationChange, onSubjectLocationChange, onMapMove }) {
  if (!window.L) throw new Error("Leaflet is unavailable");

  const map = L.map(elementId, { zoomControl: false }).setView(
    [initialLocation.latitude, initialLocation.longitude],
    initialZoom,
  );

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

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
  let directionLine = null;
  let moonDirectionLine = null;
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
    setSunDirection(location, sunData) {
      directionLine?.remove();
      const destination = destinationPoint(location, sunData.azimuth, 35000);
      directionLine = L.polyline(
        [
          [location.latitude, location.longitude],
          [destination.latitude, destination.longitude],
        ],
        {
          color: "#ffb44a",
          weight: 3,
          opacity: sunData.isAboveHorizon ? 0.9 : 0.38,
          dashArray: sunData.isAboveHorizon ? null : "7 8",
          interactive: false,
          className: "sun-direction-line",
        },
      ).addTo(map);
    },
    clearSunDirection() {
      directionLine?.remove();
      directionLine = null;
    },
    setMoonDirection(location, moonData) {
      moonDirectionLine?.remove();
      const destination = destinationPoint(location, moonData.azimuth, 35000);
      moonDirectionLine = L.polyline(
        [
          [location.latitude, location.longitude],
          [destination.latitude, destination.longitude],
        ],
        {
          color: "#91b8ec",
          weight: 3,
          opacity: moonData.isAboveHorizon ? 0.9 : 0.38,
          dashArray: moonData.isAboveHorizon ? null : "7 8",
          interactive: false,
          className: "moon-direction-line",
        },
      ).addTo(map);
    },
    clearMoonDirection() {
      moonDirectionLine?.remove();
      moonDirectionLine = null;
    },
  };
}
