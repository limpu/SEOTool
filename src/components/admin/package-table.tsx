import Link from "next/link";
import type { PackageSummary } from "@/lib/rbac/package-admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BILLING_LABELS: Record<string, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " one-time",
};

export function PackageTable({ packages }: { packages: PackageSummary[] }) {
  if (packages.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState title="No packages yet" className="py-10" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead numeric>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead numeric>Users assigned</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell numeric className="text-secondary-foreground">
                {p.price.toLocaleString(undefined, { style: "currency", currency: p.currency })}
                {BILLING_LABELS[p.billingPeriod] ?? ""}
              </TableCell>
              <TableCell>
                {/* A published/unpublished flag is chrome, not a measurement,
                    so neither state borrows a pass/fail status colour. */}
                <Badge variant={p.status === "active" ? "accent" : "neutral"}>
                  {p.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell numeric className="text-secondary-foreground">
                {p.userCount}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/packages/${p.id}`}
                  className="rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
