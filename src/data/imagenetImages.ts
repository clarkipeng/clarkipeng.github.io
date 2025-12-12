// ImageNet images with captions
// Format: [path, caption]
export const imagenetImages: [string, string][] = [
    ['/images/imagenet/American_lobster.jpeg', 'American Lobster'],
    ['/images/imagenet/cock.jpeg', 'Rooster'],
    ['/images/imagenet/drake.jpeg', 'Drake (Duck)'],
    ['/images/imagenet/laptop.jpeg', 'Laptop'],
    ['/images/imagenet/mountain_bike.jpeg', 'Mountain Bike'],
    ['/images/imagenet/mouse.jpeg', 'Computer Mouse'],
    ['/images/imagenet/notebook.jpeg', 'Notebook'],
    ['/images/imagenet/pug.jpeg', 'Pug'],
    ['/images/imagenet/shower_curtain.jpeg', 'Shower Curtain'],
    ['/images/imagenet/unicycle.jpeg', 'Unicycle'],
];

export const getRandomImagenetImage = (): { image: string; caption: string } | undefined => {
    if (imagenetImages.length === 0) return undefined;
    const item = imagenetImages[Math.floor(Math.random() * imagenetImages.length)];
    return { image: item[0], caption: item[1] };
};
