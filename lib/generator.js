import fs from 'fs';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { log } from './utils.js';

export const generateWallets = (count = 60) => {
    log.info(`Generating ${count} new wallets...`);
    const wallets = [];
    
    for (let i = 0; i < count; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            apiKey: null,
            status: 'GENERATED'
        });
    }

    fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 4));
    log.success(`Generated 60 wallets and saved to wallets.json`);
    return wallets;
};
