"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const RSVP_BY_DATE = process.env.NEXT_PUBLIC_RSVP_BY_DATE || "May 1, 2026";

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteCode = searchParams.get("code");

  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const rsvpByLabel = useMemo(() => {
    const parsed = new Date(RSVP_BY_DATE);
    if (Number.isNaN(parsed.getTime())) return RSVP_BY_DATE;
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, []);

  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("rsvp_list")
        .select("guest_name, attending")
        .eq("invite_code", inviteCode.toUpperCase().trim())
        .maybeSingle();

      if (data) {
        setGuestName(data.guest_name);

        if (data.attending !== null) {
          router.push(`/${inviteCode}`);
        }
      }

      setLoading(false);
    }

    fetchGuest();
  }, [inviteCode, router]);

  useEffect(() => {
    if (!showButton || !isAtBottom || hasAutoScrolledRef.current) return;

    hasAutoScrolledRef.current = true;
    buttonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isAtBottom, showButton]);

  const handleInteraction = () => {
    if (step !== 0) return;

    setStep(1);
    setTimeout(() => setStep(2), 760);
    setTimeout(() => setShowButton(true), 1850);
  };

  const handleProceed = () => {
    sessionStorage.setItem(`seen_envelope_${inviteCode}`, "true");
    router.push(`/${inviteCode}`);
  };

  const handleScroll = () => {
    if (cardRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = cardRef.current;
      setIsAtTop(scrollTop <= 10);
      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 16);
    }
  };

  if (loading) return <div className="wedding-shell" />;

  if (!guestName) {
    return (
      <div className="wedding-shell wedding-center px-4 py-10">
        <div className="wedding-backdrop" />
        <div className="wedding-panel relative z-10 w-full max-w-lg px-8 py-10 md:px-12 text-center">
          <p className="wedding-kicker mb-3">Invitation</p>
          <h1 className="wedding-state-title mb-4">Invite Not Found</h1>
          <p className="wedding-lead text-stone-600 mb-8">
            The invite code is missing or incorrect.
          </p>
          <button onClick={() => router.push("/")} className="wedding-button-primary w-full md:w-auto">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wedding-shell wedding-center px-4 py-8 md:px-8 md:py-12">
      <div className="wedding-backdrop" />

      <div className="wedding-panel wedding-animate-up relative z-10 mt-4 mb-8 flex w-full max-w-md flex-col items-center px-5 py-8 pb-12 pt-28 md:max-w-2xl md:px-8 md:py-10 md:pb-16 md:pt-34">
        <div className="absolute top-10 md:top-14 w-full px-4 text-center">
          <p className="wedding-kicker mb-3">You’re invited,</p>
          <h1 className="wedding-page-title italic leading-tight text-[#4E5E72]">{guestName}</h1>
        </div>

        <style>{`
          :root {
            --env-w: 300px;
            --env-h: 205px;
            --envelope-bg: #d4e8f9;
            --envelope-shadow: #88a8c3;
            --seal-size: 72px;
            --seal-y: calc(var(--env-h) * 0.745);
          }

          @media (min-width: 768px) {
            :root {
              --env-w: 460px;
              --env-h: 320px;
              --seal-size: 94px;
              --seal-y: calc(var(--env-h) * 0.735);
            }
          }

          .cssletter {
            position: relative;
            width: var(--env-w);
            height: var(--env-h);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2rem;
            margin-top: 8rem;
            z-index: 10;
            isolation: isolate;
          }

          @media (min-width: 768px) {
            .cssletter {
              margin-top: 10rem;
            }
          }

          .tap-top-instruction {
            position: absolute;
            top: -56px;
            width: 100%;
            text-align: center;
            text-shadow: 0 1px 2px rgba(255,255,255,0.8);
            transition: opacity 0.3s ease;
            z-index: 4;
          }

          .envelope {
            position: relative;
            width: var(--env-w);
            height: var(--env-h);
            background: linear-gradient(180deg, #eef7fd 0%, #d8e9f5 42%, #c5dced 100%);
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.72),
              inset 0 0 38px rgba(110, 146, 176, 0.12),
              0 15px 30px rgba(108, 132, 154, 0.16);
            border-radius: 10px;
          }

          .envelope::before {
            content: none;
          }

          .envelope::after {
            content: none;
          }

          .invite-card {
            position: absolute;
            width: 94%;
            height: 96%;
            left: 50%;
            bottom: 2%;
            background: white;
            z-index: 2;
            transition:
              transform 1s cubic-bezier(0.22, 1, 0.36, 1),
              width 1s cubic-bezier(0.22, 1, 0.36, 1),
              height 1s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 1s ease,
              border-radius 1s ease,
              z-index 0s linear;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.15);
            padding: 4px;
            cursor: pointer;
            overflow-y: auto;
            scrollbar-width: none;
            transform: translate3d(-50%, 0, 0);
            will-change: transform, width, height;
            backface-visibility: hidden;
          }

          .invite-card::-webkit-scrollbar {
            display: none;
          }

          .envelope-folds {
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: 3;
            position: absolute;
            inset: 0;
            border-radius: 10px;
            pointer-events: none;
          }

          .envelope-flap {
            width: 100%;
            height: 75%;
            position: absolute;
            top: 0;
            z-index: 5;
            overflow: hidden;
            transform-origin: top;
            pointer-events: none;
            transform: translateZ(0);
            backface-visibility: hidden;
            transition: transform 0.72s cubic-bezier(0.22, 1, 0.36, 1), z-index 0s 0s;
          }

          .envelope-flap::before,
          .envelope-left::before,
          .envelope-right::before,
          .envelope-bottom::before {
            content: "";
            transform: rotate(45deg);
            background: var(--envelope-bg);
            box-shadow: 0 0 30px -5px var(--envelope-shadow);
            width: 100%;
            aspect-ratio: 1;
            display: block;
            position: absolute;
          }

          .envelope-flap::before {
            top: auto;
            bottom: 50px;
            border-radius: 1.5rem;
          }

          @media (min-width: 768px) {
            .envelope-flap::before {
              bottom: 100px;
            }
          }

          .envelope-left::before {
            top: 10%;
            left: -65%;
          }

          .envelope-right::before {
            top: 10%;
            right: -65%;
          }

          .envelope-bottom::before {
            top: 60%;
            left: 0;
            border-radius: 5rem;
          }

          .cssletter.step-1 .envelope-flap,
          .cssletter.step-2 .envelope-flap {
            transform: rotateX(180deg) translateY(0);
            z-index: 1;
            transition: transform 0.72s cubic-bezier(0.22, 1, 0.36, 1), z-index 0s 0.34s;
          }

          .cssletter.step-1 .invite-card {
            transform: translate3d(-50%, -34%, 0);
            z-index: 2;
          }

          .cssletter.step-2 .invite-card {
            transform: translate3d(-50%, 12%, 0);
            z-index: 20;
            width: 122%;
            max-width: 92vw;
            height: 226%;
            max-height: min(90vh, 980px);
            padding: 8px;
            box-shadow: 0 24px 54px rgba(0,0,0,0.18);
            border-radius: 14px;
          }

          .scroll-instruction {
            position: absolute;
            bottom: 0;
            left: 50%;
            width: 100%;
            text-align: center;
            pointer-events: none;
            z-index: 30;
            transition: opacity 0.5s ease;
            background: linear-gradient(to top, rgba(255,255,255,0.95) 10%, rgba(255,255,255,0) 100%);
            padding: 52px 10px 14px;
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
            transform: translateX(-50%);
          }

          .seal-container {
            position: absolute;
            top: var(--seal-y);
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 6;
            transition: 0.3s all;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .cssletter.step-1 .seal-container,
          .cssletter.step-2 .seal-container {
            opacity: 0;
          }

          .seal-container img {
            width: var(--seal-size);
            height: var(--seal-size);
            object-fit: contain;
            filter: drop-shadow(0 4px 8px rgba(96, 124, 150, 0.18)) saturate(1.08);
          }
        `}</style>

        <div
          className={`cssletter ${step === 1 ? "step-1" : step === 2 ? "step-2" : ""} ${step === 0 ? "cursor-pointer" : ""}`}
          onClick={step === 0 ? handleInteraction : undefined}
        >
          {step === 0 && (
            <div className="tap-top-instruction wedding-lead animate-pulse text-sm md:text-base">
              Tap envelope to open
            </div>
          )}

          <div className="envelope">
            <div className="envelope-flap" />
            <div className="envelope-folds">
              <div className="envelope-left" />
              <div className="envelope-right" />
              <div className="envelope-bottom" />
            </div>
          </div>

          <div className="invite-card" onScroll={handleScroll} ref={cardRef}>
            <Image
              src="/O&H_invitation.jpeg"
              alt="Wedding invitation"
              width={1200}
              height={1800}
              className="w-full h-auto object-contain rounded-[10px] border border-stone-50"
            />
            <div className={`scroll-instruction ${step === 2 && isAtTop ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <p className="animate-bounce text-stone-500 text-[10px] font-bold uppercase tracking-widest">
                Scroll to view ↓
              </p>
            </div>
          </div>

          <div className="seal-container">
            <Image
              src="/stamp.png"
              alt="Wax seal"
              width={80}
              height={80}
              className="z-10"
            />
          </div>
        </div>

        <div
          ref={buttonRef}
          className={`relative z-30 w-full max-w-[280px] transition-all duration-1000 mt-12 md:mt-16 ${showButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
        >
          <p className="mb-3 text-center text-[13px] italic tracking-[0.01em] text-stone-500 md:text-sm">
            Kindly reply by {rsvpByLabel}.
          </p>
          <button onClick={handleProceed} className="wedding-button-primary w-full">
            RSVP
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="wedding-shell" />}>
      <InviteContent />
    </Suspense>
  );
}
