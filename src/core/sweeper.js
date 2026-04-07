import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { blockchainService } from '../services/blockchain.js';
import { config, loadWallets } from '../config/index.js';
import { log } from '../utils/logger.js';
import { stopSignal } from '../utils/stopSignal.js';

export const sweepAll = async () => {
    const wallets = loadWallets();
    let adminAddress = config.adminWallet;
    
    if (!adminAddress && config.adminPrivateKey) {
        try {
            adminAddress = privateKeyToAccount(config.adminPrivateKey).address;
        } catch (e) {
            log.error('Invalid Admin Private Key! Cannot derive address.');
            return;
        }
    }
    
    if (!adminAddress) {
        log.error('Admin wallet address not configured! Please set ADMIN_PRIVATE_KEY in .env');
        return;
    }

    log.step(`Starting Sweep: Recovering all funds to ${adminAddress}...`);

    for (const [index, walletData] of wallets.entries()) {
        stopSignal.check();
        if (!walletData.privateKey) continue;
        
        try {
            const bals = await blockchainService.getBalances(walletData.address);
            
            // 1. Sweep CLAWNCH if any
            if (bals.clawnch > 0n) {
                const amount = formatEther(bals.clawnch);
                log.info(`[${index+1}/${wallets.length}] Sweeping ${amount} CLAWNCH from ${walletData.address}...`);
                const tx = await blockchainService.transferToken(walletData.privateKey, adminAddress, amount);
                log.success(`CLAWNCH Swept! TX: ${tx.hash || tx}`);
            }

            // 2. Sweep ETH if any (leave a tiny bit for gas? Or sweep almost everything)
            // For simple sweep, we'll leave ~0.00005 ETH for future gas just in case, 
            // but the user wants "Recover Funds", so let's sweep if it's worth it (> 0.0001 ETH)
            if (bals.eth > 50000000000000n) { // > 0.00005 ETH
                const amountToSweep = formatEther(bals.eth - 30000000000000n); // Leave 0.00003 ETH for gas
                log.info(`[${index+1}/${wallets.length}] Sweeping ${amountToSweep} ETH from ${walletData.address}...`);
                const tx = await blockchainService.transferEth(walletData.privateKey, adminAddress, amountToSweep);
                log.success(`ETH Swept! TX: ${tx.hash || tx}`);
            }

        } catch (err) {
            log.error(`Sweep failed for ${walletData.address}: ${err.message}`);
        }
    }
    log.success('Sweep process complete.');
};
