"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
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
      <nav className="relative z-50 p-10 flex justify-center space-x-12 text-[14px] uppercase tracking-[0.3em] text-stone-600 font-bold">
        <Link href="/" className="px-8 py-4 text-stone-900 border-b-2 border-stone-900">Home</Link>
        <Link href="/registry" className="px-8 py-4 hover:text-stone-900 transition-all">Registry</Link>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-6 pb-20 p-6 text-center">
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
          <div className="relative max-w-sm mx-auto p-4 bg-white shadow-2xl rounded-sm">
             <img src="/savethedate-bg.JPEG" alt="Wedding Garden" className="w-full h-auto object-cover" />
          </div>
        </div>
      </main>
    </div>
  );
}