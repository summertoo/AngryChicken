# Angry Chicken 🐔🎯

> A Web3 physics puzzle game built on **Sui blockchain** with **Walrus decentralized storage** — slingshot chickens to destroy structures and defeat bugs, with on-chain NFT skins, level pack passes, and a community level marketplace.
>
> **🔗 Live Demo:** [https://www.etboodonline.com/project](https://www.etboodonline.com/project)

[![Sui Testnet](https://img.shields.io/badge/Sui-Testnet-4da2ff?logo=sui)](https://sui.io)
[![Walrus](https://img.shields.io/badge/Walrus-Storage-00d4aa)](https://walrus.trade)
[![License](https://img.shields.io/badge/License-MIT-yellow)](#)

---

## 🎮 Overview

Angry Chicken reimagines the classic slingshot puzzle genre as a **fully on-chain Web3 game**. Players launch chickens from a slingshot to smash through wooden, brick, and stone structures, taking down enemy bugs. The game integrates deeply with the **Sui network** (testnet) and uses **Walrus** for decentralized level storage.

---

## ⛓️ Sui Blockchain Integration

### Smart Contract (`game.move`)

A Sui Move contract deployed on **Sui Testnet** powers all game economies:

| Feature | Description |
|---------|-------------|
| **NFT Chicken Skins** | `ChickenSkin` objects with rendering parameters (color, pattern, eyes, accessories, rarity) — minted via crafting or blind boxes |
| **Skin Blind Boxes** | `SkinBox` objects — randomized skin drops using epoch-seeded pseudo-randomness |
| **Level Pack Passes** | `LevelPackPass` objects gate premium levels (21+); each pass unlocks 10 levels |
| **Community Level Marketplace** | `UserLevel` objects store level metadata; users publish, browse, rate, and purchase play access to community-created levels |
| **Treasury** | All v2 payment flows send SUI to a fixed on-chain beneficiary address |

**Contract details:**
- **Package ID (testnet):** `0xaaf917ee09c8359c09a716a0665e1d42d90c02597e5508115aa67e5a0d981481`
- **Language:** Sui Move (edition `2024.beta`)
- **Module:** `crazych_game::game`

### Sui SDK

Built with `@mysten/sui` v1.45.2 and `@mysten/wallet-standard` for:
- **Wallet connectivity** — dynamic detection of wallet-standard compliant Sui wallets (fallback to legacy `window.suiWallet`)
- **Transaction building & execution** — all gas payments in SUI (testnet)
- **On-chain queries** — owned objects (skins, passes), published levels, events

### On-Chain Economy

| Action | Cost (SUI) |
|--------|-----------|
| Skin Blind Box | 0.1 SUI |
| Skin Crafting | 0.3 SUI |
| Level Pack Pass (10 levels) | 0.1 SUI |
| Preset Skins (Shop) | 1–2 SUI |

---

## 🗄️ Walrus Decentralized Storage

[**Walrus**](https://walrus.trade) provides **decentralized blob storage** for all user-generated level data:

- **Level Upload** — Level JSON configurations are uploaded to the Walrus publisher at `https://publisher.walrus-testnet.walrus.space/v1/blobs`
- **Level Download** — Levels are fetched from the Walrus aggregator at `https://aggregator.walrus-testnet.walrus.space/v1/blobs` using a `blobId`
- **Blob → On-Chain Linking** — The Walrus `blobId` is recorded on Sui via `publish_level`, creating a permanent link between storage and blockchain
- **Shared URLs** — Levels can be shared directly via `?blob=<blobId>` URL parameters

This architecture keeps game data **immutable, decentralized, and verifiable** while leveraging Sui for ownership, access control, and payments.

---

## 🏗️ Architecture

```
Browser (Canvas 2D + Box2D WASM)
    │
    ├── Game Engine (Game.ts, Slingshot.ts, StateMachine.ts)
    ├── Physics (Box2D WASM via box2d-wasm)
    ├── Rendering (Canvas 2D + PNG Sprite Atlas)
    └── Web3 Layer
        ├── WalletManager.ts — Sui wallet connectivity
        ├── SuiClient.ts — On-chain Move calls
        ├── WalrusClient.ts — Decentralized level storage
        └── LevelMarket.ts — Community level marketplace
            │
            ▼
    Sui Testnet ←──→ Walrus Testnet
    (Fullnode RPC)    (Publisher / Aggregator)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Sui wallet (e.g., [Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil)) with testnet SUI

### Run Locally

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Smart Contract Development

```bash
cd contracts/crazych_game
sui move build
```

---

## 📁 Project Structure

```
├── index.html                # Main entry (all UI overlays + canvas)
├── src/
│   ├── main.ts               # Application entry, game loop, UI
│   ├── game/                 # Core engine (Game, Slingshot, StateMachine, Audio, Particles)
│   ├── physics/              # Box2D WASM wrapper
│   ├── render/               # Canvas 2D renderer + sprite atlas
│   ├── levels/               # Level types + 75+ built-in levels
│   ├── editor/               # Level editor (admin + user)
│   └── web3/                 # Sui & Walrus integration
│       ├── config.ts         # Network constants
│       ├── WalletManager.ts  # Wallet connection & signing
│       ├── SuiClient.ts      # Move call wrappers
│       ├── WalrusClient.ts   # Walrus blob operations
│       ├── LevelMarket.ts    # Community market browser
│       └── SkinRenderer.ts   # On-chain skin → canvas renderer
├── contracts/
│   └── crazych_game/         # Sui Move smart contract
└── public/                   # Static assets (sprites, audio)
```

---

## 🧩 Key Features

- **75+ built-in levels** (1–20 free, 21+ gated by pack passes)
- **On-chain NFT skins** — craft, unbox, or buy from the shop
- **Community level editor** — create, publish to Walrus, and monetize on Sui
- **Level marketplace** — browse, rate, and purchase access to user-generated levels
- **Seasonal environments** — dynamic weather, time-of-day, and seasons affecting gameplay
- **Full i18n** — English & Chinese support

---

## 🧪 Smart Contract Tests

```bash
cd contracts/crazych_game
sui move test
```

Tests cover: `test_craft_skin`, `test_publish_level`, `test_purchase_pack_pass`.

---

## 🌐 Networks

| Component | Network | Endpoint |
|-----------|---------|----------|
| Sui Fullnode | Testnet | `https://fullnode.testnet.sui.io:443` |
| Walrus Publisher | Testnet | `https://publisher.walrus-testnet.walrus.space/v1/blobs` |
| Walrus Aggregator | Testnet | `https://aggregator.walrus-testnet.walrus.space/v1/blobs` |

---

## 📄 License

MIT
