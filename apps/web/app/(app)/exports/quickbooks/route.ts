import { exportGeneralJournalCsv, monthPeriod } from "@tote/services";
import { getServiceContext } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Response("Bad month", { status: 400 });

  const ctx = await getServiceContext();
  const csv = await exportGeneralJournalCsv(ctx, monthPeriod(Number(match[1]), Number(match[2])));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tote-general-journal-${month}.csv"`,
    },
  });
}
