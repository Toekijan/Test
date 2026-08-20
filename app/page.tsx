"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ToetsForm from "@/components/ToetsForm";
import ResultaatPaneel from "@/components/ResultaatPaneel";
import type { ToetsResultaat } from "@/types/domain";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

export default function Home() {
  const [resultaat, setResultaat] = useState<ToetsResultaat | null>(null);
  const [laden, setLaden] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-overheid-blue">Vergunningplicht Checker</h1>
        <p className="text-sm text-slate-600">
          Vul een adres en een korte omschrijving van je plan in. De app zoekt de geldende
          omgevingsplan-/bestemmingsplanregels op die locatie op (via de officiele "Regels op de kaart"-voorziening
          van het Omgevingsloket) en beoordeelt of je plan vergunningplichtig is.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ToetsForm onResultaat={setResultaat} onLoading={setLaden} />
          {resultaat && (
            <div className="h-96 overflow-hidden rounded-lg shadow-sm">
              <Map adres={resultaat.adres} />
            </div>
          )}
        </div>

        <div>
          {laden && <p className="text-sm text-slate-500">Bezig met opzoeken en toetsen...</p>}
          {resultaat && !laden && <ResultaatPaneel resultaat={resultaat} />}
          {!resultaat && !laden && (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-400">
              Nog geen toetsing uitgevoerd. Vul links een adres en casus in.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
