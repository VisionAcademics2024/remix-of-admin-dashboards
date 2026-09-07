import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  PageHeader,
  Section,
  StatusPill,
  TableShell,
  Td,
  Th,
} from "@/components/vision/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { linkedTutorMismatch, sharedTutorLinks } from "@/lib/vision/tutor-access";
import type { Row } from "@/lib/vision/types";
import {
  approveAccessRequest,
  declineAccessRequest,
  listStaff,
  updateStaffAccount,
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
  const [editing, setEditing] = useState<Row | null>(null);

  // Which tutor each account actually teaches as, by name, and the tutors two
  // accounts are both pointed at - the two things that decide whether a person
  // is looking at their own lessons and pay or somebody else's.
  const tutorNameById = new Map(
    (data.tutors as Row[]).map((t: Row) => [t.id as string, t.full_name as string]),
  );
  const sharedLinks = sharedTutorLinks(data.staff as Row[]);

  // The hourly rate that belongs to the tutor this account is linked to, read
  // from the dated rate rows rather than assumed from the account's name - the
  // two are set separately, which is exactly how an account ends up showing
  // somebody else's figure.
  const rates = data.rateByTutorId as Record<
    string,
    { hourly_rate: number; effective_from: string } | undefined
  >;

  function payRateCell(s: Row) {
    if (s.role !== "tutor") {
      return <span className="text-muted-foreground">Not paid hourly</span>;
    }
    if (!s.tutor_id) {
      return <span className="text-muted-foreground">Link a tutor first</span>;
    }
    const rate = rates[s.tutor_id as string];
    if (!rate) {
      return (
        <StatusPill tone="warning" className="normal-case">
          No rate set
        </StatusPill>
      );
    }
    return (
      <div className="flex flex-col">
        <span className="tabular-nums font-medium">{formatMoney(rate.hourly_rate)} / hour</span>
        <span className="text-xs text-muted-foreground">
          {tutorNameById.get(s.tutor_id as string) ?? "Unknown tutor"} · from{" "}
          {formatDate(rate.effective_from)}
        </span>
      </div>
    );
  }

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
              <Th>Pay rate</Th>
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

                    {/* The link decides whose lessons and whose pay this
                        account sees, and nothing makes it agree with the name
                        on the account. An account called one thing pointed at
                        another tutor shows that tutor's money under this
                        person's name, silently - so it is named here. */}
                    {s.role === "tutor" &&
                      linkedTutorMismatch(s.full_name, tutorNameById.get(s.tutor_id ?? "")) && (
                        <StatusPill tone="warning" className="normal-case">
                          Sees {tutorNameById.get(s.tutor_id ?? "")}&apos;s lessons &amp; pay
                        </StatusPill>
                      )}

                    {s.role === "tutor" && s.tutor_id && sharedLinks.has(s.tutor_id) && (
                      <StatusPill tone="warning" className="normal-case">
                        Shared with another account
                      </StatusPill>
                    )}
                  </div>
                </Td>
                <Td>{payRateCell(s)}</Td>
                <Td>{formatDate(s.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                      Edit account
                    </Button>
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
          Each tutor account shows the rate of the tutor it is linked to, on the date that rate
          started. Change a rate on the Tutor pay page - a new rate is a new dated row, so past
          fortnights keep the figure they were paid at.
        </p>
      </Section>

      <EditAccountDialog account={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

/**
 * Name, email address and password for one account. Roles, the tutor link and
 * access stay on the table, because changing who somebody is and changing what
 * they can see are different decisions.
 */
function EditAccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Row | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const save = useServerFn(updateStaffAccount);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName((account?.full_name as string) ?? "");
    setEmail((account?.email as string) ?? "");
    setPassword("");
  }, [account]);

  if (!account) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>
            Update the name, the sign-in email or set a new password. Leave the password blank to
            keep the current one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-name">Full name</Label>
            <Input id="staff-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">New password</Label>
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep the current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters. A password found in a known breach is refused.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await save({
                  data: {
                    user_id: account.user_id as string,
                    full_name: fullName,
                    email,
                    ...(password ? { password } : {}),
                  },
                });
                toast.success("Account updated.");
                await onSaved();
                onClose();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Unused() {
  return (
    <div>
      <p>
          Deactivating is a switch, never a delete - deleting the row would lose the audit trail on
          per-lesson pay adjustments. A role change takes effect on the person's next request.
        </p>
      </Section>
    </div>
  );
}
