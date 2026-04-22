"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

type GalleryPhoto = {
  id: string;
  name: string;
  thumbnailLink?: string | null;
  webViewLink: string;
};

export default function GalleryPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [status, setStatus] = useState("");
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isGalleryFeedEnabled, setIsGalleryFeedEnabled] = useState(true);

  const fetchPhotos = async () => {
    try {
      const res = await fetch("/api/photos", { cache: "no-store" });
      const data: unknown = await res.json();

      if (Array.isArray(data)) setPhotos(data as GalleryPhoto[]);
    } catch (error) {
      console.error("Failed to fetch photos", error);
    }
  };

  useEffect(() => {
    const checkSecurity = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["is_gallery_enabled", "is_gallery_feed_enabled"]);

      if (!data) return;

      const gallerySetting = data.find((row) => row.key === "is_gallery_enabled");
      const feedSetting = data.find((row) => row.key === "is_gallery_feed_enabled");

      if (gallerySetting) setIsEnabled(gallerySetting.value === "true");
      if (feedSetting) setIsGalleryFeedEnabled(feedSetting.value === "true");
    };

    void checkSecurity();

    const channel = supabase
      .channel("gallery_security")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings", filter: "key=eq.is_gallery_enabled" },
        (payload) => setIsEnabled(payload.new.value === "true"),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings", filter: "key=eq.is_gallery_feed_enabled" },
        (payload) => setIsGalleryFeedEnabled(payload.new.value === "true"),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (isEnabled !== true || !isGalleryFeedEnabled) return;
    void fetchPhotos();
  }, [isEnabled, isGalleryFeedEnabled]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    if (e.target.files.length > 5) {
      setStatus("⚠️ Maximum 5 photos allowed.");
      setFiles([]);
      e.target.value = "";
      return;
    }

    setFiles(Array.from(e.target.files));
    setStatus("");
    setProgress(0);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setProgress(5);
    const CHUNK_SIZE = 1024 * 1024;

    try {
      for (const file of files) {
        setStatus(`✨ Optimizing ${file.name}...`);
        const totalSize = file.size;
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
        const fileId = Math.random().toString(36).substring(7);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (chunkIndex === 0) setStatus("🖼️ Connecting to gallery...");
          else if (chunkIndex === Math.floor(totalChunks / 2)) setStatus("📸 Sending memories...");
          else if (chunkIndex === totalChunks - 1) setStatus("❤️ Almost there...");

          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          const chunk = file.slice(start, end);

          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(chunk);
          });
          const base64Data = await base64Promise;

          const res = await fetch("/api/upload-chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId,
              fileName: file.name,
              fileType: file.type,
              chunkIndex,
              totalChunks,
              totalSize,
              data: base64Data.split(",")[1],
            }),
          });

          if (!res.ok) throw new Error("Chunk failed");
          setProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
        }
      }

      setStatus("✨ Success! Photos shared.");
      setFiles([]);
      if (isGalleryFeedEnabled) {
        void fetchPhotos();
      }
      setTimeout(() => {
        setProgress(0);
        setStatus("");
      }, 4000);
    } catch {
      setStatus("⚠️ Upload failed. Check connection.");
    } finally {
      setUploading(false);
    }
  };

  const chunkPhotos = (arr: GalleryPhoto[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

  if (isEnabled === false) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel max-w-2xl text-center">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo.png"
                alt="Omar & Hager logo"
                width={80}
                height={80}
                className="wedding-logo w-20"
              />
            </div>
            <p className="wedding-kicker mb-3">Guest Gallery</p>
            <h1 className="wedding-state-title mb-4 text-[#4E5E72]">Gallery is not available yet</h1>
            <p className="wedding-lead">Check back later!</p>
          </section>
        </main>
      </div>
    );
  }

  if (isEnabled === null) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />

        <main className="wedding-main pt-2 md:pt-4">
          <section className="wedding-page-panel wedding-animate-fade max-w-2xl text-center">
            <div className="mx-auto mb-6 h-20 w-20 animate-pulse rounded-full bg-stone-100" />
            <p className="wedding-kicker mb-3">Guest Gallery</p>
            <div className="mx-auto mb-4 h-10 w-56 animate-pulse rounded-full bg-stone-100" />
            <div className="mx-auto h-5 w-64 max-w-full animate-pulse rounded-full bg-stone-100" />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main pt-2 md:pt-4">
        <section className="wedding-page-panel wedding-animate-up max-w-2xl text-center">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Omar & Hager logo"
              width={96}
              height={96}
              className="wedding-logo w-20 md:w-24"
            />
          </div>

          <p className="wedding-kicker mb-3">Guest Gallery</p>
          <h1 className="wedding-page-title mb-3 text-[#4E5E72]">Guest Gallery</h1>
          <p className="wedding-lead md:text-xl mb-8 md:mb-10">
            Share memories with us
          </p>

          <form onSubmit={handleUpload} className="space-y-5 text-left">
            <div className="space-y-2 relative">
              <label className="wedding-kicker block ml-2">Select Photos</label>
              <div className="relative w-full">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <div className="wedding-input flex items-center justify-between gap-4">
                  <span className={`truncate ${files.length > 0 ? "text-stone-900" : "text-stone-400 italic"}`}>
                    {files.length > 0 ? `${files.length} selected` : "Choose up to 5 photos"}
                  </span>
                  <span className="wedding-button-secondary shrink-0 px-4 py-2">Browse</span>
                </div>
              </div>
            </div>

            {progress > 0 && (
              <div className="w-full h-3 overflow-hidden rounded-full bg-stone-100 shadow-inner">
                <div
                  className={`flex h-full items-center justify-center text-[9px] font-black text-white transition-all duration-300 ${
                    progress === 100 ? "bg-emerald-500" : "bg-stone-900"
                  }`}
                  style={{ width: `${progress}%` }}
                >
                  {progress > 20 ? `${progress}%` : ""}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className={`wedding-button-primary w-full ${files.length === 0 || uploading ? "opacity-40 pointer-events-none" : ""}`}
            >
              {uploading ? "Uploading..." : "Upload Photos"}
            </button>

            {status && (
              <p
                className={`text-center wedding-copy italic min-h-5 ${
                  status.includes("Success") ? "text-emerald-600" : "text-stone-500"
                }`}
              >
                {status}
              </p>
            )}
          </form>
        </section>

        {isGalleryFeedEnabled && (
          <section className="mx-auto mt-12 md:mt-16 w-full max-w-7xl">
            <div className="text-center mb-8 md:mb-10">
              <p className="wedding-kicker mb-3">Shared Photos</p>
              <h2 className="wedding-state-title text-[#4E5E72]">Guest Moments</h2>
            </div>

            {photos.length === 0 ? (
              <div className="wedding-panel mx-auto max-w-2xl px-6 py-10 md:px-10 text-center">
                <p className="wedding-lead text-stone-400 text-lg">No photos shared yet.</p>
              </div>
            ) : (
              <div className="space-y-8 md:space-y-12">
                {chunkPhotos(photos, 6).map((row, rowIndex) => (
                  <div
                    key={`row-${rowIndex}`}
                    className="flex w-full snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-3 md:gap-6"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                  >
                    {row.map((photo) => {
                      const imageSrc = photo.thumbnailLink ? photo.thumbnailLink.replace("=s220", "=s1000") : null;

                      return (
                        <div key={photo.id} className="w-[72vw] max-w-[280px] shrink-0 snap-center md:w-[250px]">
                          <div className="wedding-subpanel overflow-hidden p-2 transition-all duration-200 active:scale-95">
                            <a
                              href={photo.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block relative aspect-[4/5] overflow-hidden rounded-[20px] bg-stone-100"
                            >
                              {imageSrc ? (
                                <Image
                                  src={imageSrc}
                                  alt={photo.name}
                                  fill
                                  unoptimized
                                  sizes="(max-width: 768px) 72vw, 250px"
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center p-4">
                                  <div className="mb-2 h-full w-full animate-pulse rounded-sm bg-stone-200" />
                                  <p className="text-[10px] italic text-stone-400">Processing HD...</p>
                                </div>
                              )}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
