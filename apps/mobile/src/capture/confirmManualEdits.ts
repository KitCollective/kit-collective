let clubEdited = false;
let seasonEdited = false;
let kitTypeEdited = false;

export function resetConfirmManualEdits(): void {
  clubEdited = false;
  seasonEdited = false;
  kitTypeEdited = false;
}

export function markConfirmClubEdited(): void {
  clubEdited = true;
}

export function clearConfirmSeasonEdited(): void {
  seasonEdited = false;
}

export function markConfirmSeasonEdited(): void {
  seasonEdited = true;
}

export function markConfirmKitTypeEdited(): void {
  kitTypeEdited = true;
}

export function confirmClubWasEdited(): boolean {
  return clubEdited;
}

export function confirmSeasonWasEdited(): boolean {
  return seasonEdited;
}

export function confirmKitTypeWasEdited(): boolean {
  return kitTypeEdited;
}
