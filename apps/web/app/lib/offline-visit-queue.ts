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
  assignmentId: string;
  incidentId: string;
  actorId: string;
  actorName: string;
  teamId: string;
  zoneId: string;
  zoneReference: string;
  teamName: string;
  location: string;
  objective: string;
  startsAt: string;
  dueAt: string | null;
  sessionToken: string;
  sessionExpiresAt: string;
  passkeyRegistered: boolean;
  downloadedAt: string;
};

export type RapidAssessmentInput = {
  clientMutationId: string;
  deviceId: string;
  observedAt: string;
  damageTypes: string[];
  severity: "low" | "medium" | "high" | "critical";
  needTypes: string[];
  urgency: "routine" | "priority" | "urgent" | "immediate";
  affectedHouseholds: number;
  affectedPeople: number;
  notes: string | null;
};

export type QueuedRapidAssessment = RapidAssessmentInput & {
  operation: "rapid_assessment.record";
  queuedAt: string;
  attempts: number;
};

export type FieldEvidenceInput = {
  clientMutationId: string;
  assessmentClientMutationId: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  sha256: string;
  capturedAt: string;
  dataBase64: string;
};

export type QueuedFieldEvidence = FieldEvidenceInput & {
  operation: "field_evidence.store";
  queuedAt: string;
};

const databaseName = "pulso-atlas-field";
const storeName = "mutations";
const missionStoreName = "missions";
const assessmentStoreName = "assessments";
const evidenceStoreName = "evidence";

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 4);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "clientMutationId" });
      }
      if (!database.objectStoreNames.contains(missionStoreName)) {
        database.createObjectStore(missionStoreName, { keyPath: "code" });
      }
      if (!database.objectStoreNames.contains(assessmentStoreName)) {
        database.createObjectStore(assessmentStoreName, { keyPath: "clientMutationId" });
      }
      if (!database.objectStoreNames.contains(evidenceStoreName)) {
        database.createObjectStore(evidenceStoreName, { keyPath: "clientMutationId" });
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

export async function getLatestCachedMission(): Promise<CachedMissionPackage | null> {
  const database = await openDatabase();
  const missions = await new Promise<CachedMissionPackage[]>((resolve, reject) => {
    const request = database
      .transaction(missionStoreName, "readonly")
      .objectStore(missionStoreName)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return missions.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0] ?? null;
}

export async function queueRapidAssessment(
  input: RapidAssessmentInput,
): Promise<QueuedRapidAssessment> {
  const database = await openDatabase();
  const queued: QueuedRapidAssessment = {
    ...input,
    operation: "rapid_assessment.record",
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(assessmentStoreName, "readwrite");
    transaction.objectStore(assessmentStoreName).put(queued);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return queued;
}

export async function listQueuedAssessments(): Promise<QueuedRapidAssessment[]> {
  const database = await openDatabase();
  const queued = await new Promise<QueuedRapidAssessment[]>((resolve, reject) => {
    const request = database
      .transaction(assessmentStoreName, "readonly")
      .objectStore(assessmentStoreName)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return queued.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function syncQueuedAssessments(apiUrl: string, sessionToken: string) {
  const queued = await listQueuedAssessments();
  let synced = 0;
  for (const assessment of queued) {
    const {
      operation: _operation,
      queuedAt: _queuedAt,
      attempts: _attempts,
      ...payload
    } = assessment;
    try {
      const response = await fetch(`${apiUrl}/v1/field-assessments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) continue;
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(assessmentStoreName, "readwrite");
        transaction.objectStore(assessmentStoreName).delete(assessment.clientMutationId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, pending: queued.length - synced };
}

export async function queueFieldEvidence(input: FieldEvidenceInput): Promise<QueuedFieldEvidence> {
  const database = await openDatabase();
  const queued: QueuedFieldEvidence = {
    ...input,
    operation: "field_evidence.store",
    queuedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(evidenceStoreName, "readwrite");
    transaction.objectStore(evidenceStoreName).put(queued);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return queued;
}

export async function listQueuedEvidence(): Promise<QueuedFieldEvidence[]> {
  const database = await openDatabase();
  const queued = await new Promise<QueuedFieldEvidence[]>((resolve, reject) => {
    const request = database
      .transaction(evidenceStoreName, "readonly")
      .objectStore(evidenceStoreName)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return queued.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function syncQueuedEvidence(apiUrl: string, sessionToken: string) {
  const queued = await listQueuedEvidence();
  let synced = 0;
  for (const evidence of queued) {
    const { operation: _operation, queuedAt: _queuedAt, ...payload } = evidence;
    try {
      const response = await fetch(`${apiUrl}/v1/field-evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) continue;
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(evidenceStoreName, "readwrite");
        transaction.objectStore(evidenceStoreName).delete(evidence.clientMutationId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, pending: queued.length - synced };
}
