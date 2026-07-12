"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader, Field, Button, Badge, inputClass } from "@/components/ui";

type Option = { id: string; name: string };

interface QueuedCapture {
  id: string;
  vendorPartyId: string;
  vendorName: string;
  horseId?: string;
  categoryId?: string;
  amount: string;
  description?: string;
  billDate: string;
}

const KEY = "tote_capture_queue";

function loadQueue(): QueuedCapture[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: QueuedCapture[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function CaptureForm({
  vendors,
  horses,
  categories,
}: {
  vendors: Option[];
  horses: Option[];
  categories: Option[];
}) {
  const [queue, setQueue] = useState<QueuedCapture[]>([]);
  const [online, setOnline] = useState(true);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setQueue(loadQueue());
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    let remaining = loadQueue();
    for (const item of [...remaining]) {
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          remaining = remaining.filter((q) => q.id !== item.id);
          saveQueue(remaining);
          setQueue(remaining);
          setSyncedCount((n) => n + 1);
        }
      } catch {
        break; // still offline; stop and keep the rest queued
      }
    }
    setSyncing(false);
  }, [syncing]);

  useEffect(() => {
    if (online && queue.length > 0) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function enqueue(item: QueuedCapture) {
    const next = [...loadQueue(), item];
    saveQueue(next);
    setQueue(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const vendorPartyId = String(fd.get("vendorPartyId") ?? "");
    const amount = String(fd.get("amount") ?? "").trim();
    if (!vendorPartyId || !amount) return;

    const item: QueuedCapture = {
      id: crypto.randomUUID(),
      vendorPartyId,
      vendorName: vendors.find((v) => v.id === vendorPartyId)?.name ?? "vendor",
      horseId: String(fd.get("horseId") ?? "") || undefined,
      categoryId: String(fd.get("categoryId") ?? "") || undefined,
      amount,
      description: String(fd.get("description") ?? "") || undefined,
      billDate: new Date().toISOString().slice(0, 10),
    };
    enqueue(item);
    formRef.current?.reset();
    if (navigator.onLine) void sync();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={online ? "positive" : "negative"}>{online ? "Online" : "Offline"}</Badge>
        {queue.length > 0 ? <Badge tone="gold">{queue.length} queued</Badge> : null}
        {syncedCount > 0 ? <Badge tone="brand">{syncedCount} synced</Badge> : null}
      </div>

      <Card>
        <CardHeader title="New Expense" subtitle="Vendor + amount is enough" />
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4 p-5">
          <Field label="Vendor">
            <select name="vendorPartyId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horse">
              <select name="horseId" className={inputClass} defaultValue="">
                <option value="">—</option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select name="categoryId" className={inputClass} defaultValue="">
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Amount (USD)">
            <input name="amount" inputMode="decimal" required className={inputClass} placeholder="0.00" />
          </Field>
          <Field label="Note">
            <input name="description" className={inputClass} placeholder="e.g. bute, wraps" />
          </Field>
          <Button type="submit">Capture Expense</Button>
        </form>
      </Card>

      {queue.length > 0 ? (
        <Card>
          <CardHeader
            title="Pending Sync"
            subtitle="Held on this device until you reconnect"
            action={
              <button
                onClick={() => void sync()}
                disabled={!online || syncing}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg hover:bg-border disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync Now"}
              </button>
            }
          />
          <ul className="divide-y divide-border/60">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-fg">{q.vendorName}</span>
                <span className="tabnum text-muted">${q.amount}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
