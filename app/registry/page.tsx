"use client";

import Link from "next/link";
import Navigation from "@/app/components/Navigation";

export default function RegistryPage() {
  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main wedding-center text-center">
        <section className="wedding-page-panel text-center animate-in zoom-in duration-1000">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Omar & Hager logo" className="w-20 md:w-24 h-auto" />
          </div>

          <p className="wedding-kicker mb-3">Registry</p>
          <h1 className="wedding-title text-4xl md:text-6xl mb-4">Registry</h1>
          <div className="wedding-divider mb-8" />

          <div className="space-y-5 max-w-xl mx-auto">
            <p className="font-serif italic text-stone-700 text-base md:text-xl leading-relaxed">
              Your presence at our wedding is the greatest gift of all.
            </p>
            <div className="wedding-subpanel px-6 py-6 md:px-8 md:py-8">
              <p className="text-sm md:text-base text-stone-600 leading-relaxed italic">
                &ldquo;As we already have a home filled with everything we need, we kindly request no boxed
                or bagged gifts. Should you wish to honor us with a gift toward our future together,
                it would be most sincerely appreciated.&rdquo;
              </p>
            </div>
          </div>

          <div className="mt-8 md:mt-10">
            <Link href="/" className="wedding-button-primary w-full md:w-auto">
              Return Home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
