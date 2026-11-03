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

export async function readBrowserWorkspace(): Promise<string | null> {
  const database = await db();
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const request = database
      .transaction("workspace")
      .objectStore("workspace")
      .get(storageKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return value ?? localStorage.getItem(storageKey);
}

export async function writeBrowserWorkspace(value: string): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(value, storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
