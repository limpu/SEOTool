"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Website } from "@/lib/websites/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";

export function EditWebsiteForm({ website }: { website: Website }) {
  const router = useRouter();
  const [name, setName] = useState(website.name);
  const [country, setCountry] = useState(website.country ?? "");
  const [maxPages, setMaxPages] = useState(String(website.maxPages));
  const [maxDepth, setMaxDepth] = useState(String(website.maxDepth));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Please enter a website name.";
    const pages = Number(maxPages);
    if (!Number.isInteger(pages) || pages < 1 || pages > 10000) {
      next.maxPages = "Max pages must be a whole number between 1 and 10,000.";
    }
    const depth = Number(maxDepth);
    if (!Number.isInteger(depth) || depth < 1 || depth > 50) {
      next.maxDepth = "Max depth must be a whole number between 1 and 50.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    setSuccess(false);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${website.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country: country || undefined,
          maxPages: Number(maxPages),
          maxDepth: Number(maxDepth),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.fieldErrors)) {
            if (Array.isArray(msgs) && msgs[0]) flat[key] = msgs[0] as string;
          }
          setErrors(flat);
        }
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {success && <Alert variant="success">Website settings saved.</Alert>}

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Website name
        </label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Country code <span className="font-normal text-muted">(optional)</span>
        </label>
        <Input id="country" maxLength={10} value={country} onChange={(e) => setCountry(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="maxPages" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Max pages to crawl
          </label>
          <Input
            id="maxPages"
            type="number"
            min={1}
            max={10000}
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            error={errors.maxPages}
          />
          <FieldError id="maxPages-error" message={errors.maxPages} />
        </div>
        <div>
          <label htmlFor="maxDepth" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
            Max crawl depth
          </label>
          <Input
            id="maxDepth"
            type="number"
            min={1}
            max={50}
            value={maxDepth}
            onChange={(e) => setMaxDepth(e.target.value)}
            error={errors.maxDepth}
          />
          <FieldError id="maxDepth-error" message={errors.maxDepth} />
        </div>
      </div>
      <p className="text-xs text-muted">
        The crawler respects these limits each time you start a crawl below.
      </p>

      <Button type="submit" loading={submitting}>
        {submitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
