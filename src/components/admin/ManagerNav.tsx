"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Coffee,
  ScanLine,
  SlidersHorizontal,
  Users,
} from "lucide-react";

/** Staff screen: Romanian only. */
const TABS = [
  { href: "/admin/scan", label: "Scanare", Icon: ScanLine },
  { href: "/admin/meniu", label: "Meniu", Icon: Coffee },
  { href: "/admin/push", label: "Push", Icon: BellRing },
  { href: "/admin/statistici", label: "Statistici", Icon: BarChart3 },
  { href: "/admin/echipa", label: "Echipă", Icon: Users },
  { href: "/admin/setari", label: "Program", Icon: SlidersHorizontal },
];

/** Tab row shown only to managers; baristas keep the scan-only screen. */
export default function ManagerNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1.5 overflow-x-auto border-b border-line px-5 py-2.5">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold ${
              active ? "bg-ink text-paper" : "bg-cream text-sage-deep"
            }`}
          >
            <Icon className="size-[14px]" strokeWidth={2.25} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
