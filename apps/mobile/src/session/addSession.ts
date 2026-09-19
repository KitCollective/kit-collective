let savedJerseyCount = 0;

export function markJerseySaved(): void {
  savedJerseyCount += 1;
}

export function isRepeatCaptureSession(): boolean {
  return savedJerseyCount > 0;
}

export function resetAddSession(): void {
  savedJerseyCount = 0;
}
