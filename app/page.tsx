"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/app/components/Navigation";
import HeroCarousel from "@/app/components/HeroCarousel";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["is_seating_chart_enabled", "is_gallery_enabled"]);

      if (!data) return;

      const seatingSetting = data.find((setting) => setting.key === "is_seating_chart_enabled");
      const gallerySetting = data.find((setting) => setting.key === "is_gallery_enabled");

      if (seatingSetting) setIsSeatingChartEnabled(seatingSetting.value === "true");
      if (gallerySetting) setIsGalleryEnabled(gallerySetting.value === "true");
    };

    fetchSettings();

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

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main wedding-center pt-2 md:pt-4">
        <section className="wedding-panel w-full max-w-5xl px-6 py-10 md:px-12 md:py-14 text-center animate-in fade-in zoom-in duration-1000">
          <div className="flex justify-center mb-8 md:mb-10">
            <img src="/logo.png" alt="Omar & Hager Logo" className="w-28 md:w-36 h-auto" />
          </div>

          <p className="wedding-kicker mb-4">The Wedding Of</p>
          <h1 className="wedding-title text-5xl leading-none md:text-8xl mb-6 md:mb-8">Omar & Hager</h1>
          <p className="font-serif text-3xl md:text-5xl text-stone-700 mb-8 md:mb-10">June 06, 2026</p>

          <div className="wedding-divider mb-8 md:mb-10" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10 md:mb-12 max-w-3xl mx-auto">
            {[
              { val: timeLeft.days, label: "Days" },
              { val: timeLeft.hours, label: "Hours" },
              { val: timeLeft.minutes, label: "Minutes" },
              { val: timeLeft.seconds, label: "Seconds", accent: "text-pink-900" },
            ].map((item) => (
              <div key={item.label} className="wedding-subpanel px-4 py-5 md:px-6 md:py-6">
                <div className={`font-serif text-4xl md:text-5xl ${item.accent || "text-stone-900"}`}>
                  {String(item.val).padStart(2, "0")}
                </div>
                <div className="wedding-kicker mt-3">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="wedding-subpanel mx-auto max-w-sm md:max-w-xl p-3 md:p-4 mb-10 md:mb-12">
            <div className="relative w-full aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-[24px]">
              <HeroCarousel />
            </div>
          </div>

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
