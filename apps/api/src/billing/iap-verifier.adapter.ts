import type { IapPlatform } from "@kit/api-contract";

export type IapVerificationResult = {
  expires: Date;
};

export type IapVerifierAdapter = {
  verify(token: string, platform: IapPlatform, productId: string): Promise<IapVerificationResult>;
  restore(token: string, platform: IapPlatform): Promise<IapVerificationResult | null>;
};

export const IAP_VERIFIER = Symbol("IAP_VERIFIER");
