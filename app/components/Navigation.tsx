"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/", label: "Home" },
  { href: "/registry", label: "Registry" },
];

const RSVP_SESSION_KEY = "active_rsvp_code";
const defaultNavigationSettings = {
  isSeatingEnabled: false,
  isGalleryEnabled: false,
  isLivestreamEnabled: false,
  isRsvpOpen: true,
};

let cachedNavigationSettings = defaultNavigationSettings;

export default function Navigation() {
  const pathname = usePathname();
  const [navigationSettings, setNavigationSettings] = useState(cachedNavigationSettings);
  const { isGalleryEnabled, isLivestreamEnabled, isRsvpOpen, isSeatingEnabled } = navigationSettings;
  const activeRsvpCode = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => window.sessionStorage.getItem(RSVP_SESSION_KEY) || "",
    () => "",
  );

  useEffect(() => {
    const applySetting = (key: string, value?: string) => {
      if (typeof value !== "string") return;

      if (key === "is_seating_chart_enabled") {
        cachedNavigationSettings = { ...cachedNavigationSettings, isSeatingEnabled: value === "true" };
      } else if (key === "is_gallery_enabled") {
        cachedNavigationSettings = { ...cachedNavigationSettings, isGalleryEnabled: value === "true" };
      } else if (key === "is_livestream_enabled") {
        cachedNavigationSettings = { ...cachedNavigationSettings, isLivestreamEnabled: value === "true" };
      } else if (key === "is_rsvp_open") {
        cachedNavigationSettings = { ...cachedNavigationSettings, isRsvpOpen: value !== "false" };
      } else {
        return;
      }

      setNavigationSettings(cachedNavigationSettings);
    };

    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["is_seating_chart_enabled", "is_gallery_enabled", "is_livestream_enabled", "is_rsvp_open"]);

      data?.forEach((setting) => applySetting(setting.key, setting.value));
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchSettings();
      }
    };

    void fetchSettings();

    const channel = supabase
      .channel("navigation_live_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, (payload) => {
        const nextSetting = payload.new as { key?: string; value?: string } | null;
        if (!nextSetting?.key) return;
        applySetting(nextSetting.key, nextSetting.value);
      })
      .subscribe();

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  const visibleLinks = useMemo(
    () => {
      const liveLinks = [
        ...links,
        ...(isSeatingEnabled ? [{ href: "/table", label: "Find Table", mobileLabel: "Table" }] : []),
        ...(isGalleryEnabled ? [{ href: "/gallery", label: "Gallery" }] : []),
        ...(isLivestreamEnabled ? [{ href: "/livestream", label: "Livestream", mobileLabel: "Live" }] : []),
      ];

      return activeRsvpCode && isRsvpOpen
        ? [...liveLinks, { href: `/${activeRsvpCode.toLowerCase()}`, label: "Your RSVP", mobileLabel: "RSVP" }]
        : liveLinks;
    },
    [activeRsvpCode, isGalleryEnabled, isLivestreamEnabled, isRsvpOpen, isSeatingEnabled],
  );

  return (
    <nav className="wedding-nav-shell">
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
