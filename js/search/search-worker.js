self.window = self;
importScripts("../vendor/suncalc.js", "./search-core.js?v=42");

self.addEventListener("message", async (event) => {
  try {
    const milkyWayCalculator = event.data.target === "milkyway"
      ? (await import("../astronomy/milky-way-service.js?v=41")).calculateMilkyWay
      : null;
    const results = self.CelestiSearchCore.searchCandidates(
      event.data,
      self.SunCalc,
      (progress) => self.postMessage({ type: "progress", progress }),
      milkyWayCalculator,
    );
    self.postMessage({ type: "done", results });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
