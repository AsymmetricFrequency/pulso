import { z } from "zod";

export const actorRoleSchema = z.enum([
  "citizen",
  "field_worker",
  "coordinator",
  "professional",
  "auditor",
  "incident_admin",
]);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(180),
  type: z.enum(["community", "ngo", "government", "company", "volunteer_group", "other"]),
  externalCode: z.string().trim().max(80).nullable().default(null),
});

export const organizationSchema = createOrganizationSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  status: z.enum(["active", "suspended", "closed"]),
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const createActorSchema = z.object({
  organizationId: z.uuid().nullable().default(null),
  displayName: z.string().trim().min(2).max(120),
  role: actorRoleSchema,
  externalSubject: z.string().trim().max(180).nullable().default(null),
});

export const actorSchema = createActorSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  status: z.enum(["active", "suspended"]),
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const createTeamSchema = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(3).max(120),
});

export const teamSchema = createTeamSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const createTeamMembershipSchema = z.object({
  actorId: z.uuid(),
  responsibility: z.enum(["leader", "member", "specialist"]).default("member"),
});

export const teamMembershipSchema = createTeamMembershipSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  teamId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export const createFieldAssignmentSchema = z
  .object({
    zoneId: z.uuid(),
    teamId: z.uuid(),
    objective: z.string().trim().min(5).max(500),
    startsAt: z.iso.datetime({ offset: true }),
    dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
    clientMutationId: z.uuid(),
  })
  .refine((value) => value.dueAt === null || value.dueAt >= value.startsAt, {
    message: "dueAt must not be earlier than startsAt",
    path: ["dueAt"],
  });

export const acceptFieldAssignmentSchema = z.object({
  actorId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  clientMutationId: z.uuid(),
});

export const fieldAssignmentSchema = createFieldAssignmentSchema.extend({
  id: z.uuid(),
  incidentId: z.uuid(),
  status: z.enum(["assigned", "accepted", "in_progress", "completed", "cancelled"]),
  acceptedBy: z.uuid().nullable(),
  acceptedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.int().positive(),
});

export type OrganizationDto = z.infer<typeof organizationSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type ActorDto = z.infer<typeof actorSchema>;
export type CreateActorInput = z.infer<typeof createActorSchema>;
export type TeamDto = z.infer<typeof teamSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type TeamMembershipDto = z.infer<typeof teamMembershipSchema>;
export type CreateTeamMembershipInput = z.infer<typeof createTeamMembershipSchema>;
export type FieldAssignmentDto = z.infer<typeof fieldAssignmentSchema>;
export type CreateFieldAssignmentInput = z.infer<typeof createFieldAssignmentSchema>;
export type AcceptFieldAssignmentInput = z.infer<typeof acceptFieldAssignmentSchema>;
