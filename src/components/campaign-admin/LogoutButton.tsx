"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { campaignLogoutAction } from "@/app/campanie-admin/actions";

/** Ends the panel session, then reloads /admin through the proxy (see actions.ts). */
export default function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Ieși"
      title="Ieși"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await campaignLogoutAction();
          window.location.assign("/admin");
        })
      }
      className="flex size-11 items-center justify-center rounded-full border border-o-ink/15 text-o-ink disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
      ) : (
        <LogOut className="size-[18px]" strokeWidth={1.75} />
      )}
    </button>
  );
}
