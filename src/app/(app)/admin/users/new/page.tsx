import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { listAllRoles } from "@/lib/rbac/queries";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function NewAdminUserPage() {
  await requireAdminAccess("users", "create");
  await ensureRbacSeed();
  const roles = await listAllRoles();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-foreground">Create user</h1>
      <p className="mt-1 text-sm text-muted">
        The account is created pre-verified — no email OTP step for admin-created users.
      </p>
      <Card>
        <CardContent className="pt-5">
          <CreateUserForm roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
