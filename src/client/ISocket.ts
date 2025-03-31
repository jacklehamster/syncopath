import { RoomState } from "@/types/RoomState";

export interface ISocket {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  onMessage(listener: (data: any) => void): void;
  onError(listener: (event: Event) => void): void;
  onClose(listener: () => void): void;
  close(): void;
  supportBlob?: boolean;
}
