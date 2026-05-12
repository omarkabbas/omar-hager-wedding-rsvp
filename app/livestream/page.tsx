"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";
import { isYoutubeUrl, toYoutubeEmbedUrl } from "@/lib/youtube";

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
  const hasUnsupportedYoutubeUrl = useMemo(() => Boolean(livestreamUrl.trim()) && isYoutubeUrl(livestreamUrl) && !embedUrl, [embedUrl, livestreamUrl]);

  if (isEnabled === false) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel wedding-animate-up max-w-2xl text-center">
            <div className="flex justify-center mb-6">
              <Image src="/logo.png" alt="Omar & Hager logo" width={96} height={96} className="wedding-logo w-20 md:w-24" />
            </div>
            <p className="wedding-kicker mb-3">Livestream</p>
            <h1 className="wedding-state-title mb-4 text-[#4E5E72]">Livestream is not available yet</h1>
            <p className="wedding-lead mx-auto max-w-md">
              We&apos;ll open this page closer to the celebration.
            </p>
            <div className="mt-8">
              <Link href="/" className="wedding-button-primary w-full md:w-auto">
                Return Home
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />
      <main className="wedding-main wedding-center text-center">
        <section className="wedding-page-panel wedding-animate-up w-full max-w-5xl text-center">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Omar & Hager logo"
              width={96}
              height={96}
              className="wedding-logo w-20 md:w-24"
              priority
            />
          </div>

          <p className="wedding-kicker mb-3">Livestream</p>
          <h1 className="wedding-page-title mb-3 text-[#4E5E72]">Wedding Livestream</h1>
          <p className="wedding-lead mx-auto mb-6 max-w-2xl md:mb-8 md:text-xl">
            Celebrate with us live from wherever you are.
          </p>
          <div className="wedding-divider mb-6 md:mb-8" />

          {isEnabled === null ? (
            <div className="wedding-subpanel p-3 md:p-4">
              <div className="aspect-video animate-pulse rounded-[18px] bg-white" />
            </div>
          ) : embedUrl ? (
            <div className="wedding-subpanel p-2 md:p-3">
              <iframe
                title="Omar & Hager wedding livestream"
                src={embedUrl}
                className="aspect-video w-full rounded-[18px] border-0 bg-white shadow-inner"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : hasUnsupportedYoutubeUrl ? (
            <div className="wedding-subpanel flex min-h-[260px] items-center justify-center px-6 py-10 text-center md:min-h-[360px]">
              <div>
                <p className="wedding-kicker mb-3">Livestream</p>
                <h2 className="wedding-state-title mb-4 text-[#4E5E72]">Livestream setup needs attention</h2>
                <p className="wedding-lead mx-auto max-w-xl text-stone-600">
                  The livestream link is not ready to play here yet. Please check back soon.
                </p>
              </div>
            </div>
          ) : (
            <div className="wedding-subpanel flex min-h-[260px] items-center justify-center px-6 py-10 text-center md:min-h-[360px]">
              <div>
                <p className="wedding-kicker mb-3">Livestream</p>
                <h2 className="wedding-state-title mb-4 text-[#4E5E72]">Livestream link coming soon</h2>
                <p className="wedding-lead mx-auto max-w-xl">
                  We&apos;ll add the live video here before the celebration begins.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 md:mt-8">
            <Link href="/" className="wedding-button-secondary w-full md:w-auto">
              Return Home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
