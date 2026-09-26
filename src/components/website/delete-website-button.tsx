"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function DeleteWebsiteButton({
  websiteId,
  websiteName,
}: {
  websiteId: string;
  websiteName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!window.confirm(`Delete "${websiteName}"? This cannot be undone.`)) return;

    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete this website.");
        return;
      }
      router.push("/websites");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        variant="secondary"
        onClick={handleDelete}
        loading={deleting}
        className="border-destructive-border text-destructive hover:bg-destructive-subtle"
      >
        {deleting ? "Deleting..." : "Delete website"}
      </Button>
    </div>
  );
}
