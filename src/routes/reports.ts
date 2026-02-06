import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { jsPDF } from "jspdf";
import { supabase } from "../supabase";
import { ProjectsReportFiltersSchema } from "../types";

const reportsRouter = new Hono();

// Helper to format currency in FCFA
function formatFCFA(amount: number | null): string {
  if (amount === null || amount === undefined) return "0 FCFA";
  return amount.toLocaleString("fr-FR") + " FCFA";
}

// Helper to format date
function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR");
}

// Helper to translate status
function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    IN_PROGRESS: "En cours",
    COMPLETED: "Termine",
    DELAYED: "En retard",
    SUSPENDED: "Suspendu",
    BLOCKED: "Bloque",
    PENDING: "En attente",
  };
  return statusMap[status] || status;
}

// Helper to translate category
function translateCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    EQUIPMENT: "Equipement",
    PERSONNEL: "Personnel",
    MATERIALS: "Materiaux",
    SERVICES: "Services",
    OTHER: "Autre",
  };
  return categoryMap[category] || category;
}

// Helper to draw a simple table
function drawTable(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  startX: number,
  startY: number,
  colWidths: number[],
  pageWidth: number
): number {
  const lineHeight = 7;
  const cellPadding = 2;
  let y = startY;

  // Draw header background
  doc.setFillColor(100, 100, 100);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(startX, y, totalWidth, lineHeight, "F");

  // Draw header text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  let x = startX;
  headers.forEach((header, i) => {
    const width = colWidths[i] ?? 0;
    doc.text(header, x + cellPadding, y + lineHeight - cellPadding);
    x += width;
  });

  y += lineHeight;

  // Draw rows
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  rows.forEach((row, rowIndex) => {
    // Check if we need a new page
    if (y > 270) {
      doc.addPage();
      y = 20;

      // Redraw header on new page
      doc.setFillColor(100, 100, 100);
      doc.rect(startX, y, totalWidth, lineHeight, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      let headerX = startX;
      headers.forEach((header, i) => {
        const width = colWidths[i] ?? 0;
        doc.text(header, headerX + cellPadding, y + lineHeight - cellPadding);
        headerX += width;
      });
      y += lineHeight;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    // Alternate row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(startX, y, totalWidth, lineHeight, "F");
    }

    // Draw cell text
    x = startX;
    row.forEach((cell, i) => {
      const width = colWidths[i] ?? 0;
      const truncated = cell.length > Math.floor(width / 2)
        ? cell.substring(0, Math.floor(width / 2) - 3) + "..."
        : cell;
      doc.text(truncated, x + cellPadding, y + lineHeight - cellPadding);
      x += width;
    });

    y += lineHeight;
  });

  return y;
}

// GET /api/reports/projects - Generate PDF report of all projects
reportsRouter.get(
  "/projects",
  zValidator("query", ProjectsReportFiltersSchema),
  async (c) => {
    const filters = c.req.valid("query");

    // Build query
    let query = supabase.from("projects").select("*");

    if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
    if (filters.regionId) query = query.eq("region_id", filters.regionId);
    if (filters.status) query = query.eq("status", filters.status);

    query = query.order("created_at", { ascending: false });

    const { data: projects, error } = await query;

    if (error) {
      return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
    }

    // Fetch related data
    const departmentIds = [...new Set(projects.map((p: any) => p.department_id))];
    const regionIds = [...new Set(projects.map((p: any) => p.region_id))];
    const sectorIds = [...new Set(projects.map((p: any) => p.sector_id))];

    const [departmentsRes, regionsRes, sectorsRes] = await Promise.all([
      supabase.from("departments").select("id, name, code").in("id", departmentIds),
      supabase.from("regions").select("id, name, code").in("id", regionIds),
      supabase.from("sectors").select("id, name").in("id", sectorIds),
    ]);

    const departmentsMap = new Map((departmentsRes.data || []).map((d: any) => [d.id, d]));
    const regionsMap = new Map((regionsRes.data || []).map((r: any) => [r.id, r]));
    const sectorsMap = new Map((sectorsRes.data || []).map((s: any) => [s.id, s]));

    // Add relations to projects
    const projectsWithRelations = projects.map((p: any) => ({
      ...p,
      department: departmentsMap.get(p.department_id) || { id: p.department_id, name: "", code: "" },
      region: regionsMap.get(p.region_id) || { id: p.region_id, name: "", code: "" },
      sector: sectorsMap.get(p.sector_id) || { id: p.sector_id, name: "" },
    }));

    // Calculate statistics
    const totalProjects = projectsWithRelations.length;
    const totalBudget = projectsWithRelations.reduce((sum: number, p: any) => sum + (p.budget || 0), 0);
    const completedProjects = projectsWithRelations.filter((p: any) => p.status === "COMPLETED").length;
    const completionRate = totalProjects > 0
      ? Math.round((completedProjects / totalProjects) * 100)
      : 0;
    const averageProgress = totalProjects > 0
      ? Math.round(projectsWithRelations.reduce((sum: number, p: any) => sum + p.progress, 0) / totalProjects)
      : 0;

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("REPUBLIQUE DU MALI", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text("Un Peuple - Un But - Une Foi", pageWidth / 2, 27, { align: "center" });

    doc.setFontSize(14);
    doc.text("Rapport des Projets", pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date du rapport: ${formatDate(new Date())}`, pageWidth / 2, 48, { align: "center" });

    // Applied filters
    let filterText = "Filtres: ";
    if (filters.departmentId || filters.regionId || filters.status) {
      const appliedFilters: string[] = [];
      if (filters.departmentId) {
        const dept = projectsWithRelations[0]?.department?.name || filters.departmentId;
        appliedFilters.push(`Departement: ${dept}`);
      }
      if (filters.regionId) {
        const region = projectsWithRelations[0]?.region?.name || filters.regionId;
        appliedFilters.push(`Region: ${region}`);
      }
      if (filters.status) {
        appliedFilters.push(`Statut: ${translateStatus(filters.status)}`);
      }
      filterText += appliedFilters.join(", ");
    } else {
      filterText += "Aucun (tous les projets)";
    }
    doc.setFontSize(9);
    doc.text(filterText, 14, 58);

    // Summary Statistics
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Statistiques", 14, 68);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const statsY = 75;
    doc.text(`Total des projets: ${totalProjects}`, 14, statsY);
    doc.text(`Budget total: ${formatFCFA(totalBudget)}`, 14, statsY + 6);
    doc.text(`Projets termines: ${completedProjects} (${completionRate}%)`, 100, statsY);
    doc.text(`Avancement moyen: ${averageProgress}%`, 100, statsY + 6);

    // Projects Table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Liste des Projets", 14, statsY + 20);

    const headers = ["Nom", "Departement", "Region", "Budget", "Avancement", "Statut"];
    const colWidths = [45, 35, 30, 30, 20, 22];
    const rows = projectsWithRelations.map((p: any) => [
      p.name,
      p.department.name,
      p.region.name,
      formatFCFA(p.budget),
      `${p.progress}%`,
      translateStatus(p.status),
    ]);

    const tableEndY = drawTable(doc, headers, rows, 14, statsY + 26, colWidths, pageWidth);

    // Footer with page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Page ${i} / ${totalPages}`,
        pageWidth / 2,
        290,
        { align: "center" }
      );
      doc.text(
        "Rapport genere automatiquement",
        14,
        290
      );
    }

    // Return PDF
    const pdfBuffer = doc.output("arraybuffer");

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="rapport-projets.pdf"',
      },
    });
  }
);

// GET /api/reports/project/:id - Generate detailed PDF for single project
reportsRouter.get("/project/:id", async (c) => {
  const { id } = c.req.param();

  // Fetch project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return c.json({ error: { message: "Projet non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Fetch related data
  const [departmentRes, regionRes, sectorRes] = await Promise.all([
    supabase.from("departments").select("id, name, code").eq("id", project.department_id).single(),
    supabase.from("regions").select("id, name, code").eq("id", project.region_id).single(),
    supabase.from("sectors").select("id, name").eq("id", project.sector_id).single(),
  ]);

  const projectWithRelations = {
    ...project,
    department: departmentRes.data || { id: project.department_id, name: "", code: "" },
    region: regionRes.data || { id: project.region_id, name: "", code: "" },
    sector: sectorRes.data || { id: project.sector_id, name: "" },
  };

  // Fetch milestones
  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", id)
    .order("order", { ascending: true });

  // Fetch disbursements with createdBy
  const { data: disbursements } = await supabase
    .from("disbursements")
    .select("*")
    .eq("project_id", id)
    .order("date", { ascending: false });

  // Fetch users for disbursements
  const userIds = [...new Set((disbursements || []).map((d: any) => d.created_by_id))];
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email")
    .in("id", userIds);

  const usersMap = new Map((users || []).map((u: any) => [u.id, u]));

  const disbursementsWithUsers = (disbursements || []).map((d: any) => ({
    ...d,
    createdBy: usersMap.get(d.created_by_id) || { id: d.created_by_id, name: "", email: "" },
  }));

  const totalDisbursed = disbursementsWithUsers.reduce((sum: number, d: any) => sum + d.amount, 0);

  // Create PDF
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIQUE DU MALI", pageWidth / 2, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Un Peuple - Un But - Une Foi", pageWidth / 2, 27, { align: "center" });

  doc.setFontSize(14);
  doc.text("Fiche Detaillee du Projet", pageWidth / 2, 40, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Date du rapport: ${formatDate(new Date())}`, pageWidth / 2, 48, { align: "center" });

  // Project Name and Description
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(projectWithRelations.name, 14, 62);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (projectWithRelations.description) {
    const descLines = doc.splitTextToSize(projectWithRelations.description, pageWidth - 28);
    doc.text(descLines, 14, 70);
  }

  // Key Metrics Section
  let yPos = projectWithRelations.description ? 70 + (doc.splitTextToSize(projectWithRelations.description, pageWidth - 28).length * 5) + 10 : 75;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Informations Generales", 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  // Draw info grid
  const infoItems = [
    ["Departement", projectWithRelations.department.name],
    ["Region", projectWithRelations.region.name],
    ["Secteur", projectWithRelations.sector.name],
    ["Statut", translateStatus(projectWithRelations.status)],
    ["Avancement", `${projectWithRelations.progress}%`],
    ["Budget", formatFCFA(projectWithRelations.budget)],
    ["Budget planifie", formatFCFA(projectWithRelations.planned_budget)],
    ["Total decaisse", formatFCFA(totalDisbursed)],
    ["Date debut", formatDate(projectWithRelations.start_date)],
    ["Date fin", formatDate(projectWithRelations.end_date)],
  ];

  infoItems.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 14 + col * 95;
    const y = yPos + row * 7;
    doc.setFont("helvetica", "bold");
    doc.text(`${item[0]}:`, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(item[1] ?? "-", x + 40, y);
  });

  yPos += Math.ceil(infoItems.length / 2) * 7 + 10;

  // Responsible Person
  if (projectWithRelations.responsible_name || projectWithRelations.responsible_phone) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Responsable du Projet", 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (projectWithRelations.responsible_name) {
      doc.text(`Nom: ${projectWithRelations.responsible_name}`, 14, yPos);
      yPos += 6;
    }
    if (projectWithRelations.responsible_phone) {
      doc.text(`Telephone: ${projectWithRelations.responsible_phone}`, 14, yPos);
      yPos += 6;
    }
    yPos += 4;
  }

  // Milestones Table
  if (milestones && milestones.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Jalons du Projet", 14, yPos);
    yPos += 6;

    const milestoneHeaders = ["Titre", "Date prevue", "Date realisee", "Statut"];
    const milestoneColWidths = [70, 35, 35, 35];
    const milestoneRows = milestones.map((m: any) => [
      m.title,
      formatDate(m.due_date),
      formatDate(m.completed_date),
      translateStatus(m.status),
    ]);

    yPos = drawTable(doc, milestoneHeaders, milestoneRows, 14, yPos, milestoneColWidths, pageWidth);
    yPos += 10;
  }

  // Check if we need a new page for disbursements
  if (yPos > 200 && disbursementsWithUsers.length > 0) {
    doc.addPage();
    yPos = 20;
  }

  // Disbursements Table
  if (disbursementsWithUsers.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Decaissements", 14, yPos);
    yPos += 6;

    const disbHeaders = ["Date", "Categorie", "Description", "Montant"];
    const disbColWidths = [30, 30, 70, 45];
    const disbRows = disbursementsWithUsers.map((d: any) => [
      formatDate(d.date),
      translateCategory(d.category),
      d.description || "-",
      formatFCFA(d.amount),
    ]);

    yPos = drawTable(doc, disbHeaders, disbRows, 14, yPos, disbColWidths, pageWidth);

    // Total disbursed
    yPos += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total decaisse: ${formatFCFA(totalDisbursed)}`, 14, yPos);
  }

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Page ${i} / ${totalPages}`,
      pageWidth / 2,
      290,
      { align: "center" }
    );
    doc.text(
      "Rapport genere automatiquement",
      14,
      290
    );
  }

  // Return PDF
  const pdfBuffer = doc.output("arraybuffer");

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="projet-${project.id}.pdf"`,
    },
  });
});

export { reportsRouter };
