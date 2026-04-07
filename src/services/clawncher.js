import { fetch, ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { config } from '../config/index.js';

export const clawncherService = {
    deploy: async (apiKey, privateKey, name, symbol, image, proxy = null) => {
        const account = privateKeyToAccount(privateKey);
        const originalDispatcher = getGlobalDispatcher();
        
        try {
            if (proxy) {
                const proxyUrl = proxy.includes('://') ? proxy : `http://${proxy}`;
                const dispatcher = new ProxyAgent(proxyUrl);
                setGlobalDispatcher(dispatcher);
            }

            const publicClient = createPublicClient({
                chain: base,
                transport: http(config.rpcUrl)
            });

            const wallet = createWalletClient({
                account,
                chain: base,
                transport: http(config.rpcUrl)
            });

            const deployer = new ClawnchApiDeployer({
                apiKey,
                wallet,
                publicClient,
            });

            const result = await deployer.deploy({
                name,
                symbol,
                image,
            });

            return result.tokenAddress || result.txHash || 'Success';
        } finally {
            // Restore original dispatcher
            setGlobalDispatcher(originalDispatcher);
        }
    }
};
