import Image from "next/image";
import Link from "next/link";
import { BarChart3, CalendarClock, Images, LineChart, Plus, Trophy } from "lucide-react";
import type { CampaignRole } from "@/lib/admin/campaign-session-token";
import { nextCampaignStep, PHASE_LABEL } from "@/lib/campaign-guards";
import { campaignMoment } from "@/lib/campaign-server";
import LogoutButton from "./LogoutButton";
import { CHIP, WRAP } from "./ui";

/** "16.11.2026, 00:00" in Bucharest time. */
function bucharest(iso: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Where the campaign stands and what comes next, on every screen. */
async function PhaseBar() {
  const { now, phase } = await campaignMoment();
  const next = nextCampaignStep(phase, now);
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-o-wall px-4 py-3 text-[14px] leading-[1.45]" data-phase={phase}>
      <CalendarClock className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
      <p>
        <span className="font-bold">{PHASE_LABEL[phase]}.</span> {next.label}
        {next.at ? ` (${bucharest(next.at)}).` : "."}
      </p>
    </div>
  );
}

/**
 * Frame of the campaign panel: logo, who is logged in, the phase of the
 * campaign, the places to go. Drawings only. No menu, card, statistics or
 * team here, and no link to the Origins admin.
 */
export default function Shell({
  role,
  active,
  children,
}: {
  role: CampaignRole;
  active: "desene" | "nou" | "voturi" | "selectie" | "masurare" | null;
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "desene", href: "/admin", label: "Desene", Icon: Images },
    { key: "nou", href: "/admin/nou", label: "Înscrie", Icon: Plus },
    ...(role === "manager"
      ? [
          { key: "voturi", href: "/admin/voturi", label: "Voturi", Icon: BarChart3 },
          { key: "selectie", href: "/admin/selectie", label: "Selecție", Icon: Trophy },
          { key: "masurare", href: "/admin/masurare", label: "Măsurare", Icon: LineChart },
        ]
      : []),
  ];
  return (
    <div className="flex flex-1 flex-col bg-white text-o-ink">
      <header className="sticky top-0 z-30 border-b border-o-ink/10 bg-white">
        <div className={`${WRAP} flex items-center justify-between gap-3 py-2.5`}>
          <Image
            src="/brand/logo-ink.png"
            alt="Origins"
            width={334}
            height={178}
            priority
            className="h-[34px] w-auto"
          />
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-o-ink/60">
              {role === "manager" ? "Manager" : "Echipă"}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className={`${WRAP} flex gap-2 overflow-x-auto pb-2.5`}>
          {tabs.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`${CHIP} gap-2 ${
                active === key ? "bg-o-ink text-white" : "border border-o-ink/15 text-o-ink"
              }`}
            >
              <Icon className="size-[17px]" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className={`${WRAP} flex-1 pt-5 pb-16`}>
        <div className="mb-5">
          <PhaseBar />
        </div>
        {children}
      </main>
    </div>
  );
}
