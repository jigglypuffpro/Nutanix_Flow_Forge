# Frontend Architectural Summary (FlowForge)

## Overview
The frontend for FlowForge is a lightweight, single-page application (SPA) built entirely with Vanilla JavaScript, HTML5, and CSS3. It avoids heavyweight frameworks like React or Vue, opting for direct DOM manipulation to maintain a small footprint while delivering a premium, highly responsive user experience. 

## File Structure
- `public/index.html`: The core layout and structure of the application.
- `public/styles.css`: Global styles, layout definitions, and design system tokens.
- `public/app.js`: The application logic, routing, WebSocket integration, and Canvas rendering.

---

## Screens & Views
The application is structured into a unified layout containing a persistent sidebar for navigation and a main content area that toggles between three primary views using CSS classes (`.active`).

### 1. Workflow Editor (`#view-editor`)
The primary interface for users to write, validate, and launch workflows.
- **Functional Blocks**:
  - **Example Selector**: A dropdown (`#example-select`) that loads pre-defined JSON workflows (e.g., Basic Pipeline, Parallel Build, Rigorous API).
  - **JSON Textarea**: A plain `<textarea>` for manual entry and editing of workflow configurations.
  - **Action Buttons**: Buttons to "Validate" the JSON schema and "Execute Workflow".
  - **Validation Banner**: A dynamic alert box (`#validation-errors`) that provides immediate feedback on JSON syntax or schema errors.

### 2. Live Execution (`#view-execution`)
A real-time monitoring dashboard that visualizes workflow progress.
- **Functional Blocks**:
  - **Status Badge**: Displays the high-level state of the execution (e.g., *Idle*, *Running*, *Completed*, *Failed*).
  - **Dependency Graph (DAG) Panel**: Uses an HTML5 `<canvas id="dag-canvas">` to draw nodes (steps) and edges (dependencies). It features an animation loop (`requestAnimationFrame`) to show pulsing effects on running nodes and color changes based on step status.
  - **Live Logs Panel**: A scrolling terminal-like window (`#logs-container`) that appends real-time output (stdout/stderr) from the backend via WebSockets.

### 3. Execution History (`#view-history`)
A tabular view of past workflow runs.
- **Functional Blocks**:
  - **Refresh Button**: Triggers a fetch to the `/api/executions` endpoint.
  - **Data Table**: Lists execution metadata including ID, Status, Start Time, and Duration.

---

## Global Styles & Design System
The application employs a modern "glassmorphism" aesthetic with a dark theme.
- **CSS Variables**: Extensive use of CSS Custom Properties (`:root`) to manage theme consistency.
  - *Backgrounds*: `--bg-main` (`#0a0a0f`), `--bg-panel` (`rgba(20, 20, 30, 0.6)`).
  - *Accents*: A gradient using `--accent-1` (purple) and `--accent-2` (cyan).
  - *Status Colors*: Semantic colors for execution states (`--status-pending`, `--status-running`, `--status-success`, `--status-failed`, `--status-skipped`).
- **Typography**: Uses the `Inter` font family from Google Fonts for clean, readable text.
- **Layout Mechanics**: Flexbox is heavily utilized for structural alignment (sidebar vs main content, horizontal headers, internal panel arrangements).

---

## Routing & State Management
- **Client-Side Routing**: Implemented manually in `app.js`. Clicking sidebar buttons removes the `.active` class from all views and adds it to the targeted view, hiding the others via CSS `opacity` and `pointer-events`.
- **State**: The client maintains localized state variables (`currentExecutionId`, `dagNodes`, `dagEdges`) to manage what is currently being rendered.
- **Real-Time Data (WebSockets)**: When a workflow executes, a WebSocket connects to `ws://localhost:3000`. Incoming events (`workflow:start`, `step:complete`, `step:log`, etc.) trigger updates to the DAG nodes' status properties and append elements to the logs container.

---

## Technical Requirements
To run and render properly, the environment requires:
1. **Modern Browser**: Support for HTML5 Canvas API, WebSockets, CSS Variables, CSS Flexbox, and ES6+ JavaScript (async/await, template literals, fetch API).
2. **Backend Server**: Expects a RESTful API running at `http://localhost:3000/api` for HTTP POST/GET requests, and a WebSocket server at `ws://localhost:3000` for live telemetry.
