"use client";

import { FC, useState, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import { Shimmer } from "@/components/common/Shimmer";
import { nextBannerHref } from "@/lib/storefront-experience/document";

interface ImageCarouselProps {
    editorial?: boolean;
    options: {
        images: {
            image: string;
            imageUrl?: string;
            link: string;
            title?: string;
        }[];
    };
}

const motionQuery = "(prefers-reduced-motion: reduce)";
const reducedMotionSnapshot = () => !window.matchMedia || window.matchMedia(motionQuery).matches;
const subscribeMotion = (notify: () => void) => {
    if (!window.matchMedia) return () => {};
    const media = window.matchMedia(motionQuery);
    if (media.addEventListener) {
        media.addEventListener("change", notify);
        return () => media.removeEventListener("change", notify);
    }
    media.addListener(notify);
    return () => media.removeListener(notify);
};
const subscribeVisibility = (notify: () => void) => {
    document.addEventListener("visibilitychange", notify);
    return () => document.removeEventListener("visibilitychange", notify);
};
const imageSource = (value: string) => !value || /^https?:\/\//.test(value) || value.startsWith("/") ? value : `/${value}`;

const ImageCarousel: FC<ImageCarouselProps> = ({ options, editorial = false }) => {
    const images = Array.isArray(options?.images) ? options.images : [];
    const count = images.length;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [manuallyPaused, setManuallyPaused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [imageStates, setImageStates] = useState<Record<string, "loaded" | "error">>({});
    // Server and hydration start without motion; the client preference then opts in.
    const reducedMotion = useSyncExternalStore(subscribeMotion, reducedMotionSnapshot, () => true);
    const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
    const activeIndex = count ? currentIndex % count : 0;
    const playing = count > 1 && !manuallyPaused && !hovered && !reducedMotion && !hidden;
    const dots = useRef<Array<HTMLButtonElement | null>>([]);
    const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const rotationIntent = useRef<boolean | null>(null);

    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => setCurrentIndex(index => (index + 1) % count), 5000);
        return () => clearInterval(timer);
    }, [playing, count]);

    useEffect(() => {
        const cancel = () => { gesture.current = null; suppressClick.current = false; rotationIntent.current = null; };
        window.addEventListener("blur", cancel);
        return () => window.removeEventListener("blur", cancel);
    }, []);

    if (!count) return null;

    const select = (index: number) => {
        setCurrentIndex((index + count) % count);
        // Manual navigation never restarts itself after a stale timeout or hover.
        setManuallyPaused(true);
    };
    const cancelGesture = () => { gesture.current = null; suppressClick.current = false; rotationIntent.current = null; };
    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        if ((event.target as HTMLElement).closest("button")) return;
        rotationIntent.current = null;
        setManuallyPaused(true);
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        gesture.current = null;
        const dx = start.x - event.clientX;
        if (count > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(start.y - event.clientY)) {
            select(activeIndex + (dx > 0 ? 1 : -1));
            suppressClick.current = true;
        }
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey || count < 2) return;
        const next = event.key === "ArrowRight" ? (activeIndex + 1) % count
            : event.key === "ArrowLeft" ? (activeIndex - 1 + count) % count
            : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
        if (next === null) return;
        event.preventDefault();
        select(next);
        // A link about to become inert must not retain keyboard focus.
        dots.current[next]?.focus();
    };

    return (
        <section className="mt-7.5 w-full" aria-label="Imágenes destacadas" aria-roledescription="carrusel">
            <div
                className="group relative w-full overflow-hidden rounded-xl md:rounded-2xl aspect-[1.97/1]"
                style={{
                    position: 'relative',
                    width: '100%',
                    touchAction: 'pan-y'
                }}
                onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
                onPointerLeave={() => { setHovered(false); if (gesture.current) cancelGesture(); }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={cancelGesture}
                onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }}
                onDragStart={event => event.preventDefault()}
                onClickCapture={event => {
                    if (!suppressClick.current) return;
                    suppressClick.current = false;
                    if (event.detail === 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onFocusCapture={() => setManuallyPaused(true)}
                onKeyDown={handleKeyDown}
            >
                <div className="absolute inset-0" aria-live={playing ? "off" : "polite"} aria-atomic="false">
                {images.map((img, index) => {
                    const imageUrl = imageSource(img.image || img.imageUrl || "");
                    const isActive = index === activeIndex;
                    const altText = img.title || `Banner ${index + 1}`;
                    const href = img.link ? (editorial ? nextBannerHref(img.link) : `/search/${img.link}`) : "";
                    const failed = !imageUrl || imageStates[imageUrl] === "error";
                    const content = (
                        <div className="relative h-full w-full bg-gray-200 dark:bg-gray-700">
                            {failed ? (
                                <div role="img" aria-label={`${altText}: imagen no disponible`} className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-700 dark:text-gray-200">
                                    Imagen no disponible
                                </div>
                            ) : (
                                <>
                                    {imageStates[imageUrl] !== "loaded" && !reducedMotion && <Shimmer className="h-full w-full" aria-hidden="true" />}
                                    <Image
                                        src={imageUrl}
                                        alt={altText}
                                        fill
                                        className="object-cover !z-0"
                                        priority={index === 0}
                                        sizes="100vw"
                                        onLoad={() => setImageStates(previous => ({ ...previous, [imageUrl]: "loaded" }))}
                                        onError={() => setImageStates(previous => ({ ...previous, [imageUrl]: "error" }))}
                                    />
                                </>
                            )}
                        </div>
                    );

                    return (
                        <div
                            key={index}
                            role="group"
                            aria-roledescription="diapositiva"
                            aria-label={`${index + 1} de ${count}`}
                            aria-hidden={!isActive}
                            inert={!isActive}
                            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%'
                            }}
                        >
                            {href ? (
                                <Link
                                    href={href}
                                    className="block h-full w-full"
                                    aria-label={`Ver ${altText}`}
                                    tabIndex={isActive ? 0 : -1}
                                >
                                    {content}
                                </Link>
                            ) : content}
                        </div>
                    );
                })}
                </div>

                {images.length > 1 && (
                    <div className="absolute bottom-1 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center overflow-x-auto rounded-full bg-black/60 px-3 py-0 backdrop-blur-sm md:bottom-6 md:py-2" role="group" aria-label="Controles del carrusel">
                        <button
                            type="button"
                            onPointerDown={event => {
                                if (event.isPrimary && event.button === 0) rotationIntent.current = !manuallyPaused;
                            }}
                            onClick={event => {
                                // Pointer focus pauses before click; retain the action the user pressed.
                                setManuallyPaused(event.detail === 0 ? !manuallyPaused : rotationIntent.current ?? !manuallyPaused);
                                rotationIntent.current = null;
                            }}
                            disabled={reducedMotion}
                            aria-label={reducedMotion ? "Reproducción automática desactivada por movimiento reducido" : manuallyPaused ? "Reanudar carrusel" : "Pausar carrusel"}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white disabled:opacity-50"
                        >
                            {manuallyPaused || reducedMotion ? <PlayIcon className="h-4 w-4" aria-hidden="true" /> : <PauseIcon className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        {images.map((_, index) => (
                            <button
                                key={index}
                                ref={element => { dots.current[index] = element; }}
                                onClick={() => select(index)}
                                className="group/dot flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                                type="button"
                                aria-label={`Mostrar diapositiva ${index + 1} de ${count}`}
                                aria-current={index === activeIndex}
                            >
                                <span aria-hidden="true" className={`h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${index === activeIndex ? "w-8 bg-white" : "w-2.5 bg-white/80 group-hover/dot:bg-white group-hover/dot:w-4"}`} />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default ImageCarousel;
