"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { buildQueryString } from "./filtering";

/**
 * URL-driven search box. MODULE-AGNOSTIC.
 *
 * Progressive enhancement, deliberately: the markup is a real
 * `<form method="get">` pointing at `action`, with every other active filter
 * carried in hidden inputs. With JavaScript off (or before hydration) pressing
 * Enter performs a normal GET navigation and the search still works. With
 * JavaScript on, `onSubmit` is intercepted and the same URL is pushed as a
 * soft navigation instead, so the report re-renders without a full reload.
 *
 * The value lives in the URL, not in component state, which is what makes a
 * filtered report shareable and bookmarkable and makes the back button undo a
 * search. The local `useState` here is only the uncommitted keystroke buffer;
 * it is re-seeded from the prop whenever the URL changes (back/forward, a
 * cleared filter), so the box can never drift out of sync with the results it
 * claims to describe.
 */
export function ReportSearchForm({
  action,
  name = "q",
  value,
  hiddenParams = {},
  label,
  placeholder,
  className = "",
}: {
  /** Path the form submits to — the report route this search filters. */
  action: string;
  /** Query-param name. Two searches on one page (issues vs. URLs) use different names. */
  name?: string;
  /** Current committed value, read from the URL by the server. */
  value: string;
  /** Other active filters to preserve on submit. Arrays become repeated inputs. */
  hiddenParams?: Record<string, string | string[] | undefined>;
  /** Real, associated label text. Visually hidden, never absent. */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value);

  // Re-seed from the URL: back/forward navigation and "clear filters" must
  // move the box, not leave a stale query sitting above fresh results.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const inputId = `report-search-${name}`;

  function submit(next: string) {
    // Any new search returns to page 1 — page 7 of a now-shorter result set is
    // a blank screen that looks like "no matches".
    router.push(`${action}${buildQueryString({ ...hiddenParams, [name]: next.trim() })}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(draft);
  }

  return (
    <form role="search" action={action} method="get" onSubmit={handleSubmit} className={`min-w-0 ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          name={name}
          type="search"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          className="pl-9"
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              submit("");
            }}
            className="absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>

      {/* No-JS / pre-hydration fallback: the other active filters travel with the GET. */}
      {Object.entries(hiddenParams).flatMap(([key, entry]) => {
        if (entry === undefined) return [];
        const values = Array.isArray(entry) ? entry : [entry];
        return values
          .filter((item) => item !== "")
          .map((item, index) => <input key={`${key}-${index}`} type="hidden" name={key} value={item} />);
      })}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}
