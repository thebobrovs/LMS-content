// ---- LMS embed SDK ----
// `createSim` is a global from sim-sdk.js (classic script, loaded first). Announce
// to the host lesson and keep the iframe sized to content. Falls back to a no-op
// so the bundle still runs if opened standalone.
const sim =
  typeof createSim === "function"
    ? createSim({ onInit() {} })
    : { checkpoint() {}, resize() {}, event() {}, isInitialized: () => false };
(function () {
  let lastH = 0;
  function syncHeight() {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastH) > 4) {
      lastH = h;
      sim.resize(h + 8);
    }
  }
  setInterval(syncHeight, 400);
  window.addEventListener("load", syncHeight);
})();

// Core Simulation State
const state = {
    isPlaying: true,
    speed: 1.0,
    routingMode: 'top-2',
    isAutoSpawning: true,
    pizzasProcessed: 0,
    activeExpertsCount: 2,
    computeSavings: 50.0,
    latency: 120,
    expertWeights: { dough: 0.0, sauce: 0.0, cheese: 0.0, veggie: 0.0 },
    currentActiveToken: null,
    particles: [],
    completedQuests: { quest1: false, quest2: false, quest3: false },
    statsHistory: { top1Count: 0, top2Count: 0, denseCount: 0 }
};

const dom = {
    btnTogglePlay: document.getElementById('btn-toggle-play'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    btnResetSim: document.getElementById('btn-reset-sim'),
    sliderSimSpeed: document.getElementById('slider-sim-speed'),
    labelSimSpeed: document.getElementById('label-sim-speed'),
    activeRoutingLogic: document.getElementById('active-routing-logic'),
    routingHelpText: document.getElementById('routing-help-text'),
    btnRouteTop1: document.getElementById('btn-route-top1'),
    btnRouteTop2: document.getElementById('btn-route-top2'),
    btnRouteDense: document.getElementById('btn-route-dense'),
    spawnMargherita: document.getElementById('spawn-margherita'),
    spawnVeggie: document.getElementById('spawn-veggie'),
    spawnStuffed: document.getElementById('spawn-stuffed'),
    spawnMarinara: document.getElementById('spawn-marinara'),
    toggleAutoSpawn: document.getElementById('toggle-auto-spawn'),
    metricActiveExperts: document.getElementById('metric-active-experts'),
    metricComputeSaved: document.getElementById('metric-compute-saved'),
    metricLatency: document.getElementById('metric-latency'),
    metricThroughput: document.getElementById('metric-throughput'),
    computeOverheadBar: document.getElementById('compute-overhead-bar'),
    quest1: document.getElementById('quest-1'),
    quest2: document.getElementById('quest-2'),
    quest3: document.getElementById('quest-3'),
    quest1Check: document.getElementById('quest-1-check'),
    quest2Check: document.getElementById('quest-2-check'),
    quest3Check: document.getElementById('quest-3-check'),
    canvasSVGConduits: document.getElementById('canvas-svg-conduits'),
    canvasParticles: document.getElementById('canvas-particles'),
    intakeBelt: document.getElementById('intake-belt'),
    tokenOnBelt: document.getElementById('token-on-belt'),
    beltTokenName: document.getElementById('belt-token-name'),
    routerStateDesc: document.getElementById('router-state-desc'),
    barWeightDough: document.getElementById('bar-weight-dough'),
    barWeightSauce: document.getElementById('bar-weight-sauce'),
    barWeightCheese: document.getElementById('bar-weight-cheese'),
    barWeightVeggie: document.getElementById('bar-weight-veggie'),
    textWeightDough: document.getElementById('text-weight-dough'),
    textWeightSauce: document.getElementById('text-weight-sauce'),
    textWeightCheese: document.getElementById('text-weight-cheese'),
    textWeightVeggie: document.getElementById('text-weight-veggie'),
    nodeIntake: document.getElementById('node-intake'),
    nodeRouter: document.getElementById('node-router'),
    nodeOutput: document.getElementById('node-output'),
    expertDough: document.getElementById('expert-dough'),
    expertSauce: document.getElementById('expert-sauce'),
    expertCheese: document.getElementById('expert-cheese'),
    expertVeggie: document.getElementById('expert-veggie'),
    pizzaVisualBox: document.getElementById('pizza-visual-box'),
    outputPizzaDesc: document.getElementById('output-pizza-desc'),
    tabBtnScience: document.getElementById('tab-btn-science'),
    tabBtnMapping: document.getElementById('tab-btn-mapping'),
    tabBtnMath: document.getElementById('tab-btn-math'),
    tabContentScience: document.getElementById('tab-content-science'),
    tabContentMapping: document.getElementById('tab-content-mapping'),
    tabContentMath: document.getElementById('tab-content-math'),
    modalSuccess: document.getElementById('modal-success'),
    modalSuccessDesc: document.getElementById('modal-success-desc'),
    btnModalClose: document.getElementById('btn-modal-close')
};

let coordinates = {
    intake: { x: 0, y: 0 }, router: { x: 0, y: 0 }, dough: { x: 0, y: 0 },
    sauce: { x: 0, y: 0 }, cheese: { x: 0, y: 0 }, veggie: { x: 0, y: 0 }, output: { x: 0, y: 0 }
};

const TOKEN_METADATA = {
    margherita: { name: "Margherita Token", requirements: ["sauce", "cheese"], weights: { dough: 0.1, sauce: 0.5, cheese: 0.4, veggie: 0.0 }, color: '#10B981' },
    veggie: { name: "Veggie Supreme", requirements: ["dough", "veggie"], weights: { dough: 0.5, sauce: 0.05, cheese: 0.05, veggie: 0.4 }, color: '#F59E0B' },
    stuffed: { name: "Double Cheese", requirements: ["dough", "cheese"], weights: { dough: 0.45, sauce: 0.05, cheese: 0.5, veggie: 0.0 }, color: '#60A5FA' },
    marinara: { name: "Marinara Token", requirements: ["dough", "sauce"], weights: { dough: 0.45, sauce: 0.5, cheese: 0.05, veggie: 0.0 }, color: '#EF4444' }
};

let activeTokensInFlight = [];
const ctx = dom.canvasParticles.getContext('2d');

function resizeCanvas() {
    const rect = dom.canvasParticles.parentElement.getBoundingClientRect();
    dom.canvasParticles.width = rect.width;
    dom.canvasParticles.height = rect.height;
    recalculateCoordinates();
}

function recalculateCoordinates() {
    const containerRect = dom.canvasParticles.getBoundingClientRect();
    function getCenterOfElement(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left - containerRect.left + r.width / 2, y: r.top - containerRect.top + r.height / 2 };
    }
    coordinates.intake = getCenterOfElement(dom.nodeIntake);
    coordinates.router = getCenterOfElement(dom.nodeRouter);
    coordinates.dough = getCenterOfElement(dom.expertDough);
    coordinates.sauce = getCenterOfElement(dom.expertSauce);
    coordinates.cheese = getCenterOfElement(dom.expertCheese);
    coordinates.veggie = getCenterOfElement(dom.expertVeggie);
    coordinates.output = getCenterOfElement(dom.nodeOutput);
    drawConduits();
}

function drawConduits() {
    const routerX = coordinates.router.x;
    const routerY = coordinates.router.y;
    function updatePath(pathEl, targetCoord) {
        const dx = targetCoord.x - routerX;
        const dy = targetCoord.y - routerY;
        const d = `M ${routerX} ${routerY} C ${routerX + dx/4} ${routerY + dy/1.5}, ${targetCoord.x - dx/4} ${targetCoord.y - dy/1.5}, ${targetCoord.x} ${targetCoord.y}`;
        pathEl.setAttribute('d', d);
    }
    updatePath(document.getElementById('conduit-dough'), coordinates.dough);
    updatePath(document.getElementById('conduit-sauce'), coordinates.sauce);
    updatePath(document.getElementById('conduit-cheese'), coordinates.cheese);
    updatePath(document.getElementById('conduit-veggie'), coordinates.veggie);
    function updatePathOut(pathEl, startCoord) {
        const targetX = coordinates.output.x;
        const targetY = coordinates.output.y;
        const dx = targetX - startCoord.x;
        const dy = targetY - startCoord.y;
        const d = `M ${startCoord.x} ${startCoord.y} C ${startCoord.x + dx/4} ${startCoord.y + dy/1.5}, ${targetX - dx/4} ${targetY - dy/1.5}, ${targetX} ${targetY}`;
        pathEl.setAttribute('d', d);
    }
    updatePathOut(document.getElementById('conduit-dough-out'), coordinates.dough);
    updatePathOut(document.getElementById('conduit-sauce-out'), coordinates.sauce);
    updatePathOut(document.getElementById('conduit-cheese-out'), coordinates.cheese);
    updatePathOut(document.getElementById('conduit-veggie-out'), coordinates.veggie);
}

window.addEventListener('load', () => {
    resizeCanvas();
    setTimeout(resizeCanvas, 100);
    setInterval(autoGeneratorPulse, 4000);
    requestAnimationFrame(renderLoop);
});
window.addEventListener('resize', resizeCanvas);

dom.btnTogglePlay.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
        dom.iconPause.classList.remove('hidden');
        dom.iconPlay.classList.add('hidden');
        dom.intakeBelt.classList.remove('paused');
    } else {
        dom.iconPause.classList.add('hidden');
        dom.iconPlay.classList.remove('hidden');
        dom.intakeBelt.classList.add('paused');
    }
});

dom.btnResetSim.addEventListener('click', () => {
    state.pizzasProcessed = 0;
    state.statsHistory.top1Count = 0;
    state.statsHistory.top2Count = 0;
    state.statsHistory.denseCount = 0;
    dom.metricThroughput.textContent = '0';
    updateMetricsDisplay();
    activeTokensInFlight = [];
    setBarWeights({ dough: 0, sauce: 0, cheese: 0, veggie: 0 });
    deactivateAllExperts();
    dom.outputPizzaDesc.textContent = "Waiting for assembly...";
    dom.routerStateDesc.textContent = "Directing path...";
});

dom.sliderSimSpeed.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    dom.labelSimSpeed.textContent = state.speed.toFixed(1) + 'x';
});

function switchTab(activeBtn, activeContent, inactivePairs) {
    activeBtn.classList.remove('text-slate-400', 'border-transparent');
    activeBtn.classList.add('text-white', 'border-brand-accent');
    activeContent.classList.remove('hidden');
    activeContent.classList.add('flex');
    inactivePairs.forEach(pair => {
        pair.btn.classList.add('text-slate-400', 'border-transparent');
        pair.btn.classList.remove('text-white', 'border-brand-accent');
        pair.content.classList.add('hidden');
        pair.content.classList.remove('flex');
    });
}

dom.tabBtnScience.addEventListener('click', () => {
    switchTab(dom.tabBtnScience, dom.tabContentScience, [
        { btn: dom.tabBtnMapping, content: dom.tabContentMapping },
        { btn: dom.tabBtnMath, content: dom.tabContentMath }
    ]);
});
dom.tabBtnMapping.addEventListener('click', () => {
    switchTab(dom.tabBtnMapping, dom.tabContentMapping, [
        { btn: dom.tabBtnScience, content: dom.tabContentScience },
        { btn: dom.tabBtnMath, content: dom.tabContentMath }
    ]);
});
dom.tabBtnMath.addEventListener('click', () => {
    switchTab(dom.tabBtnMath, dom.tabContentMath, [
        { btn: dom.tabBtnScience, content: dom.tabContentScience },
        { btn: dom.tabBtnMapping, content: dom.tabContentMapping }
    ]);
});

dom.btnModalClose.addEventListener('click', () => {
    dom.modalSuccess.classList.add('opacity-0', 'pointer-events-none');
});

function triggerSuccess(desc) {
    dom.modalSuccessDesc.innerHTML = desc;
    dom.modalSuccess.classList.remove('opacity-0', 'pointer-events-none');
}

function updateActiveRoutingMode(mode) {
    state.routingMode = mode;
    dom.btnRouteTop1.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold hover:text-white text-slate-400";
    dom.btnRouteTop2.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold hover:text-white text-slate-400";
    dom.btnRouteDense.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold hover:text-white text-slate-400";
    if (mode === 'top-1') {
        dom.btnRouteTop1.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold bg-brand-accent text-white shadow-neon-blue";
        dom.activeRoutingLogic.textContent = "Top-1 FFN Routing";
        dom.routingHelpText.textContent = "Ultra-sparse capacity. Tokens are routed to the single highest expert. Highest speed, minimum compute.";
        state.activeExpertsCount = 1; state.computeSavings = 75.0; state.latency = 65;
    } else if (mode === 'top-2') {
        dom.btnRouteTop2.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold bg-brand-accent text-white shadow-neon-blue";
        dom.activeRoutingLogic.textContent = "Top-2 MoE Routing";
        dom.routingHelpText.textContent = "Standard Mixture of Experts logic. Dual-specialization activates exactly 2 expert networks, balancing latency and capability.";
        state.activeExpertsCount = 2; state.computeSavings = 50.0; state.latency = 120;
    } else if (mode === 'dense') {
        dom.btnRouteDense.className = "py-2 px-1 text-xs rounded-lg transition-all font-semibold bg-brand-warning text-white shadow-neon-red";
        dom.activeRoutingLogic.textContent = "Dense Monolithic Layer";
        dom.routingHelpText.textContent = "Traditional dense execution. Every FFN expert triggers for every token — maximum compute cost and heavy lag.";
        state.activeExpertsCount = 4; state.computeSavings = 0.0; state.latency = 310;
    }
    updateMetricsDisplay();
    evaluateQuestConditions();
}

dom.btnRouteTop1.addEventListener('click', () => updateActiveRoutingMode('top-1'));
dom.btnRouteTop2.addEventListener('click', () => updateActiveRoutingMode('top-2'));
dom.btnRouteDense.addEventListener('click', () => updateActiveRoutingMode('dense'));

dom.spawnMargherita.addEventListener('click', () => triggerTokenSpawning('margherita'));
dom.spawnVeggie.addEventListener('click', () => triggerTokenSpawning('veggie'));
dom.spawnStuffed.addEventListener('click', () => triggerTokenSpawning('stuffed'));
dom.spawnMarinara.addEventListener('click', () => triggerTokenSpawning('marinara'));

dom.toggleAutoSpawn.addEventListener('change', (e) => {
    state.isAutoSpawning = e.target.checked;
});

function triggerTokenSpawning(key) {
    if (!state.isPlaying) return;
    const meta = TOKEN_METADATA[key];
    if (!meta) return;
    dom.beltTokenName.textContent = meta.name;
    dom.tokenOnBelt.style.borderColor = meta.color;
    dom.tokenOnBelt.style.color = meta.color;
    dom.tokenOnBelt.style.boxShadow = `0 0 12px ${meta.color}40`;
    dom.tokenOnBelt.style.transform = 'scale(1.08)';
    setTimeout(() => { dom.tokenOnBelt.style.transform = 'scale(1.0)'; }, 300);
    const token = {
        id: Math.random().toString(36).substr(2, 9),
        key: key, name: meta.name,
        requirements: [...meta.requirements],
        weights: { ...meta.weights }, color: meta.color,
        progress: 0, stage: 'conveyor', conveyorTicks: 0, expertActiveTicks: 0, expertsTargeted: []
    };
    activeTokensInFlight.push(token);
}

function autoGeneratorPulse() {
    if (!state.isPlaying || !state.isAutoSpawning) return;
    const keys = Object.keys(TOKEN_METADATA);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    triggerTokenSpawning(randomKey);
}

function updateMetricsDisplay() {
    dom.metricActiveExperts.textContent = `${state.activeExpertsCount} / 4 (${(state.activeExpertsCount/4*100).toFixed(0)}%)`;
    dom.metricComputeSaved.textContent = `${state.computeSavings.toFixed(1)}%`;
    dom.metricLatency.textContent = `${state.latency} ms`;
    dom.metricThroughput.textContent = state.pizzasProcessed;
    const pct = 100 - state.computeSavings;
    dom.computeOverheadBar.style.width = `${pct}%`;
    if (pct <= 25) {
        dom.computeOverheadBar.className = "bg-brand-highlight h-full rounded-full transition-all duration-300 shadow-neon-green";
    } else if (pct <= 50) {
        dom.computeOverheadBar.className = "bg-brand-accent h-full rounded-full transition-all duration-300 shadow-neon-blue";
    } else {
        dom.computeOverheadBar.className = "bg-brand-warning h-full rounded-full transition-all duration-300 shadow-neon-red";
    }
}

function setBarWeights(weights) {
    dom.barWeightDough.style.width = `${weights.dough * 100}%`;
    dom.textWeightDough.textContent = weights.dough.toFixed(2);
    dom.barWeightSauce.style.width = `${weights.sauce * 100}%`;
    dom.textWeightSauce.textContent = weights.sauce.toFixed(2);
    dom.barWeightCheese.style.width = `${weights.cheese * 100}%`;
    dom.textWeightCheese.textContent = weights.cheese.toFixed(2);
    dom.barWeightVeggie.style.width = `${weights.veggie * 100}%`;
    dom.textWeightVeggie.textContent = weights.veggie.toFixed(2);
}

function activateExpert(station) {
    const el = document.getElementById(`expert-${station}`);
    const shroud = el.querySelector('.expert-shroud');
    shroud.style.opacity = '0';
    shroud.style.pointerEvents = 'none';
    if (station === 'dough') el.classList.add('border-blue-400', 'shadow-neon-blue');
    if (station === 'sauce') el.classList.add('border-brand-warning', 'shadow-neon-red');
    if (station === 'cheese') el.classList.add('border-brand-gold', 'shadow-neon-gold');
    if (station === 'veggie') el.classList.add('border-brand-highlight', 'shadow-neon-green');
}

function deactivateAllExperts() {
    const stations = ['dough', 'sauce', 'cheese', 'veggie'];
    stations.forEach(station => {
        const el = document.getElementById(`expert-${station}`);
        const shroud = el.querySelector('.expert-shroud');
        shroud.style.opacity = '1';
        shroud.style.pointerEvents = 'all';
        el.className = "flex-1 bg-brand-card p-3 rounded-xl border border-brand-border transition-all duration-300 flex flex-col justify-between items-center text-center relative group";
    });
}

function spawnRouteParticle(start, end, color, duration, callback) {
    state.particles.push({
        x: start.x, y: start.y, startX: start.x, startY: start.y,
        endX: end.x, endY: end.y, color: color, progress: 0, duration: duration, callback: callback
    });
}

function renderLoop() {
    ctx.clearRect(0, 0, dom.canvasParticles.width, dom.canvasParticles.height);
    if (state.isPlaying) {
        const delta = 0.016 * state.speed;
        for (let i = activeTokensInFlight.length - 1; i >= 0; i--) {
            const token = activeTokensInFlight[i];
            if (token.stage === 'conveyor') {
                token.conveyorTicks += delta;
                if (token.conveyorTicks >= 1.2) {
                    token.stage = 'routing';
                    dom.routerStateDesc.textContent = "Softmax calculation...";
                    const w = { ...token.weights };
                    if (state.routingMode === 'top-1') {
                        let maxKey = 'dough'; let maxVal = -1;
                        Object.keys(w).forEach(k => { if (w[k] > maxVal) { maxVal = w[k]; maxKey = k; } });
                        Object.keys(w).forEach(k => w[k] = k === maxKey ? 1.0 : 0.0);
                    } else if (state.routingMode === 'dense') {
                        Object.keys(w).forEach(k => w[k] = 0.25);
                    } else {
                        let keysSorted = Object.keys(w).sort((a,b) => w[b] - w[a]);
                        let sum = w[keysSorted[0]] + w[keysSorted[1]];
                        if (sum > 0) {
                            w[keysSorted[0]] = w[keysSorted[0]] / sum;
                            w[keysSorted[1]] = w[keysSorted[1]] / sum;
                            w[keysSorted[2]] = 0.0; w[keysSorted[3]] = 0.0;
                        }
                    }
                    setBarWeights(w);
                    const targets = [];
                    deactivateAllExperts();
                    if (state.routingMode === 'dense') {
                        targets.push('dough', 'sauce', 'cheese', 'veggie');
                    } else if (state.routingMode === 'top-1') {
                        let maxKey = Object.keys(w).reduce((a, b) => w[a] > w[b] ? a : b);
                        targets.push(maxKey);
                    } else {
                        Object.keys(w).forEach(k => { if (w[k] > 0) targets.push(k); });
                    }
                    token.expertsTargeted = targets;
                    token.stage = 'to_experts';
                    let particlesReturned = 0;
                    targets.forEach(target => {
                        activateExpert(target);
                        spawnRouteParticle(coordinates.router, coordinates[target], token.color, 1.0, () => {
                            particlesReturned++;
                            if (particlesReturned === targets.length) { token.stage = 'processing_expert'; }
                        });
                    });
                }
            } else if (token.stage === 'processing_expert') {
                token.expertActiveTicks += delta;
                if (token.expertActiveTicks >= 1.0) {
                    token.stage = 'to_output';
                    let outCompleted = 0;
                    token.expertsTargeted.forEach(target => {
                        spawnRouteParticle(coordinates[target], coordinates.output, token.color, 1.0, () => {
                            outCompleted++;
                            if (outCompleted === token.expertsTargeted.length) {
                                token.stage = 'assembling';
                                dom.pizzaVisualBox.style.transform = 'scale(1.25)';
                                dom.pizzaVisualBox.style.borderColor = token.color;
                                dom.pizzaVisualBox.style.boxShadow = `0 0 20px ${token.color}`;
                                dom.outputPizzaDesc.textContent = `Completed ${token.name}!`;
                                setTimeout(() => {
                                    dom.pizzaVisualBox.style.transform = 'scale(1.0)';
                                    dom.pizzaVisualBox.style.boxShadow = 'none';
                                    dom.pizzaVisualBox.style.borderColor = 'rgb(249, 115, 22)';
                                }, 400);
                                state.pizzasProcessed++;
                                if (state.routingMode === 'top-1') state.statsHistory.top1Count++;
                                if (state.routingMode === 'top-2') state.statsHistory.top2Count++;
                                if (state.routingMode === 'dense') state.statsHistory.denseCount++;
                                updateMetricsDisplay();
                                evaluateQuestConditions();
                                activeTokensInFlight.splice(activeTokensInFlight.indexOf(token), 1);
                            }
                        });
                    });
                }
            }
        }
        for (let j = state.particles.length - 1; j >= 0; j--) {
            const p = state.particles[j];
            p.progress += delta / p.duration;
            if (p.progress >= 1.0) {
                if (p.callback) p.callback();
                state.particles.splice(j, 1);
            } else {
                const t = p.progress;
                const dx = p.endX - p.startX;
                const dy = p.endY - p.startY;
                const controlX1 = p.startX + dx/4;
                const controlY1 = p.startY + dy/1.5;
                const controlX2 = p.endX - dx/4;
                const controlY2 = p.endY - dy/1.5;
                const mt = 1 - t;
                p.x = mt*mt*mt*p.startX + 3*mt*mt*t*controlX1 + 3*mt*t*t*controlX2 + t*t*t*p.endX;
                p.y = mt*mt*mt*p.startY + 3*mt*mt*t*controlY1 + 3*mt*t*t*controlY2 + t*t*t*p.endY;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowBlur = 12;
                ctx.shadowColor = p.color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
    }
    requestAnimationFrame(renderLoop);
}

function evaluateQuestConditions() {
    if (!state.completedQuests.quest1 && state.statsHistory.top2Count >= 5) {
        state.completedQuests.quest1 = true;
        dom.quest1.classList.add('border-brand-highlight/40', 'bg-brand-highlight/10');
        dom.quest1Check.className = "flex items-center justify-center w-5 h-5 rounded-full border border-brand-highlight text-xs text-brand-highlight font-bold";
        dom.quest1Check.textContent = "✓";
        sim.checkpoint('quest-1');
        triggerSuccess("<b>Quest 1 Completed!</b><br><br>You've processed 5 tokens using Top-2 Routing. Sparse routing keeps capability high by activating only 2 of the 4 FFN experts per token.");
    }
    if (!state.completedQuests.quest2 && state.routingMode === 'top-1' && state.pizzasProcessed > 0) {
        state.completedQuests.quest2 = true;
        dom.quest2.classList.add('border-brand-highlight/40', 'bg-brand-highlight/10');
        dom.quest2Check.className = "flex items-center justify-center w-5 h-5 rounded-full border border-brand-highlight text-xs text-brand-highlight font-bold";
        dom.quest2Check.textContent = "✓";
        sim.checkpoint('quest-2');
        triggerSuccess("<b>Quest 2 Completed!</b><br><br>You activated Top-1 FFN Routing — active experts dropped to ~25% capacity, cutting inference cost and latency.");
    }
    if (!state.completedQuests.quest3 && state.routingMode === 'dense' && state.pizzasProcessed > 0) {
        state.completedQuests.quest3 = true;
        dom.quest3.classList.add('border-brand-highlight/40', 'bg-brand-highlight/10');
        dom.quest3Check.className = "flex items-center justify-center w-5 h-5 rounded-full border border-brand-highlight text-xs text-brand-highlight font-bold";
        dom.quest3Check.textContent = "✓";
        sim.checkpoint('quest-3');
        triggerSuccess("<b>Quest 3 Completed!</b><br><br>You benchmarked Dense mode — running all 4 experts raises overhead to 100% and spikes latency to 310 ms. This is why sparse activation matters.");
    }
}
