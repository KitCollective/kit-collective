import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type InboxChromeContextValue = {
  conversationVisible: boolean;
  setConversationVisible: (visible: boolean) => void;
  refreshUnreadCount: () => Promise<void>;
};

const InboxChromeContext = createContext<InboxChromeContextValue | null>(null);

type InboxChromeProviderProps = {
  children: ReactNode;
  refreshUnreadCount: () => Promise<void>;
};

export function InboxChromeProvider({ children, refreshUnreadCount }: InboxChromeProviderProps) {
  const [conversationVisible, setConversationVisible] = useState(false);

  const value = useMemo(
    () => ({
      conversationVisible,
      setConversationVisible,
      refreshUnreadCount,
    }),
    [conversationVisible, refreshUnreadCount],
  );

  return <InboxChromeContext.Provider value={value}>{children}</InboxChromeContext.Provider>;
}

export function useInboxChrome(): InboxChromeContextValue {
  const context = useContext(InboxChromeContext);
  if (!context) {
    throw new Error("useInboxChrome must be used within InboxChromeProvider");
  }
  return context;
}
