import { ISyncClient } from "napl";
import styles from "./style.module.css";
import { useSyncClient } from "./sync-client";
import ReactDOM from 'react-dom/client';

interface Props {
  syncClient: ISyncClient;
}

export function SharedText({ syncClient }: Props) {
  const { useData } = useSyncClient({ syncClient });
  const [data, setData] = useData<string>("data");
  return <textarea
    className={styles["shared-text"]}
    title="shared-text"
    value={data ?? ""}
    onChange={e => setData(e.target.value)} />;
}

export function hookupDiv(div: HTMLElement, client: ISyncClient) {
  const root = ReactDOM.createRoot(div);
  root.render(<SharedText syncClient={client} />);
}
