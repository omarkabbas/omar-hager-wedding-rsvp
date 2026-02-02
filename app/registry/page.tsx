"use client";
import Link from 'next/link';

export default function RegistryPage() {
  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative">
      <nav className="relative z-50 p-10 flex justify-center space-x-12 text-[14px] uppercase tracking-[0.3em] text-stone-600">
        <Link href="/" className="px-12 py-6 hover:text-stone-900 transition-all">Home</Link>
        <Link href="/registry" className="px-12 py-6 text-stone-900 border-b-2 border-stone-900 font-bold">Registry</Link>
      </nav>
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center -mt-20">
        <div className="max-w-2xl bg-white/40 backdrop-blur-md p-16 rounded-[50px] shadow-2xl border border-white/20 animate-in zoom-in duration-1000">
          <div className="flex justify-center mb-10"><img src="/logo.png" alt="Logo" className="w-32 h-auto" /></div>
          <h1 className="text-6xl md:text-8xl font-serif mb-10 text-stone-900 tracking-tight">Registry</h1>
          <div className="h-px w-32 bg-stone-300 mx-auto mb-12"></div>
          <p className="text-stone-700 mb-8 italic font-light text-2xl leading-relaxed">Your presence at our wedding is the greatest gift of all.</p>
          <p className="text-stone-600 mb-16 font-light text-lg max-w-lg mx-auto leading-relaxed italic font-sans">"As we already have a home filled with everything we need, we kindly request no boxed or bagged gifts. Should you wish to honor us with a gift toward our future together, it would be most sincerely appreciated."</p>
          <Link href="/" className="inline-block px-14 py-6 bg-stone-900 text-white rounded-full text-[12px] uppercase font-bold shadow-xl">Return Home</Link>
        </div>
      </main>
    </div>
  );
}