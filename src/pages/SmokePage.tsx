import { useState, useCallback } from 'react';
import { GameGate } from '../components/GameGate';
import { getRandomImagenetImage } from '../data/imagenetImages';

const SmokePage = () => {
    const [imageKey, setImageKey] = useState(0);
    const [currentItem, setCurrentItem] = useState(() => getRandomImagenetImage());

    const handleNewImage = useCallback(() => {
        setCurrentItem(getRandomImagenetImage());
        setImageKey(k => k + 1);
    }, []);

    return (
        <div className="flex flex-1 w-full relative">
            <GameGate
                key={imageKey}
                showUI={false}
                initialImage={currentItem?.image}
                onNextImage={handleNewImage}
                backgroundColor="transparent"
                config={{
                    smokeDiffusion: 0.00
                }}
                style={{ width: '100%', height: 'calc(100vh - 100px)' }}
            />
            {currentItem?.caption && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 
                                bg-black/70 rounded-lg text-white text-lg font-medium
                                backdrop-blur-sm shadow-lg pointer-events-none">
                    {currentItem.caption}
                </div>
            )}
        </div>
    );
};

export default SmokePage;
