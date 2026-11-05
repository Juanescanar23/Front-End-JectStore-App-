"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "@/components/common/StorefrontLink";
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { creativeBannerHref, type NextCreativeImage } from "@/lib/storefront-experience/document";
import styles from "./CreativeBannerCarousel.module.css";

const source = (value: string) => !value || value.startsWith("/") || value.startsWith("https://") ? value : `/${value}`;

/** Only the explicit creative section uses this renderer. It never rewrites slides. */
export default function CreativeBannerCarousel({ options }: { options: { images: NextCreativeImage[] } }) {
  const images = options.images;
  const count = images.length;
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const controls = useRef<Array<HTMLButtonElement | null>>([]);
  const active = count ? selected % count : 0;
  if (!count) return null;

  function select(index: number, focus = false) {
    const next = (index + count) % count;
    setSelected(next);
    if (focus) controls.current[next]?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || count < 2
      || (event.target as HTMLElement).closest("input,textarea,select")) return;
    const next = event.key === "ArrowRight" ? active + 1 : event.key === "ArrowLeft" ? active - 1
      : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <section className={styles.carousel} aria-label="Portadas de la tienda" aria-roledescription="carrusel" onKeyDown={keyboard}>
      <div className={styles.viewport}>
        {images.map((slide, index) => {
          const composition = slide.composition;
          const image = source(slide.image || slide.imageUrl || "");
          const current = index === active;
          const href = creativeBannerHref(slide.link);
          return (
            <article key={index} className={styles.slide} data-mold={composition.mold} data-theme={composition.theme}
              data-font={composition.font_id} data-active={current} role="group" aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${count}`} aria-hidden={!current} inert={!current}>
              <div className={styles.media}>
                {image && !failed[image] ? (
                  <Image src={image} alt={slide.title} fill sizes="(min-width: 768px) 60vw, 100vw"
                    className={styles.image} priority={index === 0}
                    onError={() => setFailed(previous => ({ ...previous, [image]: true }))} />
                ) : (
                  <div className={styles.unavailable} role="img" aria-label={slide.title ? `${slide.title}: imagen no disponible` : "Imagen no disponible"}>
                    Imagen no disponible
                  </div>
                )}
              </div>
              <div className={styles.copy}>
                {composition.eyebrow && <p className={styles.eyebrow}>{composition.eyebrow}</p>}
                <h2 className={styles.heading}>{composition.heading}</h2>
                {composition.body && <p className={styles.body}>{composition.body}</p>}
                {href && composition.cta_label.trim() && <Link href={href} className={styles.action} tabIndex={current ? 0 : -1}>
                  {composition.cta_label}<ArrowRightIcon aria-hidden="true" />
                </Link>}
              </div>
            </article>
          );
        })}
      </div>
      {count > 1 && <nav className={styles.controls} aria-label="Cambiar portada" data-next-preview-local-controls="creative-covers">
        <button type="button" className={styles.arrow} aria-label="Portada anterior" onClick={() => select(active - 1)}><ArrowLeftIcon aria-hidden="true" /></button>
        <div className={styles.pages}>
          {images.map((_, index) => <button key={index} type="button" className={styles.page}
            ref={element => { controls.current[index] = element; }}
            aria-label={`Mostrar portada ${index + 1} de ${count}`} aria-current={index === active ? "true" : undefined}
            onClick={() => select(index)}><span aria-hidden="true" /></button>)}
        </div>
        <button type="button" className={styles.arrow} aria-label="Portada siguiente" onClick={() => select(active + 1)}><ArrowRightIcon aria-hidden="true" /></button>
        <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">Portada {active + 1} de {count}</span>
      </nav>}
    </section>
  );
}
