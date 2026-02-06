import { prisma } from '../src/db';
import { createHash } from 'crypto';

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

const departments = [
  { id: "cml6g5zq8000qois26dlyk0sj", name: "ANPE", code: "ANPE" },
  { id: "cml6g5zoz000lois2i92k0j9h", name: "APJE", code: "APJE" },
  { id: "cml6g5zq0000pois2hqquvqmd", name: "Direction Nationale de l'Emploi", code: "DNEMPLOI" },
  { id: "cml6g5zp8000mois2x9jueob6", name: "FAFPA", code: "FAFPA" },
  { id: "cml6g5zpt000oois22ssfafsk", name: "Ministere de l'Agriculture", code: "MINAGRI" },
  { id: "cml6g5zpm000nois2q9ez0jf0", name: "Ministere de la Jeunesse", code: "MINJEU" },
  { id: "cml6g5zos000jois2wtlad0e2", name: "ONEF", code: "ONEF" },
  { id: "cml6g5zos000kois2pqgr1f2w", name: "Programme FIER", code: "FIER" },
];

interface UserData {
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'MINISTER' | 'PRIMATURE' | 'PRESIDENCY' | 'ADMIN_DEPARTMENT';
  departmentId: string | null;
}

async function createUsers() {
  const defaultPassword = hashPassword('Mali2024!');

  // High-level users
  const highLevelUsers: UserData[] = [
    { email: 'superadmin@mali.gov.ml', name: 'Super Administrateur', role: 'SUPER_ADMIN', departmentId: null },
    { email: 'ministre@mali.gov.ml', name: 'Ministre de l\'Emploi', role: 'MINISTER', departmentId: null },
    { email: 'primature@mali.gov.ml', name: 'Cabinet Primature', role: 'PRIMATURE', departmentId: null },
    { email: 'presidence@mali.gov.ml', name: 'Cabinet Presidence', role: 'PRESIDENCY', departmentId: null },
  ];

  // Department admins
  const departmentAdmins: UserData[] = departments.map(dept => ({
    email: `admin.${dept.code.toLowerCase()}@mali.gov.ml`,
    name: `Admin ${dept.name}`,
    role: 'ADMIN_DEPARTMENT' as const,
    departmentId: dept.id,
  }));

  const allUsers = [...highLevelUsers, ...departmentAdmins];

  console.log('Creating users...\n');

  for (const userData of allUsers) {
    try {
      const existing = await prisma.user.findUnique({ where: { email: userData.email } });

      if (existing) {
        console.log(`[SKIP] ${userData.email} - deja existant`);
        continue;
      }

      await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          role: userData.role,
          isActive: true,
          password: defaultPassword,
          ...(userData.departmentId ? { department: { connect: { id: userData.departmentId } } } : {}),
        },
      });

      console.log(`[OK] ${userData.email} - ${userData.role}`);
    } catch (error) {
      console.error(`[ERROR] ${userData.email}:`, error);
    }
  }

  console.log('\n--- Resume des comptes crees ---');
  console.log('Mot de passe par defaut: Mali2024!');
  console.log('\nComptes de haut niveau:');
  highLevelUsers.forEach(u => console.log(`  - ${u.email} (${u.role})`));
  console.log('\nComptes departementaux:');
  departmentAdmins.forEach(u => console.log(`  - ${u.email}`));
}

createUsers()
  .then(() => {
    console.log('\nTermine!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erreur:', err);
    process.exit(1);
  });
