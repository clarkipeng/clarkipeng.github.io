import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const Carousel = ({ images }: { images: string[] }) => {
  const [c, setC] = useState(0), [p, setP] = useState(0);
  const move = (d: number) => { setP(c); setC((c + d + images.length) % images.length); };
  const isV = (s: string) => s?.toLowerCase().endsWith('.mp4');
  const Media = ({ s, cl, lp = false }: any) => isV(s) ?
    <video src={s} className={cl} autoPlay muted playsInline loop={lp} /> :
    <img src={s} className={cl} alt="" draggable={false} />;

  if (!images?.length) return null;

  return (
    <div className="relative group w-full h-full overflow-hidden rounded bg-black">
      <Media s={images[p]} cl="absolute inset-0 w-full h-full object-cover" />
      {images.map((src, i) => (
        <div key={i} className={`absolute inset-0 transition-opacity duration-500 ${i === c ? 'z-10 opacity-100' : 'z-0 opacity-0'}`}>
          <Media s={src} cl="w-full h-full object-cover pointer-events-none" />
        </div>
      ))}
      {images.length > 1 && (
        <div className="absolute inset-0 z-20 flex text-white">
          <button onClick={(e) => { e.stopPropagation(); move(-1); }} className="flex-1 flex items-center justify-start pl-4 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gradient-to-r from-black/20"><ChevronLeft size={16} strokeWidth={1.5} /></button>
          <button onClick={(e) => { e.stopPropagation(); move(1); }} className="flex-1 flex items-center justify-end pr-4 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gradient-to-l from-black/20"><ChevronRight size={16} strokeWidth={1.5} /></button>
        </div>
      )}
    </div>
  );
};