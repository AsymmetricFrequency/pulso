import type {
  CreateMissionInvitationInput,
  FieldSessionDto,
  IssuedMissionInvitationDto,
  MissionPackageDto,
  RedeemMissionInvitationInput,
} from "@pulso/schemas";

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

export interface MissionAccessRepository {
  issueInvitation(
    assignmentId: string,
    input: CreateMissionInvitationInput,
    siteUrl: string,
  ): Promise<IssuedMissionInvitationDto>;
  redeemInvitation(input: RedeemMissionInvitationInput): Promise<FieldSessionDto>;
  resolveSession(token: string): Promise<ResolvedFieldSession>;
  saveRegistrationChallenge(sessionId: string, challenge: string, expiresAt: string): Promise<void>;
  consumeRegistrationChallenge(sessionId: string): Promise<string>;
  listPasskeys(actorId: string): Promise<StoredPasskey[]>;
  savePasskey(passkey: StoredPasskey): Promise<void>;
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
