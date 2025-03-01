import { SocketClient } from "@dobuki/syncopath";
import { useCallback, useEffect, useMemo, useState } from "react";

interface SocketClientProps {
  room?: string;
  host?: string;
}

interface Props {
  socketClient: SocketClient;
}

export function useSocketClient(props: Props & Partial<SocketClientProps>) {
  const socketClient = useMemo(() => {
    return props.socketClient ?? (props.host ? new SocketClient(props.host, props.room) : undefined);
  }, [props.socketClient, props.host, props.room]);

  const useData = useCallback(<T>(path: string): [T | null, (value: T | ((prev: T | null) => T)) => void] => {
    const [data, setData] = useState<T | null>(null);

    useEffect(() => {
      const observer = socketClient.observe(path).onChange(({ value }) => setData(value));
      return () => observer.close();
    }, [path]);

    return [
      data,
      useCallback((value: T | ((prev: T | null) => T)) => {
        socketClient.setData(path, value);
      }, []),
    ];
  }, [socketClient]);

  return { useData };
}
