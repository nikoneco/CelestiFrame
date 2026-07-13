(function attachSearchCore(root) {
  const toDegrees = (radians) => radians * 180 / Math.PI;
  const normalizeDegrees = (value) => ((value % 360) + 360) % 360;
  const signedDifference = (from, to) => ((normalizeDegrees(to) - normalizeDegrees(from) + 540) % 360) - 180;
  const SUN_RADIUS = 0.2666;

  function apparentSolarAltitude(geometricAltitude) {
    if (geometricAltitude < -1 || geometricAltitude >= 89.9) return geometricAltitude;
    const denominator = Math.tan((geometricAltitude + 10.3 / (geometricAltitude + 5.11)) * Math.PI / 180);
    return Number.isFinite(denominator) && denominator > 0
      ? geometricAltitude + 1.02 / denominator / 60
      : geometricAltitude;
  }

  function diamondMetrics(difference, altitude, targetAltitude, tolerance = 0.3) {
    const horizontalDifference = difference * Math.cos(targetAltitude * Math.PI / 180);
    const verticalDifference = altitude - targetAltitude;
    const angularSeparation = Math.hypot(horizontalDifference, verticalDifference);
    const diamondState = angularSeparation <= 0.08
      ? "center"
      : angularSeparation <= SUN_RADIUS ? "disk"
        : angularSeparation <= SUN_RADIUS + tolerance ? "near" : "azimuth-only";
    return { horizontalDifference, verticalDifference, angularSeparation, diamondState };
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function countDays(start, end) {
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function searchCandidates(input, calculator, onProgress = () => {}, milkyWayCalculator = null) {
    const startDate = parseLocalDate(input.startDate);
    const endDate = parseLocalDate(input.endDate);
    const samplesPerDay = Math.floor((input.endMinute - input.startMinute) / input.stepMinutes) + 1;
    const totalSamples = countDays(startDate, endDate) * samplesPerDay;
    const progressInterval = Math.max(1, Math.floor(totalSamples / 100));
    const results = [];
    const refinementSeeds = [];
    let completed = 0;

    function evaluate(date, { refinement = false } = {}) {
      const milkyWay = input.target === "milkyway"
        ? milkyWayCalculator?.(date, input.cameraLocation)
        : null;
      if (input.target === "milkyway" && !milkyWay) throw new Error("天の川の計算を読み込めませんでした");
      const position = milkyWay ? null : input.target === "moon"
        ? calculator.getMoonPosition(date, input.cameraLocation.latitude, input.cameraLocation.longitude)
        : calculator.getPosition(date, input.cameraLocation.latitude, input.cameraLocation.longitude);
      const azimuth = milkyWay ? milkyWay.azimuth : normalizeDegrees(toDegrees(position.azimuth) + 180);
      const geometricAltitude = milkyWay ? milkyWay.altitude : toDegrees(position.altitude);
      const altitude = input.matchTargetAltitude && input.target === "sun"
        ? apparentSolarAltitude(geometricAltitude)
        : geometricAltitude;
      const difference = signedDifference(input.subjectBearing, azimuth);
      const illumination = input.target === "moon"
        ? calculator.getMoonIllumination(date).fraction * 100
        : null;
      const sunAltitude = input.target === "milkyway"
        ? toDegrees(calculator.getPosition(date, input.cameraLocation.latitude, input.cameraLocation.longitude).altitude)
        : null;
      const diamond = input.matchTargetAltitude && input.target === "sun"
        ? diamondMetrics(difference, altitude, input.targetAltitude, input.verticalToleranceDegrees)
        : null;
      const coarseBuffer = !refinement && diamond ? Math.max(0, input.stepMinutes * 0.3) : 0;

      if (Math.abs(difference) > input.toleranceDegrees + coarseBuffer) return null;
      if (altitude < input.minAltitude - coarseBuffer || altitude > input.maxAltitude + coarseBuffer) return null;
      if (illumination !== null && illumination < input.minIllumination) return null;
      if (sunAltitude !== null && sunAltitude > (input.maxSunAltitude ?? 90)) return null;
      if (diamond && Math.abs(diamond.verticalDifference) > SUN_RADIUS + input.verticalToleranceDegrees + coarseBuffer) return null;

      if (!refinement && diamond && input.stepMinutes > 1) return { seed: true, timestamp: date.getTime() };
      const alignmentScore = Math.max(0, 1 - Math.abs(difference) / input.toleranceDegrees);
      const illuminationScore = illumination === null ? 0 : 15 * illumination / 100;
      const horizonScore = altitude >= 0 ? 10 : 0;
      const darknessScore = sunAltitude === null ? 0 : 15 * Math.max(0, Math.min(1, (-sunAltitude - 6) / 12));
      const diamondScore = diamond
        ? Math.max(0, 1 - diamond.angularSeparation / (SUN_RADIUS + input.verticalToleranceDegrees))
        : 0;
      return {
        timestamp: date.getTime(),
        iso: date.toISOString(),
        azimuth,
        altitude,
        difference,
        illumination,
        sunAltitude,
        targetAltitude: diamond ? input.targetAltitude : null,
        verticalDifference: diamond?.verticalDifference ?? null,
        angularSeparation: diamond?.angularSeparation ?? null,
        diamondState: diamond?.diamondState ?? null,
        score: Math.min(100, diamond
          ? 45 * alignmentScore + 45 * diamondScore + horizonScore
          : 75 * alignmentScore + illuminationScore + darknessScore + horizonScore),
      };
    }

    for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
      for (let minute = input.startMinute; minute <= input.endMinute; minute += input.stepMinutes) {
        const date = new Date(day);
        date.setMinutes(minute);
        completed += 1;
        if (completed % progressInterval === 0 || completed === totalSamples) {
          onProgress(completed / totalSamples);
        }

        const candidate = evaluate(date);
        if (candidate?.seed) refinementSeeds.push(candidate.timestamp);
        else if (candidate) results.push(candidate);
      }
    }

    if (input.matchTargetAltitude && input.target === "sun" && input.stepMinutes > 1) {
      const seen = new Set();
      refinementSeeds.forEach((timestamp) => {
        const halfWindowSeconds = input.stepMinutes * 60;
        for (let offset = -halfWindowSeconds; offset <= halfWindowSeconds; offset += 10) {
          const refinedTime = timestamp + offset * 1000;
          const key = Math.round(refinedTime / 10000);
          if (seen.has(key)) continue;
          seen.add(key);
          const candidate = evaluate(new Date(refinedTime), { refinement: true });
          if (candidate) results.push(candidate);
        }
      });
    }

    const sorted = results
      .sort((a, b) => b.score - a.score || Math.abs(a.difference) - Math.abs(b.difference) || a.timestamp - b.timestamp);
    if (!input.matchTargetAltitude || input.target !== "sun") return sorted.slice(0, 200);
    const distinctEvents = [];
    for (const candidate of sorted) {
      if (distinctEvents.every((existing) => Math.abs(existing.timestamp - candidate.timestamp) >= 5 * 60 * 1000)) {
        distinctEvents.push(candidate);
      }
      if (distinctEvents.length >= 200) break;
    }
    return distinctEvents;
  }

  root.CelestiSearchCore = { diamondMetrics, searchCandidates };
})(typeof self !== "undefined" ? self : globalThis);
