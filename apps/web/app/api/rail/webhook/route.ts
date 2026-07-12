import { NextResponse } from "next/server";
import { handleRailWebhook } from "@tote/services";
import { prisma } from "@/lib/db";
import { rail, WEBHOOK_SECRET } from "@/lib/rail";

/**
 * Payment-rail webhook endpoint. A real provider (Stripe/Dwolla) posts signed
 * settlement events here; the signature is verified before anything settles.
 * The tenant is derived from the stored intent, so no session is needed.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("x-tote-signature") ?? "";
  try {
    const result = await handleRailWebhook(prisma, {
      payload,
      signature,
      secret: WEBHOOK_SECRET,
      provider: rail,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "webhook error" },
      { status: 400 },
    );
  }
}
