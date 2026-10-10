/**
 * A production process never touches device-flow test data or fixed Vision,
 * whatever its environment says, so a copied env block cannot open the lane.
 */
export function isProductionProcess(nodeEnv: string | undefined): boolean {
  return nodeEnv?.trim().toLowerCase() === "production";
}
