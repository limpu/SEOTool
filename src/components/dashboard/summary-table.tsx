import Link from "next/link";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { DashboardWebsiteSummary } from "@/lib/dashboard/summary";
import { DeleteWebsiteModal } from "@/components/dashboard/delete-website-modal";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Period-over-period change. Wears the DELTA roles, not the status ramp: this
 * is a direction of travel, not a verdict on a measurement. The arrow glyph
 * carries the meaning alongside the colour so the sign survives greyscale.
 */
function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted">—</span>;
  const positive = pct > 0;
  const zero = pct === 0;
  const color = zero ? "text-delta-flat" : positive ? "text-delta-up" : "text-delta-down";
  const arrow = zero ? "" : positive ? "↑" : "↓";
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(pct)}%
    </span>
  );
}

function ConnectCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {label}
    </Link>
  );
}

export function DashboardSummaryTable({ rows }: { rows: DashboardWebsiteSummary[] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="mt-6 overflow-hidden">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Website</TableHead>
            <TableHead>AI Visibility</TableHead>
            <TableHead>Site Health</TableHead>
            <TableHead title="Average Search Console position — lower is better">Visibility (Position)</TableHead>
            <TableHead>Organic Traffic</TableHead>
            <TableHead>Organic Keywords</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/websites/${row.id}/overview`}
                  className="rounded-sm underline underline-offset-2 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.name}
                </Link>
              </TableCell>

              <TableCell>
                {row.aiVisibility.score === null ? (
                  <span className="text-muted">No data yet</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="tabular font-semibold">{row.aiVisibility.score}</span>
                    <ChangeBadge pct={row.aiVisibility.changePct} />
                  </div>
                )}
              </TableCell>

              <TableCell>
                {row.siteHealth.score === null ? (
                  <span className="text-muted">No data yet</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="tabular font-semibold">{row.siteHealth.score}</span>
                    <ChangeBadge pct={row.siteHealth.changePct} />
                  </div>
                )}
              </TableCell>

              <TableCell>
                {row.visibility.connected ? (
                  row.visibility.avgPosition === null ? (
                    <span className="text-muted">No data yet</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="tabular font-semibold">{row.visibility.avgPosition}</span>
                      <ChangeBadge pct={row.visibility.changePct} />
                    </div>
                  )
                ) : (
                  <ConnectCta href={`/websites/${row.id}/search-console`} label="Connect Search Console" />
                )}
              </TableCell>

              <TableCell>
                {row.organicTraffic.connected ? (
                  <span className="tabular font-semibold">
                    {row.organicTraffic.sessions.toLocaleString()} sessions
                  </span>
                ) : (
                  <ConnectCta href={`/websites/${row.id}/google-analytics`} label="Connect Google Analytics" />
                )}
              </TableCell>

              <TableCell>
                {row.organicKeywords.connected ? (
                  <span className="tabular font-semibold">{row.organicKeywords.count.toLocaleString()}</span>
                ) : (
                  <ConnectCta href={`/websites/${row.id}/search-console`} label="Connect Search Console" />
                )}
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/websites/${row.id}/overview`}
                    title="Preview"
                    aria-label={`Preview ${row.name}`}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/websites/${row.id}/overview#edit-website`}
                    title="Edit"
                    aria-label={`Edit ${row.name}`}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <DeleteWebsiteModal
                    websiteId={row.id}
                    websiteName={row.name}
                    icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
