"use server";

import { revalidatePath } from "next/cache";
import { toCents } from "@tote/core";
import {
  runPayroll,
  recordShipment,
  recordInsurancePolicy,
} from "@tote/services";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { getServiceContext } from "@/lib/services";

export async function runPayrollAction(formData: FormData): Promise<void> {
  const { orgId } = await getTenant();
  const employees = await prisma.employee.findMany({ where: { orgId } });
  const lines = employees
    .map((e) => {
      const raw = String(formData.get(`gross_${e.id}`) ?? "").trim();
      return raw ? { employeeId: e.id, grossCents: toCents(raw) } : null;
    })
    .filter((x): x is { employeeId: string; grossCents: ReturnType<typeof toCents> } => x !== null);
  if (lines.length === 0) throw new Error("Enter at least one gross amount");

  const ctx = await getServiceContext();
  const now = new Date();
  await runPayroll(ctx, {
    periodStart: new Date(now.getUTCFullYear(), now.getUTCMonth(), 1),
    periodEnd: now,
    lines,
  });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
}

export async function recordShipmentAction(formData: FormData): Promise<void> {
  const fromLoc = String(formData.get("fromLoc") ?? "").trim();
  const toLoc = String(formData.get("toLoc") ?? "").trim();
  const total = String(formData.get("total") ?? "").trim();
  const horseIds = formData.getAll("horseIds").map(String).filter(Boolean);
  if (!total || horseIds.length === 0) throw new Error("Total and at least one horse are required");

  const ctx = await getServiceContext();
  await recordShipment(ctx, {
    shipDate: new Date(String(formData.get("shipDate") || new Date().toISOString().slice(0, 10))),
    fromLoc: fromLoc || "—",
    toLoc: toLoc || "—",
    totalCents: toCents(total),
    horseIds,
  });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
}

export async function recordInsuranceAction(formData: FormData): Promise<void> {
  const carrier = String(formData.get("carrier") ?? "").trim();
  const premium = String(formData.get("premium") ?? "").trim();
  const horseId = String(formData.get("horseId") ?? "") || undefined;
  if (!carrier || !premium) throw new Error("Carrier and premium are required");

  const ctx = await getServiceContext();
  await recordInsurancePolicy(ctx, {
    carrier,
    premiumCents: toCents(premium),
    startDate: new Date(String(formData.get("startDate") || new Date().toISOString().slice(0, 10))),
    endDate: new Date(String(formData.get("endDate") || new Date().toISOString().slice(0, 10))),
    ...(horseId ? { horseId } : {}),
  });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
}
