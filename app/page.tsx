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
    <div className="min-h-screen bg-[#FAF9F6] text-stone-800 flex flex-col font-sans">
      {/* Navigation - Fixed Links */}
      <nav className="p-8 flex justify-center space-x-12 text-[10px] uppercase tracking-[0.3em] text-stone-400">
        <Link href="/" className="text-stone-900 border-b border-stone-900 pb-1 font-bold">Home</Link>
        <Link href="/registry" className="hover:text-stone-600 transition-colors">Registry</Link>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center -mt-12">
        <div className="max-w-4xl animate-in fade-in zoom-in duration-1000">
          <h2 className="uppercase tracking-[0.5em] text-[10px] text-stone-400 mb-8 font-bold">
            The Wedding of
          </h2>
          
          <h1 className="text-7xl md:text-9xl font-serif mb-10 text-stone-900 tracking-tighter">
            Omar & Hager
          </h1>

          <div className="h-px w-32 bg-stone-200 mx-auto mb-10"></div>

          {/* Big Date and Single Dallas Tag */}
          <div className="mb-14">
            <p className="text-4xl md:text-6xl font-serif text-stone-800 tracking-tight leading-none">
              June 06, 2026
            </p>
            <p className="text-xs uppercase tracking-[0.4em] text-stone-400 mt-6 font-semibold">
              Dallas, Texas
            </p>
          </div>
          
          {/* Countdown */}
          <div className="flex justify-center gap-6 md:gap-12 mb-16">
            {[
              { val: timeLeft.days, label: "Days" },
              { val: timeLeft.hours, label: "Hours" },
              { val: timeLeft.minutes, label: "Mins" },
              { val: timeLeft.seconds, label: "Secs", color: "text-pink-800" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className={`text-4xl md:text-6xl font-serif ${item.color || 'text-stone-800'}`}>
                  {String(item.val).padStart(2, '0')}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-stone-400 mt-3 font-semibold">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-stone-300 text-[10px] uppercase tracking-[0.4em] font-light italic">
            Celebrating New Beginnings
          </p>
        </div>
      </main>
    </div>
  );
}