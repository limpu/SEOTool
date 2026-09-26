import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { RetestPanel } from "@/components/website/retest-panel";
import { ReportExportPanel } from "@/components/website/report-export-panel";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "reports");
  if (!access.entitled) return <UpgradeRequired label="Reports" />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Reports</h1>
      <Card>
        <CardHeader>
          <CardTitle>Re-test (Before / After)</CardTitle>
        </CardHeader>
        <CardContent>
          <RetestPanel websiteId={site.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export Report</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportExportPanel websiteId={site.id} />
        </CardContent>
      </Card>
    </div>
  );
}
