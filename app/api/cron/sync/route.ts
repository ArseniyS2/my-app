import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/src/db/sync-new-anime";
import { db, allAnime } from "@/src/db";
import { sql } from "drizzle-orm";

/**
 * Serverless cron handler. Vercel Cron will call this endpoint on the schedule
 * defined in vercel.json. Uses Vercel's standard Authorization: Bearer pattern.
 *
 * Because Vercel serverless filesystems are ephemeral, this route does NOT read
 * scripts/sync_state.json. Instead it derives a conservative lookback window
 * from the most recent release year present in the DB; the anilist_id unique
 * constraint ensures idempotency even if the window overlaps previous runs.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

/** Fallback lookback (in days) used only when the DB has no anime yet. */
const FALLBACK_LOOKBACK_DAYS = 30;
/** Safety overlap (in days) subtracted from the derived lastSyncDate to re-check
 *  anime whose dates may have been adjusted upstream. */
const OVERLAP_DAYS = 30;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function deriveLastSyncDate(): Promise<string> {
  // Pull the max release_year in the DB; subtract OVERLAP_DAYS of buffer.
  // This is a heuristic — the anilist_id unique constraint makes re-fetching safe.
  const rows = await db.execute(sql`SELECT MAX(release_year) AS y FROM ${allAnime}`);
  const y = (rows.rows?.[0] as { y: number | null } | undefined)?.y ?? null;
  if (!y || y < 1900) return daysAgoIso(FALLBACK_LOOKBACK_DAYS);
  // Use Jan 1 of the max release year, then pad backwards by OVERLAP_DAYS.
  const base = new Date(Date.UTC(y, 0, 1));
  base.setUTCDate(base.getUTCDate() - OVERLAP_DAYS);
  return base.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    console.log(m);
  };

  try {
    const lastSyncDate = await deriveLastSyncDate();
    log(`Cron sync: lastSyncDate=${lastSyncDate}`);

    const result = await runSync({ lastSyncDate, log });

    return NextResponse.json({
      ok: true,
      lastSyncDate,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Cron sync failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        logs: logs.slice(-50),
      },
      { status: 500 },
    );
  }
}
