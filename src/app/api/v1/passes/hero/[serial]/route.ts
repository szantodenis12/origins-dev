import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { memberCard } from "@/lib/card";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serial: string }> },
) {
  const { serial } = await params;
  const db = getDb();

  const member = await db.findMemberByPassSerial(serial);
  if (!member) {
    return new NextResponse("Member not found", { status: 404 });
  }

  const [config, stamps, redemptions] = await Promise.all([
    db.getLoyaltyConfig(),
    db.getMemberStamps(member.id),
    db.getMemberRedemptions(member.id),
  ]);

  const card = memberCard(stamps, redemptions, config, new Date(), {
    day: member.birthDay,
    month: member.birthMonth,
    year: member.birthYear,
  });

  const isGold = card.gold.isGold;
  const isStudent = member.isStudent;

  const bgColor = isGold ? "#be9c54" : isStudent ? "#1a1b19" : "#d4d4b8";
  const textColor = isStudent ? "#e5e5d8" : isGold ? "#1c1917" : "#1b241c";
  const subtextColor = isStudent ? "#a3a392" : isGold ? "#44403c" : "#4a554b";
  const tierName = isGold ? "GOLD CIRCLE" : isStudent ? "STUDENT CIRCLE" : "CIRCLE";

  const stampsCount = Math.min(card.progress, card.spec.cycleLength);
  const totalStamps = card.spec.cycleLength;

  // Render 5 stamp indicators as SVG circles/trees
  const stampIcons = Array.from({ length: totalStamps }, (_, i) => {
    const filled = i < stampsCount;
    const opacity = filled ? "1" : "0.3";
    const cx = 70 + i * 48;
    return `
      <g transform="translate(${cx}, 250)" opacity="${opacity}">
        <circle cx="0" cy="0" r="14" fill="none" stroke="${textColor}" stroke-width="2" />
        <path d="M-4 4 L0 -6 L4 4 Z M0 -6 L0 8" fill="none" stroke="${textColor}" stroke-width="2" stroke-linejoin="round" />
      </g>
    `;
  }).join("");

  const svg = `
<svg width="1032" height="336" viewBox="0 0 1032 336" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgColor}" />
      <stop offset="100%" stop-color="${bgColor}" stop-opacity="0.92" />
    </linearGradient>
  </defs>

  <!-- Card Background -->
  <rect width="1032" height="336" rx="24" fill="url(#cardBg)" />

  <!-- Embossed Leaf Decorative Pattern Right -->
  <g opacity="0.12" transform="translate(720, -40) scale(1.4)">
    <path d="M100,200 Q150,100 250,120 Q200,220 100,200 Z" fill="${textColor}" />
    <path d="M140,240 Q220,160 300,200 Q240,280 140,240 Z" fill="${textColor}" />
    <path d="M80,140 Q180,60 260,100 Q180,180 80,140 Z" fill="${textColor}" />
  </g>

  <!-- Tier Subtitle -->
  <text x="70" y="80" font-family="Georgia, serif" font-size="22" font-weight="600" fill="${subtextColor}" letter-spacing="4">
    ${tierName} • ȘTAMPILE ${stampsCount}/${totalStamps}
  </text>

  <!-- Member Real Name -->
  <text x="70" y="165" font-family="Georgia, serif" font-size="48" font-weight="700" fill="${textColor}">
    ${member.name}
  </text>

  <!-- Stamp Progress Icons -->
  ${stampIcons}
</svg>
  `.trim();

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
