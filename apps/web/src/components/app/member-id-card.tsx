"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMemberCardArt } from "./member-card-art";
import { memberCode, type MemberCardProfile } from "./member-card-profile";

const Lanyard = dynamic(() => import("@/components/reactbits/lanyard/Lanyard"), { ssr: false });

export function MemberIdCard({ profile }: { profile: MemberCardProfile }) {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [art, setArt] = useState<Awaited<ReturnType<typeof createMemberCardArt>>>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [back, setBack] = useState(false);
  const [flipSignal, setFlipSignal] = useState(0);
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => { setFailed(true); setReady(false); }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    createMemberCardArt(profile).then(value => { if (active) setArt(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [profile, visible]);
  const flip = () => { if (ready) setFlipSignal(value => value + 1); else setBack(value => !value); };
  return (
    <section ref={root} className="mt-8 border border-line bg-panel" aria-label={`${profile.is_admin ? "Admin" : "Student"} BorrowBuddy ID card`} data-testid="member-id-card" data-role={profile.is_admin ? "admin" : "student"} data-side={back ? "back" : "front"} data-renderer={ready ? "webgl" : "static"}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-secondary text-[11px] text-ink/60">[ CREW ID ]</h2>
        <span className="font-secondary text-[9px] text-accent">{profile.is_admin ? "ADMIN" : "STUDENT"} · {memberCode(profile.id)}</span>
      </div>
      <div className="relative h-[480px] overflow-hidden sm:h-[560px]" data-testid="member-card-stage">
        {!ready && <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8" aria-hidden="true">
          {art ? <Image src={back ? art.back : art.front} alt="" width={1024} height={1440} unoptimized className="max-h-[76%] w-auto max-w-[72%] rounded-xl shadow-2xl" /> : <div className="flex aspect-[1024/1440] h-[76%] max-w-[72%] flex-col justify-between border-l-4 border-accent bg-black p-6 text-ink">
            <p className="font-title text-3xl">BORROWBUDDY</p><p className="font-title text-3xl uppercase">{profile.full_name || "BorrowBuddy member"}</p><p className="font-secondary text-[10px] text-accent">{profile.is_admin ? "ADMIN" : "STUDENT"} · {memberCode(profile.id)}</p>
          </div>}
        </div>}
        {art && !failed && <Lanyard frontImage={art.front} backImage={art.back} strapImage={art.strap} size={0.69} strapLength={0.16} strapWidth={0.65} cardColor="#080b10" finish="matte" metal="silver" damping={0.65} breeze={0.18} onReady={onReady} onError={onError} onFlip={setBack} flipSignal={flipSignal} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="font-secondary text-[9px] text-ink/50">{ready ? "DRAG TO SWING · TAP TO FLIP" : "YOUR BORROWBUDDY MEMBERSHIP"}</p>
        <button type="button" onClick={flip} className="min-h-12 px-3 font-secondary text-[10px] text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" aria-label={back ? "Show front of ID card" : "Show back of ID card"}>FLIP CARD ↻</button>
      </div>
      <p className="sr-only">{profile.full_name || "BorrowBuddy member"}. {profile.is_admin ? "Admin" : "Student"}. {profile.department || "Bennett University"}{profile.year_of_study ? `, year ${profile.year_of_study}` : ""}. Membership {memberCode(profile.id)}. Verification {profile.verification_status}. Trust score {Math.round(profile.trust_score)}.</p>
    </section>
  );
}
