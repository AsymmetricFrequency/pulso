import type {
  BeginPasskeyAuthenticationInput,
  CreateMissionInvitationInput,
  CreateOperationsInvitationInput,
  FieldSessionDto,
  IssuedMissionInvitationDto,
  IssuedOperationsInvitationDto,
  MissionPackageDto,
  OperationsSessionDto,
  RedeemMissionInvitationInput,
  RedeemOperationsInvitationInput,
} from "@pulso/schemas";

export type ResolvedOperationsSession = {
  id: string;
  actorId: string;
  incidentId: string;
  deviceId: string;
  role: "coordinator" | "auditor" | "incident_admin";
  expiresAt: string;
};

export type ResolvedFieldSession = {
  id: string;
  actorId: string;
  deviceId: string;
  expiresAt: string;
  mission: MissionPackageDto;
};

export type StoredPasskey = {
  id: string;
  actorId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
};

export type PasskeyAuthenticationAttempt = BeginPasskeyAuthenticationInput & {
  id: string;
  challenge: string;
  expiresAt: string;
};

export interface MissionAccessRepository {
  issueInvitation(
    assignmentId: string,
    input: CreateMissionInvitationInput,
    siteUrl: string,
    issuedByActorId: string,
  ): Promise<IssuedMissionInvitationDto>;
  redeemInvitation(input: RedeemMissionInvitationInput, sourceIp: string): Promise<FieldSessionDto>;
  resolveSession(token: string): Promise<ResolvedFieldSession>;
  saveRegistrationChallenge(sessionId: string, challenge: string, expiresAt: string): Promise<void>;
  consumeRegistrationChallenge(sessionId: string): Promise<string>;
  listPasskeys(actorId: string): Promise<StoredPasskey[]>;
  savePasskey(passkey: StoredPasskey): Promise<void>;
  createAuthenticationAttempt(
    input: BeginPasskeyAuthenticationInput,
    challenge: string,
    expiresAt: string,
  ): Promise<string>;
  consumeAuthenticationAttempt(attemptId: string): Promise<PasskeyAuthenticationAttempt>;
  findPasskey(credentialId: string): Promise<StoredPasskey | undefined>;
  updatePasskeyCounter(credentialId: string, counter: number): Promise<void>;
  issueFieldSession(
    actorId: string,
    assignmentId: string,
    deviceId: string,
  ): Promise<FieldSessionDto>;
}

export interface OperationsAccessRepository {
  issueInvitation(
    incidentId: string,
    input: CreateOperationsInvitationInput,
    siteUrl: string,
    issuedByActorId: string,
  ): Promise<IssuedOperationsInvitationDto>;
  redeemInvitation(
    input: RedeemOperationsInvitationInput,
    sourceIp: string,
  ): Promise<OperationsSessionDto>;
  resolveSession(token: string): Promise<ResolvedOperationsSession>;
}

export class MissionAccessDeniedError extends Error {
  constructor(message = "La invitación o sesión no es válida.") {
    super(message);
    this.name = "MissionAccessDeniedError";
  }
}

export class MissionInvitationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionInvitationConflictError";
  }
}

export class MissionRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Demasiados intentos. Espera un momento antes de volver a probar.");
    this.name = "MissionRateLimitError";
  }
}
