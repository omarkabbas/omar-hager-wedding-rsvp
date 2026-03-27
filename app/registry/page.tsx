"use client";
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';

export default function RegistryPage() {
  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative overflow-x-hidden">
      <Navigation />
      
      {/* Centered Main Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center -mt-10 md:-mt-20">
        
        {/* THE WHITE CONTAINER: Matches Gallery Card Exactly */}
        <div className="max-w-md md:max-w-2xl w-full bg-white p-8 md:p-16 rounded-[40px] md:rounded-[50px] shadow-2xl border border-stone-100 animate-in zoom-in duration-1000">
          
          {/* Logo - Scaled for mobile */}
          <div className="flex justify-center mb-6 md:mb-10">
            <img src="/logo.png" alt="Logo" className="w-20 md:w-32 h-auto" />
          </div>

          {/* Title - Optimized for iPhone Width */}
          <h1 className="text-4xl md:text-8xl font-serif mb-6 md:mb-10 text-stone-900 tracking-tight leading-tight">
            Registry
          </h1>

          {/* Decorative line */}
          <div className="h-px w-20 md:w-32 bg-stone-300 mx-auto mb-8 md:mb-12"></div>

          {/* Subtext */}
          <p className="text-stone-700 mb-6 md:mb-8 italic font-light text-lg md:text-2xl leading-relaxed px-2">
            Your presence at our wedding is the greatest gift of all.
          </p>

          {/* Main Message */}
          <p className="text-stone-600 mb-10 md:mb-16 font-light text-sm md:text-lg max-w-lg mx-auto leading-relaxed italic font-sans px-2">
            "As we already have a home filled with everything we need, we kindly request no boxed or bagged gifts. Should you wish to honor us with a gift toward our future together, it would be most sincerely appreciated."
          </p>

          {/* CTA - Gallery Style Button */}
          <Link 
            href="/" 
            className="inline-block px-10 py-4 md:py-5 bg-stone-900 text-white rounded-full text-[10px] md:text-xs uppercase font-bold tracking-widest shadow-xl hover:bg-stone-800 transition-all active:scale-95"
          >
            Return Home
          </Link>
        </div>
      </main>
    </div>
  );
}