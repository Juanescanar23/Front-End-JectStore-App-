export default function LogoIcon() {
  return (
    <div className="flex items-center gap-x-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-black">
        <img
          src="/brand/jectstore-logo.png"
          alt="JectStore"
          className="h-6 w-auto"
          loading="eager"
        />
      </div>
      <p className="text-sm font-semibold text-black dark:text-white">
        JectStore
      </p>
    </div>
  );
}
