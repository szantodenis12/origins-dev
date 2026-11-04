import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client singleton.
 * Uses SUPABASE_SERVICE_ROLE_KEY to perform administrative actions and DB operations.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseClient =
  supabaseUrl && supabaseServiceRoleKey && !supabaseUrl.includes("YOUR_PROJECT_ID")
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

/**
 * PostgREST answers an unbounded select with at most 1000 rows and says
 * nothing about it — no error, no flag, just a short array. A table that
 * grows past a thousand therefore starts lying instead of failing, which is
 * how the stamp totals froze at exactly 1000 while stamps kept being
 * recorded normally.
 *
 * This pages with `range()` until a short page proves the end.
 *
 * Page over an ascending order on an append-only column. Rows added while we
 * page then land after the window we are reading, so they are missed at
 * worst; paging a descending order would shift every later page and return
 * the same row twice.
 */
const PAGE_SIZE = 1000;
/** 100k rows. Far beyond this table's shape — a guard against a loop, not a limit. */
const MAX_PAGES = 100;

export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];

  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) return { rows, error: null };

    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, error: null };
  }

  const message = `fetchAllRows stopped at ${MAX_PAGES * PAGE_SIZE} rows; the result is truncated`;
  console.error(`[db] ${message}`);
  return { rows, error: message };
}
