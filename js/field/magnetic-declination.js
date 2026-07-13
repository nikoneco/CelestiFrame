// GSI 2020.0 regional approximation. Positive values represent west
// declination, matching the convention used by the published formula.
export function gsiMagneticDeclination2020(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < 20 || latitude > 50 || longitude < 120 || longitude > 154) return null;
  const deltaLatitude = latitude - 37;
  const deltaLongitude = longitude - 138;
  const additionalMinutes = 15.822
    + 18.462 * deltaLatitude
    - 7.726 * deltaLongitude
    + 0.007 * deltaLatitude ** 2
    - 0.007 * deltaLatitude * deltaLongitude
    - 0.655 * deltaLongitude ** 2;
  return 8 + additionalMinutes / 60;
}
