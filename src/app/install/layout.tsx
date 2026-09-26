import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/ui/footer";

/**
 * Web Installer — its own chrome.
 *
 * Deliberately outside the application's authenticated shell: there is no
 * session here, no navigation into the product, and nothing to sign out of.
 * The installer is used by someone who has filesystem or container-log access
 * and is holding the install token — it is not a page in the app.
 *
 * `noindex, nofollow, noarchive` matches the API routes. A half-installed
 * host that gets crawled must not end up with its installer in a search index
 * or a web archive, where the fact that this deployment HAS an installer
 * would outlive the installation itself.
 */
export const metadata: Metadata = {
  title: "Install — AI SEO Platform",
  robots: { index: false, follow: false, nocache: true },
};


export default function InstallLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-background text-foreground">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
