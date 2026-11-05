import { createContext, type ReactNode, useContext } from "react";

type WishlistBadgeContextValue = {
  refreshUnseenCount: () => Promise<void>;
};

const WishlistBadgeContext = createContext<WishlistBadgeContextValue | null>(null);

type WishlistBadgeProviderProps = {
  children: ReactNode;
  refreshUnseenCount: () => Promise<void>;
};

export function WishlistBadgeProvider({
  children,
  refreshUnseenCount,
}: WishlistBadgeProviderProps) {
  return (
    <WishlistBadgeContext.Provider value={{ refreshUnseenCount }}>
      {children}
    </WishlistBadgeContext.Provider>
  );
}

export function useWishlistBadge(): WishlistBadgeContextValue {
  const context = useContext(WishlistBadgeContext);
  if (!context) {
    throw new Error("useWishlistBadge must be used within WishlistBadgeProvider");
  }
  return context;
}
