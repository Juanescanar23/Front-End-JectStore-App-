type LogoIconProps = {
  src?: string | null;
  alt?: string | null;
};

const FALLBACK_LOGO_SRC = '/brand/jectstore-logo.svg';
const FALLBACK_LOGO_ALT = 'JectStore';

export default function LogoIcon({ src, alt }: LogoIconProps) {
  const resolvedSrc = src?.trim() ? src : FALLBACK_LOGO_SRC;
  const resolvedAlt = alt?.trim() ? alt : FALLBACK_LOGO_ALT;

  return (
    <div className="flex items-center">
      <div className="flex items-center rounded-md px-1.5 py-1 dark:bg-white/95 dark:ring-1 dark:ring-neutral-200/70">
        <img
          src={resolvedSrc}
          alt={resolvedAlt}
          className="h-8 w-auto max-w-[160px] object-contain md:h-9"
          loading="eager"
        />
      </div>
      <span className="sr-only">{resolvedAlt}</span>
    </div>
  );
}
