import { z } from "zod";

export const createAdminUserSchema = z.object({
  name: z.string().min(1, "Please enter a name.").max(255, "Name is too long.").trim(),
  email: z
    .string()
    .min(1, "Please enter an email.")
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Please enter a valid email.")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200, "Password is too long."),
  roleId: z.string().uuid("Please select a role.").optional(),
});

export const updateAdminUserSchema = z.object({
  name: z.string().min(1, "Please enter a name.").max(255, "Name is too long.").trim(),
  email: z
    .string()
    .min(1, "Please enter an email.")
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Please enter a valid email.")),
});

export const setUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

// Phase 15: multi-role assignment. `user_roles` was always many-to-many;
// this replaces Phase 14's single-roleId assignment with a set of role ids
// (an empty array is valid — it means "no roles").
export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid("Invalid role id.")),
});

export const assignSubscriptionSchema = z.object({
  subscriptionPackage: z
    .string()
    .trim()
    .max(100, "Package name is too long.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
