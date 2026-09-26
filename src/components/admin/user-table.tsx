import Link from "next/link";
import type { AdminUserSummary } from "@/lib/admin/user-queries";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Account lifecycle. `active` is the ordinary case, so it stays neutral
 * chrome rather than shouting a green pass; only the two exceptional states
 * take a status variant, which brings an icon with it so the state is never
 * carried by colour alone.
 */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: "neutral",
  suspended: "warning",
  deleted: "critical",
};

export function UserTable({ users }: { users: AdminUserSummary[] }) {
  if (users.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState title="No users match these filters" className="py-10" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Subscription</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="text-secondary-foreground">{u.email}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[u.status] ?? "neutral"} className="capitalize">
                  {u.status}
                </Badge>
              </TableCell>
              <TableCell className="text-secondary-foreground">
                {u.roles.length > 0 ? u.roles.map((r) => r.name).join(", ") : "—"}
              </TableCell>
              <TableCell className="text-secondary-foreground">{u.subscriptionPackage ?? "—"}</TableCell>
              <TableCell className="text-muted">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
