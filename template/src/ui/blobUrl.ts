// A picture from the blob store as an address that lasts while the screen does.
import { useEffect, useState } from "react";
import { readBlob } from "../data/siteAdmin";
import { useShell } from "./shellContext";

export function useBlobUrl(siteId: string, blobId: string | undefined): string | undefined {
  const { db } = useShell();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (blobId === undefined) {
      setUrl(undefined);
      return;
    }
    let made: string | undefined;
    let cancelled = false;
    void readBlob(db, siteId, blobId).then((blob) => {
      if (blob === undefined || cancelled) return;
      made = URL.createObjectURL(new Blob([blob.bytes as BlobPart], { type: blob.type }));
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made !== undefined) URL.revokeObjectURL(made);
    };
  }, [db, siteId, blobId]);
  return url;
}
