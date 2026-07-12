import { destinationPoint } from "../geometry/destination.js";

export function createMapController({ elementId, initialLocation, initialZoom, onLocationChange, onMapMove }) {
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
  };
}
