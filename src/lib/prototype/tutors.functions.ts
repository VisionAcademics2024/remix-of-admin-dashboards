import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tutorSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  subjects: z.array(z.string()).default([]),
  notes: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const listTutors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("proto_tutors")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getTutor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: tutor, error } = await context.supabase
      .from("proto_tutors")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return tutor;
  });

export const createTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => tutorSchema.parse(data))
  .handler(async ({ context, data }) => {
    const payload = {
      ...data,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    };
    const { data: tutor, error } = await context.supabase
      .from("proto_tutors")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return tutor;
  });

export const updateTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        ...tutorSchema.shape,
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload = {
      ...rest,
      email: rest.email || null,
      phone: rest.phone || null,
      notes: rest.notes || null,
    };
    const { data: tutor, error } = await context.supabase
      .from("proto_tutors")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return tutor;
  });

export const deleteTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("proto_tutors").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
