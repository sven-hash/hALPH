# My dApp Template

## Install

```
npm install
```

## Start a local devnet for testing and development

Please refer to the documentation here: [Devnet Guide](https://wiki.alephium.org/full-node/getting-started#devnet)

## Compile

Compile the TypeScript files into JavaScript:

```
npm run compile
```

## Testing

```
npm run test
```

## Frontend

Run the React UI:

```
bun --cwd frontend run dev
```

Or via root script:

```
npm run frontend:dev
```

In the UI:
- connect an Alephium wallet
- enter your deployed `CountdownGame` contract address
- press **Refresh state** to load on-chain fields
- press **Play (1 ALPH)** to submit a `play` transaction
