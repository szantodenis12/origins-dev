"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Block, Inline } from "@/lib/markdown-lite";
import {
  ContestFooter,
  ContestFrame,
  ContestHeader,
  WRAP,
  type ContestDocLinks,
} from "./DrawingGallery";

/**
 * A contest legal text as a page: the contest rules or the contest privacy
 * note (content/concurs/*.md), in the same white-and-ink language as the
 * gallery. Built for reading on a phone: one column, generous line height,
 * a contents list that folds away, tables that become stacked rows.
 *
 * It renders what the file says and nothing else. No kicker, no campaign
 * name in the title, no snow over a long text.
 */

function Inlines({ content, links }: { content: Inline[]; links: ContestDocLinks }) {
  return (
    <>
      {content.map((node, index) => {
        if (node.kind === "text") return <span key={index}>{node.text}</span>;
        if (node.kind === "bold") {
          return (
            <strong key={index} className="font-semibold text-o-ink">
              <Inlines content={node.children} links={links} />
            </strong>
          );
        }
        // The two texts point at each other by these short paths.
        const href =
          node.href === "/confidentialitate"
            ? links.privacy
            : node.href === "/regulament"
              ? links.rules
              : node.href;
        return (
          <Link key={index} href={href} className="relative z-20 underline underline-offset-4">
            <Inlines content={node.children} links={links} />
          </Link>
        );
      })}
    </>
  );
}

function BlockView({ block, links }: { block: Block; links: ContestDocLinks }) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2
          id={block.id}
          className="mt-12 scroll-mt-6 border-t border-o-ink/12 pt-8 text-[22px] leading-[1.25] font-extrabold tracking-[-0.01em] first:mt-0 first:border-t-0 first:pt-0 lg:text-[26px]"
        >
          {block.text}
        </h2>
      ) : (
        <h3 id={block.id} className="mt-8 scroll-mt-6 text-[18px] leading-[1.3] font-bold">
          {block.text}
        </h3>
      );
    case "paragraph":
      return block.number ? (
        <p className="mt-4 grid grid-cols-[minmax(3.1rem,auto)_minmax(0,1fr)] gap-x-2">
          <span className="font-bold tabular-nums text-o-ink">{block.number}</span>
          <span>
            <Inlines content={block.content} links={links} />
          </span>
        </p>
      ) : (
        <p className="mt-4">
          <Inlines content={block.content} links={links} />
        </p>
      );
    case "letters":
      return (
        <ol className="mt-3 flex flex-col gap-2.5 pl-[3.6rem]">
          {block.items.map((item) => (
            <li key={item.letter} className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-x-1.5">
              <span className="font-semibold text-o-ink">{item.letter})</span>
              <span>
                <Inlines content={item.content} links={links} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 marker:text-o-ink/40">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inlines content={item} links={links} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <>
          {/* Phone: each row becomes a small block, column names repeated. */}
          <div className="mt-5 flex flex-col gap-3 md:hidden">
            {block.rows.map((row, index) => (
              <dl key={index} className="rounded-2xl border border-o-ink/12 px-4 py-3.5">
                {row.map((cell, col) => (
                  <div key={col} className={col > 0 ? "mt-2.5" : ""}>
                    <dt className="text-[13px] font-semibold text-o-ink/55">
                      <Inlines content={block.head[col] ?? []} links={links} />
                    </dt>
                    <dd className="mt-0.5">
                      <Inlines content={cell} links={links} />
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-[15px] leading-[1.5]">
              <thead>
                <tr>
                  {block.head.map((cell, col) => (
                    <th
                      key={col}
                      className={`border-b border-o-ink/25 py-2.5 pr-4 align-bottom text-[13.5px] font-semibold text-o-ink/60 ${
                        block.align[col] === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      <Inlines content={cell} links={links} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, col) => (
                      <td
                        key={col}
                        className={`border-b border-o-ink/10 py-3 pr-4 align-top ${
                          block.align[col] === "right" ? "text-right tabular-nums" : ""
                        }`}
                      >
                        <Inlines content={cell} links={links} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
  }
}

export default function ContestDocPage({
  title,
  updated,
  blocks,
  toc,
  links,
  other,
  active,
}: {
  title: string;
  updated: string | null;
  blocks: Block[];
  toc: { id: string; text: string }[];
  links: ContestDocLinks;
  /** The sister text, linked under the title. */
  other: { href: string; label: string };
  active: "regulament" | null;
}) {
  const contents = (
    <ol className="flex flex-col gap-1 text-[15px] leading-[1.4]">
      {toc.map((item) => (
        <li key={item.id}>
          <a href={`#${item.id}`} className="relative z-20 block py-1.5 text-o-ink/75 hover:text-o-ink">
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <ContestFrame links={links} snow={false}>
      <ContestHeader active={active} />

      <main id="continut" tabIndex={-1} className={`${WRAP} pt-5 pb-20 outline-none lg:pt-10 lg:pb-28`}>
        <Link
          href="/desene"
          className="inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-semibold text-o-ink/65 hover:text-o-ink"
        >
          <ArrowLeft className="size-[16px]" strokeWidth={1.75} />
          Toate desenele
        </Link>

        <div className="mt-3 lg:grid lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-8 lg:col-start-5 lg:row-start-1">
            <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance lg:text-[46px]">
              {title}
            </h1>
            <p className="mt-3 text-[14.5px] text-o-ink/60">
              {updated ? `Ultima actualizare: ${updated}. ` : ""}
              <Link href={other.href} className="underline underline-offset-4">
                {other.label}
              </Link>
            </p>
          </div>

          {toc.length > 0 && (
            <>
              {/* Phone: the contents fold away under the title. */}
              <details className="group mt-6 rounded-2xl border border-o-ink/15 px-4 lg:hidden">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  Cuprins
                  <span className="text-[13.5px] font-normal text-o-ink/55">{toc.length} secțiuni</span>
                </summary>
                <div className="border-t border-o-ink/10 py-3">{contents}</div>
              </details>
              <nav
                aria-label="Cuprins"
                className="hidden lg:col-span-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block"
              >
                <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
                  <p className="mb-2 text-[15px] font-bold">Cuprins</p>
                  {contents}
                </div>
              </nav>
            </>
          )}

          <article className="mt-8 max-w-[720px] text-[16.5px] leading-[1.65] text-o-ink/85 lg:col-span-8 lg:col-start-5 lg:mt-10 lg:text-[17px]">
            {blocks.map((block, index) => (
              <BlockView key={index} block={block} links={links} />
            ))}
          </article>
        </div>
      </main>

      <ContestFooter />
    </ContestFrame>
  );
}
