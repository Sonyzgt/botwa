import { blockchainService } from '../services/blockchain.js';
import { loadWallets } from '../config/index.js';
import { log } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { formatEther } from 'viem';
import { stopSignal } from '../utils/stopSignal.js';

export const distributeFunds = async (asset, amount, adminPrivateKey) => {
    const wallets = loadWallets();
    if (wallets.length === 0) {
        log.error('No wallets found to distribute to!');
        return;
    }

    log.step(`Starting Distribution: ${amount} ${asset} to ${wallets.length} wallets...`);
    
    for (let i = 0; i < wallets.length; i++) {
        stopSignal.check();
        const wallet = wallets[i];
        let success = false;
        let attempts = 0;

        while (!success) {
            attempts++;
            try {
                log.info(`[${i + 1}/${wallets.length}] Sending to ${wallet.address} (Attempt ${attempts})...`);
                
                let tx;
                if (asset === 'ETH') {
                    tx = await blockchainService.transferEth(adminPrivateKey, wallet.address, amount);
                } else {
                    tx = await blockchainService.transferToken(adminPrivateKey, wallet.address, amount);
                }

                const hash = tx.hash || tx;
                log.success(`Done! Hash: ${hash.slice(0, 15)}...`);
                success = true;
            } catch (err) {
                log.error(`Failed: ${err.message}. Retrying in 10s...`);
                await sleep(10000);
                
                if (attempts > 5) {
                    log.warn('Many attempts failed. Please check network/balance.');
                }
            }
        }

        // Delay between wallets for safety
        if (i < wallets.length - 1) {
            await sleep(3000); 
        }
    }

    log.success(`All ${wallets.length} wallets have been funded successfully! 🚀`);
};
