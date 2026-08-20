"use client";

import type { ToetsResultaat, VergunningplichtOordeel } from "@/types/domain";

const OORDEEL_STYLE: Record<VergunningplichtOordeel, { label: string; classes: string }> = {
  vergunningplichtig: { label: "Vergunningplichtig", classes: "bg-red-50 text-red-800 border-red-200" },
  vergunningvrij: { label: "Vergunningvrij (indicatief)", classes: "bg-green-50 text-green-800 border-green-200" },
  onduidelijk: { label: "Onduidelijk / nader onderzoek nodig", classes: "bg-amber-50 text-amber-800 border-amber-200" },
};

function vanToepassingLabel(waarde: boolean | "onduidelijk"): string {
  if (waarde === true) return "Van toepassing";
  if (waarde === false) return "Niet van toepassing";
  return "Onduidelijk";
}

function vanToepassingKleur(waarde: boolean | "onduidelijk"): string {
  if (waarde === true) return "text-red-700";
  if (waarde === false) return "text-slate-400";
  return "text-amber-700";
}

export default function ResultaatPaneel({ resultaat }: { resultaat: ToetsResultaat }) {
  const stijl = OORDEEL_STYLE[resultaat.oordeel];

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-lg border p-4 ${stijl.classes}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Oordeel</p>
        <p className="text-lg font-semibold">{stijl.label}</p>
        {!resultaat.aiGebruikt && (
          <p className="mt-1 text-xs opacity-80">
            Let op: geen AI-redenering uitgevoerd over de daadwerkelijke regeltekst (zie toelichting hieronder).
          </p>
        )}
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Motivatie</h3>
        <p className="whitespace-pre-line text-sm text-slate-700">{resultaat.motivatie}</p>
      </div>

      {resultaat.aandachtspunten.length > 0 && (
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Aandachtspunten</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {resultaat.aandachtspunten.map((punt, i) => (
              <li key={i}>{punt}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Checklist per activiteitcategorie</h3>
        <div className="divide-y divide-slate-100">
          {resultaat.checklist.map((item) => (
            <div key={item.categorie} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{item.categorie}</span>
                <span className={`text-xs font-semibold ${vanToepassingKleur(item.van_toepassing)}`}>
                  {vanToepassingLabel(item.van_toepassing)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{item.toelichting}</p>
              <p className="mt-0.5 text-xs italic text-slate-400">{item.wettelijkeGrondslag}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Opgehaalde regels op deze locatie</h3>
        {resultaat.regels.bevoegdGezag && (
          <p className="mb-2 text-xs text-slate-500">Bevoegd gezag: {resultaat.regels.bevoegdGezag}</p>
        )}
        {resultaat.regels.status !== "ok" && (
          <p className="mb-2 text-sm text-amber-700">{resultaat.regels.melding}</p>
        )}
        {resultaat.regels.regels.map((regel, i) => (
          <details key={i} className="mb-2 rounded border border-slate-200 p-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              {regel.documentTitel}
              {regel.bekendOnder ? ` — ${regel.bekendOnder}` : ""}
            </summary>
            <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{regel.regelTekst}</p>
          </details>
        ))}
        <a
          href={resultaat.regels.omgevingsloketUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-overheid-blue underline"
        >
          Bekijk zelf in Regels op de kaart (Omgevingsloket)
        </a>
      </div>

      <p className="text-xs text-slate-500">{resultaat.disclaimer}</p>
    </div>
  );
}
