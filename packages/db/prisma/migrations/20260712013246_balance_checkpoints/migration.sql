-- CreateTable
CREATE TABLE "ledger_checkpoints" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "throughDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_balances" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "accountKind" "AccountKind" NOT NULL,
    "partyId" TEXT,
    "horseId" TEXT,
    "categoryId" TEXT,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "checkpoint_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_checkpoints_orgId_legalEntityId_throughDate_idx" ON "ledger_checkpoints"("orgId", "legalEntityId", "throughDate");

-- CreateIndex
CREATE INDEX "checkpoint_balances_checkpointId_accountKind_idx" ON "checkpoint_balances"("checkpointId", "accountKind");

-- AddForeignKey
ALTER TABLE "checkpoint_balances" ADD CONSTRAINT "checkpoint_balances_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "ledger_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
