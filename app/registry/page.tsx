"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";

export default function RegistryPage() {
  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main wedding-center text-center">
        <section className="wedding-page-panel wedding-animate-up text-center">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Omar & Hager logo"
              width={96}
              height={96}
              className="wedding-logo w-20 md:w-24"
            />
          </div>

          <p className="wedding-kicker mb-3">Registry</p>
          <h1 className="wedding-page-title mb-4">Registry</h1>
          <div className="wedding-divider mb-8" />

          <div className="space-y-5 max-w-xl mx-auto">
            <p className="wedding-lead text-stone-700 md:text-xl">
              Your presence at our wedding is the greatest gift of all.
            </p>
            <div className="wedding-subpanel px-6 py-6 md:px-8 md:py-8">
              <p className="wedding-copy italic">
                &ldquo;As we are fortunate to have a home already filled with everything we need, we kindly
                request no boxed or bagged gifts. If you&apos;d like to honor us with a gift, a
                contribution toward our future would be deeply appreciated and will help us create
                cherished memories together.&rdquo;
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
