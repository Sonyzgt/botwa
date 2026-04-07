import { exec } from 'child_process';
import { log, sleep } from './lib/utils.js';

/**
 * CONFIGURATION
 * Edit these settings as needed
 */
const CONFIG = {
    baseDelay: 5000,       // Default delay 5 seconds
    randomDelayRange: [3000, 10000], // Random delay between 3-10 seconds
    retryLimit: 1          // Number of retries on failure (1 means 1 extra attempt)
};

let TOTAL_DEPLOYED = 0;

/**
 * DEXSCREENER TOKEN NAME SCRAPER
 * Step 1: Fetch top boosted token addresses from /token-boosts/top/v1
 * Step 2: Get actual name/symbol from /tokens/v1/{chainId}/{addresses}
 */
let cachedTokens = [];

const fetchDexScreenerTokens = async () => {
    try {
        // Step 1: Get top boosted tokens
        const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
        if (!boostRes.ok) throw new Error(`Boost API HTTP ${boostRes.status}`);
        const boosts = await boostRes.json();

        // Group by chainId
        const byChain = {};
        for (const b of boosts) {
            if (!byChain[b.chainId]) byChain[b.chainId] = [];
            byChain[b.chainId].push(b.tokenAddress);
        }

        const allTokens = [];

        // Step 2: Fetch name/symbol per chain (max 30 addresses per call)
        for (const [chainId, addresses] of Object.entries(byChain)) {
            const batch = addresses.slice(0, 30).join(',');
            try {
                const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${batch}`);
                if (!res.ok) continue;
                const pairs = await res.json();

                for (const pair of pairs) {
                    if (pair.baseToken?.name && pair.baseToken?.symbol) {
                        allTokens.push({
                            name: pair.baseToken.name,
                            symbol: pair.baseToken.symbol,
                            image: pair.info?.imageUrl || ''
                        });
                    }
                }
            } catch (e) { continue; }
        }

        // Deduplicate by symbol
        const seen = new Set();
        return allTokens.filter(t => {
            const key = t.symbol.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return t.name.length <= 32 && t.symbol.length <= 10;
        });
    } catch (err) {
        console.error(`DexScreener fetch failed: ${err.message}`);
        return [];
    }
};

/**
 * HELPERS
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateMetadata = async () => {
    // Refill cache if empty
    if (cachedTokens.length === 0) {
        cachedTokens = await fetchDexScreenerTokens();
    }

    // Pick a random token from cache
    if (cachedTokens.length > 0) {
        const idx = Math.floor(Math.random() * cachedTokens.length);
        const token = cachedTokens.splice(idx, 1)[0]; // Remove to avoid duplicates
        return { name: token.name, symbol: token.symbol, image: token.image };
    }

    // Fallback if DexScreener completely fails
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomStr = (len) => Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return { name: `Token${randomStr(6)}`, symbol: randomStr(4) };
};

// Use log from lib/utils.js

/**
 * DEPLOY LOGIC
 * Uses child_process to call 'clawncher deploy'
 */
const executeDeploy = async (attempt = 1) => {
    const metadata = await generateMetadata();
    // Assuming clawncher CLI is installed and wallet is already imported
    const imageFlag = metadata.image ? ` --image "${metadata.image}"` : '';
    const command = `clawncher deploy --name "${metadata.name}" --symbol "${metadata.symbol}" --description "Automated CLI launch"${imageFlag} --network mainnet --yes`;

    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                log.error(`Failed: ${metadata.name}`);
                resolve({ success: false, name: metadata.name });
            } else {
                TOTAL_DEPLOYED++;
                log.success(`Deployed: ${metadata.name} [Total: ${TOTAL_DEPLOYED}]`);
                resolve({ success: true, name: metadata.name });
            }
        });
    });
};

/**
 * MAIN LOOP
 */
const startAutomation = async () => {
    console.clear();
    let skippedCount = 0;
    const startTime = Date.now();
    const deployState = {
        deployed: 0,
        skipped: 0,
        progress: 0,
        status: 'Starting automation...',
        startTime
    };

    while (true) {
        deployState.status = 'Generating metadata...';
        log.renderDeploy(deployState);
        
        const res = await executeDeploy();
        
        if (!res.success) {
            skippedCount++;
            deployState.status = 'Retrying in 5 seconds...';
            log.renderDeploy(deployState);
            await sleep(5000);
            await executeDeploy();
        }

        deployState.deployed = TOTAL_DEPLOYED;
        deployState.skipped = skippedCount;

        const randomDelay = Math.floor(Math.random() * (CONFIG.randomDelayRange[1] - CONFIG.randomDelayRange[0])) + CONFIG.randomDelayRange[0];
        
        // Dynamic wait countdown
        for (let i = randomDelay; i > 0; i -= 100) {
            deployState.status = `Next in ${(i / 1000).toFixed(1)}s`;
            deployState.progress = Math.min(100, Math.floor(((randomDelay - i) / randomDelay) * 100));
            log.renderDeploy(deployState);
            await sleep(100);
        }
    }
};

startAutomation().catch(err => {
    console.error("\nCritical System Failure:", err);
    process.exit(1);
});
