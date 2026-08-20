import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LogIn, TriangleAlert } from "lucide-react";
import PhoneFrame from "@/components/PhoneFrame";
import { readStaffSession, staffLocations } from "@/lib/admin/session";
import { loginAction } from "./actions";

// Staff screen: Romanian only, never indexed.
const strings = {
  eyebrow: "Origins · staff",
  title: "Intră în tură",
  intro:
    "Alege cafeneaua în care ești acum și introdu codul primit de la manager.",
  location: "Cafeneaua",
  pin: "Cod de acces",
  submit: "Intră",
  errorPin: "Cod greșit. Mai încearcă o dată.",
  errorLocation: "Alege o cafenea din listă.",
  note: "Codul este valabil pentru tura curentă. Contul cu email și parolă vine odată cu Supabase.",
};

export const metadata: Metadata = {
  title: "Admin Origins",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await readStaffSession();
  if (session) redirect("/admin/scan");

  const query = await searchParams;
  const raw = query.eroare;
  const error = Array.isArray(raw) ? raw[0] : raw;

  const locations = await staffLocations();
  const fieldClass =
    "w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-sage-deep";
  const labelClass = "block text-[12.5px] font-semibold text-ink/72";

  return (
    <PhoneFrame>
      <header className="px-5 pt-[18px]">
        <Image
          src="/brand/logo-ink.png"
          alt="Origins Coffee & Drinks"
          width={334}
          height={178}
          priority
          className="h-[46px] w-auto"
        />
      </header>

      <div className="px-5 pt-[22px] pb-1.5">
        <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.eyebrow}
        </div>
        <h1 className="mt-1 mb-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {strings.title}
        </h1>
        <p className="text-[13.5px] text-ink/72">{strings.intro}</p>
      </div>

      {error && (
        <div className="mx-5 mt-2 flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13px] font-semibold text-ink">
          <TriangleAlert
            className="mt-px size-[18px] shrink-0 text-sage-deep"
            strokeWidth={2}
          />
          <span>
            {error === "locatie" ? strings.errorLocation : strings.errorPin}
          </span>
        </div>
      )}

      <form action={loginAction} className="flex flex-col gap-4 px-5 pt-4 pb-2">
        <div>
          <label className={labelClass} htmlFor="locationSlug">
            {strings.location}
          </label>
          <select
            id="locationSlug"
            name="locationSlug"
            defaultValue={locations[0]?.slug}
            className={`mt-1.5 appearance-none ${fieldClass}`}
          >
            {locations.map((location) => (
              <option key={location.slug} value={location.slug}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="pin">
            {strings.pin}
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            className={`mt-1.5 tracking-[0.3em] ${fieldClass}`}
          />
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper"
        >
          <LogIn className="size-[18px]" strokeWidth={2} />
          {strings.submit}
        </button>

        <p className="text-center text-[12px] leading-[1.5] text-muted">
          {strings.note}
        </p>
      </form>
    </PhoneFrame>
  );
}
