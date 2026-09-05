const API_URL = 'http://localhost:3000/api';
const AUTH_URL = 'http://localhost:3000/auth';
let ws = null;
let currentExecutionId = null;
let dagNodes = [];
let dagEdges = [];
let dagWidth = 0;
let dagHeight = 0;

// DOM Elements
const editor = document.getElementById('json-editor');
const validateBtn = document.getElementById('btn-validate');
const executeBtn = document.getElementById('btn-exec');
const validationErrors = document.getElementById('validation-errors');
const workflowNav = document.getElementById('workflow-nav');
const customWorkflowNav = document.getElementById('custom-workflow-nav');
const logsContainer = document.getElementById('logs-container');
const badgeContainer = document.getElementById('exec-status-container');
const badgeDot = document.getElementById('exec-status-dot');
const badge = document.getElementById('exec-status-badge');
const badgeSub = document.getElementById('exec-status-sub');
const canvas = document.getElementById('dag-canvas');
const ctx = canvas.getContext('2d');
const headerProjectName = document.getElementById('header-project-name');
const headerRunId = document.getElementById('header-run-id');
const dagTitle = document.getElementById('dag-title');
const loginScreen = document.getElementById('login-screen');
const sidebarUser = document.getElementById('sidebar-user');
const modalOverlay = document.getElementById('modal-overlay');
let animationFrameId;

// ─── JWT AUTH ────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('ff_token'); }
function setToken(t) { localStorage.setItem('ff_token', t); }
function clearToken() { localStorage.removeItem('ff_token'); }

// Authenticated fetch — automatically adds Authorization header
async function authFetch(url, options = {}) {
    const token = getToken();
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    });
}

function hideLoginScreen() {
    loginScreen.style.opacity = '0';
    setTimeout(() => loginScreen.style.display = 'none', 300);
}

function showLoginScreen() {
    clearToken();
    loginScreen.style.display = 'flex';
    loginScreen.style.opacity = '0';
    setTimeout(() => loginScreen.style.opacity = '1', 10);
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

function setLoadingState(btnId, loading, defaultText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait...' : defaultText;
    btn.style.opacity = loading ? '0.7' : '1';
}

document.getElementById('show-register').addEventListener('click', () => {
    document.getElementById('login-panel').style.display = 'none';
    document.getElementById('register-panel').style.display = 'block';
    document.getElementById('auth-error').style.display = 'none';
});
document.getElementById('show-login').addEventListener('click', () => {
    document.getElementById('register-panel').style.display = 'none';
    document.getElementById('login-panel').style.display = 'block';
    document.getElementById('auth-error').style.display = 'none';
});

// Login on Enter key
['login-username', 'login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
    });
});
['reg-displayname', 'reg-username', 'reg-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-register').click();
    });
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) return showAuthError('Please enter username and password.');
    setLoadingState('btn-login', true, 'Sign In');
    try {
        const res = await fetch(`${AUTH_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) return showAuthError(data.error || 'Login failed. Check your credentials.');
        setToken(data.token);
        onLoggedIn(data.displayName);
    } catch (e) {
        showAuthError('Cannot reach server. Make sure npm run dev is running.');
    } finally {
        setLoadingState('btn-login', false, 'Sign In');
    }
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const displayName = document.getElementById('reg-displayname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!displayName || !username || !password) return showAuthError('All fields are required.');
    if (username.length < 3) return showAuthError('Username must be at least 3 characters.');
    if (password.length < 4) return showAuthError('Password must be at least 4 characters.');
    setLoadingState('btn-register', true, 'Create Account');
    try {
        const res = await fetch(`${AUTH_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName })
        });
        const data = await res.json();
        if (!res.ok) return showAuthError(data.error || 'Registration failed.');
        setToken(data.token);
        onLoggedIn(data.displayName);
    } catch (e) {
        showAuthError('Cannot reach server. Make sure npm run dev is running.');
    } finally {
        setLoadingState('btn-register', false, 'Create Account');
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    if (sidebarUser) sidebarUser.textContent = '—';
    showLoginScreen();
});

function onLoggedIn(displayName) {
    hideLoginScreen();
    if (sidebarUser) sidebarUser.textContent = displayName;
    fetchHistory();
    fetchCustomWorkflows();
}

// ─── CUSTOM WORKFLOWS ─────────────────────────────────────────────────────────
async function fetchCustomWorkflows() {
    try {
        const res = await authFetch(`${API_URL}/custom-workflows`);
        if (!res.ok) return;
        const data = await res.json();
        renderCustomWorkflows(data);
    } catch (e) { console.error('Failed to fetch custom workflows:', e); }
}

function renderCustomWorkflows(workflows) {
    if (!customWorkflowNav) return;
    customWorkflowNav.innerHTML = '';
    if (!workflows.length) {
        customWorkflowNav.innerHTML = '<span class="px-space-8 font-code-sm text-[10px] text-on-primary-container/40">No custom workflows yet</span>';
        return;
    }
    const activeClass = 'bg-primary text-on-primary rounded-lg border-l-2 border-secondary';
    const inactiveClass = 'rounded-lg text-on-primary-container hover:bg-primary/40 hover:text-on-primary transition-colors';
    workflows.forEach(wf => {
        const row = document.createElement('div');
        row.className = 'flex items-center group';
        const link = document.createElement('a');
        link.href = '#';
        link.className = `flex-1 flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${inactiveClass}`;
        link.innerHTML = `<span class="material-symbols-outlined text-[16px]">edit_note</span><span class="truncate max-w-[90px]">${wf.name}</span>`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            editor.value = JSON.stringify(wf.spec, null, 2);
            validationErrors.classList.add('hidden');
            // Update active states
            Array.from(customWorkflowNav.querySelectorAll('a')).forEach(a => {
                a.className = `flex-1 flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${inactiveClass}`;
            });
            link.className = `flex-1 flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${activeClass}`;
        });
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '×';
        delBtn.title = 'Delete';
        delBtn.style.cssText = 'background:none;border:none;color:#bc4749;cursor:pointer;padding:4px 8px;font-size:14px;opacity:0;transition:opacity 0.2s;';
        row.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
        row.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
        delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete "${wf.name}"?`)) return;
            const res = await authFetch(`${API_URL}/custom-workflows/${wf._id}`, { method: 'DELETE' });
            if (res.ok) fetchCustomWorkflows();
        });
        row.appendChild(link);
        row.appendChild(delBtn);
        customWorkflowNav.appendChild(row);
    });
}

// Modal
document.getElementById('btn-add-workflow').addEventListener('click', () => {
    document.getElementById('modal-wf-name').value = '';
    document.getElementById('modal-wf-desc').value = '';
    document.getElementById('modal-wf-json').value = JSON.stringify({
        name: 'My Custom Workflow',
        description: 'Add a description',
        steps: [
            { name: 'hello', type: 'shell', config: { command: 'echo "Hello from custom workflow!"' } }
        ]
    }, null, 2);
    document.getElementById('modal-error').style.display = 'none';
    modalOverlay.classList.remove('hidden');
});

function closeModal() { modalOverlay.classList.add('hidden'); }
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

document.getElementById('btn-modal-save').addEventListener('click', async () => {
    const name = document.getElementById('modal-wf-name').value.trim();
    const description = document.getElementById('modal-wf-desc').value.trim();
    const jsonText = document.getElementById('modal-wf-json').value.trim();
    const modalErr = document.getElementById('modal-error');
    
    if (!name) { modalErr.textContent = 'Workflow name is required.'; modalErr.style.display = 'block'; return; }
    let spec;
    try { spec = JSON.parse(jsonText); } catch (e) { modalErr.textContent = 'Invalid JSON: ' + e.message; modalErr.style.display = 'block'; return; }
    
    modalErr.style.display = 'none';
    const btn = document.getElementById('btn-modal-save');
    btn.textContent = 'SAVING...';
    
    try {
        const res = await authFetch(`${API_URL}/custom-workflows`, {
            method: 'POST',
            body: JSON.stringify({ name, description, spec })
        });
        const data = await res.json();
        if (!res.ok) { modalErr.textContent = data.error || 'Failed to save.'; modalErr.style.display = 'block'; btn.textContent = 'SAVE WORKFLOW'; return; }
        closeModal();
        fetchCustomWorkflows();
    } catch (e) { modalErr.textContent = 'Network error.'; modalErr.style.display = 'block'; }
    btn.textContent = 'SAVE WORKFLOW';
});

// Init Unified UI
window.addEventListener('load', async () => {
    // Check for existing JWT
    const token = getToken();
    if (token) {
        try {
            const res = await authFetch(`${AUTH_URL}/me`);
            if (res.ok) {
                const data = await res.json();
                onLoggedIn(data.displayName);
            } else {
                clearToken(); // Token expired/invalid
            }
        } catch (e) {
            console.warn('Could not reach server for auth check.');
        }
    }
    // Populate built-in sidebar always
    populateBuiltinWorkflows();
});

function populateBuiltinWorkflows() {
    if (!workflowNav) return;
    workflowNav.innerHTML = '';
    let index = 1;
    const activeClass = 'bg-primary text-on-primary rounded-lg border-l-2 border-secondary';
    const inactiveClass = 'rounded-lg text-on-primary-container hover:bg-primary/40 hover:text-on-primary transition-colors';

    Object.keys(examples).forEach(key => {
        const link = document.createElement('a');
        link.href = '#';
        link.className = `flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${key === 'rigorous-workflow' ? activeClass : inactiveClass}`;

        let icon = 'account_tree';
        if (key.includes('parallel')) icon = 'layers';
        else if (key.includes('advanced')) icon = 'calculate';

        link.innerHTML = `<span class="font-label-caps text-[10px] text-on-primary-container/60">0${index++} //</span><span class="material-symbols-outlined text-[16px]">${icon}</span><span>${examples[key].name || key}</span>`;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            Array.from(workflowNav.children).forEach(child => {
                child.className = `flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${inactiveClass}`;
            });
            link.className = `flex items-center gap-space-8 px-space-8 py-space-8 font-code-sm text-code-sm ${activeClass}`;
            editor.value = JSON.stringify(examples[key], null, 2);
            validationErrors.classList.add('hidden');
        });
        workflowNav.appendChild(link);
    });

    // Load default
    if (examples['rigorous-workflow']) {
        editor.value = JSON.stringify(examples['rigorous-workflow'], null, 2);
    }
}


// Load Examples (Hardcoded for demo, normally fetched)
const examples = {
    'basic-pipeline': {
        "name": "Basic CI Pipeline",
        "description": "Clone, build, test",
        "variables": { "repo": "app.git" },
        "steps": [
            { "name": "clone", "type": "shell", "config": { "command": "echo 'Cloning...' && sleep 1" } },
            { "name": "build", "type": "shell", "dependsOn": ["clone"], "config": { "command": "echo 'Building...' && sleep 2" } },
            { "name": "test", "type": "shell", "dependsOn": ["build"], "config": { "command": "echo 'Testing...' && sleep 1" } }
        ]
    },
    'parallel-build': {
        "name": "Parallel Build Pipeline",
        "steps": [
            { "name": "lint", "type": "shell", "config": { "command": "echo 'Linting...' && sleep 1" } },
            { "name": "build_frontend", "type": "shell", "dependsOn": ["lint"], "config": { "command": "echo 'React app built' && sleep 2" } },
            { "name": "build_backend", "type": "shell", "dependsOn": ["lint"], "config": { "command": "echo 'Server binary ready' && sleep 3" } },
            { "name": "deploy", "type": "shell", "dependsOn": ["build_frontend", "build_backend"], "config": { "command": "echo 'Deploying...' && sleep 1" } }
        ]
    },
    'conditional-deploy': {
        "name": "Conditional Deploy",
        "steps": [
            { "name": "test", "type": "shell", "config": { "command": "exit 0" } },
            { "name": "deploy", "type": "shell", "dependsOn": ["test"], "if": "{{test.exitCode}} == 0", "config": { "command": "echo 'Deploying!'" } },
            { "name": "rollback", "type": "shell", "dependsOn": ["test"], "if": "{{test.exitCode}} != 0", "config": { "command": "echo 'Rolling back!'" } }
        ]
    },
    'advanced-math': {
        "name": "Advanced Math & Shell Operations",
        "description": "Demonstrates arithmetic, parallel calculations, context piping, and aggregate reporting",
        "variables": { "numA": 48, "numB": 12 },
        "steps": [
            { "name": "initial_math", "type": "shell", "config": { "command": "A={{variables.numA}}; B={{variables.numB}}; SUM=$((A + B)); DIFF=$((A - B)); PROD=$((A * B)); QUOT=$((A / B)); echo \"Base: A=$A, B=$B | Sum=$SUM, Diff=$DIFF, Product=$PROD, Quotient=$QUOT\"; echo $SUM" } },
            { "name": "parallel_branch_square", "type": "shell", "dependsOn": ["initial_math"], "config": { "command": "VAL=$(echo \"{{initial_math.output}}\" | tail -n 1); SQ=$((VAL * VAL)); echo \"[Square Branch] Square of $VAL is $SQ\"; echo $SQ" } },
            { "name": "parallel_branch_stats", "type": "shell", "dependsOn": ["initial_math"], "config": { "command": "python3 -c \"import math; v=int('''{{initial_math.output}}'''.split()[-1]); print(f'[Stats Branch] Sqrt={math.isqrt(v)}, Factorial(5)={math.factorial(5)}, Hex={hex(v)}')\"" } },
            { "name": "aggregate_results", "type": "shell", "dependsOn": ["parallel_branch_square", "parallel_branch_stats"], "config": { "command": "echo \"=== FINAL REPORT ===\"; echo \"Raw Initial Output: {{initial_math.output}}\"; echo \"Square Result: {{parallel_branch_square.output}}\"; echo \"Stats Output: {{parallel_branch_stats.output}}\"; echo \"All calculations completed successfully!\"" } }
        ]
    },
    'rigorous-workflow': {
        "name": "Rigorous System & API Workflow",
        "description": "Executes real shell commands to prepare a directory, fetches real JSON data from a REST API, parses it using Python, and uses plugins to log and mock-email the result before cleaning up.",
        "variables": { "api_endpoint": "https://jsonplaceholder.typicode.com/users/1", "temp_dir": "/tmp/flowforge_test" },
        "steps": [
            { "name": "setup_environment", "type": "shell", "config": { "command": "mkdir -p {{variables.temp_dir}} && echo 'Environment ready at {{variables.temp_dir}}'" } },
            { "name": "fetch_user_data", "type": "rest", "dependsOn": ["setup_environment"], "config": { "method": "GET", "url": "{{variables.api_endpoint}}" } },
            { "name": "process_data", "type": "shell", "dependsOn": ["fetch_user_data"], "config": { "command": "cat << 'EOF' > {{variables.temp_dir}}/process.py\nimport json\nimport sys\n\ntry:\n    data = json.loads(sys.argv[1])\n    print(f\"{data['name']} works at {data['company']['name']}\")\nexcept Exception as e:\n    print(f\"Error parsing data: {e}\")\n    sys.exit(1)\nEOF\npython3 {{variables.temp_dir}}/process.py '{{fetch_user_data.output}}'" } },
            { "name": "log_result", "type": "plugin", "dependsOn": ["process_data"], "config": { "pluginName": "log", "message": "Data processed successfully: {{process_data.output}}" } },
            { "name": "send_mock_email", "type": "plugin", "dependsOn": ["process_data"], "config": { "pluginName": "email", "to": "admin@flowforge.local", "subject": "User Processed", "body": "The result from the API and Python parsing is: {{process_data.output}}" } },
            { "name": "cleanup", "type": "shell", "dependsOn": ["log_result", "send_mock_email"], "config": { "command": "rm -rf {{variables.temp_dir}} && echo 'Cleanup complete'" } }
        ]
    }
};



// Editor Actions
validateBtn.addEventListener('click', async () => {
    try {
        const json = JSON.parse(editor.value);
        const res = await authFetch(`${API_URL}/workflows`, {
            method: 'POST',
            body: JSON.stringify(json)
        });
        const data = await res.json();
        
        if (!res.ok) {
            showErrors(data.details || [data.error]);
        } else {
            validationErrors.classList.remove('hidden');
            validationErrors.style.background = 'rgba(16, 185, 129, 0.9)';
            validationErrors.innerText = '✓ Workflow is valid!';
            setTimeout(() => validationErrors.classList.add('hidden'), 2000);
            buildDagLayout(json.steps);
        }
    } catch (e) {
        showErrors(['Invalid JSON format: ' + e.message]);
    }
});

executeBtn.addEventListener('click', async () => {
    try {
        const json = JSON.parse(editor.value);
        // Step 1: Create/Validate
        let res = await authFetch(`${API_URL}/workflows`, {
            method: 'POST',
            body: JSON.stringify(json)
        });
        let data = await res.json();
        if (!res.ok) return showErrors(data.details || [data.error]);
        
        const workflowId = data.id;
        buildDagLayout(json.steps);
        initExecutionUI();
        
        // Connect WS if not connected
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }
        
        // Step 2: Execute
        res = await authFetch(`${API_URL}/workflows/${workflowId}/execute`, { method: 'POST', body: '{}' });
        data = await res.json();
        currentExecutionId = data.executionId;
        
        if (headerRunId) headerRunId.innerText = `RUN #${currentExecutionId.split('-')[0].toUpperCase()}`;
        if (headerProjectName && json.name) headerProjectName.innerText = json.name.toUpperCase();
        
        fetchHistory();
    } catch (e) {
        showErrors(['Error starting execution: ' + e.message]);
    }
});

function showErrors(errors) {
    validationErrors.style.background = 'rgba(239, 68, 68, 0.9)';
    validationErrors.innerHTML = errors.join('<br>');
    validationErrors.classList.remove('hidden');
}

// WebSocket & Live Updates
function connectWebSocket() {
    ws = new WebSocket('ws://localhost:3000');
    const wsStatusText = document.getElementById('ws-status-text');
    
    ws.onopen = () => {
        if (wsStatusText) {
            wsStatusText.className = 'inline-flex items-center gap-space-4 font-label-caps text-label-caps text-tertiary-fixed';
            wsStatusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-tertiary-fixed inline-block animate-pulse" id="ws-status-dot"></span>LIVE`;
        }
    };
    
    ws.onclose = () => {
        if (wsStatusText) {
            wsStatusText.className = 'inline-flex items-center gap-space-4 font-label-caps text-label-caps text-error';
            wsStatusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-error inline-block" id="ws-status-dot"></span>DISCONNECTED`;
        }
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.data.executionId !== currentExecutionId) return; // Ignore other executions

        switch (msg.type) {
            case 'workflow:start':
                updateBadge('running');
                addLog('SYSTEM', 'Workflow execution started', 'sys');
                break;
            case 'step:start':
                updateNodeStatus(msg.data.stepName, 'running');
                addLog(msg.data.stepName, 'Step started...', 'sys');
                break;
            case 'step:log':
                addLog(msg.data.stepName, msg.data.line);
                break;
            case 'step:complete':
                updateNodeStatus(msg.data.stepName, 'completed');
                addLog(msg.data.stepName, `Completed in ${msg.data.duration}ms. Output: ${msg.data.output}`, 'sys');
                break;
            case 'step:skipped':
                updateNodeStatus(msg.data.stepName, 'skipped');
                addLog(msg.data.stepName, `Skipped: ${msg.data.reason}`, 'sys');
                break;
            case 'step:error':
                updateNodeStatus(msg.data.stepName, 'failed');
                addLog(msg.data.stepName, `Error: ${msg.data.error}`, 'err');
                break;
            case 'workflow:complete':
                updateBadge('completed');
                addLog('SYSTEM', 'Workflow completed successfully', 'sys');
                fetchHistory();
                break;
            case 'workflow:failed':
                updateBadge('failed');
                addLog('SYSTEM', `Workflow failed at step: ${msg.data.failedStep}`, 'err');
                fetchHistory();
                break;
        }
    };
}

function initExecutionUI() {
    logsContainer.innerHTML = '';
    updateBadge('pending');
    dagNodes.forEach(n => n.status = 'pending');
    drawDag();
}

function updateBadge(status) {
    if (!badgeContainer) return;
    badge.innerText = status.toUpperCase();
    badgeContainer.className = 'flex items-center gap-space-4 px-space-8 py-space-2 rounded-DEFAULT';
    badgeDot.className = 'w-2 h-2 rounded-DEFAULT animate-pulse';
    
    if (status === 'running') {
        badgeContainer.classList.add('bg-secondary/10');
        badgeDot.classList.add('bg-secondary');
        badge.className = 'font-label-caps text-label-caps text-secondary tracking-wider font-bold';
    } else if (status === 'completed') {
        badgeContainer.classList.add('bg-tertiary-fixed/30');
        badgeDot.classList.add('bg-tertiary-fixed-variant');
        badgeDot.classList.remove('animate-pulse');
        badge.className = 'font-label-caps text-label-caps text-tertiary-fixed-variant tracking-wider font-bold';
    } else if (status === 'failed') {
        badgeContainer.classList.add('bg-error/10');
        badgeDot.classList.add('bg-error');
        badgeDot.classList.remove('animate-pulse');
        badge.className = 'font-label-caps text-label-caps text-error tracking-wider font-bold';
    } else {
        badgeContainer.classList.add('bg-surface-variant');
        badgeDot.classList.add('bg-outline-variant');
        badgeDot.classList.remove('animate-pulse');
        badge.className = 'font-label-caps text-label-caps text-outline tracking-wider font-bold';
    }
}

function addLog(step, text, type = 'normal') {
    const div = document.createElement('div');
    div.className = 'text-outline font-mono text-[10.5px] leading-relaxed';
    const time = new Date().toLocaleTimeString();
    
    let content = `[${time}] <span class="font-semibold text-on-surface-variant">[${step}]</span> `;
    if (type === 'sys') content += `<span class="text-secondary font-semibold">${text}</span>`;
    else if (type === 'err') content += `<span class="text-error font-semibold">${text}</span>`;
    else content += `<span class="text-on-surface">${text}</span>`;
    
    div.innerHTML = content;
    logsContainer.appendChild(div);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// DAG Canvas Rendering
function buildDagLayout(steps) {
    if (dagTitle) dagTitle.innerText = `DIRECTED ACYCLIC GRAPH (${steps.length} NODES)`;
    dagNodes = [];
    dagEdges = [];
    const levels = {};
    const stepMap = {};
    
    steps.forEach(s => {
        stepMap[s.name] = s;
        levels[s.name] = 0; // Temp level
    });
    
    // Calculate simple depths (not a perfect topological leveler, but good enough for visual)
    let changed = true;
    let iterations = 0;
    while(changed && iterations < 1000) {
        changed = false;
        iterations++;
        steps.forEach(s => {
            let maxDepDepth = -1;
            (s.dependsOn || []).forEach(dep => {
                if (levels[dep] > maxDepDepth) maxDepDepth = levels[dep];
            });
            if (maxDepDepth + 1 > levels[s.name]) {
                levels[s.name] = maxDepDepth + 1;
                changed = true;
            }
        });
    }

    // Group by levels to assign X, Y
    const levelGroups = [];
    Object.keys(levels).forEach(name => {
        const l = levels[name];
        if(!levelGroups[l]) levelGroups[l] = [];
        levelGroups[l].push(name);
    });

    const paddingX = 150;
    const paddingY = 80;
    const startX = 100;
    const startY = 100;
    
    let maxX = 0;
    let maxY = 0;

    levelGroups.forEach((group, lx) => {
        group.forEach((name, ly) => {
            const nx = startX + lx * paddingX;
            const ny = startY + ly * paddingY;
            if (nx > maxX) maxX = nx;
            if (ny > maxY) maxY = ny;
            dagNodes.push({
                id: name,
                x: nx,
                y: ny,
                radius: 25,
                status: 'pending' // pending, running, completed, failed, skipped
            });
        });
    });
    
    dagWidth = maxX + 100;
    dagHeight = maxY + 100;

    // Edges
    steps.forEach(s => {
        (s.dependsOn || []).forEach(dep => {
            const from = dagNodes.find(n => n.id === dep);
            const to = dagNodes.find(n => n.id === s.name);
            if (from && to) dagEdges.push({ from, to });
        });
    });

    resizeCanvas();
    startAnimationLoop();
}

function resizeCanvas() {
    canvas.width = Math.max(canvas.parentElement.clientWidth, dagWidth);
    canvas.height = Math.max(canvas.parentElement.clientHeight, dagHeight);
    drawDag();
}

window.addEventListener('resize', () => {
    resizeCanvas();
});

function updateNodeStatus(id, status) {
    const node = dagNodes.find(n => n.id === id);
    if (node) node.status = status;
}

let pulseOffset = 0;
function startAnimationLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    const loop = () => {
        pulseOffset += 0.1;
        drawDag();
        animationFrameId = requestAnimationFrame(loop);
    };
    loop();
}

function drawDag() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw edges
    ctx.lineWidth = 2;
    dagEdges.forEach(edge => {
        ctx.beginPath();
        ctx.moveTo(edge.from.x, edge.from.y);
        
        // Curved line
        const cpX = (edge.from.x + edge.to.x) / 2;
        ctx.bezierCurveTo(cpX, edge.from.y, cpX, edge.to.y, edge.to.x, edge.to.y);
        
        let strokeColor = '#c6c6cd'; // outline-variant
        if (edge.from.status === 'completed') strokeColor = '#5d9a7c'; // on-tertiary-container
        if (edge.from.status === 'failed') strokeColor = '#ba1a1a'; // error
        
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
        
        // Arrow head
        const angle = Math.atan2(edge.to.y - edge.from.y, edge.to.x - edge.from.x); // rough angle
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(edge.to.x - 30, edge.to.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw nodes
    dagNodes.forEach(node => {
        // Shadow/Pulse for running
        if (node.status === 'running') {
            const pulse = Math.sin(pulseOffset) * 5 + 5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + pulse, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(51, 98, 139, 0.2)'; // secondary with opacity
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        
        switch (node.status) {
            case 'pending': ctx.fillStyle = '#f0eee8'; ctx.strokeStyle = '#76777d'; break; // surface-container / outline
            case 'running': ctx.fillStyle = '#cfe5ff'; ctx.strokeStyle = '#33628b'; break; // secondary-fixed / secondary
            case 'completed': ctx.fillStyle = '#b1f0ce'; ctx.strokeStyle = '#0e5138'; break; // tertiary-fixed / on-tertiary-fixed-variant
            case 'failed': ctx.fillStyle = '#ffdad6'; ctx.strokeStyle = '#ba1a1a'; break; // error-container / error
            case 'skipped': ctx.fillStyle = '#e5e2dc'; ctx.strokeStyle = '#45464c'; break; // surface-variant / on-surface-variant
        }
        
        if(node.status !== 'skipped') {
            ctx.fill();
        } else {
             ctx.fillStyle = '#e5e2dc';
             ctx.fill();
             ctx.globalAlpha = 0.5;
             ctx.fillStyle = '#fcf9f3';
             ctx.arc(node.x, node.y, node.radius-2, 0, Math.PI*2);
             ctx.fill();
             ctx.globalAlpha = 1.0;
        }

        ctx.lineWidth = 3;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#1c1c18'; // on-surface
        ctx.font = '500 12px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Max 10 chars, else ellipse
        let label = node.id.length > 10 ? node.id.substring(0, 8) + '..' : node.id;
        ctx.fillText(label, node.x, node.y + 40);
    });
}

// History
async function fetchHistory() {
    try {
        const res = await authFetch(`${API_URL}/executions`);
        const data = await res.json();
        const tbody = document.getElementById('history-tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        data.reverse().slice(0, 4).forEach(exec => {
            const tr = document.createElement('tr');
            tr.className = "bg-surface-container-lowest hover:bg-surface-container transition-colors";
            
            let statusBadge = '';
            if(exec.status === 'completed') statusBadge = '<span class="px-space-4 py-0.5 rounded-DEFAULT bg-tertiary-fixed/30 text-on-tertiary-fixed-variant font-label-caps text-[9px] font-bold">SUCCESS</span>';
            else if(exec.status === 'failed') statusBadge = '<span class="px-space-4 py-0.5 rounded-DEFAULT bg-error-container text-on-error-container font-label-caps text-[9px] font-bold">FAILED</span>';
            else statusBadge = '<span class="px-space-4 py-0.5 rounded-DEFAULT bg-secondary-container text-on-secondary-fixed-variant font-label-caps text-[9px] font-bold">RUNNING</span>';

            tr.innerHTML = `
                <td class="py-space-4 px-space-12 font-mono text-on-surface">${exec.executionId.split('-')[0]}...</td>
                <td class="py-space-4 px-space-12">${statusBadge}</td>
                <td class="py-space-4 px-space-12 text-on-surface-variant font-mono">${new Date(exec.startTime).toLocaleString()}</td>
                <td class="py-space-4 px-space-12 font-mono text-on-surface">${exec.duration ? exec.duration + 'ms' : 'active'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to fetch history");
    }
}
