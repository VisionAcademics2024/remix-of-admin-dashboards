import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
} from "@/lib/prototype/packages.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queryOptions, useQueryClient } from "@tanstack/react-query";

const packagesQueryOptions = () =>
  queryOptions({
    queryKey: ["packages"],
    queryFn: () => listPackages(),
  });

export const Route = createFileRoute("/_authenticated/prototype/packages")({
  loader: ({ context }) => context.queryClient.ensureQueryData(packagesQueryOptions()),
  component: PackagesPage,
});

const emptyForm = {
  name: "",
  description: "",
  total_sessions: 1,
  price: "" as string | number,
  validity_days: "" as string | number,
  status: "active" as const,
};

function PackagesPage() {
  const { data: packages } = useSuspenseQuery(packagesQueryOptions());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createPackage);
  const updateFn = useServerFn(updatePackage);
  const deleteFn = useServerFn(deletePackage);

  const filtered = packages.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false);
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(pkg: (typeof packages)[number]) {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      total_sessions: pkg.total_sessions,
      price: pkg.price ?? "",
      validity_days: pkg.validity_days ?? "",
      status: pkg.status as typeof emptyForm.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const payload = {
        ...form,
        price: form.price === "" ? null : Number(form.price),
        validity_days: form.validity_days === "" ? null : Number(form.validity_days),
      };
      if (editingId) {
        await updateFn({ data: { id: editingId, ...payload } });
        toast.success("Package updated");
      } else {
        await createFn({ data: payload });
        toast.success("Package created");
      }
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save package");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this package?")) return;
    try {
      await deleteFn({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast.success("Package deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete package");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Packages</h1>
          <p className="text-sm text-muted-foreground">Manage session packages and pricing.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add package
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search packages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((pkg) => (
          <Card key={pkg.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{pkg.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {pkg.total_sessions} sessions
                    {pkg.price ? ` · $${pkg.price}` : ""}
                    {pkg.validity_days ? ` · ${pkg.validity_days} days validity` : ""}
                  </div>
                  {pkg.description && (
                    <div className="text-sm text-muted-foreground">{pkg.description}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={pkg.status === "active" ? "default" : "secondary"}>
                  {pkg.status}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(pkg.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">No packages found.</div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit package" : "Add package"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_sessions">Total sessions</Label>
              <Input
                id="total_sessions"
                type="number"
                min={1}
                value={form.total_sessions}
                onChange={(e) => setForm({ ...form, total_sessions: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validity_days">Validity (days)</Label>
              <Input
                id="validity_days"
                type="number"
                min={0}
                value={form.validity_days}
                onChange={(e) => setForm({ ...form, validity_days: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as typeof emptyForm.status })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!form.name || form.total_sessions < 1}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
