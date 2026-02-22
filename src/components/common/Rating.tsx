import clsx from "clsx";
import { RatingTypes } from "./type";
import StarIcon from "./icons/StarIcon";

export const Rating = ({
  length = 5,
  star = 0,
  size = "size-4",
  className,
  reviewCount,
  onReviewClick,
}: RatingTypes) => {
  const rating = Number.isFinite(Number(star)) ? Number(star) : 0;
  const filledStars = Math.max(0, Math.min(length, Math.round(rating)));
  const totalReviews =
    typeof reviewCount === "number" && reviewCount > 0 ? reviewCount : 0;
  const hasReviews = totalReviews > 0;

  return (
    <div className={clsx("flex items-center gap-x-2", className)}>
      {hasReviews ? (
        <>
          <div className="flex gap-x-0.5">
            {Array.from({ length }).map((_, index) => (
              <StarIcon
                key={index}
                className={clsx(
                  size,
                  index < filledStars
                    ? "fill-yellow-500"
                    : "fill-neutral-300 dark:fill-neutral-600"
                )}
              />
            ))}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            ({totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"})
          </span>
        </>
      ) : (
        <button
          type="button"
          className="text-sm text-blue-600 underline cursor-pointer"
          onClick={onReviewClick}
        >
          Escribir una reseña
        </button>
      )}
    </div>
  );
};
