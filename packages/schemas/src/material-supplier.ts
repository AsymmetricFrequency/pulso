import { z } from "zod";
import { pointGeometrySchema } from "./community-report.js";

export const supplierVerificationLevelSchema = z.enum(["reported", "corroborated", "verified"]);
export const supplierOfferStatusSchema = z.enum(["available", "limited", "unavailable"]);

export const createSupplierCatalogOfferSchema = z.object({
  catalogItemCode: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().nonnegative().nullable().default(null),
  currency: z.string().trim().length(3).nullable().default(null),
  availableQuantity: z.number().nonnegative().nullable().default(null),
});

// Anyone can register — same trust posture as a community report: published immediately as
// unverified ("reported"), corroborated/verified later by operations or repeat confirmation.
export const createMaterialSupplierSchema = z.object({
  clientMutationId: z.uuid(),
  name: z.string().trim().min(2).max(180),
  location: pointGeometrySchema,
  address: z.string().trim().max(300).nullable().default(null),
  publicContact: z.string().trim().max(160).nullable().default(null),
  offers: z.array(createSupplierCatalogOfferSchema).min(1).max(50),
});

export const publicSupplierOfferSchema = z.object({
  catalogItemCode: z.string(),
  catalogItemName: z.string(),
  unit: z.string(),
  unitPrice: z.number().nullable(),
  currency: z.string().nullable(),
  availableQuantity: z.number().nullable(),
  status: supplierOfferStatusSchema,
});

export const publicMaterialSupplierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  location: pointGeometrySchema,
  address: z.string().nullable(),
  publicContact: z.string().nullable(),
  verificationLevel: supplierVerificationLevelSchema,
  offers: z.array(publicSupplierOfferSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export type SupplierVerificationLevel = z.infer<typeof supplierVerificationLevelSchema>;
export type SupplierOfferStatus = z.infer<typeof supplierOfferStatusSchema>;
export type CreateSupplierCatalogOfferInput = z.infer<typeof createSupplierCatalogOfferSchema>;
export type CreateMaterialSupplierInput = z.infer<typeof createMaterialSupplierSchema>;
export type PublicSupplierOfferDto = z.infer<typeof publicSupplierOfferSchema>;
export type PublicMaterialSupplierDto = z.infer<typeof publicMaterialSupplierSchema>;
