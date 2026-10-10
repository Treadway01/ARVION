# ARVION

**Your Seeker becomes your trusted access and ownership device.**

ARVION is a Seeker-native authorization and ownership layer on Solana. One wallet-signed authorization primitive powers access to places and things, shared and paid access (optionally priced in SKR), and verifiable asset ownership. It is an Android app built with Expo and React Native, backed by a small Fastify API and a shared TypeScript authorization engine.

Built for the **Solana Mobile CLOCK IN** hackathon.

| | |
|---|---|
| **Android APK** | See the [Releases](../../releases) page |
| **Demo video** | _add link_ |
| **Pitch deck** | _add link_ |
| **Hosted API** | https://arvion-qkty.onrender.com (free tier, sleeps when idle) |
| **Package ID** | `com.treadway01.arvion` |
| **License** | MIT |

---

## Table of contents

1. [The problem](#1-the-problem)
2. [The idea](#2-the-idea)
3. [What the app does](#3-what-the-app-does)
4. [Real versus simulated](#4-real-versus-simulated)
5. [How Seeker and Solana are used](#5-how-seeker-and-solana-are-used)
6. [Demo walkthrough](#6-demo-walkthrough)
7. [Architecture](#7-architecture)
8. [The authorization protocol](#8-the-authorization-protocol)
9. [Security model](#9-security-model)
10. [API reference](#10-api-reference)
11. [Data model](#11-data-model)
12. [Project structure](#12-project-structure)
13. [Run it yourself](#13-run-it-yourself)
14. [Configuration](#14-configuration)
15. [Deployment](#15-deployment)
16. [Testing](#16-testing)
17. [Design principles and decisions](#17-design-principles-and-decisions)
18. [Development journey](#18-development-journey)
19. [Known limitations](#19-known-limitations)
20. [Roadmap](#20-roadmap)
21. [Business model](#21-business-model)
22. [Hackathon criteria](#22-hackathon-criteria)
23. [License](#23-license)

---

## 1. The problem

Identity, permission and ownership live in separate systems.

- Wallets prove that you own tokens.
- Passwords prove that you own accounts.
- Keycards prove that you may enter a building.
- Tickets prove that you may enter an event.
- Separate databases record who owns a camera, a vehicle or a membership.

Each service builds its own login, its own permission model and its own audit trail. The user carries a different credential for every one of them, and an owner who wants to lend something to someone has no simple, verifiable way to do it.

## 2. The idea

A Seeker phone is already a hardware wallet with a secure signing flow. ARVION makes it the one trusted device for everything that follows from identity:

```
IDENTITY  ->  AUTHORIZATION  ->  ACCESS / OWNERSHIP  ->  ACTIVITY  ->  SECURITY
```

- **Identity** says who the user is, using the connected wallet and the Seeker signals that really exist on-chain.
- **Authorization** says who may do what, for how long. It is a signed, verifiable record, not a database flag.
- **Access** consumes authorizations. Every grant or denial comes from the authorization engine.
- **Ownership (OWNR)** records what a user owns and lets them authorize or transfer it.
- **Activity** is the audit trail of everything above.
- **Security** explains the current state of all of it and what needs attention.

The key design choice is that authorization is a reusable primitive. A door, a shared camera, a paid pass and an asset transfer all use the same engine.

SKR is an optional economic layer inside that engine. An owner who lends something out can attach a price in SKR. Ordinary use of your own assets never costs anything.


## 3. What the app does

### Identity
- Connect a Solana wallet through "Mobile Wallet Adapter". The app never sees keys or seed phrases.
- Checks the wallet on **Solana mainnet** for a :Seeker Genesis Token" and a "`.skr` name", and shows exactly what was found. A wallet without them shows an honest "not found" state, never a fake badge.
- Wallet connected, disconnected and identity-check events are recorded.

### Authorization
- An "issuer" signs the terms of an authorization: the resource, the permissions, the duration and an optional SKR price.
- The "holder" reviews the request on a dedicated screen (who, what, permissions, duration, price) and "approves"  or "denies" it with a wallet signature.
- The issuer can "revoke" at any time. Expired, revoked, denied and voided credentials are refused by the engine, not just hidden in the interface.
- A full lifecycle timeline (requested, approved, denied, revoked) is shown per authorization.

### Access
- Lists credentials issued "to you" and "by you", with Pending, Active and History filters.
- "Use access" runs a real check. The holder signs a fresh, single-use challenge, and the server runs the authorization engine. Only a valid result unlocks the demo controller.
- Denials explain themselves: revoked, expired, wrong resource, missing permission, payment not verified.
- The physical controller is "simulated and labelled as such". No lock is connected.

### Paid access with SKR
- An issuer can require a price in SKR when granting access to another wallet. The price is part of what the issuer signs, so it cannot be changed afterwards.
- Access to your own wallet is always free. The engine and the API both reject a price on self-access.
- The holder approves, then pays with a "real SKR token transfer" through the wallet.
- The API verifies the transaction on-chain before activating the credential: correct token, sender and recipient, enough amount, transaction succeeded, not older than the authorization, and never used twice.
- Until then the credential is in "Payment required and the door refuses it.

### OWNR (assets)
- "Create an asset" from a real object: capture it with the phone camera, describe it (name, category, optional serial, manufacturer, model, reference), review it, and sign it.
- A photograph does not prove ownership, and the app never claims it does. A new asset is "User declared" and carries a signature from the owner wallet over the photo's fingerprint and the details.
- Optionally "anchor the asset on Solana" as a 1-of-1 SPL token. The status then becomes "On-chain verified", checked against the chain.
- "Authorize" another wallet to use an asset (through the same authorization engine), "revoke" that later, and "transfer" an on-chain asset to another wallet.
- After a transfer, the record follows the chain, and authorizations issued by the previous owner are voided.
- Each asset has a detail screen with photo, status, details, authorizations and a history built from real events.

### Activity
- A chronological timeline grouped into Today, Yesterday and Earlier, with filters for Identity, Authorization, Access, Assets, Payments and Security.
- Tap an event to see its result and related events, and open the related authorization or asset.
- Events come only from real operations. There is no seeded history.

### Security center
- One screen showing wallet, identity, authorizations, access, network, transactions and device state, computed from real state.
- Each item offers a corrective action where one exists: reconnect, review, retry.
- It makes no claim it cannot support. Seed Vault status is marked unavailable because no supported API is used.

---

## 4. Real versus simulated

| Component | Status |
|---|---|
| Wallet connection and signing (Mobile Wallet Adapter) | "Real" |
| Authorization engine: signatures, expiry, revocation, denial, replay protection | "Real", covered by automated tests |
| Seeker Genesis Token check | "Real" read from Solana mainnet |
| `.skr` name lookup | "Real" read through AllDomains on mainnet |
| OWNR tokens and transfers | "Real", on Solana devnet |
| SKR payment verification | "Real" on-chain verification logic, covered by automated tests |
| Activity feed | "Real" events from the API |
| Physical door / access controller | "Simulated", labelled "Demo physical controller" |
| Owner Pro subscription | "Roadmap only", no billing exists |
| Seed Vault security status | "Not implemented", no supported API used |
| Push notifications | "Not implemente" |

The app contains "no mock data". If something has no data, the screen says so. If a service is unreachable, the screen says that. Test doubles exist only inside the automated tests.


## 5. How Seeker and Solana are used

| Capability | Use |
|---|---|
| "Mobile Wallet Adapter" (`@solana-mobile/mobile-wallet-adapter-protocol-web3js`) | Wallet connection, message signing and transaction signing, with no keys in the app |
| "Seeker Genesis Token" | A wallet counts as holding one when it has a non-zero Token-2022 balance of a mint whose metadata pointer and token group member both point at `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te` |
| "`.skr` name" | Resolved through AllDomains (`@onsol/tldparser`), as described in the Solana Mobile docs |
| "SKR token" | Optional price for access. The mint address is configurable. The default is the address listed on solanamobile.com/skr, so confirm it there. |
| "SPL Token" (`@solana/spl-token`) | OWNR assets are 1-of-1 tokens with zero decimals and the mint authority removed, so no more can ever be created |
| "Solana RPC" | Reads for identity and ownership, blockhashes and confirmations, and server-side payment verification |

Why this needs a Seeker-class device: every meaningful action is a wallet signature. Authorizations, approvals, denials, revocations, door challenges, asset declarations and payments are all signed, and a phone with a secure wallet makes that the natural interface.

## 6. Demo walkthrough

You can run the whole loop with **one wallet** using "Issue to myself", or with two wallets for a more realistic story.

### Single wallet
1. **Identity:** connect the wallet.
2. **Access, Issue to myself:** choose a 10-minute duration and sign.
3. Open the credential, review it, and **Approve and sign**.
4. Tap **Use access**: the controller checks identity, authorization, permission and expiry, then shows **ACCESS GRANTED**.
5. **Revoke access**, confirm, and tap **Use access** again: **ACCESS DENIED**, authorization revoked.
6. **OWNR, Create asset:** capture a photo, enter details, review and create. Optionally anchor it on-chain.
7. Open the asset, authorize another wallet, or transfer it.
8. **Activity** and **Security:** review the trail and the state.

### Two wallets
1. Wallet A issues an authorization to wallet B, with or without an SKR price.
2. Switch to wallet B. Review the request and approve it, or deny it.
3. If it has a price, pay with SKR. The credential activates only after the API verifies the payment on-chain.
4. Wallet B uses the access. Wallet A revokes it. Wallet B is denied.

Notes: the hosted API runs on a free tier. If the app has been idle, the first request can take up to a minute while the server wakes up. Wallets must be set to the network the app uses (devnet for OWNR, mainnet for the Seeker checks and SKR payments).


## 7. Architecture

```
                 +--------------------------------------------+
                 |  Android app  (Expo dev build, React Native) |
                 |  Identity | Authorization | Access | OWNR     |
                 |  Activity | Security                         |
                 +-----------------+--------------------+-------+
                                   |                    |
                signs via MWA      |                    | reads / transactions
                                   v                    v
                      +--------------------+     +------------------+
                      |  Wallet app        |     |  Solana RPC      |
                      |  (Mobile Wallet    |     |  devnet, mainnet |
                      |   Adapter)         |     +--------+---------+
                      +--------------------+              ^
                                   |                      |
                                   v                      |
                      +--------------------------------+  |
                      |  API  (Fastify + SQLite)       |--+
                      |  verifies every signature,     |  reads chain to verify
                      |  runs the engine, logs events  |  ownership and payments
                      +----------------+---------------+
                                       |
                                       v
                      +--------------------------------+
                      |  packages/shared               |
                      |  authorization engine,         |
                      |  message formats, crypto       |
                      |  (used by the app and the API) |
                      +--------------------------------+
```

- **The engine lives in `packages/shared`** and is used on both sides. The app builds the exact messages the wallet signs. The API verifies them and makes every decision. The app never decides on its own.
- **Provider interfaces** (`WalletProvider` and friends) keep the wallet, ownership and camera layers replaceable. A real access-control partner would replace the demo controller behind the same boundary.
- **State** in the app is held in small Zustand stores: wallet, identity, authorizations and SKR.

## 8. The authorization protocol

An authorization has these fields:

```
version, id, issuer, subject, resource { id, name, kind },
permissions[], issuedAt, expiresAt, nonce, price? { mint, amount, payTo }
```

Everything is signed with ed25519 over deterministic, domain-separated text messages (prefix `authz-protocol/v1`):

| Message | Signed by | Purpose |
|---|---|---|
| `issue` | Issuer | Creates the authorization. Covers every field, including the price. |
| `approve` | Holder | Accepts it. Covers the issuer's signature and the approval time. |
| `deny` | Holder | Rejects a pending request. |
| `revoke` | Issuer | Ends it early. |
| `present` | Holder | Proves a specific door attempt: id, resource, permission, a fresh server challenge and a timestamp. |
| `asset-declare` | Owner | Declares an asset: id, name, category, details hash, photo hash, optional token. |
| `asset-anchor` | Owner | Links an asset record to an on-chain token. |
| `asset-name` | Holder | Names a token (legacy flow). |

A credential grants access only when all of these hold:

1. The terms are valid and the issuer's signature matches them exactly.
2. The holder has approved, and the approval signature belongs to the named holder.
3. It has not been denied or revoked by the issuer.
4. The current time is inside its validity window.
5. If it has a price, a payment has been **verified on-chain** by the API.
6. For an asset, the issuer is still the owner of that asset.
7. For a door attempt: the resource and permission match, the challenge matches, is fresh (60 seconds) and unused, and the holder signed it.

The engine returns a specific reason for every denial, and the app shows it.

## 9. Security model

- No private keys anywhere: Signing happens in the wallet through Mobile Wallet Adapter. The app stores no keys, seed phrases or passwords, and logs none.
- The app signs only what it built: For door attempts the app builds the message locally and never signs text supplied by the server.
- The server trusts nothing from the client: It re-verifies every signature and recomputes every decision. Tampered terms (for example a changed permission or price) fail signature verification.
- Replay protection: Door challenges are single-use, tied to the authorization, resource and permission, and expire after 60 seconds. Payment signatures can be used only once, across all authorizations.
- Asset integrity: The server computes the SHA-512 fingerprint of the uploaded photo itself, accepts only JPEG, limits its size, and verifies that the owner's signature covers that fingerprint.
- Ownership follows the chain: For on-chain assets, ownership is read from Solana. After a transfer, the previous owner's authorizations are voided.
- Honest status labels: The app distinguishes user-declared, on-chain verified, transferred and unknown, and never presents a photo as proof of ownership.
- Input handling.: All database queries are parameterized. Request bodies are validated and size-limited.


## 10. API reference

Base URL: the hosted API, or `http://localhost:8787` locally.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/authorizations` | Issuer submits signed terms |
| GET | `/authorizations?subject=` or `?issuer=` | List credentials for a wallet, with computed status |
| GET | `/authorizations/:id` | One credential with status |
| POST | `/authorizations/:id/approve` | Holder approval |
| POST | `/authorizations/:id/deny` | Holder denial |
| POST | `/authorizations/:id/revoke` | Issuer revocation |
| POST | `/authorizations/:id/payment` | Holder submits a payment signature for on-chain verification |
| POST | `/access/challenge` | Simulated controller issues a single-use challenge |
| POST | `/access/verify` | Holder presents the signed challenge, and the engine decides |
| POST | `/asset-records` | Create a signed asset record with its photo |
| GET | `/asset-records?owner=` | List a wallet's assets with ownership status |
| GET | `/asset-records/:id` | Asset detail with history and authorizations |
| GET | `/asset-records/:id/photo` | The asset's photo |
| POST | `/asset-records/:id/anchor` | Link a record to an on-chain token |
| POST | `/asset-records/:id/sync` | Update the record's owner from the chain |
| POST | `/assets`, GET `/assets?mints=` | Names for plain tokens (legacy flow) |
| POST | `/events` | App-reported wallet and identity events (whitelisted types) |
| GET | `/activity?wallet=` | Activity for a wallet |

Credential statuses: `PENDING_APPROVAL`, `PENDING_PAYMENT`, `ACTIVE`, `EXPIRED`, `REVOKED`, `DENIED`, `NOT_YET_VALID`, `INVALID` (voided).


## 11. Data model

SQLite tables in the API:

| Table | Holds |
|---|---|
| `authorizations` | Signed terms, issuer signature, approval, denial, revocation and verified payment |
| `challenges` | Single-use door challenges |
| `activity` | The event log |
| `payments` | Verified payment signatures, used to prevent reuse |
| `asset_records` | Signed asset declarations, owner and optional token |
| `asset_photos` | Photo bytes per asset |
| `assets` | Off-chain names for plain tokens |

Shared types live in `packages/shared/src/types.ts`.


## 12. Project structure

```
arvion/
├── apps/
│   ├── mobile/                 Android app (Expo, React Native)
│   │   ├── app.config.ts       Name, package ID, icons, plugins
│   │   ├── assets/arvion/      App icon, adaptive icon, splash
│   │   └── src/
│   │       ├── app/            Screens (Home, Identity, Access, OWNR,
│   │       │                   Activity, Security, Issue, Create asset,
│   │       │                   asset/[id], authorization/[id])
│   │       ├── components/     Design-system components
│   │       ├── config/         Brand and environment
│   │       ├── providers/      Wallet (MWA), identity, ownership,
│   │       │                   payment (SKR), camera, assets
│   │       ├── services/       API client, Solana helpers
│   │       ├── store/          Zustand stores
│   │       ├── theme/          Design tokens
│   │       └── utils/          Formatting, activity helpers
│   └── api/                    Fastify + SQLite API
│       ├── src/                app.ts, db.ts, solana.ts, server.ts
│       └── tests/              Integration tests
├── packages/
│   └── shared/                 Authorization engine and message formats
│       ├── src/
│       └── tests/
├── docs/                       Integration status
├── Dockerfile                  API container (used by the hosted deploy)
└── README.md
```


## 13. Run it yourself

Requirements: Node.js 22.13 or newer (the API uses the built-in SQLite; the project was built on Node 24), JDK 21, the Android SDK, and an Android phone or emulator with a Solana wallet app (for example Phantom) set to devnet.

```bash
# 1. API
cd apps/api
npm install
npm run dev                    # listens on :8787

# 2. Automated tests
cd packages/shared && npm install && npm test
cd ../../apps/api && npm test

# 3. App configuration
cd apps/mobile
npm install --legacy-peer-deps
cp .env.example .env           # then edit the values

# 4. Development build and Metro
npx expo prebuild --platform android
npx expo run:android           # or open the installed dev build
npx expo start --dev-client --localhost

# 5. Release APK for a phone (arm64)
cd android
./gradlew app:assembleRelease -x lint -x test -PreactNativeArchitectures=arm64-v8a
# output: android/app/build/outputs/apk/release/app-release.apk
```

When testing on a phone over USB with a local API, forward the ports:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
```

"Build notes learned the hard way"
- Use "JDK 21" for the Gradle build. A newer JDK broke the native C++ configuration step.
- Release builds need to download release libraries. On a slow or unstable connection, raise the Gradle HTTP timeouts and retry. Downloads are cached between attempts.
- `expo prebuild --clean` regenerates `android/gradle.properties`, so re-apply any local Gradle settings afterwards.
- The release APK is signed with Expo's default debug keystore, which is fine for a hackathon build but not for a store release.


## 14. Configuration

Mobile app (`apps/mobile/.env`, see `.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `API_BASE_URL` | The API the app talks to, baked in at build time | none |
| `SOLANA_CLUSTER` | Cluster for OWNR | `devnet` |
| `SOLANA_RPC_URL` | RPC for OWNR | none |
| `SGT_RPC_URL` | Mainnet RPC for the Seeker and `.skr` reads | public mainnet RPC |
| `SKR_MINT` | SKR token mint (override only to test with another token) | listed SKR mint |
| `PAYMENT_CLUSTER` | Cluster used for SKR payments | `mainnet-beta` |
| `PAYMENT_RPC_URL` | RPC used for SKR payments | `SGT_RPC_URL` |

API (environment variables):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | `8787` |
| `DB_PATH` | SQLite file | `./data/app.db` |
| `SOLANA_RPC_URL` | Devnet RPC for asset ownership checks | public devnet RPC |
| `PAYMENT_RPC_URL` | RPC used to verify SKR payments | public mainnet RPC |
| `SKR_MINT` | The only token accepted as payment | listed SKR mint |

No secrets are committed. `.env` is git-ignored.


## 15. Deployment

The API ships as a Docker image (`Dockerfile` at the repository root). The hosted instance runs on Render's free tier, started with:

```
cd apps/api && node --import tsx src/server.ts
```

with `NODE_VERSION=24` and the health check path `/health`.

Free-tier behaviour to expect: the service sleeps after about 15 minutes without traffic, and the first request afterwards can take up to a minute. The app's request timeout is set to 75 seconds for this reason. The disk is temporary, so data can reset after a restart or redeploy. A production deployment would use persistent storage.

## 16. Testing

- API: 23 integration tests cover issuing, approval, denial, revocation, expiry, replay protection, paid access (wrong amount, token, sender, recipient, failed and stale payments, reuse), asset records (forged, tampered and invalid declarations, anchoring, transfer sync) and asset authorization voiding.
- Authorization engine: unit tests in `packages/shared` cover tampered terms, forged approvals, expiry, revocation, replay, the price rules and both wallet signature output formats.
- Test doubles: for the chain reader and wallets exist only in the test files and are never imported by app code.
- Device testing: wallet connection has been verified on a real Android phone. Run the walkthrough in section 6 on a device to verify the rest.

```bash
cd packages/shared && npm test
cd apps/api && npm test && npm run typecheck
cd apps/mobile && npx tsc --noEmit
```

The mobile typecheck reports two errors in unused Expo starter files (`animated-icon.web.tsx` and `constants/theme.ts`). They do not affect the Android build.



## 17. Design principles and decisions

- No fake data, ever: If data is unavailable, the screen says so. Simulated parts are labelled. This shaped every screen.
- Authorization is the product: The engine is a reusable primitive. Doors, assets, payments and shared access are all consumers of it.
- Blockchain only where it adds value: Authorizations are verified by signatures, not forced on-chain. Solana is used for ownership, identity signals and payments.
- A photo is not proof: Asset records are owner-declared and signed. On-chain ownership is a separate, optional, verifiable upgrade.
- SPL token over a custom program: A 1-of-1 token with the mint authority removed gives real, transferable ownership with far less risk than a new on-chain program written in a short time.
- SKR inside the engine: SKR is an optional price attached to signed terms. It is not the product, and ordinary owner use stays free.
- Honest limits: Anything not built is listed, not hinted at.
- Dark, restrained interface: Near-black surfaces, subtle purple and cyan accents, clear status chips and explicit state labels everywhere.

## 18. Development journey

1. Specification: The product was defined as an identity, authorization, access and ownership platform for Seeker, with strict rules: no mock data, label every simulation, verify official APIs, and never invent SDK methods.
2. Research: Current Solana Mobile documentation was checked for Mobile Wallet Adapter, the Seeker Genesis Token check and `.skr` names before any of it was built.
3. Foundation: Expo project, design system, navigation and the status vocabulary (live, simulation, unavailable and so on).
4. Authorization engine first: The signing messages, the engine and its tests were written and verified before any wallet code, so the rest of the product could depend on it.
5. API: Server-side verification of every signature, single-use door challenges, activity logging and tests.
6. Wallet and identity: Mobile Wallet Adapter connection, the Seeker Genesis Token check and the `.skr` lookup.
7. Access and OWNR: Issue, approve and the simulated door, then asset creation and on-chain transfer.
8. SKR paid access: Signed prices, a real token transfer through the wallet and on-chain payment verification.
9. Asset capture: Camera capture, signed asset records and honest ownership statuses.
10. Connected workflows: Authorization review with deny and revoke, access checks, grouped activity and the security center.
11. Release: Branding, release build, hosted API and documentation.

The build environment was demanding: an 8 GB laptop, a slow connection, and a native Android build that needed a specific JDK version. Those constraints are why the notes in section 13 exist.

## 19. Known limitations

- API reads are not authenticated: anyone who knows a wallet address can list its credentials and activity.
- The Seeker badge reads the chain but does not yet prove wallet ownership with a signed sign-in (SIWS).
- The payment record is written by the API after it reads the chain. The engine trusts it because only the API can write it.
- The hosted API uses a free tier with a temporary disk, so data may reset, and it sleeps when idle.
- Asset photos are served by an unguessable id without a login.
- Expiry is enforced on every check, but an "expired" event is recorded only when someone tries to use the credential, because there is no background job.
- Assets cannot be edited after creation. Only anchored (on-chain) assets can be transferred.
- OWNR tokens live on devnet. SKR payments use mainnet and need real SKR and a little SOL for fees.
- There are no push notifications, no real access-control hardware, and no Seed Vault status.
- The Android build targets arm64 phones and uses Expo's debug keystore.

## 20. Roadmap

- Wallet-signed sign-in (SIWS) and authenticated reads
- Real access-control partners behind the existing provider interface
- Push notifications for new requests and expiring credentials
- Persistent production storage and a background expiry job
- Asset editing, richer metadata and optional on-chain metadata
- Partner-issued ownership credentials
- Owner subscription tier (see below)
- Seed Vault status, if and when an official API supports it

## 21. Business model

Described as a direction only. **No billing or subscription is implemented.**

| Tier | Idea |

Free | Identity, wallet, basic ownership |
Owner Pro | Multiple assets, access management, security history, advanced alerts |
Business | Multi-location access management, member management, analytics, API |
Enterprise | Custom integrations, SLA, dedicated infrastructure, white label |

SKR is the  economic layer for paid, temporary or shared access between wallets.


## 22. Hackathon criteria

Criterion | How ARVION addresses it 

**Stickiness and product-market fit** | Recurring actions: approvals, access checks, renewals, revocations, asset management, all tied to the Seeker wallet. Time-limited credentials bring people back. |
**User experience** | A consistent dark interface with explicit states, loading skeletons, clear errors and guided flows from identity through to security. |
**Innovation** | One signed authorization primitive that spans access, paid sharing and ownership, with real signatures, real chain checks and honest labelling. |
**Presentation and demo** | A single story: connect, authorize, use access, revoke, then create and transfer an asset. See section 6. |


## 23. License

MIT. See [LICENSE](LICENSE).
