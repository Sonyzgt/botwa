import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { saveWallets } from '../config/index.js';
import { log } from '../utils/logger.js';

const AGENT_NAMES = [
    "PawBot", "RibbitBot", "MeowBot", "PipBot", "SizzleBot", "WhiskBot", "ClankBot", "SparkBot", "QuillBot", "DriftBot",
    "GlimmerBot", "MirthBot", "DazzleBot", "SwiftBot", "NovaBot", "PulseBot", "VibeBot", "EchoBot", "FluxBot", "ZenBot",
    "LunaBot", "SolarBot", "OrbitBot", "CosmoBot", "AuraBot", "PixelBot", "ByteBot", "GlitchBot", "LogicBot", "CyberBot",
    "TidalBot", "AeroBot", "MagmaBot", "FrostBot", "StoneBot", "LeafBot", "VineBot", "BloomBot", "SproutBot", "SeedBot",
    "AtlasBot", "TitanBot", "ZephyrBot", "VortexBot", "PrismBot", "SpectrumBot", "LoomBot", "CraftBot", "ForgeBot", "MeltBot",
    "SwiftBot", "QuickBot", "NitroBot", "TurboBot", "FlashBot", "DashBot", "ZingBot", "BubblyBot", "MerryBot", "GlitterBot"
];

export const setupWallets = (count = 60, append = false) => {
    log.step(`Initializing ${count} Agent Wallets...`);
    
    const wallets = append ? loadWallets() : [];
    const startIndex = wallets.length;

    for (let i = 0; i < count; i++) {
        const privateKey = generatePrivateKey();
        const account = privateKeyToAccount(privateKey);
        const nameIdx = startIndex + i;
        
        wallets.push({
            agentName: AGENT_NAMES[nameIdx] || `Agent_${nameIdx + 1}`,
            address: account.address,
            privateKey: privateKey,
            status: 'UNREGISTERED',
            apiKey: '',
            lastDeployedAt: 0
        });
        
        log.info(`[${nameIdx + 1}/${startIndex + count}] Generated: ${account.address}`);
    }
    
    saveWallets(wallets);
    log.success(`${count} wallets ${append ? 'added' : 'generated'} and saved to wallets.json.`);
};
