"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/registry", label: "Registry" },
  { href: "/gallery", label: "Gallery" },
];

const RSVP_SESSION_KEY = "active_rsvp_code";

export default function Navigation() {
  const pathname = usePathname();
  const activeRsvpCode = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => window.sessionStorage.getItem(RSVP_SESSION_KEY) || "",
    () => "",
  );

  const visibleLinks = useMemo(
    () =>
      activeRsvpCode
        ? [...links, { href: `/${activeRsvpCode.toLowerCase()}`, label: "Your RSVP", mobileLabel: "RSVP" }]
        : links,
    [activeRsvpCode],
  );

  return (
    <nav className="wedding-nav-shell wedding-animate-fade">
      <div className="wedding-nav-inner">
        {visibleLinks.map((link) => {
          const active = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`wedding-nav-link ${active ? "wedding-nav-link-active" : "hover:text-stone-900"}`}
            >
              <span className="md:hidden">{("mobileLabel" in link && link.mobileLabel) || link.label}</span>
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
