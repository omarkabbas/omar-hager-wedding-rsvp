"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import HeroCarousel from "@/app/components/HeroCarousel";
import { supabase } from "@/lib/supabase";
import { virust } from "@/app/fonts";
import { DRESS_CODE, VENUE_ADDRESS, VENUE_MAP_EMBED, VENUE_MAP_LINK, VENUE_NAME } from "@/lib/wedding";

export default function HomePage() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);
  const [isHomeVenueEnabled, setIsHomeVenueEnabled] = useState(false);
  const [isHomeCarouselEnabled, setIsHomeCarouselEnabled] = useState(true);
  const [isHomeDressCodeEnabled, setIsHomeDressCodeEnabled] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", [
          "is_seating_chart_enabled",
          "is_gallery_enabled",
          "is_home_venue_enabled",
          "is_home_carousel_enabled",
          "is_home_dress_code_enabled",
        ]);

      if (!data) return;

      const seatingSetting = data.find((setting) => setting.key === "is_seating_chart_enabled");
      const gallerySetting = data.find((setting) => setting.key === "is_gallery_enabled");
      const homeVenueSetting = data.find((setting) => setting.key === "is_home_venue_enabled");
      const homeCarouselSetting = data.find((setting) => setting.key === "is_home_carousel_enabled");
      const homeDressCodeSetting = data.find((setting) => setting.key === "is_home_dress_code_enabled");

      if (seatingSetting) setIsSeatingChartEnabled(seatingSetting.value === "true");
      if (gallerySetting) setIsGalleryEnabled(gallerySetting.value === "true");
      if (homeVenueSetting) setIsHomeVenueEnabled(homeVenueSetting.value === "true");
      setIsHomeCarouselEnabled(homeCarouselSetting ? homeCarouselSetting.value === "true" : true);
      setIsHomeDressCodeEnabled(homeDressCodeSetting?.value === "true");
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchSettings();
      }
    };

    void fetchSettings();

    const channel = supabase
      .channel("home_live_settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings", filter: "key=eq.is_seating_chart_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsSeatingChartEnabled(settingValue === "true");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.is_gallery_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsGalleryEnabled(settingValue === "true");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.is_home_venue_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsHomeVenueEnabled(settingValue === "true");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.is_home_carousel_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsHomeCarouselEnabled(settingValue === "true");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.is_home_dress_code_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsHomeDressCodeEnabled(settingValue === "true");
        },
      )
      .subscribe();
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const target = new Date("June 6, 2026 00:00:00").getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const dist = target - now;

      if (dist > 0) {
        setTimeLeft({
          days: Math.floor(dist / (1000 * 60 * 60 * 24)),
          hours: Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((dist % (1000 * 60)) / 1000),
        });
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main wedding-center pt-2 md:pt-4">
        <section className="wedding-panel wedding-animate-up w-full max-w-5xl px-6 py-10 text-center md:px-12 md:py-14">
          <div className="flex justify-center mb-8 md:mb-10">
            <Image
              src="/logo.png"
              alt="Omar & Hager Logo"
              width={144}
              height={144}
              className="wedding-logo w-28 md:w-36"
              priority
            />
          </div>

          <p className="wedding-kicker mb-4">The Wedding Of</p>
          <h1
            className={`${virust.className} wedding-display mb-6 flex w-full items-center justify-center whitespace-nowrap text-[clamp(2.3rem,11vw,3.05rem)] leading-[0.95] text-[#4E5E72] md:mb-8 md:text-8xl`}
          >
            <span className="inline-flex items-baseline text-center">
              <span>Omar</span>
              <span className="wedding-display-ampersand mx-[0.16em]">&amp;</span>
              <span>Hager</span>
            </span>
          </h1>
          <p className="wedding-date mb-8 text-[#4E5E72] md:mb-10">June 06, 2026</p>

          <div className="wedding-divider mb-8 md:mb-10" />

          <div className="mx-auto mb-8 grid max-w-2xl grid-cols-2 gap-2.5 md:mb-12 md:max-w-3xl md:grid-cols-4 md:gap-6">
            {[
              { val: timeLeft.days, label: "Days" },
              { val: timeLeft.hours, label: "Hours" },
              { val: timeLeft.minutes, label: "Minutes" },
              { val: timeLeft.seconds, label: "Seconds", accent: "text-pink-900" },
            ].map((item) => (
              <div key={item.label} className="wedding-subpanel px-3 py-3 md:px-6 md:py-6">
                <div className={`wedding-metric text-3xl md:text-5xl ${item.accent || "text-stone-900"}`}>
                  {String(item.val).padStart(2, "0")}
                </div>
                <div className="wedding-kicker mt-2 md:mt-3">{item.label}</div>
              </div>
            ))}
          </div>

          {isHomeCarouselEnabled && (
            <div className="wedding-subpanel mx-auto max-w-sm md:max-w-xl p-3 md:p-4 mb-10 md:mb-12">
              <div className="relative w-full aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-[24px]">
                <HeroCarousel />
              </div>
            </div>
          )}

          {(isHomeVenueEnabled || isHomeDressCodeEnabled) && (
            <div className="mx-auto mb-8 w-full max-w-3xl space-y-4 md:mb-10 md:space-y-5">
              {isHomeVenueEnabled && (
                <section className="wedding-subpanel p-4 text-left md:p-6">
                  <p className="wedding-kicker mb-2 text-center">Venue</p>
                  <h2 className="wedding-card-title text-center text-3xl text-[#4E5E72] md:text-4xl">{VENUE_NAME}</h2>
                  <p className="mt-2 text-center text-sm text-stone-500 md:text-base">{VENUE_ADDRESS}</p>
                  <div className="mt-5 overflow-hidden rounded-[18px] border border-stone-200 bg-white shadow-inner">
                    <iframe
                      title="Reflections Venue & Gardens map"
                      src={VENUE_MAP_EMBED}
                      className="h-[240px] w-full md:h-[300px]"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  <div className="mt-5 flex justify-center">
                    <a href={VENUE_MAP_LINK} target="_blank" rel="noreferrer" className="wedding-button-primary w-full md:w-auto">
                      View on Maps
                    </a>
                  </div>
                </section>
              )}

              {isHomeDressCodeEnabled && (
                <section className="wedding-subpanel px-6 py-6 text-center md:px-8 md:py-7">
                  <p className="wedding-kicker mb-3">Dress Code</p>
                  <h2 className="wedding-card-title text-[#4E5E72]">Formal Attire</h2>
                  <p className="wedding-copy mx-auto mt-3 max-w-2xl">{DRESS_CODE}</p>
                </section>
              )}
            </div>
          )}

          {(isSeatingChartEnabled || isGalleryEnabled) && (
            <div className="flex flex-col md:flex-row justify-center items-stretch md:items-center gap-4 md:gap-5">
              {isSeatingChartEnabled && (
                <Link href="/mytable" className="wedding-button-primary w-full md:w-auto">
                  Find Your Table
                </Link>
              )}
              {isGalleryEnabled && (
                <Link href="/gallery" className="wedding-button-primary w-full md:w-auto">
                  Guest Gallery
                </Link>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
