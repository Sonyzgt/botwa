import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { clawncherService } from '../services/clawncher.js';
import { getAiMetadata } from '../services/ai.js';
import { sleep } from '../utils/helpers.js';
import { log } from '../utils/logger.js';
import { config, loadWallets, saveWallets } from '../config/index.js';
import { appendDeployedToken } from '../utils/csv.js';
import { waitForAvailableProxy, markProxyCooldown } from '../utils/proxyManager.js';
import { stopSignal } from '../utils/stopSignal.js';

export const deployBulkTokens = async (count = 1, startIndex = 0) => {
    const wallets = loadWallets();
    const allRegistered = wallets.filter(w => w.apiKey);
    const registeredWallets = allRegistered.slice(startIndex);
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
    
    if (registeredWallets.length === 0) {
        log.error('No registered agents found from this start index!');
        return;
    }

    const total = registeredWallets.length;
    const startTime = Date.now();
    const deployState = {
        deployed: 0,
        skipped: 0,
        progress: 0,
        status: `Deploying ${total} token(s)...`,
        startTime
    };
    log.renderDeploy(deployState);

    for (let i = 0; i < total; i++) {
        stopSignal.check();
        const wallet = registeredWallets[i];
        const agentNumber = startIndex + i + 1;
        
        // 1. Check balance
        try {
            const balance = await publicClient.getBalance({ address: wallet.address });
            if (balance === 0n) {
                log.warn(`Skipping ${wallet.address}: No ETH for gas.`);
                continue;
            }
        } catch (err) {
            log.error(`Check balance failed: ${err.message}`);
        }

        // 2. Cooldown check
        if (wallet.lastDeployedAt && (Date.now() - wallet.lastDeployedAt) < 3600000) {
            const diff = Date.now() - wallet.lastDeployedAt;
            const remaining = Math.ceil((3600000 - diff) / 60000);
            deployState.status = `[${agentNumber}] Cooldown (${remaining}m left)`;
            log.renderDeploy(deployState);
            continue;
        }

        // 3. Get Metadata
        deployState.status = `Fetching metadata for ${wallet.agentName}...`;
        log.renderDeploy(deployState);
        const meta = await getAiMetadata();
        deployState.status = `[${agentNumber}] Launching: ${meta.name}...`;
        log.renderDeploy(deployState);

        // 4. Deploy with proxy rotation
        let deployed = false;
        while (!deployed) {
            deployState.status = `Waiting for proxy...`;
            log.renderDeploy(deployState);
            const proxy = await waitForAvailableProxy();
            if (proxy) {
                deployState.status = `Using proxy: ${proxy.slice(0, 15)}...`;
                log.renderDeploy(deployState);
            }

            try {
                const output = await clawncherService.deploy(wallet.apiKey, wallet.privateKey, meta.name, meta.symbol, meta.image, proxy);
                log.success(`Deployed! Agent: ${wallet.agentName} | ${meta.name}`);
                deployed = true;
                deployState.deployed++;
                log.renderDeploy(deployState);
                
                // Save timestamp
                wallet.lastDeployedAt = Date.now();
                saveWallets(wallets);

                // If it succeeds, the Clawncher IP is now burnt for 1 hour
                if (proxy) markProxyCooldown(proxy);

                // Save to CSV
                try {
                    appendDeployedToken({
                        agentName: wallet.agentName,
                        walletAddress: wallet.address,
                        tokenAddress: output.trim(),
                        tokenName: meta.name,
                        tokenSymbol: meta.symbol,
                    });
                } catch (saveErr) {
                    log.warn(`Could not save token address: ${saveErr.message}`);
                }
            } catch (err) {
                const msg = err.message.toLowerCase();
                if (msg.includes('rate limit') && msg.includes('per agent')) {
                    deployState.status = `Limit: ${wallet.agentName}`;
                    log.renderDeploy(deployState);
                    // Update timestamp even if it failed so we don't try again soon
                    wallet.lastDeployedAt = Date.now();
                    saveWallets(wallets);
                    break; // Move to next wallet
                } else if (msg.includes('rate limit') && proxy) {
                    deployState.status = `IP Limit! Rotating...`;
                    log.renderDeploy(deployState);
                    markProxyCooldown(proxy);
                } else {
                    log.error(`Deploy failed: ${err.message}`);
                    break; // Non-rate limit error, move to next wallet
                }
            }
        }

        if (deployed && i < total - 1) {
            deployState.status = 'Waiting 60s for cooldown...';
            for (let j = 60000; j > 0; j -= 1000) {
                deployState.status = `Next in ${j / 1000}s`;
                deployState.progress = Math.min(100, Math.floor(((60000 - j) / 60000) * 100));
                log.renderDeploy(deployState);
                await sleep(1000);
            }
        }
    }
    log.success('Finished deployment task.');
};
