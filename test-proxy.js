import { fetch, ProxyAgent } from 'undici';
import { loadProxies } from './src/config/index.js';

const testProxy = async (proxyUrl) => {
    console.log(`Testing proxy: ${proxyUrl}`);

    try {
        const dispatcher = new ProxyAgent(proxyUrl);
        const res = await fetch('https://api.ipify.org?format=json', {
            dispatcher,
            connectTimeout: 5000
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log(`Success! IP is: ${data.ip}`);
    } catch (err) {
        console.error(`Failed: ${err.message}`);
    }
};

const proxies = loadProxies();
console.log(`Loaded ${proxies.length} proxies from proxies.txt`);

if (proxies.length === 0) {
    console.error('No proxies loaded! Check proxies.txt format.');
} else {
    for (const p of proxies.slice(0, 110)) {
        await testProxy(p);
    }
}
