import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { CaptureForm } from "./capture-form";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const { orgId } = await getTenant();
  const [vendors, horses, categories] = await Promise.all([
    prisma.party.findMany({ where: { orgId, type: "VENDOR" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Barn Capture</h1>
        <p className="mt-1 text-sm text-muted">
          Snap an expense from the barn. Works offline — entries queue and sync when you reconnect.
        </p>
      </div>
      <CaptureForm vendors={vendors} horses={horses} categories={categories} />
    </div>
  );
}
