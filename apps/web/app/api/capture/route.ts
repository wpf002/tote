import { NextResponse } from "next/server";
import { toCents } from "@tote/core";
import { approveVendorBill } from "@tote/services";
import { getServiceContextForApi } from "@/lib/services";

/**
 * Barn-side capture endpoint. Accepts a quick expense (vendor/horse/category/
 * amount) and books it as an approved vendor bill. The mobile capture page
 * queues these locally when offline and POSTs them here on reconnect.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await getServiceContextForApi();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    vendorPartyId?: string;
    horseId?: string;
    categoryId?: string;
    amount?: string;
    description?: string;
    billDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.vendorPartyId || !body.amount) {
    return NextResponse.json({ error: "vendor and amount required" }, { status: 400 });
  }

  try {
    const result = await approveVendorBill(ctx, {
      vendorPartyId: body.vendorPartyId,
      amount: toCents(body.amount),
      billDate: body.billDate ? new Date(body.billDate) : new Date(),
      ...(body.horseId ? { horseId: body.horseId } : {}),
      ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      ...(body.description ? { description: body.description } : {}),
    });
    return NextResponse.json({ ok: true, billId: result.billId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "capture failed" },
      { status: 400 },
    );
  }
}
