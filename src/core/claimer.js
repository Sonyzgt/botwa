import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawncherClaimer, ClawnchReader, ClawnchPortfolio } from '@clawnch/clawncher-sdk';
import { config, loadWallets } from '../config/index.js';
import { log } from '../utils/logger.js';
import { stopSignal } from '../utils/stopSignal.js';

export const claimAllSubWalletFees = async () => {
    const wallets = loadWallets();
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
    
    log.step('Scanning all sub-wallets for fees...');

    for (const walletData of wallets) {
        stopSignal.check();
        if (!walletData.privateKey) continue;
        
        const account = privateKeyToAccount(walletData.privateKey);
        const walletClient = createWalletClient({ account, chain: base, transport: http(config.rpcUrl) });
        
        const reader = new ClawnchReader({ publicClient, network: 'mainnet' });
        const portfolio = new ClawnchPortfolio({ publicClient, network: 'mainnet' });
        const claimer = new ClawncherClaimer({ wallet: walletClient, publicClient, network: 'mainnet' });

        try {
            const tokens = await portfolio.discoverTokens(account.address);
            if (tokens.length === 0) continue;

            log.info(`Wallet ${account.address}: Found ${tokens.length} tokens.`);

            for (const token of tokens) {
                const fees = await reader.getAvailableFees(account.address, token);
                if (fees > 0n) {
                    log.info(`Claiming fees from ${token}...`);
                    const tx = await claimer.claimAll(token, account.address);
                    log.success(`Claimed! TX: ${tx.hash || tx}`);
                }
            }
        } catch (err) {
            log.error(`Check failed for ${account.address}: ${err.message}`);
        }
    }
    log.success('Scan complete.');
};
