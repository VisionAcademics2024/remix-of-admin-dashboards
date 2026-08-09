import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const packageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().or(z.literal("")),
  total_sessions: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0).optional().nullable(),
  validity_days: z.coerce.number().int().min(0).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("packages")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getPackage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: pkg, error } = await context.supabase
      .from("packages")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return pkg;
  });

export const createPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => packageSchema.parse(data))
  .handler(async ({ context, data }) => {
    const payload = {
      ...data,
      description: data.description || null,
      price: data.price ?? null,
      validity_days: data.validity_days ?? null,
    };
    const { data: pkg, error } = await context.supabase.from("packages").insert(payload).select().single();
    if (error) throw error;
    return pkg;
  });

export const updatePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        ...packageSchema.shape,
      })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload = {
      ...rest,
      description: rest.description || null,
      price: rest.price ?? null,
      validity_days: rest.validity_days ?? null,
    };
    const { data: pkg, error } = await context.supabase
      .from("packages")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return pkg;
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("packages").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
