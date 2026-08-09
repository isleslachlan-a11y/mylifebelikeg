"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_CURRENCIES } from "@/lib/money";
import { createManualRate } from "./actions";

const CURRENCY_RE = /^[A-Z]{3}$/;

export function ManualRateForm({ today }: { today: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [baseCurrency, setBaseCurrency] = useState<string>(
    COMMON_CURRENCIES[0],
  );
  const [quoteCurrency, setQuoteCurrency] = useState<string>(
    COMMON_CURRENCIES[1],
  );
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(today);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!CURRENCY_RE.test(baseCurrency) || !CURRENCY_RE.test(quoteCurrency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }
    if (baseCurrency === quoteCurrency) {
      setError("Pick two different currencies.");
      return;
    }
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError("Rate must be a number greater than zero.");
      return;
    }
    if (!asOf) {
      setError("Enter a date.");
      return;
    }

    startTransition(async () => {
      const result = await createManualRate({
        baseCurrency,
        quoteCurrency,
        rate: parsedRate,
        asOf,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Saved: 1 ${result.data.base_currency} = ${result.data.rate} ${result.data.quote_currency} as of ${result.data.as_of}.`,
      );
      setRate("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-muted-foreground text-sm">
          {success}
        </p>
      )}

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fx-base">From</Label>
          <Select value={baseCurrency} onValueChange={setBaseCurrency}>
            <SelectTrigger id="fx-base" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-muted-foreground pb-2 text-sm">→</span>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fx-quote">To</Label>
          <Select value={quoteCurrency} onValueChange={setQuoteCurrency}>
            <SelectTrigger id="fx-quote" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="fx-rate">
            Rate (1 {baseCurrency} = ? {quoteCurrency})
          </Label>
          <Input
            id="fx-rate"
            inputMode="decimal"
            placeholder="e.g. 1.85"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="fx-as-of">As of</Label>
          <Input
            id="fx-as-of"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        Save rate
      </Button>
    </form>
  );
}
