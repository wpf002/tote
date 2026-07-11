-- CreateEnum
CREATE TYPE "LegalEntityType" AS ENUM ('TRAINER', 'SYNDICATE', 'OWNER', 'FARM', 'OTHER');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('INDIVIDUAL', 'SYNDICATE', 'VENDOR', 'EMPLOYEE', 'JOCKEY', 'ORG_INTERNAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STAFF_ADMIN', 'STAFF', 'OWNER_PORTAL');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'OPERATING_EXPENSE', 'OPERATING_INCOME', 'OWNER_PURSE_PAYABLE', 'PURSE_REVENUE', 'WAGES_PAYABLE', 'HORSE_ASSET', 'OWNER_DEPOSITS', 'OWNER_EQUITY');

-- CreateEnum
CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'ACH', 'CARD', 'PURSE_CREDIT');

-- CreateEnum
CREATE TYPE "RaceEntryStatus" AS ENUM ('NOMINATED', 'ENTERED', 'SCRATCHED', 'RAN');

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LegalEntityType" NOT NULL DEFAULT 'TRAINER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "partyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndicate_memberships" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "syndicateId" TEXT NOT NULL,
    "memberPartyId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),

    CONSTRAINT "syndicate_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horses" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownerships" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),

    CONSTRAINT "ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_rates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "dailyRateCents" BIGINT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),

    CONSTRAINT "training_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "markupBp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "reversalOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "accountKind" "AccountKind" NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "partyId" TEXT,
    "horseId" TEXT,
    "categoryId" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "vendorPartyId" TEXT NOT NULL,
    "horseId" TEXT,
    "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
    "billDate" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "ownerPartyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "runKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "horseId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_applications" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purses" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "raceId" TEXT,
    "resultDate" TIMESTAMP(3) NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "netToOwnerCents" BIGINT NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purse_allocations" (
    "id" TEXT NOT NULL,
    "purseId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "purse_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "raceDate" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_entries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "status" "RaceEntryStatus" NOT NULL DEFAULT 'ENTERED',
    "feeCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "race_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jockey_bookings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "raceEntryId" TEXT NOT NULL,
    "jockeyPartyId" TEXT NOT NULL,
    "mountFeeCents" BIGINT NOT NULL DEFAULT 0,
    "winPctBp" INTEGER NOT NULL DEFAULT 0,
    "placePctBp" INTEGER NOT NULL DEFAULT 0,
    "showPctBp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "jockey_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakes_schedules" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "raceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakes_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakes_payments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stakes_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL,
    "providerIntentId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "matchedEntryId" TEXT,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "isW2" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grossCents" BIGINT NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipDate" TIMESTAMP(3) NOT NULL,
    "fromLoc" TEXT NOT NULL,
    "toLoc" TEXT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_horses" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "costCents" BIGINT NOT NULL,

    CONSTRAINT "shipment_horses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "horseId" TEXT,
    "carrier" TEXT NOT NULL,
    "premiumCents" BIGINT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "filedDate" TIMESTAMP(3) NOT NULL,
    "recoveryCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitCostCents" BIGINT NOT NULL,
    "perHorsePerDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horse_transactions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "basisCents" BIGINT,
    "date" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horse_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_templates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_entities_orgId_idx" ON "legal_entities"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_orgId_entityType_entityId_idx" ON "audit_logs"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "parties_orgId_name_idx" ON "parties"("orgId", "name");

-- CreateIndex
CREATE INDEX "syndicate_memberships_orgId_syndicateId_idx" ON "syndicate_memberships"("orgId", "syndicateId");

-- CreateIndex
CREATE INDEX "horses_orgId_name_idx" ON "horses"("orgId", "name");

-- CreateIndex
CREATE INDEX "ownerships_orgId_horseId_idx" ON "ownerships"("orgId", "horseId");

-- CreateIndex
CREATE INDEX "training_rates_orgId_horseId_idx" ON "training_rates"("orgId", "horseId");

-- CreateIndex
CREATE INDEX "categories_orgId_idx" ON "categories"("orgId");

-- CreateIndex
CREATE INDEX "journal_entries_orgId_legalEntityId_idx" ON "journal_entries"("orgId", "legalEntityId");

-- CreateIndex
CREATE INDEX "journal_lines_orgId_legalEntityId_accountKind_idx" ON "journal_lines"("orgId", "legalEntityId", "accountKind");

-- CreateIndex
CREATE INDEX "journal_lines_orgId_legalEntityId_accountKind_partyId_idx" ON "journal_lines"("orgId", "legalEntityId", "accountKind", "partyId");

-- CreateIndex
CREATE INDEX "journal_lines_orgId_legalEntityId_accountKind_horseId_idx" ON "journal_lines"("orgId", "legalEntityId", "accountKind", "horseId");

-- CreateIndex
CREATE INDEX "vendor_bills_orgId_legalEntityId_idx" ON "vendor_bills"("orgId", "legalEntityId");

-- CreateIndex
CREATE INDEX "vendor_bill_lines_billId_idx" ON "vendor_bill_lines"("billId");

-- CreateIndex
CREATE INDEX "invoices_orgId_legalEntityId_ownerPartyId_idx" ON "invoices"("orgId", "legalEntityId", "ownerPartyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orgId_legalEntityId_ownerPartyId_runKey_key" ON "invoices"("orgId", "legalEntityId", "ownerPartyId", "runKey");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_orgId_legalEntityId_partyId_idx" ON "payments"("orgId", "legalEntityId", "partyId");

-- CreateIndex
CREATE INDEX "payment_applications_paymentId_idx" ON "payment_applications"("paymentId");

-- CreateIndex
CREATE INDEX "payment_applications_invoiceId_idx" ON "payment_applications"("invoiceId");

-- CreateIndex
CREATE INDEX "purses_orgId_legalEntityId_horseId_idx" ON "purses"("orgId", "legalEntityId", "horseId");

-- CreateIndex
CREATE INDEX "purse_allocations_purseId_idx" ON "purse_allocations"("purseId");

-- CreateIndex
CREATE INDEX "races_orgId_raceDate_idx" ON "races"("orgId", "raceDate");

-- CreateIndex
CREATE INDEX "race_entries_orgId_raceId_idx" ON "race_entries"("orgId", "raceId");

-- CreateIndex
CREATE INDEX "jockey_bookings_orgId_raceEntryId_idx" ON "jockey_bookings"("orgId", "raceEntryId");

-- CreateIndex
CREATE INDEX "stakes_schedules_orgId_horseId_idx" ON "stakes_schedules"("orgId", "horseId");

-- CreateIndex
CREATE INDEX "stakes_payments_scheduleId_idx" ON "stakes_payments"("scheduleId");

-- CreateIndex
CREATE INDEX "reminders_orgId_dueDate_idx" ON "reminders"("orgId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_providerIntentId_key" ON "payment_intents"("providerIntentId");

-- CreateIndex
CREATE INDEX "payment_intents_orgId_legalEntityId_idx" ON "payment_intents"("orgId", "legalEntityId");

-- CreateIndex
CREATE INDEX "bank_accounts_orgId_legalEntityId_idx" ON "bank_accounts"("orgId", "legalEntityId");

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_postedAt_idx" ON "bank_transactions"("bankAccountId", "postedAt");

-- CreateIndex
CREATE INDEX "employees_orgId_idx" ON "employees"("orgId");

-- CreateIndex
CREATE INDEX "payroll_runs_orgId_legalEntityId_idx" ON "payroll_runs"("orgId", "legalEntityId");

-- CreateIndex
CREATE INDEX "payroll_lines_payrollRunId_idx" ON "payroll_lines"("payrollRunId");

-- CreateIndex
CREATE INDEX "shipments_orgId_shipDate_idx" ON "shipments"("orgId", "shipDate");

-- CreateIndex
CREATE INDEX "shipment_horses_shipmentId_idx" ON "shipment_horses"("shipmentId");

-- CreateIndex
CREATE INDEX "insurance_policies_orgId_idx" ON "insurance_policies"("orgId");

-- CreateIndex
CREATE INDEX "insurance_claims_policyId_idx" ON "insurance_claims"("policyId");

-- CreateIndex
CREATE INDEX "inventory_items_orgId_idx" ON "inventory_items"("orgId");

-- CreateIndex
CREATE INDEX "horse_transactions_orgId_legalEntityId_horseId_idx" ON "horse_transactions"("orgId", "legalEntityId", "horseId");

-- CreateIndex
CREATE INDEX "import_templates_orgId_idx" ON "import_templates"("orgId");

-- CreateIndex
CREATE INDEX "attachments_orgId_entityType_entityId_idx" ON "attachments"("orgId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_memberships" ADD CONSTRAINT "syndicate_memberships_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_memberships" ADD CONSTRAINT "syndicate_memberships_memberPartyId_fkey" FOREIGN KEY ("memberPartyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_rates" ADD CONSTRAINT "training_rates_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purse_allocations" ADD CONSTRAINT "purse_allocations_purseId_fkey" FOREIGN KEY ("purseId") REFERENCES "purses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_entries" ADD CONSTRAINT "race_entries_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakes_payments" ADD CONSTRAINT "stakes_payments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "stakes_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_horses" ADD CONSTRAINT "shipment_horses_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
