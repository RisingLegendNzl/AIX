// js/ui.js

// --- IMPORTS ---
// Added getBoardStateStats and calculatePocketDistance
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker, optimizationWorker } from './workers.js'; 
import * as analysis from './analysis.js'; 

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
    MAX_INFLUENCE: { min: 1.0, max: 5.0, step: 0.1, category: 'adaptiveRates' },

    // NEW: Table Change Warning Parameters for Sliders (Match config.js)
    WARNING_ROLLING_WINDOW_SIZE: { min: 5, max: 50, step: 1, category: 'warningParameters' }, // Example range
    WARNING_MIN_PLAYS_FOR_EVAL: { min: 1, max: 20, step: 1, category: 'warningParameters' }, // Example range
    WARNING_LOSS_STREAK_THRESHOLD: { min: 1, max: 10, step: 1, category: 'warningParameters' }, // Example range
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { min: 0, max: 100, step: 1, category: 'warningParameters' }, // Example range
    DEFAULT_AVERAGE_WIN_RATE: { min: 0, max: 100, step: 1, category: 'warningParameters' } // Example range
};

// Map parameter names to their respective config objects and display labels
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
    MAX_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Max Adaptive Influence', container: 'adaptiveInfluenceSliders' },
    // Table Change Warning Parameters
    WARNING_ROLLING_WINDOW_SIZE: { obj: config.STRATEGY_CONFIG, label: 'Warn Window Size', container: 'warningParametersSliders' },
    WARNING_MIN_PLAYS_FOR_EVAL: { obj: config.STRATEGY_CONFIG, label: 'Warn Min Plays', container: 'warningParametersSliders' },
    WARNING_LOSS_STREAK_THRESHOLD: { obj: config.STRATEGY_CONFIG, label: 'Warn Loss Streak', container: 'warningParametersSliders' },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { obj: config.STRATEGY_CONFIG, label: 'Warn Win Rate %', container: 'warningParametersSliders' },
    DEFAULT_AVERAGE_WIN_RATE: { obj: config.STRATEGY_CONFIG, label: 'Default Avg Win Rate', container: 'warningParametersSliders' }
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
        // Only count wins/losses if:
        // 1. A recommendation was explicitly made (recommendedGroupId exists)
        // 2. A winning number was entered for that round (item.winningNumber !== null)
        // 3. The recommendation had a positive final score (item.recommendationDetails.finalScore > 0),
        //    indicating it was an explicit "Play" signal, not "Wait for Signal" or "Low Confidence".
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.finalScore > 0) {
            // Check if the recommended group hit
            if (item.hitTypes && item.hitTypes.includes(item.recommendedGroupId)) {
                wins++;
            } else {
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
            // Determine result text for display purposes (HIT/MISS/WAIT/AVOID)
            if (item.status !== 'pending') {
                if (details.signal === 'Avoid Play') { // Explicit avoid signal
                    resultText = ' - AVOID';
                } else if (details.finalScore > 0) { // Was an actionable "Play" signal
                    resultText = recommendedHit ? ' - HIT' : ' - MISS';
                } else { // Was a "Wait for Signal" or "Low Confidence"
                    resultText = ' - WAIT';
                }
            }

            stateBadgeContent = `Top: ${recommendedLabel} (${hitRate.toFixed(1)}%) ${resultText}`;
            
            // Determine badge color
            if (item.status !== 'pending' && details.signal === 'Avoid Play') { // Explicit avoid signal
                stateBadgeClass = 'bg-red-700'; // Dark red for avoid
            } else if (item.status !== 'pending' && details.finalScore <= 0) {
                 stateBadgeClass = 'bg-gray-500'; // "Wait" signal should be gray
            } else if (recommendedHit) {
                stateBadgeClass = recommendedType?.colorClass || 'bg-green-500'; // Green or type color for hits
            } else {
                stateBadgeClass = 'bg-red-500'; // Red for misses
            }

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

/**
 * Displays a warning message in the dedicated pattern alert section.
 * @param {string} message - The warning message to display.
 */
function showPatternAlert(message) {
    if (dom.patternAlert) {
        dom.patternAlert.innerHTML = `<strong>Warning:</strong> ${message}`;
        dom.patternAlert.classList.remove('hidden');
    }
}

/**
 * Hides the pattern alert message.
 */
function hidePatternAlert() {
    if (dom.patternAlert) {
        dom.patternAlert.classList.add('hidden');
        dom.patternAlert.textContent = '';
    }
}

/**
 * Calculates and displays the current recommendation based on the current input numbers
 * and the *latest* strategy settings. This function does NOT create new history items.
 * It's used for live updates when settings change.
 * @returns {Promise<void>}
 */
export async function updateCurrentRecommendationDisplay() { // Exported for analysis.js
    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        dom.resultDisplay.innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers.</p>`;
        dom.resultDisplay.classList.remove('hidden');
        hidePatternAlert();
        // Even if no numbers, redraw wheel to reflect last winning number and clear highlights
        drawRouletteWheel(null, state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null);
        return;
    }

    // --- Gather all necessary stats for recommendation ---
    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const rollingPerformance = analysis.calculateRollingPerformance(state.history, config.STRATEGY_CONFIG); 
    const factorShiftStatus = analysis.analyzeFactorShift(state.history, config.STRATEGY_CONFIG);
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

    // --- Get AI Prediction (if ready) ---
    ui.updateAiStatus('AI Model: Getting prediction...');
    const aiPredictionData = await analysis.getAiPrediction(state.history); 
    ui.updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);

    // --- Get Recommendation ---
    const recommendation = getRecommendation({
        trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
        isForWeightUpdate: false, // This is for display, not for weight updates
        aiPredictionData, 
        currentAdaptiveInfluences: state.adaptiveFactorInfluences,
        lastWinningNumber: lastWinning, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
        useNeighbourFocusBool: state.useNeighbourFocus, 
        isAiReadyBool: state.isAiReady, 
        useTrendConfirmationBool: state.useTrendConfirmation,
        useAdaptivePlayBool: state.useAdaptivePlay, 
        useLessStrictBool: state.useLessStrict,
        useTableChangeWarningsBool: state.useTableChangeWarnings,
        rollingPerformance: rollingPerformance, 
        factorShiftStatus: factorShiftStatus, 
        useLowestPocketDistanceBool: state.useLowestPocketDistance,
        isCurrentRepeat: analysis.isRepeatNumber(lastWinning, state.history), 
        isCurrentNeighborHit: analysis.isNeighborHit(lastWinning, state.history), 
        current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
        activePredictionTypes: state.activePredictionTypes,
        currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
        allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
    });
    
    // --- Render Recommendation and Calculation Groups ---
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

        if (state.usePocketDistance && lastWinning !== null) {
            const hitZone = getHitZone(baseNum, terminals, lastWinning, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            let minDistance = Infinity;
            if (hitZone.length > 0) {
                hitZone.forEach(zoneNum => {
                    const dist = calculatePocketDistance(zoneNum, lastWinning, config.rouletteWheel);
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

    if (recommendation.signal === 'Avoid Play') {
        showPatternAlert(recommendation.reason.replace('(Table Change Warning: ', '').replace(')', ''));
    } else {
        hidePatternAlert();
    }

    // Only draw the roulette wheel to reflect current inputs/settings, not linked to history creation
    drawRouletteWheel(Math.abs(num2Val - num1Val), lastWinning);
}


/**
 * Handles the "Calculate" button click. Creates a new history item and gets its initial recommendation.
 * This function should *only* be called when the user explicitly initiates a new calculation.
 */
function handleNewCalculation() {
    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        // If inputs are invalid, just display the error without creating a history item.
        updateCurrentRecommendationDisplay(); 
        return;
    }

    // Create a new history item for this calculation
    const newHistoryItem = {
        id: Date.now(),
        num1: num1Val,
        num2: num2Val,
        difference: Math.abs(num2Val - num1Val),
        status: 'pending', // Mark as pending, awaiting a winning number
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null, // Will be filled after async recommendation
        recommendationDetails: null // Will be filled after async recommendation
    };
    state.history.push(newHistoryItem);

    // Call updateCurrentRecommendationDisplay to show the recommendation for this NEW pending item
    // It will fetch prediction data and display the result.
    updateCurrentRecommendationDisplay();
    renderHistory(); // Re-render history to immediately show the newly added pending item
}


function handleSubmitResult() {
    if (!dom.winningNumberInput || !dom.number1 || !dom.number2) return;

    // Find the truly last PENDING item where the user is expected to submit a winning number.
    const lastPendingForSubmission = [...state.history].reverse().find(
        item => item.status === 'pending' && item.winningNumber === null
    );

    if (!lastPendingForSubmission) {
        console.log("No pending calculation awaiting a winning number. Assuming accidental trigger of handleSubmitResult.");
        hidePatternAlert();
        // If there's no pending calculation, just update the display based on current inputs.
        updateCurrentRecommendationDisplay(); 
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

    // Apply winning number to the specific pending item identified
    evaluateCalculationStatus(lastPendingForSubmission, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);

    // Update confirmedWinsLog based on *all* confirmed spins
    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);

    // Re-label failures across the entire history based on the latest context
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); 

    // Run all analyses to update panels (board state, neighbour, weights etc)
    // This will *also* implicitly update the recommendation details for the just-resolved item in history
    analysis.runAllAnalyses(winningNumber); 
    renderHistory(); // Re-render history with updated item and win/loss counter

    dom.winningNumberInput.value = ''; // Clear the input field

    // Auto-populate for next calculation and trigger a new calculation for the NEXT spin
    const prevNum2 = parseInt(lastPendingForSubmission.num2, 10); 
    if (!isNaN(prevNum2)) {
        dom.number1.value = prevNum2;
        dom.number2.value = winningNumber;
        // Trigger a new calculation for the *next* spin, creating a new pending entry
        setTimeout(() => {
            handleNewCalculation(); // This will create a NEW pending item for the next spin
        }, 50);
    } else {
        console.warn('handleSubmitResult: previous num2 was not a valid number for auto-calculation.', prevNum2);
        // If auto-calculation isn't possible, just update the current display
        updateCurrentRecommendationDisplay();
    }
    hidePatternAlert(); 
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
    hidePatternAlert(); 
    // After clearing inputs, update the display to show "Please enter two valid numbers."
    updateCurrentRecommendationDisplay();
}

function handleSwap() { 
    const v = dom.number1.value; 
    dom.number1.value = dom.number2.value; 
    dom.number2.value = v; 
    // After swap, re-evaluate and display for current inputs (no new history item)
    updateCurrentRecommendationDisplay(); 
}

function handleHistoryAction(event) { 
    const button = event.target.closest('.delete-btn');
    if (!button) return;
    
    const newHistory = state.history.filter(item => item.id !== parseInt(button.dataset.id));
    state.setHistory(newHistory);
    
    const newLog = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); 
    
    analysis.runAllAnalyses(); 
    renderHistory();
    drawRouletteWheel();
    
    if (state.history.filter(item => item.status === 'success').length < config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        updateAiStatus(`AI Model: Need at least ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        aiWorker.postMessage({ type: 'clear_model' });
    }
    hidePatternAlert(); 
    // After history modification, re-evaluate and display for current inputs (no new history item)
    updateCurrentRecommendationDisplay(); 
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
    
    analysis.runAllAnalyses(); 
    renderHistory();
    
    dom.historicalAnalysisMessage.textContent = 'History cleared.';
    drawRouletteWheel(); 
    
    aiWorker.postMessage({ type: 'clear_model' });
    hidePatternAlert(); 
    // After history clear, re-evaluate and display for current inputs (no new history item)
    updateCurrentRecommendationDisplay(); 
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
    hidePatternAlert(); 
}

function startVideoAnalysis() {
    dom.analyzeVideoButton.disabled = true;
    dom.videoStatus.textContent = 'Analyzing... (Feature in development)';
    console.log("Video analysis initiated.");
    setTimeout(() => {
        dom.analyzeVideoButton.disabled = false;
        dom.videoStatus.textContent = 'Analysis complete (simulation).';
    }, 2000);
    hidePatternAlert(); 
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
    hidePatternAlert(); 
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

    updateAllTogglesUI();
    initializeAdvancedSettingsUI();
    analysis.updateActivePredictionTypes(); 
    analysis.handleStrategyChange(); // This will update all analysis panels
    hidePatternAlert(); 
    // Automatically trigger a display update for current inputs after applying a preset
    updateCurrentRecommendationDisplay(); 
}

// MODIFIED createSlider to use the new parameterDefinitions (no change needed from last time, just confirming it's there)
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
        analysis.handleStrategyChange(); // This will update all analysis panels
        // Automatically trigger a display update for current inputs after a parameter change
        updateCurrentRecommendationDisplay(); 
    };

    slider.addEventListener('input', (e) => updateValue(e.target.value)); 
    numberInput.addEventListener('change', (e) => updateValue(e.target.value)); 
}

// MODIFIED: initializeAdvancedSettingsUI to add all sliders (THIS WAS THE KEY CHANGE)
export function initializeAdvancedSettingsUI() {
    // Clear previous sliders
    dom.strategyLearningRatesSliders.innerHTML = '';
    dom.patternThresholdsSliders.innerHTML = '';
    dom.adaptiveInfluenceSliders.innerHTML = '';
    // NEW: Clear warnings parameter sliders container
    if (dom.warningParametersSliders) dom.warningParametersSliders.innerHTML = '';


    // Separate containers for logical grouping
    const strategyLearningRatesContainer = document.getElementById('strategyLearningRatesSliders');
    const patternThresholdsContainer = document.getElementById('patternThresholdsSliders');
    const adaptiveInfluenceContainer = document.getElementById('adaptiveInfluenceSliders');
    // NEW: Get warnings parameter sliders container
    const warningParametersContainer = document.getElementById('warningParametersSliders');


    // Headers for each sub-category
    strategyLearningRatesContainer.innerHTML = '<h3>Strategy Learning Rates</h3>';
    patternThresholdsContainer.innerHTML = '<h3>Pattern & Trigger Thresholds</h3>';
    adaptiveInfluenceContainer.innerHTML = '<h3>Adaptive Influence Learning</h3>';
    // NEW: Header for warnings parameter sliders
    if (warningParametersContainer) warningParametersContainer.innerHTML = '<h3>Table Change Warning Parameters</h3>';


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

    // NEW: Add sliders for Table Change Warning Parameters
    if (warningParametersContainer) { // Only create if container exists
        createSlider('warningParametersSliders', 'Warn Window Size', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WINDOW_SIZE');
        createSlider('warningParametersSliders', 'Min Plays for Eval', config.STRATEGY_CONFIG, 'WARNING_MIN_PLAYS_FOR_EVAL');
        createSlider('warningParametersSliders', 'Loss Streak Threshold', config.STRATEGY_CONFIG, 'WARNING_LOSS_STREAK_THRESHOLD');
        createSlider('warningParametersSliders', 'Rolling Win Rate Threshold', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WIN_RATE_THRESHOLD');
        createSlider('warningParametersSliders', 'Default Avg Win Rate', config.STRATEGY_CONFIG, 'DEFAULT_AVERAGE_WIN_RATE');
    }
}


function resetAllParameters() {
    Object.assign(config.STRATEGY_CONFIG, config.DEFAULT_PARAMETERS.STRATEGY_CONFIG);
    Object.assign(config.ADAPTIVE_LEARNING_RATES, config.DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES);
    state.setToggles(config.DEFAULT_PARAMETERS.TOGGLES);
    updateAllTogglesUI(); 
    initializeAdvancedSettingsUI(); 
    dom.parameterStatusMessage.textContent = 'Parameters reset to defaults.';
    analysis.handleStrategyChange(); // This will update all analysis panels
    hidePatternAlert(); 
    // Automatically trigger a display update for current inputs after resetting parameters
    updateCurrentRecommendationDisplay(); 
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
            analysis.handleStrategyChange(); // This will update all analysis panels
        } catch (error) {
            dom.parameterStatusMessage.textContent = `Error: ${error.message}`;
        }
    };
    reader.readAsText(file);
    event.target.value = '';
    hidePatternAlert(); 
    // Automatically trigger a display update for current inputs after loading parameters
    updateCurrentRecommendationDisplay(); 
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
            // NEW: Handle warning parameters category
            else if (parameterDefinitions[paramName].category === 'warningParameters') { 
                categoryToggleChecked = dom.optimizeCoreStrategyToggle.checked; // Link to core strategy optimization
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
    // Connect the new functions to the main UI buttons
    document.getElementById('calculateButton').addEventListener('click', handleNewCalculation);
    document.getElementById('submitResultButton').addEventListener('click', handleSubmitResult);

    document.getElementById('clearInputsButton').addEventListener('click', handleClearInputs);
    document.getElementById('swapButton').addEventListener('click', handleSwap);
    document.getElementById('clearHistoryButton').addEventListener('click', handleClearHistory);
    dom.historyList.addEventListener('click', handleHistoryAction);
    dom.recalculateAnalysisButton.addEventListener('click', () => {
        analysis.runAllAnalyses(); // Recalculate all underlying analyses
        updateCurrentRecommendationDisplay(); // Trigger a display update for current inputs
    }); 
    
    // Add Enter key listener for the main inputs
    [dom.number1, dom.number2].forEach(input => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNewCalculation();
    }));

    // Add Enter key listener for the winning number input
    dom.winningNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmitResult();
    });
    // Optimization buttons are handled by attachOptimizationButtonListeners
}

// NEW: Exported function to attach optimization button listeners
export function attachOptimizationButtonListeners() {
    if (dom.startOptimizationButton) {
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

            optimizationWorker.postMessage({ // This is the line that was causing ReferenceError before initialization
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
    }

    if (dom.stopOptimizationButton) {
        dom.stopOptimizationButton.addEventListener('click', () => {
            optimizationWorker.postMessage({ type: 'stop' });
        });
    }

    // Also need to ensure applyBestParamsButton is correctly attached here or elsewhere
    if (dom.applyBestParamsButton) {
        dom.applyBestParamsButton.addEventListener('click', () => {
            if (state.bestFoundParams) {
                const params = state.bestFoundParams.bestIndividual;
                const toggles = state.bestFoundParams.togglesUsed;

                Object.assign(config.STRATEGY_CONFIG, {
                    learningRate_success: params.learningRate_success, decayFactor: params.decayFactor,
                    learningRate_failure: params.learningRate_failure, maxWeight: params.maxWeight,
                    minWeight: params.minWeight, patternMinAttempts: params.patternMinAttempts,
                    patternSuccessThreshold: params.patternSuccessThreshold, triggerMinAttempts: params.triggerMinAttempts,
                    triggerSuccessThreshold: params.triggerSuccessThreshold,
                    hitRateThreshold: params.hitRateThreshold,
                    hitRateMultiplier: params.hitRateMultiplier,
                    maxStreakPoints: params.maxStreakPoints,
                    streakMultiplier: params.streakMultiplier,
                    proximityMaxDistance: params.proximityMaxDistance,
                    proximityMultiplier: params.proximityMultiplier,
                    maxNeighbourPoints: params.maxNeighbourPoints,
                    neighbourMultiplier: params.neighbourMultiplier,
                    aiConfidenceMultiplier: params.aiConfidenceMultiplier,
                    minAiPointsForReason: params.minAiPointsForReason,
                    ADAPTIVE_STRONG_PLAY_THRESHOLD: params.ADAPTIVE_STRONG_PLAY_THRESHOLD,
                    ADAPTIVE_PLAY_THRESHOLD: params.ADAPTIVE_PLAY_THRESHOLD,
                    LESS_STRICT_STRONG_PLAY_THRESHOLD: params.LESS_STRICT_STRONG_PLAY_THRESHOLD,
                    LESS_STRICT_PLAY_THRESHOLD: params.LESS_STRICT_PLAY_THRESHOLD,
                    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: params.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD,
                    LESS_STRICT_MIN_STREAK: params.LESS_STRICT_MIN_STREAK,
                    SIMPLE_PLAY_THRESHOLD: params.SIMPLE_PLAY_THRESHOLD,
                    MIN_TREND_HISTORY_FOR_CONFIRMATION: params.MIN_TREND_HISTORY_FOR_CONFIRMATION,
                    WARNING_ROLLING_WINDOW_SIZE: params.WARNING_ROLLING_WINDOW_SIZE,
                    WARNING_MIN_PLAYS_FOR_EVAL: params.WARNING_MIN_PLAYS_FOR_EVAL,
                    WARNING_LOSS_STREAK_THRESHOLD: params.WARNING_LOSS_STREAK_THRESHOLD,
                    WARNING_ROLLING_WIN_RATE_THRESHOLD: params.WARNING_ROLLING_WIN_RATE_THRESHOLD,
                    DEFAULT_AVERAGE_WIN_RATE: params.DEFAULT_AVERAGE_WIN_RATE,
                    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: params.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER,
                    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: params.HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER,
                    WARNING_FACTOR_SHIFT_WINDOW_SIZE: params.WARNING_FACTOR_SHIFT_WINDOW_SIZE,
                    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: params.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD,
                    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: params.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT
                });
                Object.assign(config.ADAPTIVE_LEARNING_RATES, {
                    SUCCESS: params.adaptiveSuccessRate, FAILURE: params.adaptiveFailureRate,
                    MIN_INFLUENCE: params.minAdaptiveInfluence, MAX_INFLUENCE: params.maxAdaptiveInfluence,
                    FORGET_FACTOR: params.FORGET_FACTOR,
                    CONFIDENCE_WEIGHTING_MULTIPLIER: params.CONFIDENCE_WEIGHTING_MULTIPLIER,
                    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: params.CONFIDENCE_WEIGHTING_MIN_THRESHOLD
                });

                if (toggles) {
                    state.setToggles(toggles);
                    updateAllTogglesUI();
                }
                
                initializeAdvancedSettingsUI();
                updateOptimizationStatus('Best parameters applied!');
                analysis.handleStrategyChange(); // This will update all analysis panels
                hidePatternAlert();
                // Automatically trigger a display update for current inputs after applying best parameters
                updateCurrentRecommendationDisplay(); 
            }
        });
    }
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
                renderHistory(); // Only rerender history if this specific toggle is changed
            } else {
                // For most toggles, a strategy change means re-simulating and re-analyzing
                analysis.handleStrategyChange(); // This will update all analysis panels
                // Redraw roulette wheel with current inputs and last winning
                const num1Val = parseInt(dom.number1.value, 10);
                const num2Val = parseInt(document.getElementById('number2').value, 10);
                const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
                drawRouletteWheel(!isNaN(num1Val) && !isNaN(num2Val) ? Math.abs(num2Val-num1Val) : null, lastWinning);
            }
            hidePatternAlert(); 
            // Automatically trigger a display update for current inputs after toggling a strategy
            updateCurrentRecommendationDisplay(); 
        });
    }
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
    dom.analyzeHistoricalDataButton.addEventListener('click', analysis.handleHistoricalAnalysis); 

    // Video Analysis
    if (dom.videoUpload) dom.videoUpload.addEventListener('change', handleVideoUpload);
    if (dom.analyzeVideoButton) dom.analyzeVideoButton.addEventListener('click', startVideoAnalysis);
    if (dom.clearVideoButton) dom.clearVideoButton.addEventListener('click', clearVideoState);

    // Category Toggle Listeners for sliders are already in initializeAdvancedSettingsUI
    dom.optimizeCoreStrategyToggle.addEventListener('change', () => toggleParameterSliders(true)); 
    dom.optimizeAdaptiveRatesToggle.addEventListener('change', () => toggleParameterSliders(true)); 
}

function attachGuideAndInfoListeners() {
    // Guide toggles
    document.getElementById('presetStrategyGuideHeader').addEventListener('click', () => toggleGuide('presetStrategyGuideContent'));
    document.getElementById('baseStrategyGuideHeader').addEventListener('click', () => toggleGuide('baseStrategyGuideContent'));
    document.getElementById('advancedStrategyGuideHeader').addEventListener('click', () => toggleGuide('advancedStrategyGuideContent'));
    document.getElementById('advancedSettingsHeader').addEventListener('click', () => toggleGuide('advancedSettingsContent'));


    // History Info Dropdown
    if(dom.historyInfoToggle) {
        dom.historyInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.historyInfoDropdown.classList.toggle('hidden'); // Toggle visibility
        });
        // Close dropdown if clicked outside
        document.addEventListener('click', (e) => {
            if (!dom.historyInfoToggle.contains(e.target) && !dom.historyInfoDropdown.contains(e.target)) {
                dom.historyInfoDropdown.classList.add('hidden');
            }
        });
    }
}
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
        'loadParametersLabel', 'parameterStatusMessage', 'submitResultButton', 'patternAlert',
        'warningParametersSliders',
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle'
    ];
    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
    
    attachMainActionListeners();
    attachToggleListeners();
    attachAdvancedSettingsListeners();
    attachGuideAndInfoListeners();
    
    // Optimization button listeners will be attached by main.js after workers are initialized
    // via ui.attachOptimizationButtonListeners();
}
