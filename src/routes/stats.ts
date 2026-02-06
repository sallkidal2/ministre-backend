import { Hono } from "hono";
import { supabase } from "../supabase";
import type {
  OverviewStats,
  RegionStats,
  DepartmentStats,
  SectorStats,
} from "../types";

const statsRouter = new Hono();

// GET /api/stats/overview
statsRouter.get("/overview", async (c) => {
  // Fetch projects with needed fields
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("status, progress, budget");

  if (projectsError) {
    return c.json({ error: { message: projectsError.message } }, 500);
  }

  // Fetch beneficiaries with gender
  const { data: beneficiaries, error: beneficiariesError } = await supabase
    .from("beneficiaries")
    .select("gender");

  if (beneficiariesError) {
    return c.json({ error: { message: beneficiariesError.message } }, 500);
  }

  const totalProjects = projects?.length ?? 0;
  const totalBeneficiaries = beneficiaries?.length ?? 0;

  const projectsByStatus = {
    PENDING_VALIDATION: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    DELAYED: 0,
    SUSPENDED: 0,
    BLOCKED: 0,
  };

  let totalBudget = 0;
  let totalProgress = 0;

  for (const project of projects ?? []) {
    if (project.status in projectsByStatus) {
      projectsByStatus[project.status as keyof typeof projectsByStatus]++;
    }
    totalBudget += project.budget ?? 0;
    totalProgress += project.progress ?? 0;
  }

  const beneficiariesByGender = {
    MALE: 0,
    FEMALE: 0,
  };

  for (const beneficiary of beneficiaries ?? []) {
    if (beneficiary.gender === "MALE") {
      beneficiariesByGender.MALE++;
    } else if (beneficiary.gender === "FEMALE") {
      beneficiariesByGender.FEMALE++;
    }
  }

  const averageProgress = totalProjects > 0 ? Math.round(totalProgress / totalProjects) : 0;

  const data: OverviewStats = {
    totalProjects,
    totalBeneficiaries,
    totalBudget,
    projectsByStatus,
    beneficiariesByGender,
    averageProgress,
  };

  return c.json({ data });
});

// GET /api/stats/by-region
statsRouter.get("/by-region", async (c) => {
  // Fetch all regions
  const { data: regions, error: regionsError } = await supabase
    .from("regions")
    .select("id, name, code");

  if (regionsError) {
    return c.json({ error: { message: regionsError.message } }, 500);
  }

  // Fetch all projects with region_id
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("region_id, budget, progress");

  if (projectsError) {
    return c.json({ error: { message: projectsError.message } }, 500);
  }

  // Fetch all beneficiaries with region_id
  const { data: beneficiaries, error: beneficiariesError } = await supabase
    .from("beneficiaries")
    .select("region_id");

  if (beneficiariesError) {
    return c.json({ error: { message: beneficiariesError.message } }, 500);
  }

  // Group projects and beneficiaries by region
  const projectsByRegion = new Map<string, typeof projects>();
  const beneficiariesByRegion = new Map<string, number>();

  for (const project of projects ?? []) {
    const regionId = project.region_id;
    if (!projectsByRegion.has(regionId)) {
      projectsByRegion.set(regionId, []);
    }
    projectsByRegion.get(regionId)!.push(project);
  }

  for (const beneficiary of beneficiaries ?? []) {
    const regionId = beneficiary.region_id;
    beneficiariesByRegion.set(regionId, (beneficiariesByRegion.get(regionId) ?? 0) + 1);
  }

  const data: RegionStats[] = (regions ?? []).map((region) => {
    const regionProjects = projectsByRegion.get(region.id) ?? [];
    const totalBudget = regionProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
    const totalProgress = regionProjects.reduce((sum, p) => sum + (p.progress ?? 0), 0);
    const averageProgress = regionProjects.length > 0
      ? Math.round(totalProgress / regionProjects.length)
      : 0;

    return {
      regionId: region.id,
      regionName: region.name,
      regionCode: region.code,
      projectCount: regionProjects.length,
      beneficiaryCount: beneficiariesByRegion.get(region.id) ?? 0,
      totalBudget,
      averageProgress,
    };
  });

  return c.json({ data });
});

// GET /api/stats/by-department
statsRouter.get("/by-department", async (c) => {
  // Fetch all departments
  const { data: departments, error: departmentsError } = await supabase
    .from("departments")
    .select("id, name, code");

  if (departmentsError) {
    return c.json({ error: { message: departmentsError.message } }, 500);
  }

  // Fetch all projects with department_id
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, department_id, budget, progress");

  if (projectsError) {
    return c.json({ error: { message: projectsError.message } }, 500);
  }

  // Fetch all beneficiaries with project_id
  const { data: beneficiaries, error: beneficiariesError } = await supabase
    .from("beneficiaries")
    .select("project_id");

  if (beneficiariesError) {
    return c.json({ error: { message: beneficiariesError.message } }, 500);
  }

  // Create a map of project_id to department_id
  const projectToDepartment = new Map<string, string>();
  for (const project of projects ?? []) {
    projectToDepartment.set(project.id, project.department_id);
  }

  // Group projects by department
  const projectsByDepartment = new Map<string, typeof projects>();
  for (const project of projects ?? []) {
    const deptId = project.department_id;
    if (!projectsByDepartment.has(deptId)) {
      projectsByDepartment.set(deptId, []);
    }
    projectsByDepartment.get(deptId)!.push(project);
  }

  // Count beneficiaries by department (through their project)
  const beneficiariesByDepartment = new Map<string, number>();
  for (const beneficiary of beneficiaries ?? []) {
    const deptId = projectToDepartment.get(beneficiary.project_id);
    if (deptId) {
      beneficiariesByDepartment.set(deptId, (beneficiariesByDepartment.get(deptId) ?? 0) + 1);
    }
  }

  const data: DepartmentStats[] = (departments ?? []).map((dept) => {
    const deptProjects = projectsByDepartment.get(dept.id) ?? [];
    const totalBudget = deptProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
    const totalProgress = deptProjects.reduce((sum, p) => sum + (p.progress ?? 0), 0);
    const averageProgress = deptProjects.length > 0
      ? Math.round(totalProgress / deptProjects.length)
      : 0;

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      departmentCode: dept.code,
      projectCount: deptProjects.length,
      beneficiaryCount: beneficiariesByDepartment.get(dept.id) ?? 0,
      totalBudget,
      averageProgress,
    };
  });

  return c.json({ data });
});

// GET /api/stats/by-sector
statsRouter.get("/by-sector", async (c) => {
  // Fetch all sectors
  const { data: sectors, error: sectorsError } = await supabase
    .from("sectors")
    .select("id, name");

  if (sectorsError) {
    return c.json({ error: { message: sectorsError.message } }, 500);
  }

  // Fetch all projects with sector_id
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("sector_id, budget");

  if (projectsError) {
    return c.json({ error: { message: projectsError.message } }, 500);
  }

  // Fetch all beneficiaries with sector_id
  const { data: beneficiaries, error: beneficiariesError } = await supabase
    .from("beneficiaries")
    .select("sector_id");

  if (beneficiariesError) {
    return c.json({ error: { message: beneficiariesError.message } }, 500);
  }

  // Group projects and beneficiaries by sector
  const projectsBySector = new Map<string, typeof projects>();
  const beneficiariesBySector = new Map<string, number>();

  for (const project of projects ?? []) {
    const sectorId = project.sector_id;
    if (!projectsBySector.has(sectorId)) {
      projectsBySector.set(sectorId, []);
    }
    projectsBySector.get(sectorId)!.push(project);
  }

  for (const beneficiary of beneficiaries ?? []) {
    const sectorId = beneficiary.sector_id;
    beneficiariesBySector.set(sectorId, (beneficiariesBySector.get(sectorId) ?? 0) + 1);
  }

  const data: SectorStats[] = (sectors ?? []).map((sector) => {
    const sectorProjects = projectsBySector.get(sector.id) ?? [];
    const totalBudget = sectorProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

    return {
      sectorId: sector.id,
      sectorName: sector.name,
      projectCount: sectorProjects.length,
      beneficiaryCount: beneficiariesBySector.get(sector.id) ?? 0,
      totalBudget,
    };
  });

  return c.json({ data });
});

export { statsRouter };
