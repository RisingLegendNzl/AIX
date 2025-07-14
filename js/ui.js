// js/ui.js

// --- IMPORTS ---
// Added getBoardStateStats and calculatePocketDistance
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
// Import analysis functions that the UI will trigger
import { runAllAnalyses, handleStrategyChange, handleHistoricalAnalysis, updateActivePredictionTypes, labelHistoryFailures, initializeAi, trainAiOnLoad } from './analysis.js';
// Import worker instances to post messages to them
import { aiWorker, optimizationWorker } from './workers.js';

// --- DOM ELEMENT REFERENCES (Private to this module) ---
const dom = {};

// --- PARAMETER DEFINITIONS for UI (matches optimizationWorker's parameterSpace) ---
// Centralize min/max/step for all numerical parameters for slider generation
const parameterDefinitions = {
    // Core Strategy Parameters
    learningRate_success: { min: 0.01, max: 1.0, step: 0.01, category: 'coreStrategy' },
    learningRate_failure: { min: 0.01, max: 0.5, step: 0.01, category: 'coreStrategy' },
    maxWeight: { min: 1.0, max: 10.0, step: 0.1, category: 'coreStrategy' },
    minWeight: { min: 0.0, max: 1.0, step: 0.01, category: 'coreStrategy' },
    decayFactor: { min: 0.7, max: 0.99, step: 0.01, category: 'coreStrategy' },
    patternMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    patternSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    triggerMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    triggerSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    // Adaptive Influence Rates
    SUCCESS: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' }, // Corresponds to adaptiveSuccessRate in GA
    FAILURE: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' },  // Corresponds to adaptiveFailureRate in GA
    MIN_INFLUENCE: { min: 0.0, max: 1.0, step: 0.01, category: 'adaptiveRates' },
    MAX_INFLUENCE: { min: 1.0, max: 5.0, step: 0.1, category: 'adaptiveRates' }
};

// Map parameter names to their respective config objects and display labels for sliders
const parameterMap = {
    // Strategy Core Settings
    learningRate_success: { obj: config.STRATEGY_CONFIG, label: 'Success Learn Rate', container: 'strategyLearningRatesSliders' },
    learningRate_failure: { obj: config.STRATEGY_CONFIG, label: 'Failure Learn Rate', container: 'strategyLearningRatesSliders' },
    maxWeight: { obj: config.STRATEGY_CONFIG, label: 'Max Weight', container: 'strategyLearningRatesSliders' },
    minWeight: { obj: config.STRATEGY_CONFIG, label: 'Min Weight', container: 'strategyLearningRatesSliders' },
    decayFactor: { obj: config.STRATEGY_CONFIG, label: 'Decay Factor', container: 'strategyLearningRatesSliders' },
    patternMinAttempts: { obj: config.STRATEGY_CONFIG, label: 'Pattern Min Attempts', container: 'patternThresholdsSliders' },
    patternSuccessThreshold: { obj: config.STRATEGY_CONFIG, label: 'Pattern Success %', container: 'patternThresholdsSliders' },
    triggerMinAttempts: { obj: config.STRATEGY_CONFIG, label: 'Trigger Min Attempts', container: 'patternThresholdsSliders' },
    triggerSuccessThreshold: { obj: config.STRATEGY_CONFIG, label: 'Trigger Success %', container: 'patternThresholdsSliders' },
    // Adaptive Influence Rates
    SUCCESS: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Adaptive Success Rate', container: 'adaptiveInfluenceSliders' },
    FAILURE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Adaptive Failure Rate', container: 'adaptiveInfluenceSliders' },
    MIN_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Min Adaptive Influence', container: 'adaptiveInfluenceSliders' },
    MAX_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Max Adaptive Influence', container: 'adaptiveInfluenceSliders' }
};

// Define strategy toggles with their labels and corresponding state keys
const strategyTogglesDefinitions = [
    // Base Strategies
    { id: 'trendConfirmationToggle', label: 'Wait for Trend Confirmation', stateKey: 'useTrendConfirmation' },
    { id: 'weightedZoneToggle', label: 'Use Neighbour Score Weighting', stateKey: 'useWeightedZone' },
    { id: 'proximityBoostToggle', label: 'Use Proximity Boost', stateKey: 'useProximityBoost' },
    { id: 'pocketDistanceToggle', label: 'Show Pocket Distance', stateKey: 'usePocketDistance' },
    { id: 'lowestPocketDistanceToggle', label: 'Prioritize Lowest Pocket Distance', stateKey: 'useLowestPocketDistance' },
    { id: 'advancedCalculationsToggle', label: 'Enable Advanced Calculations', stateKey: 'useAdvancedCalculations' },
    // Advanced Strategies
    { id: 'dynamicStrategyToggle', label: 'Dynamic Best Strategy', stateKey: 'useDynamicStrategy' },
    { id: 'adaptivePlayToggle', label: 'Adaptive Play Signals', stateKey: 'useAdaptivePlay' },
    { id: 'tableChangeWarningsToggle', label: 'Table Change Warnings', stateKey: 'useTableChangeWarnings' },
    { id: 'dueForHitToggle', label: 'Due for a Hit (Contrarian)', stateKey: 'useDueForHit' },
    { id: 'neighbourFocusToggle', label: 'Neighbour Focus', stateKey: 'useNeighbourFocus' },
    { id: 'lessStrictModeToggle', label: 'Less Strict Mode', stateKey: 'useLessStrict' },
    { id: 'dynamicTerminalNeighbourCountToggle', label: 'Dynamic Terminal Neighbour Count', stateKey: 'useDynamicTerminalNeighbourCount' }
];

// --- HELPER FUNCTIONS ---
function getRouletteNumberColor(n) {
    if (n === 0) return 'green';
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    if (redNumbers.includes(n)) return 'red';
    return 'black';
}

function toggleGuide(contentId) {
    const content = document.getElementById(contentId);
    if (content) {
        content.classList.toggle('open');
    }
}

// --- UI RENDERING & MANIPULATION (Exported for other modules to use) ---

// NOTE: renderCalculationDetails is now mostly absorbed into handleNewCalculation for direct rendering.
function renderCalculationDetails(num1, num2, streaks = {}, boardStats = {}, lastWinningNumber = null, usePocketDistance = false) {
    let detailsHtml = '<h3 class="text-lg font-bold text-gray-800 mb-2">Calculation Groups</h3><div class="space-y-2">';

    state.activePredictionTypes.forEach(type => {
        const predictionTypeDefinition = config.allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return;

        const baseNum = predictionTypeDefinition.calculateBase(num1, num2);
        if (baseNum < 0 || baseNum > 36) return;

        const terminals = config.terminalMapping?.[baseNum] || [];
        
        const streak = streaks[type.id] || 0;
        let confirmedByHtml = '';
        if (streak >= 2) {
            confirmedByHtml = ` <strong style="color: #16a34a;">- Confirmed by ${streak}</strong>`;
        }

        const stats = boardStats[type.id] || { success: 0, total: 0 };
        const hitRate = stats.total > 0 ? (stats.success / stats.total * 100) : 0;
        let pocketDistanceHtml = '';

        if (usePocketDistance && lastWinningNumber !== null) {
            const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            let minDistance = Infinity;
            if (hitZone.length > 0) {
                hitZone.forEach(zoneNum => {
                    const dist = calculatePocketDistance(zoneNum, lastWinningNumber, config.rouletteWheel);
                    if (dist < minDistance) minDistance = dist;
                });
            }
            if(minDistance !== Infinity) {
                 pocketDistanceHtml = `<span class="text-pink-500">Dist: <strong>${minDistance}</strong></span>`;
            }
        }

        detailsHtml += `
            <div class="p-3 rounded-lg border" style="border-color: ${type.textColor || '#e2e8f0'};">
                <strong style="color: ${type.textColor || '#1f2937'};">${type.displayLabel} (Base: ${baseNum})</strong>
                <p class="text-sm text-gray-600">Terminals: ${terminals.join(', ') || 'None'}${confirmedByHtml}</p>
                <div class="group-stats">
                    <span>Hit Rate: <strong>${hitRate.toFixed(1)}%</strong></span>
                    ${pocketDistanceHtml}
                </div>
            </div>
        `;
    });

    detailsHtml += '</div>';
    dom.resultDisplay.classList.remove('hidden');
}


export function updateAllTogglesUI() {
    // Update individual toggle states based on state.js
    strategyTogglesDefinitions.forEach(toggleDef => {
        if (dom[toggleDef.id]) { // Ensure the DOM element exists before trying to set checked
            dom[toggleDef.id].checked = state[toggleDef.stateKey];
        }
    });
}

export function updateWinLossCounter() {
    let wins = 0;
    let losses = 0;

    state.history.forEach(item => {
        if (item.recommendedGroupId) {
            if (item.hitTypes && item.hitTypes.includes(item.recommendedGroupId)) {
                wins++;
            } else if (item.winningNumber !== null) {
                losses++;
            }
        }
    });

    dom.winCount.textContent = wins;
    dom.lossCount.textContent = losses;
}

export function drawRouletteWheel(currentDiff = null, lastWinningNumber = null) {
    if (!dom.rouletteWheelContainer) return;
    dom.rouletteWheelContainer.innerHTML = '';
    const svgWidth = dom.rouletteWheelContainer.clientWidth || 300;
    const svgHeight = svgWidth;
    const radius = (svgWidth / 2) * 0.8;
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const numberRadius = 15;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "rouletteWheel");
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    const outerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    outerCircle.setAttribute("cx", centerX);
    outerCircle.setAttribute("cy", centerY);
    outerCircle.setAttribute("r", radius + numberRadius + 5);
    outerCircle.setAttribute("fill", "none");
    outerCircle.setAttribute("stroke", "#e2e8f0");
    outerCircle.setAttribute("stroke-width", "2");
    svg.appendChild(outerCircle);

    const highlightedNumbers = new Set();
    const hitZoneClasses = {};

    if (currentDiff !== null && !isNaN(currentDiff)) {
        const num1 = parseInt(dom.number1.value, 10);
        const num2 = parseInt(dom.number2.value, 10);

        state.activePredictionTypes.forEach(type => {
            const baseNum = config.allPredictionTypes.find(t => t.id === type.id).calculateBase(num1, num2);
            if (baseNum < 0 || baseNum > 36) return;
            
            const terminals = config.terminalMapping?.[baseNum] || [];
            const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            hitZone.forEach(num => {
                highlightedNumbers.add(num);
                if (!hitZoneClasses[num]) {
                    hitZoneClasses[num] = `highlight-${type.id}`;
                }
            });
        });
    }

    config.rouletteWheel.forEach((number, index) => {
        const angle = (index / config.rouletteWheel.length) * 2 * Math.PI - (Math.PI / 2);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const numberColor = getRouletteNumberColor(number);
        let strokeClass = '';

        if (lastWinningNumber !== null && number === lastWinningNumber) {
            strokeClass = 'highlight-winning';
        } else if (highlightedNumbers.has(number)) {
            strokeClass = hitZoneClasses[number];
        }

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", numberRadius);
        circle.setAttribute("class", `wheel-number-circle ${numberColor} ${strokeClass}`);
        svg.appendChild(circle);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", y + 3);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "wheel-number-text");
        text.textContent = number;
        svg.appendChild(text);
    });

    dom.rouletteWheelContainer.appendChild(svg);
}

export function renderHistory() {
    updateWinLossCounter();

    if (!dom.historyList) return;
    dom.historyList.innerHTML = `<li class="text-center text-gray-500 py-4">No calculations yet.</li>`;
    if (state.history.length === 0) return;
    dom.historyList.innerHTML = '';

    [...state.history].sort((a, b) => b.id - a.id).forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item relative';

        let stateBadgeContent = '';
        let stateBadgeClass = 'bg-gray-400';

        // --- NEW BADGE LOGIC ---
        if (item.status === 'pending') {
            stateBadgeContent = 'Pending';
        } else if (item.recommendedGroupId && item.recommendationDetails) {
            const details = item.recommendationDetails;
            const recommendedType = config.allPredictionTypes.find(t => t.id === item.recommendedGroupId);
            const recommendedLabel = recommendedType?.displayLabel || 'Unknown';
            const hitRate = details.hitRate || 0;
            const recommendedHit = item.hitTypes.includes(item.recommendedGroupId);

            let resultText = '';
            if (item.status !== 'pending') {
                resultText = recommendedHit ? ' - HIT' : ' - MISS';
            }

            stateBadgeContent = `Top: ${recommendedLabel} (${hitRate.toFixed(1)}%) ${resultText}`;
            stateBadgeClass = recommendedHit ? (recommendedType?.colorClass || 'bg-green-500') : 'bg-red-500';
        } else {
            stateBadgeContent = 'No Recommendation';
            stateBadgeClass = 'bg-gray-500';
        }

        // --- NEW ADDITIONAL DETAILS LOGIC ---
        let additionalDetailsHtml = '';
        const detailsParts = [];

        // "Pocket Distance" detail
        if (state.usePocketDistance && item.status !== 'pending' && item.pocketDistance !== null) {
            detailsParts.push(`<span class="text-pink-500">Pocket Distance: <strong>${item.pocketDistance}</strong></span>`);
        }

        if (detailsParts.length > 0) {
            additionalDetailsHtml = `<div class="additional-details">${detailsParts.join(' | ')}</div>`;
        }
        
        // --- AI DETAILS ---
        let aiDetailsHtml = '';
        if (item.recommendedGroupId && item.recommendationDetails) {
            aiDetailsHtml = `
                <div class="ai-details-toggle" data-target="ai-details-${item.id}">Show AI Details</div>
                <div id="ai-details-${item.id}" class="ai-details-section">
                    <ul>
                        ${item.recommendationDetails.primaryDrivingFactor ? `<li><strong>Reason: ${item.recommendationDetails.primaryDrivingFactor}</strong></li>` : ''}
                        <li>Final Score: ${item.recommendationDetails.finalScore.toFixed(2)}</li>
                    </ul>
                </div>
            `;
        }

        li.innerHTML = `
            <div class="state-badge ${stateBadgeClass}">${stateBadgeContent}</div>
            <div class="calculation-info">
                <p>${item.num2} - ${item.num1} = <strong class="text-lg">${item.difference}</strong></p>
                ${additionalDetailsHtml}
            </div>
            <div class="flex items-center space-x-2">
                <button class="delete-btn" data-id="${item.id}" aria-label="Delete item"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m-1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
            ${aiDetailsHtml}
        `;
        dom.historyList.appendChild(li);
    });

    // Re-attach listeners for the new "Show Details" toggles
    document.querySelectorAll('.ai-details-toggle').forEach(toggle => {
        toggle.onclick = () => {
            const targetElement = document.getElementById(toggle.dataset.target);
            if (targetElement) {
                targetElement.classList.toggle('open');
                toggle.textContent = targetElement.classList.contains('open') ? 'Hide AI Details' : 'Show AI Details';
            }
        };
    });
}

export function renderAnalysisList(neighbourScores) {
    dom.analysisList.innerHTML = '';
    const sortedAnalysis = Object.entries(neighbourScores).map(([num, scores]) => ({ num: parseInt(num), score: scores.success })).sort((a, b) => b.score - a.score);
    if (sortedAnalysis.length > 0 && !sortedAnalysis.every(a => a.score === 0)) {
        sortedAnalysis.forEach(({num, score}) => {
            dom.analysisList.innerHTML += `<li class="grid grid-cols-2 items-center p-2 rounded-md ${score > 0 ? 'bg-green-50' : ''}"><div class="font-bold text-lg text-center text-indigo-600">${num}</div><div class="font-semibold text-center ${score > 0 ? 'text-green-700' : 'text-gray-600'}">Score: ${score.toFixed(2)}</div></li>`;
        });
    } else {
        dom.analysisList.innerHTML = `<li class="text-center text-gray-500 py-4">Not enough data.</li>`;
    }
}

export function renderBoardState(boardStats) {
    dom.boardStateAnalysis.innerHTML = '';
    for(const typeId in boardStats) {
        const type = config.allPredictionTypes.find(t => t.id === typeId);
        if (!type) continue;
        const stats = boardStats[typeId];
        const hitRate = stats.total > 0 ? (stats.success / stats.total * 100) : 0;
        dom.boardStateAnalysis.innerHTML += `<div class="text-sm"><span class="font-semibold" style="color:${type.textColor || '#1f2937'};">${type.displayLabel}:</span><span class="float-right font-medium">${hitRate.toFixed(2)}%</span></div>`;
    }
}

export function renderStrategyWeights() {
    if (!dom.strategyWeightsDisplay) return;
    dom.strategyWeightsDisplay.innerHTML = '';

    for (const key in state.strategyStates) {
        const strategy = state.strategyStates[key];
        const weightPercentage = ((strategy.weight - config.STRATEGY_CONFIG.minWeight) / (config.STRATEGY_CONFIG.maxWeight - config.STRATEGY_CONFIG.minWeight)) * 100;
        const weightColor = strategy.weight > 1.0 ? 'bg-green-500' : strategy.weight < 1.0 ? 'bg-red-500' : 'bg-blue-500';

        dom.strategyWeightsDisplay.innerHTML += `
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-medium text-sm text-gray-700">${strategy.name}</span>
                    <span class="font-semibold text-sm text-gray-600">${strategy.weight.toFixed(2)}x</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2.5">
                    <div class="${weightColor} h-2.5 rounded-full" style="width: ${Math.max(0, Math.min(100, weightPercentage))}%"></div>
                </div>
            </div>
        `;
    }
}

export function updateRouletteLegend() {
    if (!dom.rouletteLegend) return;
    dom.rouletteLegend.innerHTML = `
        <div class="roulette-legend-item"><div class="roulette-legend-color bg-roulette-green"></div> Green (0)</div>
        <div class="roulette-legend-item"><div class="roulette-legend-color bg-roulette-red"></div> Red Numbers</div>
        <div class="roulette-legend-item"><div class="roulette-legend-color bg-roulette-black"></div> Black Numbers</div>
    `;
    state.activePredictionTypes.forEach(type => {
        dom.rouletteLegend.innerHTML += `
            <div class="roulette-legend-item"><div class="roulette-legend-color ${type.colorClass}"></div> ${type.displayLabel}</div>
        `;
    });
    dom.rouletteLegend.innerHTML += `
        <div class="roulette-legend-item"><div class="roulette-legend-color bg-highlight-winning"></div> Winning Number</div>
    `;
}

// --- Worker UI Update Functions ---
export function updateOptimizationStatus(htmlContent) {
    if (dom.optimizationStatus) dom.optimizationStatus.innerHTML = htmlContent;
}

export function showOptimizationComplete(payload) {
    if (dom.optimizationStatus) dom.optimizationStatus.textContent = 'Optimization finished!';
    if (dom.optimizationResult) dom.optimizationResult.classList.remove('hidden');
    if (dom.bestFitnessResult) dom.bestFitnessResult.textContent = payload.bestFitness;
    if (dom.bestParamsResult) dom.bestParamsResult.textContent = JSON.stringify(payload.bestIndividual, null, 2);
    if (dom.startOptimizationButton) dom.startOptimizationButton.disabled = false;
    if (dom.stopOptimizationButton) dom.stopOptimizationButton.disabled = true;
    toggleParameterSliders(true);
}

export function showOptimizationStopped() {
    if (dom.optimizationStatus) dom.optimizationStatus.textContent = 'Optimization stopped by user.';
    if (dom.startOptimizationButton) dom.startOptimizationButton.disabled = false;
    if (dom.stopOptimizationButton) dom.stopOptimizationButton.disabled = true;
    toggleParameterSliders(true);
}

export function updateAiStatus(message) {
    if (dom.aiModelStatus) dom.aiModelStatus.textContent = message;
}

// --- EVENT HANDLERS (Private to this module) ---

/**
 * Handles the "Calculate" button click. Gathers all necessary stats and renders
 * the detailed calculation groups display.
 */
function handleNewCalculation() {
    if (!dom.number1 || !dom.number2 || !dom.resultDisplay) return;

    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        dom.resultDisplay.innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers.</p>`;
        dom.resultDisplay.classList.remove('hidden');
        return;
    }

    // --- Gather all necessary stats before calling getRecommendation ---
    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const lastWinningNumber = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

    const newHistoryItem = {
        id: Date.now(),
        num1: num1Val,
        num2: num2Val,
        difference: Math.abs(num2Val - num1Val),
        status: 'pending',
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null,
        recommendationDetails: null
    };
    state.history.push(newHistoryItem);

    const aiPredictionData = null; // AI prediction will come later via runAllAnalyses
    const recommendation = getRecommendation({
        trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
        isForWeightUpdate: false, aiPredictionData: aiPredictionData, currentAdaptiveInfluences: state.adaptiveFactorInfluences,
        lastWinningNumber: lastWinningNumber, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
        useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: state.isAiReady,
        useTrendConfirmationBool: state.useTrendConfirmation, current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: state.history,
        activePredictionTypes: state.activePredictionTypes,
        useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
        terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
    });

    newHistoryItem.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
    newHistoryItem.recommendationDetails = recommendation.details;

    let fullResultHtml = `
        <h3 class="text-lg font-bold text-gray-800 mb-2">Recommendation</h3>
        <div class="result-display p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4 text-center">
            ${recommendation.html}
        </div>
        <h3 class="text-lg font-bold text-gray-800 mb-2">Calculation Groups</h3>
        <div class="space-y-2">
    `;

    state.activePredictionTypes.forEach(type => {
        const predictionTypeDefinition = config.allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return;

        const baseNum = predictionTypeDefinition.calculateBase(num1Val, num2Val);
        if (baseNum < 0 || baseNum > 36) return;

        const terminals = config.terminalMapping?.[baseNum] || [];
        
        const streak = trendStats.currentStreaks[type.id] || 0;
        let confirmedByHtml = '';
        if (streak >= 2) {
            confirmedByHtml = ` <strong style="color: #16a34a;">- Confirmed by ${streak}</strong>`;
        }

        const stats = boardStats[type.id] || { success: 0, total: 0 };
        const hitRate = stats.total > 0 ? (stats.success / stats.total * 100) : 0;
        let pocketDistanceHtml = '';

        if (state.usePocketDistance && lastWinningNumber !== null) {
            const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            let minDistance = Infinity;
            if (hitZone.length > 0) {
                hitZone.forEach(zoneNum => {
                    const dist = calculatePocketDistance(zoneNum, lastWinningNumber, config.rouletteWheel);
                    if (dist < minDistance) minDistance = dist;
                });
            }
            if(minDistance !== Infinity) {
                 pocketDistanceHtml = `<span class="text-pink-500">Dist: <strong>${minDistance}</strong></span>`;
            }
        }

        fullResultHtml += `
            <div class="p-3 rounded-lg border" style="border-color: ${type.textColor || '#e2e8f0'};">
                <strong style="color: ${type.textColor || '#1f2937'};">${type.displayLabel} (Base: ${baseNum})</strong>
                <p class="text-sm text-gray-600">Terminals: ${terminals.join(', ') || 'None'}${confirmedByHtml}</p>
                <div class="group-stats">
                    <span>Hit Rate: <strong>${hitRate.toFixed(1)}%</strong></span>
                    ${pocketDistanceHtml}
                </div>
            </div>
        `;
    });

    fullResultHtml += '</div>';
    dom.resultDisplay.innerHTML = fullResultHtml;
    dom.resultDisplay.classList.remove('hidden');

    runAllAnalyses();
    renderHistory();
    drawRouletteWheel(newHistoryItem.difference, lastWinningNumber);
}


function handleSubmitResult() {
    if (!dom.winningNumberInput || !dom.number1 || !dom.number2) return;

    const lastItem = [...state.history].reverse().find(item => item.status === 'pending');
    if (!lastItem) {
        alert("Please perform a calculation first before submitting a winning number.");
        return;
    }

    const winningNumberVal = dom.winningNumberInput.value;
    let winningNumber = null;
    if (winningNumberVal.trim() !== '') {
        winningNumber = parseInt(winningNumberVal, 10);
    }

    if (winningNumber === null || isNaN(winningNumber) || winningNumber < 0 || winningNumber > 36) {
        alert("Please enter a valid winning number (0-36).");
        return;
    }

    runAllAnalyses(winningNumber);
    renderHistory();

    dom.winningNumberInput.value = '';

    const prevNum2 = parseInt(lastItem.num2, 10);

    if (!isNaN(prevNum2)) {
        dom.number1.value = prevNum2;
        dom.number2.value = winningNumber;
        setTimeout(() => {
            document.getElementById('calculateButton').click();
        }, 50);
    } else {
        console.warn('handleSubmitResult: previous num2 was not a valid number for auto-calculation.', lastItem.num2);
    }
}


function handleClearInputs() { 
    dom.number1.value = '';
    dom.number2.value = '';
    dom.winningNumberInput.value = '';
    dom.resultDisplay.classList.add('hidden');
    dom.number1.focus();
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
    drawRouletteWheel(null, lastWinning);
    if (dom.resultDisplay.textContent.includes('valid numbers')) {
        dom.resultDisplay.textContent = '';
    }
}

function handleSwap() { 
    const v = dom.number1.value; 
    dom.number1.value = dom.number2.value; 
    dom.number2.value = v; 
}

function handleHistoryAction(event) { 
    const button = event.target.closest('.delete-btn');
    if (!button) return;
    
    const newHistory = state.history.filter(item => item.id !== parseInt(button.dataset.id));
    state.setHistory(newHistory);
    
    const newLog = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); 
    
    runAllAnalyses();
    renderHistory();
    drawRouletteWheel();
    
    if (state.history.filter(item => item.status === 'success').length < config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        updateAiStatus(`AI Model: Need at least ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        aiWorker.postMessage({ type: 'clear_model' });
    }
}

function handleClearHistory() { 
    state.setHistory([]);
    state.setConfirmedWinsLog([]);
    state.setPatternMemory({});
    state.setAdaptiveFactorInfluences({
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    });
    state.setIsAiReady(false);
    updateAiStatus(`AI Model: Need at least ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
    
    runAllAnalyses();
    renderHistory();
    
    dom.historicalAnalysisMessage.textContent = 'History cleared.';
    drawRouletteWheel(); 
    
    aiWorker.postMessage({ type: 'clear_model' });
}

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (state.currentVideoURL) {
        URL.revokeObjectURL(state.currentVideoURL);
    }
    state.setCurrentVideoURL(URL.createObjectURL(file));

    dom.videoPlayer.src = state.currentVideoURL;
    dom.videoPlayer.classList.remove('hidden');
    dom.videoUploadContainer.classList.add('hidden');
    dom.videoControlsContainer.classList.remove('hidden');
    dom.videoStatus.textContent = 'Video loaded. Ready to analyze.';
}

function startVideoAnalysis() {
    dom.analyzeVideoButton.disabled = true;
    dom.videoStatus.textContent = 'Analyzing... (Feature in development)';
    console.log("Video analysis initiated.");
    setTimeout(() => {
        dom.analyzeVideoButton.disabled = false;
        dom.videoStatus.textContent = 'Analysis complete (simulation).';
    }, 2000);
}

function clearVideoState() {
    if (state.currentVideoURL) {
        URL.revokeObjectURL(state.currentVideoURL);
        state.setCurrentVideoURL(null);
    }
    dom.videoPlayer.src = '';
    dom.videoUpload.value = ''; 

    dom.videoPlayer.classList.add('hidden');
    dom.frameCanvas.classList.add('hidden');
    dom.videoControlsContainer.classList.add('hidden');
    dom.videoUploadContainer.classList.remove('hidden');
    dom.videoStatus.textContent = '';
}

function handlePresetSelection(presetName) {
    const preset = config.STRATEGY_PRESETS[presetName];
    if (!preset) {
        console.error(`Preset "${presetName}" not found.`);
        return;
    }

    Object.assign(config.STRATEGY_CONFIG, preset.STRATEGY_CONFIG);
    Object.assign(config.ADAPTIVE_LEARNING_RATES, preset.ADAPTIVE_LEARNING_RATES);
    state.setToggles(preset.TOGGLES);

    updateAllTogglesUI(); // This will now correctly update the dynamically rendered toggles
    initializeAdvancedSettingsUI();
    updateActivePredictionTypes();
    handleStrategyChange();
}

function createSlider(containerId, label, paramObj, paramName) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Slider container ${containerId} not found.`);
        return;
    }
    const id = `${paramName}Slider`;
    const paramDef = parameterDefinitions[paramName];
    if (!paramDef) {
        console.error(`Parameter definition for ${paramName} not found.`);
        return;
    }
    const { min, max, step } = paramDef;

    const sliderGroup = document.createElement('div');
    sliderGroup.className = 'slider-group';
    sliderGroup.innerHTML = `
        <label for="${id}">${label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${paramObj[paramName]}">
        <input type="number" id="${id}Input" min="${min}" max="${max}" step="${step}" value="${paramObj[paramName]}" class="form-input text-sm">
    `;
    container.appendChild(sliderGroup);

    const slider = document.getElementById(id);
    const numberInput = document.getElementById(`${id}Input`);

    const updateValue = (newValue) => {
        let val = parseFloat(newValue);
        if (isNaN(val)) val = paramObj[paramName];
        val = Math.max(min, Math.min(max, val));

        slider.value = val;
        numberInput.value = val;
        paramObj[paramName] = val;

        state.saveState(); 
        dom.parameterStatusMessage.textContent = 'Parameter changed. Re-analyzing...';
        handleStrategyChange(); 
    };

    slider.addEventListener('input', (e) => updateValue(e.target.value)); 
    numberInput.addEventListener('change', (e) => updateValue(e.target.value)); 
}

// MODIFIED: initializeAdvancedSettingsUI to add all sliders
export function initializeAdvancedSettingsUI() {
    // Clear previous sliders
    dom.strategyLearningRatesSliders.innerHTML = '';
    dom.patternThresholdsSliders.innerHTML = '';
    dom.adaptiveInfluenceSliders.innerHTML = '';

    // Create sliders for Core Strategy Parameters
    createSlider('strategyLearningRatesSliders', 'Success Learn Rate', config.STRATEGY_CONFIG, 'learningRate_success');
    createSlider('strategyLearningRatesSliders', 'Failure Learn Rate', config.STRATEGY_CONFIG, 'learningRate_failure');
    createSlider('strategyLearningRatesSliders', 'Max Weight', config.STRATEGY_CONFIG, 'maxWeight');
    createSlider('strategyLearningRatesSliders', 'Min Weight', config.STRATEGY_CONFIG, 'minWeight');
    createSlider('strategyLearningRatesSliders', 'Decay Factor', config.STRATEGY_CONFIG, 'decayFactor');

    // Create sliders for Pattern & Trigger Thresholds
    createSlider('patternThresholdsSliders', 'Pattern Min Attempts', config.STRATEGY_CONFIG, 'patternMinAttempts');
    createSlider('patternThresholdsSliders', 'Pattern Success %', config.STRATEGY_CONFIG, 'patternSuccessThreshold');
    createSlider('patternThresholdsSliders', 'Trigger Min Attempts', config.STRATEGY_CONFIG, 'triggerMinAttempts');
    createSlider('patternThresholdsSliders', 'Trigger Success %', config.STRATEGY_CONFIG, 'triggerSuccessThreshold');

    // Create sliders for Adaptive Influence Learning
    createSlider('adaptiveInfluenceSliders', 'Adaptive Success Rate', config.ADAPTIVE_LEARNING_RATES, 'SUCCESS');
    createSlider('adaptiveInfluenceSliders', 'Adaptive Failure Rate', config.ADAPTIVE_LEARNING_RATES, 'FAILURE');
    createSlider('adaptiveInfluenceSliders', 'Min Adaptive Influence', config.ADAPTIVE_LEARNING_RATES, 'MIN_INFLUENCE');
    createSlider('adaptiveInfluenceSliders', 'Max Adaptive Influence', config.ADAPTIVE_LEARNING_RATES, 'MAX_INFLUENCE');
}

// NEW: Function to render all strategy toggles and their guide text
function renderStrategyToggles() {
    if (!dom.strategiesContent || !dom.strategiesToggles) return;

    // Clear existing toggles and guide content
    dom.strategiesContent.innerHTML = ''; 
    
    // Add Base Strategies guide content
    dom.strategiesContent.innerHTML += `
        <div class="space-y-4">
            <h3 class="font-bold text-gray-800 text-lg">Base Strategies</h3>
            <p class="text-sm text-gray-600">Fundamental toggles that define the core behavior of your prediction system.</p>
            <div>
                <h4 class="font-bold text-gray-800">Wait for Trend Confirmation</h4>
                <p>When enabled, the app becomes more cautious. It will only issue a "Play" recommendation if its top-ranked state is the same as the state that won on the previous successful spin. Otherwise, it will advise you to wait for a stronger signal.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Use Neighbour Score Weighting</h4>
                <p>When enabled, this makes the recommendation smarter. It boosts the score of states whose "hit zones" contain numbers that are currently "hot" in the "Neighbour Analysis" panel.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Use Proximity Boost</h4>
                <p>When enabled, this gives a score boost to the state whose hit zone is physically closest on the roulette wheel to the last number spun, based on the theory of wheel "gravity".</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Show Pocket Distance in History</h4>
                <p>When enabled, each successful history entry will display the shortest "pocket distance" from the winning number to the successful prediction's hit zone.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Prioritize Lowest Pocket Distance</h4>
                <p>When enabled, the recommendation will prioritize the group(s) whose hit zone is closest (pocket distance 0 or 1) to the last confirmed winning number. This overrides other strategy weightings if a very close distance is found.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Enable Advanced Calculation Methods</h4>
                <p>When enabled, the app will track and recommend based on additional calculation methods (Sum, Sum +/- 1) alongside the standard Difference-based methods. All active methods will compete for the primary recommendation and have their performance tracked.</p>
            </div>
        </div>
        <div class="space-y-4 mt-6">
            <h3 class="font-bold text-gray-800 text-lg">Advanced Strategies</h3>
            <p class="text-sm text-gray-600">More complex and experimental strategies to fine-tune prediction behavior.</p>
            <div>
                <h4 class="font-bold text-gray-800">Dynamic Best Strategy</h4>
                <p>When enabled, the app will automatically analyze its recent history to identify which single prediction method is performing the best and advise playing it.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Adaptive Play Signals</h4>
                <p>Provides more nuanced betting advice ('Strong Play', 'Wait', 'Avoid Now') based on the quality and risk of the current signal.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Table Change Warnings</h4>
                <p>Provides warnings when a previously strong pattern seems to be breaking, helping you avoid potential losing streaks.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Due for a Hit (Contrarian)</h4>
                <p>When enabled, this strategy looks for a state that has been performing well below its historical average and recommends it, betting on a return to the mean.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Neighbour Focus</h4>
                <p>When enabled, this strategy refines the main recommendation by highlighting the "hottest" numbers from the Neighbour Analysis that fall within the recommended group's hit zone.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Less Strict Mode</h4>
                <p>When enabled, this relaxes the conditions for a "(High Confidence)" recommendation. It will be shown if the top state has a very high hit rate (over 60%) or a long winning streak (3 or more), removing the need for trend confirmation.</p>
            </div>
            <div>
                <h4 class="font-bold text-gray-800">Dynamic Terminal Neighbour Count</h4>
                <p>When enabled, the "hit zone" for a prediction will dynamically adjust its terminal neighbour count based on whether the winning number is a direct hit or a neighbor. If the winning number is the base number or a direct terminal, the terminal neighbour count will be 0. Otherwise, it will use the standard terminal neighbour count (3 or 1).</p>
            </div>
        </div>
    `;

    // Create a div for the actual toggles (pt-2 divide-y divide-gray-200)
    const togglesContainer = document.createElement('div');
    togglesContainer.className = 'pt-2 divide-y divide-gray-200';
    
    strategyTogglesDefinitions.forEach(toggleDef => {
        const labelElement = document.createElement('label');
        labelElement.className = 'toggle-label';
        labelElement.innerHTML = `
            <span class="font-medium text-gray-700">${toggleDef.label}</span>
            <input type="checkbox" id="${toggleDef.id}" class="toggle-checkbox">
            <div class="toggle-switch"><div class="toggle-knob"></div></div>
        `;
        togglesContainer.appendChild(labelElement);
    });
    dom.strategiesContent.appendChild(togglesContainer); // Append the toggles container to strategiesContent
}


function resetAllParameters() {
    Object.assign(config.STRATEGY_CONFIG, config.DEFAULT_PARAMETERS.STRATEGY_CONFIG);
    Object.assign(config.ADAPTIVE_LEARNING_RATES, config.DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES);
    state.setToggles(config.DEFAULT_PARAMETERS.TOGGLES);
    updateAllTogglesUI(); 
    initializeAdvancedSettingsUI(); 
    dom.parameterStatusMessage.textContent = 'Parameters reset to defaults.';
    handleStrategyChange();
}

function saveParametersToFile() {
    const parametersToSave = {
        STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
        TOGGLES: {
            useTrendConfirmation: state.useTrendConfirmation, useWeightedZone: state.useWeightedZone, 
            useProximityBoost: state.useProximityBoost, usePocketDistance: state.usePocketDistance, 
            useLowestPocketDistance: state.useLowestPocketDistance, useAdvancedCalculations: state.useAdvancedCalculations, 
            useDynamicStrategy: state.useDynamicStrategy, useAdaptivePlay: state.useAdaptivePlay, 
            useTableChangeWarnings: state.useTableChangeWarnings, useDueForHit: state.useDueForHit, 
            useNeighbourFocus: state.useNeighbourFocus, useLessStrict: state.useLessStrict, 
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount
        }
    };
    const dataStr = JSON.stringify(parametersToSave, null, 2); 
    const blob = new Blob([dataStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roulette_parameters.json';
    a.click();
    URL.revokeObjectURL(a.href);
    dom.parameterStatusMessage.textContent = 'Parameters saved.';
}

function loadParametersFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loaded = JSON.parse(e.target.result);
            if (loaded.STRATEGY_CONFIG) Object.assign(config.STRATEGY_CONFIG, loaded.STRATEGY_CONFIG);
            if (loaded.ADAPTIVE_LEARNING_RATES) Object.assign(config.ADAPTIVE_LEARNING_RATES, loaded.ADAPTIVE_LEARNING_RATES);
            if (loaded.TOGGLES) state.setToggles(loaded.TOGGLES);
            updateAllTogglesUI(); 
            initializeAdvancedSettingsUI(); 
            dom.parameterStatusMessage.textContent = 'Parameters loaded successfully!';
            handleStrategyChange();
        } catch (error) {
            dom.parameterStatusMessage.textContent = `Error: ${error.message}`;
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

export function toggleParameterSliders(enable) {
    if (!dom.advancedSettingsContent) return;

    // Toggle main action buttons
    dom.setHighestWinRatePreset.disabled = !enable;
    dom.setBalancedSafePreset.disabled = !enable;
    dom.setAggressiveSignalsPreset.disabled = !enable;
    dom.resetParametersButton.disabled = !enable;
    dom.saveParametersButton.disabled = !enable;
    dom.loadParametersLabel.classList.toggle('btn-disabled', !enable);
    dom.loadParametersInput.disabled = !enable;

    // Toggle individual parameter sliders based on their categories' optimization toggles
    for (const paramName in parameterMap) {
        const sliderElement = document.getElementById(`${paramName}Slider`);
        const numberInput = document.getElementById(`${paramName}SliderInput`);

        if (sliderElement && numberInput) {
            let categoryToggleChecked = true; // Assume enabled by default

            if (parameterDefinitions[paramName].category === 'coreStrategy') {
                categoryToggleChecked = dom.optimizeCoreStrategyToggle.checked;
            } else if (parameterDefinitions[paramName].category === 'adaptiveRates') {
                categoryToggleChecked = dom.optimizeAdaptiveRatesToggle.checked;
            }
            
            // A slider/input is enabled if the main `enable` is true AND its category toggle is checked
            const shouldBeEnabled = enable && categoryToggleChecked;
            sliderElement.disabled = !shouldBeEnabled;
            numberInput.disabled = !shouldBeEnabled;
        }
    }
}

// --- UI INITIALIZATION HELPERS ---

function attachMainActionListeners() {
    // Connect the new functions to the correct buttons
    document.getElementById('calculateButton').addEventListener('click', handleNewCalculation);
    document.getElementById('submitResultButton').addEventListener('click', handleSubmitResult);

    document.getElementById('clearInputsButton').addEventListener('click', handleClearInputs);
    document.getElementById('swapButton').addEventListener('click', handleSwap);
    document.getElementById('clearHistoryButton').addEventListener('click', handleClearHistory);
    dom.historyList.addEventListener('click', handleHistoryAction);
    dom.recalculateAnalysisButton.addEventListener('click', () => runAllAnalyses()); // Use arrow func for simplicity
    
    // Add Enter key listener for the main inputs
    [dom.number1, dom.number2].forEach(input => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNewCalculation();
    }));

    // Add Enter key listener for the winning number input
    dom.winningNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmitResult();
    });
}

// MODIFIED: attachToggleListeners to loop through the new strategyTogglesDefinitions
function attachToggleListeners() {
    strategyTogglesDefinitions.forEach(toggleDef => {
        if (dom[toggleDef.id]) { // Ensure the DOM element exists
            dom[toggleDef.id].addEventListener('change', () => {
                const newToggleStates = { ...state };
                newToggleStates[toggleDef.stateKey] = dom[toggleDef.id].checked;
                state.setToggles(newToggleStates);

                if (toggleDef.stateKey === 'usePocketDistance') {
                    renderHistory();
                } else if (toggleDef.stateKey === 'useAdvancedCalculations' || toggleDef.stateKey === 'useDynamicTerminalNeighbourCount') {
                    updateActivePredictionTypes();
                    handleStrategyChange();
                    const num1Val = parseInt(dom.number1.value, 10);
                    const num2Val = parseInt(dom.number2.value, 10);
                    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
                    drawRouletteWheel(!isNaN(num1Val) && !isNaN(num2Val) ? Math.abs(num2Val-num1Val) : null, lastWinning);
                } else {
                    handleStrategyChange();
                }
            });
        }
    });
}

function attachAdvancedSettingsListeners() {
    // Presets
    dom.setHighestWinRatePreset.addEventListener('click', () => handlePresetSelection('highestWinRate'));
    dom.setBalancedSafePreset.addEventListener('click', () => handlePresetSelection('balancedSafe'));
    dom.setAggressiveSignalsPreset.addEventListener('click', () => handlePresetSelection('aggressiveSignals'));

    // Parameter Management
    dom.resetParametersButton.addEventListener('click', resetAllParameters);
    dom.saveParametersButton.addEventListener('click', saveParametersToFile);
    dom.loadParametersInput.addEventListener('change', loadParametersFromFile);

    // Historical Analysis
    dom.analyzeHistoricalDataButton.addEventListener('click', handleHistoricalAnalysis);

    // Video Analysis
    if (dom.videoUpload) dom.videoUpload.addEventListener('change', handleVideoUpload);
    if (dom.analyzeVideoButton) dom.analyzeVideoButton.addEventListener('click', startVideoAnalysis);
    if (dom.clearVideoButton) dom.clearVideoButton.addEventListener('click', clearVideoState);

    // NEW: Category Toggle Listeners (these were already there but just for clarity)
    dom.optimizeCoreStrategyToggle.addEventListener('change', () => toggleParameterSliders(true)); // Pass true to re-evaluate all
    dom.optimizeAdaptiveRatesToggle.addEventListener('change', () => toggleParameterSliders(true)); // Pass true to re-evaluate all
}

// MODIFIED: attachGuideAndInfoListeners for new structure
function attachGuideAndInfoListeners() {
    // Guide toggles
    // Presets header no longer toggles guide content
    // document.getElementById('presetStrategyGuideHeader').addEventListener('click', () => toggleGuide('presetStrategyGuideContent')); // Removed
    if (dom.presetsHeader) { // Ensure presetsHeader exists to avoid error if HTML is not loaded yet
        // No click listener needed for presetsHeader as it's not collapsible
    }


    // New Strategies header toggle
    if (dom.strategiesHeader) { // Ensure strategiesHeader exists
        dom.strategiesHeader.addEventListener('click', () => toggleGuide('strategiesContent'));
    }
    
    // Advanced Settings header toggle
    if (dom.advancedSettingsHeader) { // Ensure advancedSettingsHeader exists
        dom.advancedSettingsHeader.addEventListener('click', () => toggleGuide('advancedSettingsContent'));
    }


    // History Info Dropdown
    if(dom.historyInfoToggle) {
        dom.historyInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.historyInfoDropdown.classList.toggle('hidden');
        });
    }
}
// MODIFIED: initializeUI to grab new DOM elements and render toggles
export function initializeUI() {
    const elementIds = [
        'number1', 'number2', 'resultDisplay', 'historyList', 'analysisList', 'boardStateAnalysis',
        'boardStateConclusion', 'historicalNumbersInput', 'imageUpload', 'imageUploadLabel',
        'analyzeHistoricalDataButton', 'historicalAnalysisMessage', 'aiModelStatus', 'recalculateAnalysisButton',
        'videoUpload', 'videoUploadLabel',
        'videoStatus', 'videoPlayer', 'frameCanvas', 'setHighestWinRatePreset', 'setBalancedSafePreset',
        'setAggressiveSignalsPreset', 'rouletteWheelContainer', 'rouletteLegend', 'strategyWeightsDisplay', 'winningNumberInput',
        'videoUploadContainer', 'videoControlsContainer', 'analyzeVideoButton', 'clearVideoButton',
        'historyInfoToggle', 'historyInfoDropdown', 'winCount', 'lossCount', 'optimizationStatus',
        'optimizationResult', 'bestFitnessResult', 'bestParamsResult', 'applyBestParamsButton',
        'startOptimizationButton', 'stopOptimizationButton', 'advancedSettingsHeader',
        'advancedSettingsContent', 'strategyLearningRatesSliders', 'patternThresholdsSliders',
        'adaptiveInfluenceSliders', 'resetParametersButton', 'saveParametersButton', 'loadParametersInput',
        'loadParametersLabel', 'parameterStatusMessage', 'submitResultButton',
        // New category toggle IDs
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle',
        // New combined strategies section IDs
        'strategiesHeader', 'strategiesContent', 'strategiesToggles',
        'presetsHeader' // Add this to grab the new presets header (though it doesn't toggle guide content)
    ];
    // Add all individual toggle IDs to the list for DOM collection
    strategyTogglesDefinitions.forEach(toggleDef => elementIds.push(toggleDef.id));

    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
    
    // NEW: Render strategy toggles before attaching their listeners
    renderStrategyToggles();

    attachMainActionListeners();
    attachToggleListeners(); // Now attaches to dynamically created toggles
    attachAdvancedSettingsListeners();
    attachGuideAndInfoListeners();
    
    dom.startOptimizationButton.addEventListener('click', () => {
        if (state.history.length < 20) {
            updateOptimizationStatus('Error: Need at least 20 history items.');
            return;
        }
        updateOptimizationStatus('Starting optimization...');
        dom.optimizationResult.classList.add('hidden');
        toggleParameterSliders(false); // Disable all sliders initially for optimization
        dom.startOptimizationButton.disabled = true;
        dom.stopOptimizationButton.disabled = false;
        
        const togglesForWorker = {
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            useProximityBoost: state.useProximityBoost,
            useWeightedZone: state.useWeightedZone,
            useNeighbourFocus: state.useNeighbourFocus,
            useTrendConfirmation: state.useTrendConfirmation,
            // Pass all individual strategy toggles to the worker if they need to be fixed
            usePocketDistance: state.usePocketDistance,
            useLowestPocketDistance: state.useLowestPocketDistance,
            useAdvancedCalculations: state.useAdvancedCalculations,
            useDynamicStrategy: state.useDynamicStrategy,
            useAdaptivePlay: state.useAdaptivePlay,
            useTableChangeWarnings: state.useTableChangeWarnings,
            useDueForHit: state.useDueForHit,
            useLessStrict: state.useLessStrict,
        };

        optimizationWorker.postMessage({
            type: 'start',
            payload: {
                history: state.history,
                terminalMapping: config.terminalMapping,
                rouletteWheel: config.rouletteWheel,
                GA_CONFIG: config.GA_CONFIG,
                toggles: togglesForWorker,
                // NEW: Pass which categories are enabled for optimization
                optimizeCategories: {
                    coreStrategy: dom.optimizeCoreStrategyToggle.checked,
                    adaptiveRates: dom.optimizeAdaptiveRatesToggle.checked
                }
            }
        });
    });

    dom.stopOptimizationButton.addEventListener('click', () => {
        optimizationWorker.postMessage({ type: 'stop' });
    });

    dom.applyBestParamsButton.addEventListener('click', () => {
        if (state.bestFoundParams) {
            const params = state.bestFoundParams;
            Object.assign(config.STRATEGY_CONFIG, {
                learningRate_success: params.learningRate_success, decayFactor: params.decayFactor,
                learningRate_failure: params.learningRate_failure, maxWeight: params.maxWeight,
                minWeight: params.minWeight, patternMinAttempts: params.patternMinAttempts,
                patternSuccessThreshold: params.patternSuccessThreshold, triggerMinAttempts: params.triggerMinAttempts,
                triggerSuccessThreshold: params.triggerSuccessThreshold
            });
            Object.assign(config.ADAPTIVE_LEARNING_RATES, {
                SUCCESS: params.adaptiveSuccessRate, FAILURE: params.adaptiveFailureRate,
                MIN_INFLUENCE: params.minAdaptiveInfluence, MAX_INFLUENCE: params.maxAdaptiveInfluence
            });
            initializeAdvancedSettingsUI();
            updateOptimizationStatus('Best parameters applied!');
            handleStrategyChange();
        }
    });

    document.addEventListener('click', (e) => {
        if (dom.historyInfoDropdown && !dom.historyInfoDropdown.contains(e.target) && !dom.historyInfoToggle.contains(e.target)) {
            dom.historyInfoDropdown.classList.add('hidden');
        }
    });


}
