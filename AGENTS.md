# Gyana Vikash OMR

## Cursor Cloud specific instructions

This app has no login. HTTP 401 on `localhost:5173` from a normal browser tab is Cursor’s authenticated port tunnel, not the application.

There is no public unauthenticated preview URL. Do not paste `http://localhost:5173` into laptop Chrome while chatting on cursor.com.

### Open the live UI (this Cloud Agent)

1. Open the **Cursor desktop app**.
2. Open the **Agents Window** and select this agent.
3. Click the **plug / Ports** icon (top-right of the agent panel).
4. Open forwarded port **5173** in Cursor’s built-in browser.

If you stay on the website agent page, use **Take control**, then in the VM desktop browser open `http://127.0.0.1:5173`.

### Local run after merge

```bash
./scripts/cloud-agent-install.sh
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

Vite proxies `/api` to port 8000.
