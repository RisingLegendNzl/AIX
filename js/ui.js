// js/ui.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker, optimizationWorker } from './workers.js'; 
import * as analysis from './analysis.js'; 

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
    MAX_INFLUENCE: { min: 1.0, max: 5.0, step: 0.1, category: 'adaptiveRates' },
    WARNING_ROLLING_WINDOW_SIZE: { min: 5, max: 50, step: 1, category: 'warningParameters' },
    WARNING_MIN_PLAYS_FOR_EVAL: { min: 1, max: 20, step: 1, category: 'warningParameters' },
    WARNING_LOSS_STREAK_THRESHOLD: { min: 1, max: 10, step: 1, category: 'warningParameters' },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { min: 0, max: 100, step: 1, category: 'warningParameters' },
    DEFAULT_AVERAGE_WIN_RATE: { min: 0, max: 100, step: 1, category: 'warningParameters' }
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
    MAX_INFLUENCE: { obj: config.ADAPTIVE_LEARNING_RATES, label: 'Max Adaptive Influence', container: 'adaptiveInfluenceSliders' },
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

// --- UI RENDERING & MANIPULATION ---

export function renderSystemMode(mode) {
    if (!dom.systemStatusDisplay) return;

    let modeColor = 'bg-gray-100 text-gray-800';
    let modeText = 'Standard';
    let modeDescription = 'Monitoring conditions and using baseline strategy.';

    switch (mode) {
        case 'aggressive':
            modeColor = 'bg-green-100 text-green-800';
            modeText = 'Aggressive';
            modeDescription = 'Favorable conditions detected. Strategy is optimized to press the advantage.';
            break;
        case 'defensive':
            modeColor = 'bg-red-100 text-red-800';
            modeText = 'Defensive';
            modeDescription = 'Unstable conditions detected. Strategy is highly selective to minimize risk.';
            break;
    }

    const html = `
        <div class="p-4 rounded-lg text-center ${modeColor}">
            <p class="text-sm font-medium">System Mode</p>
            <p class="text-xl font-bold">${modeText}</p>
            <p class="text-xs">${modeDescription}</p>
        </div>
    `;
    dom.systemStatusDisplay.innerHTML = html;
}

export function renderTrendAnalysis(analysis) {
    if (!dom.trendAnalysisDisplay) return;

    if (!analysis || !analysis.dominantGroup) {
        dom.trendAnalysisDisplay.innerHTML = `<p class="text-center text-gray-500 py-4">Not enough data to identify a dominant trend.</p>`;
        return;
    }
    
    const dominantType = config.allPredictionTypes.find(t => t.id === analysis.dominantGroup);
    if (!dominantType) return;
    
    const confidenceColor = analysis.confidence === 'high' ? 'text-green-600' : 'text-yellow-600';
    
    let html = `
        <div class="text-center bg-indigo-50 p-4 rounded-lg border border-indigo-200">
            <p class="text-sm font-medium text-indigo-700">Worker's Top Rated Trend</p>
            <p class="text-2xl font-bold" style="color: ${dominantType.textColor};">${dominantType.displayLabel}</p>
            <p class="text-sm font-semibold ${confidenceColor}">${analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)} Confidence</p>
            <p class="text-xs text-gray-600 mt-1">${analysis.reason}</p>
        </div>
        <div class="mt-4 space-y-2">
            <h4 class="font-semibold text-sm text-gray-600">Performance Snapshot:</h4>
            ${Object.keys(analysis.longTerm).map(typeId => {
                const type = config.allPredictionTypes.find(t => t.id === typeId);
                const longTerm = analysis.longTerm[typeId];
                const shortTerm = analysis.shortTerm[typeId];
                if (!type) return '';
                return `
                    <div class="grid grid-cols-3 gap-2 text-xs items-center">
                        <strong style="color: ${type.textColor};">${type.displayLabel}</strong>
                        <div class="text-right">
                            <span class="font-medium">${shortTerm.winRate.toFixed(1)}%</span>
                            <span class="text-gray-500"> (last ${shortTerm.plays})</span>
                        </div>
                        <div class="text-right">
                            <span class="font-medium">${longTerm.winRate.toFixed(1)}%</span>
                            <span class="text-gray-500"> (all ${longTerm.plays})</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    dom.trendAnalysisDisplay.innerHTML = html;
}

export function updateAllTogglesUI() {
    if (dom.trendConfirmationToggle) dom.trendConfirmationToggle.checked = state.useTrendConfirmation;
    if (dom.weightedZoneToggle) dom.weightedZoneToggle.checked = state.useWeightedZone;
    if (dom.proximityBoostToggle) dom.proximityBoostToggle.checked = state.useProximityBoost;
    if (dom.pocketDistanceToggle) dom.pocketDistanceToggle.checked = state.usePocketDistance;
    if (dom.lowestPocketDistanceToggle) dom.lowestPocketDistanceToggle.checked = state.useLowestPocketDistance;
    if (dom.advancedCalculationsToggle) dom.advancedCalculationsToggle.checked = state.useAdvancedCalculations;
    if (dom.dynamicStrategyToggle) dom.dynamicStrategyToggle.checked = state.useDynamicStrategy;
    if (dom.adaptivePlayToggle) dom.adaptivePlayToggle.checked = state.useAdaptivePlay;
    if (dom.tableChangeWarningsToggle) dom.tableChangeWarningsToggle.checked = state.useTableChangeWarnings;
    if (dom.dueForHitToggle) dom.dueForHitToggle.checked = state.useDueForHit;
    if (dom.neighbourFocusToggle) dom.neighbourFocusToggle.checked = state.useNeighbourFocus;
    if (dom.lessStrictModeToggle) dom.lessStrictModeToggle.checked = state.useLessStrict;
    if (dom.dynamicTerminalNeighbourCountToggle) dom.dynamicTerminalNeighbourCountToggle.checked = state.useDynamicTerminalNeighbourCount;
}

export function updateWinLossCounter() {
    let wins = 0;
    let losses = 0;

    state.history.forEach(item => {
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.finalScore > 0) {
            if (item.hitTypes && item.hitTypes.includes(item.recommendedGroupId)) {
                wins++;
            } else {
                losses++;
            }
        }
    });

    if (dom.winCount) dom.winCount.textContent = wins;
    if (dom.lossCount) dom.lossCount.textContent = losses;
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
                if (details.signal === 'Avoid Play') {
                    resultText = ' - AVOID';
                } else if (details.finalScore > 0) {
                    resultText = recommendedHit ? ' - HIT' : ' - MISS';
                } else {
                    resultText = ' - WAIT';
                }
            }

            stateBadgeContent = `Top: ${recommendedLabel} (${hitRate.toFixed(1)}%) ${resultText}`;
            
            if (item.status !== 'pending' && details.signal === 'Avoid Play') {
                stateBadgeClass = 'bg-red-700';
            } else if (item.status !== 'pending' && details.finalScore <= 0) {
                 stateBadgeClass = 'bg-gray-500';
            } else if (recommendedHit) {
                stateBadgeClass = recommendedType?.colorClass || 'bg-green-500';
            } else {
                stateBadgeClass = 'bg-red-500';
            }

        } else {
            stateBadgeContent = 'No Recommendation';
            stateBadgeClass = 'bg-gray-500';
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
    if(!dom.analysisList) return;
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
    if(!dom.boardStateAnalysis) return;
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

function showPatternAlert(message) {
    if (dom.patternAlert) {
        dom.patternAlert.innerHTML = `<strong>Warning:</strong> ${message}`;
        dom.patternAlert.classList.remove('hidden');
    }
}

function hidePatternAlert() {
    if (dom.patternAlert) {
        dom.patternAlert.classList.add('hidden');
        dom.patternAlert.textContent = '';
    }
}


function handleNewCalculation() {
    if (!dom.number1 || !dom.number2 || !dom.resultDisplay) return;

    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        dom.resultDisplay.innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers.</p>`;
        dom.resultDisplay.classList.remove('hidden');
        hidePatternAlert();
        return;
    }
    
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
        recommendationDetails: null,
        failureMode: 'pending'
    };
    state.history.push(newHistoryItem);

    analysis.runAllAnalyses();
}


function handleSubmitResult() {
    if (!dom.winningNumberInput || !dom.number1 || !dom.number2) return;

    const lastPendingForSubmission = [...state.history].reverse().find(
        item => item.status === 'pending' && item.winningNumber === null
    );

    if (!lastPendingForSubmission) {
        if (state.history.length > 0) {
            console.log("No pending calculation awaiting a winning number.");
            hidePatternAlert();
            return;
        } else {
            alert("Please perform a calculation first before submitting a winning number.");
            return;
        }
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

    evaluateCalculationStatus(lastPendingForSubmission, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);

    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);

    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); 

    analysis.runAllAnalyses(winningNumber);
    renderHistory();
    
    analysis.triggerTrendAnalysis();

    dom.winningNumberInput.value = '';

    const prevNum2 = parseInt(lastPendingForSubmission.num2, 10);
    if (!isNaN(prevNum2)) {
        dom.number1.value = prevNum2;
        dom.number2.value = winningNumber;
        setTimeout(() => {
            if(dom.calculateButton) dom.calculateButton.click();
        }, 50);
    }
    hidePatternAlert();
}


function handleClearInputs() { 
    if (dom.number1) dom.number1.value = '';
    if (dom.number2) dom.number2.value = '';
    if (dom.winningNumberInput) dom.winningNumberInput.value = '';
    if (dom.resultDisplay) dom.resultDisplay.classList.add('hidden');
    if (dom.number1) dom.number1.focus();
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
    drawRouletteWheel(null, lastWinning);
    if (dom.resultDisplay && dom.resultDisplay.textContent.includes('valid numbers')) {
        dom.resultDisplay.textContent = '';
    }
    hidePatternAlert();
}

function handleSwap() { 
    const v = dom.number1.value; 
    dom.number1.value = dom.number2.value; 
    dom.number2.value = v; 
    handleNewCalculation();
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

    analysis.triggerTrendAnalysis();
    
    if (state.history.filter(item => item.status === 'success').length < config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        updateAiStatus(`AI Model: Need at least ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        if (aiWorker) aiWorker.postMessage({ type: 'clear_model' });
    }
    hidePatternAlert();
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
    
    analysis.triggerTrendAnalysis();

    if(dom.historicalAnalysisMessage) dom.historicalAnalysisMessage.textContent = 'History cleared.';
    drawRouletteWheel(); 
    
    if (aiWorker) aiWorker.postMessage({ type: 'clear_model' });
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
    analysis.handleStrategyChange();
    hidePatternAlert();
}

function createSlider(containerId, label, paramObj, paramName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
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
        if (dom.parameterStatusMessage) dom.parameterStatusMessage.textContent = 'Parameter changed. Re-analyzing...';
        analysis.handleStrategyChange();
    };

    slider.addEventListener('input', (e) => updateValue(e.target.value)); 
    numberInput.addEventListener('change', (e) => updateValue(e.target.value)); 
}

export function initializeAdvancedSettingsUI() {
    const slidersContainer = dom.advancedSettingsContent;
    if (!slidersContainer) return;

    slidersContainer.innerHTML = `
        <div class="space-y-6">
            <div class="space-y-3">
                <h3 class="text-lg font-semibold text-gray-700">Optimization Categories</h3>
                <p class="text-sm text-gray-600 mb-4">Toggle which parameter categories the optimizer should consider.</p>
                <div class="divide-y divide-gray-200">
                    <label class="toggle-label"><span class="font-medium text-gray-700">Core Strategy Parameters</span><input type="checkbox" id="optimizeCoreStrategyToggle" class="toggle-checkbox" checked><div class="toggle-switch"><div class="toggle-knob"></div></div></label>
                    <label class="toggle-label"><span class="font-medium text-gray-700">Adaptive Influence Rates</span><input type="checkbox" id="optimizeAdaptiveRatesToggle" class="toggle-checkbox" checked><div class="toggle-switch"><div class="toggle-knob"></div></div></label>
                </div>
            </div>
            <div class="space-y-3">
                <h3 class="text-lg font-semibold text-gray-700">Strategy Learning Rates</h3>
                <div class="space-y-3" id="strategyLearningRatesSliders"></div>
            </div>
            <div class="space-y-3">
                <h3 class="lg font-semibold text-gray-700">Pattern & Trigger Thresholds</h3>
                <div class="space-y-3" id="patternThresholdsSliders"></div>
            </div>
            <div class="space-y-3">
                <h3 class="text-lg font-semibold text-gray-700">Adaptive Influence Learning</h3>
                <div class="space-y-3" id="adaptiveInfluenceSliders"></div>
            </div>
            <div class="space-y-3">
                <h3 class="text-lg font-semibold text-gray-700">Table Change Warning Parameters</h3>
                <div class="space-y-3" id="warningParametersSliders"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <button id="resetParametersButton" class="btn btn-secondary">Reset to Defaults</button>
                <button id="saveParametersButton" class="btn btn-secondary">Save Parameters to File</button>
                <input type="file" id="loadParametersInput" class="hidden" accept=".json">
                <label for="loadParametersInput" id="loadParametersLabel" class="w-full text-center btn btn-secondary cursor-pointer">Load Parameters from File</label>
            </div>
            <p id="parameterStatusMessage" class="text-sm text-center text-gray-600 mt-2 h-4"></p>
        </div>
    `;

    for (const paramName in parameterMap) {
        const { obj, label, container } = parameterMap[paramName];
        createSlider(container, label, obj, paramName);
    }
}


export function toggleParameterSliders(enable) {
    if (!dom.advancedSettingsContent) return;

    dom.setHighestWinRatePreset.disabled = !enable;
    dom.setBalancedSafePreset.disabled = !enable;
    dom.setAggressiveSignalsPreset.disabled = !enable;
    dom.resetParametersButton.disabled = !enable;
    dom.saveParametersButton.disabled = !enable;
    dom.loadParametersLabel.classList.toggle('btn-disabled', !enable);
    dom.loadParametersInput.disabled = !enable;
    
    for (const paramName in parameterMap) {
        const sliderElement = document.getElementById(`${paramName}Slider`);
        const numberInput = document.getElementById(`${paramName}SliderInput`);
        if(sliderElement && numberInput) {
            sliderElement.disabled = !enable;
            numberInput.disabled = !enable;
        }
    }
}

function attachMainActionListeners() {
    if (dom.calculateButton) dom.calculateButton.addEventListener('click', handleNewCalculation);
    if (dom.submitResultButton) dom.submitResultButton.addEventListener('click', handleSubmitResult);
    if (dom.clearInputsButton) dom.clearInputsButton.addEventListener('click', handleClearInputs);
    if (dom.swapButton) dom.swapButton.addEventListener('click', handleSwap);
    if (dom.clearHistoryButton) dom.clearHistoryButton.addEventListener('click', handleClearHistory);
    if (dom.historyList) dom.historyList.addEventListener('click', handleHistoryAction);
    if (dom.recalculateAnalysisButton) dom.recalculateAnalysisButton.addEventListener('click', () => analysis.runAllAnalyses());
    
    if (dom.number1) dom.number1.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleNewCalculation(); });
    if (dom.number2) dom.number2.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleNewCalculation(); });
    if (dom.winningNumberInput) dom.winningNumberInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmitResult(); });
}

export function attachOptimizationButtonListeners() {
    if (dom.startOptimizationButton) {
        dom.startOptimizationButton.addEventListener('click', () => {
            if (state.history.length < 20) {
                updateOptimizationStatus('Error: Need at least 20 history items.');
                return;
            }
            updateOptimizationStatus('Starting optimization...');
            if (dom.optimizationResult) dom.optimizationResult.classList.add('hidden');
            toggleParameterSliders(false); 
            dom.startOptimizationButton.disabled = true;
            if(dom.stopOptimizationButton) dom.stopOptimizationButton.disabled = false;
            
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
                    toggles: togglesForWorker
                }
            });
        });
    }

    if (dom.stopOptimizationButton) {
        dom.stopOptimizationButton.addEventListener('click', () => {
            if (optimizationWorker) optimizationWorker.postMessage({ type: 'stop' });
        });
    }

    if (dom.applyBestParamsButton) {
        dom.applyBestParamsButton.addEventListener('click', () => {
            if (state.bestFoundParams) {
                const params = state.bestFoundParams.bestIndividual;
                const toggles = state.bestFoundParams.togglesUsed;

                Object.assign(config.STRATEGY_CONFIG, params);
                Object.assign(config.ADAPTIVE_LEARNING_RATES, {
                    ...config.ADAPTIVE_LEARNING_RATES,
                    SUCCESS: params.adaptiveSuccessRate,
                    FAILURE: params.adaptiveFailureRate,
                    MIN_INFLUENCE: params.minAdaptiveInfluence,
                    MAX_INFLUENCE: params.maxAdaptiveInfluence,
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
                analysis.handleStrategyChange();
                hidePatternAlert();
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
        if(dom[toggleId]) {
            dom[toggleId].addEventListener('change', () => {
                const newToggleStates = { ...state };
                newToggleStates[stateKey] = dom[toggleId].checked;
                state.setToggles(newToggleStates);

                if (stateKey === 'usePocketDistance') {
                    renderHistory();
                } else {
                    analysis.handleStrategyChange(); 
                }
                hidePatternAlert();
            });
        }
    }
}

function attachAdvancedSettingsListeners() {
    if (dom.setHighestWinRatePreset) dom.setHighestWinRatePreset.addEventListener('click', () => handlePresetSelection('highestWinRate'));
    if (dom.setBalancedSafePreset) dom.setBalancedSafePreset.addEventListener('click', () => handlePresetSelection('balancedSafe'));
    if (dom.setAggressiveSignalsPreset) dom.setAggressiveSignalsPreset.addEventListener('click', () => handlePresetSelection('aggressiveSignals'));

    if (dom.advancedSettingsContent) {
        dom.advancedSettingsContent.addEventListener('click', (e) => {
            if (e.target.id === 'resetParametersButton') resetAllParameters();
            if (e.target.id === 'saveParametersButton') saveParametersToFile();
        });
    }
    
    if (dom.loadParametersInput) dom.loadParametersInput.addEventListener('change', (e) => loadParametersFromFile(e));
    if (dom.analyzeHistoricalDataButton) dom.analyzeHistoricalDataButton.addEventListener('click', analysis.handleHistoricalAnalysis); 
    if (dom.optimizeCoreStrategyToggle) dom.optimizeCoreStrategyToggle.addEventListener('change', () => toggleParameterSliders(true)); 
    if (dom.optimizeAdaptiveRatesToggle) dom.optimizeAdaptiveRatesToggle.addEventListener('change', () => toggleParameterSliders(true)); 
}

function attachGuideAndInfoListeners() {
    const guides = {
        presetStrategyGuideHeader: 'presetStrategyGuideContent',
        baseStrategyGuideHeader: 'baseStrategyGuideContent',
        advancedStrategyGuideHeader: 'advancedStrategyGuideContent',
        advancedSettingsHeader: 'advancedSettingsContent'
    };
    for(const headerId in guides) {
        if (document.getElementById(headerId)) {
            document.getElementById(headerId).addEventListener('click', () => toggleGuide(guides[headerId]));
        }
    }

    if(dom.historyInfoToggle) {
        dom.historyInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if(dom.historyInfoDropdown) dom.historyInfoDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => {
             if (dom.historyInfoDropdown) dom.historyInfoDropdown.classList.add('hidden');
        });
    }
}

export function initializeUI() {
    const elementIds = [
        'number1', 'number2', 'resultDisplay', 'historyList', 'analysisList', 'boardStateAnalysis',
        'boardStateConclusion', 'historicalNumbersInput', 'analyzeHistoricalDataButton', 
        'historicalAnalysisMessage', 'aiModelStatus', 'recalculateAnalysisButton',
        'trendConfirmationToggle', 'weightedZoneToggle', 'proximityBoostToggle', 'pocketDistanceToggle',
        'lowestPocketDistanceToggle', 'advancedCalculationsToggle', 'dynamicStrategyToggle',
        'adaptivePlayToggle', 'tableChangeWarningsToggle', 'dueForHitToggle', 'neighbourFocusToggle',
        'lessStrictModeToggle', 'dynamicTerminalNeighbourCountToggle', 'rouletteWheelContainer', 
        'rouletteLegend', 'strategyWeightsDisplay', 'winningNumberInput', 'winCount', 'lossCount', 
        'optimizationStatus', 'optimizationResult', 'bestFitnessResult', 'bestParamsResult', 
        'applyBestParamsButton', 'startOptimizationButton', 'stopOptimizationButton', 'advancedSettingsHeader',
        'advancedSettingsContent', 'loadParametersInput', 'submitResultButton', 'patternAlert',
        'setHighestWinRatePreset', 'setBalancedSafePreset', 'setAggressiveSignalsPreset', 
        'advancedStrategyGuideHeader', 'advancedStrategyGuideContent', 'systemStatusDisplay', 'trendAnalysisDisplay',
        'clearInputsButton', 'swapButton', 'clearHistoryButton', 'recalculateAnalysisButton', 'loadParametersLabel',
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle'
    ];
    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
    
    attachMainActionListeners();
    attachToggleListeners();
    attachAdvancedSettingsListeners();
    attachGuideAndInfoListeners();
    initializeAdvancedSettingsUI();
}
