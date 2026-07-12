import { MappedImport } from "@/components/mapped-import";
import { importRoster, importRates, importBills } from "./actions";

export const dynamic = "force-dynamic";

const ROSTER_SAMPLE = `Horse,Owner,Percent
Thunderbolt,Bob Carter,60
Thunderbolt,Carol Diaz,40
Silk Road,Blue Silks Syndicate,50
Silk Road,Dan Ellis,50
Halley's Comet,Alice Nguyen,100`;

const RATES_SAMPLE = `Horse,Daily Rate
Thunderbolt,75.00
Silk Road,85.00
Halley's Comet,65.00`;

const BILLS_SAMPLE = `Date,Vendor,Horse,Category,Memo,Amount
2026-06-03,Ridgeline Equine Vet,Thunderbolt,Veterinary,Lameness exam,"$1,250.00"
2026-06-05,Iron & Anvil Farrier,Silk Road,Farrier,Full set,180.00`;

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Migrate a Barn</h1>
        <p className="mt-1 text-sm text-muted">
          Bring a whole barn over from HorseBills or a spreadsheet — ownership, rates, and bills — with no manual
          re-entry. Pick a preset, paste, and go. Missing horses and owners are created automatically; ownership always
          lands penny-exact.
        </p>
      </div>

      <MappedImport
        title="Ownership Roster"
        subtitle="One row per horse/owner/share. Shares normalize to exactly 100%."
        fields={[
          { key: "horse", label: "Horse column" },
          { key: "owner", label: "Owner column" },
          { key: "share", label: "Share column" },
        ]}
        presets={{
          Generic: { horse: "Horse", owner: "Owner", share: "Percent" },
          HorseBills: { horse: "Horse", owner: "Owner", share: "Ownership %" },
          QuickBooks: { horse: "Class", owner: "Customer", share: "Percentage" },
        }}
        sample={ROSTER_SAMPLE}
        action={importRoster}
      />

      <MappedImport
        title="Training Rates"
        subtitle="Per-horse daily rate in dollars."
        fields={[
          { key: "horse", label: "Horse column" },
          { key: "dailyRate", label: "Daily rate column" },
        ]}
        presets={{
          Generic: { horse: "Horse", dailyRate: "Daily Rate" },
          HorseBills: { horse: "Horse", dailyRate: "Day Rate" },
        }}
        sample={RATES_SAMPLE}
        action={importRates}
      />

      <MappedImport
        title="Vendor Bills"
        subtitle="A month of expenses. Vendors, horses, and categories are created as needed."
        fields={[
          { key: "date", label: "Date column" },
          { key: "vendor", label: "Vendor column" },
          { key: "amount", label: "Amount column" },
          { key: "horse", label: "Horse column" },
          { key: "category", label: "Category column" },
          { key: "description", label: "Memo column" },
        ]}
        presets={{
          Generic: {
            date: "Date",
            vendor: "Vendor",
            amount: "Amount",
            horse: "Horse",
            category: "Category",
            description: "Memo",
          },
        }}
        sample={BILLS_SAMPLE}
        action={importBills}
      />
    </div>
  );
}
