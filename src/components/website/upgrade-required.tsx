import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

/**
 * "This module isn't in your package." An entitlement gate, not a measured
 * verdict about the site — so it wears the `warning` Alert (icon + label) for
 * the signal and neutral card chrome around it, rather than tinting the whole
 * panel with a status hue that colour alone would have to carry.
 */
export function UpgradeRequired({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Alert variant="warning">
          <p className="font-semibold">Upgrade required</p>
          <p className="mt-1">
            Your current subscription package does not include <strong>{label}</strong>. Contact your account admin
            or upgrade your package to unlock this report.
          </p>
        </Alert>
      </CardContent>
    </Card>
  );
}
