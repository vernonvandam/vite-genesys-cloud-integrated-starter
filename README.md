# Genesys Cloud Integrated Starter

A small React + TypeScript + Vite application that connects to Genesys Cloud using the OAuth 2.0 Authorization Code flow with PKCE (S256), then displays the signed-in user and organization.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints with these query parameters:

```text
http://localhost:5173/?clientId=YOUR_OAUTH_CLIENT_ID&redirectURI=http%3A%2F%2Flocalhost%3A5173%2F&region=mypurecloud.com.au
```

Supported `region` values are `mypurecloud.com`, `mypurecloud.ie`, `mypurecloud.de`, `mypurecloud.jp`, `mypurecloud.com.au`, `mypurecloud.ca`, `usw2.pure.cloud`, `use2.pure.cloud`, `euw2.pure.cloud`, `euc2.pure.cloud`, `apne1.pure.cloud`, `apne2.pure.cloud`, `apse2.pure.cloud`, `cac1.pure.cloud`, `sae1.pure.cloud`, and `mec1.pure.cloud`. The app accepts `redirectURI` and `redirectUri`.

## Genesys Cloud OAuth client

Create a **public** OAuth client using the **Code Authorization** grant with PKCE enabled. Register the exact redirect URI you pass as `redirectURI` (for example, `http://localhost:5173/` during local development). Grant the client the `users:readonly` and `organizations:readonly` scopes so the app can request the current-user and organization details.

The app creates a cryptographically random PKCE verifier and state, verifies the state on callback, and exchanges the authorization code directly with the region's Genesys Cloud login service. The access token is held only in application memory; the temporary verifier and state are kept in `sessionStorage` only for the OAuth redirect round trip. The redirect URI must share this app's origin and use HTTPS in production (HTTP is allowed on localhost for development).

## Available scripts

- `npm run dev` — start the local development server
- `npm run build` — type-check and create a production build
- `npm run lint` — lint the source
- `npm run preview` — preview the production build
