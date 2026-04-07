import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { config, loadWallets, saveWallets } from '../config/index.js';
import { log } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { stopSignal } from '../utils/stopSignal.js';

export const authService = {
    registerAll: async () => {
        const wallets = loadWallets();
        const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });

        log.step('Starting bulk agent registration...');

        for (let i = 0; i < wallets.length; i++) {
            stopSignal.check();
            const wallet = wallets[i];
            if (wallet.apiKey && wallet.status === 'REGISTERED') {
                log.info(`[${i+1}/${wallets.length}] ${wallet.agentName} already registered.`);
                continue;
            }

            try {
                log.info(`[${i+1}/${wallets.length}] Registering ${wallet.agentName}...`);
                
                const account = privateKeyToAccount(wallet.privateKey);

                const result = await ClawnchApiDeployer.register(
                    { publicClient, wallet: account },
                    { 
                        name: wallet.agentName, 
                        wallet: wallet.address,
                        description: `Automated agent for ${wallet.agentName}`
                    }
                );

                if (result && result.apiKey) {
                    wallet.apiKey = result.apiKey;
                    wallet.status = 'REGISTERED';
                    saveWallets(wallets);
                    log.success(`[${i+1}/${wallets.length}] ${wallet.agentName} registered successfully!`);
                }

                // Add delay to avoid rate limit
                if (i < wallets.length - 1) {
                    log.info('Waiting 15s to avoid rate limit...');
                    await sleep(15000);
                }
            } catch (err) {
                log.error(`[${i+1}/${wallets.length}] Registration failed for ${wallet.agentName}: ${err.message}`);
                // Also wait after error to be safe
                await sleep(10000);
            }
        }
        log.success('Bulk registration complete.');
    }
};
