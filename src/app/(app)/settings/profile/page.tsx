import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ProfileForm } from "@/components/auth/profile-form";
import { EmailChangeForm } from "@/components/auth/email-change-form";
import { DeleteAccountModal } from "@/components/auth/delete-account-modal";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
  const user = await requireCurrentUser();

  const [full] = await db
    .select({
      phone: users.phone,
      addressLine1: users.addressLine1,
      addressLine2: users.addressLine2,
      city: users.city,
      state: users.state,
      postalCode: users.postalCode,
      addressCountry: users.addressCountry,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="mb-6 space-y-4 text-sm">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-1">
                {user.emailVerified ? (
                  <Badge variant="good">Verified</Badge>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Badge variant="warning">Not verified</Badge>
                    <Link
                      href={`/verify-email?userId=${user.id}`}
                      className="rounded-sm font-medium text-accent underline hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Verify Email
                    </Link>
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <ProfileForm
            initial={{
              name: user.name,
              phone: full?.phone ?? "",
              addressLine1: full?.addressLine1 ?? "",
              addressLine2: full?.addressLine2 ?? "",
              city: full?.city ?? "",
              state: full?.state ?? "",
              postalCode: full?.postalCode ?? "",
              addressCountry: full?.addressCountry ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Current email: <span className="text-foreground">{user.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card className="border-destructive-border">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountModal />
        </CardContent>
      </Card>
    </div>
  );
}
