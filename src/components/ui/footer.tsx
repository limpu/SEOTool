import Link from "next/link";

interface FooterProps {
  className?: string;
  minimal?: boolean;
}

export function Footer({ className = "", minimal = false }: FooterProps) {
  return (
    <footer
      className={`border-t border-default/50 py-4 px-4 text-xs text-muted-foreground ${className}`}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Developed by</span>
          <a
            href="https://www.linkedin.com/in/atiqueullahlimon"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            <span>Atique Ullah</span>
            <svg
              className="h-3 w-3 text-[#0a66c2]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
            </svg>
          </a>
        </div>

        {!minimal && (
          <div className="flex items-center gap-4 text-muted-foreground/80">
            <span>Open Source AI SEO Platform</span>
            <span>•</span>
            <a
              href="https://github.com/limpu/SEOTool"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground hover:underline"
            >
              GitHub Repository
            </a>
          </div>
        )}
      </div>
    </footer>
  );
}
