import type {
  IncidentRepository,
  MaterialSupplierRepository,
  ReconstructionProgressRepository,
  WorkforceProfileRepository,
} from "@pulso/domain";
import type { ReconstructionProgressDto } from "@pulso/schemas";

export class MemoryReconstructionProgressRepository implements ReconstructionProgressRepository {
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly suppliers: MaterialSupplierRepository,
    private readonly workforce: WorkforceProfileRepository,
  ) {}

  async getByIncidentCode(incidentCode: string): Promise<ReconstructionProgressDto> {
    const incident = await this.incidents.findByCode(incidentCode);
    if (!incident) {
      return {
        incidentCode,
        generatedAt: new Date().toISOString(),
        materials: [],
        territories: [],
        totals: {
          casesTotal: 0,
          casesWithMaterialsAssigned: 0,
          suppliersRegistered: 0,
          workforceHeadcount: 0,
          donationsLinkedToCases: 0,
        },
      };
    }
    const [supplierList, workforceList] = await Promise.all([
      this.suppliers.listPublicByIncident(incident.id),
      this.workforce.listPublicByIncident(incident.id),
    ]);
    const workforceHeadcount = workforceList.reduce((sum, profile) => sum + profile.headcount, 0);
    return {
      incidentCode,
      generatedAt: new Date().toISOString(),
      // rapid_assessments/disaster_cases have no memory-mode backing yet — this driver is for
      // local dev without Postgres, so material/case aggregates stay honestly empty here.
      materials: [],
      territories: [],
      totals: {
        casesTotal: 0,
        casesWithMaterialsAssigned: 0,
        suppliersRegistered: supplierList.length,
        workforceHeadcount,
        donationsLinkedToCases: 0,
      },
    };
  }
}
