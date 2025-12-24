// shared-logic.js
// IMPROVED: AI probability integration, streak normalization, weighted hit zone aggregation

/**
 * NOTE: These functions are designed to be "pure" where possible.
 * They do not access global variables from index.html directly. Instead, they
 * receive all necessary data (like the rouletteWheel, terminalMapping, configs)
 * as parameters. This makes them predictable and testable.
 */

/**
 * Helper function to wrap base numbers to valid roulette range (0-36)
 * Numbers > 36 are wrapped using modulo 37
 * Numbers < 0 are handled by wrapping around from 36
 * @param {number} baseNum - The calculated base number
 * @returns {number} The wrapped number in range 0-36
 */
function wrapBaseNumber(baseNum) {
    if (baseNum < 0) {
        return ((baseNum % 37) + 37) % 37;
    }
    if (baseNum > 36) {
        return baseNum % 37;
    }
    return baseNum;
}

function getNeighbours(number, count, rouletteWheel) {
    const index = rouletteWheel.indexOf(number);
    if (index === -1) return [];
    const neighbours = new Set();
    const wheelSize = rouletteWheel.length;
    for (let i = 1; i <= count; i++) {
        neighbours.add(rouletteWheel[(index - i + wheelSize) % wheelSize]);
        neighbours.add(rouletteWheel[(index + i) % wheelSize]);
    }
    return Array.from(neighbours);
}

export function calculatePocketDistance(num1, num2, rouletteWheel) {
    const index1 = rouletteWheel.indexOf(num1);
    const index2 = rouletteWheel.indexOf(num2);
    if (index1 === -1 || index2 === -1) return Infinity;
    const directDistance = Math.abs(index1 - index2);
    const wrapAroundDistance = rouletteWheel.length - directDistance;
    return Math.min(directDistance, wrapAroundDistance);
}

export function getHitZone(baseNumber, terminals, winningNumber, useDynamicTerminalNeighbourCountBool, terminalMapping, rouletteWheel) {
    const wrappedBaseNumber = wrapBaseNumber(baseNumber);
    if (wrappedBaseNumber < 0 || wrappedBaseNumber > 36) return [];
    
    const hitZone = new Set([wrappedBaseNumber]);
    
    const actualTerminals = terminals || terminalMapping?.[wrappedBaseNumber] || [];
    const numTerminals = actualTerminals.length;

    let baseNeighbourCount = (numTerminals === 1) ? 3 : (numTerminals >= 2) ? 1 : 0;
    if (baseNeighbourCount > 0) getNeighbours(wrappedBaseNumber, baseNeighbourCount, rouletteWheel).forEach(n => hitZone.add(n));

    let terminalNeighbourCount;
    if (useDynamicTerminalNeighbourCountBool && winningNumber !== null) {
        if (wrappedBaseNumber === winningNumber || actualTerminals.includes(winningNumber)) {
            terminalNeighbourCount = 0;
        } else {
            terminalNeighbourCount = (numTerminals === 1 || numTerminals === 2) ? 3 : (numTerminals > 2) ? 1 : 0;
        }
    } else {
        terminalNeighbourCount = (numTerminals === 1 || numTerminals === 2) ? 3 : (numTerminals > 2) ? 1 : 0;
    }

    if (actualTerminals.length > 0) {
        actualTerminals.forEach(t => {
            hitZone.add(t);
            if (terminalNeighbourCount > 0) getNeighbours(t, terminalNeighbourCount, rouletteWheel).forEach(n => hitZone.add(n));
        });
    }
    return Array.from(hitZone);
}

export function evaluateCalculationStatus(historyItem, winningNumber, useDynamicTerminalNeighbourCountBool, activePredictionTypes, terminalMapping, rouletteWheel) {
    historyItem.winningNumber = winningNumber;
    historyItem.hitTypes = [];
    historyItem.typeSuccessStatus = {};
    let minPocketDistance = Infinity;

    activePredictionTypes.forEach(type => {
        const rawBaseNum = type.calculateBase(historyItem.num1, historyItem.num2);
        const baseNum = wrapBaseNumber(rawBaseNum);
        
        if (!historyItem.wrappedBaseNumbers) {
            historyItem.wrappedBaseNumbers = {};
        }
        if (rawBaseNum !== baseNum) {
            historyItem.wrappedBaseNumbers[type.id] = { raw: rawBaseNum, wrapped: baseNum };
        }

        const terminals = terminalMapping?.[baseNum] || [];
        const hitZone = getHitZone(baseNum, terminals, winningNumber, useDynamicTerminalNeighbourCountBool, terminalMapping, rouletteWheel);

        if (hitZone.includes(winningNumber)) {
            historyItem.hitTypes.push(type.id);
            historyItem.typeSuccessStatus[type.id] = true;
            let currentMinDist = Infinity;
            hitZone.forEach(zoneNum => {
                const dist = calculatePocketDistance(zoneNum, winningNumber, rouletteWheel);
                if (dist < currentMinDist) currentMinDist = dist;
            });
            if (currentMinDist < minPocketDistance) minPocketDistance = currentMinDist;
        } else {
            historyItem.typeSuccessStatus[type.id] = false;
        }
    });

    historyItem.status = historyItem.hitTypes.length > 0 ? 'success' : 'fail';
    historyItem.pocketDistance = minPocketDistance !== Infinity ? minPocketDistance : null;

    if (historyItem.recommendedGroupId && historyItem.hitTypes.includes(historyItem.recommendedGroupId)) {
        historyItem.recommendedGroupPocketDistance = historyItem.pocketDistance;
    } else {
        historyItem.recommendedGroupPocketDistance = null;
    }
}

export function calculateTrendStats(currentHistory, current_STRATEGY_CONFIG, activeTypesArr, allPredictionTypes, terminalMapping, rouletteWheel) {
    const sortedHistory = [...currentHistory].sort((a, b) => a.id - b.id);
    const streakData = {};
    const currentStreaks = {};
    const totalOccurrences = {};
    const successfulOccurrences = {};
    let lastSuccessState = [];

    activeTypesArr.forEach(type => {
        streakData[type.id] = [];
        currentStreaks[type.id] = 0;
        totalOccurrences[type.id] = 0;
        successfulOccurrences[type.id] = 0;
    });

    sortedHistory.forEach((item, i) => {
        if (item.status === 'pending') return;
        const weight = Math.pow(current_STRATEGY_CONFIG.decayFactor, sortedHistory.length - 1 - i);
        activeTypesArr.forEach(type => {
            const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
            if (!predictionTypeDefinition) return;
            const rawBaseNum = predictionTypeDefinition.calculateBase(item.num1, item.num2);
            const baseNum = wrapBaseNumber(rawBaseNum);

            totalOccurrences[type.id] += weight;

            if (item.typeSuccessStatus && item.typeSuccessStatus.hasOwnProperty(type.id)) {
                if (item.typeSuccessStatus[type.id]) {
                    currentStreaks[type.id]++;
                    successfulOccurrences[type.id] += weight;
                } else {
                    if (currentStreaks[type.id] > 0) streakData[type.id].push(currentStreaks[type.id]);
                    currentStreaks[type.id] = 0;
                }
            }
        });
        if (item.status === 'success') lastSuccessState = item.hitTypes;
    });

    const averages = {};
    activeTypesArr.forEach(type => {
        const allStreaks = [...streakData[type.id]];
        if (currentStreaks[type.id] > 0) allStreaks.push(currentStreaks[type.id]);
        averages[type.id] = allStreaks.length > 0 ? (allStreaks.reduce((a, b) => a + b, 0) / allStreaks.length) : 0;
    });

    return { averages, currentStreaks, lastSuccessState, streakData };
}

export function getBoardStateStats(simulatedHistory, current_STRATEGY_CONFIG, activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel) {
    const stats = {};
    activePredictionTypes.forEach(type => {
        stats[type.id] = { success: 0, total: 0 };
    });
    simulatedHistory.forEach((item, i) => {
        const weight = Math.pow(current_STRATEGY_CONFIG.decayFactor, simulatedHistory.length - 1 - i);
        activePredictionTypes.forEach(type => {
            const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
            if (!predictionTypeDefinition) return;
            const rawBaseNum = predictionTypeDefinition.calculateBase(item.num1, item.num2);
            const baseNum = wrapBaseNumber(rawBaseNum);
            stats[type.id].total += weight;
        });
        if (item.status === 'success') {
            item.hitTypes.forEach(typeId => {
                if (stats[typeId]) stats[typeId].success += weight;
            });
        }
    });
    return stats;
}

export function runNeighbourAnalysis(simulatedHistory, current_STRATEGY_CONFIG, useDynamicTerminalNeighbourCountBool, allPredictionTypes, terminalMapping, rouletteWheel) {
    const analysis = {};
    for (let i = 0; i <= 36; i++) analysis[i] = { success: 0 };
    simulatedHistory.forEach((item, i) => {
        if (item.status !== 'success') return;
        const weight = Math.pow(current_STRATEGY_CONFIG.decayFactor, simulatedHistory.length - 1 - i);
        item.hitTypes.forEach(typeId => {
            const type = allPredictionTypes.find(t => t.id === typeId);
            if (!type) return;

            const rawBaseNum = type.calculateBase(item.num1, item.num2);
            const baseNum = wrapBaseNumber(rawBaseNum);

            const terminals = terminalMapping[baseNum] || [];
            const hitZone = getHitZone(baseNum, terminals, item.winningNumber, useDynamicTerminalNeighbourCountBool, terminalMapping, rouletteWheel);
            
            hitZone.forEach(num => {
                if (analysis[num]) analysis[num].success += weight;
            });
        });
    });
    return analysis;
}

export function calculateConditionalProbability(history, groupId, activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel, useDynamicTerminalNeighbourCount, minSampleSize) {
    const validHistory = history.filter(item => item.winningNumber !== null && item.status !== 'pending');
    
    if (validHistory.length < 2) {
        return { probability: 0, sampleSize: 0 };
    }

    let relevantOccurrences = 0;
    let groupHitCount = 0;

    for (let i = 1; i < validHistory.length; i++) {
        const previousItem = validHistory[i - 1];
        const currentItem = validHistory[i];
        
        let closestGroupId = null;
        let closestDistance = Infinity;
        
        activePredictionTypes.forEach(type => {
            const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
            if (!predictionTypeDefinition) return;
            
            const rawBaseNum = predictionTypeDefinition.calculateBase(previousItem.num1, previousItem.num2);
            const baseNum = wrapBaseNumber(rawBaseNum);
            
            const terminals = terminalMapping?.[baseNum] || [];
            const hitZone = getHitZone(baseNum, terminals, previousItem.winningNumber, useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);
            
            hitZone.forEach(zoneNum => {
                const dist = calculatePocketDistance(zoneNum, previousItem.winningNumber, rouletteWheel);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestGroupId = type.id;
                }
            });
        });
        
        if (closestGroupId === groupId) {
            relevantOccurrences++;
            
            if (currentItem.typeSuccessStatus && currentItem.typeSuccessStatus[groupId]) {
                groupHitCount++;
            }
        }
    }
    
    const probability = relevantOccurrences >= minSampleSize && relevantOccurrences > 0 
        ? groupHitCount / relevantOccurrences 
        : 0;
    
    return { probability, sampleSize: relevantOccurrences };
}

export function calculateRollingPerformance(history, windowSize, minPlays) {
    const confirmedItems = history
        .filter(item => item.winningNumber !== null && item.recommendedGroupId && item.recommendationDetails?.finalScore > 0)
        .sort((a, b) => b.id - a.id)
        .slice(0, windowSize);
    
    if (confirmedItems.length < minPlays) {
        return { sufficientData: false, plays: confirmedItems.length, wins: 0, losses: 0, winRate: 0 };
    }
    
    let wins = 0;
    let losses = 0;
    let currentLossStreak = 0;
    
    for (const item of confirmedItems) {
        const wasHit = item.hitTypes && item.hitTypes.includes(item.recommendedGroupId);
        if (wasHit) {
            wins++;
            currentLossStreak = 0;
        } else {
            losses++;
            currentLossStreak++;
        }
    }
    
    return {
        sufficientData: true,
        plays: confirmedItems.length,
        wins,
        losses,
        winRate: confirmedItems.length > 0 ? (wins / confirmedItems.length * 100) : 0,
        currentLossStreak
    };
}

export function analyzeFactorShift(history, strategyConfigOrWindowSize, diversityThreshold, minDominancePercent) {
    // Handle both old signature (history, strategyConfig) and new signature (history, windowSize, diversityThreshold, minDominancePercent)
    let windowSize, divThreshold, minDominance;
    
    if (typeof strategyConfigOrWindowSize === 'object' && strategyConfigOrWindowSize !== null) {
        // Old signature: analyzeFactorShift(history, strategyConfig)
        const strategyConfig = strategyConfigOrWindowSize;
        windowSize = strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE || 5;
        divThreshold = strategyConfig.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD || 0.8;
        minDominance = strategyConfig.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT || 50;
    } else {
        // New signature: analyzeFactorShift(history, windowSize, diversityThreshold, minDominancePercent)
        windowSize = strategyConfigOrWindowSize || 5;
        divThreshold = diversityThreshold || 0.8;
        minDominance = minDominancePercent || 50;
    }
    
    const recentSuccessfulItems = history
        .filter(item => item.status === 'success' && item.recommendationDetails?.primaryDrivingFactor)
        .sort((a, b) => b.id - a.id)
        .slice(0, windowSize);
    
    if (recentSuccessfulItems.length < 3) {
        return { sufficientData: false, isShifting: false, dominantFactor: null, factorDistribution: {}, factorShiftDetected: false, reason: 'Not enough data' };
    }
    
    const factorCounts = {};
    for (const item of recentSuccessfulItems) {
        const factor = item.recommendationDetails.primaryDrivingFactor;
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
    }
    
    let dominantFactor = null;
    let maxCount = 0;
    for (const [factor, count] of Object.entries(factorCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantFactor = factor;
        }
    }
    
    const dominancePercent = (maxCount / recentSuccessfulItems.length) * 100;
    const uniqueFactors = Object.keys(factorCounts).length;
    const diversityRatio = uniqueFactors / recentSuccessfulItems.length;
    
    const isShifting = diversityRatio >= divThreshold || dominancePercent < minDominance;
    
    return {
        sufficientData: true,
        isShifting,
        dominantFactor,
        factorDistribution: factorCounts,
        diversityRatio,
        dominancePercent,
        factorShiftDetected: isShifting,
        reason: isShifting ? 'High factor diversity detected' : 'Stable factor dominance'
    };
}

function wrapGroupName(groupName, groupId) {
    if (!groupId || !groupName) return groupName;
    const colorClass = `group-name-${groupId}`;
    return `<span class="${colorClass}">${groupName}</span>`;
}

// ===========================
// IMPROVED: Sigmoid streak normalization
// ===========================

/**
 * IMPROVED: Sigmoid normalization for streaks
 * Provides smooth S-curve that doesn't clip information from long streaks
 * @param {number} streak - Current streak length
 * @param {number} halfPoint - Streak length at which output is 0.5
 * @returns {number} Normalized value between 0 and 1
 */
function normalizeStreakSigmoid(streak, halfPoint = 5) {
    return 1 / (1 + Math.exp(-streak / halfPoint + 1));
}

/**
 * IMPROVED: Get relative streak strength compared to historical distribution
 * @param {number} currentStreak - Current streak length
 * @param {number[]} streakDistribution - Historical streak lengths for this group
 * @returns {number} Percentile rank between 0 and 1
 */
function getRelativeStreakStrength(currentStreak, streakDistribution) {
    if (!streakDistribution || streakDistribution.length < 5) return 0.5;
    const percentile = streakDistribution.filter(s => s < currentStreak).length / streakDistribution.length;
    return percentile;
}

// ===========================
// IMPROVED: Weighted hit zone aggregation
// ===========================

/**
 * IMPROVED: Weight hit zone neighbour scores by proximity to base number
 * Numbers closer to the base get higher weight
 * @param {number[]} hitZone - Array of numbers in the hit zone
 * @param {number} baseNum - The base number for this group
 * @param {Object} neighbourScores - Neighbour score object
 * @param {number[]} rouletteWheel - Wheel layout
 * @returns {number} Weighted score
 */
function calculateWeightedHitZoneScore(hitZone, baseNum, neighbourScores, rouletteWheel) {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const num of hitZone) {
        const distance = calculatePocketDistance(num, baseNum, rouletteWheel);
        const proximityWeight = 1 / (1 + distance);
        const score = neighbourScores[num]?.success || 0;
        
        totalScore += score * proximityWeight;
        totalWeight += proximityWeight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * IMPROVED: Calculate overlap penalty for groups whose hit zones overlap with recent failures
 * @param {number[]} hitZone - Current hit zone
 * @param {Array} recentFailedHitZones - Array of hit zones from recent failed recommendations
 * @returns {number} Penalty multiplier between 0.7 and 1.0
 */
function calculateOverlapPenalty(hitZone, recentFailedHitZones) {
    if (!recentFailedHitZones || recentFailedHitZones.length === 0) return 1.0;
    
    // Flatten all recent failed zones
    const failedNumbers = new Set();
    for (const failedZone of recentFailedHitZones) {
        if (Array.isArray(failedZone)) {
            failedZone.forEach(n => failedNumbers.add(n));
        }
    }
    
    if (failedNumbers.size === 0) return 1.0;
    
    const overlapCount = hitZone.filter(n => failedNumbers.has(n)).length;
    const overlapRatio = overlapCount / hitZone.length;
    
    // Max 30% penalty for complete overlap
    return 1 - (overlapRatio * 0.3);
}

/**
 * IMPROVED: Get severity bonus from number context
 * Uses historical max data for contextual weighting (NOT prediction)
 * @param {number[]} hitZone - Hit zone numbers
 * @param {Object} numberContextProvider - Number context provider
 * @returns {number} Severity bonus score
 */
function getSeverityBonus(hitZone, numberContextProvider, severityThreshold = 0.5) {
    if (!numberContextProvider || typeof numberContextProvider.getNumberSeverity !== 'function') {
        return 0;
    }
    
    let totalBonus = 0;
    let validNumbers = 0;
    
    for (const num of hitZone) {
        try {
            const severity = numberContextProvider.getNumberSeverity(num);
            if (severity && typeof severity.ratio === 'number') {
                validNumbers++;
                // Higher ratio = longer drought = modest contextual interest
                // NOT a "due" prediction, just weighting
                if (severity.ratio >= severityThreshold) {
                    totalBonus += (severity.ratio - severityThreshold) * 2;
                }
            }
        } catch (e) {
            // Skip if error getting severity
        }
    }
    
    return validNumbers > 0 ? totalBonus / validNumbers : 0;
}

function generateDetailedExplanation(candidates, bestCandidate, context) {
    const {
        trendStats, boardStats, lastWinningNumber,
        currentHistoryForTrend, current_STRATEGY_CONFIG,
        activePredictionTypes, contextProvider
    } = context;

    if (!bestCandidate || candidates.length === 0) {
        return {
            headline: "Insufficient data for recommendation",
            bullets: ["Need more history to generate reliable context"],
            confidence: "none",
            windowSize: 0,
            topGroup: null,
            runnerUpGroup: null,
            scoreGap: 0,
            recentPerformance: null,
            sectorContext: null,
            numberContext: null
        };
    }

    const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
    const topGroup = sortedCandidates[0];
    const runnerUpGroup = sortedCandidates[1] || { type: { displayLabel: 'None' }, score: 0 };
    const scoreGap = topGroup.score - runnerUpGroup.score;

    const recentWindow = Math.min(10, currentHistoryForTrend?.length || 0);
    const recentHistory = (currentHistoryForTrend || [])
        .filter(item => item.winningNumber !== null && item.status !== 'pending')
        .slice(-recentWindow);
    
    let hits = 0;
    let total = 0;
    let currentStreak = bestCandidate.details?.currentStreak || 0;
    
    for (const item of recentHistory) {
        if (item.typeSuccessStatus && item.typeSuccessStatus[bestCandidate.type.id] !== undefined) {
            total++;
            if (item.typeSuccessStatus[bestCandidate.type.id]) {
                hits++;
            }
        }
    }
    
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    let confidence = 'low';
    const scoreGapPercent = runnerUpGroup.score > 0 ? ((scoreGap / runnerUpGroup.score) * 100) : (topGroup.score > 0 ? 100 : 0);
    
    if (scoreGapPercent >= 30 && hitRate >= 50 && total >= 5) {
        confidence = 'high';
    } else if (scoreGapPercent >= 15 || (hitRate >= 40 && total >= 3)) {
        confidence = 'medium';
    }

    const wrappedTopName = wrapGroupName(topGroup.type.displayLabel, topGroup.type.id);
    const wrappedRunnerUpName = wrapGroupName(runnerUpGroup.type.displayLabel, runnerUpGroup.type.id);

    let headline = `${wrappedTopName} leads by ${scoreGapPercent.toFixed(0)}%`;
    const bullets = [];

    if (currentStreak >= 3) {
        headline = `${wrappedTopName} on ${currentStreak}-spin winning streak`;
        bullets.push(`Active streak: ${currentStreak} consecutive hits`);
    } else if (hitRate >= 60 && total >= 5) {
        headline = `${wrappedTopName} hitting ${hitRate.toFixed(0)}% recently`;
    }

    if (total >= 3) {
        bullets.push(`Recent: ${hits}/${total} (${hitRate.toFixed(0)}%)`);
    }

    bullets.push(`Runner-up: ${wrappedRunnerUpName} (${scoreGapPercent.toFixed(0)}% gap)`);

    if (bestCandidate.details?.primaryDrivingFactor && bestCandidate.details.primaryDrivingFactor !== 'N/A') {
        bullets.push(`Primary driver: ${bestCandidate.details.primaryDrivingFactor}`);
    }

    let sectorContextInfo = null;
    let numberContextInfo = null;

    if (bestCandidate.details?.numberContext && bestCandidate.details.numberContext.hasContext) {
        const numCtx = bestCandidate.details.numberContext;
        numberContextInfo = {
            aggregateSeverity: numCtx.aggregateSeverity,
            avgLossStreak: numCtx.avgLossStreak,
            elevatedNumbers: numCtx.elevatedNumbers?.length || 0,
            hasApiData: numCtx.hasApiData,
            contextDescription: numCtx.contextDescription,
            isReferenceOnly: true
        };
        
        if (numCtx.elevatedNumbers && numCtx.elevatedNumbers.length > 0) {
            bullets.push(`[Ref] ${numCtx.elevatedNumbers.length} number(s) with extended non-appearance`);
        }
    }
    
    const sectorCtx = bestCandidate.details?.sectorContext;
    if (!numberContextInfo && sectorCtx && sectorCtx.hasContext) {
        sectorContextInfo = {
            dominantSector: sectorCtx.dominantSector?.name || null,
            dominantSectorLevel: sectorCtx.dominantSector?.severity?.level || 'normal',
            aggregateSeverity: sectorCtx.aggregateSeverity,
            hasApiData: sectorCtx.hasApiData,
            isReferenceOnly: true
        };
        
        if (sectorCtx.dominantSector) {
            const severity = sectorCtx.dominantSector.severity;
            if (severity && severity.level !== 'normal') {
                bullets.push(`[Ref] Sector: ${severity.description}`);
            }
        }
    }

    return {
        headline,
        bullets,
        confidence,
        windowSize: recentWindow,
        topGroup: bestCandidate.type.displayLabel,
        runnerUpGroup: runnerUpGroup.type.displayLabel,
        scoreGap: scoreGapPercent.toFixed(1),
        recentPerformance: {
            hits,
            total,
            hitRate: hitRate.toFixed(1),
            currentStreak
        },
        finalScore: topGroup.score.toFixed(2),
        primaryFactor: bestCandidate.details?.primaryDrivingFactor || 'N/A',
        sectorContext: sectorContextInfo,
        numberContext: numberContextInfo
    };
}

export function getRecommendation(context) {
    const {
        trendStats, boardStats, neighbourScores,
        inputNum1, inputNum2,
        isForWeightUpdate = false, aiPredictionData = null,
        currentAdaptiveInfluences, lastWinningNumber,
        useProximityBoostBool, useWeightedZoneBool, useNeighbourFocusBool,
        isAiReadyBool, useTrendConfirmationBool, useAdaptivePlayBool, useLessStrictBool,
        useTableChangeWarningsBool, rollingPerformance, factorShiftStatus,
        useLowestPocketDistanceBool, 
        sectorContextProvider = null,
        numberContextProvider = null,
        current_STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES, 
        activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel,
        currentHistoryForTrend,
        useDynamicTerminalNeighbourCount,
        // NEW: For overlap penalty calculation
        recentFailedHitZones = []
    } = context;

    const currentNum1 = inputNum1;
    const currentNum2 = inputNum2;

    const contextProvider = numberContextProvider || sectorContextProvider;

    let candidates = activePredictionTypes.map(type => {
        const details = {
            baseScore: 0,
            hitRate: (boardStats[type.id]?.total > 0 ? (boardStats[type.id]?.success / boardStats[type.id]?.total * 100) : 0),
            avgTrend: parseFloat(trendStats.averages[type.id]) || 0,
            currentStreak: trendStats.currentStreaks[type.id] || 0,
            predictiveDistance: Infinity,
            proximityBoostApplied: false,
            weightedZoneBoostApplied: false,
            patternBoostApplied: false, 
            patternBoostMultiplier: 1, 
            mlProbability: (aiPredictionData && aiPredictionData.groups && aiPredictionData.groups[type.id] !== undefined) ? aiPredictionData.groups[type.id] : 0,
            mlBoostApplied: false,
            aiLowPocketBoostApplied: false, 
            finalScore: 0,
            primaryDrivingFactor: "N/A",
            adaptiveInfluenceUsed: 1.0,
            confluenceBonus: 1.0, 
            reason: [],
            individualScores: {},
            aiExplanation: null,
            sectorContext: null,
            numberContext: null,
            contextConfidenceModifier: 1.0,
            rawBaseNum: null,
            wrappedBaseNum: null,
            hitZone: null,
            // NEW: Track additional metrics
            severityBonus: 0,
            overlapPenalty: 1.0,
            relativeStreakStrength: 0.5
        };

        const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return null;
        
        const rawBaseNum = predictionTypeDefinition.calculateBase(currentNum1, currentNum2);
        const baseNum = wrapBaseNumber(rawBaseNum);
        
        details.rawBaseNum = rawBaseNum;
        details.wrappedBaseNum = baseNum;

        const terminals = terminalMapping?.[baseNum] || [];
        const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);
        details.hitZone = hitZone;

        // Get context for this group's hit zone
        if (contextProvider) {
            try {
                if (typeof contextProvider.getGroupNumberContext === 'function') {
                    const groupNumberContext = contextProvider.getGroupNumberContext(hitZone);
                    if (groupNumberContext && groupNumberContext.hasContext) {
                        details.numberContext = groupNumberContext;
                        details.contextConfidenceModifier = contextProvider.getNumberConfidenceModifier 
                            ? contextProvider.getNumberConfidenceModifier(hitZone)
                            : 1.0;
                    }
                }
            } catch (e) {
                // Ignore context errors
            }
        }

        // ===========================
        // SCORING COMPONENTS
        // ===========================

        let rawScore = 0;

        // 1. Hit Rate Score
        const rawHitRatePoints = details.hitRate >= current_STRATEGY_CONFIG.hitRateThreshold 
            ? details.hitRate * current_STRATEGY_CONFIG.hitRateMultiplier 
            : 0;
        rawScore += rawHitRatePoints;
        details.individualScores['Hit Rate'] = rawHitRatePoints;
        if (rawHitRatePoints > 0) details.reason.push('HitRate');

        // 2. IMPROVED: Streak Score with sigmoid normalization
        const streakDistribution = trendStats.streakData?.[type.id] || [];
        const relativeStrength = getRelativeStreakStrength(details.currentStreak, streakDistribution);
        details.relativeStreakStrength = relativeStrength;
        
        // Use both absolute and relative streak scoring
        const absoluteStreakPoints = Math.min(current_STRATEGY_CONFIG.maxStreakPoints, details.currentStreak * current_STRATEGY_CONFIG.streakMultiplier);
        const relativeStreakBonus = relativeStrength * current_STRATEGY_CONFIG.maxStreakPoints * 0.5;
        const rawStreakPoints = absoluteStreakPoints + relativeStreakBonus;
        
        rawScore += rawStreakPoints;
        details.individualScores['Streak'] = rawStreakPoints;
        if (details.currentStreak >= 2) details.reason.push('Streak');

        // 3. Proximity Score (IF TOGGLED)
        if (useProximityBoostBool && lastWinningNumber !== null && hitZone.length > 0) {
            let minDist = Infinity;
            hitZone.forEach(zoneNum => {
                const dist = calculatePocketDistance(zoneNum, lastWinningNumber, rouletteWheel);
                if (dist < minDist) minDist = dist;
            });
            details.predictiveDistance = minDist;
            if (minDist <= current_STRATEGY_CONFIG.proximityMaxDistance) {
                const rawProximityPoints = (current_STRATEGY_CONFIG.proximityMaxDistance - minDist) * current_STRATEGY_CONFIG.proximityMultiplier;
                rawScore += rawProximityPoints;
                details.individualScores['Proximity to Last Spin'] = rawProximityPoints;
                details.proximityBoostApplied = true;
                if (rawProximityPoints > 0) details.reason.push('Proximity');
            }
        }

        // 4. IMPROVED: Weighted Neighbour Score (IF TOGGLED)
        if (useWeightedZoneBool) {
            // Use proximity-weighted hit zone scoring
            const weightedNeighbourScore = calculateWeightedHitZoneScore(hitZone, baseNum, neighbourScores, rouletteWheel);
            const rawNeighbourPoints = Math.min(current_STRATEGY_CONFIG.maxNeighbourPoints, weightedNeighbourScore * current_STRATEGY_CONFIG.neighbourMultiplier);
            rawScore += rawNeighbourPoints;
            details.individualScores['Hot Zone Weighting'] = rawNeighbourPoints;
            details.weightedZoneBoostApplied = rawNeighbourPoints > 0;
            if (details.weightedZoneBoostApplied) details.reason.push('Neighbours');
        }

        // 5. IMPROVED: AI Confidence Score - NOW INTEGRATED INTO SCORING
        if (isAiReadyBool && details.mlProbability > 0) {
            const aiWeight = current_STRATEGY_CONFIG.aiScoreWeight || 10;
            const aiPoints = details.mlProbability * aiWeight;
            rawScore += aiPoints;
            details.individualScores['High AI Confidence'] = aiPoints;
            details.mlBoostApplied = aiPoints > (current_STRATEGY_CONFIG.minAiPointsForReason || 2);
            details.mlProbabilityDisplay = details.mlProbability;
            if (details.mlBoostApplied) details.reason.push('AI');
        }

        // 6. Conditional Probability Score
        if (currentHistoryForTrend && currentHistoryForTrend.length > 0) {
            const condProb = calculateConditionalProbability(
                currentHistoryForTrend, type.id, activePredictionTypes, allPredictionTypes,
                terminalMapping, rouletteWheel, useDynamicTerminalNeighbourCount,
                current_STRATEGY_CONFIG.minConditionalSampleSize
            );
            if (condProb.probability > 0 && condProb.sampleSize >= current_STRATEGY_CONFIG.minConditionalSampleSize) {
                const condProbPoints = condProb.probability * current_STRATEGY_CONFIG.conditionalProbMultiplier;
                rawScore += condProbPoints;
                details.individualScores['Statistical Trends'] = condProbPoints;
                if (condProbPoints > 1) details.reason.push('Stats');
            }
        }

        // 7. NEW: Severity Bonus from number context
        if (numberContextProvider) {
            const severityThreshold = current_STRATEGY_CONFIG.severityThreshold || 0.5;
            const severityMultiplier = current_STRATEGY_CONFIG.severityMultiplier || 5;
            const severityBonus = getSeverityBonus(hitZone, numberContextProvider, severityThreshold);
            if (severityBonus > 0) {
                const severityPoints = severityBonus * severityMultiplier;
                rawScore += severityPoints;
                details.severityBonus = severityPoints;
                details.individualScores['Contextual Interest'] = severityPoints;
                if (severityPoints > 1) details.reason.push('Context');
            }
        }

        // ===========================
        // ADAPTIVE INFLUENCE
        // ===========================

        let maxInfluenceApplied = 0;
        let mostInfluentialFactor = "N/A";
        for (const [factorName, points] of Object.entries(details.individualScores)) {
            const influence = currentAdaptiveInfluences[factorName] || 1.0;
            const influencedPoints = points * influence;
            if (influencedPoints > maxInfluenceApplied) {
                maxInfluenceApplied = influencedPoints;
                mostInfluentialFactor = factorName;
            }
        }
        
        // ===========================
        // FINAL SCORE CALCULATION
        // ===========================

        let finalCalculatedScore = rawScore;
        
        // Apply pocket distance boost/suppression (additive, not multiplicative)
        if (useLowestPocketDistanceBool && lastWinningNumber !== null && details.predictiveDistance !== Infinity) {
            if (details.predictiveDistance <= 1) {
                const boostPoints = current_STRATEGY_CONFIG.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER * 5;
                finalCalculatedScore += boostPoints;
                details.aiLowPocketBoostApplied = true;
                details.reason.push('PD');
            } else if (details.predictiveDistance >= 5) {
                // Slight penalty for very distant predictions
                finalCalculatedScore *= current_STRATEGY_CONFIG.HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER;
            }
        }
        
        // NEW: Apply overlap penalty
        if (recentFailedHitZones && recentFailedHitZones.length > 0) {
            const overlapPenalty = calculateOverlapPenalty(hitZone, recentFailedHitZones);
            const penaltyWeight = current_STRATEGY_CONFIG.overlapPenaltyWeight || 0.2;
            details.overlapPenalty = 1 - ((1 - overlapPenalty) * penaltyWeight);
            finalCalculatedScore *= details.overlapPenalty;
        }

        details.finalScore = finalCalculatedScore;
        details.baseScore = rawHitRatePoints + rawStreakPoints;
        details.primaryDrivingFactor = mostInfluentialFactor;
        details.adaptiveInfluenceUsed = currentAdaptiveInfluences[mostInfluentialFactor] || 1.0;

        if (aiPredictionData && aiPredictionData.aiExplanation) {
            details.aiExplanation = aiPredictionData.aiExplanation;
        }

        return {
            type: {
                id: type.id,
                label: type.label,
                displayLabel: type.displayLabel,
                colorClass: type.colorClass,
                textColor: type.textColor
            },
            score: details.finalScore,
            details
        };
    }).filter(c => c && !isNaN(c.score));

    if (candidates.length === 0) {
        return { 
            html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">Not enough data for a recommendation.</span>', 
            bestCandidate: null, 
            details: null, 
            signal: "Wait for Signal", 
            reason: "Not enough data",
            detailedExplanation: null
        };
    }

    candidates.sort((a, b) => b.score - a.score);
    let bestCandidate = candidates[0];

    if (bestCandidate.score <= 0) {
        return { 
            html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">No strong context based on current data.</span>', 
            bestCandidate: null, 
            details: null, 
            signal: "Wait for Signal", 
            reason: "No clear signal",
            detailedExplanation: null
        };
    }

    // Generate detailed explanation
    const detailedExplanation = generateDetailedExplanation(candidates, bestCandidate, {
        trendStats, boardStats, lastWinningNumber,
        currentHistoryForTrend: currentHistoryForTrend || [],
        current_STRATEGY_CONFIG,
        activePredictionTypes,
        contextProvider
    });

    // Determine Signal
    let signal = "Wait";
    let reason = bestCandidate.details.reason.join(', ') || 'General patterns';

    const finalScore = bestCandidate.score;

    // Table change warning logic
    if (useTableChangeWarningsBool && rollingPerformance?.sufficientData) {
        if (rollingPerformance.currentLossStreak >= current_STRATEGY_CONFIG.WARNING_LOSS_STREAK_THRESHOLD ||
            rollingPerformance.winRate < current_STRATEGY_CONFIG.WARNING_ROLLING_WIN_RATE_THRESHOLD) {
            signal = "Avoid Play";
            reason = `(Table Change Warning: ${rollingPerformance.currentLossStreak} recent losses, ${rollingPerformance.winRate.toFixed(0)}% win rate)`;
            
            return { 
                html: `<span class="text-red-500 font-bold">${signal}</span><br><span class="text-xs text-red-400">${reason}</span>`,
                bestCandidate, 
                details: bestCandidate.details, 
                signal, 
                reason,
                detailedExplanation
            };
        }
    }

    if (useAdaptivePlayBool) {
        const strongThreshold = useLessStrictBool ? current_STRATEGY_CONFIG.LESS_STRICT_STRONG_PLAY_THRESHOLD : current_STRATEGY_CONFIG.ADAPTIVE_STRONG_PLAY_THRESHOLD;
        const playThreshold = useLessStrictBool ? current_STRATEGY_CONFIG.LESS_STRICT_PLAY_THRESHOLD : current_STRATEGY_CONFIG.ADAPTIVE_PLAY_THRESHOLD;

        if (finalScore >= strongThreshold) {
            signal = "Strong Play";
        } else if (finalScore >= playThreshold) {
            signal = "Play";
        } else {
            signal = "Wait";
        }

        if (useLessStrictBool && signal === "Wait") {
            if (bestCandidate.details.hitRate >= current_STRATEGY_CONFIG.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD && 
                bestCandidate.details.currentStreak >= current_STRATEGY_CONFIG.LESS_STRICT_MIN_STREAK) {
                signal = "Strong Play";
            }
        }
    } else {
        signal = finalScore >= current_STRATEGY_CONFIG.SIMPLE_PLAY_THRESHOLD ? "Play" : "Wait";
    }

    if (useTrendConfirmationBool && signal !== "Wait" && signal !== "Avoid Play") {
        const lastSuccessState = trendStats.lastSuccessState || [];
        if (lastSuccessState.length > 0 && !lastSuccessState.includes(bestCandidate.type.id)) {
            signal = "Wait";
            reason = "Trend not confirmed";
        }
    }

    const colorClass = signal === "Strong Play" ? "text-green-600 font-bold" :
                       signal === "Play" ? "text-green-500" :
                       signal === "Avoid Play" ? "text-red-500 font-bold" :
                       "text-yellow-600";

    const wrappedGroupName = wrapGroupName(bestCandidate.type.displayLabel, bestCandidate.type.id);
    const html = `<span class="${colorClass}">${signal}: ${wrappedGroupName}</span><br><span class="text-xs">${reason} | Score: ${finalScore.toFixed(1)}</span>`;

    return { 
        html, 
        bestCandidate, 
        details: bestCandidate.details, 
        signal, 
        reason,
        detailedExplanation,
        allCandidates: candidates
    };
}