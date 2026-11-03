const storageKey = "focusdesk.workspace.v1";
let database: Promise<IDBDatabase> | undefined;

function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pinecone", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function readBrowserWorkspace(
  key = storageKey,
): Promise<string | null> {
  const database = await db();
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const request = database
      .transaction("workspace")
      .objectStore("workspace")
      .get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return (
    value ?? (key === storageKey ? localStorage.getItem(storageKey) : null)
  );
}

export async function writeBrowserWorkspace(
  value: string,
  key = storageKey,
): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
