import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Seeding database...");

  // Create Regions (8 regions of Mali + Bamako)
  const regions = await Promise.all([
    prisma.region.upsert({
      where: { code: "BKO" },
      update: {},
      create: {
        name: "Bamako",
        code: "BKO",
        coordinates: JSON.stringify({ lat: 12.6392, lng: -8.0029 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "KYS" },
      update: {},
      create: {
        name: "Kayes",
        code: "KYS",
        coordinates: JSON.stringify({ lat: 14.4469, lng: -11.4414 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "KLK" },
      update: {},
      create: {
        name: "Koulikoro",
        code: "KLK",
        coordinates: JSON.stringify({ lat: 12.8628, lng: -7.5594 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "SKS" },
      update: {},
      create: {
        name: "Sikasso",
        code: "SKS",
        coordinates: JSON.stringify({ lat: 11.3176, lng: -5.6663 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "SGU" },
      update: {},
      create: {
        name: "Segou",
        code: "SGU",
        coordinates: JSON.stringify({ lat: 13.4317, lng: -6.2157 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "MPT" },
      update: {},
      create: {
        name: "Mopti",
        code: "MPT",
        coordinates: JSON.stringify({ lat: 14.4843, lng: -4.1976 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "TBK" },
      update: {},
      create: {
        name: "Tombouctou",
        code: "TBK",
        coordinates: JSON.stringify({ lat: 16.7666, lng: -3.0026 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "GAO" },
      update: {},
      create: {
        name: "Gao",
        code: "GAO",
        coordinates: JSON.stringify({ lat: 16.2666, lng: -0.0403 }),
      },
    }),
    prisma.region.upsert({
      where: { code: "KDL" },
      update: {},
      create: {
        name: "Kidal",
        code: "KDL",
        coordinates: JSON.stringify({ lat: 18.4411, lng: 1.4078 }),
      },
    }),
  ]);

  console.log(`Created ${regions.length} regions`);

  // Create Sectors (10 sectors)
  const sectors = await Promise.all([
    prisma.sector.upsert({
      where: { name: "Agriculture" },
      update: {},
      create: { name: "Agriculture", description: "Production agricole et maraichage" },
    }),
    prisma.sector.upsert({
      where: { name: "Commerce" },
      update: {},
      create: { name: "Commerce", description: "Activites commerciales et vente" },
    }),
    prisma.sector.upsert({
      where: { name: "Artisanat" },
      update: {},
      create: { name: "Artisanat", description: "Production artisanale et metiers manuels" },
    }),
    prisma.sector.upsert({
      where: { name: "Elevage" },
      update: {},
      create: { name: "Elevage", description: "Elevage de betail et volaille" },
    }),
    prisma.sector.upsert({
      where: { name: "Peche" },
      update: {},
      create: { name: "Peche", description: "Peche et aquaculture" },
    }),
    prisma.sector.upsert({
      where: { name: "Services" },
      update: {},
      create: { name: "Services", description: "Services divers" },
    }),
    prisma.sector.upsert({
      where: { name: "Technologie" },
      update: {},
      create: { name: "Technologie", description: "Technologies de l information et innovation" },
    }),
    prisma.sector.upsert({
      where: { name: "Formation" },
      update: {},
      create: { name: "Formation", description: "Formation professionnelle et education" },
    }),
    prisma.sector.upsert({
      where: { name: "Industrie" },
      update: {},
      create: { name: "Industrie", description: "Production industrielle et transformation" },
    }),
    prisma.sector.upsert({
      where: { name: "Transport" },
      update: {},
      create: { name: "Transport", description: "Transport et logistique" },
    }),
  ]);

  console.log(`Created ${sectors.length} sectors`);

  // Create Departments (8 departments)
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { code: "ONEF" },
      update: {},
      create: {
        name: "Observatoire National de l'Emploi et de la Formation",
        code: "ONEF",
        description: "Collecte et analyse des donnees sur l emploi et la formation",
      },
    }),
    prisma.department.upsert({
      where: { code: "APJE" },
      update: {},
      create: {
        name: "Agence pour la Promotion de l'Emploi des Jeunes",
        code: "APJE",
        description: "Promotion de l emploi des jeunes au Mali",
      },
    }),
    prisma.department.upsert({
      where: { code: "FIER" },
      update: {},
      create: {
        name: "Programme FIER",
        code: "FIER",
        description: "Formation, Insertion et appui a l Entrepreneuriat Rural",
      },
    }),
    prisma.department.upsert({
      where: { code: "DNEMPLOI" },
      update: {},
      create: {
        name: "Direction Nationale de l'Emploi",
        code: "DNEMPLOI",
        description: "Direction nationale en charge de la politique de l emploi",
      },
    }),
    prisma.department.upsert({
      where: { code: "ANPE" },
      update: {},
      create: {
        name: "Agence Nationale Pour l'Emploi",
        code: "ANPE",
        description: "Placement et accompagnement des demandeurs d emploi",
      },
    }),
    prisma.department.upsert({
      where: { code: "FAFPA" },
      update: {},
      create: {
        name: "Fonds d'Appui a la Formation Professionnelle et a l'Apprentissage",
        code: "FAFPA",
        description: "Financement de la formation professionnelle",
      },
    }),
    prisma.department.upsert({
      where: { code: "MINJEU" },
      update: {},
      create: {
        name: "Ministere de la Jeunesse",
        code: "MINJEU",
        description: "Ministere en charge des questions de jeunesse",
      },
    }),
    prisma.department.upsert({
      where: { code: "MINAGRI" },
      update: {},
      create: {
        name: "Ministere de l'Agriculture",
        code: "MINAGRI",
        description: "Ministere en charge de l agriculture",
      },
    }),
  ]);

  console.log(`Created ${departments.length} departments`);

  // Create Super Admin user
  const adminPassword = hashPassword("admin123");
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@gouv.ml" },
    update: {},
    create: {
      email: "admin@gouv.ml",
      password: adminPassword,
      name: "Administrateur Principal",
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Created super admin: ${superAdmin.email}`);

  // Create some department admins
  const deptAdmins = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin.onef@gouv.ml" },
      update: {},
      create: {
        email: "admin.onef@gouv.ml",
        password: hashPassword("onef123"),
        name: "Admin ONEF",
        role: "ADMIN_DEPARTMENT",
        departmentId: departments[0].id,
      },
    }),
    prisma.user.upsert({
      where: { email: "admin.apje@gouv.ml" },
      update: {},
      create: {
        email: "admin.apje@gouv.ml",
        password: hashPassword("apje123"),
        name: "Admin APJE",
        role: "ADMIN_DEPARTMENT",
        departmentId: departments[1].id,
      },
    }),
    prisma.user.upsert({
      where: { email: "ministre.jeunesse@gouv.ml" },
      update: {},
      create: {
        email: "ministre.jeunesse@gouv.ml",
        password: hashPassword("ministre123"),
        name: "Ministre de la Jeunesse",
        role: "MINISTER",
        departmentId: departments[6].id,
      },
    }),
  ]);

  console.log(`Created ${deptAdmins.length} department users`);

  // Create example projects
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        name: "Programme d'Insertion des Jeunes Diplomes",
        description: "Formation et accompagnement de 500 jeunes diplomes vers l emploi",
        departmentId: departments[1].id, // APJE
        regionId: regions[0].id, // Bamako
        sectorId: sectors[5].id, // Services
        budget: 150000000,
        startDate: new Date("2024-01-15"),
        endDate: new Date("2025-12-31"),
        progress: 45,
        status: "IN_PROGRESS",
        responsibleName: "Moussa Traore",
        responsiblePhone: "+223 76 12 34 56",
      },
    }),
    prisma.project.create({
      data: {
        name: "Formation Agricole Sikasso",
        description: "Formation de 200 agriculteurs aux techniques modernes",
        departmentId: departments[2].id, // FIER
        regionId: regions[3].id, // Sikasso
        sectorId: sectors[0].id, // Agriculture
        budget: 75000000,
        startDate: new Date("2024-03-01"),
        endDate: new Date("2024-12-31"),
        progress: 70,
        status: "IN_PROGRESS",
        responsibleName: "Aminata Coulibaly",
        responsiblePhone: "+223 66 78 90 12",
      },
    }),
    prisma.project.create({
      data: {
        name: "Entrepreneuriat Numerique",
        description: "Incubation de 50 startups technologiques",
        departmentId: departments[0].id, // ONEF
        regionId: regions[0].id, // Bamako
        sectorId: sectors[6].id, // Technologie
        budget: 200000000,
        startDate: new Date("2023-06-01"),
        endDate: new Date("2024-06-01"),
        progress: 100,
        status: "COMPLETED",
        responsibleName: "Ibrahim Keita",
        responsiblePhone: "+223 70 11 22 33",
      },
    }),
    prisma.project.create({
      data: {
        name: "Artisanat Feminin Mopti",
        description: "Soutien a 150 artisanes de Mopti",
        departmentId: departments[5].id, // FAFPA
        regionId: regions[5].id, // Mopti
        sectorId: sectors[2].id, // Artisanat
        budget: 45000000,
        startDate: new Date("2024-02-01"),
        endDate: new Date("2024-08-31"),
        progress: 30,
        status: "DELAYED",
        responsibleName: "Fatoumata Diallo",
        responsiblePhone: "+223 65 44 55 66",
      },
    }),
    prisma.project.create({
      data: {
        name: "Formation Transport Kayes",
        description: "Formation de chauffeurs professionnels",
        departmentId: departments[4].id, // ANPE
        regionId: regions[1].id, // Kayes
        sectorId: sectors[9].id, // Transport
        budget: 30000000,
        startDate: new Date("2024-04-01"),
        endDate: new Date("2024-10-31"),
        progress: 60,
        status: "IN_PROGRESS",
        responsibleName: "Oumar Diarra",
        responsiblePhone: "+223 77 88 99 00",
      },
    }),
  ]);

  console.log(`Created ${projects.length} projects`);

  // Create example beneficiaries
  const beneficiaries = await Promise.all([
    // Project 1 - APJE Bamako
    prisma.beneficiary.create({
      data: {
        firstName: "Adama",
        lastName: "Sangare",
        gender: "MALE",
        age: 26,
        phone: "+223 76 11 11 11",
        regionId: regions[0].id,
        sectorId: sectors[5].id,
        projectId: projects[0].id,
        accompanimentStatus: "ACTIVE",
      },
    }),
    prisma.beneficiary.create({
      data: {
        firstName: "Mariam",
        lastName: "Diallo",
        gender: "FEMALE",
        age: 24,
        phone: "+223 66 22 22 22",
        regionId: regions[0].id,
        sectorId: sectors[5].id,
        projectId: projects[0].id,
        accompanimentStatus: "ACTIVE",
      },
    }),
    // Project 2 - FIER Sikasso
    prisma.beneficiary.create({
      data: {
        firstName: "Sekou",
        lastName: "Traore",
        gender: "MALE",
        age: 35,
        phone: "+223 70 33 33 33",
        regionId: regions[3].id,
        sectorId: sectors[0].id,
        projectId: projects[1].id,
        accompanimentStatus: "ACTIVE",
      },
    }),
    prisma.beneficiary.create({
      data: {
        firstName: "Kadiatou",
        lastName: "Keita",
        gender: "FEMALE",
        age: 28,
        phone: "+223 65 44 44 44",
        regionId: regions[3].id,
        sectorId: sectors[0].id,
        projectId: projects[1].id,
        accompanimentStatus: "COMPLETED",
      },
    }),
    // Project 3 - ONEF Technologie
    prisma.beneficiary.create({
      data: {
        firstName: "Boubacar",
        lastName: "Kone",
        gender: "MALE",
        age: 29,
        phone: "+223 77 55 55 55",
        regionId: regions[0].id,
        sectorId: sectors[6].id,
        projectId: projects[2].id,
        accompanimentStatus: "COMPLETED",
      },
    }),
    // Project 4 - Artisanat Mopti
    prisma.beneficiary.create({
      data: {
        firstName: "Aissata",
        lastName: "Cisse",
        gender: "FEMALE",
        age: 32,
        phone: "+223 66 66 66 66",
        regionId: regions[5].id,
        sectorId: sectors[2].id,
        projectId: projects[3].id,
        accompanimentStatus: "ACTIVE",
      },
    }),
    prisma.beneficiary.create({
      data: {
        firstName: "Oumou",
        lastName: "Ba",
        gender: "FEMALE",
        age: 27,
        phone: "+223 70 77 77 77",
        regionId: regions[5].id,
        sectorId: sectors[2].id,
        projectId: projects[3].id,
        accompanimentStatus: "SUSPENDED",
      },
    }),
    // Project 5 - Transport Kayes
    prisma.beneficiary.create({
      data: {
        firstName: "Mamadou",
        lastName: "Sissoko",
        gender: "MALE",
        age: 31,
        phone: "+223 76 88 88 88",
        regionId: regions[1].id,
        sectorId: sectors[9].id,
        projectId: projects[4].id,
        accompanimentStatus: "ACTIVE",
      },
    }),
  ]);

  console.log(`Created ${beneficiaries.length} beneficiaries`);

  // Create example news
  const news = await Promise.all([
    prisma.news.create({
      data: {
        title: "Lancement du programme d'insertion 2024",
        content:
          "L'APJE a officiellement lance son programme d'insertion des jeunes diplomes pour l'annee 2024. Plus de 500 jeunes beneficieront de formations et d'accompagnement personnalise.",
        departmentId: departments[1].id,
        type: "PROJECT",
        publishedAt: new Date("2024-01-20"),
      },
    }),
    prisma.news.create({
      data: {
        title: "Formation reussie a Sikasso",
        content:
          "140 agriculteurs ont termine avec succes leur formation aux techniques agricoles modernes dans le cadre du programme FIER.",
        departmentId: departments[2].id,
        type: "TRAINING",
        publishedAt: new Date("2024-06-15"),
      },
    }),
    prisma.news.create({
      data: {
        title: "Journee de l'entrepreneuriat numerique",
        content:
          "L'ONEF organise une journee speciale dediee a l'entrepreneuriat numerique. Tous les jeunes porteurs de projets sont invites a participer.",
        departmentId: departments[0].id,
        type: "EVENT",
        publishedAt: new Date("2024-07-01"),
      },
    }),
  ]);

  console.log(`Created ${news.length} news articles`);

  // Create example alerts
  const alerts = await Promise.all([
    prisma.alert.create({
      data: {
        title: "Rapport mensuel requis",
        message:
          "Veuillez soumettre votre rapport mensuel d'activites avant le 5 du mois prochain.",
        fromUserId: superAdmin.id,
        toDepartmentId: null, // All departments
        type: "REPORT_REQUEST",
      },
    }),
    prisma.alert.create({
      data: {
        title: "Projet en retard - Action requise",
        message:
          "Le projet Artisanat Feminin Mopti presente un retard significatif. Merci de fournir un plan de rattrapage.",
        fromUserId: superAdmin.id,
        toDepartmentId: departments[5].id, // FAFPA
        type: "URGENT",
      },
    }),
  ]);

  console.log(`Created ${alerts.length} alerts`);

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
