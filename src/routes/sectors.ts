import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import { CreateSectorSchema, type Sector } from "../types";
import { getAuthUser } from "./auth";

const sectorsRouter = new Hono();

// GET /api/sectors
sectorsRouter.get("/", async (c) => {
  const { data: sectors, error } = await supabase
    .from("sectors")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Sector[] = sectors.map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));

  return c.json({ data });
});

// GET /api/sectors/:id
sectorsRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: sector, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !sector) {
    return c.json({ error: { message: "Secteur non trouve", code: "NOT_FOUND" } }, 404);
  }

  // Get counts for related entities
  const [projectsCount, beneficiariesCount] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("sector_id", id),
    supabase.from("beneficiaries").select("id", { count: "exact", head: true }).eq("sector_id", id),
  ]);

  const data = {
    id: sector.id,
    name: sector.name,
    description: sector.description,
    _count: {
      projects: projectsCount.count || 0,
      beneficiaries: beneficiariesCount.count || 0,
    },
  };

  return c.json({ data });
});

// POST /api/sectors (super admin only)
sectorsRouter.post("/", zValidator("json", CreateSectorSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user || user.role !== "SUPER_ADMIN") {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");

  // Check if name already exists
  const { data: existing } = await supabase
    .from("sectors")
    .select("id")
    .eq("name", body.name)
    .single();

  if (existing) {
    return c.json({ error: { message: "Ce secteur existe deja", code: "DUPLICATE" } }, 400);
  }

  const newSector = {
    id: createId(),
    name: body.name,
    description: body.description,
  };

  const { data: sector, error } = await supabase
    .from("sectors")
    .insert(newSector)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Sector = {
    id: sector.id,
    name: sector.name,
    description: sector.description,
  };

  return c.json({ data }, 201);
});

export { sectorsRouter };
