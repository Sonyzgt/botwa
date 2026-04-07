import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { config } from '../config.js';
import { log } from './utils.js';
import { generateTokenMetadata } from '../ai.js';

export const deployTokenSimple = async () => {
    const account = privateKeyToAccount(config.mainPrivateKey.startsWith('0x') ? config.mainPrivateKey : `0x${config.mainPrivateKey}`);
    const walletClient = createWalletClient({ account, chain: base, transport: http(config.rpcUrl) });
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });

    const metadata = await generateTokenMetadata();
    log.info(`Deploying ${metadata.name} (${metadata.symbol}) as ${account.address}...`);

    const deployer = new ClawnchApiDeployer({
        apiKey: config.clawnchApiKey,
        wallet: walletClient,
        publicClient,
        network: 'mainnet'
    });

    await deployer.approveClawnch();

    const result = await deployer.deploy({
        name: metadata.name,
        symbol: metadata.symbol,
        image: metadata.image,
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

    log.success(`Deployed! Hash: ${result.hash || result}`);
    return result;
};
