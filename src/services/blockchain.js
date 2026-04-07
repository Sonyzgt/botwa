import { createWalletClient, createPublicClient, http, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { config } from '../config/index.js';

export const blockchainService = {
    getBalances: async (address) => {
        const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
        const ethBalance = await publicClient.getBalance({ address });
        
        // ERC20 Balance (CLAWNCH)
        let clawnchBalance = 0n;
        try {
            clawnchBalance = await publicClient.readContract({
                address: config.clawnchToken,
                abi: [{
                    name: 'balanceOf',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }]
                }],
                functionName: 'balanceOf',
                args: [address]
            });
        } catch (err) {
            // Silently fail to 0 if token check fails
        }

        return { eth: ethBalance, clawnch: clawnchBalance };
    },

    transferEth: async (privateKey, to, amount) => {
        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({ account, chain: base, transport: http(config.rpcUrl) });
        return await walletClient.sendTransaction({
            to,
            value: parseEther(amount)
        });
    },

    transferToken: async (privateKey, to, amount) => {
        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({ account, chain: base, transport: http(config.rpcUrl) });
        return await walletClient.writeContract({
            address: config.clawnchToken,
            abi: [{
                name: 'transfer',
                type: 'function',
                stateMutability: 'nonpayable',
                inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
                outputs: [{ name: '', type: 'bool' }]
            }],
            functionName: 'transfer',
            args: [to, parseUnits(amount, 18)]
        });
    }
};
