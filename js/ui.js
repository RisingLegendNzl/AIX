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

/**
 * NEW: Renders the analysis from the Trend Worker into its dedicated UI panel.
 * @param {object | null} analysis - The report object from the trend worker.
 */
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
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.finalScore > 0) {
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

// ... other rendering functions like renderAnalysisList, renderBoardState, etc. remain the same ...

// --- UI INITIALIZATION ---
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
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle',
        // NEW: Add the ID for the new trend analysis display panel
        'trendAnalysisDisplay'
    ];
    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
    
    // The rest of the initializeUI function and the file remains unchanged...
}

// ... all other functions from the original ui.js file follow here ...
