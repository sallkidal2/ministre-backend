import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { supabase } from "../supabase";
import { CreateRegionSchema, type Region } from "../types";
import { getAuthUser } from "./auth";

const regionsRouter = new Hono();

// GET /api/regions
regionsRouter.get("/", async (c) => {
  const { data: regions, error } = await supabase
    .from("regions")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Region[] = regions.map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    coordinates: r.coordinates,
  }));

  return c.json({ data });
});

// GET /api/regions/:id
regionsRouter.get("/:id", async (c) => {
  const { id } = c.req.param();

  const { data: region, error } = await supabase
    .from("regions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !region) {
    return c.json({ error: { message: "Region non trouvee", code: "NOT_FOUND" } }, 404);
  }

  // Get counts for related entities
  const [projectsCount, beneficiariesCount] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("region_id", id),
    supabase.from("beneficiaries").select("id", { count: "exact", head: true }).eq("region_id", id),
  ]);

  const data = {
    id: region.id,
    name: region.name,
    code: region.code,
    coordinates: region.coordinates,
    _count: {
      projects: projectsCount.count || 0,
      beneficiaries: beneficiariesCount.count || 0,
    },
  };

  return c.json({ data });
});

// POST /api/regions (super admin only)
regionsRouter.post("/", zValidator("json", CreateRegionSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user || user.role !== "SUPER_ADMIN") {
    return c.json({ error: { message: "Acces non autorise", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");

  // Check if code or name already exists
  const { data: existingByCode } = await supabase
    .from("regions")
    .select("id")
    .eq("code", body.code)
    .single();

  const { data: existingByName } = await supabase
    .from("regions")
    .select("id")
    .eq("name", body.name)
    .single();

  if (existingByCode || existingByName) {
    return c.json({ error: { message: "Cette region existe deja", code: "DUPLICATE" } }, 400);
  }

  const newRegion = {
    id: createId(),
    name: body.name,
    code: body.code,
    coordinates: body.coordinates,
  };

  const { data: region, error } = await supabase
    .from("regions")
    .insert(newRegion)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: "DB_ERROR" } }, 500);
  }

  const data: Region = {
    id: region.id,
    name: region.name,
    code: region.code,
    coordinates: region.coordinates,
  };

  return c.json({ data }, 201);
});

export { regionsRouter };
