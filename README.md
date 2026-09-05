# FlowForge

FlowForge is a lightweight, JSON-driven workflow execution engine with a real-time web dashboard.

## Features

- **JSON-First**: Define complete workflows, including parallel steps and conditions, using simple JSON.
- **DAG Execution**: Automatic parallelization of independent steps.
- **Extensible Plugins**: Drop-in `.plugin.js` files to add new executors easily.
- **Context Interpolation**: Pipe outputs between steps using `{{step.output}}`.
- **Live Dashboard**: Real-time visualization of workflow execution via WebSockets and Canvas.

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server (runs both API and Dashboard):
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.

## Project Structure
- `src/engine`: Core logic (Validator, DAG resolution, Engine)
- `src/executors`: Step runners (Shell, REST, Plugin, Conditional)
- `src/server`: Express API & WebSockets
- `public`: Frontend dashboard
- `plugins`: Drop-in extensions

## Testing
Run unit tests:
```bash
npm test
```
