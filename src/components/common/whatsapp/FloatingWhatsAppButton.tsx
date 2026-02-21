import type { FC } from "react";

type Props = {
  href?: string | null;
};

const FloatingWhatsAppButton: FC<Props> = ({ href }) => {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-neutral-900 bg-neutral-900 px-4 py-3 text-xs font-semibold text-white shadow-[0_14px_28px_rgba(0,0,0,0.18)] transition hover:opacity-90 md:bottom-6 md:right-6 md:text-sm"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="M20 12a8 8 0 0 1-11.74 7.05L4 20l.98-4.05A8 8 0 1 1 20 12Zm-8-6.5a6.5 6.5 0 0 0-5.57 9.86l.29.47-.58 2.4 2.47-.55.46.27A6.5 6.5 0 1 0 12 5.5Zm3.58 8.17c-.2-.1-1.2-.59-1.39-.66-.19-.07-.33-.1-.47.1-.14.2-.54.65-.67.78-.12.14-.25.15-.45.05-.2-.1-.86-.32-1.63-1.03-.6-.53-1-1.18-1.12-1.38-.12-.2-.01-.3.09-.4.09-.09.2-.24.3-.35.1-.12.14-.2.21-.34.07-.14.04-.27-.02-.38-.05-.1-.47-1.14-.65-1.56-.17-.41-.35-.35-.47-.35h-.4c-.14 0-.37.05-.56.27-.2.21-.75.73-.75 1.78 0 1.04.77 2.05.87 2.19.1.14 1.49 2.28 3.61 3.19.5.22.9.35 1.2.45.5.16.95.14 1.31.09.4-.06 1.2-.5 1.37-.98.17-.49.17-.9.12-.99-.05-.09-.18-.14-.38-.24Z" />
      </svg>
      <span>WhatsApp</span>
    </a>
  );
};

export default FloatingWhatsAppButton;
