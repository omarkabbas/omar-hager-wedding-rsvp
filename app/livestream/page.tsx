"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

const toYoutubeEmbedUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtube.com") && url.pathname.startsWith("/watch")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed;
    }
    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
};

export default function LivestreamPage() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [livestreamUrl, setLivestreamUrl] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["is_livestream_enabled", "livestream_embed_url"]);

      if (error || !data) {
        setIsEnabled(false);
        setLivestreamUrl("");
        return;
      }

      const enabledSetting = data.find((row) => row.key === "is_livestream_enabled");
      const urlSetting = data.find((row) => row.key === "livestream_embed_url");

      setIsEnabled(enabledSetting?.value === "true");
      setLivestreamUrl(urlSetting?.value || "");
    };

    void fetchSettings();

    const channel = supabase
      .channel("livestream_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings", filter: "key=eq.is_livestream_enabled" }, (payload) => {
        const settingValue = (payload.new as { value?: string }).value;
        if (typeof settingValue === "string") setIsEnabled(settingValue === "true");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings", filter: "key=eq.livestream_embed_url" }, (payload) => {
        const settingValue = (payload.new as { value?: string }).value;
        if (typeof settingValue === "string") setLivestreamUrl(settingValue);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const embedUrl = useMemo(() => toYoutubeEmbedUrl(livestreamUrl), [livestreamUrl]);

  if (isEnabled === false) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel max-w-2xl text-center">
            <div className="flex justify-center mb-6">
              <Image src="/logo.png" alt="Omar & Hager logo" width={80} height={80} className="wedding-logo w-20" />
            </div>
            <p className="wedding-kicker mb-3">Livestream</p>
            <h1 className="wedding-state-title mb-4 text-[#4E5E72]">Livestream is not available yet</h1>
            <p className="wedding-lead">Check back later!</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />
      <main className="wedding-main wedding-center px-4 py-10">
        <section className="w-full max-w-5xl rounded-[26px] border border-stone-100 bg-white p-4 shadow-xl md:p-6">
          {isEnabled === null ? (
            <div className="aspect-video animate-pulse rounded-[18px] bg-stone-100" />
          ) : embedUrl ? (
            <iframe
              title="Omar & Hager wedding livestream"
              src={embedUrl}
              className="aspect-video w-full rounded-[18px] border-0 bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-[18px] border border-dashed border-stone-200 bg-stone-50 px-6 text-center">
              <div>
                <p className="wedding-kicker mb-3">Livestream</p>
                <h1 className="wedding-state-title mb-4 text-[#4E5E72]">Livestream link coming soon</h1>
                <p className="wedding-lead">Check back later!</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
