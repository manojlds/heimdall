# Pyodide Sandbox MCP Server

A TypeScript MCP server providing **sandboxed Python code execution** using [Pyodide](https://pyodide.org/) (Python compiled to WebAssembly).

## Features

- 🔒 **Secure Sandbox**: Python code runs in an isolated WebAssembly environment
- 📁 **Virtual Filesystem**: Read, write, list, and delete files in a persistent workspace
- 📦 **Package Management**: Install pure Python packages via micropip
- 🔄 **Session Persistence**: Workspace files persist across executions
- ⚡ **Native Integration**: Direct Pyodide integration (no subprocess bridge)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Client (Cursor)                  │
└─────────────────────┬───────────────────────────────────┘
                      │ MCP Protocol (stdio)
┌─────────────────────▼───────────────────────────────────┐
│           TypeScript MCP Server (Node.js)               │
│  • @modelcontextprotocol/sdk                            │
│  • Native Pyodide integration                           │
│  • Virtual FS ↔ Host FS sync                            │
└─────────────────────┬───────────────────────────────────┘
                      │ Direct API calls
┌─────────────────────▼───────────────────────────────────┐
│                 Pyodide (WebAssembly)                   │
│  • Python runtime in WASM                               │
│  • Emscripten virtual filesystem                        │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** >= 18.0.0

## Installation

```bash
cd mcp/pyodide-sandbox
npm install
```

## Usage

### Development (with hot reload)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Cursor MCP Configuration

Add to your Cursor settings (`~/.cursor/mcp.json` or workspace `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pyodide-sandbox": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/mcp/pyodide-sandbox"
    }
  }
}
```

Or for development with `tsx`:

```json
{
  "mcpServers": {
    "pyodide-sandbox": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/mcp/pyodide-sandbox"
    }
  }
}
```

## Available Tools

### `execute_python`

Execute Python code in the sandbox. Packages are **auto-detected** from imports.

**Note:** Network access is NOT available - Pyodide runs in WebAssembly which provides a security boundary that prevents network requests.

```typescript
// Input
{
  code: string;           // Python code to execute
  packages?: string[];    // Optional additional packages (auto-detection handles most cases)
}

// Output
{
  success: boolean;
  stdout: string;
  stderr: string;
  result: string | null;  // Last expression value
  error: string | null;
}
```

**Example:**
```python
# Packages are auto-detected - no need to specify numpy/pandas!
import numpy as np
import pandas as pd

data = np.array([1, 2, 3, 4, 5])
df = pd.DataFrame({'values': data, 'squared': data ** 2})
print(df)
```

### `install_packages`

Install Python packages via micropip.

```typescript
// Input
{
  packages: string[];  // Package names to install
}

// Output
{
  results: Array<{
    package: string;
    success: boolean;
    error: string | null;
  }>;
}
```

### `write_file`

Write content to a file in the workspace.

```typescript
// Input
{
  path: string;     // File path relative to workspace
  content: string;  // Content to write
}
```

### `read_file`

Read a file from the workspace.

```typescript
// Input
{
  path: string;  // File path relative to workspace
}
```

### `list_files`

List files in a directory.

```typescript
// Input
{
  path?: string;  // Directory path (empty for root)
}

// Output
{
  files: Array<{
    name: string;
    isDirectory: boolean;
    size: number;
  }>;
}
```

### `delete_file`

Delete a file or empty directory.

```typescript
// Input
{
  path: string;  // File or directory path
}
```

## Available Resources

| URI | Description |
|-----|-------------|
| `workspace://files` | Tree listing of workspace contents |
| `workspace://file/{path}` | Read a specific file |
| `sandbox://info` | Environment information |

## Workspace

Files are stored in the `workspace/` directory. Customize with `PYODIDE_WORKSPACE` env var:

```json
{
  "mcpServers": {
    "pyodide-sandbox": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/mcp/pyodide-sandbox",
      "env": {
        "PYODIDE_WORKSPACE": "/custom/workspace/path"
      }
    }
  }
}
```

## Security

### Network Access

**Python code cannot make network requests.** Pyodide runs in WebAssembly which provides a security boundary that prevents:
- HTTP/HTTPS requests from Python code
- Socket connections
- Any external network communication initiated by user code

This is enforced by the WASM runtime itself. Code that attempts to make network requests will fail with an error.

### How Package Installation Works

Package installation (`micropip.install()`) works because it uses **Pyodide's internal mechanism** which operates at the JavaScript/Node.js layer, not Python:

```
micropip.install("numpy")  →  Pyodide (JS)  →  Node.js fetch()  →  PyPI
```

This is intentional - packages can be installed via Pyodide's trusted mechanism, but user code cannot make arbitrary network requests.

### What Works vs What's Blocked

| ✅ Available | ❌ Blocked |
|-------------|-----------|
| Package installation (micropip) | `urllib.request.urlopen()` |
| File I/O (workspace) | `requests.get()` |
| Data processing (numpy, pandas) | Socket connections |
| URL parsing (`urllib.parse`) | External API calls |
| `loadPackagesFromImports()` | Data exfiltration |

## Available Packages

Pyodide includes many popular packages:

### Pre-installed
- Standard library (os, sys, json, re, math, etc.)
- micropip (for installing more packages)

### Available via `install_packages`
- **Data Science**: numpy, pandas, scipy, scikit-learn
- **Visualization**: matplotlib, seaborn, plotly
- **HTML Parsing**: beautifulsoup4, lxml (parsing only, no fetching)
- **Text/NLP**: regex, nltk
- **Math**: sympy, statsmodels
- **Image**: pillow

### Limitations
- **No network access** (WASM security boundary)
- Packages with native C/Fortran code must have Pyodide-compatible wheels
- No multiprocessing or threading
- Memory constrained by Node.js heap

See [Pyodide Packages](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) for full compatibility list.

## Project Structure

```
mcp/pyodide-sandbox/
├── src/
│   └── server.ts       # MCP server with Pyodide integration
├── dist/               # Compiled JavaScript (after build)
├── workspace/          # Persistent file storage
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Build

```bash
npm run build
```

### Clean

```bash
npm run clean
```

## Security Considerations

- ✅ Code runs in WebAssembly sandbox (memory-isolated)
- ✅ No direct host filesystem access (only workspace)
- ✅ Limited networking capabilities
- ⚠️ Workspace files are accessible to all code executions
- ⚠️ Installed packages persist in the session

## Troubleshooting

### Slow first execution

Pyodide downloads ~15MB on first run. Subsequent runs use cached files.

### Package installation fails

Some packages aren't available in Pyodide. Check compatibility at [pyodide.org](https://pyodide.org/en/stable/usage/packages-in-pyodide.html).

### Memory errors

WebAssembly has memory limits. For large datasets, process in chunks. You can increase Node.js heap with:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## License

MIT
