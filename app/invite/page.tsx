"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    setTimeout(() => setStep(2), 600);
    setTimeout(() => setShowButton(true), 2000);
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
          <h1 className="wedding-title text-3xl md:text-5xl mb-4">Invite Not Found</h1>
          <p className="text-stone-600 italic mb-8 font-serif text-base md:text-lg">
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

      <div className="wedding-panel relative z-10 mt-4 mb-8 flex w-full max-w-md md:max-w-3xl flex-col items-center px-5 py-8 pt-28 pb-14 md:px-10 md:py-12 md:pt-36 md:pb-20 animate-in zoom-in duration-1000">
        <div className="absolute top-10 md:top-14 w-full px-4 text-center">
          <p className="wedding-kicker mb-3">You’re invited,</p>
          <h1 className="wedding-title text-4xl md:text-6xl italic leading-tight">{guestName}</h1>
        </div>

        <style>{`
          :root {
            --env-w: 300px;
            --env-h: 205px;
          }

          @media (min-width: 768px) {
            :root {
              --env-w: 460px;
              --env-h: 320px;
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
            transition: all 0.8s ease;
            z-index: 10;
          }

          .cssletter.step-2 {
            margin-top: 13rem;
            margin-bottom: 4rem;
          }

          @media (min-width: 768px) {
            .cssletter {
              margin-top: 10rem;
            }

            .cssletter.step-2 {
              margin-top: 16rem;
              margin-bottom: 5rem;
            }
          }

          .tap-top-instruction {
            position: absolute;
            top: -56px;
            width: 100%;
            text-align: center;
            font-family: serif;
            font-style: italic;
            font-size: 0.95rem;
            font-weight: 600;
            letter-spacing: 0.15em;
            color: #78716c;
            text-shadow: 0 1px 2px rgba(255,255,255,0.8);
            transition: opacity 0.3s ease;
            z-index: 4;
          }

          .envelope {
            position: relative;
            width: var(--env-w);
            height: var(--env-h);
            background: #c3af7d;
            box-shadow: inset 0 0 40px rgba(0,0,0,0.15), 0 15px 30px rgba(0,0,0,0.1);
            border-radius: 10px;
          }

          .invite-card {
            position: absolute;
            width: 94%;
            height: 96%;
            left: 50%;
            bottom: 2%;
            background: white;
            z-index: 2;
            transition: all 1.2s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.15);
            padding: 4px;
            cursor: pointer;
            overflow-y: auto;
            scrollbar-width: none;
            transform: translateX(-50%);
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
            transition: transform 0.6s linear, z-index 0s 0s;
          }

          .envelope-flap::before,
          .envelope-left::before,
          .envelope-right::before,
          .envelope-bottom::before {
            content: "";
            transform: rotate(45deg);
            width: 100%;
            aspect-ratio: 1;
            display: block;
            position: absolute;
          }

          .envelope-flap::before {
            background: linear-gradient(135deg, #fdf5d3 0%, #f5e8b7 50%, #fdf5d3 100%);
            bottom: 26%;
            border-radius: 1.5rem;
          }

          .envelope-left::before {
            background: linear-gradient(135deg, #f3e3ac 0%, #eddba1 100%);
            top: 5%;
            left: -60%;
          }

          .envelope-right::before {
            background: linear-gradient(135deg, #ead99f 0%, #e3d194 100%);
            top: 5%;
            right: -60%;
          }

          .envelope-bottom::before {
            background: linear-gradient(135deg, #f6e8b6 0%, #f1dea6 100%);
            top: 45%;
            left: 0;
            border-radius: 2rem;
            box-shadow: 0 -5px 20px rgba(0,0,0,0.05);
          }

          .cssletter.step-1 .envelope-flap,
          .cssletter.step-2 .envelope-flap {
            transform: rotateX(180deg) translateY(0);
            z-index: 1;
            transition: transform 0.6s linear, z-index 0s 0.3s;
          }

          .cssletter.step-1 .invite-card {
            transform: translate(-50%, -50%);
            z-index: 2;
          }

          .cssletter.step-2 .invite-card {
            transform: translate(-50%, 12%) scale(1);
            z-index: 20;
            width: 126%;
            max-width: 92vw;
            height: 220%;
            max-height: min(88vh, 980px);
            padding: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.2);
            border-radius: 14px;
          }

          .scroll-instruction {
            position: absolute;
            bottom: 3%;
            left: 50%;
            width: 100%;
            text-align: center;
            pointer-events: none;
            z-index: 30;
            transition: opacity 0.5s ease;
            background: linear-gradient(to top, rgba(255,255,255,0.95) 10%, rgba(255,255,255,0) 100%);
            padding: 40px 10px 15px;
            border-bottom-left-radius: 14px;
            border-bottom-right-radius: 14px;
            transform: translateX(-50%);
          }

          .seal-container {
            position: absolute;
            top: 75%;
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
          .cssletter.step-2 .seal-container,
          .cssletter.step-1 .monogram-logo,
          .cssletter.step-2 .monogram-logo {
            opacity: 0;
          }

          .monogram-logo {
            position: absolute;
            top: 35%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 6;
            transition: 0.3s opacity;
            pointer-events: none;
          }
        `}</style>

        <div
          className={`cssletter ${step === 1 ? "step-1" : step === 2 ? "step-2" : ""} ${step === 0 ? "cursor-pointer" : ""}`}
          onClick={step === 0 ? handleInteraction : undefined}
        >
          {step === 0 && <div className="tap-top-instruction animate-pulse">Tap envelope to open</div>}

          <div className="envelope">
            <div className="envelope-flap" />
            <div className="envelope-folds">
              <div className="envelope-left" />
              <div className="envelope-right" />
              <div className="envelope-bottom" />
            </div>
          </div>

          <div className="invite-card" onScroll={handleScroll} ref={cardRef}>
            <img
              src="/invitation.jpeg"
              alt="Wedding invitation"
              className="w-full h-auto object-contain rounded-[10px] border border-stone-50"
            />
            <div className={`scroll-instruction ${step === 2 && isAtTop ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <p className="text-stone-500 font-sans text-[10px] font-bold uppercase tracking-widest animate-bounce">
                Scroll to view
              </p>
            </div>
          </div>

          <div className="monogram-logo">
            <img
              src="/logo.png"
              alt="Omar & Hager logo"
              style={{ width: "75px", height: "auto", filter: "brightness(0) contrast(100%)", transform: "rotate(-2deg)" }}
              className="opacity-90"
            />
          </div>

          <div className="seal-container">
            <img
              src="/seal.png"
              alt="Wax seal"
              style={{
                width: "75px",
                height: "75px",
                objectFit: "contain",
                filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.15)) saturate(1.15)",
              }}
              className="z-10"
            />
          </div>
        </div>

        <div
          ref={buttonRef}
          className={`relative z-30 w-full max-w-[280px] transition-all duration-1000 mt-12 md:mt-16 ${showButton ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
        >
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
