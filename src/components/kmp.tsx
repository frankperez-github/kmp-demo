import React, { useState, useEffect } from "react";

type Step = {
  i: number;
  j: number;
  pi: number[];
  explanation: string;
};

export default function KMPVisualizer() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pattern, setPattern] = useState("abacab");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [text, setText] = useState("abacababacab");
  const [piSteps, setPiSteps] = useState<Step[]>([]);
  const [kmpSteps, setKmpSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<"pi" | "kmp">("pi");

  // --- Compute Prefix Function Steps ---
  useEffect(() => {
    const computePrefixSteps = (pattern: string): Step[] => {
      const steps: Step[] = [];
      const pi = Array(pattern.length).fill(0);
      let j = 0;

      for (let i = 1; i < pattern.length; i++) {
        while (j > 0 && pattern[i] !== pattern[j]) {
          j = pi[j - 1];
          steps.push({
            i,
            j,
            pi: [...pi],
            explanation: `Retrocede j a ${j} porque ${pattern[i]} ≠ ${pattern[j]}`,
          });
        }
        if (pattern[i] === pattern[j]) {
          j++;
          pi[i] = j;
          steps.push({
            i,
            j,
            pi: [...pi],
            explanation: `Coincidencia en ${pattern[i]}, incrementa j a ${j}`,
          });
        } else {
          steps.push({
            i,
            j,
            pi: [...pi],
            explanation: `No coincide ${pattern[i]}, pi[${i}] = ${pi[i]}`,
          });
        }
      }
      return steps;
    };

    setPiSteps(computePrefixSteps(pattern));
  }, [pattern]);

  // --- Compute KMP Steps ---
  useEffect(() => {
    const computeKMPSteps = (text: string, pattern: string, pi: number[]): Step[] => {
      const steps: Step[] = [];
      let j = 0;

      for (let i = 0; i < text.length; i++) {
        while (j > 0 && text[i] !== pattern[j]) {
          j = pi[j - 1];
          steps.push({
            i,
            j,
            pi,
            explanation: `Retroceso j → ${j} porque ${text[i]} ≠ ${pattern[j]}`,
          });
        }
        if (text[i] === pattern[j]) {
          j++;
          steps.push({
            i,
            j,
            pi,
            explanation: `Coincide ${text[i]}, avanza j a ${j}`,
          });
        }
        if (j === pattern.length) {
          steps.push({
            i,
            j,
            pi,
            explanation: `Encontrado patrón en posición ${i - j + 1}`,
          });
          j = pi[j - 1];
        }
      }
      return steps;
    };

    if (piSteps.length > 0) {
      const finalPi = piSteps[piSteps.length - 1].pi;
      setKmpSteps(computeKMPSteps(text, pattern, finalPi));
    }
  }, [piSteps, pattern, text]);

  const steps = mode === "pi" ? piSteps : kmpSteps;
  const current = steps[stepIndex] ?? steps[steps.length - 1];

  const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const reset = () => setStepIndex(0);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>KMP Visualizer</h2>

      {/* MODE TOGGLE */}
      <div style={styles.modeRow}>
        <button
          onClick={() => {
            setMode("pi");
            reset();
          }}
          style={{
            ...styles.modeButton,
            ...(mode === "pi" ? styles.activeButton : {}),
          }}
        >
          Función π
        </button>

        <button
          onClick={() => {
            setMode("kmp");
            reset();
          }}
          style={{
            ...styles.modeButton,
            ...(mode === "kmp" ? styles.activeButton : {}),
          }}
        >
          Búsqueda KMP
        </button>
      </div>

      {/* STRINGS */}
      <div style={styles.stringContainer}>
        <p style={styles.label}>Patrón:</p>
        <div style={styles.stringRow}>
          {pattern.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                ...styles.char,
                ...(current?.i === i && mode === "pi" ? styles.highlight : {}),
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        <p style={styles.label}>Texto:</p>
        <div style={styles.stringRow}>
          {text.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                ...styles.char,
                ...(current?.i === i && mode === "kmp" ? styles.highlight : {}),
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      {/* π Array */}
      <div style={styles.piContainer}>
        <p style={styles.label}>π:</p>
        <div style={styles.stringRow}>
          {current?.pi?.map((v, i) => (
            <span
              key={i}
              style={{
                ...styles.char,
                ...(i === current?.i && mode === "pi" ? styles.piHighlight : {}),
              }}
            >
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <p style={styles.explanation}>{current?.explanation}</p>

      {/* Controls */}
      <div style={styles.controls}>
        <button onClick={back} style={styles.button}>
          ← Atrás
        </button>
        <button onClick={reset} style={styles.button}>
          Reiniciar
        </button>
        <button onClick={next} style={styles.button}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    textAlign: "center",
    fontFamily: "sans-serif",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
  },
  modeRow: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: 10,
  },
  modeButton: {
    backgroundColor: "#555",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  },
  activeButton: {
    backgroundColor: "#007AFF",
  },
  stringContainer: {
    margin: "20px 0",
  },
  stringRow: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 6,
  },
  label: {
    fontWeight: 600,
    marginBottom: 4,
  },
  char: {
    fontSize: 18,
    margin: "0 4px",
    padding: "4px 6px",
    borderRadius: 4,
  },
  highlight: {
    backgroundColor: "#FFD700",
  },
  piHighlight: {
    backgroundColor: "#90EE90",
  },
  piContainer: {
    margin: "15px 0",
  },
  explanation: {
    margin: "15px 0",
    fontSize: 16,
    color: "#333",
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
  },
  button: {
    backgroundColor: "#333",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
};
