let clubEdited = false;
let seasonEdited = false;
let kitTypeEdited = false;
let playerEdited = false;
let badgeEdited = false;

export function resetConfirmManualEdits(): void {
  clubEdited = false;
  seasonEdited = false;
  kitTypeEdited = false;
  playerEdited = false;
  badgeEdited = false;
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

export function markConfirmPlayerEdited(): void {
  playerEdited = true;
}

export function markConfirmBadgeEdited(): void {
  badgeEdited = true;
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

export function confirmPlayerWasEdited(): boolean {
  return playerEdited;
}

export function confirmBadgeWasEdited(): boolean {
  return badgeEdited;
}
