# UMS Frontend Login Gateway

This frontend is now structured as a standalone login gateway for the normal UMS user login flow.

- `/login` for UMS user login

The tenant login page is designed to behave like a centralized Keycloak-style login screen. External apps can redirect users there with query params such as:

```text
/login?client_id=loan-portal&redirect_uri=http://localhost:3000/callback&state=abc123
```

After a successful login, the UI redirects back to `redirect_uri` when it is provided. If no redirect target is passed, the user lands on `/console`.

## Current backend alignment

- UMS user login uses `POST /ums/api/v1/auth/login`
- Current user profile uses `GET /ums/api/v1/me`
- Logout uses `POST /ums/api/v1/auth/logout`

## Run locally

```bash
npm install
npm run dev
```

By default, Vite proxies `/ums/*` to `http://localhost:8081`, which matches your backend context path from `ums-with-keycloak`.

## Optional environment variables

```bash
VITE_API_BASE_URL=/ums
VITE_API_PROXY_TARGET=http://localhost:8081
```
