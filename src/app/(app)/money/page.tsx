import Link from "next/link";

export default function MoneyPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-3xl">Money</h1>
      <Link href="/money/pots" className="text-sm underline">
        Manage pots
      </Link>
      <Link href="/money/cashflow" className="text-sm underline">
        Cashflow &amp; capacity
      </Link>
      <Link href="/money/fx" className="text-sm underline">
        Exchange rates
      </Link>
      <Link href="/money/ledger" className="text-sm underline">
        Ledger
      </Link>
    </div>
  );
}
