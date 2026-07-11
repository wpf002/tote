import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tote — Racing Accounting",
  description: "Penny-exact billing and purse disbursement on an immutable ledger.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
