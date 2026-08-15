import { z } from "zod";

// Read-only aggregate view — never exposes an individual case, household, or address. Ties
// together disaster_cases (housing_damage), supply_needs, material_allocations, aid_deliveries
// and donation_commitments into one "how is reconstruction going" snapshot.
export const reconstructionMaterialProgressSchema = z.object({
  catalogItemCode: z.string(),
  catalogItemName: z.string(),
  category: z.string(),
  unit: z.string(),
  quantityNeeded: z.number().nonnegative(),
  quantityDelivered: z.number().nonnegative(),
});

export const reconstructionTerritoryProgressSchema = z.object({
  territoryCode: z.string(),
  territoryName: z.string(),
  casesTotal: z.number().int().nonnegative(),
  casesWithMaterialsAssigned: z.number().int().nonnegative(),
  suppliersRegistered: z.number().int().nonnegative(),
  workforceHeadcount: z.number().int().nonnegative(),
});

export const reconstructionProgressSchema = z.object({
  incidentCode: z.string(),
  generatedAt: z.iso.datetime({ offset: true }),
  materials: z.array(reconstructionMaterialProgressSchema),
  territories: z.array(reconstructionTerritoryProgressSchema),
  totals: z.object({
    casesTotal: z.number().int().nonnegative(),
    casesWithMaterialsAssigned: z.number().int().nonnegative(),
    suppliersRegistered: z.number().int().nonnegative(),
    workforceHeadcount: z.number().int().nonnegative(),
    donationsLinkedToCases: z.number().int().nonnegative(),
  }),
});

export type ReconstructionMaterialProgressDto = z.infer<
  typeof reconstructionMaterialProgressSchema
>;
export type ReconstructionTerritoryProgressDto = z.infer<
  typeof reconstructionTerritoryProgressSchema
>;
export type ReconstructionProgressDto = z.infer<typeof reconstructionProgressSchema>;
