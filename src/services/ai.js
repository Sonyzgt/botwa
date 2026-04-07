/**
 * DexScreener-based Token Metadata Generator
 * Replaces OpenAI with real token data from DexScreener's top boosted tokens.
 */

let cachedTokens = [];

const fetchDexScreenerTokens = async () => {
    try {
        const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
        if (!boostRes.ok) throw new Error(`Boost API HTTP ${boostRes.status}`);
        const boosts = await boostRes.json();

        const byChain = {};
        for (const b of boosts) {
            if (!byChain[b.chainId]) byChain[b.chainId] = [];
            byChain[b.chainId].push(b.tokenAddress);
        }

        const allTokens = [];

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
                            image: pair.info?.imageUrl || '',
                            description: pair.info?.description || ''
                        });
                    }
                }
            } catch (e) { continue; }
        }

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

export const getAiMetadata = async () => {
    if (cachedTokens.length === 0) {
        cachedTokens = await fetchDexScreenerTokens();
    }

    if (cachedTokens.length > 0) {
        const idx = Math.floor(Math.random() * cachedTokens.length);
        const token = cachedTokens.splice(idx, 1)[0];
        return {
            name: token.name,
            symbol: token.symbol,
            description: token.description || `${token.name} token`,
            agentName: `${token.symbol}Agent`,
            image: token.image || `https://avatar.vercel.sh/${token.symbol}.png`
        };
    }

    // Fallback
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomName = Array.from({length: 8}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return {
        name: `Token${randomName}`,
        symbol: randomName.slice(0, 4),
        description: 'An automated token',
        agentName: `Agent${randomName}`,
        image: `https://avatar.vercel.sh/${randomName}.png`
    };
};
