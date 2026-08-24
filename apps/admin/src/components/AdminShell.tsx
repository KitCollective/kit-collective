import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";
import { BrandLogo } from "../brand/BrandLogo.js";

const PLACES = [
  {
    to: "/stamdata",
    label: "Master Data",
    match: (pathname: string) => pathname.startsWith("/stamdata"),
    icon: "master" as const,
  },
  {
    to: "/collectors",
    label: "User Data",
    match: (pathname: string) => pathname.startsWith("/collectors"),
    icon: "users" as const,
  },
] as const;

type HeaderMenu = "pin" | "alerts" | "help" | "places" | "account";

export type AdminChromeContext = {
  search: string;
  setSearch: (value: string) => void;
  searchPlaceholder: string;
  setSearchPlaceholder: (value: string) => void;
};

export function useAdminChrome(): AdminChromeContext {
  return useOutletContext<AdminChromeContext>();
}

function operatorMonogram(email: string): string {
  const local = email.split("@")[0] ?? "?";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const second = parts[1]?.[0];
    if (first && second) {
      return `${first}${second}`.toUpperCase();
    }
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

function emptyMenuCopy(menu: "pin" | "alerts" | "help"): string {
  switch (menu) {
    case "pin":
      return "Nothing pinned yet.";
    case "alerts":
      return "No notifications.";
    case "help":
      return "Help isn’t available in this gap.";
    default: {
      const exhaustive: never = menu;
      return exhaustive;
    }
  }
}

export function AdminShell() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const [search, setSearch] = useState("");
  const [searchPlaceholder, setSearchPlaceholder] = useState("Search");

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  function toggleMenu(menu: HeaderMenu) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  useEffect(() => {
    setOpenMenu((current) => (location.pathname ? null : current));
  }, [location.pathname]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (menuRef.current && target instanceof Node && !menuRef.current.contains(target)) {
        closeMenu();
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu, closeMenu]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = index === -1 ? 0 : (index + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  const operatorEmail = user?.email ?? "Account";

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-wordmark">
          <BrandLogo variant="wordmark" />
        </h1>

        <label className="header-search">
          <span className="header-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            className="search-field"
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={searchPlaceholder}
          />
        </label>

        <div className="header-actions" ref={menuRef}>
          <div className="header-menu">
            <HeaderMenuButton
              label="Pin"
              expanded={openMenu === "pin"}
              onToggle={() => toggleMenu("pin")}
            >
              <PinIcon />
            </HeaderMenuButton>
            {openMenu === "pin" ? (
              <HeaderEmptyMenu label="Pin" copy={emptyMenuCopy("pin")} />
            ) : null}
          </div>

          <div className="header-menu">
            <HeaderMenuButton
              label="Notifications"
              expanded={openMenu === "alerts"}
              onToggle={() => toggleMenu("alerts")}
            >
              <BellIcon />
            </HeaderMenuButton>
            {openMenu === "alerts" ? (
              <HeaderEmptyMenu label="Notifications" copy={emptyMenuCopy("alerts")} />
            ) : null}
          </div>

          <div className="header-menu">
            <HeaderMenuButton
              label="Help"
              expanded={openMenu === "help"}
              onToggle={() => toggleMenu("help")}
            >
              <HelpIcon />
            </HeaderMenuButton>
            {openMenu === "help" ? (
              <HeaderEmptyMenu label="Help" copy={emptyMenuCopy("help")} />
            ) : null}
          </div>

          <div className="header-menu">
            <HeaderMenuButton
              label="Open place menu"
              expanded={openMenu === "places"}
              onToggle={() => toggleMenu("places")}
            >
              <GridIcon />
            </HeaderMenuButton>
            {openMenu === "places" ? (
              <div
                className="header-menu-list header-menu-list--places"
                role="menu"
                aria-label="Admin places"
                onKeyDown={handleMenuKeyDown}
              >
                {PLACES.map((place) => (
                  <button
                    key={place.to}
                    type="button"
                    role="menuitem"
                    className="place-tile"
                    aria-current={place.match(location.pathname) ? "page" : undefined}
                    onClick={() => {
                      navigate(place.to);
                      closeMenu();
                    }}
                  >
                    <span className="place-tile-icon" aria-hidden="true">
                      {place.icon === "master" ? <MasterDataIcon /> : <UserDataIcon />}
                    </span>
                    <span className="place-tile-label">{place.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="header-menu">
            <button
              type="button"
              className="profile-action"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={openMenu === "account"}
              onClick={() => toggleMenu("account")}
            >
              <span className="profile-avatar" aria-hidden="true">
                {operatorMonogram(operatorEmail)}
              </span>
              <ChevronIcon />
            </button>
            {openMenu === "account" ? (
              <div
                className="header-menu-list"
                role="menu"
                aria-label="Account"
                onKeyDown={handleMenuKeyDown}
              >
                <p className="header-menu-meta">{operatorEmail}</p>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    closeMenu();
                    logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet
          context={
            {
              search,
              setSearch,
              searchPlaceholder,
              setSearchPlaceholder,
            } satisfies AdminChromeContext
          }
        />
      </main>
    </div>
  );
}

function HeaderMenuButton({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-btn header-icon-btn"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}

function HeaderEmptyMenu({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="header-menu-list header-menu-list--empty" role="status" aria-label={label}>
      <p className="header-menu-empty">{copy}</p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 14.5V9.5M5.5 3.5h5l-.8 3.2 1.8 1.8H5.5l1.8-1.8L5.5 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4 6.5a4 4 0 0 1 8 0v3.2l1 1.8H3l1-1.8V6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 13a1.5 1.5 0 0 0 3 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.4 6.3a1.6 1.6 0 0 1 3.1.8c0 1.1-1.5 1.4-1.5 2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.3" r="0.7" fill="currentColor" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="6" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="11" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="1" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="11" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="1" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="6" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
      <rect x="11" y="11" width="4" height="4" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function MasterDataIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 7.5C4 6.12 7.58 5 12 5s8 1.12 8 2.5S16.42 10 12 10 4 8.88 4 7.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 7.5V12c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 12v4.5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function UserDataIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 18c.4-2.4 2.4-4 4.5-4s4.1 1.6 4.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.5 18c-.3-1.8-1.7-3.2-3.4-3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
