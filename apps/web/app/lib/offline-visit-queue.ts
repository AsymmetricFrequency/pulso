export type QueuedFieldVisit = {
  clientMutationId: string;
  operation: "field_visit.start";
  zoneReference: string;
  deviceId: string;
  startedAt: string;
  queuedAt: string;
  attempts: number;
};

export type CachedMissionPackage = {
  code: string;
  zoneReference: string;
  teamName: string;
  objective: string;
  downloadedAt: string;
};

const databaseName = "pulso-atlas-field";
const storeName = "mutations";
const missionStoreName = "missions";

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "clientMutationId" });
      }
      if (!database.objectStoreNames.contains(missionStoreName)) {
        database.createObjectStore(missionStoreName, { keyPath: "code" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function queueFieldVisit(zoneReference: string): Promise<QueuedFieldVisit> {
  const database = await openDatabase();
  const mutation: QueuedFieldVisit = {
    clientMutationId: crypto.randomUUID(),
    operation: "field_visit.start",
    zoneReference,
    deviceId: localStorage.getItem("pulso-device-id") ?? crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  localStorage.setItem("pulso-device-id", mutation.deviceId);

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(mutation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return mutation;
}

export async function countQueuedVisits(): Promise<number> {
  const database = await openDatabase();
  const count = await new Promise<number>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return count;
}

export async function cacheMissionPackage(
  mission: Omit<CachedMissionPackage, "downloadedAt">,
): Promise<CachedMissionPackage> {
  const database = await openDatabase();
  const cached = { ...mission, downloadedAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(missionStoreName, "readwrite");
    transaction.objectStore(missionStoreName).put(cached);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return cached;
}
