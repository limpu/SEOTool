import { requireCurrentUser } from "@/lib/auth/current-user";
import { AddWebsiteForm } from "@/components/website/add-website-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function NewWebsitePage() {
  await requireCurrentUser();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-foreground">Add a website</h1>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll use this to track SEO once auditing arrives in a later phase.
      </p>
      <Card>
        <CardContent className="pt-5">
          <AddWebsiteForm />
        </CardContent>
      </Card>
    </div>
  );
}
