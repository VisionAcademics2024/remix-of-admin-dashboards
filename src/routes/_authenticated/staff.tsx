import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  PageHeader,
  Section,
  StatusPill,
  TableShell,
  Td,
  Th,
} from "@/components/vision/ui";
import { formatDate } from "@/lib/format";
import type { Row } from "@/lib/vision/types";
import {
  approveAccessRequest,
  declineAccessRequest,
  listStaff,
  updateStaffMember,
} from "@/lib/vision/session.functions";
import { meQueryOptions } from "./route";

const staffQueryOptions = () => queryOptions({ queryKey: ["staff"], queryFn: () => listStaff() });

export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (me.staff?.role !== "owner") throw redirect({ to: "/today" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(staffQueryOptions()),
  component: StaffPage,
});

function StaffPage() {
  const { data } = useSuspenseQuery(staffQueryOptions());
  const queryClient = useQueryClient();
  const approve = useServerFn(approveAccessRequest);
  const decline = useServerFn(declineAccessRequest);
  const update = useServerFn(updateStaffMember);
  const [pendingRole, setPendingRole] = useState<Record<string, "owner" | "admin">>({});

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["staff"] });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="Staff"
        description="Owners see everything. Admins see everything except tutor pay. Tutors see the calendar, the roll of their own lessons, and their own pay - nothing else, enforced by the database rather than the screen."
      />

      <Section
        title="Waiting for approval"
        count={data.requests.length}
        description="Signing in grants nothing on its own. Approving someone creates their staff row."
        tone={data.requests.length ? "warning" : undefined}
      >
        {data.requests.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No requests"
            hint="Someone who signs in without access can lodge a request, and it appears here."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Requested</Th>
                <Th>Role</Th>
                <Th className="text-right">Decision</Th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r: Row) => (
                <tr key={r.user_id}>
                  <Td className="font-medium">{r.full_name}</Td>
                  <Td>{r.email}</Td>
                  <Td>{formatDate(r.requested_at)}</Td>
                  <Td>
                    <Select
                      value={pendingRole[r.user_id] ?? "admin"}
                      onValueChange={(v: "owner" | "admin") =>
                        setPendingRole({ ...pendingRole, [r.user_id]: v })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await approve({
                              data: {
                                user_id: r.user_id,
                                full_name: r.full_name,
                                email: r.email,
                                role: pendingRole[r.user_id] ?? "admin",
                              },
                            });
                            toast.success(`${r.full_name} now has access.`);
                            await refresh();
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await decline({ data: { user_id: r.user_id } });
                          toast.success("Request declined.");
                          await refresh();
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      <Section title="Staff" count={data.staff.length}>
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Added</Th>
              <Th className="text-right">Active</Th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((s: Row) => (
              <tr key={s.user_id}>
                <Td className="font-medium">{s.full_name}</Td>
                <Td>{s.email}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={s.role}
                      onValueChange={async (v: "owner" | "admin" | "tutor") => {
                        try {
                          await update({ data: { user_id: s.user_id, role: v } });
                          toast.success("Role updated.");
                          await refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="tutor">Tutor</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* A tutor account teaches as somebody. Two accounts may
                        point at the same tutor, which is how a test login
                        shares a real tutor's lessons and pay. */}
                    {s.role === "tutor" && (
                      <Select
                        value={s.tutor_id ?? ""}
                        onValueChange={async (v) => {
                          try {
                            await update({
                              data: { user_id: s.user_id, role: "tutor", tutor_id: v },
                            });
                            toast.success("Tutor linked.");
                            await refresh();
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Teaches as…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(data.tutors as Row[]).map((t: Row) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {s.role === "tutor" && !s.tutor_id && (
                      <StatusPill tone="warning" className="normal-case">
                        Pick a tutor
                      </StatusPill>
                    )}
                  </div>
                </Td>
                <Td>{formatDate(s.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <StatusPill tone={s.is_active ? "success" : "muted"}>
                      {s.is_active ? "Active" : "Deactivated"}
                    </StatusPill>
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={async (checked) => {
                        try {
                          await update({ data: { user_id: s.user_id, is_active: checked } });
                          toast.success(checked ? "Reactivated." : "Deactivated.");
                          await refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>

        <p className="mt-3 text-xs text-muted-foreground">
          Deactivating is a switch, never a delete - deleting the row would lose the audit trail on
          per-lesson pay adjustments. A role change takes effect on the person's next request.
        </p>
      </Section>
    </div>
  );
}
