let analysisLoaded = false;

/** Whether optional analysis SDK may load for this session. */
export function shouldLoadAnalysis(consent: { analysis: boolean } | null): boolean {
  return consent?.analysis === true;
}

/** Loads analysis SDK only when consent grants analysis. */
export function loadAnalysisIfConsented(consent: { analysis: boolean } | null): void {
  if (!shouldLoadAnalysis(consent) || analysisLoaded) {
    return;
  }

  analysisLoaded = true;
}

/** Test seam — reset loaded state between tests. */
export function resetAnalysisLoaderForTests(): void {
  analysisLoaded = false;
}
