import { provideSocketClient } from "@dobuki/syncopath";
import { ISyncClient } from "napl";
import { useCallback, useEffect, useMemo, useState } from "react";

interface SyncClientProps {
  room?: string;
  host?: string;
}

interface Props {
  syncClient: ISyncClient;
}

export function useSyncClient(props: Props & Partial<SyncClientProps>) {
  const syncClient = useMemo(() => {
    return props.syncClient ?? (props.host ? provideSocketClient({ host: props.host, room: props.room }) : undefined);
  }, [props.syncClient, props.host, props.room]);

  const useData = useCallback(<T>(path: string): [T | null, (value: T | ((prev: T | null) => T)) => void] => {
    const [data, setData] = useState<T | null>(null);

    useEffect(() => {
      const observer = syncClient.observe(path).onChange((value) => setData(value));
      return () => observer.close();
    }, [path]);

    return [
      data,
      useCallback((value: T | ((prev: T | null) => T)) => {
        syncClient.setData(path, value);
      }, []),
    ];
  }, [syncClient]);

  return { useData };
}
