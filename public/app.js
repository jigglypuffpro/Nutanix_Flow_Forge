const API_URL = 'http://localhost:3000/api';
let ws = null;
let currentExecutionId = null;
let dagNodes = [];
let dagEdges = [];

// DOM Elements
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');
const editor = document.getElementById('json-editor');
const validateBtn = document.getElementById('btn-validate');
const executeBtn = document.getElementById('btn-execute');
const validationErrors = document.getElementById('validation-errors');
const exampleSelect = document.getElementById('example-select');
const logsContainer = document.getElementById('logs-container');
const badge = document.getElementById('exec-status-badge');
const canvas = document.getElementById('dag-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId;

// Navigation
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
        
        if (btn.dataset.view === 'execution' && dagNodes.length > 0) {
            resizeCanvas();
        }
        if (btn.dataset.view === 'history') {
            fetchHistory();
        }
    });
});

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
    }
};

exampleSelect.addEventListener('change', (e) => {
    if (e.target.value && examples[e.target.value]) {
        editor.value = JSON.stringify(examples[e.target.value], null, 2);
        validationErrors.classList.add('hidden');
    }
});

// Editor Actions
validateBtn.addEventListener('click', async () => {
    try {
        const json = JSON.parse(editor.value);
        const res = await fetch(`${API_URL}/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        let res = await fetch(`${API_URL}/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(json)
        });
        let data = await res.json();
        if (!res.ok) return showErrors(data.details);
        
        const workflowId = data.id;
        buildDagLayout(json.steps);
        
        // Switch view
        document.querySelector('[data-view="execution"]').click();
        initExecutionUI();
        
        // Connect WS if not connected
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }
        
        // Step 2: Execute
        res = await fetch(`${API_URL}/workflows/${workflowId}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: "{}"});
        data = await res.json();
        currentExecutionId = data.executionId;
        
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
                break;
            case 'workflow:failed':
                updateBadge('failed');
                addLog('SYSTEM', `Workflow failed at step: ${msg.data.failedStep}`, 'err');
                break;
        }
    };
}

function initExecutionUI() {
    logsContainer.innerHTML = '';
    badge.className = 'badge idle';
    badge.innerText = 'Pending';
    dagNodes.forEach(n => n.status = 'pending');
    drawDag();
}

function updateBadge(status) {
    badge.className = `badge ${status}`;
    badge.innerText = status;
}

function addLog(step, text, type = 'normal') {
    const div = document.createElement('div');
    div.className = 'log-line';
    const time = new Date().toLocaleTimeString();
    
    let content = `<span class="time">[${time}]</span> <span class="step">[${step}]</span> `;
    if (type === 'sys') content += `<span class="log-sys">${text}</span>`;
    else if (type === 'err') content += `<span class="log-err">${text}</span>`;
    else content += `<span>${text}</span>`;
    
    div.innerHTML = content;
    logsContainer.appendChild(div);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// DAG Canvas Rendering
function buildDagLayout(steps) {
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
    while(changed) {
        changed = false;
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

    levelGroups.forEach((group, lx) => {
        group.forEach((name, ly) => {
            dagNodes.push({
                id: name,
                x: startX + lx * paddingX,
                y: startY + ly * paddingY,
                radius: 25,
                status: 'pending' // pending, running, completed, failed, skipped
            });
        });
    });

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
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawDag();
}

window.addEventListener('resize', () => {
    if (document.getElementById('view-execution').classList.contains('active')) {
        resizeCanvas();
    }
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
        
        let strokeColor = 'rgba(255,255,255,0.2)';
        if (edge.from.status === 'completed') strokeColor = 'rgba(16, 185, 129, 0.5)';
        if (edge.from.status === 'failed') strokeColor = 'rgba(239, 68, 68, 0.5)';
        
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
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        
        switch (node.status) {
            case 'pending': ctx.fillStyle = '#1e1e24'; ctx.strokeStyle = '#6b7280'; break;
            case 'running': ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#60a5fa'; break;
            case 'completed': ctx.fillStyle = '#10b981'; ctx.strokeStyle = '#34d399'; break;
            case 'failed': ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#f87171'; break;
            case 'skipped': ctx.fillStyle = 'repeating-linear-gradient(45deg, #1e1e24, #1e1e24 5px, #8b5cf6 5px, #8b5cf6 10px)'; ctx.strokeStyle = '#8b5cf6'; break;
        }
        
        if(node.status !== 'skipped') {
            ctx.fill();
        } else {
             ctx.fillStyle = '#8b5cf6';
             ctx.fill();
             ctx.globalAlpha = 0.5;
             ctx.fillStyle = '#1e1e24';
             ctx.arc(node.x, node.y, node.radius-2, 0, Math.PI*2);
             ctx.fill();
             ctx.globalAlpha = 1.0;
        }

        ctx.lineWidth = 3;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Inter';
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
        const res = await fetch(`${API_URL}/executions`);
        const data = await res.json();
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';
        
        data.reverse().forEach(exec => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${exec.executionId.split('-')[0]}...</td>
                <td>${exec.status}</td>
                <td><span class="badge ${exec.status}">${exec.status}</span></td>
                <td>${new Date(exec.startTime).toLocaleString()}</td>
                <td>${exec.duration ? exec.duration + 'ms' : '-'}</td>
                <td><button class="btn btn-secondary" onclick="alert('View details not implemented in demo')">View</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to fetch history");
    }
}

document.getElementById('btn-refresh-history').addEventListener('click', fetchHistory);
