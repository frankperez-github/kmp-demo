'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";

// Visualizador de la prefix function π y KMP — versión estable y legible en proyector
// - Construcción de π con prefijo/sufijo coloreados (paleta fría para pared amarilla)
// - j actual sólo en el bloque de prefijo confirmado
// - KMP con patrón animado, guías por clic (3 líneas), retroceso de pasos y control de velocidad
// - Tests visuales + con esperado (no se alteran los existentes)

// Tipos auxiliares
type Phase = "idle" | "compare" | "fallback" | "matchInc" | "setPi" | "done";
interface Snap {
  i: number;
  j: number;
  pi: number[];
  phase: Phase;
}
interface KSnap {
  ti: number;
  j2: number;
  displayOffset: number;
  showGuides: boolean;
  guideStage: number;
  guideKeep: number;
  guideBorder: number;
  guideMove: number;
  animating: boolean;
}

type CellValue = string | number;

const PREFIX_ALGO_LINES = [
  { id: "initPi", code: "pi[0] = 0" },
  { id: "initJ", code: "j = 0" },
  { id: "forLoop", code: "for i in 1..n-1:" },
  { id: "whileCond", code: "  while j > 0 and s[i] != s[j]:" },
  { id: "whileBody", code: "    j = pi[j-1]" },
  { id: "ifCond", code: "  if s[i] == s[j]:" },
  { id: "incJ", code: "    j += 1" },
  { id: "setPi", code: "  pi[i] = j" },
] as const;

type AlgoLineId = (typeof PREFIX_ALGO_LINES)[number]["id"];

export default function PrefixFunctionVisualizer() {
  // --- Estado construcción de π ---
  const [pat, setPat] = useState("abacabab"); // ejemplo donde π baja pero no llega a 0
  const [patDraft, setPatDraft] = useState("abacabab");
  const [i, setI] = useState(1);
  const [j, setJ] = useState(0);
  const [pi, setPi] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [auto, setAuto] = useState(false);
  const [speedMs, setSpeedMs] = useState(800);
  const [hist, setHist] = useState<Snap[]>([]);

  // --- Estado demo KMP ---
  const [text, setText] = useState("ABABABACABAABABA"); // texto suficiente para ver saltos sin desbordar
  const [ti, setTi] = useState(0); // índice en texto
  const [j2, setJ2] = useState(0); // coincidencias actuales en patrón
  const [kmpAuto, setKmpAuto] = useState(false);
  const [kmpSpeed, setKmpSpeed] = useState(800);
  const [kmpAnimMs, setKmpAnimMs] = useState(1400); // animación lenta

  // Animación y guías KMP
  const CELL_PX = 52; // ancho aprox de celda + gap
  const [displayOffset, setDisplayOffset] = useState(0); // offset mostrado (en celdas)
  const [animating, setAnimating] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [guideKeep, setGuideKeep] = useState(0); // j antes del retroceso
  const [guideBorder, setGuideBorder] = useState(0); // π[j-1]
  const [guideMove, setGuideMove] = useState(0); // j - π[j-1]
  const [guideStage, setGuideStage] = useState(0); // 0 nada, 1 coincidió, 2 prefijo, 3 mover

  // Historial de pasos KMP para retroceder
  const [kHist, setKHist] = useState<KSnap[]>([]);
  const [matchFlash, setMatchFlash] = useState<{ start: number; length: number } | null>(null);
  const matchFlashTimer = useRef<NodeJS.Timeout | null>(null);
  const saveK = useCallback(() => {
    setKHist((h) => [
      ...h,
      { ti, j2, displayOffset, showGuides, guideStage, guideKeep, guideBorder, guideMove, animating },
    ]);
  }, [ti, j2, displayOffset, showGuides, guideStage, guideKeep, guideBorder, guideMove, animating]);
  const kmpBack = () => {
    if (animating) return; // no retroceder durante animación
    const prev = kHist[kHist.length - 1];
    if (!prev) return;
    setTi(prev.ti);
    setJ2(prev.j2);
    setDisplayOffset(prev.displayOffset);
    setShowGuides(prev.showGuides);
    setGuideStage(prev.guideStage);
    setGuideKeep(prev.guideKeep);
    setGuideBorder(prev.guideBorder);
    setGuideMove(prev.guideMove);
    setAnimating(prev.animating);
    setKHist((h) => h.slice(0, -1));
  };

  // Derivado: patrón KMP en MAYÚSCULAS (coherente con el texto)
  const kmpPat = useMemo(() => pat.toUpperCase(), [pat]);

  // Inicialización
  useEffect(() => {
    resetAll(pat, { syncDraft: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = useMemo(() => pat.length > 0, [pat]);

  function resetAll(newPat?: string, options?: { syncDraft?: boolean }) {
    const s = newPat ?? pat;
    setPat(s);
    if (options?.syncDraft || newPat !== undefined) setPatDraft(s);
    setPi(Array(s.length).fill(0));
    setI(s.length > 1 ? 1 : 0);
    setJ(0);
    setPhase(s.length <= 1 ? "done" : "compare");
    setAuto(false);
    setHist([]);
    // Reinicia KMP
    setTi(0);
    setJ2(0);
    setKmpAuto(false);
    setDisplayOffset(0);
    setAnimating(false);
    setShowGuides(false);
    setGuideStage(0);
    setKHist([]);
    if (matchFlashTimer.current) {
      clearTimeout(matchFlashTimer.current);
      matchFlashTimer.current = null;
    }
    setMatchFlash(null);
  }

  const applyPattern = () => {
    resetAll(patDraft, { syncDraft: true });
  };
  const loadExample = (value: string) => {
    resetAll(value, { syncDraft: true });
  };

  // Paso de la construcción de π
  const step = useCallback(() => {
    if (phase === "done") return;
    setHist((h) => [...h, { i, j, pi: [...pi], phase }]);

    if (phase === "compare") {
      if (pat[i] === pat[j]) {
        setPhase("matchInc");
      } else if (j > 0) {
        setPhase("fallback");
      } else {
        const nextPi = [...pi];
        nextPi[i] = 0;
        setPi(nextPi);
        setPhase("setPi");
      }
    } else if (phase === "fallback") {
      const newJ = pi[j - 1] ?? 0;
      setJ(newJ);
      setPhase("compare");
    } else if (phase === "matchInc") {
      const newJ = j + 1;
      const nextPi = [...pi];
      nextPi[i] = newJ;
      setPi(nextPi);
      setJ(newJ);
      setPhase("setPi");
    } else if (phase === "setPi") {
      if (i + 1 < pat.length) {
        setI(i + 1);
        setPhase("compare");
      } else {
        setPhase("done");
      }
    }
  }, [phase, i, j, pi, pat]);

  // Auto-play π
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => step(), speedMs);
    return () => clearTimeout(t);
  }, [auto, speedMs, step]);

  // Helpers UI
  function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={`px-2 py-1 text-sm rounded-full border ${className}`}>{children}</span>;
  }
  function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
    return (
      <div className="bg-white rounded-2xl shadow p-5 md:p-7 w-full">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl md:text-2xl font-semibold">{title}</h2>
        </div>
        {children}
      </div>
    );
  }

  const explanation = useMemo(() => {
    if (!valid) return "Escribe un patrón para comenzar.";
    switch (phase) {
      case "compare":
        return `Comparando s[i]=${pat[i] ?? ""} con s[j]=${pat[j] ?? ""}. Si son iguales, aumentamos j; si no, retrocedemos con π.`;
      case "fallback":
        return `No coinciden. Retrocedemos j ← π[j−1] = ${pi[j - 1] ?? 0} para reintentar con el siguiente prefijo propio que también es sufijo.`;
      case "matchInc":
        return `Coincidencia en s[i] y s[j]. Aumentamos j y definimos π[i] = j.`;
      case "setPi":
        return `Guardado π[${i}] = ${pi[i]}. Avanzamos i.`;
      case "done":
        return "¡Listo! Has construido el arreglo π completo.";
      default:
        return "";
    }
  }, [phase, i, j, pi, pat, valid]);

  const comparingWindow = phase === "compare" && i < pat.length && j < pat.length;
  const mismatchWithBorder = comparingWindow && j > 0 && pat[i] !== pat[j];
  const mismatchNoBorder = comparingWindow && j === 0 && pat[i] !== pat[j];
  const matchCandidate = comparingWindow && pat[i] === pat[j];

  const activeAlgoLines = useMemo(() => {
    const ids = new Set<AlgoLineId>();
    if (pat.length === 0) return Array.from(ids);
    if (phase === "idle") {
      ids.add("initPi");
      ids.add("initJ");
      return Array.from(ids);
    }
    if (pat.length > 1) ids.add("forLoop");
    if (mismatchWithBorder || phase === "fallback") ids.add("whileCond");
    if (phase === "fallback") ids.add("whileBody");
    if (matchCandidate || phase === "matchInc") ids.add("ifCond");
    if (phase === "matchInc") ids.add("incJ");
    if (phase === "setPi" || phase === "done" || mismatchNoBorder) ids.add("setPi");
    return Array.from(ids);
  }, [phase, pat.length, mismatchWithBorder, mismatchNoBorder, matchCandidate]);

  // Render celdas
  function Cells({
    row,
    highlightIndex,
    label,
    cellClassAt,
    showIndices = true,
  }: {
    row: CellValue[];
    highlightIndex?: number;
    label?: string;
    cellClassAt?: (idx: number, value?: CellValue) => string;
    showIndices?: boolean;
  }) {
    return (
      <div className="w-full">
        {label && <div className="text-sm mb-1 text-gray-800">{label}</div>}
        <div className="flex gap-1.5 flex-wrap">
          {row.map((v, idx) => {
            const extra = cellClassAt ? cellClassAt(idx, v) : "";
            return (
              <div
                key={idx}
                className={`min-w-[44px] text-center border rounded-xl px-3 py-2 ${
                  highlightIndex === idx ? "ring-2 ring-blue-700 bg-blue-50" : ""
                } ${extra}`}
              >
                <span className="font-mono text-base md:text-lg">{String(v)}</span>
              </div>
            );
          })}
        </div>
        {showIndices && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {row.map((_, idx) => (
              <div key={idx} className="min-w-[44px] text-center text-xs text-gray-700">
                {idx}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fila patrón animable (translateX)
  function PatternRow({
    row,
    offsetCells,
    highlightIndex,
    label,
    cellClassAt,
    animate = false,
  }: {
    row: CellValue[];
    offsetCells: number;
    highlightIndex?: number;
    label?: string;
    cellClassAt?: (idx: number, value?: CellValue) => string;
    animate?: boolean;
  }) {
    return (
      <div className="w-full">
        {label && <div className="text-sm mb-1 text-gray-800">{label}</div>}
        <div className="overflow-hidden w-full">
          <div
            className="inline-flex gap-1.5 will-change-transform"
            style={{
              transform: `translateX(${offsetCells * CELL_PX}px)`,
              transition: animate ? `transform ${kmpAnimMs}ms ease` : "none",
            }}
          >
            {row.map((v, idx) => {
              const extra = cellClassAt ? cellClassAt(idx, v) : "";
              return (
                <div
                  key={idx}
                  className={`min-w-[44px] text-center border rounded-xl px-3 py-2 ${
                    highlightIndex === idx ? "ring-2 ring-blue-700 bg-blue-50" : ""
                  } ${extra}`}
                >
                  <span className="font-mono text-base md:text-lg">{String(v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Overlay de líneas finas (no se superponen, controlado por clic)
  function PatternGuidesOverlay({
    offsetCells,
    keep,
    border,
    move,
    stage,
  }: {
    offsetCells: number;
    keep: number;
    border: number;
    move: number;
    stage: number;
  }) {
    const baseLeft = offsetCells * CELL_PX;
    const keepLeft = baseLeft; // j desde el inicio del patrón alineado
    const borderLeft = baseLeft + Math.max(0, keep - border) * CELL_PX; // sobre el sufijo de longitud b
    const moveLeft = baseLeft; // tramo inicial de longitud (keep - border)
    return (
      <div className="pointer-events-none absolute left-0 right-0 -top-4" style={{ height: 14 }}>
        {stage >= 1 && (
          <div
            className="absolute h-0.5 bg-emerald-500 rounded"
            style={{ left: keepLeft, width: `${keep * CELL_PX}px`, top: 2 }}
          />
        )}
        {stage >= 2 && (
          <div
            className="absolute h-0.5 bg-blue-700 rounded"
            style={{ left: borderLeft, width: `${border * CELL_PX}px`, top: 6 }}
          />
        )}
        {stage >= 3 && (
          <div className="absolute flex items-center" style={{ left: moveLeft, top: 10 }}>
            <div
              className="h-0.5 bg-fuchsia-600 rounded"
              style={{ width: `${Math.max(0, move * CELL_PX - 8)}px` }}
            />
            <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[8px] border-t-transparent border-b-transparent border-l-fuchsia-600 ml-1" />
          </div>
        )}
      </div>
    );
  }

  function AlgoDebugger({
    active,
    watch,
    fallbackSummary,
  }: {
    active: AlgoLineId[];
    watch: { label: string; value: React.ReactNode }[];
    fallbackSummary?: string;
  }) {
    return (
      <div className="bg-slate-900 text-slate-200 rounded-2xl border border-slate-800 p-4 font-mono text-sm w-full h-full">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">Debugger π</div>
        <div className="space-y-1">
          {PREFIX_ALGO_LINES.map((line, idx) => {
            const isActive = active.includes(line.id);
            const lineNumber = String(idx + 1).padStart(2, "0");
            return (
              <div
                key={line.id}
                className={`flex gap-2 rounded-lg px-2 py-1 whitespace-pre border ${
                  isActive
                    ? "bg-emerald-600/25 text-emerald-50 border-emerald-400/60 shadow-inner shadow-emerald-500/20"
                    : "border-transparent text-slate-300"
                }`}
              >
                <span className="text-xs opacity-60">{lineNumber}</span>
                <span>{line.code}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Las líneas resaltadas muestran la instrucción que se ejecuta en este paso.
        </p>
        {watch.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Watch</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {watch.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-1"
                >
                  <span className="text-[11px] text-slate-400">{entry.label}</span>
                  <span className="text-sm text-slate-50">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {fallbackSummary && (
          <div className="mt-4 border border-amber-500/40 bg-amber-500/10 rounded-xl px-3 py-2 text-xs leading-5 text-amber-100">
            {fallbackSummary}
          </div>
        )}
      </div>
    );
  }

  // π previsualizado (muestra valor tentativo cuando hay matchInc)
  const piPreview = useMemo(() => {
    const out = [...pi];
    if (phase === "matchInc") out[i] = j + 1;
    return out;
  }, [pi, phase, i, j]);

  // Cadena de prefijos-sufijos candidatos
  function prefixChain(q: number) {
    const res: number[] = [];
    let x = q;
    while (x > 0) {
      res.push(x);
      x = pi[x - 1] ?? 0;
    }
    res.push(0);
    return res;
  }

  // Barra de iteraciones (candidatos)
  function IterationBar({ upto, jNow }: { upto: number; jNow: number }) {
    const chain = prefixChain(jNow);
    return (
      <div className="mt-2 p-3 rounded-xl border bg-white w-full">
        <div className="text-xs text-gray-800">
          Prefijo actual: <span className="font-mono">s[0..{upto}]</span>
        </div>
        <div className="text-xs text-gray-800 mb-2">Posibles j al retroceder (de mayor a menor):</div>
        <div className="flex flex-wrap gap-2 items-end">
          {chain.map((val, idx) => (
            <div key={idx} className="px-2 py-1 border rounded-lg">
              <div className="text-[10px] text-gray-800">j</div>
              <div className="font-mono text-sm">{val}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-800 mt-2">
          Se intenta primero el prefijo propio (prefijo = sufijo) más largo; si falla, se prueba el siguiente más corto.
        </div>
      </div>
    );
  }

  // Visual de prefijo-sufijo confirmado (dos líneas: prefijo y sufijo)
  function BorderGrow({
    s,
    upto,
    confirmedLen,
    currentJ,
  }: {
    s: string;
    upto: number;
    confirmedLen: number;
    currentJ: number;
  }) {
    const prefix = s.slice(0, upto + 1);
    const L = Math.max(0, Math.min(confirmedLen, Math.max(0, prefix.length - 1)));
    const comparing = phase === "compare" && i < s.length && j < s.length;
    const equalNow = comparing && s[i] === s[j];

    return (
      <div className="mt-2 p-3 rounded-xl border bg-white w-full">
        <div className="text-sm text-gray-800 mb-2">
          Prefijo-sufijo confirmado en <span className="font-mono">s[0..{upto}]</span>:
          <span className="font-mono"> π[{upto}] = {L}</span>
          {L > 0 ? (
            <span>
              &nbsp;(&ldquo;<span className="font-mono">{prefix.slice(0, L)}</span>&rdquo;)
            </span>
          ) : null}
        </div>
        <div className="text-xs text-gray-800 mb-1">
          Prefijo (izq.) y sufijo (der.) resaltados (la extensión se muestra abajo):
        </div>
        <div className="flex flex-col gap-1">
          {/* Línea superior: PREFIJO. Mantener j en azul y comparar s[j] (verde/rojo) */}
          <div className="flex gap-1.5">
            {prefix.split("").map((ch, idx) => {
              let cls = idx < j ? "bg-sky-200 border-sky-600" : "bg-white"; // prefijo vigente
              if (comparing && idx === j)
                cls = equalNow ? "bg-emerald-100 border-emerald-700" : "bg-rose-100 border-rose-700"; // comparación
              return (
                <div
                  key={`p-${idx}`}
                  className={`min-w-[38px] text-center text-base rounded-md border px-2 py-1 ${cls}`}
                >
                  <span className="font-mono">{ch}</span>
                </div>
              );
            })}
          </div>
          {/* Línea inferior: SUFIJO. Durante 'compare' mostrar sufijo previo (long j) sin incluir s[i]; en 'setPi/done' mostrar L incluyendo s[i] */}
          <div className="flex gap-1.5">
            {prefix.split("").map((ch, idx) => {
              const end = prefix.length - 1; // índice de i
              const comparingNow = comparing;
              const lenPrev = j;
              const lenConfirmed = L;
              let start: number, endExcl: number;
              if (comparingNow) {
                start = end - lenPrev;
                endExcl = end; // excluye i
              } else {
                start = prefix.length - lenConfirmed;
                endExcl = prefix.length; // incluye i
              }
              const inSuffix = idx >= Math.max(0, start) && idx < Math.max(0, endExcl);
              const isLast = idx === end; // i

              let cls = inSuffix && (comparingNow ? lenPrev > 0 : lenConfirmed > 0)
                ? "bg-sky-200 border-sky-600"
                : "bg-white";

              if (comparingNow && isLast)
                cls = equalNow ? "bg-emerald-100 border-emerald-700" : "bg-rose-100 border-rose-700";

              return (
                <div
                  key={`s-${idx}`}
                  className={`min-w-[38px] text-center text-base rounded-md border px-2 py-1 ${cls}`}
                >
                  <span className="font-mono">{ch}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="bg-blue-100 border-blue-700">
            j actual = <span className="font-mono">{currentJ}</span>
          </Badge>
          {comparing && (
            <Badge className={equalNow ? "bg-emerald-100 border-emerald-700" : "bg-rose-100 border-rose-700"}>
              comparando s[i]={s[i]} con s[j]={s[j]}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  // --- Lógica KMP ---
  function kmpReset() {
    setTi(0);
    setJ2(0);
    setKmpAuto(false);
    setDisplayOffset(0);
    setAnimating(false);
    setShowGuides(false);
    setGuideStage(0);
    setKHist([]);
    if (matchFlashTimer.current) {
      clearTimeout(matchFlashTimer.current);
      matchFlashTimer.current = null;
    }
    setMatchFlash(null);
  }

  const kmpStep = useCallback(() => {
    if (matchFlash) return; // espera a que termine el parpadeo
    const alignStart = Math.max(0, ti - j2);
    if (kmpPat.length > 0 && alignStart + kmpPat.length > text.length) {
      setKmpAuto(false);
      return; // patrón ya no cabe en el texto restante
    }
    // guarda snapshot para poder retroceder este paso
    saveK();
    if (j2 === kmpPat.length) return; // encontrado
    if (ti >= text.length) return; // fin texto
    if (kmpPat.length === 0) return; // patrón vacío

    const mismatch = text[ti] !== kmpPat[j2];

    // Modo guiado por clics: mismatch y j>0
    if (mismatch && j2 > 0 && !animating) {
      if (!showGuides) {
        const b = pi[j2 - 1] ?? 0;
        const salto = j2 - b;
        setGuideKeep(j2);
        setGuideBorder(b);
        setGuideMove(salto);
        setShowGuides(true);
        setGuideStage(1);
        return;
      }
      if (guideStage < 3) {
        setGuideStage(guideStage + 1);
        return;
      }
      // stage 3 mostrado → siguiente clic anima
      const b = guideBorder;
      const salto = guideMove;
      setShowGuides(false);
      setGuideStage(0);
      setAnimating(true);
      setDisplayOffset((off) => off + salto);
      setTimeout(() => {
        setAnimating(false);
        setJ2(b);
        setDisplayOffset(Math.max(0, ti - b));
      }, kmpAnimMs + 20);
      return;
    }

    // Casos normales (match o mismatch con j==0)
    if (!mismatch) {
      const newTi = ti + 1;
      const newJ = j2 + 1;
      setTi(newTi);
      setJ2(newJ);
      setDisplayOffset(Math.max(0, newTi - newJ));
      if (newJ === kmpPat.length) {
        const matchStart = newTi - kmpPat.length;
        const resumeJ = pi[kmpPat.length - 1] ?? 0;
        if (matchFlashTimer.current) clearTimeout(matchFlashTimer.current);
        setMatchFlash({ start: matchStart, length: kmpPat.length });
        matchFlashTimer.current = setTimeout(() => {
          setMatchFlash(null);
          setJ2(resumeJ);
          setDisplayOffset(Math.max(0, newTi - resumeJ));
          matchFlashTimer.current = null;
        }, 800);
      }
    } else {
      if (j2 > 0) {
        const b = pi[j2 - 1] ?? 0;
        setJ2(b);
        setDisplayOffset(Math.max(0, ti - b));
      } else {
        setTi(ti + 1);
        setDisplayOffset(Math.max(0, ti + 1 - 0));
      }
    }
  }, [
    saveK,
    matchFlash,
    j2,
    kmpPat,
    ti,
    text,
    animating,
    showGuides,
    guideStage,
    guideBorder,
    guideMove,
    pi,
    kmpAnimMs,
  ]);

  // Autoplay KMP
  useEffect(() => {
    if (!kmpAuto || matchFlash) return;
    const tmr = setTimeout(() => kmpStep(), kmpSpeed);
    return () => clearTimeout(tmr);
  }, [kmpAuto, kmpSpeed, kmpStep, matchFlash]);

  // Mantener offset sincronizado cuando no hay animación/guías
  useEffect(() => {
    if (!animating && !showGuides) setDisplayOffset(Math.max(0, ti - j2));
  }, [ti, j2, animating, showGuides]);

  useEffect(() => {
    return () => {
      if (matchFlashTimer.current) clearTimeout(matchFlashTimer.current);
    };
  }, []);

  // --- Utilidades y Tests ---
  function computePi(s: string) {
    const arr = Array(s.length).fill(0);
    let jj = 0;
    for (let ii = 1; ii < s.length; ii++) {
      while (jj > 0 && s[ii] != s[jj]) jj = arr[jj - 1];
      if (s[ii] === s[jj]) jj++;
      arr[ii] = jj;
    }
    return arr;
  }

  // Ejemplos listos para cargar
  const patternExamples = useMemo(() => {
    const data = [
      {
        label: "Monotónica (+1 por paso)",
        pat: "AAAAAA",
        description: "La π crece en 1 en cada índice; ideal para ver matches continuos.",
      },
      {
        label: "Sube y cae",
        pat: "ABABAAC",
        description: "Crece hasta la mitad y luego cae por 1 (fallback corto).",
      },
      {
        label: "Fallback largos",
        pat: "ABABACABABACABA",
        description: "Fuerza π a retroceder repetidamente antes de volver a crecer.",
      },
      {
        label: "Sin coincidencias",
        pat: "ABCDEFGH",
        description: "Caracteres únicos: π permanece en 0 y nunca hay fallback.",
      },
    ];
    return data.map((item) => ({
      ...item,
      pi: computePi(item.pat),
    }));
  }, []);

  // Derivados visuales KMP
  const mismatchNow = ti < text.length && j2 < kmpPat.length && text[ti] !== kmpPat[j2];
  const matchNow = ti < text.length && j2 < kmpPat.length && text[ti] === kmpPat[j2];

  const debuggerWatch = useMemo(() => {
    const entries: { label: string; value: React.ReactNode }[] = [];
    const inRange = (idx: number) => idx >= 0 && idx < pat.length;
    const charAt = (idx: number) => (inRange(idx) ? pat[idx] : "—");
    const piAt = (idx: number) => (idx >= 0 && idx < pi.length ? pi[idx] : undefined);
    const piCurrent = inRange(i) ? piAt(i) : undefined;
    const piPreviewValue = inRange(i) ? piPreview[i] : undefined;
    const compareReady = inRange(i) && inRange(j);

    entries.push({ label: "i", value: pat.length ? i : "—" });
    entries.push({ label: "j", value: pat.length ? j : "—" });
    entries.push({ label: "s[i]", value: compareReady || inRange(i) ? charAt(i) : "—" });
    entries.push({ label: "s[j]", value: compareReady ? charAt(j) : "—" });
    entries.push({ label: "π[i]", value: piCurrent ?? "—" });
    entries.push({ label: "π[j−1]", value: j > 0 ? piAt(j - 1) ?? 0 : 0 });
    entries.push({
      label: "comparación",
      value: compareReady ? (pat[i] === pat[j] ? "igual" : "distinta") : "—",
    });
    entries.push({ label: "fase", value: phase });

    if (piPreviewValue !== undefined && piPreviewValue !== piCurrent) {
      entries.push({ label: "π[i] (preview)", value: piPreviewValue });
    }

    return entries;
  }, [i, j, pat, pi, piPreview, phase]);

  const fallbackSummary = useMemo(() => {
    const hasFallback =
      pat.length > 0 && (phase === "fallback" || (phase === "compare" && mismatchWithBorder));
    if (!hasFallback) return undefined;
    const currentBorder = j;
    const nextBorder = j > 0 ? pi[j - 1] ?? 0 : 0;
    const charI = pat[i] ?? "∅";
    const charJ = pat[j] ?? "∅";
    const currStr = currentBorder > 0 ? pat.slice(0, currentBorder) : "vacío";
    const nextStr = nextBorder > 0 ? pat.slice(0, nextBorder) : "vacío";
    const prefixFail = `Cuando en la posición i=${i} falla la comparación (s[i]=${charI} ≠ s[j]=${charJ}), no volvemos a empezar desde cero: reducimos el candidato de coincidencia usando π.`;
    const measure = `El prefijo propio más largo igualado hasta i−1 mide j=${currentBorder} (\"${currStr}\"), así que lo usamos como referencia para el sufijo que termina justamente en i−1.`;
    const planB = `Al fallar, probamos con el siguiente mejor prefijo propio que también es sufijo de s[0..j−1]; ese plan B ya está guardado en π[j−1]=${nextBorder} (\"${nextStr}\").`;
    const chain = `Repetimos este salto encadenando π hasta que encontremos un j que empareje s[j] con s[i] o j llegue a 0.`;
    return `${prefixFail} ${measure} ${planB} ${chain}`;
  }, [pat, phase, mismatchWithBorder, j, pi, i]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-100 to-neutral-200 text-slate-900">
      <div className="max-w-6xl mx-auto p-5 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Visualizador de la prefix function π – KMP</h1>
          <p className="text-slate-800 mt-2 max-w-3xl">Aprende paso a paso cómo se construye π y cómo guía los saltos óptimos en KMP.</p>
        </header>

        <div className="space-y-6 w-full">
          {/* Construcción de π */}
          <Section title="Patrón (s)">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center w-full">
              <div className="w-full lg:w-auto flex flex-col gap-1">
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <input
                    value={patDraft}
                    onChange={(e) => setPatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyPattern();
                      }
                    }}
                    className="border rounded-xl px-3 py-2 font-mono w-full"
                    placeholder="Escribe el patrón, p. ej., abacabab"
                  />
                  <button onClick={applyPattern} className="px-3 py-2 rounded-xl border bg-white whitespace-nowrap">
                    Aplicar patrón
                  </button>
                </div>
                {patDraft !== pat && (
                  <span className="text-xs text-amber-700">
                    El tablero aún usa el patrón anterior; aplica el nuevo para reiniciar.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap lg:ml-auto">
                <button
                  onClick={() => setAuto((v) => !v)}
                  className={`px-3 py-2 rounded-xl border ${auto ? "bg-blue-700 text-white border-blue-700" : "bg-white"}`}
                  disabled={phase === "done"}
                >
                  {auto ? "Pausar" : "Auto"}
                </button>
                <button onClick={step} className="px-3 py-2 rounded-xl border bg-white" disabled={phase === "done"}>
                  Siguiente paso
                </button>
                <button
                  onClick={() => {
                    const prev = hist[hist.length - 1];
                    if (!prev) return;
                    setI(prev.i);
                    setJ(prev.j);
                    setPi(prev.pi);
                    setPhase(prev.phase);
                    setHist((h) => h.slice(0, -1));
                  }}
                  className="px-3 py-2 rounded-xl border bg-white"
                >
                  Retroceder
                </button>
                <button onClick={() => resetAll(undefined, { syncDraft: true })} className="px-3 py-2 rounded-xl border bg-white">
                  Reiniciar
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-800">velocidad</span>
                  <input type="range" min={300} max={1500} step={100} value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <Badge>
                i = <span className="font-mono">{i}</span>
              </Badge>
              <Badge>fase: {phase}</Badge>
            </div>
          </Section>

          <Section title="Tablero de construcción de π">
            <div className="w-full flex flex-col gap-6 lg:flex-row">
              <div className="flex-1 space-y-4">
                <Cells row={pat.split("")} highlightIndex={i} label="Patrón s[0..n-1]" />
                <Cells row={piPreview.map((x) => x ?? 0)} highlightIndex={i} label="π (prefijo = sufijo)" />
                <BorderGrow s={pat} upto={i} confirmedLen={piPreview[i] ?? 0} currentJ={j} />
                <IterationBar upto={i} jNow={j} />
                <div className="text-sm text-slate-800 bg-neutral-100 border rounded-xl p-3">{explanation}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-emerald-100 border-emerald-700">match: s[i] == s[j]</Badge>
                  <Badge className="bg-rose-100 border-rose-700">mismatch: s[i] != s[j]</Badge>
                  <Badge className="bg-sky-200 border-sky-600">prefijo fallback: j ← π[j−1]</Badge>
                </div>
              </div>
              <div className="lg:w-80 xl:w-96 w-full flex flex-col gap-3">
                <AlgoDebugger active={activeAlgoLines} watch={debuggerWatch} fallbackSummary={fallbackSummary} />
                <button
                  onClick={step}
                  disabled={phase === "done"}
                  className={`px-3 py-2 rounded-xl border ${phase === "done" ? "bg-slate-200 text-slate-500" : "bg-white hover:bg-slate-50"} w-full`}
                >
                  Siguiente paso
                </button>
              </div>
            </div>
          </Section>

          {/* KMP debajo del tablero */}
          <Section title="KMP en acción (saltos guiados por π)">
            <div className="flex flex-col gap-3 w-full">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <input
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value.toUpperCase());
                    setTi(0);
                    setJ2(0);
                    setKmpAuto(false);
                    setDisplayOffset(0);
                  }}
                  className="border rounded-xl px-3 py-2 font-mono w-full md:w-auto"
                  placeholder="Texto (largo, mayúsculas para claridad)"
                />
                <input value={kmpPat} readOnly className="border rounded-xl px-3 py-2 font-mono w-full md:w-auto opacity-70" />
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setKmpAuto((v) => !v)}
                    className={`px-3 py-2 rounded-xl border ${kmpAuto ? "bg-blue-700 text-white border-blue-700" : "bg-white"}`}
                  >
                    {kmpAuto ? "Pausar KMP" : "Auto KMP"}
                  </button>
                  <button onClick={kmpStep} className="px-3 py-2 rounded-xl border bg-white">
                    Paso KMP
                  </button>
                  <button onClick={kmpBack} className="px-3 py-2 rounded-xl border bg-white" disabled={animating}>
                    Retroceder KMP
                  </button>
                  <button onClick={kmpReset} className="px-3 py-2 rounded-xl border bg-white">
                    Reiniciar KMP
                  </button>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-gray-800">velocidad auto</span>
                    <input type="range" min={300} max={2000} step={100} value={kmpSpeed} onChange={(e) => setKmpSpeed(Number(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* Texto y patrón */}
              <Cells
                row={text.split("")}
                label="Texto T[0..m-1]"
                cellClassAt={(idx) => {
                  if (matchFlash && idx >= matchFlash.start && idx < matchFlash.start + matchFlash.length) {
                    return "bg-emerald-200 border-emerald-700 animate-pulse";
                  }
                  if (idx === ti && matchNow) return "bg-emerald-100 border-emerald-700";
                  if (idx === ti && mismatchNow) return "bg-rose-100 border-rose-700";
                  return "";
                }}
              />
              <div className="relative">
                <PatternRow
                  row={kmpPat.split("")}
                  offsetCells={displayOffset}
                  label="Patrón P alineado"
                  highlightIndex={j2}
                  animate={animating}
                  cellClassAt={(idx) => {
                    if (matchFlash) return "bg-emerald-200 border-emerald-700 animate-pulse";
                    if (idx === j2 && matchNow) return "bg-emerald-100 border-emerald-700";
                    if (idx === j2 && mismatchNow) return "bg-rose-100 border-rose-700";
                    return "";
                  }}
                />
                {showGuides && (
                  <PatternGuidesOverlay
                    offsetCells={displayOffset}
                    keep={guideKeep}
                    border={guideBorder}
                    move={guideMove}
                    stage={guideStage}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-800">
                <span>duración animación patrón</span>
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={100}
                  value={kmpAnimMs}
                  onChange={(e) => setKmpAnimMs(Number(e.target.value))}
                />
                <span className="font-mono text-gray-600">{kmpAnimMs} ms</span>
              </div>

              {/* π del patrón debajo */}
              <Cells
                row={pi}
                label="π del patrón (guía de saltos en KMP)"
                highlightIndex={Math.max(0, j2 - 1)}
                cellClassAt={(idx) => {
                  const used = j2 > 0 && idx === j2 - 1;
                  return used ? "bg-sky-200 border-sky-600" : "";
                }}
              />

              {/* Explicación del salto óptimo (cuando aplique) */}
              {(() => {
                let info = "";
                if (j2 === kmpPat.length) info = "¡Patrón encontrado!";
                else if (ti >= text.length || (kmpPat.length > 0 && Math.max(0, ti - j2) + kmpPat.length > text.length))
                  info =
                    "Fin del texto: el patrón ya no cabe en el sufijo restante, así que no tiene sentido seguir buscando más apariciones.";
                if (info)
                  return (
                    <div className="p-3 rounded-xl bg-neutral-100 border text-sm w-full">{info}</div>
                  );
              if (mismatchNow && j2 > 0) {
                const b = pi[j2 - 1] ?? 0;
                const salto = j2 - b;
                const chain = prefixChain(j2);
                return (
                  <div className="p-3 rounded-xl bg-neutral-100 border text-sm w-full">
                    <div className="mb-2">
                      Mismatch en <span className="font-mono">T[{ti}]</span> con <span className="font-mono">P[{j2}]</span>. Conservamos el prefijo-sufijo <span className="font-mono">b = π[{j2 - 1}] = {b}</span>.
                    </div>
                    <div className="mb-2">
                      Desplazamiento del inicio: <span className="font-mono">+{salto}</span>. Cadena de candidatos: {chain.join(" → ")}
                    </div>
                    <div className="text-xs text-gray-800">Sigue clicando “Paso KMP” para ver las 3 líneas de prefijo y luego el desplazamiento.</div>
                  </div>
                );
              }
                return (
                  <div className="p-3 rounded-xl bg-neutral-100 border text-sm w-full">
                    {matchNow ? "Match parcial: avanzan ti y j." : "Mismatch con j=0: avanzamos ti."}
                  </div>
                );
              })()}
            </div>
          </Section>

          {/* Teoría y tests */}
          <Section title="¿Qué es la prefix function π?">
            <p className="text-sm leading-relaxed">
              Para cada posición <span className="font-mono">i</span>, <span className="font-mono">π[i]</span> es la longitud del <span className="font-semibold">mayor prefijo propio</span> de <span className="font-mono">s[0..i]</span> que también es <span className="font-semibold">sufijo</span> de <span className="font-mono">s[0..i]</span>.
            </p>
            <div className="text-xs mt-3 p-3 rounded-xl bg-blue-100 border border-blue-700">
              Intuición: ante mismatch, probamos el siguiente prefijo propio (que también es sufijo) más corto usando <span className="font-mono">π[j−1]</span>.
            </div>
            <pre className="mt-3 text-xs bg-slate-900 text-slate-100 p-3 rounded-xl overflow-x-auto"><code>{`pi[0] = 0
j = 0
for i in 1..n-1:
  while j > 0 and s[i] != s[j]:
    j = pi[j-1]
  if s[i] == s[j]:
    j += 1
  pi[i] = j`}</code></pre>
          </Section>

          <Section title="Ejemplos listos para cargar">
            <div className="grid gap-3 md:grid-cols-2">
              {patternExamples.map((ex) => (
                <div key={ex.pat} className="p-3 border rounded-2xl bg-white flex flex-col gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{ex.label}</div>
                    <p className="text-xs text-gray-700 mt-1">{ex.description}</p>
                  </div>
                  <div className="text-xs text-gray-800">
                    Patrón: <span className="font-mono">{ex.pat}</span>
                  </div>
                  <Cells row={ex.pi} label="π esperado" showIndices={false} />
                  <button
                    onClick={() => loadExample(ex.pat)}
                    className="mt-1 px-3 py-2 rounded-xl border bg-blue-50 border-blue-200 hover:bg-blue-100 text-sm"
                  >
                    Cargar en el tablero
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-500">
          Desarrollado por el colectivo de EDA 
        </footer>
      </div>
    </div>
  );
}
