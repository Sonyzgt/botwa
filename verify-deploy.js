import { clawncherService } from './src/services/clawncher.js';
import { loadWallets, loadProxies } from './src/config/index.js';

const runVerify = async () => {
    const wallets = loadWallets();
    const proxies = loadProxies();
    
    // Pick first registered wallet
    const wallet = wallets.find(w => w.apiKey);
    if (!wallet) {
        console.error('No registered wallet found!');
        return;
    }

    const proxy = proxies[0];
    console.log(`Starting Verified Deployment Test for Agent: ${wallet.agentName}`);
    console.log(`Using Proxy: ${proxy}`);

    try {
        const result = await clawncherService.deploy(
            wallet.apiKey,
            wallet.privateKey,
            "TestProxyCoin",
            "TPC",
            "",
            proxy
        );
        console.log(`DEPLOY SUCCESS! Token: ${result}`);
    } catch (err) {
        console.error(`DEPLOY FAILED: ${err.message}`);
    }
};

runVerify();
