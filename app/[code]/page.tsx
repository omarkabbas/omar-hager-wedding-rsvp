"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function GuestRSVP() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = params.code as string;

  const [guestData, setGuestData] = useState<GuestData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAttending, setIsAttending] = useState("true");

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
    const countValue = attendingValue ? parseInt(formData.get("count") as string, 10) : 0;

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
      `}</style>

      <main className="wedding-main wedding-center">
        {loading ? (
          <div className="py-10 wedding-lead animate-pulse text-lg">
            Finding your invitation...
          </div>
        ) : (
          <section className="wedding-page-panel animate-in zoom-in duration-1000">
            <div className="flex justify-center mb-6">
              <img src="/logo.png" alt="Omar & Hager logo" className="w-20 md:w-24 h-auto" />
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
              <div className="py-2 animate-in fade-in duration-1000 text-center">
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
                      <p className="wedding-kicker mb-3">The Venue</p>
                      <p className="wedding-card-title">
                        Reflections Venue & Gardens
                      </p>
                      <p className="mt-4 text-sm md:text-base text-stone-500 leading-relaxed">
                        1901 E Spring Creek Pkwy, Plano, TX 75074
                      </p>
                      <div className="mt-6 flex justify-center">
                        <a
                          href="https://maps.google.com/maps?q=Reflections+Venue+and+Gardens+Plano"
                          target="_blank"
                          rel="noreferrer"
                          className="wedding-button-secondary"
                        >
                          Get Directions
                        </a>
                      </div>
                    </div>

                    <div className="wedding-subpanel px-6 py-6 md:px-8 md:py-8 text-center">
                      <p className="wedding-kicker mb-3">A Note On Gifts</p>
                      <p className="wedding-copy italic">
                        As we already have a home filled with everything we need, we kindly request no boxed
                        or bagged gifts. Should you wish to honor us with a gift toward our future together,
                        it would be most sincerely appreciated.
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
                </div>

                <div className="space-y-2 text-left">
                  <label className="wedding-kicker block ml-2">Will You Join Us?</label>
                  <select
                    name="attending"
                    value={isAttending}
                    onChange={(e) => setIsAttending(e.target.value)}
                    required
                    className="wedding-select"
                  >
                    <option value="true">Happily Accepts</option>
                    <option value="false">Regretfully Declines</option>
                  </select>
                </div>

                {isAttending === "true" && (
                  <div className="space-y-2 text-left animate-in slide-in-from-top-4 duration-500">
                    <label className="wedding-kicker block ml-2">Your Party Size</label>
                    <select name="count" required className="wedding-select">
                      {Array.from({ length: guestData.max_guests }, (_, i) => i + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} {count === 1 ? "Guest" : "Guests"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button type="submit" className="wedding-button-primary w-full">
                  Confirm RSVP
                </button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
