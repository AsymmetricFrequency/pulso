import { z } from "zod";

export const publicDataModeSchema = z.enum(["demo", "live"]);
export const publicConfidenceSchema = z.enum([
  "insufficient",
  "reported",
  "corroborated",
  "validated",
]);

export const publicMetricSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(40),
  note: z.string().min(1).max(160),
});

export const publicMunicipalitySchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  localities: z.array(z.string().min(1).max(160)).min(1).max(200),
});

export const publicTerritoryProfileSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  municipalities: z.array(publicMunicipalitySchema).min(1).max(200),
  updatedAt: z.iso.datetime({ offset: true }),
  confidence: publicConfidenceSchema,
  confidenceLabel: z.string().min(1).max(100),
  coverage: z.string().min(1).max(160),
  damage: z.string().min(1).max(160),
  supplies: z.string().min(1).max(160),
  donations: z.string().min(1).max(160),
  teams: z.string().min(1).max(160),
});

export const publicSituationUpdateSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(160),
  territory: z.string().min(1).max(240),
  detail: z.string().min(1).max(500),
  verificationLabel: z.string().min(1).max(120),
  observedAt: z.iso.datetime({ offset: true }),
});

export const publicAidBalanceSchema = z.object({
  catalogCode: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  unit: z.string().min(1).max(40),
  validatedNeed: z.number().nonnegative(),
  inTransit: z.number().nonnegative(),
  deliveredUsable: z.number().nonnegative(),
  rejected: z.number().nonnegative(),
  openGap: z.number().nonnegative(),
});

export const publicDonationFlowSchema = z.object({
  currency: z.string().length(3),
  registered: z.number().nonnegative(),
  reconciled: z.number().nonnegative(),
  allocated: z.number().nonnegative(),
  delivered: z.number().nonnegative(),
});

export const publicIntegritySchema = z.object({
  status: z.enum(["pending", "anchored"]),
  network: z.enum(["none", "solana-devnet", "solana-mainnet"]),
  merkleRoot: z.string().length(64).nullable(),
  transactionSignature: z.string().min(32).max(128).nullable(),
});

export const publicSituationReportSchema = z.object({
  schemaVersion: z.literal(1),
  incident: z.object({
    code: z.string().min(1).max(80),
    name: z.string().min(1).max(180),
    countryCode: z.string().length(2),
    dataMode: publicDataModeSchema,
    cutoffAt: z.iso.datetime({ offset: true }),
    publishedAt: z.iso.datetime({ offset: true }),
  }),
  metrics: z.array(publicMetricSchema).min(1).max(20),
  territories: z.array(publicTerritoryProfileSchema).max(100),
  updates: z.array(publicSituationUpdateSchema).max(100),
  aidBalances: z.array(publicAidBalanceSchema).max(200),
  donationFlow: publicDonationFlowSchema,
  integrity: publicIntegritySchema,
});

export type PublicSituationReportDto = z.infer<typeof publicSituationReportSchema>;
