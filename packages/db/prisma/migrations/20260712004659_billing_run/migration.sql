-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TRAINING',
ADD COLUMN     "markupCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "recoverCents" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vendor_bills" ADD COLUMN     "invoicedRunKey" TEXT;
