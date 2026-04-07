import { NekosAPI } from 'nekosapi';

const nekos = new NekosAPI();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateRandomMeta = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomStr = (len) => Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const symbol = randomStr(4);
    let imageUrl = `https://avatar.vercel.sh/${symbol}.png`;
    
    try {
        const img = await nekos.getRandomImage();
        if (img && img.url) imageUrl = img.url;
    } catch (e) {}

    return {
        name: `Token${randomStr(6)}`,
        symbol,
        image: imageUrl
    };
};

export const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
