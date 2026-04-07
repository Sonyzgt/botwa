import { clawncherService } from '../services/clawncher.js';
import { getAiMetadata } from '../services/ai.js';
import { getRandomDelay, sleep } from '../utils/helpers.js';
import { log } from '../utils/logger.js';
import { loadWallets, saveWallets } from '../config/index.js';
import { waitForAvailableProxy, markProxyCooldown } from '../utils/proxyManager.js';
import { appendDeployedToken } from '../utils/csv.js';

export const MODES = {
    SAFE: { name: 'Safe Mode (8–15s)', min: 8000, max: 15000 },
    NORMAL: { name: 'Normal Mode (3–5s)', min: 3000, max: 5000 },
    BRUTAL: { name: 'Brutal Mode (1–2s)', min: 1000, max: 2000 }
};

export class AutoDeployer {
    constructor() {
        this.mode = MODES.SAFE;
        this.isRunning = false;
        this.count = 0;
        this.skipped = 0;
        this.startTime = Date.now();
        this.deployState = {
            deployed: 0,
            skipped: 0,
            progress: 0,
            status: 'Initializing...',
            startTime: this.startTime
        };
    }

    setMode(modeKey) {
        this.mode = MODES[modeKey];
    }

    async start() {
        const wallets = loadWallets();
        const registeredWallets = wallets.filter(w => w.apiKey && w.status === 'REGISTERED');
        
        if (registeredWallets.length === 0) {
            log.error('No registered agents found in wallets.json!');
            return;
        }

        this.isRunning = true;
        this.startTime = Date.now();
        this.deployState.startTime = this.startTime;
        this.deployState.status = `Starting loop (1 to ${registeredWallets.length})`;
        log.renderDeploy(this.deployState);

        let currentIndex = 0;

        while (this.isRunning) {
            // Pick wallet sequentially, loop back if at end
            const wallet = registeredWallets[currentIndex];
            
            // Increment index for next iteration, or wrap around
            currentIndex = (currentIndex + 1) % registeredWallets.length;
            if (wallet.lastDeployedAt && (Date.now() - wallet.lastDeployedAt) < 3600000) {
                const diff = Date.now() - wallet.lastDeployedAt;
                const remaining = Math.ceil((3600000 - diff) / 60000);
                this.deployState.status = `[#${currentIndex === 0 ? registeredWallets.length : currentIndex}] Cooldown (${remaining}m left)`;
                log.renderDeploy(this.deployState);
                await sleep(500); 
                continue;
            }

            const meta = await getAiMetadata();
            const delay = getRandomDelay(this.mode.min, this.mode.max);

            let deployed = false;
            while (!deployed && this.isRunning) {
                this.deployState.status = `Waiting for proxy...`;
                log.renderDeploy(this.deployState);
                const proxy = await waitForAvailableProxy(this.deployState);

                this.deployState.status = `[#${currentIndex === 0 ? registeredWallets.length : currentIndex}] Deploying ${meta.name}...`;
                log.renderDeploy(this.deployState);

                try {
                    const out = await clawncherService.deploy(wallet.apiKey, wallet.privateKey, meta.name, meta.symbol, meta.image || '', proxy);
                    this.count++;
                    log.success(`Deployed! ${wallet.agentName} | ${meta.name} [Total: ${this.count}]`);
                    deployed = true;

                    // Save timestamp
                    wallet.lastDeployedAt = Date.now();
                    saveWallets(wallets);
                    
                    // Save to CSV for dashboard
                    try {
                        appendDeployedToken({ 
                            agentName: wallet.agentName, 
                            walletAddress: wallet.address, 
                            tokenAddress: out.trim(), 
                            tokenName: meta.name, 
                            tokenSymbol: meta.symbol 
                        });
                    } catch (_) {}

                    // Burnt IP for 1 hr on success
                    if (proxy) markProxyCooldown(proxy);
                } catch (err) {
                    const msg = err.message.toLowerCase();
                    if (msg.includes('rate limit') && msg.includes('per agent')) {
                        this.deployState.status = `Limit reached for ${wallet.agentName}`;
                        log.renderDeploy(this.deployState);
                        wallet.lastDeployedAt = Date.now();
                        saveWallets(wallets);
                        break; 
                    } else if (msg.includes('rate limit') && proxy) {
                        this.deployState.status = `IP Rate limit! Rotating...`;
                        log.renderDeploy(this.deployState);
                        markProxyCooldown(proxy);
                    } else {
                        log.error(`Deploy failed: ${err.message}`);
                        break; 
                    }
                }
            }

            // Sync totals
            this.deployState.deployed = this.count;
            this.deployState.skipped = this.skipped;

            // Dynamic wait countdown
            for (let i = delay; i > 0; i -= 100) {
                this.deployState.status = `Next in ${(i / 1000).toFixed(1)}s`;
                this.deployState.progress = Math.min(100, Math.floor(((delay - i) / delay) * 100));
                log.renderDeploy(this.deployState);
                await sleep(100);
            }
        }
    }

    stop() {
        this.isRunning = false;
    }
}
