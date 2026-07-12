(function attachSearchCore(root) {
  const toDegrees = (radians) => radians * 180 / Math.PI;
  const normalizeDegrees = (value) => ((value % 360) + 360) % 360;
  const signedDifference = (from, to) => ((normalizeDegrees(to) - normalizeDegrees(from) + 540) % 360) - 180;

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

  function searchCandidates(input, calculator, onProgress = () => {}) {
    const startDate = parseLocalDate(input.startDate);
    const endDate = parseLocalDate(input.endDate);
    const samplesPerDay = Math.floor((input.endMinute - input.startMinute) / input.stepMinutes) + 1;
    const totalSamples = countDays(startDate, endDate) * samplesPerDay;
    const progressInterval = Math.max(1, Math.floor(totalSamples / 100));
    const results = [];
    let completed = 0;

    for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
      for (let minute = input.startMinute; minute <= input.endMinute; minute += input.stepMinutes) {
        const date = new Date(day);
        date.setMinutes(minute);
        const position = input.target === "moon"
          ? calculator.getMoonPosition(date, input.cameraLocation.latitude, input.cameraLocation.longitude)
          : calculator.getPosition(date, input.cameraLocation.latitude, input.cameraLocation.longitude);
        const azimuth = normalizeDegrees(toDegrees(position.azimuth) + 180);
        const altitude = toDegrees(position.altitude);
        const difference = signedDifference(input.subjectBearing, azimuth);
        const illumination = input.target === "moon"
          ? calculator.getMoonIllumination(date).fraction * 100
          : null;

        completed += 1;
        if (completed % progressInterval === 0 || completed === totalSamples) {
          onProgress(completed / totalSamples);
        }

        if (Math.abs(difference) > input.toleranceDegrees) continue;
        if (altitude < input.minAltitude || altitude > input.maxAltitude) continue;
        if (illumination !== null && illumination < input.minIllumination) continue;

        const alignmentScore = Math.max(0, 1 - Math.abs(difference) / input.toleranceDegrees);
        const illuminationScore = illumination === null ? 10 : 15 * illumination / 100;
        const horizonScore = altitude >= 0 ? 10 : 0;
        results.push({
          timestamp: date.getTime(),
          iso: date.toISOString(),
          azimuth,
          altitude,
          difference,
          illumination,
          score: Math.min(100, 75 * alignmentScore + illuminationScore + horizonScore),
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score || Math.abs(a.difference) - Math.abs(b.difference) || a.timestamp - b.timestamp)
      .slice(0, 200);
  }

  root.CelestiSearchCore = { searchCandidates };
})(typeof self !== "undefined" ? self : globalThis);
