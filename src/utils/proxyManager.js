import { loadProxies } from '../config/index.js';
import { log } from './logger.js';
import { sleep } from './helpers.js';

let proxies = [];
const cooldowns = new Map(); // map structure: proxyString -> timestamp of expiry
const ONE_HOUR = 3600000;

export const initProxies = () => {
    proxies = loadProxies();
    if (log && typeof log.info === 'function') {
        log.info(`Proxy Manager Initialized: loaded ${proxies.length || 0} proxies.`);
    } else {
        console.log(`[Proxy] Initialized: loaded ${proxies.length || 0} proxies.`);
    }
};

// Gets the base IP of a proxy (e.g., http://user:pass@12.34.56.78:8000 -> 12.34.56.78)
export const getProxyIp = (proxyUrl) => {
    try {
        const url = new URL(proxyUrl);
        return url.hostname;
    } catch {
        return proxyUrl;
    }
};

// Get next available proxy that is not on cooldown
export const getNextProxy = () => {
    if (proxies.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < proxies.length; i++) {
        // Randomly pick or sequentially. Let's do random to distribute load.
        // Wait, sequentially is usually better to ensure we use all of them once before reusing.
        // But for simplicity, we can shuffle or find the first available.
        const proxy = proxies[i];
        if (!cooldowns.has(proxy) || cooldowns.get(proxy) <= now) {
            return proxy;
        }
    }
    return null; // All proxies are on cooldown
};

export const getNextProxyRandom = () => {
    if (proxies.length === 0) return null;
    const now = Date.now();
    const available = proxies.filter(p => !cooldowns.has(p) || cooldowns.get(p) <= now);
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
};

export const markProxyCooldown = (proxy) => {
    if (!proxy) return;
    const expiry = Date.now() + ONE_HOUR;
    cooldowns.set(proxy, expiry);
    // Silent cooldown to avoid log spam
};

export const waitForAvailableProxy = async (deployState = null) => {
    while (true) {
        const proxy = getNextProxyRandom();
        if (proxy) return proxy; // We found one!

        // All are on cooldown. We must wait until the nearest cooldown expires.
        let nearest = Infinity;
        const now = Date.now();
        for (const expiry of cooldowns.values()) {
            if (expiry > now && expiry < nearest) {
                nearest = expiry;
            }
        }
        
        const waitMs = nearest - now;
        const waitMins = Math.ceil(waitMs / 60000);
        if (deployState) {
            deployState.status = `All proxies on cooldown! Pausing for ${waitMins}m...`;
            log.renderDeploy(deployState);
        } else {
            log.warn(`All proxies are on cooldown! Pausing for ${waitMins} minute(s)...`);
        }
        await sleep(waitMs + 5000); // Sleep until it expires + 5s buffer
    }
};

// Export for manual initialization
// Moved out of top-level to avoid circular dependency crash
