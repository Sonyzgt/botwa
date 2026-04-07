import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { config } from '../config.js';
import { log, sleep } from './utils.js';
import { generateTokenMetadata } from '../ai.js';
import fs from 'fs';

/**
 * Bulk Registration
 * Registers each funded wallet as an agent via Clawncher SDK
 */
export const registerAgentsBulk = async () => {
    const wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });

    for (const walletData of wallets) {
        // Allow registration for any wallet that hasn't been registered yet
        if (walletData.apiKey) continue;

        const account = privateKeyToAccount(walletData.privateKey);
        const walletClient = createWalletClient({ 
            account, 
            chain: base, 
            transport: http(config.rpcUrl) 
        });

        log.info(`Registering Agent for ${account.address}...`);

        try {
            // 1. Generate Letter-Only Agent Name
            const meta = await generateTokenMetadata();
            const agentName = meta.agentName || "CrystalGuardian";
            
            // 2. Register via SDK
            const { apiKey } = await ClawnchApiDeployer.register({
                wallet: walletClient,
                publicClient: publicClient,
            }, {
                name: agentName,
                wallet: account.address,
                description: "Automated Bulk Agent"
            });

            if (apiKey) {
                walletData.apiKey = apiKey;
                walletData.status = 'REGISTERED';
                walletData.agentName = agentName;
                fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 4));
                
                // BACKUP: Append to a persistent CSV file
                const backupLine = `${account.address},${walletData.privateKey},${apiKey},${agentName}\n`;
                fs.appendFileSync('keys_backup.csv', backupLine);

                log.success(`Registered Agent: ${agentName} | Key: ${apiKey.slice(0, 10)}... (Backed up!)`);
            }
            await sleep(5000); // 5s delay
        } catch (error) {
            log.error(`Registration failed for ${walletData.address}: ${error.message}`);
            await sleep(5000);
        }
    }
};
