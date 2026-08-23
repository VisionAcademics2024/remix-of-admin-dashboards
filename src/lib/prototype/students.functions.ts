import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const studentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  parent_name: z.string().optional().or(z.literal("")),
  parent_phone: z.string().optional().or(z.literal("")),
  parent_email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  grade: z.string().optional().or(z.literal("")),
  school: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "graduated"]).default("active"),
});

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("proto_students")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getStudent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: student, error } = await context.supabase
      .from("proto_students")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return student;
  });

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => studentSchema.parse(data))
  .handler(async ({ context, data }) => {
    const payload = {
      ...data,
      email: data.email || null,
      phone: data.phone || null,
      parent_name: data.parent_name || null,
      parent_phone: data.parent_phone || null,
      parent_email: data.parent_email || null,
      date_of_birth: data.date_of_birth || null,
      grade: data.grade || null,
      school: data.school || null,
      notes: data.notes || null,
    };
    const { data: student, error } = await context.supabase
      .from("proto_students")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return student;
  });

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        ...studentSchema.shape,
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload = {
      ...rest,
      email: rest.email || null,
      phone: rest.phone || null,
      parent_name: rest.parent_name || null,
      parent_phone: rest.parent_phone || null,
      parent_email: rest.parent_email || null,
      date_of_birth: rest.date_of_birth || null,
      grade: rest.grade || null,
      school: rest.school || null,
      notes: rest.notes || null,
    };
    const { data: student, error } = await context.supabase
      .from("proto_students")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return student;
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("proto_students").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
