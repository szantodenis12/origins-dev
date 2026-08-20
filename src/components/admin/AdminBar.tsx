import Image from "next/image";
import { LogOut, MapPin } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import type { StaffRole } from "@/lib/db";
import ManagerNav from "./ManagerNav";

/** Staff screen: Romanian only. */
const strings = {
  logout: "Ieși din tură",
};

export default function AdminBar({
  locationName,
  role = "barista",
}: {
  locationName: string;
  role?: StaffRole;
}) {
  return (
    <>
    <header className="flex items-center gap-3 border-b border-line px-5 pt-[18px] pb-3.5">
      <Image
        src="/brand/logo-ink.png"
        alt="Origins Coffee & Drinks"
        width={334}
        height={178}
        priority
        className="h-[34px] w-auto"
      />

      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-[11.5px] font-semibold text-sage-deep">
        <MapPin className="size-[13px]" strokeWidth={2.25} />
        {locationName}
      </span>

      <form action={logoutAction}>
        <button
          type="submit"
          aria-label={strings.logout}
          title={strings.logout}
          className="flex size-9 items-center justify-center rounded-full border border-line text-muted"
        >
          <LogOut className="size-[16px]" strokeWidth={2} />
        </button>
      </form>
    </header>
    {role === "manager" && <ManagerNav />}
    </>
  );
}
