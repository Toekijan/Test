"use client";

import { useState } from "react";
import type { ToetsResultaat } from "@/types/domain";

interface Props {
  onResultaat: (resultaat: ToetsResultaat) => void;
  onLoading: (loading: boolean) => void;
}

export default function ToetsForm({ onResultaat, onLoading }: Props) {
  const [adres, setAdres] = useState("");
  const [casus, setCasus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBezig(true);
    onLoading(true);
    try {
      const res = await fetch("/api/toets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adres, casus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis.");
        return;
      }
      onResultaat(data as ToetsResultaat);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBezig(false);
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-sm">
      <div>
        <label htmlFor="adres" className="mb-1 block text-sm font-medium text-slate-700">
          Adres
        </label>
        <input
          id="adres"
          type="text"
          required
          value={adres}
          onChange={(e) => setAdres(e.target.value)}
          placeholder="Bijv. Coolsingel 40, Rotterdam"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-overheid-blue focus:outline-none focus:ring-1 focus:ring-overheid-blue"
        />
      </div>
      <div>
        <label htmlFor="casus" className="mb-1 block text-sm font-medium text-slate-700">
          Casus
        </label>
        <textarea
          id="casus"
          required
          rows={5}
          value={casus}
          onChange={(e) => setCasus(e.target.value)}
          placeholder="Beschrijf wat je van plan bent, bijv. 'Ik wil een dakkapel plaatsen aan de voorzijde van mijn woning' of 'Ik wil de begane grond van bedrijfsruimte naar horeca wijzigen'."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-overheid-blue focus:outline-none focus:ring-1 focus:ring-overheid-blue"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={bezig}
        className="rounded-md bg-overheid-blue px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
      >
        {bezig ? "Bezig met toetsen..." : "Toets vergunningplicht"}
      </button>
    </form>
  );
}
