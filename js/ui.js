// js/ui.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import { runAllAnalyses, handleStrategyChange, handleHistoricalAnalysis, updateActivePredictionTypes, labelHistoryFailures, initializeAi, trainAiOnLoad } from './analysis.js';
import { aiWorker, optimizationWorker } from './workers.js';

// --- DOM ELEMENT REFERENCES (Private to this module) ---
const dom = {};

// --- PARAMETER DEFINITIONS for UI (matches optimizationWorker's parameterSpace) ---
const parameterDefinitions = {
    learningRate_success: { min: 0.01, max: 1.0, step: 0.01, category: 'coreStrategy' },
    learningRate_failure: { min: 0.01, max: 0.5, step: 0.01, category: 'coreStrategy' },
    maxWeight: { min: 1.0, max: 10.0, step: 0.1, category: 'coreStrategy' },
    minWeight: { min: 0.0, max: 1.0, step: 0.01, category: 'coreStrategy' },
    decayFactor: { min: 0.7, max: 0.99, step: 0.01, category: 'coreStrategy' },
    patternMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    patternSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    triggerMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    triggerSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    SUCCESS: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' },
    FAILURE: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' },
    MIN_INFLUENCE: { min: 0.0, max: 1.0, step: 0.01, category: 'adaptiveRates' },
    MAX_INFLUENCE: { min: 1.0, max: 5.0, step: 0.1, category: 'adaptiveRates' }
};

const parameterMap = {
    learningRate_success: { obj: config.STRATEGY_CONFIG, label: 'Success Learn Rate', container: 'strategyLearningRatesSliders' },
    learningRate_failure: { obj: config.STRATEGY_CONFIG, label: 'Failure Learn Rate', container: 'strategyLearningRatesSliders' },
    maxWeight: { obj: config.STRATEGY_CONFIG, label: 'Max Weight', container: 'strategyLearningRatesSliders' },
    minWeight: { obj: config.STRATEGY_CONFIG, label: 'Min Weight', container: 'strategyLearningRatesSliders' },
    decayFactor: { obj: config.STRATEGY_CONFIG, label: 'Decay Factor', container: 'strategyLearningRatesSliders' },
    patternMinAttempts: { obj: config.STRATEGY_CONFIG, label: 'Pattern Min Attempts', container: 'patternThresholdsSliders' },
    patternSuccessThreshold: { obj: config.STRATEGY_CONFIG, label: 'Pattern Success %', container: 'patternThresholdsSliders' },
    triggerMinAttempts: { obj: config.STRATEGY_CONFIG, label: 'Trigger Min Attempts', container: 'patternThresholdsSliders' },
    triggerSuccessThreshold: { obj: config.STRATEGY_CONFIG, label: 'Trigger Success %', container: 'patternThresholdsSliders' },
    SUCCESS: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Adaptive Success Rate', container: 'adaptiveInfluenceSliders' },
    FAILURE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Adaptive Failure Rate', container: 'adaptiveInfluenceSliders' },
    MIN_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Min Adaptive Influence', container: 'adaptiveInfluenceSliders' },
    MAX_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Max Adaptive Influence', container: 'adaptiveInfluenceSliders' }
};

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
    dom.trendConfirmationToggle.checked = state.useTrendConfirmation;
    dom.weightedZoneToggle.checked = state.useWeightedZone;
    dom.proximityBoostToggle.checked = state.useProximityBoost;
    dom.pocketDistanceToggle.checked = state.usePocketDistance;
    dom.lowestPocketDistanceToggle.checked = state.useLowestPocketDistance;
    dom.advancedCalculationsToggle.checked = state.useAdvancedCalculations;
    dom.dynamicStrategyToggle.checked = state.useDynamicStrategy;
    dom.adaptivePlayToggle.checked = state.useAdaptivePlay;
    dom.tableChangeWarningsToggle.checked = state.useTableChangeWarnings;
    dom.dueForHitToggle.checked = state.useDueForHit;
    dom.neighbourFocusToggle.checked = state.useNeighbourFocus;
    dom.lessStrictModeToggle.checked = state.useLessStrict;
    dom.dynamicTerminalNeighbourCountToggle.checked = state.useDynamicTerminalNeighbourCount;
}

export function updateWinLossCounter() {
    let wins = 0;
    let losses = 0;

    state.history.forEach(item => {
        // Only count if a recommendation was made AND it was a 'Play' or 'Strong Play' signal
        if (item.recommendedGroupId && (item.signalType === 'Play' || item.signalType === 'Strong Play')) {
            if (item.hitTypes && item.hitTypes.includes(item.recommendedGroupId)) {
                wins++;
            } else if (item.winningNumber !== null) { // Only count as loss if winning number was provided
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

    // Get recommendation for the *current* state of the input numbers
    const num1ForDisplay = parseInt(dom.number1.value, 10);
    const num2ForDisplay = parseInt(dom.number2.value, 10);

    if (!isNaN(num1ForDisplay) && !isNaN(num2ForDisplay)) {
        // Recalculate recommendation for visualization based on current inputs,
        // without affecting history or state. This is for visual feedback only.
        const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const lastWinningForViz = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

        const tempRecommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1ForDisplay, inputNum2: num2ForDisplay,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: state.adaptiveFactorInfluences,
            lastWinningNumber: lastWinningForViz, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: state.isAiReady,
            useTrendConfirmationBool: state.useTrendConfirmation, current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: state.history,
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        // Only highlight if a valid recommendation group exists and it's a "Play" signal
        if (tempRecommendation.bestCandidate && (tempRecommendation.signalType === 'Play' || tempRecommendation.signalType === 'Strong Play')) {
            const recoType = config.allPredictionTypes.find(t => t.id === tempRecommendation.bestCandidate.type.id);
            if (recoType) {
                const baseNumForReco = recoType.calculateBase(num1ForDisplay, num2ForDisplay);
                const terminalsForReco = config.terminalMapping?.[baseNumForReco] || [];
                const hitZoneForReco = getHitZone(baseNumForReco, terminalsForReco, lastWinningForViz, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
                hitZoneForReco.forEach(num => {
                    highlightedNumbers.add(num);
                    if (!hitZoneClasses[num]) {
                        hitZoneClasses[num] = `highlight-${recoType.id}`;
                    }
                });
            }
        }
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

        // Display the explicitly stored signalType
        if (item.signalType) {
            stateBadgeContent = item.signalType;
            if (item.signalType === 'Play' || item.signalType === 'Strong Play') {
                stateBadgeClass = item.hitTypes.includes(item.recommendedGroupId) ? 'bg-green-500' : 'bg-red-500';
            } else { // 'Wait for Signal' or other non-play signals
                stateBadgeClass = 'bg-gray-500'; // Neutral for non-betting signals
            }
        } else { // Fallback if signalType is not defined (for old history items perhaps)
            if (item.status === 'pending') {
                stateBadgeContent = 'Pending';
            } else if (item.recommendedGroupId) {
                stateBadgeContent = item.hitTypes.includes(item.recommendedGroupId) ? 'HIT' : 'MISS';
                stateBadgeClass = item.hitTypes.includes(item.recommendedGroupId) ? 'bg-green-500' : 'bg-red-500';
            } else {
                stateBadgeContent = 'No Reco';
                stateBadgeClass = 'bg-gray-500';
            }
        }


        let additionalDetailsHtml = '';
        const detailsParts = [];

        if (state.usePocketDistance && item.status !== 'pending' && item.pocketDistance !== null) {
            detailsParts.push(`<span class="text-pink-500">Pocket Distance: <strong>${item.pocketDistance}</strong></span>`);
        }

        if (detailsParts.length > 0) {
            additionalDetailsHtml = `<div class="additional-details">${detailsParts.join(' | ')}</div>`;
        }
        
        let aiDetailsHtml = '';
        if (item.recommendedGroupId && item.recommendationDetails) {
            aiDetailsHtml = `
                <div class="ai-details-toggle" data-target="ai-details-${item.id}">Show AI Details</div>
                <div id="ai-details-${item.id}" class="ai-details-section">
                    <ul>
                        ${item.recommendationDetails.primaryDrivingFactor ? `<li><strong>Reason: ${item.recommendationDetails.primaryDrivingFactor}</strong></li>` : ''}
                        <li>Final Score: ${item.recommendationDetails.finalScore.toFixed(2)}</li>
                        <li>ML Prob: ${item.recommendationDetails.mlProbability ? (item.recommendationDetails.mlProbability * 100).toFixed(1) + '%' : 'N/A'}</li>
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

// Removed live data specific UI update functions (renderLiveTables, updateLiveTableNumbers, updateLiveConnectionStatus)


// --- EVENT HANDLERS (Private to this module) ---

function attachMainActionListeners() {
    document.getElementById('calculateButton').addEventListener('click', handleNewCalculation);
    document.getElementById('submitResultButton').addEventListener('click', handleSubmitResult);

    document.getElementById('clearInputsButton').addEventListener('click', handleClearInputs);
    document.getElementById('swapButton').addEventListener('click', handleSwap);
    document.getElementById('clearHistoryButton').addEventListener('click', handleClearHistory);
    dom.historyList.addEventListener('click', handleHistoryAction);
    dom.recalculateAnalysisButton.addEventListener('click', () => runAllAnalyses()); 
    
    [dom.number1, dom.number2].forEach(input => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNewCalculation();
    }));

    dom.winningNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmitResult();
    });
}

function attachToggleListeners() {
    const toggles = {
        trendConfirmationToggle: 'useTrendConfirmation', weightedZoneToggle: 'useWeightedZone',
        proximityBoostToggle: 'useProximityBoost', pocketDistanceToggle: 'usePocketDistance',
        lowestPocketDistanceToggle: 'useLowestPocketDistance', advancedCalculationsToggle: 'useAdvancedCalculations',
        dynamicStrategyToggle: 'useDynamicStrategy', adaptivePlayToggle: 'useAdaptivePlay',
        tableChangeWarningsToggle: 'useTableChangeWarnings', dueForHitToggle: 'useDueForHit',
        neighbourFocusToggle: 'useNeighbourFocus', lessStrictModeToggle: 'useLessStrict',
        dynamicTerminalNeighbourCountToggle: 'useDynamicTerminalNeighbourCount'
    };

    for (const [toggleId, stateKey] of Object.entries(toggles)) {
        dom[toggleId].addEventListener('change', () => {
            const newToggleStates = { ...state };
            newToggleStates[stateKey] = dom[toggleId].checked;
            state.setToggles(newToggleStates);

            if (stateKey === 'usePocketDistance') {
                renderHistory();
            } else if (stateKey === 'useAdvancedCalculations' || stateKey === 'useDynamicTerminalNeighbourCount') {
                updateActivePredictionTypes();
                handleStrategyChange();
                const num1Val = parseInt(dom.number1.value, 10);
                const num2Val = parseInt(document.getElementById('number2').value, 10);
                const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
                drawRouletteWheel(!isNaN(num1Val) && !isNaN(num2Val) ? Math.abs(num2Val-num1Val) : null, lastWinning);
            } else {
                handleStrategyChange();
            }
        });
    }

    // Removed liveDataToggle listener
}

function attachAdvancedSettingsListeners() {
    dom.setHighestWinRatePreset.addEventListener('click', () => handlePresetSelection('highestWinRate'));
    dom.setBalancedSafePreset.addEventListener('click', () => handlePresetSelection('balancedSafe'));
    dom.setAggressiveSignalsPreset.addEventListener('click', () => handlePresetSelection('aggressiveSignals'));

    dom.resetParametersButton.addEventListener('click', resetAllParameters);
    dom.saveParametersButton.addEventListener('click', saveParametersToFile);
    dom.loadParametersInput.addEventListener('change', loadParametersFromFile);

    dom.analyzeHistoricalDataButton.addEventListener('click', handleHistoricalAnalysis);

    if (dom.videoUpload) dom.videoUpload.addEventListener('change', handleVideoUpload);
    if (dom.analyzeVideoButton) dom.analyzeVideoButton.addEventListener('click', startVideoAnalysis);
    if (dom.clearVideoButton) dom.clearVideoButton.addEventListener('click', clearVideoState);

    dom.optimizeCoreStrategyToggle.addEventListener('change', () => toggleParameterSliders(true));
    dom.optimizeAdaptiveRatesToggle.addEventListener('change', () => toggleParameterSliders(true));
}

function attachGuideAndInfoListeners() {
    document.getElementById('presetStrategyGuideHeader').addEventListener('click', () => toggleGuide('presetStrategyGuideContent'));
    document.getElementById('baseStrategyGuideHeader').addEventListener('click', () => toggleGuide('baseStrategyGuideContent'));
    document.getElementById('advancedStrategyGuideHeader').addEventListener('click', () => toggleGuide('advancedStrategyGuideContent'));
    document.getElementById('advancedSettingsHeader').addEventListener('click', () => toggleGuide('advancedSettingsContent'));

    if(dom.historyInfoToggle) {
        dom.historyInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.historyInfoDropdown.classList.toggle('hidden');
        });
    }
}

// Removed toggleManualInputControls as it was tied to live data toggle
// Removed toggleLiveDataControls as it was tied to live data toggle


// --- INITIALIZATION ---
export function initializeUI() {
    const elementIds = [
        'number1', 'number2', 'resultDisplay', 'historyList', 'analysisList', 'boardStateAnalysis',
        'boardStateConclusion', 'historicalNumbersInput', 'imageUpload', 'imageUploadLabel',
        'analyzeHistoricalDataButton', 'historicalAnalysisMessage', 'aiModelStatus', 'recalculateAnalysisButton',
        'trendConfirmationToggle', 'weightedZoneToggle', 'proximityBoostToggle', 'pocketDistanceToggle',
        'lowestPocketDistanceToggle', 'advancedCalculationsToggle', 'dynamicStrategyToggle',
        'adaptivePlayToggle', 'tableChangeWarningsToggle', 'dueForHitToggle', 'neighbourFocusToggle',
        'lessStrictModeToggle', 'dynamicTerminalNeighbourCountToggle', 'videoUpload', 'videoUploadLabel',
        'videoStatus', 'videoPlayer', 'frameCanvas', 'setHighestWinRatePreset', 'setBalancedSafePreset',
        'setAggressiveSignalsPreset', 'rouletteWheelContainer', 'rouletteLegend', 'strategyWeightsDisplay', 'winningNumberInput',
        'videoUploadContainer', 'videoControlsContainer', 'analyzeVideoButton', 'clearVideoButton',
        'historyInfoToggle', 'historyInfoDropdown', 'winCount', 'lossCount', 'optimizationStatus',
        'optimizationResult', 'bestFitnessResult', 'bestParamsResult', 'applyBestParamsButton',
        'startOptimizationButton', 'stopOptimizationButton', 'advancedSettingsHeader',
        'advancedSettingsContent', 'strategyLearningRatesSliders', 'patternThresholdsSliders',
        'adaptiveInfluenceSliders', 'resetParametersButton', 'saveParametersButton', 'loadParametersInput',
        'loadParametersLabel', 'parameterStatusMessage', 'submitResultButton',
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle'
    ];
    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
    
    attachMainActionListeners();
    attachToggleListeners();
    attachAdvancedSettingsListeners();
    attachGuideAndInfoListeners();
    
    dom.startOptimizationButton.addEventListener('click', () => {
        if (state.history.length < 20) {
            updateOptimizationStatus('Error: Need at least 20 history items.');
            return;
        }
        updateOptimizationStatus('Starting optimization...');
        dom.optimizationResult.classList.add('hidden');
        toggleParameterSliders(false); 
        dom.startOptimizationButton.disabled = true;
        dom.stopOptimizationButton.disabled = false;
        
        const togglesForWorker = {
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            useProximityBoost: state.useProximityBoost,
            useWeightedZone: state.useWeightedZone,
            useNeighbourFocus: state.useNeighbourFocus,
            useTrendConfirmation: state.useTrendConfirmation,
            usePocketDistance: state.usePocketDistance,
            useLowestPocketDistance: state.useLowestPocketDistance,
            useAdvancedCalculations: state.useAdvancedCalculations,
            useDynamicStrategy: state.useDynamicStrategy,
            useAdaptivePlay: state.useAdaptivePlay,
            useTableChangeWarnings: state.useTableChangeWarnings,
            useDueForHit: state.useDueForHit,
            useLessStrict: state.useLessStrict
        };

        optimizationWorker.postMessage({
            type: 'start',
            payload: {
                history: state.history,
                terminalMapping: config.terminalMapping,
                rouletteWheel: config.rouletteWheel,
                GA_CONFIG: config.GA_CONFIG,
                toggles: togglesForWorker, 
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
            const params = state.bestFoundParams.bestIndividual; 
            const toggles = state.bestFoundParams.togglesUsed; 

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

            if (toggles) { 
                state.setToggles(toggles);
                updateAllTogglesUI(); 
            }
            
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
