import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameGate } from '../components/GameGate';
import { imagenetImages, getRandomImagenetImage } from '../data/imagenetImages';
import { useTheme } from '../context/ThemeContext';

const SmokePage = () => {
    const { isDark } = useTheme();
    const navigate = useNavigate();
    const [imageKey, setImageKey] = useState(0);
    // Start with the first item (intro text)
    const [currentItem, setCurrentItem] = useState(() => imagenetImages[0]);

    // Redirect to home if not in dark mode
    useEffect(() => {
        if (!isDark) {
            navigate('/');
        }
    }, [isDark, navigate]);

    const handleNewImage = useCallback(() => {
        const newItem = getRandomImagenetImage();
        if (newItem) setCurrentItem(newItem);
        setImageKey(k => k + 1);
    }, []);

    // Don't render if not dark mode (prevents flash before redirect)
    if (!isDark) return null;

    return (
        <div className="flex flex-1 w-full relative">
            <GameGate
                key={imageKey}
                showUI={false}
                initialImage={currentItem?.image}
                initialCaption={currentItem?.caption}
                onNextImage={handleNewImage}
                backgroundColor="transparent"
                config={{
                    smokeDiffusion: 0.00
                }}
                style={{ width: '100%', height: 'calc(100vh - 100px)' }}
            />
        </div>
    );
};

export default SmokePage;
