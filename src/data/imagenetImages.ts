// ImageNet images with captions
// image?: string (optional image path)
// caption: string (required - shown as text, or overlaid on image)
export interface ImagenetItem {
    image?: string;
    caption: string;
}

export const imagenetImages: ImagenetItem[] = [
    { caption: 'My Favorite ImageNet-1K examples' },  // Text-only (no image)
    { image: '/images/imagenet/American_lobster.jpeg', caption: 'American Lobster' },
    // { image: '/images/imagenet/cock.jpeg', caption: 'Cock' },
    { image: '/images/imagenet/drake.jpeg', caption: 'Drake' },
    // { image: '/images/imagenet/laptop.jpeg', caption: 'Laptop' },
    { image: '/images/imagenet/mountain_bike.jpeg', caption: 'Mountain Bike' },
    // { image: '/images/imagenet/mouse.jpeg', caption: 'Computer Mouse' },
    { image: '/images/imagenet/notebook.jpeg', caption: 'Notebook' },
    { image: '/images/imagenet/pug.jpeg', caption: 'Pug' },
    { image: '/images/imagenet/shower_curtain.jpeg', caption: 'Shower Curtain' },
    // { image: '/images/imagenet/unicycle.jpeg', caption: 'Unicycle' },
];

// Get only the actual images (skip the intro text-only item at index 0)
const imageOnlyItems = imagenetImages.slice(1);

// Shuffle array using Fisher-Yates algorithm
const shuffleArray = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// Maintain a queue of remaining images to show
let remainingImages: ImagenetItem[] = [];

export const getRandomImagenetImage = (): ImagenetItem | undefined => {
    if (imageOnlyItems.length === 0) return undefined;

    // If we've shown all images, reshuffle
    if (remainingImages.length === 0) {
        remainingImages = shuffleArray(imageOnlyItems);
    }

    // Pop and return the next image
    return remainingImages.pop();
};
