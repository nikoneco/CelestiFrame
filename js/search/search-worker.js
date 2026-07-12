importScripts("../vendor/suncalc.js", "./search-core.js");

self.addEventListener("message", (event) => {
  try {
    const results = self.CelestiSearchCore.searchCandidates(
      event.data,
      self.SunCalc,
      (progress) => self.postMessage({ type: "progress", progress }),
    );
    self.postMessage({ type: "done", results });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
