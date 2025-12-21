// js/ui.cards.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as analysis from './analysis.js';
import { dom, getRouletteNumberColor, parameterDefinitions, parameterMap, showPatternAlert, hidePatternAlert } from './ui.helpers.js';

// --- UI RENDERING & MANIPULATION ---

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
    // Roulette wheel visualizer removed
    return;
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
            const aiExplanation = item.recommendationDetails.aiExplanation;
            
            let aiContentHtml = '';
            if (aiExplanation && state.isAiReady) {
                const confidenceBadge = aiExplanation.confidence === 'high' 
                    ? '<span class="text-green-600 font-semibold">High Confidence</span>'
                    : aiExplanation.confidence === 'medium'
                    ? '<span class="text-blue-600 font-semibold">Medium Confidence</span>'
                    : '<span class="text-gray-600 font-semibold">Low Confidence</span>';
                
                aiContentHtml = `
                    <p class="text-sm font-semibold text-gray-700 mb-1">${aiExplanation.headline}</p>
                    <p class="text-xs text-gray-500 mb-2">Based on last ${aiExplanation.windowSize} spins | ${confidenceBadge}</p>
                    <ul class="text-xs text-gray-600 list-disc list-inside space-y-1">
                        ${aiExplanation.bullets.map(bullet => `<li>${bullet}</li>`).join('')}
                    </ul>
                `;
            } else if (state.isAiReady) {
                aiContentHtml = `
                    <p class="text-sm text-gray-600">AI prediction: ${((item.recommendationDetails.mlProbability || 0) * 100).toFixed(1)}% confidence</p>
                    <p class="text-xs text-gray-500">Pattern analysis available after next calculation</p>
                `;
            } else {
                aiContentHtml = `<p class="text-sm text-gray-500">AI training in progress...</p>`;
            }
            
            aiDetailsHtml = `
                <div class="ai-details-toggle" data-target="ai-details-${item.id}">Show AI Insights</div>
                <div id="ai-details-${item.id}" class="ai-details-section">
                    ${aiContentHtml}
                    <div class="mt-2 pt-2 border-t border-gray-200">
                        <p class="text-xs text-gray-600"><strong>Primary Factor:</strong> ${item.recommendationDetails.primaryDrivingFactor || 'N/A'}</p>
                        <p class="text-xs text-gray-600"><strong>Final Score:</strong> ${item.recommendationDetails.finalScore.toFixed(2)}</p>
                    </div>
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
                <button class="delete-btn" data-id="${item.id}" aria-label="Delete item"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m-1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
                toggle.textContent = targetElement.classList.contains('open') ? 'Hide AI Insights' : 'Show AI Insights';
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
    // Roulette legend removed
    return;
}

// --- Worker UI Update Functions ---
export function updateOptimizationStatus(htmlContent) {
    if (dom.optimizationStatus) dom.optimizationStatus.innerHTML = htmlContent;
}

/**
 * Calculate human-readable confidence level from fitness score
 */
function calculateOptimizerConfidence(fitness) {
    // fitness is geometric mean of win/loss ratios, typically ranges from ~0.01 to ~5.0
    // Higher is better
    if (fitness >= 1.5) {
        return { level: 'High', description: 'Strong configuration found' };
    } else if (fitness >= 1.0) {
        return { level: 'Medium', description: 'Moderate improvement detected' };
    } else if (fitness >= 0.5) {
        return { level: 'Low', description: 'Weak signals, mixed results' };
    } else {
        return { level: 'Very Low', description: 'No clear winner found' };
    }
}

/**
 * Calculate performance percentile (comparing to baseline of 1.0)
 */
function calculatePerformancePercentile(fitness) {
    // Baseline fitness is 1.0 (break-even)
    // Calculate how much better this is than baseline
    const improvement = ((fitness - 1.0) / 1.0) * 100;
    
    if (improvement >= 50) {
        return { percentile: 95, description: 'Top 5%' };
    } else if (improvement >= 25) {
        return { percentile: 80, description: 'Top 20%' };
    } else if (improvement >= 10) {
        return { percentile: 65, description: 'Above average' };
    } else if (improvement >= 0) {
        return { percentile: 50, description: 'Average' };
    } else {
        return { percentile: 30, description: 'Below average' };
    }
}

export function showOptimizationComplete(payload) {
    const fitness = parseFloat(payload.bestFitness);
    const confidence = calculateOptimizerConfidence(fitness);
    const performance = calculatePerformancePercentile(fitness);
    
    if (dom.optimizationStatus) {
        const statusHtml = `
            <div class="text-green-600 font-semibold">Optimization Complete</div>
            <div class="text-sm text-gray-600 mt-1">
                Confidence: <strong>${confidence.level}</strong> - ${confidence.description}
            </div>
            <div class="text-sm text-gray-600">
                Performance: <strong>${performance.description}</strong> (${performance.percentile}th percentile)
            </div>
        `;
        dom.optimizationStatus.innerHTML = statusHtml;
    }
    
    if (dom.optimizationResult) dom.optimizationResult.classList.remove('hidden');
    if (dom.bestFitnessResult) {
        // Show human-readable output instead of raw fitness
        dom.bestFitnessResult.innerHTML = `
            <span class="text-lg font-bold">${confidence.level}</span>
            <span class="text-sm text-gray-600 ml-2">(${performance.description})</span>
        `;
    }
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

export function updateOptimizerDebugPanel(debugMetrics) {
    if (!dom.optimizerDebugData || !debugMetrics) return;
    
    const { perGroupStats, totalSimulations, currentSeed } = debugMetrics;
    
    let html = '';
    html += `<div class="debug-stat-row"><span class="debug-stat-label">Total Simulations:</span><span class="debug-stat-value">${totalSimulations || 0}</span></div>`;
    html += `<div class="debug-stat-row"><span class="debug-stat-label">Deterministic Seed:</span><span class="debug-stat-value">${currentSeed || 'N/A'}</span></div>`;
    html += '<div class="mt-3 mb-2 text-xs font-semibold text-gray-600">Per-Group Stats:</div>';
    
    if (perGroupStats && Object.keys(perGroupStats).length > 0) {
        for (const groupId in perGroupStats) {
            const stats = perGroupStats[groupId];
            const type = config.allPredictionTypes.find(t => t.id === groupId);
            if (!type) continue;
            
            const winRate = stats.plays > 0 ? ((stats.wins / stats.plays) * 100).toFixed(1) : '0.0';
            const groupLabel = type.displayLabel || groupId;
            
            html += `<div class="debug-stat-row" style="border-left: 3px solid ${type.textColor || '#666'}">`;
            html += `<span class="debug-stat-label">${groupLabel}:</span>`;
            html += `<span class="debug-stat-value">${stats.wins} wins / ${stats.losses} losses (${winRate}%)</span>`;
            html += `</div>`;
        }
    } else {
        html += '<div class="text-gray-400 text-center py-2 text-sm">No group stats yet</div>';
    }
    
    dom.optimizerDebugData.innerHTML = html;
}

export function updateAiStatus(message) {
    if (dom.aiModelStatus) dom.aiModelStatus.textContent = message;
}

/**
 * Retrieves all necessary data and calculates a recommendation object.
 */
export async function getRecommendationDataForDisplay(num1Val, num2Val) {
    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const rollingPerformance = analysis.calculateRollingPerformance(state.history, config.STRATEGY_CONFIG);
    const factorShiftStatus = analysis.analyzeFactorShift(state.history, config.STRATEGY_CONFIG);
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

    updateAiStatus('AI Model: Getting prediction...');
    const aiPredictionData = await analysis.getAiPrediction(state.history);
    updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);

    const recommendation = getRecommendation({
        trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
        isForWeightUpdate: false,
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
        allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel,
        historicalMaximums: state.historicalMaximums
    });
    return recommendation;
}


/**
 * Updates the main recommendation display and calculation groups UI.
 */
export async function updateMainRecommendationDisplay() {
    console.log("updateMainRecommendationDisplay: Function started.");
    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;


    if (isNaN(num1Val) || isNaN(num2Val)) {
        console.log("updateMainRecommendationDisplay: Invalid inputs detected. Showing placeholder message.");
        dom.resultDisplay.innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers to see a recommendation.</p>`;
        dom.resultDisplay.classList.remove('hidden');
        hidePatternAlert();
        return;
    }

    const recommendation = await getRecommendationDataForDisplay(num1Val, num2Val);
    console.log("updateMainRecommendationDisplay: Got recommendation data.");

    // Build detailed recommendation section
    let recommendationHtml = '<h3 class="text-lg font-bold text-gray-800 mb-2">Recommendation</h3>';
    
    if (recommendation.detailedExplanation) {
        const exp = recommendation.detailedExplanation;
        const confidenceBadgeColor = exp.confidence === 'high' ? 'bg-green-100 text-green-800' 
            : exp.confidence === 'medium' ? 'bg-blue-100 text-blue-800'
            : 'bg-gray-100 text-gray-800';
        
        recommendationHtml += `
            <div class="bg-white border-2 border-gray-200 rounded-lg p-4 mb-4">
                <div class="mb-3">
                    <h4 class="text-base font-bold text-gray-900 mb-1">${exp.headline}</h4>
                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-gray-600">Based on last ${exp.windowSize} spins</span>
                        <span class="px-2 py-0.5 rounded-full ${confidenceBadgeColor} font-semibold uppercase">${exp.confidence} confidence</span>
                    </div>
                </div>
                
                <div class="space-y-1.5 mb-3">
                    ${exp.bullets.map(bullet => `
                        <div class="flex items-start gap-2">
                            <span class="text-indigo-500 mt-0.5">-</span>
                            <span class="text-sm text-gray-700">${bullet}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="pt-3 border-t border-gray-200 grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span class="text-gray-500">Primary Factor:</span>
                        <span class="font-semibold text-gray-800 ml-1">${exp.primaryFactor}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Final Score:</span>
                        <span class="font-semibold text-gray-800 ml-1">${exp.finalScore}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Runner-up:</span>
                        <span class="font-semibold text-gray-800 ml-1">${exp.runnerUpGroup} (${exp.scoreGap}% gap)</span>
                    </div>
                    ${exp.recentPerformance ? `
                        <div>
                            <span class="text-gray-500">Recent:</span>
                            <span class="font-semibold text-gray-800 ml-1">${exp.recentPerformance.hits}/${exp.recentPerformance.total} (${exp.recentPerformance.hitRate}%)</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    } else {
        // Fallback to basic recommendation HTML
        recommendationHtml += `
            <div class="result-display p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4 text-center">
                ${recommendation.html}
            </div>
        `;
    }

    let fullResultHtml = recommendationHtml + `
        <h3 class="text-lg font-bold text-gray-800 mb-2">Calculation Groups</h3>
        <div class="space-y-2">
    `;

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);

    state.activePredictionTypes.forEach(type => {
        const predictionTypeDefinition = config.allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return;

        const baseNum = predictionTypeDefinition.calculateBase(num1Val, num2Val);
        if (baseNum < 0 || baseNum > 36) return;
        
        // NEW: Add indicator if this is the recommended group
        let groupNameDisplay = type.displayLabel;
        if (recommendation.bestCandidate && type.id === recommendation.bestCandidate.type.id) {
            groupNameDisplay += '<span class="recommended-indicator">REC</span>';
        }

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
                <strong style="color: ${type.textColor || '#1f2937'};">${groupNameDisplay} (Base: ${baseNum})</strong>
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

    console.log("updateMainRecommendationDisplay: UI elements rendered.");
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
        console.log(`Slider ${paramName} value updated to: ${newValue}`);
        let val = parseFloat(newValue);
        if (isNaN(val)) val = paramObj[paramName];
        val = Math.max(min, Math.min(max, val));

        slider.value = val;
        numberInput.value = val;
        paramObj[paramName] = val;

        state.saveState();
        dom.parameterStatusMessage.textContent = 'Parameter changed. Re-analyzing...';
        analysis.handleStrategyChange();
        updateMainRecommendationDisplay();
    };

    slider.addEventListener('input', (e) => updateValue(e.target.value));
    numberInput.addEventListener('change', (e) => updateValue(e.target.value));
}

export function initializeAdvancedSettingsUI() {
    dom.strategyLearningRatesSliders.innerHTML = '';
    dom.patternThresholdsSliders.innerHTML = '';
    dom.adaptiveInfluenceSliders.innerHTML = '';
    if (dom.warningParametersSliders) dom.warningParametersSliders.innerHTML = '';

    const strategyLearningRatesContainer = document.getElementById('strategyLearningRatesSliders');
    const patternThresholdsContainer = document.getElementById('patternThresholdsSliders');
    const adaptiveInfluenceContainer = document.getElementById('adaptiveInfluenceSliders');
    const warningParametersContainer = document.getElementById('warningParametersSliders');

    strategyLearningRatesContainer.innerHTML = '<h3>Strategy Learning Rates</h3>';
    patternThresholdsContainer.innerHTML = '<h3>Pattern & Trigger Thresholds</h3>';
    adaptiveInfluenceContainer.innerHTML = '<h3>Adaptive Influence Learning</h3>';
    if (warningParametersContainer) warningParametersContainer.innerHTML = '<h3>Table Change Warning Parameters</h3>';

    createSlider('strategyLearningRatesSliders', 'Success Learn Rate', config.STRATEGY_CONFIG, 'learningRate_success');
    createSlider('strategyLearningRatesSliders', 'Failure Learn Rate', config.STRATEGY_CONFIG, 'learningRate_failure');
    createSlider('strategyLearningRatesSliders', 'Max Weight', config.STRATEGY_CONFIG, 'maxWeight');
    createSlider('strategyLearningRatesSliders', 'Min Weight', config.STRATEGY_CONFIG, 'minWeight');
    createSlider('strategyLearningRatesSliders', 'Decay Factor', config.STRATEGY_CONFIG, 'decayFactor');

    createSlider('patternThresholdsSliders', 'Pattern Min Attempts', config.STRATEGY_CONFIG, 'patternMinAttempts');
    createSlider('patternThresholdsSliders', 'Pattern Success %', config.STRATEGY_CONFIG, 'patternSuccessThreshold');
    createSlider('patternThresholdsSliders', 'Trigger Min Attempts', config.STRATEGY_CONFIG, 'triggerMinAttempts');
    createSlider('patternThresholdsSliders', 'Trigger Success %', config.STRATEGY_CONFIG, 'triggerSuccessThreshold');

    createSlider('adaptiveInfluenceSliders', 'Adaptive Success Rate', config.ADAPTIVE_LEARNING_RATES, 'SUCCESS');
    createSlider('adaptiveInfluenceSliders', 'Adaptive Failure Rate', config.ADAPTIVE_LEARNING_RATES, 'FAILURE');
    createSlider('adaptiveInfluenceSliders', 'Min Adaptive Influence', config.ADAPTIVE_LEARNING_RATES, 'MIN_INFLUENCE');
    createSlider('adaptiveInfluenceSliders', 'Max Adaptive Influence', config.ADAPTIVE_LEARNING_RATES, 'MAX_INFLUENCE');

    if (warningParametersContainer) {
        createSlider('warningParametersSliders', 'Warn Window Size', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WINDOW_SIZE');
        createSlider('warningParametersSliders', 'Min Plays for Eval', config.STRATEGY_CONFIG, 'WARNING_MIN_PLAYS_FOR_EVAL');
        createSlider('warningParametersSliders', 'Loss Streak Threshold', config.STRATEGY_CONFIG, 'WARNING_LOSS_STREAK_THRESHOLD');
        createSlider('warningParametersSliders', 'Rolling Win Rate Threshold', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WIN_RATE_THRESHOLD');
        createSlider('warningParametersSliders', 'Default Avg Win Rate', config.STRATEGY_CONFIG, 'DEFAULT_AVERAGE_WIN_RATE');
    }
}

export function toggleParameterSliders(enable) {
    if (!dom.advancedSettingsContent) return;
    console.log(`toggleParameterSliders: ${enable ? 'Enabling' : 'Disabling'} sliders.`);

    dom.resetParametersButton.disabled = !enable;
    dom.saveParametersButton.disabled = !enable;
    dom.loadParametersLabel.classList.toggle('btn-disabled', !enable);
    dom.loadParametersInput.disabled = !enable;

    for (const paramName in parameterMap) {
        const sliderElement = document.getElementById(`${paramName}Slider`);
        const numberInput = document.getElementById(`${paramName}SliderInput`);

        if (sliderElement && numberInput) {
            let categoryToggleChecked = true;

            if (parameterDefinitions[paramName].category === 'coreStrategy') {
                categoryToggleChecked = dom.optimizeCoreStrategyToggle.checked;
            } else if (parameterDefinitions[paramName].category === 'adaptiveRates') {
                categoryToggleChecked = dom.optimizeAdaptiveRatesToggle.checked;
            }
            else if (parameterDefinitions[paramName].category === 'warningParameters') {
                categoryToggleChecked = dom.optimizeCoreStrategyToggle.checked;
            }

            const shouldBeEnabled = enable && categoryToggleChecked;
            sliderElement.disabled = !shouldBeEnabled;
            numberInput.disabled = !shouldBeEnabled;
        }
    }
}