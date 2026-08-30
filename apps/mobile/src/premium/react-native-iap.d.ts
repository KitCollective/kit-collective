declare module "react-native-iap" {
  export type Purchase = {
    productId: string;
    transactionReceipt?: string;
    purchaseToken?: string;
  };

  export type ProductPurchase = Purchase;
  export type SubscriptionPurchase = Purchase;

  export type Product = {
    productId: string;
    localizedPrice: string;
  };

  export type PurchaseError = {
    message: string;
  };

  export function initConnection(): Promise<boolean>;
  export function endConnection(): Promise<void>;
  export function getProducts(input: { skus: string[] }): Promise<Product[]>;
  export function requestPurchase(input: { sku: string }): Promise<void>;
  export function getAvailablePurchases(): Promise<Purchase[]>;
  export function finishTransaction(input: {
    purchase: Purchase;
    isConsumable: boolean;
  }): Promise<void>;
  export function purchaseUpdatedListener(listener: (purchase: Purchase) => void): {
    remove: () => void;
  };
  export function purchaseErrorListener(listener: (error: PurchaseError) => void): {
    remove: () => void;
  };
}
