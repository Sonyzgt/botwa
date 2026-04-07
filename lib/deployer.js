import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { config } from '../config.js';
import { log, sleep } from './utils.js';
import { generateTokenMetadata } from '../ai.js';
import { appendDeployedToken } from '../src/utils/csv.js';
import fs from 'fs';

export const deployBulkTokens = async (limit = 999) => {
    const wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });

    let deployedCount = 0;
    let skippedCount = 0;
    const startTime = Date.now();
    const deployState = {
        deployed: 0,
        skipped: 0,
        progress: 0,
        status: 'Starting bulk deploy...',
        startTime
    };
    log.renderDeploy(deployState);

    for (const walletData of wallets) {
        if (walletData.status !== 'REGISTERED') continue;

        const account = privateKeyToAccount(walletData.privateKey);
        const walletClient = createWalletClient({ account, chain: base, transport: http(config.rpcUrl) });
        
        deployState.status = `Processing: ${account.address.slice(0, 8)}...`;
        log.renderDeploy(deployState);

        try {
            deployState.status = `Generating metadata...`;
            log.renderDeploy(deployState);
            const metadata = await generateTokenMetadata();
            deployState.status = `Launching ${metadata.name}...`;
            log.renderDeploy(deployState);

            const deployer = new ClawnchApiDeployer({
                apiKey: walletData.apiKey,
                wallet: walletClient,
                publicClient,
                network: 'mainnet'
            });

            deployState.status = `Approving $CLAWNCH...`;
            log.renderDeploy(deployState);
            await deployer.approveClawnch();

            deployState.status = `Launching token...`;
            log.renderDeploy(deployState);
            const tx = await deployer.deploy({
                name: metadata.name,
                symbol: metadata.symbol,
                image: metadata.image || "https://avatar.vercel.sh/clawnch.png",
                description: metadata.description,
                rewards: {
                    recipients: [
                        {
                            recipient: account.address,
                            bps: 1000,
                            feePreference: 'Paired'
                        }
                    ]
                }
            });

            log.success(`Token Deployed! Hash: ${tx.hash || tx}`);
            
            walletData.status = 'DEPLOYED';
            // DO NOT save token metadata to wallets.json anymore
            fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 4));

            // Save to deployed_tokens.csv instead
            appendDeployedToken({
                agentName: walletData.agentName || 'Agent',
                walletAddress: account.address,
                tokenAddress: tx.tokenAddress || tx.hash || tx, // Or any known token address logic from deployer result
                tokenName: metadata.name,
                tokenSymbol: metadata.symbol
            });

            log.success(`Token Deployed: ${metadata.symbol} [Total: ${deployedCount}]`);

            // Sync state
            deployState.deployed = deployedCount;
            deployState.skipped = skippedCount;

            deployState.status = "Waiting 60s for cooldown...";
            for (let i = 60000; i > 0; i -= 1000) {
                deployState.status = `Next in ${i / 1000}s`;
                deployState.progress = Math.min(100, Math.floor(((60000 - i) / 60000) * 100));
                log.renderDeploy(deployState);
                await sleep(1000);
            }
        } catch (error) {
            skippedCount++;
            deployState.skipped = skippedCount;
            deployState.status = `Error: ${account.address.slice(0, 8)}...`;
            log.renderDeploy(deployState);
            // Briefly show error in history if critical, otherwise status is enough
            if (!error.message.includes('rate limit')) {
                log.error(`Failed: ${account.address.slice(0, 8)} - ${error.message.split('\n')[0]}`);
            }
        }
    }
};
