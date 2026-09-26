import { z } from "zod";
import { FEATURE_KEYS, PERMISSION_ACTIONS } from "@/lib/rbac/feature-catalog";

const featureKeyEnum = z.enum(FEATURE_KEYS as [string, ...string[]]);
const permissionActionEnum = z.enum(PERMISSION_ACTIONS);

const featureGrantSchema = z.object({
  featureKey: featureKeyEnum,
  actions: z.array(permissionActionEnum),
});

export const roleFormSchema = z.object({
  name: z.string().min(1, "Please enter a role name.").max(255, "Role name is too long.").trim(),
  description: z
    .string()
    .max(1000, "Description is too long.")
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  // Only grants for known catalog features are accepted; anything else in
  // the payload is a client bug, not a role a real admin screen can submit.
  permissions: z.array(featureGrantSchema),
});

export type RoleFormInput = z.infer<typeof roleFormSchema>;
