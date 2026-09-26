import Link from "next/link";
import type { RoleSummary } from "@/lib/rbac/role-admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function RoleTable({ roles }: { roles: RoleSummary[] }) {
  if (roles.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState title="No roles yet" className="py-10" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Type</TableHead>
            <TableHead numeric>Users</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted">{r.key}</TableCell>
              <TableCell>
                {/* Built-in vs. user-defined is chrome, not a verdict — neither
                    half of this distinction earns a status colour. */}
                <Badge variant={r.isSystem ? "neutral" : "accent"}>{r.isSystem ? "System" : "Custom"}</Badge>
              </TableCell>
              <TableCell numeric className="text-secondary-foreground">
                {r.userCount}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/roles/${r.id}`}
                  className="rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {r.key === "SUPER_ADMIN" ? "View" : "Edit"}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
