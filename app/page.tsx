"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';
import { supabase } from '@/lib/supabase';
import HeroCarousel from '@/app/components/HeroCarousel';

export default function HomePage() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase.from('settings').select('key, value').in('key', ['is_seating_chart_enabled', 'is_gallery_enabled']);
      if (data) {
        const seatingSetting = data.find(s => s.key === 'is_seating_chart_enabled');
        if (seatingSetting) setIsSeatingChartEnabled(seatingSetting.value === 'true');
        
        const gallerySetting = data.find(s => s.key === 'is_gallery_enabled');
        if (gallerySetting) setIsGalleryEnabled(gallerySetting.value === 'true');
      }
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
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative">
      <Navigation />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-6 pb-20 px-4 md:px-6 text-center">
        <div className="max-w-4xl w-full animate-in fade-in zoom-in duration-1000">
          
          <div className="flex justify-center mb-10">
            <img src="/logo.png" alt="Omar & Hager Logo" className="w-44 h-auto" />
          </div>

          {/* Larger "The Wedding of" text */}
          <h2 className="uppercase tracking-[0.6em] text-[16px] md:text-[20px] text-stone-500 mb-8 font-bold">The Wedding of</h2>
          
          <h1 className="text-7xl md:text-9xl font-serif mb-12 text-stone-900 tracking-tighter">Omar & Hager</h1>

          <div className="mb-14 text-5xl md:text-7xl font-serif text-stone-800 tracking-tight leading-none">June 06, 2026</div>

          <div className="h-px w-32 bg-stone-300 mx-auto mb-16"></div>
          
          <div className="flex justify-center gap-6 md:gap-12 mb-20 font-serif">
            {[
              { val: timeLeft.days, label: "Days" },
              { val: timeLeft.hours, label: "Hrs" },
              { val: timeLeft.minutes, label: "Mins" },
              { val: timeLeft.seconds, label: "Secs", color: "text-pink-900" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className={`text-4xl md:text-6xl ${item.color || 'text-stone-800'}`}>{String(item.val).padStart(2, '0')}</span>
                <span className="text-[10px] uppercase tracking-widest text-stone-500 mt-3 font-bold font-sans">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Venue card with no tilt and standard path */}
          <div className="relative w-full max-w-md md:max-w-lg mx-auto p-3 md:p-5 bg-white shadow-2xl rounded-md md:rounded-xl">
            <div className="relative w-full aspect-[3/4] md:aspect-[4/5]">
              <HeroCarousel />
            </div>
          </div>

          {(isSeatingChartEnabled || isGalleryEnabled) && (
            <div className="mt-16 flex flex-col md:flex-row justify-center items-center gap-6 animate-in fade-in duration-1000">
              {isSeatingChartEnabled && (
                <Link href="/mytable" className="inline-block px-14 py-5 bg-stone-900 text-white rounded-full text-sm uppercase font-bold shadow-xl hover:bg-stone-800 transition-colors w-full md:w-auto">
                  Find Your Table
                </Link>
              )}
              {isGalleryEnabled && (
                <Link href="/gallery" className="inline-block px-14 py-5 bg-stone-900 text-white rounded-full text-sm uppercase font-bold shadow-xl hover:bg-stone-800 transition-colors w-full md:w-auto">
                  Guest Gallery
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}