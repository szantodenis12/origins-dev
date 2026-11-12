"use client";

import Image from "next/image";
import { useActionState, useEffect } from "react";
import { Loader2, LogIn, TriangleAlert } from "lucide-react";
import { campaignLoginAction } from "@/app/campanie-admin/actions";
import { BTN_PRIMARY, NOTE } from "./ui";

/** The PIN screen. `available` false = production without PINs: locked. */
export default function Login({ available }: { available: boolean }) {
  const [state, action, pending] = useActionState(campaignLoginAction, null);
  const entered = state?.ok === true;

  // A full navigation, so the request passes the proxy again (see actions.ts).
  useEffect(() => {
    if (entered) window.location.assign("/admin");
  }, [entered]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-5 py-12 text-o-ink">
      <div className="w-full max-w-[380px]">
        <Image
          src="/brand/logo-ink.png"
          alt="Origins"
          width={334}
          height={178}
          priority
          className="h-[56px] w-auto"
        />
        <h1 className="mt-8 text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">
          Panoul desenelor
        </h1>
        <p className="mt-2 text-[15.5px] leading-[1.5] text-o-ink/70">
          Introdu codul primit pentru tura de azi.
        </p>

        {available ? (
          <form action={action} className="mt-7 flex flex-col gap-3">
            <label className="text-[14px] font-semibold" htmlFor="pin">
              Cod de acces
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              minLength={4}
              className="min-h-[60px] w-full rounded-2xl border border-o-ink/25 bg-white px-4 text-center text-[28px] font-semibold tracking-[0.3em] outline-none focus:border-o-ink"
            />
            <button type="submit" disabled={pending || entered} className={BTN_PRIMARY}>
              {pending || entered ? (
                <Loader2 className="size-[19px] animate-spin" strokeWidth={2} />
              ) : (
                <LogIn className="size-[19px]" strokeWidth={1.75} />
              )}
              Intră
            </button>
            {state && !state.ok && (
              <p role="alert" className={`${NOTE} flex items-start gap-2.5 font-semibold`}>
                <TriangleAlert className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
                {state.error}
              </p>
            )}
          </form>
        ) : (
          <p className={`${NOTE} mt-7`}>
            Panoul nu e configurat încă: lipsesc codurile de acces. Cere-le de la Epic Digital Hub.
          </p>
        )}
      </div>
    </div>
  );
}
