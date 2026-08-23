import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, School, GraduationCap, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getStudentWithPackages,
  getStudentAttendance,
} from "@/lib/prototype/student-detail.functions";

const studentDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["students", id, "detail"],
    queryFn: () => getStudentWithPackages({ data: { id } }),
  });

const studentAttendanceQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["students", id, "attendance"],
    queryFn: () => getStudentAttendance({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/prototype/students/$id")({
  loader: async ({ context, params }) => {
    const [detail] = await Promise.all([
      context.queryClient.ensureQueryData(studentDetailQueryOptions(params.id)),
      context.queryClient.ensureQueryData(studentAttendanceQueryOptions(params.id)),
    ]);
    if (!detail?.student) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.student
          ? `${loaderData.student.first_name} ${loaderData.student.last_name} | Student Detail`
          : "Student Detail",
      },
    ],
  }),
  component: StudentDetailPage,
  errorComponent: StudentDetailError,
  notFoundComponent: StudentDetailNotFound,
});

const statusVariant = (status: string) => {
  switch (status) {
    case "active":
      return "default" as const;
    case "graduated":
      return "secondary" as const;
    case "completed":
      return "secondary" as const;
    case "expired":
      return "destructive" as const;
    case "present":
      return "default" as const;
    case "absent":
      return "destructive" as const;
    case "late":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

function StudentDetailPage() {
  const { id } = Route.useParams();
  const { data: detail } = useSuspenseQuery(studentDetailQueryOptions(id));
  const { data: attendance } = useSuspenseQuery(studentAttendanceQueryOptions(id));
  const { student, packages } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/prototype/students">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Students
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {student.first_name} {student.last_name}
          </h1>
          <Badge variant={statusVariant(student.status)}>{student.status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{student.email || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{student.phone || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            <span>Grade: {student.grade || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <School className="h-4 w-4 text-muted-foreground" />
            <span>{student.school || "—"}</span>
          </div>
          <Separator className="sm:col-span-2" />
          <div className="text-sm">
            <p className="font-medium">Parent / Guardian</p>
            <p className="text-muted-foreground">{student.parent_name || "—"}</p>
            <p className="text-muted-foreground">{student.parent_phone || "—"}</p>
            <p className="text-muted-foreground">{student.parent_email || "—"}</p>
          </div>
          <div className="text-sm">
            <p className="font-medium">Notes</p>
            <p className="text-muted-foreground">{student.notes || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchased Packages</CardTitle>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages purchased yet.</p>
          ) : (
            <div className="space-y-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{pkg.package_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pkg.sessions_used} / {pkg.total_sessions} sessions used
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Purchased {new Date(pkg.purchase_date).toLocaleDateString()}
                      {pkg.expiry_date &&
                        ` · Expires ${new Date(pkg.expiry_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant={statusVariant(pkg.status)}>{pkg.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance History</CardTitle>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance records yet.</p>
          ) : (
            <div className="space-y-3">
              {attendance.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{record.session_title}</p>
                    <p className="text-sm text-muted-foreground">
                      {record.start_time ? new Date(record.start_time).toLocaleString() : "—"} ·
                      Tutor: {record.tutor_name}
                    </p>
                  </div>
                  <Badge variant={statusVariant(record.attendance_status)}>
                    {record.attendance_status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StudentDetailError({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-lg font-medium">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild variant="outline">
        <Link to="/prototype/students">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Students
        </Link>
      </Button>
    </div>
  );
}

function StudentDetailNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-lg font-medium">Student not found</p>
      <p className="text-sm text-muted-foreground">The student you're looking for doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/prototype/students">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Students
        </Link>
      </Button>
    </div>
  );
}
