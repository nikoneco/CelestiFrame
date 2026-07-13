import { destinationPoint } from "../geometry/destination.js";

export const DEFAULT_CANDIDATE_DISTANCES_METERS = Object.freeze([1000, 5000, 10000, 20000]);

export function createShootingCandidates({
  subjectLocation,
  celestialAzimuth,
  body,
  distancesMeters = DEFAULT_CANDIDATE_DISTANCES_METERS,
}) {
  if (!subjectLocation) throw new Error("被写体地点を設定してください");
  const azimuth = Number(celestialAzimuth);
  if (!Number.isFinite(azimuth)) throw new Error("天体方位を計算できません");
  const cameraBearing = (azimuth + 180) % 360;
  return distancesMeters.map((distanceMeters) => {
    const distance = Number(distanceMeters);
    if (!Number.isFinite(distance) || distance <= 0) throw new Error("候補距離が正しくありません");
    return Object.freeze({
      id: `${body}-${Math.round(distance)}`,
      body,
      distanceMeters: distance,
      bearingDegrees: cameraBearing,
      location: destinationPoint(subjectLocation, cameraBearing, distance),
    });
  });
}
