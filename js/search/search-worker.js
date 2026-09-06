self.window = self;
importScripts("../vendor/suncalc.js?v=1.7.0", "../vendor/astronomy-engine.min.js?v=1.7.0", "./search-core.js?v=1.7.0");

self.addEventListener("message", async (event) => {
  try {
    const targetCalculator = !["sun", "moon"].includes(event.data.target)
      ? (await import("../astronomy/target-service.js?v=1.7.0")).calculateTargetData
      : null;
    const results = self.CelestiSearchCore.searchCandidates(
      event.data,
      self.SunCalc,
      (progress) => self.postMessage({ type: "progress", progress }),
      targetCalculator ? (date, location, targetId) => targetCalculator(targetId, date, location, self.Astronomy) : null,
    );
    self.postMessage({ type: "done", results });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
