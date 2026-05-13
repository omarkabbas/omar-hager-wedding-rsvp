"use client";

import Image from "next/image";
import Link from "next/link";

export default function RsvpClosedMessage({
  guestName,
  embedded = false,
  showLogo = true,
}: {
  guestName?: string;
  embedded?: boolean;
  showLogo?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "wedding-animate-up py-2 text-center"
          : "wedding-page-panel wedding-animate-up relative z-10 mx-auto w-full max-w-2xl px-7 py-10 text-center md:px-12 md:py-12"
      }
    >
      {showLogo && (
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="Omar & Hager logo" width={96} height={96} className="wedding-logo w-20 md:w-24" />
        </div>
      )}
      <p className="wedding-kicker mb-3">RSVP</p>
      <h1 className={`${embedded ? "wedding-page-title" : "wedding-state-title"} mb-4 text-[#4E5E72]`}>RSVPs Are Now Closed</h1>
      <div className="wedding-divider mb-7" />
      <p className="wedding-lead mx-auto max-w-xl text-stone-600">
        {guestName ? `Hi ${guestName}, thank you for checking in.` : "Thank you for checking in."} The RSVP window has closed so we can
        finalize the celebration details.
      </p>
      <div className="mt-8">
        <Link href="/" className="wedding-button-primary w-full md:w-auto">
          Return Home
        </Link>
      </div>
    </div>
  );
}
