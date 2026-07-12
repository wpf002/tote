import bcrypt from "bcryptjs";
import {
  Ledger,
  cents,
  disburse,
  splitByOwnership,
  trainingCharge,
  vendorBillApproved,
  ownerPaymentIn,
  type Cents,
  type MembershipInterval,
  type OwnershipGraph,
  type OwnershipInterval,
} from "@tote/core";
import { prisma } from "./client.js";
import { PrismaLedgerStore } from "./ledger-store.js";

const ORG = "org_meadowbrook";
const LE_TRAINING = "le_training";
const LE_SYNDICATE = "le_syndicate";
const FROM = new Date("2025-01-01T00:00:00Z");

async function wipe() {
  await prisma.reminder.deleteMany({ where: { orgId: ORG } });
  await prisma.stakesSchedule.deleteMany({ where: { orgId: ORG } });
  await prisma.insurancePolicy.deleteMany({ where: { orgId: ORG } });
  await prisma.shipment.deleteMany({ where: { orgId: ORG } });
  await prisma.payrollRun.deleteMany({ where: { orgId: ORG } });
  await prisma.employee.deleteMany({ where: { orgId: ORG } });
  await prisma.payment.deleteMany({ where: { orgId: ORG } });
  await prisma.invoice.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorBill.deleteMany({ where: { orgId: ORG } });
  await prisma.purse.deleteMany({ where: { orgId: ORG } });
  await prisma.journalEntry.deleteMany({ where: { orgId: ORG } });
  await prisma.ownership.deleteMany({ where: { orgId: ORG } });
  await prisma.syndicateMembership.deleteMany({ where: { orgId: ORG } });
  await prisma.trainingRate.deleteMany({ where: { orgId: ORG } });
  await prisma.category.deleteMany({ where: { orgId: ORG } });
  await prisma.horse.deleteMany({ where: { orgId: ORG } });
  await prisma.party.deleteMany({ where: { orgId: ORG } });
  await prisma.user.deleteMany({ where: { orgId: ORG } });
  await prisma.legalEntity.deleteMany({ where: { orgId: ORG } });
  await prisma.org.deleteMany({ where: { id: ORG } });
}

async function main() {
  await wipe();

  await prisma.org.create({ data: { id: ORG, name: "Meadowbrook Racing" } });
  await prisma.legalEntity.createMany({
    data: [
      { id: LE_TRAINING, orgId: ORG, name: "Meadowbrook Training LLC", type: "TRAINER" },
      { id: LE_SYNDICATE, orgId: ORG, name: "Silks Racing Partners", type: "SYNDICATE" },
    ],
  });

  const pw = await bcrypt.hash("tote1234", 10);
  await prisma.user.create({
    data: { orgId: ORG, email: "staff@meadowbrook.test", passwordHash: pw, role: "STAFF_ADMIN" },
  });

  // Categories (some passthrough categories carry markup).
  await prisma.category.createMany({
    data: [
      { id: "cat_vet", orgId: ORG, name: "Veterinary", taxCode: "VET" },
      { id: "cat_farrier", orgId: ORG, name: "Farrier", taxCode: "FAR" },
      { id: "cat_training", orgId: ORG, name: "Training", taxCode: "TRN" },
      { id: "cat_transport", orgId: ORG, name: "Transport", taxCode: "TRP", markupBp: 1000 },
      { id: "cat_feed", orgId: ORG, name: "Feed & Bedding", taxCode: "FED", markupBp: 500 },
    ],
  });

  // Parties: owners, a syndicate + members, vendors, a jockey.
  const parties: Array<{ id: string; type: string; name: string; email?: string }> = [
    { id: "p_bob", type: "INDIVIDUAL", name: "Bob Carter", email: "bob@example.test" },
    { id: "p_carol", type: "INDIVIDUAL", name: "Carol Diaz", email: "carol@example.test" },
    { id: "p_dan", type: "INDIVIDUAL", name: "Dan Ellis", email: "dan@example.test" },
    { id: "p_alice", type: "INDIVIDUAL", name: "Alice Nguyen", email: "alice@example.test" },
    { id: "p_erin", type: "INDIVIDUAL", name: "Erin Ford", email: "erin@example.test" },
    { id: "p_frank", type: "INDIVIDUAL", name: "Frank Gray", email: "frank@example.test" },
    { id: "p_synd", type: "SYNDICATE", name: "Blue Silks Syndicate" },
    { id: "v_vet", type: "VENDOR", name: "Ridgeline Equine Vet" },
    { id: "v_farrier", type: "VENDOR", name: "Iron & Anvil Farrier" },
    { id: "v_transport", type: "VENDOR", name: "GallopWay Transport" },
    { id: "j_lopez", type: "JOCKEY", name: "J. Lopez" },
    { id: "e_maria", type: "EMPLOYEE", name: "Maria Santos" },
    { id: "e_luis", type: "EMPLOYEE", name: "Luis Romero" },
  ];
  await prisma.party.createMany({
    data: parties.map((p) => ({
      id: p.id,
      orgId: ORG,
      type: p.type as never,
      name: p.name,
      email: p.email ?? null,
    })),
  });

  // Syndicate membership (sums to 10000 bp). Alice is both a direct owner and a
  // syndicate member — exercises multi-path aggregation.
  const memberships: MembershipInterval[] = [
    { syndicateId: "p_synd", memberPartyId: "p_erin", basisPoints: 4000, from: FROM },
    { syndicateId: "p_synd", memberPartyId: "p_frank", basisPoints: 3500, from: FROM },
    { syndicateId: "p_synd", memberPartyId: "p_alice", basisPoints: 2500, from: FROM },
  ];
  await prisma.syndicateMembership.createMany({
    data: memberships.map((m) => ({
      orgId: ORG,
      syndicateId: m.syndicateId,
      memberPartyId: m.memberPartyId,
      basisPoints: m.basisPoints,
      from: m.from,
    })),
  });

  // Horses + ownership (each sums to 10000 bp).
  const horses = [
    { id: "h_thunder", name: "Thunderbolt", rate: 7500 },
    { id: "h_silk", name: "Silk Road", rate: 8500 },
    { id: "h_comet", name: "Halley's Comet", rate: 6500 },
  ];
  await prisma.horse.createMany({
    data: horses.map((h) => ({ id: h.id, orgId: ORG, name: h.name })),
  });
  await prisma.trainingRate.createMany({
    data: horses.map((h) => ({
      orgId: ORG,
      horseId: h.id,
      dailyRateCents: BigInt(h.rate),
      from: FROM,
    })),
  });

  const ownership: OwnershipInterval[] = [
    { horseId: "h_thunder", partyId: "p_bob", basisPoints: 6000, from: FROM },
    { horseId: "h_thunder", partyId: "p_carol", basisPoints: 4000, from: FROM },
    { horseId: "h_silk", partyId: "p_synd", basisPoints: 5000, from: FROM },
    { horseId: "h_silk", partyId: "p_dan", basisPoints: 5000, from: FROM },
    { horseId: "h_comet", partyId: "p_alice", basisPoints: 10000, from: FROM },
  ];
  await prisma.ownership.createMany({
    data: ownership.map((o) => ({
      orgId: ORG,
      horseId: o.horseId,
      partyId: o.partyId,
      basisPoints: o.basisPoints,
      from: o.from,
    })),
  });

  // Employees for payroll.
  await prisma.employee.createMany({
    data: [
      { id: "emp_maria", orgId: ORG, partyId: "e_maria", isW2: true },
      { id: "emp_luis", orgId: ORG, partyId: "e_luis", isW2: true },
    ],
  });

  // Point an owner-portal user at Bob so the portal has data to show.
  await prisma.user.create({
    data: {
      orgId: ORG,
      email: "bob@meadowbrook.test",
      passwordHash: pw,
      role: "OWNER_PORTAL",
      partyId: "p_bob",
    },
  });

  // ---- Seed some ledger activity so the app isn't empty ----
  const syndicates = new Set(["p_synd"]);
  const graph: OwnershipGraph = {
    ownership,
    memberships,
    isSyndicate: (id) => syndicates.has(id),
  };
  const ledger = new Ledger(new PrismaLedgerStore(prisma), {
    orgId: ORG,
    legalEntityId: LE_TRAINING,
  });

  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

  // Vendor bills against horses.
  const bills = [
    { vendor: "v_vet", horse: "h_thunder", cat: "cat_vet", amount: 45000, date: "2026-06-04" },
    { vendor: "v_farrier", horse: "h_silk", cat: "cat_farrier", amount: 18000, date: "2026-06-06" },
    { vendor: "v_vet", horse: "h_comet", cat: "cat_vet", amount: 22500, date: "2026-06-09" },
  ];
  for (const b of bills) {
    const draft = vendorBillApproved({
      vendorPartyId: b.vendor,
      amount: cents(BigInt(b.amount)),
      horseId: b.horse,
      categoryId: b.cat,
    });
    const entry = await ledger.postEntry({ date: d(b.date), memo: draft.memo }, draft.lines);
    await prisma.vendorBill.create({
      data: {
        orgId: ORG,
        legalEntityId: LE_TRAINING,
        vendorPartyId: b.vendor,
        horseId: b.horse,
        status: "APPROVED",
        billDate: d(b.date),
        journalEntryId: entry.id,
        lines: { create: [{ categoryId: b.cat, description: "Services", amountCents: BigInt(b.amount) }] },
      },
    });
  }

  // Monthly training charges, split to leaf owners by ownership.
  for (const h of horses) {
    const total = cents(BigInt(h.rate * 30));
    const split = splitByOwnership(graph, h.id, d("2026-06-30"), total);
    const lines = [
      ...[...split.entries()].map(([partyId, amount]) => ({
        accountKind: "ACCOUNTS_RECEIVABLE" as const,
        debit: amount,
        partyId,
      })),
      { accountKind: "OPERATING_INCOME" as const, credit: total, horseId: h.id, categoryId: "cat_training" },
    ];
    await ledger.postEntry({ date: d("2026-06-30"), memo: `Training — ${h.name} (June)` }, lines);
  }

  // An owner pays down their balance.
  const pay = ownerPaymentIn({ ownerPartyId: "p_bob", amount: cents(50000n) });
  await ledger.postEntry({ date: d("2026-07-02"), memo: "Owner payment — Bob Carter" }, pay.lines);

  // Silk Road hits the board: $12,000 net to owners, $1,500 trainer cut.
  const { allocations, draft } = disburse(graph, "h_silk", d("2026-07-05"), cents(1_200_000n), cents(150_000n));
  const purseEntry = await ledger.postEntry({ date: d("2026-07-05"), memo: draft.memo }, draft.lines);
  await prisma.purse.create({
    data: {
      orgId: ORG,
      legalEntityId: LE_TRAINING,
      horseId: "h_silk",
      resultDate: d("2026-07-05"),
      grossCents: 1_350_000n,
      netToOwnerCents: 1_200_000n,
      journalEntryId: purseEntry.id,
      allocations: { create: allocations.map((a) => ({ partyId: a.partyId, amountCents: a.amount })) },
    },
  });

  console.log("Seeded Meadowbrook Racing:");
  console.log("  staff login → staff@meadowbrook.test / tote1234");
  console.log("  owner login → bob@meadowbrook.test / tote1234");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
