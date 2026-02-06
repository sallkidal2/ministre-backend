import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

const DEFAULT_PASSWORD = "Mali2024!";

async function main() {
  console.log("Setting up all departments and user accounts...\n");

  // ==================== DEPARTMENTS ====================
  console.log("Creating departments...");

  const departmentsData = [
    {
      code: "MENEFP",
      name: "Ministere de l'Entrepreneuriat National, de l'Emploi et de la Formation Professionnelle",
      description: "Ministere de tutelle",
    },
    {
      code: "ONEF",
      name: "Observatoire National de l'Emploi et de la Formation",
      description: "Collecte et analyse des donnees sur l'emploi et la formation",
    },
    {
      code: "APJE",
      name: "Agence pour la Promotion de l'Emploi des Jeunes",
      description: "Promotion de l'emploi des jeunes au Mali",
    },
    {
      code: "FIER",
      name: "Programme FIER",
      description: "Formation, Insertion et appui a l'Entrepreneuriat Rural",
    },
    {
      code: "DNEMPLOI",
      name: "Direction Nationale de l'Emploi",
      description: "Direction nationale en charge de la politique de l'emploi",
    },
    {
      code: "ANPE",
      name: "Agence Nationale Pour l'Emploi",
      description: "Placement et accompagnement des demandeurs d'emploi",
    },
    {
      code: "FAFPA",
      name: "Fonds d'Appui a la Formation Professionnelle et a l'Apprentissage",
      description: "Financement de la formation professionnelle",
    },
    {
      code: "PROCEJ",
      name: "Projet de Promotion de l'Emploi des Jeunes",
      description: "Projet d'insertion professionnelle des jeunes",
    },
    {
      code: "FARE",
      name: "Fonds Auto Renouvelable pour l'Emploi",
      description: "Financement des projets d'auto-emploi",
    },
    {
      code: "CNPM",
      name: "Conseil National du Patronat du Mali",
      description: "Representation du secteur prive",
    },
    {
      code: "MINJEU",
      name: "Ministere de la Jeunesse",
      description: "Ministere en charge des questions de jeunesse",
    },
    {
      code: "MINAGRI",
      name: "Ministere de l'Agriculture",
      description: "Ministere en charge de l'agriculture",
    },
  ];

  const departments: Record<string, { id: string; name: string; code: string }> = {};

  for (const dept of departmentsData) {
    const created = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, description: dept.description },
      create: dept,
    });
    departments[dept.code] = created;
    console.log(`  ✓ ${dept.code}: ${dept.name}`);
  }

  console.log(`\nCreated/Updated ${Object.keys(departments).length} departments\n`);

  // ==================== HIGH-LEVEL USERS ====================
  console.log("Creating high-level users...");

  const hashedPassword = hashPassword(DEFAULT_PASSWORD);

  const highLevelUsers = [
    {
      email: "superadmin@mali.gov.ml",
      name: "Super Administrateur",
      role: "SUPER_ADMIN",
      departmentCode: null,
    },
    {
      email: "ministre@mali.gov.ml",
      name: "Ministre MENEFP",
      role: "MINISTER",
      departmentCode: "MENEFP",
    },
    {
      email: "primature@mali.gov.ml",
      name: "Cabinet Primature",
      role: "PRIMATURE",
      departmentCode: null,
    },
    {
      email: "presidence@mali.gov.ml",
      name: "Cabinet Presidence",
      role: "PRESIDENCY",
      departmentCode: null,
    },
    {
      email: "sg.menefp@mali.gov.ml",
      name: "Secretaire General MENEFP",
      role: "MINISTER",
      departmentCode: "MENEFP",
    },
  ];

  for (const user of highLevelUsers) {
    const departmentId = user.departmentCode ? departments[user.departmentCode]?.id : null;

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        isActive: true,
        departmentId
      },
      create: {
        email: user.email,
        password: hashedPassword,
        name: user.name,
        role: user.role,
        isActive: true,
        departmentId,
      },
    });
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  // ==================== DEPARTMENT ADMINS ====================
  console.log("\nCreating department administrators...");

  const departmentAdmins = [
    { email: "admin.onef@mali.gov.ml", name: "Directeur ONEF", departmentCode: "ONEF" },
    { email: "admin.apje@mali.gov.ml", name: "Directeur APJE", departmentCode: "APJE" },
    { email: "admin.fier@mali.gov.ml", name: "Coordinateur FIER", departmentCode: "FIER" },
    { email: "admin.dnemploi@mali.gov.ml", name: "Directeur National de l'Emploi", departmentCode: "DNEMPLOI" },
    { email: "admin.anpe@mali.gov.ml", name: "Directeur General ANPE", departmentCode: "ANPE" },
    { email: "admin.fafpa@mali.gov.ml", name: "Directeur FAFPA", departmentCode: "FAFPA" },
    { email: "admin.procej@mali.gov.ml", name: "Coordinateur PROCEJ", departmentCode: "PROCEJ" },
    { email: "admin.fare@mali.gov.ml", name: "Directeur FARE", departmentCode: "FARE" },
    { email: "admin.cnpm@mali.gov.ml", name: "Secretaire General CNPM", departmentCode: "CNPM" },
    { email: "admin.minjeu@mali.gov.ml", name: "Directeur Jeunesse", departmentCode: "MINJEU" },
    { email: "admin.minagri@mali.gov.ml", name: "Directeur Agriculture", departmentCode: "MINAGRI" },
  ];

  for (const admin of departmentAdmins) {
    const departmentId = departments[admin.departmentCode]?.id;

    if (!departmentId) {
      console.log(`  ✗ Skipping ${admin.email}: department ${admin.departmentCode} not found`);
      continue;
    }

    await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        name: admin.name,
        role: "ADMIN_DEPARTMENT",
        isActive: true,
        departmentId
      },
      create: {
        email: admin.email,
        password: hashedPassword,
        name: admin.name,
        role: "ADMIN_DEPARTMENT",
        isActive: true,
        departmentId,
      },
    });
    console.log(`  ✓ ${admin.email} (${admin.departmentCode})`);
  }

  // ==================== SUMMARY ====================
  console.log("\n" + "=".repeat(60));
  console.log("SETUP COMPLETE!");
  console.log("=".repeat(60));

  console.log("\n📋 DEPARTMENTS:");
  for (const [code, dept] of Object.entries(departments)) {
    console.log(`   ${code}: ${dept.name}`);
  }

  console.log("\n👤 USER ACCOUNTS:");
  console.log("   Password for all accounts: Mali2024!");
  console.log("\n   High-Level:");
  for (const user of highLevelUsers) {
    console.log(`   - ${user.email} (${user.role})`);
  }
  console.log("\n   Department Admins:");
  for (const admin of departmentAdmins) {
    console.log(`   - ${admin.email} (${admin.departmentCode})`);
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .catch((e) => {
    console.error("Setup error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
