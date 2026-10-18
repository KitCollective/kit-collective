// The RPC client type and the loader hook every page reads its data with.
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import type { rpcContract } from "../../src/contract";

export type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

/** Loads a value over RPC and reloads it whenever the server reports a change. */
export function useLoaded<T>(load: (rpc: Rpc) => Promise<T>, key: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);
  // `load` closes over `key` only, so `key` is the dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refetch = useCallback(() => {
    load(rpc).then((next) => {
      setValue(next);
      setError(null);
    }, report);
  }, [rpc, report, key]);
  useEffect(() => {
    setValue(null);
    refetch();
  }, [refetch]);
  useRealtime("changed", refetch);
  /** Runs a write, then shows its error or the reloaded value. */
  const act = useCallback(
    (write: (rpc: Rpc) => Promise<unknown>) => write(rpc).then(refetch, report),
    [rpc, refetch, report],
  );
  return { rpc, value, error, report, act };
}
