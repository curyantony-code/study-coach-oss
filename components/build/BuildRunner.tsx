"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ALERT, PRIMARY, type Envelope } from "./styles";

interface Built {
  course: string;
  vaultId: string;
  folder: string;
  notes: number;
  files: number;
  units: number;
}

/** Creates the vault for one course. Nothing is written until this button is pressed. */
export default function BuildRunner({ course, files }: { course: string; files: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const run = async () => {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/build/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course }) });
      const json = (await response.json().catch(() => null)) as Envelope<Built> | null;
      if (!json?.success || !json.data) throw new Error(json?.error ?? "The course could not be built. Try again.");
      // The page then lists the new course under "Built", with a link to check its units.
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The course could not be built. Try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <button type="button" className={PRIMARY} disabled={running} onClick={() => void run()}>
        {running ? "Building…" : `Build ${course} from ${files} file${files === 1 ? "" : "s"}`}
      </button>
      {message && <p role="alert" className={`${ALERT} mt-2`}>{message}</p>}
    </div>
  );
}
