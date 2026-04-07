# Mass Multi-Agent Clawncher Bot

This bot scales token deployment by automating 60 unique wallets, each acting as a separate Clawncher agent to bypass the 1-launch-per-hour limit.

## Features

- **Bulk 60-Wallet Generation**: Automated creation of unique wallets.
- **Bulk Funding**: Admin wallet sends ETH (gas) and 105 $CLAWNCH to each sub-wallet.
- **Bulk Registration**: Each wallet registers as an agent with a unique, AI-generated name (letters only).
- **Bulk AI Launching**: Constant token deployment with AI names/symbols (no numbers).

## Setup

1. **Environment**: Update `.env` with:
   - `ADMIN_PRIVATE_KEY`: Must have ~0.15 ETH and ~6300 $CLAWNCH.
   - `OPENAI_API_KEY`: For AI metadata.
   - `RPC_URL`: Base Mainnet RPC.

2. **Install**:
   ```bash
   npm install
   ```

## Usage (The 4 Phases)

| Command | Phase | Description |
|---------|-------|-------------|
| `node index.js setup` | 1. Setup | Generates 60 wallets in `wallets.json` |
| `node index.js fund` | 2. Fund | Sends ETH & $CLAWNCH to all 60 wallets |
| `node index.js register` | 3. Register | Registers 60 unique agents (API keys) |
| `node index.js deploy-all`| 4. Deploy | Sequentially launches 1 token per wallet |

**Full Auto**:
```bash
node index.js full-auto
```

## Security
- All private keys are stored in `wallets.json`. Keep this file safe!
- Agent names and token data are generated without numbers to ensure a premium look.
