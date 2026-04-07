import { clawncherService } from './src/services/clawncher.js';
import { loadWallets, loadProxies } from './src/config/index.js';

const runAgent3 = async () => {
    const wallets = loadWallets();
    const proxies = loadProxies();
    
    // Agent #3 (Index 2)
    const wallet = wallets[2]; 
    if (!wallet) {
        console.error('Agent #3 not found!');
        return;
    }

    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    console.log(`Manual Deploy for Agent #3: ${wallet.agentName} (${wallet.address})`);
    console.log(`Using Proxy: ${proxy}`);

    try {
        const result = await clawncherService.deploy(
            wallet.apiKey,
            wallet.privateKey,
            "FroggoByte",
            "FRGB",
            "https://image.pollinations.ai/prompt/cyberpunk%20frog%20logo?width=512&height=512&nologo=true",
            proxy
        );
        console.log(`DEPLOY SUCCESS! Token: ${result}`);
    } catch (err) {
        console.error(`DEPLOY FAILED: ${err.message}`);
    }
};

runAgent3();
