// js/ui.cards.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as analysis from './analysis.js';
import { apiContext } from './api/apiContextManager.js';
import { dom, showPatternAlert, hidePatternAlert } from './ui.helpers.js';

// --- PARAMETER DEFINITIONS ---
export const parameterDefinitions = {
    learningRate_success: { min: 0.01, max: 1.0, step: 0.01 },
    learningRate_failure: { min: 0.01, max: 0.5, step: 0.01 },
    maxWeight: { min: 1, max: 10, step: 0.5 },
    minWeight: { min: 0.01, max: 0.5, step: 0.01 },
    decayFactor: { min: 0.5, max: 0.99, step: 0.01 },
    patternMinAttempts: { min: 1, max: 20, step: 1 },
    patternSuccessThreshold: { min: 40, max: 90, step: 1 },
    triggerMinAttempts: { min: 1, max: 20, step: 1 },
    triggerSuccessThreshold: { min: 40, max: 90, step: 1 },
    hitRateThreshold: { min: 20, max: 60, step: 1 },
    hitRateMultiplier: { min: 0.1, max: 2.0, step: 0.1 },
    streakMultiplier: { min: 1, max: 15, step: 1 },
    maxStreakPoints: { min: 5, max: 30, step: 1 },
    proximityMaxDistance: { min: 1, max: 10, step: 1 },
    proximityMultiplier: { min: 0.5, max: 5, step: 0.5 },
    neighbourMultiplier: { min: 0.1, max: 2.0, step: 0.1 },
    maxNeighbourPoints: { min: 5, max: 30, step: 1 },
    aiConfidenceMultiplier: { min: 5, max: 50, step: 5 },
    minAiPointsForReason: { min: 1, max: 20, step: 1 },
    ADAPTIVE_STRONG_PLAY_THRESHOLD: { min: 20, max: 80, step: 5 },
    ADAPTIVE_PLAY_THRESHOLD: { min: 5, max: 40, step: 5 },
    SIMPLE_PLAY_THRESHOLD: { min: 1, max: 20, step: 1 },
    LESS_STRICT_STRONG_PLAY_THRESHOLD: { min: 15, max: 60, step: 5 },
    LESS_STRICT_PLAY_THRESHOLD: { min: 1, max: 30, step: 5 },
    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: { min: 40, max: 80, step: 5 },
    LESS_STRICT_MIN_STREAK: { min: 1, max: 5, step: 1 },
    MIN_TREND_HISTORY_FOR_CONFIRMATION: { min: 1, max: 10, step: 1 },
    SUCCESS: { min: 0.01, max: 0.5, step: 0.01 },
    FAILURE: { min: 0.01, max: 0.3, step: 0.01 },
    MIN_INFLUENCE: { min: 0.1, max: 1.0, step: 0.1 },
    MAX_INFLUENCE: { min: 1.5, max: 5.0, step: 0.1 },
    FORGET_FACTOR: { min: 0.9, max: 0.999, step: 0.001 },
    CONFIDENCE_WEIGHTING_MULTIPLIER: { min: 0.001, max: 0.05, step: 0.001 },
    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: { min: 5, max: 30, step: 1 },
    WARNING_ROLLING_WINDOW_SIZE: { min: 5, max: 30, step: 1 },
    WARNING_MIN_PLAYS_FOR_EVAL: { min: 3, max: 15, step: 1 },
    WARNING_LOSS_STREAK_THRESHOLD: { min: 2, max: 10, step: 1 },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { min: 20, max: 50, step: 5 },
    DEFAULT_AVERAGE_WIN_RATE: { min: 20, max: 50, step: 1 },
    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: { min: 1.0, max: 3.0, step: 0.1 },
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: { min: 0.1, max: 1.0, step: 0.1 },
    WARNING_FACTOR_SHIFT_WINDOW_SIZE: { min: 3, max: 15, step: 1 },
    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: { min: 0.3, max: 0.9, step: 0.05 },
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: { min: 20, max: 60, step: 5 },
    conditionalProbMultiplier: { min: 1, max: 30, step: 1 },
    minConditionalSampleSize: { min: 1, max: 10, step: 1 }
};

// --- HELPER FUNCTION ---
/**
 * Wraps a base number to valid roulette range (0-36)
 * Numbers > 36 are wrapped using modulo 37
 * Numbers < 0 are handled by taking absolute value first
 * @param {number} baseNum - The calculated base number
 * @returns {number} The wrapped number in range 0-36
 */
function wrapBaseNumber(baseNum) {
    if (baseNum < 0) {
        // For negative numbers, wrap around from 36
        return ((baseNum % 37) + 37) % 37;
    }
    if (baseNum > 36) {
        return baseNum % 37;
    }
    return baseNum;
}

// --- UI UPDATE FUNCTIONS ---

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
        if (item.status === 'success') wins++;
        else if (item.status === 'fail') losses++;
    });
    if (dom.winCount) dom.winCount.textContent = wins;
    if (dom.lossCount) dom.lossCount.textContent = losses;
}

export function drawRouletteWheel(resultNum, lastWinning) {
    if (!dom.rouletteWheelContainer) return;

    const rouletteWheel = config.rouletteWheel;
    const wheelSize = rouletteWheel.length;
    const radius = 140;
    const centerX = 150;
    const centerY = 150;
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

    let svgContent = `<svg viewBox="0 0 300 300" class="mx-auto" style="max-width: 280px;">`;
    svgContent += `<circle cx="${centerX}" cy="${centerY}" r="${radius + 10}" fill="#1a1a2e"/>`;

    const anglePerSlot = (2 * Math.PI) / wheelSize;
    rouletteWheel.forEach((num, i) => {
        const startAngle = i * anglePerSlot - Math.PI / 2;
        const endAngle = startAngle + anglePerSlot;
        const x1 = centerX + radius * Math.cos(startAngle);
        const y1 = centerY + radius * Math.sin(startAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);

        let fillColor = '#16a34a';
        if (num !== 0) fillColor = redNumbers.includes(num) ? '#dc2626' : '#1f2937';

        svgContent += `<path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z" fill="${fillColor}" stroke="#e5e7eb" stroke-width="0.5"/>`;

        const textAngle = startAngle + anglePerSlot / 2;
        const textRadius = radius - 20;
        const textX = centerX + textRadius * Math.cos(textAngle);
        const textY = centerY + textRadius * Math.sin(textAngle);
        svgContent += `<text x="${textX}" y="${textY}" fill="white" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="central">${num}</text>`;
    });

    // Wrap resultNum if it exceeds valid range
    const wrappedResultNum = (resultNum !== null && !isNaN(resultNum)) ? wrapBaseNumber(resultNum) : null;

    if (wrappedResultNum !== null && rouletteWheel.includes(wrappedResultNum)) {
        const resultIndex = rouletteWheel.indexOf(wrappedResultNum);
        const resultAngle = resultIndex * anglePerSlot - Math.PI / 2 + anglePerSlot / 2;
        const markerRadius = radius + 5;
        const markerX = centerX + markerRadius * Math.cos(resultAngle);
        const markerY = centerY + markerRadius * Math.sin(resultAngle);
        svgContent += `<circle cx="${markerX}" cy="${markerY}" r="8" fill="#facc15" stroke="#1f2937" stroke-width="2"/>`;
    }

    if (lastWinning !== null && rouletteWheel.includes(lastWinning)) {
        const lastWinIndex = rouletteWheel.indexOf(lastWinning);
        const lastWinAngle = lastWinIndex * anglePerSlot - Math.PI / 2 + anglePerSlot / 2;
        const lastWinMarkerRadius = radius - 40;
        const lastWinMarkerX = centerX + lastWinMarkerRadius * Math.cos(lastWinAngle);
        const lastWinMarkerY = centerY + lastWinMarkerRadius * Math.sin(lastWinAngle);
        svgContent += `<circle cx="${lastWinMarkerX}" cy="${lastWinMarkerY}" r="6" fill="#22d3ee" stroke="#0e7490" stroke-width="2"/>`;
    }

    svgContent += `<circle cx="${centerX}" cy="${centerY}" r="35" fill="#0f172a"/>`;
    svgContent += `</svg>`;
    dom.rouletteWheelContainer.innerHTML = svgContent;
}

export function updateRouletteLegend(recommendation) {
    if (!dom.rouletteLegend) return;
    let legendHtml = `<span class="legend-item"><span class="legend-dot" style="background-color: #facc15;"></span> Result</span>`;
    legendHtml += `<span class="legend-item"><span class="legend-dot" style="background-color: #22d3ee;"></span> Last Win</span>`;
    dom.rouletteLegend.innerHTML = legendHtml;
}

export function renderHistory() {
    if (!dom.historyList) return;
    if (state.history.length === 0) {
        dom.historyList.innerHTML = '<p class="text-gray-500 text-center">No history yet.</p>';
        return;
    }
    dom.historyList.innerHTML = '';

    const sortedHistory = [...state.history].sort((a, b) => b.id - a.id);

    sortedHistory.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item fade-in';

        let stateBadgeClass = 'state-badge-pending';
        let stateBadgeContent = '?';
        if (item.status === 'success') {
            stateBadgeClass = 'state-badge-success';
            stateBadgeContent = item.winningNumber;
        } else if (item.status === 'fail') {
            stateBadgeClass = 'state-badge-fail';
            stateBadgeContent = item.winningNumber;
        }

        let hitTypesHtml = '';
        if (item.hitTypes && item.hitTypes.length > 0) {
            const hitTypeLabels = item.hitTypes.map(typeId => {
                const type = config.allPredictionTypes.find(t => t.id === typeId);
                return type ? `<span class="group-name-${type.id}">${type.displayLabel}</span>` : typeId;
            }).join(', ');
            hitTypesHtml = `<p class="text-sm text-green-600">Hit: ${hitTypeLabels}</p>`;
        }

        let pocketDistanceHtml = '';
        if (state.usePocketDistance && item.pocketDistance !== null && item.status === 'success') {
            pocketDistanceHtml = `<p class="text-xs text-gray-500">Closest Pocket Distance: ${item.pocketDistance}</p>`;
        }

        let recommendedGroupHtml = '';
        if (item.recommendedGroupId) {
            const recommendedType = config.allPredictionTypes.find(t => t.id === item.recommendedGroupId);
            if (recommendedType) {
                const wasCorrect = item.hitTypes && item.hitTypes.includes(item.recommendedGroupId);
                const correctnessClass = wasCorrect ? 'text-green-600' : 'text-red-600';
                recommendedGroupHtml = `<p class="text-xs ${correctnessClass}">Recommended: <span class="group-name-${recommendedType.id}">${recommendedType.displayLabel}</span></p>`;
            }
        }

        let aiDetailsHtml = '';
        if (item.recommendationDetails) {
            const aiExplanation = item.recommendationDetails.aiExplanation;
            let aiContentHtml = '';

            if (aiExplanation && aiExplanation.headline) {
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
                <p>${item.num2} - ${item.num1} = <strong>${item.difference}</strong></p>
                ${hitTypesHtml}
                ${pocketDistanceHtml}
                ${recommendedGroupHtml}
                ${aiDetailsHtml}
            </div>
        `;
        dom.historyList.appendChild(li);
    });

    document.querySelectorAll('.ai-details-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.toggle('open');
                e.target.textContent = targetSection.classList.contains('open') ? 'Hide AI Insights' : 'Show AI Insights';
            }
        });
    });
}

export function renderAnalysisList(neighbourScores) {
    if (!dom.analysisList) return;
    dom.analysisList.innerHTML = '';
    const sortedNumbers = Object.keys(neighbourScores).map(Number).sort((a, b) => neighbourScores[b].success - neighbourScores[a].success);
    sortedNumbers.forEach(num => {
        const score = neighbourScores[num].success;
        if (score > 0.1) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${num}</strong>: Score ${score.toFixed(2)}`;
            dom.analysisList.appendChild(li);
        }
    });
    if (dom.analysisList.children.length === 0) {
        dom.analysisList.innerHTML = '<li class="text-gray-500">No strong neighbour patterns yet.</li>';
    }
}

export function renderBoardState(boardStats) {
    if (!dom.boardStateAnalysis) return;
    dom.boardStateAnalysis.innerHTML = '';
    let conclusion = '';
    let highestRate = 0;

    state.activePredictionTypes.forEach(type => {
        const stats = boardStats[type.id] || { success: 0, total: 0 };
        const rate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
        const li = document.createElement('li');
        li.innerHTML = `<span class="group-name-${type.id}">${type.displayLabel}</span>: <strong>${rate.toFixed(1)}%</strong>`;
        dom.boardStateAnalysis.appendChild(li);
        if (rate > highestRate) {
            highestRate = rate;
            conclusion = `<span class="group-name-${type.id}">${type.displayLabel}</span> is leading.`;
        }
    });

    if (dom.boardStateConclusion) {
        dom.boardStateConclusion.innerHTML = highestRate > 0 ? conclusion : 'No strong board state conclusion yet.';
    }
}

export function renderStrategyWeights() {
    if (!dom.strategyWeightsDisplay) return;
    let html = '<ul class="text-sm">';
    for (const [factor, influence] of Object.entries(state.adaptiveFactorInfluences)) {
        html += `<li><strong>${factor}:</strong> ${influence.toFixed(3)}</li>`;
    }
    html += '</ul>';
    dom.strategyWeightsDisplay.innerHTML = html;
}

export function updateOptimizationStatus(message) {
    if (dom.optimizationStatus) {
        dom.optimizationStatus.innerHTML = message;
    }
}

export function toggleParameterSliders(enable) {
    const allSliders = document.querySelectorAll('.slider-group input');
    allSliders.forEach(slider => {
        slider.disabled = !enable;
    });
}

/**
 * Calculate optimizer confidence level based on fitness score
 */
function calculateOptimizerConfidence(fitness) {
    if (fitness >= 2.0) {
        return { level: 'Very High', description: 'Strong improvement detected' };
    } else if (fitness >= 1.5) {
        return { level: 'High', description: 'Good improvement detected' };
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
 * Generates HTML for sector context display
 * @param {Object} sectorContext - Sector context from recommendation
 * @returns {string} HTML string for sector context section
 */
function generateSectorContextHtml(sectorContext) {
    if (!sectorContext) {
        return '';
    }

    const dataSourceLabel = sectorContext.dataSource === 'api' 
        ? '<span class="text-green-600 text-xs font-semibold">5+ Year Data</span>'
        : '<span class="text-yellow-600 text-xs font-semibold">Session Data</span>';

    const severityColor = sectorContext.aggregateSeverity > 0.7 ? 'text-red-600'
        : sectorContext.aggregateSeverity > 0.5 ? 'text-yellow-600'
        : 'text-gray-600';

    return `
        <div class="mt-3 pt-3 border-t border-gray-200">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-gray-500">Sector Context</span>
                ${dataSourceLabel}
            </div>
            <p class="text-xs ${severityColor}">${sectorContext.contextDescription || 'No sector context available'}</p>
            ${sectorContext.dominantSector ? `
                <p class="text-xs text-gray-500 mt-1">
                    Dominant: ${sectorContext.dominantSector.name} 
                    (${(sectorContext.dominantSector.ratio * 100).toFixed(0)}% of historical max)
                </p>
            ` : ''}
        </div>
    `;
}

/**
 * Fetches recommendation data for display, including AI prediction.
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

    // Get sector context provider if available
    const sectorContextProvider = apiContext.hasSectorData() ? apiContext : null;

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
        sectorContextProvider: sectorContextProvider,
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
 * FIX: Now wraps base numbers > 36 instead of hiding them.
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
        
        // Check if sector context is available
        const sectorContextHtml = exp.sectorContext ? generateSectorContextHtml(exp.sectorContext) : '';
        
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
                
                ${sectorContextHtml}
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

    // FIX: Now ALL active prediction types are rendered - base numbers > 36 are wrapped
    state.activePredictionTypes.forEach(type => {
        const predictionTypeDefinition = config.allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return;

        const rawBaseNum = predictionTypeDefinition.calculateBase(num1Val, num2Val);
        
        // FIX: Wrap base numbers instead of skipping them
        // Only skip if the raw base is negative (which shouldn't happen with current formulas)
        const baseNum = wrapBaseNumber(rawBaseNum);
        
        // Show original calculation and wrapped result if different
        const showWrapped = rawBaseNum !== baseNum;
        
        // Add indicator if this is the recommended group
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
        const hitRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;

        let pocketDistanceHtml = '';
        if (state.usePocketDistance && lastWinning !== null) {
            const hitZone = getHitZone(baseNum, terminals, lastWinning, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            let minDist = Infinity;
            hitZone.forEach(zoneNum => {
                const dist = calculatePocketDistance(zoneNum, lastWinning, config.rouletteWheel);
                if (dist < minDist) minDist = dist;
            });
            if (minDist !== Infinity) {
                pocketDistanceHtml = `<span class="ml-2">| PD: <strong>${minDist}</strong></span>`;
            }
        }

        // Get sector context for this group if available
        let groupSectorHtml = '';
        if (apiContext.hasSectorData()) {
            const hitZone = getHitZone(baseNum, terminals, lastWinning, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            const sc = apiContext.getGroupSectorContext(hitZone);
            if (sc && sc.hasContext && sc.dominantSector) {
                const severityColor = sc.dominantSector.ratio > 0.7 ? 'text-red-600' 
                    : sc.dominantSector.ratio > 0.5 ? 'text-yellow-600' 
                    : 'text-gray-500';
                groupSectorHtml = `<span class="${severityColor} text-xs ml-2">Sector: ${sc.dominantSector.severity?.description || 'normal'}</span>`;
            }
        }

        // Show wrapped indicator if the base number was wrapped
        const wrappedIndicator = showWrapped 
            ? `<span class="text-xs text-purple-600 ml-2">(${rawBaseNum} -> ${baseNum})</span>` 
            : '';

        fullResultHtml += `
            <div class="p-3 rounded-lg border" style="border-color: ${type.textColor || '#e2e8f0'};">
                <strong style="color: ${type.textColor || '#1f2937'};">${groupNameDisplay} (Base: ${baseNum})</strong>${wrappedIndicator}
                <p class="text-sm text-gray-600">Terminals: ${terminals.join(', ') || 'None'}${confirmedByHtml}${groupSectorHtml}</p>
                <div class="group-stats">
                    <span>Hit Rate: <strong>${hitRate.toFixed(1)}%</strong></span>
                    ${pocketDistanceHtml}
                </div>
            </div>
        `;
    });

    fullResultHtml += '</div>';
    
    // Add historical data indicator if sector data is available
    if (apiContext.hasSectorData()) {
        fullResultHtml += `
            <div class="mt-4 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 flex items-center">
                <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                </svg>
                <span>Historical sector data (5+ years) is being used to calibrate confidence. This provides context, not prediction.</span>
            </div>
        `;
    }
    
    dom.resultDisplay.innerHTML = fullResultHtml;
    dom.resultDisplay.classList.remove('hidden');

    if (recommendation.signal === 'Avoid Play') {
        showPatternAlert(recommendation.reason.replace('(Table Change Warning: ', '').replace(')', ''));
    } else {
        hidePatternAlert();
    }

    console.log("updateMainRecommendationDisplay: UI elements rendered.");

    // Draw wheel with wrapped result number
    const wrappedResult = wrapBaseNumber(Math.abs(num2Val - num1Val));
    drawRouletteWheel(wrappedResult, lastWinning);
    updateRouletteLegend(recommendation);
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
    createSlider('adaptiveInfluenceSliders', 'Min Influence', config.ADAPTIVE_LEARNING_RATES, 'MIN_INFLUENCE');
    createSlider('adaptiveInfluenceSliders', 'Max Influence', config.ADAPTIVE_LEARNING_RATES, 'MAX_INFLUENCE');

    if (warningParametersContainer) {
        createSlider('warningParametersSliders', 'Rolling Window', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WINDOW_SIZE');
        createSlider('warningParametersSliders', 'Min Plays for Eval', config.STRATEGY_CONFIG, 'WARNING_MIN_PLAYS_FOR_EVAL');
        createSlider('warningParametersSliders', 'Loss Streak Threshold', config.STRATEGY_CONFIG, 'WARNING_LOSS_STREAK_THRESHOLD');
        createSlider('warningParametersSliders', 'Win Rate Threshold %', config.STRATEGY_CONFIG, 'WARNING_ROLLING_WIN_RATE_THRESHOLD');
        createSlider('warningParametersSliders', 'Default Avg Win Rate %', config.STRATEGY_CONFIG, 'DEFAULT_AVERAGE_WIN_RATE');
    }
}