import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type CarouselProps = {
  images?: string[];
  label?: string;
};

type MediaProps = {
  src: string;
  className: string;
  label: string;
};

const isVideo = (src: string) => src.toLowerCase().endsWith('.mp4');

const Media = ({ src, className, label }: MediaProps) => (
  isVideo(src)
    ? <video src={src} className={className} autoPlay muted playsInline loop preload="metadata" />
    : <img src={src} className={className} alt={label} draggable={false} loading="lazy" />
);

export const Carousel = ({ images = [], label = '' }: CarouselProps) => {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/[0.04] font-sans text-sm text-[#676760] dark:bg-white/[0.06] dark:text-[#b9b9b0]">
        {label}
      </div>
    );
  }

  const move = (delta: number) => {
    setCurrent((value) => (value + delta + images.length) % images.length);
  };

  return (
    <div className="group relative h-full w-full overflow-hidden bg-black">
      {images.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-500 ${
            index === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Media src={src} className="h-full w-full object-cover" label={label} />
        </div>
      ))}

      {images.length > 1 && (
        <div className="absolute inset-0 flex text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            className="flex flex-1 items-center justify-start bg-gradient-to-r from-black/20 pl-3"
            aria-label="Previous image"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            className="flex flex-1 items-center justify-end bg-gradient-to-l from-black/20 pr-3"
            aria-label="Next image"
            type="button"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
