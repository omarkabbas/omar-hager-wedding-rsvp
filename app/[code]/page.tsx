"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

type GuestData = {
  id: number;
  guest_name: string;
  max_guests: number;
  attending: boolean | null;
  confirmed_guests: number | null;
};

const RSVP_BY_DATE = process.env.NEXT_PUBLIC_RSVP_BY_DATE || "May 1, 2026";

export default function GuestRSVP() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = params.code as string;

  const [guestData, setGuestData] = useState<GuestData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAttending, setIsAttending] = useState("true");
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiPieces = useMemo(() => Array.from({ length: 240 }, (_, i) => i), []);
  const rsvpByLabel = useMemo(() => {
    const parsed = new Date(RSVP_BY_DATE);
    if (Number.isNaN(parsed.getTime())) return RSVP_BY_DATE;
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, []);

  const mapLink =
    "https://maps.google.com/maps?q=Reflections+Venue+and+Gardens+Plano";
  const mapEmbedLink =
    "https://www.google.com/maps?q=Reflections%20Venue%20%26%20Gardens%2C%201901%20E%20Spring%20Creek%20Pkwy%2C%20Plano%2C%20TX%2075074&output=embed";
  const calendarLink = "/omar-hager-wedding.ics";

  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) return;

      const { data } = await supabase
        .from("rsvp_list")
        .select("*")
        .eq("invite_code", inviteCode.toUpperCase().trim())
        .maybeSingle<GuestData>();

      if (data) {
        setGuestData(data);

        if (data.attending !== null) {
          setSubmitted(true);
        } else {
          const hasSeenEnvelope = sessionStorage.getItem(`seen_envelope_${inviteCode}`);

          if (!hasSeenEnvelope) {
            router.push(`/invite?code=${inviteCode}`);
            return;
          }
        }
      }

      setLoading(false);
    }

    fetchGuest();
  }, [inviteCode, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guestData) return;

    const formData = new FormData(e.currentTarget);
    const attendingValue = formData.get("attending") === "true";
    const countValue = attendingValue
      ? guestData.max_guests === 1
        ? 1
        : parseInt(formData.get("count") as string, 10)
      : 0;

    const { error } = await supabase
      .from("rsvp_list")
      .update({
        attending: attendingValue,
        confirmed_guests: countValue,
      })
      .eq("id", guestData.id);

    if (!error) {
      setGuestData({ ...guestData, attending: attendingValue, confirmed_guests: countValue });
      setSubmitted(true);
      if (attendingValue) {
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 5600);
      }
    }
  }

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <style jsx global>{`
        select {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }
        select::-ms-expand {
          display: none;
        }
        select option {
          background: #ffffff;
          color: #1c1917;
          padding: 10px;
        }
        @keyframes weddingConfettiFall {
          0% {
            transform: translate3d(0, -30vh, 0) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--x-shift, 0px), 110vh, 0) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>

      <main className="wedding-main wedding-center">
        {loading ? (
          <div className="py-10 wedding-lead animate-pulse text-lg">
            Finding your invitation...
          </div>
        ) : (
          <section className="wedding-page-panel wedding-animate-up relative overflow-hidden">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo.png"
                alt="Omar & Hager logo"
                width={96}
                height={96}
                className="wedding-logo w-20 md:w-24"
              />
            </div>

            {!guestData ? (
              <div className="text-center py-2">
                <p className="wedding-kicker mb-3">Invitation</p>
                <h2 className="wedding-state-title mb-4">Invite Not Found</h2>
                <p className="wedding-lead mb-8">
                  Please check your invite link or contact Omar & Hager.
                </p>
                <Link href="/" className="wedding-button-primary w-full md:w-auto">
                  Return Home
                </Link>
              </div>
            ) : submitted ? (
              <div className="wedding-animate-fade py-2 text-center">
                {guestData.attending && showConfetti && (
                  <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
                    {confettiPieces.map((piece) => (
                      <span
                        key={piece}
                        className="absolute top-0"
                        style={
                          {
                            left: `${(piece * 37) % 100}%`,
                            background:
                              piece % 5 === 0
                                ? "#86efac"
                                : piece % 5 === 1
                                  ? "#c4b5fd"
                                  : piece % 5 === 2
                                    ? "#f9a8d4"
                                    : piece % 5 === 3
                                      ? "#fcd34d"
                                      : "#7dd3fc",
                            width: `${8 + (piece % 6)}px`,
                            height: `${10 + (piece % 7)}px`,
                            borderRadius: piece % 3 === 0 ? "999px" : "2px",
                            boxShadow: "0 0 14px rgba(255,255,255,0.42)",
                            backgroundImage:
                              "linear-gradient(130deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.08) 36%, rgba(255,255,255,0) 70%)",
                            animation: `weddingConfettiFall ${2.4 + (piece % 8) * 0.22}s ease-out ${piece * 0.012}s both`,
                            "--x-shift": `${(piece % 2 === 0 ? 1 : -1) * (40 + (piece % 11) * 11)}px`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                )}

                <p className="wedding-kicker mb-3">Response Received</p>
                <h2 className="wedding-page-title mb-5">
                  {guestData.attending ? "You’re RSVP’d!" : "We’ve received your response"}
                </h2>
                <div className="wedding-divider mb-8" />
                <p className="wedding-lead text-stone-600 text-lg md:text-xl mb-8 md:mb-10">
                  {guestData.attending
                    ? "We can’t wait to celebrate with you!"
                    : "Thanks for letting us know you can’t make it ☹️"}
                </p>

                {guestData.attending && (
                  <div className="space-y-5 text-left max-w-xl mx-auto">
                    <div className="wedding-subpanel px-6 py-6 md:px-8 md:py-8 text-center">
                      <p className="wedding-kicker mb-3">Wedding Details</p>
                      <p className="wedding-card-title">Reflections Venue & Gardens</p>
                      <p className="mt-3 text-sm md:text-base text-stone-600 leading-relaxed">
                        Saturday, June 6, 2026
                      </p>
                      <p className="text-sm md:text-base text-stone-500 leading-relaxed">
                        We kindly invite guests to begin arriving at 6:00 PM.
                      </p>
                      <p className="mt-4 text-sm md:text-base text-stone-500 leading-relaxed">
                        1901 E Spring Creek Pkwy, Plano, TX 75074
                      </p>
                      <div className="mt-5 overflow-hidden rounded-[18px] border border-stone-200 bg-white shadow-inner">
                        <iframe
                          title="Reflections Venue & Gardens map"
                          src={mapEmbedLink}
                          className="h-[220px] w-full md:h-[280px]"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                        <a
                          href={mapLink}
                          target="_blank"
                          rel="noreferrer"
                          className="wedding-button-secondary"
                        >
                          View Map
                        </a>
                        <a
                          href={calendarLink}
                          target="_blank"
                          rel="noreferrer"
                          className="wedding-button-secondary"
                        >
                          Add to Calendar
                        </a>
                      </div>
                    </div>

                    <div className="wedding-subpanel px-6 py-6 md:px-8 md:py-8 text-center">
                      <p className="wedding-kicker mb-3">A Note On Gifts</p>
                      <p className="wedding-copy italic">
                        As we are fortunate to have a home already filled with everything we need, we kindly
                        request no boxed or bagged gifts. If you&apos;d like to honor us with a gift, a
                        contribution toward our future would be deeply appreciated and will help us create
                        cherished memories together.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-10">
                  <Link href="/" className="wedding-button-primary w-full md:w-auto">
                    Explore Our Website
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-7">
                <div className="text-center">
                  <p className="wedding-kicker mb-3">RSVP</p>
                  <p className="wedding-lead text-stone-400 text-xl mb-1">Welcome,</p>
                  <h2 className="wedding-title text-4xl md:text-5xl">{guestData.guest_name}</h2>
                  <p className="mt-3 text-[13px] italic tracking-[0.01em] text-stone-500 md:text-sm">
                    We have reserved {guestData.max_guests} {guestData.max_guests === 1 ? "seat" : "seats"} in your honor.
                  </p>
                </div>

                <div className="space-y-2 text-left">
                  <p className="text-center text-[13px] italic tracking-[0.01em] text-stone-500 md:text-sm">
                    Kindly reply by {rsvpByLabel}.
                  </p>
                  <label className="wedding-kicker block ml-2">Will you be attending?</label>
                  <select
                    name="attending"
                    value={isAttending}
                    onChange={(e) => setIsAttending(e.target.value)}
                    required
                    className="wedding-select"
                  >
                    <option value="true">Joyfully Accepts</option>
                    <option value="false">Regretfully Declines</option>
                  </select>
                </div>

                {isAttending === "true" && guestData.max_guests > 1 && (
                  <div className="wedding-animate-up space-y-2 text-left">
                    <label className="wedding-kicker block ml-2">Number of Guests Attending</label>
                    <select name="count" required className="wedding-select">
                      {Array.from({ length: guestData.max_guests }, (_, i) => i + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} {count === 1 ? "Guest" : "Guests"}
                        </option>
                      ))}
                    </select>
                    <p className="ml-2 text-xs text-stone-500">
                      Please include children in your total.
                    </p>
                  </div>
                )}

                <button type="submit" className="wedding-button-primary w-full">
                  Submit RSVP
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
