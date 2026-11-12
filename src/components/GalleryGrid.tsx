"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";
import {
  DRAWING_CATEGORIES,
  normalizeDrawingCode,
  type DrawingCategory,
  type PublicDrawing,
} from "@/lib/drawing";
import { ageLabel, DrawingCard, fill, FOCUS, PILL_OUTLINE } from "./DrawingGallery";

/**
 * The gallery grid at campaign volume (hundreds of drawings):
 *   - the server's per-visitor stable shuffle, never by votes;
 *   - age-group filter and search by drawing code (anonymous drawings are
 *     found by code alone, no child's name needed);
 *   - 24 cards at first, "Arată mai multe" adds 24 more;
 *   - filter, search and visible count live in the URL (?grupa, ?cod, ?n),
 *     written with history.replaceState (Next syncs it, no reload), and
 *     the scroll position is kept when a card is opened, so "back" lands
 *     on the same card.
 */

export const PAGE_SIZE = 24;
/** sessionStorage: where the visitor was when a card was opened. */
export const RETURN_KEY = "origins-galerie-return";

interface State {
  category: DrawingCategory | null;
  query: string;
  count: number;
}

function stateFromSearch(search: string, fallback: State): State {
  const params = new URLSearchParams(search);
  const grupa = params.get("grupa");
  const n = Number(params.get("n"));
  return {
    category: DRAWING_CATEGORIES.includes(grupa as DrawingCategory)
      ? (grupa as DrawingCategory)
      : null,
    query: (params.get("cod") ?? "").slice(0, 12),
    count: Number.isInteger(n) && n >= PAGE_SIZE ? Math.min(n, 2000) : fallback.count,
  };
}

function writeUrl(state: State) {
  const params = new URLSearchParams(window.location.search);
  const set = (key: string, value: string | null) =>
    value ? params.set(key, value) : params.delete(key);
  set("grupa", state.category);
  set("cod", state.query.trim() || null);
  set("n", state.count > PAGE_SIZE ? String(state.count) : null);
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

/** Exact code ("r12", "R-012") or a part of one ("R-01", "12"). */
function matches(drawing: PublicDrawing, query: string): boolean {
  const exact = normalizeDrawingCode(query);
  if (exact) return drawing.code === exact;
  const compact = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length > 0 && drawing.code.replace("-", "").includes(compact);
}

export default function GalleryGrid({
  drawings,
  voting,
  initial,
}: {
  drawings: PublicDrawing[];
  voting: boolean;
  initial: State;
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);
  const words = { drawing: t("galDrawing"), yearsOld: t("galYearsOld") };
  const years = t("galYears");

  // The URL is the truth: on a soft "back" the component mounts without
  // the server's props for this exact URL, so it reads the address itself.
  const [state, setState] = useState<State>(() =>
    typeof window === "undefined" ? initial : stateFromSearch(window.location.search, initial),
  );
  const update = (next: Partial<State>) => {
    const merged = { ...state, ...next };
    setState(merged);
    writeUrl(merged);
  };

  const query = state.query.trim();
  const filtered = useMemo(
    () =>
      query
        ? drawings.filter((drawing) => matches(drawing, query))
        : drawings.filter((drawing) => !state.category || drawing.category === state.category),
    [drawings, query, state.category],
  );
  const visible = filtered.slice(0, state.count);

  // Back from a drawing: put the visitor where they were.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(RETURN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { path: string; y: number };
      if (saved.path !== `${window.location.pathname}${window.location.search}`) return;
      window.sessionStorage.removeItem(RETURN_KEY);
      const restore = () => window.scrollTo({ top: saved.y, behavior: "instant" });
      requestAnimationFrame(() => requestAnimationFrame(restore));
      window.setTimeout(restore, 120);
    } catch {
      // No storage (private mode): the list still opens at the top.
    }
  }, []);

  const remember = () => {
    try {
      window.sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({ path: `${window.location.pathname}${window.location.search}`, y: window.scrollY }),
      );
    } catch {
      // Ignored: restoring the position is a convenience.
    }
  };

  const tab = (active: boolean) =>
    `relative z-20 inline-flex min-h-[44px] shrink-0 items-center rounded-full px-5 text-[12px] font-semibold tracking-[0.04em] uppercase transition-colors ${FOCUS} ${
      active ? "bg-o-ink text-white" : "border border-o-ink/25 text-o-ink hover:border-o-ink"
    }`;

  const searchId = "galerie-cod";

  return (
    <div>
      <div className="mt-6 flex flex-col gap-3 lg:mt-9 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label={t("galGroups")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <button
            type="button"
            aria-pressed={!query && state.category === null}
            onClick={() => update({ category: null, query: "", count: PAGE_SIZE })}
            className={tab(!query && state.category === null)}
          >
            {t("galAll")}
          </button>
          {DRAWING_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={!query && state.category === item}
              onClick={() => update({ category: item, query: "", count: PAGE_SIZE })}
              className={tab(!query && state.category === item)}
            >
              {ageLabel(item)} {years}
            </button>
          ))}
        </div>

        <form
          role="search"
          onSubmit={(event) => event.preventDefault()}
          className="relative z-20 w-full lg:w-[300px]"
        >
          <label htmlFor={searchId} className="sr-only">
            {t("galSearchLabel")}
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-[17px] -translate-y-1/2 text-o-ink/55"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            placeholder={t("galSearchPlaceholder")}
            aria-label={t("galSearchLabel")}
            value={state.query}
            onChange={(event) => update({ query: event.target.value, count: PAGE_SIZE })}
            className={`min-h-[48px] w-full rounded-full border border-o-ink/25 bg-white pr-12 pl-11 text-[16px] text-o-ink placeholder:text-o-ink/60 focus:border-o-ink ${FOCUS}`}
          />
          {state.query && (
            <button
              type="button"
              onClick={() => update({ query: "", count: PAGE_SIZE })}
              aria-label={t("galSearchClear")}
              className={`absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-o-ink/70 hover:text-o-ink ${FOCUS}`}
            >
              <X className="size-[17px]" strokeWidth={2} aria-hidden />
            </button>
          )}
        </form>
      </div>

      <p aria-live="polite" className="mt-4 min-h-[22px] text-[14px] text-o-ink/70">
        {query
          ? filtered.length > 0
            ? fill(t("galSearchFound"), { code: query.toUpperCase() })
            : ""
          : filtered.length > 0
            ? fill(t("galShown"), { shown: visible.length, total: filtered.length })
            : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="relative z-20 mx-auto mt-4 max-w-[560px] rounded-3xl bg-o-wall px-6 py-10 text-center text-[15px] leading-[1.6] text-o-ink/80">
          {query
            ? fill(t("galSearchNone"), { code: query.toUpperCase() })
            : state.category
              ? t("galEmptyCategory")
              : t("galEmpty")}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-10 lg:mt-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((drawing, index) => (
            <li key={drawing.code}>
              <DrawingCard
                drawing={drawing}
                words={words}
                years={years}
                voting={voting}
                priority={index < 2}
                onOpen={remember}
              />
            </li>
          ))}
        </ul>
      )}

      {visible.length < filtered.length && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => update({ count: state.count + PAGE_SIZE })}
            className={`${PILL_OUTLINE} ${FOCUS} border-o-ink/40 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`}
          >
            {t("galShowMore")}
          </button>
        </div>
      )}
    </div>
  );
}
