import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  href?: string;
}

export function Logo({
  className = "",
  size = 32,
  showText = true,
  href = "/dashboard",
}: LogoProps) {
  const content = (
    <div className={`inline-flex items-center gap-2.5 font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 ${className}`}>
      <div className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm" style={{ width: size, height: size }}>
        <Image
          src="/icon.svg"
          alt="SEOTool Logo"
          width={size}
          height={size}
          className="h-full w-full object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            SEOTool
          </span>
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            AI Intelligence
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
