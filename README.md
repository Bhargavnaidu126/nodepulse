# NodePulse

**Request-level debugging and replay tool for Node.js applications.**

NodePulse intercepts, records, and replays HTTP requests flowing through your Express app — capturing every database call, external API request, and function execution with precise timing. Debug production issues by replaying exact request flows locally with mocked dependencies.

## Architecture

```
nodepulse/
├── nodepulse-core/        # The library
│   ├── src/
│   │   ├── index.js           # Public API
│   │   ├── schema.js          # Debug session JSON schema
│   │   ├── context.js         # AsyncLocalStorage request context
│   │   ├── mode.js            # RECORD / REPLAY mode detection
│   │   ├── storage.js         # File-based session persistence
│   │   ├── middleware.js      # Express middleware (combines everything)
│   │   ├── reporter.js        # ANSI terminal output & diff engine
│   │   └── interceptors/
│   │       ├── http.js        # fetch / http.request monkey-patching
│   │       ├── database.js    # Mongoose & pg interception
│   │       └── function.js    # Arbitrary function wrapping
│   └── bin/
│       └── nodepulse-cli.js   # CLI replay engine
└── test-app/              # Demo Express app
    └── server.js
```

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Add NodePulse to your Express app

```js
const express = require('express');
const { nodepulse, trackFunction } = require('nodepulse');

const app = express();
app.use(express.json());
app.use(nodepulse({ printReport: true, saveToFile: true }));

// Wrap functions you want to track
const fetchUser = trackFunction('fetchUser', async (id) => {
  // your database/API call here
});
```

### 3. Make a request (RECORD mode)

```bash
curl -X POST http://localhost:3456/payment \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_42", "amount": 100, "description": "Test payment"}'
```

A session file is saved to `.nodepulse/sessions/<FLOW_ID>.json`.

### 4. Replay a session

```bash
npx nodepulse replay <FLOW_ID> --app ./test-app/server.js
```

## Debug Session Schema

Each recorded session produces a JSON file:

```json
{
  "metadata": {
    "flowId": "PAY_789",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "route": "POST /payment",
    "statusCode": 200
  },
  "initialRequest": {
    "method": "POST",
    "url": "/payment",
    "headers": { "content-type": "application/json" },
    "body": { "userId": "user_42", "amount": 100 },
    "query": {}
  },
  "executionLog": [
    {
      "type": "function",
      "name": "fetchWalletBalance",
      "durationMs": 85.2,
      "recordedResponse": { "userId": "user_42", "balance": 1250.75 },
      "error": null,
      "timestamp": "2024-01-15T10:30:00.050Z"
    },
    {
      "type": "external_api",
      "name": "fetch POST https://api.stripe.com/charge",
      "durationMs": 412.7,
      "recordedResponse": { "statusCode": 200, "body": { "id": "ch_xxx" } },
      "error": null,
      "timestamp": "2024-01-15T10:30:00.200Z"
    }
  ]
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `nodepulse replay <FLOW_ID> --app <path>` | Replay a recorded session |
| `nodepulse list` | List all recorded sessions |
| `nodepulse view <FLOW_ID>` | View a session report |
| `nodepulse delete <FLOW_ID>` | Delete a session |

### CLI Options

- `--port <port>` — Port for the replay server (default: random)
- `--app <path>` — Path to your Express app entry file
- `--dir <path>` — Project directory (default: cwd)

## API Reference

### Middleware

```js
const { nodepulse } = require('nodepulse');
app.use(nodepulse(options));
```

**Options:**
- `baseDir` — Project root for `.nodepulse/` folder
- `printReport` — Print session report after each request (default: `true`)
- `saveToFile` — Save session JSON to disk (default: `true`)
- `flowIdHeader` — Custom header name for flow ID (default: `x-flow-id`)
- `generateId(req)` — Custom flow ID generator function
- `shouldIntercept(req)` — Filter which requests to intercept

### Function Tracking

```js
const { trackFunction } = require('nodepulse');

const myFn = trackFunction('myFunctionName', async (arg1, arg2) => {
  // Your logic here
  return result;
});
```

### Database Interceptors

```js
const { interceptMongoose, interceptPg } = require('nodepulse');

// Mongoose
const mongoose = require('mongoose');
interceptMongoose(mongoose);

// PostgreSQL
const { Client } = require('pg');
interceptPg(Client);
```

### Storage API

```js
const { loadSession, listSessions, deleteSession } = require('nodepulse');

const session = loadSession('FLOW_ABC123');
const allIds = listSessions();
deleteSession('FLOW_ABC123');
```

## How It Works

1. **Context Tracking** — Uses `AsyncLocalStorage` from Node's `async_hooks` module to isolate request context. Even with 100 concurrent requests, each database call and API request is correctly attributed to its originating HTTP request.

2. **Interceptors** — Monkey-patches `globalThis.fetch`, `http.request`, and optionally ORM methods to record timing and response data during RECORD mode, or serve mocked responses during REPLAY mode.

3. **Storage Engine** — Saves debug sessions as JSON files to `.nodepulse/sessions/`. Writes are async to avoid blocking responses. Reads are sync for fast replay access.

4. **CLI Replay** — Spins up your Express server with `NODEPULSE_MODE=REPLAY`, fires the original request, and compares timing differences in a formatted diff report.

## License

MIT
