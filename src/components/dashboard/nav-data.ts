export interface NavItem {
  label: string;
  href?: string;
  comingSoon?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const primaryNavItem: NavItem = { label: "Dashboard", href: "/dashboard" };

// Only rendered when the current user is SUPER_ADMIN or holds a "users"/
// "roles" permission — see AppShell's `isAdmin` prop. Kept as a distinct
// group (not injected into navGroups) so it's trivially conditional.
export const adminNavGroup: NavGroup = {
  title: "Admin",
  items: [
    { label: "Users", href: "/admin/users" },
    { label: "Roles", href: "/admin/roles" },
    { label: "Packages", href: "/admin/packages" },
    { label: "Limitations", href: "/admin/limits" },
  ],
};

// Phase 35 (read.md navigation refactor): every per-website SEO/AI Search/
// Research/Performance/Reports module now lives under the Website Workspace
// (/websites/[id]/<slug> — see src/lib/website-workspace/nav.ts, which is
// the real source of truth for what's implemented vs. RBAC-gated). This
// top-level sidebar group is deliberately just entry points into "the
// currently active website's workspace" — it does NOT duplicate the
// permission/entitlement list; WorkspaceSidebar (rendered inside the
// website layout) does that filtering per-item against the real user.
//
// No website selected yet -> these are intentionally left disabled
// ("Soon"-style) by SidebarNav until a website exists, since there is no
// [id] to route into.
export const navGroups: NavGroup[] = [];
