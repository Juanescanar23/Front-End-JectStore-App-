export default function LogoIcon() {
  return (
    <div className="flex items-center">
      <div className="flex items-center rounded-md px-1.5 py-1 dark:bg-white/95 dark:ring-1 dark:ring-neutral-200/70">
        <img
          src="/brand/jectstore-logo.png"
          alt="JectStore"
          className="h-8 w-auto md:h-9"
          loading="eager"
        />
      </div>
      <span className="sr-only">JectStore</span>
    </div>
  );
}
