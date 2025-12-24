// shared-logic.js

// This file contains core calculation logic shared between the main app (index.html)
// and the optimization web worker (optimizationWorker.js).

/**
 * NOTE: These functions are designed to be "pure" where possible.
 * They do not access global variables from index.html directly. Instead, they
 * receive all necessary data (like the rouletteWheel, terminalMapping, configs)
 * as parameters. This makes them predictable and testable.
 */

/**
 * FIX: Helper function to wrap base numbers to valid roulette range (0-36)
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
    // FIX: Wrap base number instead of returning empty array
    const wrappedBaseNumber = wrapBaseNumber(baseNumber);
    if (wrappedBaseNumber < 0 || wrappedBaseNumber > 36) return [];
    
    const hitZone = new Set([wrappedBaseNumber]);
    
    // Get terminals for the wrapped base number
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

/**
 * FIX: Updated to wrap base numbers > 36 instead of marking as failure
 */
export function evaluateCalculationStatus(historyItem, winningNumber, useDynamicTerminalNeighbourCountBool, activePredictionTypes, terminalMapping, rouletteWheel) {
    historyItem.winningNumber = winningNumber;
    historyItem.hitTypes = [];
    historyItem.typeSuccessStatus = {};
    let minPocketDistance = Infinity;

    activePredictionTypes.forEach(type => {
        const rawBaseNum = type.calculateBase(historyItem.num1, historyItem.num2);
        // FIX: Wrap base number instead of skipping
        const baseNum = wrapBaseNumber(rawBaseNum);
        
        // Store wrapped info on the history item for debugging/display
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

/**
 * FIX: Updated to wrap base numbers > 36 instead of skipping
 */
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
            // FIX: Wrap base number instead of skipping
            const baseNum = wrapBaseNumber(rawBaseNum);

            // Always count this type since we now handle all base numbers
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

/**
 * FIX: Updated to wrap base numbers > 36 instead of skipping
 */
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
            // FIX: Wrap base number - always count this type
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

/**
 * FIX: Updated to wrap base numbers > 36 instead of skipping
 */
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
            // FIX: Wrap base number instead of skipping
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

/**
 * Analyzes conditional probability: when previous result was closest to group X, how often does group Y hit next?
 * This provides situational context, not prediction certainty.
 * FIX: Updated to wrap base numbers > 36 instead of skipping
 */
export function calculateConditionalProbability(history, groupId, activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel, useDynamicTerminalNeighbourCount, minSampleSize) {
    const validHistory = history.filter(item => item.winningNumber !== null && item.status !== 'pending');
    
    if (validHistory.length < 2) {
        return { probability: 0, sampleSize: 0 };
    }

    let relevantOccurrences = 0;
    let groupHitCount = 0;

    // Iterate through history to find when previous spin was closest to this group
    for (let i = 1; i < validHistory.length; i++) {
        const previousItem = validHistory[i - 1];
        const currentItem = validHistory[i];
        
        // Find which group the previous spin was closest to
        let closestGroupId = null;
        let closestDistance = Infinity;
        
        activePredictionTypes.forEach(type => {
            const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
            if (!predictionTypeDefinition) return;
            
            const rawBaseNum = predictionTypeDefinition.calculateBase(previousItem.num1, previousItem.num2);
            // FIX: Wrap base number instead of skipping
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
        
        // If previous was closest to our group, check if current hit our group
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

/**
 * Calculates rolling performance for table change warnings
 */
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

/**
 * Analyzes if the primary driving factors have been shifting
 */
export function analyzeFactorShift(history, windowSize, diversityThreshold, minDominancePercent) {
    const recentSuccessfulItems = history
        .filter(item => item.status === 'success' && item.recommendationDetails?.primaryDrivingFactor)
        .sort((a, b) => b.id - a.id)
        .slice(0, windowSize);
    
    if (recentSuccessfulItems.length < 3) {
        return { sufficientData: false, isShifting: false, dominantFactor: null, factorDistribution: {} };
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
    
    const isShifting = diversityRatio >= diversityThreshold || dominancePercent < minDominancePercent;
    
    return {
        sufficientData: true,
        isShifting,
        dominantFactor,
        factorDistribution: factorCounts,
        diversityRatio,
        dominancePercent
    };
}

/**
 * Wraps a group name in a colored span element for visual distinction
 */
function wrapGroupName(groupName, groupId) {
    if (!groupId || !groupName) return groupName;
    const colorClass = `group-name-${groupId}`;
    return `<span class="${colorClass}">${groupName}</span>`;
}

/**
 * Generates a detailed, deterministic explanation for a recommendation
 * This is used when AI explanations are not available or to supplement them
 * NOW INCLUDES NUMBER AND SECTOR CONTEXT when available
 */
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

    // Sort candidates by score to find runner-up
    const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
    const topGroup = sortedCandidates[0];
    const runnerUpGroup = sortedCandidates[1] || { type: { displayLabel: 'None' }, score: 0 };
    const scoreGap = topGroup.score - runnerUpGroup.score;

    // Calculate recent performance for chosen group
    const recentWindow = Math.min(10, currentHistoryForTrend.length);
    const recentHistory = currentHistoryForTrend
        .filter(item => item.winningNumber !== null && item.status !== 'pending')
        .slice(-recentWindow);
    
    let hits = 0;
    let total = 0;
    let currentStreak = bestCandidate.details.currentStreak || 0;
    
    for (const item of recentHistory) {
        if (item.typeSuccessStatus && item.typeSuccessStatus[bestCandidate.type.id] !== undefined) {
            total++;
            if (item.typeSuccessStatus[bestCandidate.type.id]) {
                hits++;
            }
        }
    }
    
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    // Determine confidence based on score gap and sample size
    let confidence = 'low';
    const scoreGapPercent = runnerUpGroup.score > 0 ? ((scoreGap / runnerUpGroup.score) * 100) : (topGroup.score > 0 ? 100 : 0);
    
    if (scoreGapPercent >= 50 && total >= 5 && hitRate >= 50) {
        confidence = 'high';
    } else if (scoreGapPercent >= 25 && total >= 3) {
        confidence = 'medium';
    }

    // Generate headline
    const wrappedGroupName = wrapGroupName(bestCandidate.type.displayLabel, bestCandidate.type.id);
    let headline = `${wrappedGroupName} leads with ${topGroup.score.toFixed(1)} points`;
    
    if (currentStreak >= 2) {
        headline = `${wrappedGroupName} on ${currentStreak}-win streak`;
    } else if (hitRate >= 60 && total >= 3) {
        headline = `${wrappedGroupName} at ${hitRate.toFixed(0)}% recent hit rate`;
    }

    // Generate bullets explaining WHY this group was chosen
    const bullets = [];
    
    // Primary factor bullet
    const primaryFactor = bestCandidate.details.primaryDrivingFactor;
    if (primaryFactor && primaryFactor !== 'N/A') {
        const factorScore = bestCandidate.details.individualScores[primaryFactor] || 0;
        bullets.push(`Primary driver: ${primaryFactor} (+${factorScore.toFixed(1)} pts)`);
    }
    
    // Score comparison bullet
    if (runnerUpGroup.score > 0) {
        const wrappedRunnerUp = wrapGroupName(runnerUpGroup.type.displayLabel, runnerUpGroup.type.id);
        bullets.push(`Leads ${wrappedRunnerUp} by ${scoreGap.toFixed(1)} points`);
    }
    
    // Streak bullet
    if (currentStreak >= 2) {
        bullets.push(`Currently on a ${currentStreak}-win streak`);
    }
    
    // Recent performance bullet
    if (total >= 3) {
        bullets.push(`Recent: ${hits}/${total} hits (${hitRate.toFixed(0)}%)`);
    }

    // Get context info for display (number-level preferred over sector-level)
    let sectorContextInfo = null;
    let numberContextInfo = null;
    
    // Try number-level context first (more granular)
    if (bestCandidate.details.numberContext && bestCandidate.details.numberContext.hasContext) {
        const numCtx = bestCandidate.details.numberContext;
        numberContextInfo = {
            aggregateSeverity: numCtx.aggregateSeverity,
            avgLossStreak: numCtx.avgLossStreak,
            elevatedNumbers: numCtx.elevatedNumbers?.length || 0,
            hasApiData: numCtx.hasApiData,
            contextDescription: numCtx.contextDescription,
            isReferenceOnly: true  // Mark as reference only
        };
        
        // Add bullet about number context (reference only, not prediction)
        if (numCtx.elevatedNumbers && numCtx.elevatedNumbers.length > 0) {
            const elevatedCount = numCtx.elevatedNumbers.length;
            bullets.push(`[Ref] ${elevatedCount} number(s) in hit zone have extended non-appearance`);
        }
    }
    
    // Fall back to sector context if no number context
    const sectorCtx = bestCandidate.details.sectorContext;
    if (!numberContextInfo && sectorCtx && sectorCtx.hasContext) {
        sectorContextInfo = {
            dominantSector: sectorCtx.dominantSector?.name || null,
            dominantSectorLevel: sectorCtx.dominantSector?.severity?.level || 'normal',
            aggregateSeverity: sectorCtx.aggregateSeverity,
            hasApiData: sectorCtx.hasApiData,
            isReferenceOnly: true  // Mark as reference only
        };
        
        // Only add sector bullet if we did not already add number context info
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
        primaryFactor: bestCandidate.details.primaryDrivingFactor || 'N/A',
        sectorContext: sectorContextInfo,
        numberContext: numberContextInfo
    };
}

/**
 * FIX: Updated getRecommendation to wrap base numbers > 36 instead of returning null
 */
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
        useDynamicTerminalNeighbourCount
    } = context;

    const currentNum1 = inputNum1;
    const currentNum2 = inputNum2;

    // Determine which context provider to use
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
            wrappedBaseNum: null
        };

        const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return null;
        
        const rawBaseNum = predictionTypeDefinition.calculateBase(currentNum1, currentNum2);
        // FIX: Wrap base number instead of returning null
        const baseNum = wrapBaseNumber(rawBaseNum);
        
        // Store for debugging/display
        details.rawBaseNum = rawBaseNum;
        details.wrappedBaseNum = baseNum;

        const terminals = terminalMapping?.[baseNum] || [];
        const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);

        // --- Calculate context for this group's hit zone ---
        if (contextProvider) {
            try {
                // Get number-level context if available
                if (typeof contextProvider.getGroupNumberContext === 'function') {
                    const groupNumberContext = contextProvider.getGroupNumberContext(hitZone);
                    if (groupNumberContext && groupNumberContext.hasContext) {
                        details.numberContext = groupNumberContext;
                        details.contextConfidenceModifier = contextProvider.getNumberConfidenceModifier 
                            ? contextProvider.getNumberConfidenceModifier(groupNumberContext)
                            : 1.0;
                    }
                }
                
                // Also get sector context for additional info
                if (typeof contextProvider.getGroupSectorContext === 'function') {
                    const groupSectorContext = contextProvider.getGroupSectorContext(hitZone);
                    if (groupSectorContext && groupSectorContext.hasContext) {
                        details.sectorContext = groupSectorContext;
                        
                        // If we did not get number context, use sector context modifier
                        if (!details.numberContext) {
                            details.contextConfidenceModifier = contextProvider.getSectorConfidenceModifier 
                                ? contextProvider.getSectorConfidenceModifier(groupSectorContext)
                                : 1.0;
                        }
                    }
                }
            } catch (error) {
                console.warn('Error getting context for group:', type.id, error);
            }
        }

        // --- Calculate Raw Score Components ---
        let rawScore = 0;

        // 1. Base Score from Hit Rate
        const rawHitRatePoints = Math.max(0, details.hitRate - current_STRATEGY_CONFIG.hitRateThreshold) * current_STRATEGY_CONFIG.hitRateMultiplier;
        rawScore += rawHitRatePoints;
        details.individualScores['Hit Rate'] = rawHitRatePoints;
        if (rawHitRatePoints > 1) details.reason.push(`Hit Rate`);

        // 2. Momentum Score from Current Streak
        const rawStreakPoints = Math.min(current_STRATEGY_CONFIG.maxStreakPoints, details.currentStreak * current_STRATEGY_CONFIG.streakMultiplier);
        rawScore += rawStreakPoints;
        details.individualScores['Streak'] = rawStreakPoints;
        if (rawStreakPoints > 0) details.reason.push(`Streak`);

        // 3. Proximity Score (IF TOGGLED)
        if (useProximityBoostBool && lastWinningNumber !== null) {
            for (const zoneNum of hitZone) {
                const dist = calculatePocketDistance(zoneNum, lastWinningNumber, rouletteWheel);
                if (dist < details.predictiveDistance) details.predictiveDistance = dist;
            }
            details.proximityBoostApplied = details.predictiveDistance <= current_STRATEGY_CONFIG.proximityMaxDistance;
            if (details.proximityBoostApplied) {
                const rawProximityPoints = (current_STRATEGY_CONFIG.proximityMaxDistance - details.predictiveDistance) * current_STRATEGY_CONFIG.proximityMultiplier;
                rawScore += rawProximityPoints;
                details.individualScores['Proximity to Last Spin'] = rawProximityPoints;
                details.reason.push(`Proximity`);
            }
        }

        // 4. Neighbour Score (IF TOGGLED)
        if (useWeightedZoneBool) {
            const neighbourWeightedScore = hitZone.reduce((sum, num) => sum + (neighbourScores[num]?.success || 0), 0);
            const rawNeighbourPoints = Math.min(current_STRATEGY_CONFIG.maxNeighbourPoints, neighbourWeightedScore * current_STRATEGY_CONFIG.neighbourMultiplier);
            rawScore += rawNeighbourPoints;
            details.individualScores['Hot Zone Weighting'] = rawNeighbourPoints;
            details.weightedZoneBoostApplied = rawNeighbourPoints > 0;
            if (details.weightedZoneBoostApplied) details.reason.push(`Neighbours`);
        }

        // 5. AI Confidence Score - DISPLAY ONLY, does NOT add to score
        if (isAiReadyBool && details.mlProbability > 0) {
            details.individualScores['High AI Confidence'] = 0;
            details.mlBoostApplied = false;
            details.mlProbabilityDisplay = details.mlProbability;
        }

        // 6. Conditional Probability Score (from API data)
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

        // --- Adaptive Influence ---
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
        
        // --- Final Score Calculation ---
        let finalCalculatedScore = rawScore;
        
        // Apply lowest pocket distance boost/suppression
        if (useLowestPocketDistanceBool && lastWinningNumber !== null && details.predictiveDistance !== Infinity) {
            if (details.predictiveDistance <= 1) {
                finalCalculatedScore *= current_STRATEGY_CONFIG.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER;
                details.aiLowPocketBoostApplied = true;
                details.reason.push('PD');
            }
        }
        
        // Context confidence modifier - DISPLAY ONLY, does NOT adjust score
        if (details.contextConfidenceModifier < 1.0) {
            details.contextStressDisplay = details.contextConfidenceModifier;
        }

        details.finalScore = finalCalculatedScore;
        details.baseScore = rawHitRatePoints + rawStreakPoints;
        details.primaryDrivingFactor = mostInfluentialFactor;
        details.adaptiveInfluenceUsed = currentAdaptiveInfluences[mostInfluentialFactor] || 1.0;

        // Store AI explanation if available
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

    // Handle scenario where best candidate has very low or zero score
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

    // --- Determine Signal based on Adaptive Play ---
    let signal = "Wait";
    let reason = bestCandidate.details.reason.join(', ') || 'General patterns';
    let scoreLevel = '';

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
            scoreLevel = '(High Confidence)';
        } else if (finalScore >= playThreshold) {
            signal = "Play";
            scoreLevel = '(Moderate Confidence)';
        } else {
            signal = "Wait";
            scoreLevel = '(Building confidence...)';
        }
    } else {
        // Simple fallback if Adaptive Play is OFF
        if (finalScore >= current_STRATEGY_CONFIG.SIMPLE_PLAY_THRESHOLD) {
            signal = "Play";
        } else {
            signal = "Wait";
        }
    }

    // Trend confirmation override
    if (useTrendConfirmationBool && signal !== "Wait") {
        const lastSuccessState = trendStats.lastSuccessState;
        if (lastSuccessState && lastSuccessState.length > 0 && !lastSuccessState.includes(bestCandidate.type.id)) {
            const recentConfirmedCount = currentHistoryForTrend.filter(item => item.winningNumber !== null && item.status !== 'pending').length;
            if (recentConfirmedCount >= current_STRATEGY_CONFIG.MIN_TREND_HISTORY_FOR_CONFIRMATION) {
                signal = "Wait";
                reason = `Waiting for trend confirmation (last success: ${lastSuccessState.join(', ')})`;
            }
        }
    }

    const wrappedDisplayLabel = wrapGroupName(bestCandidate.type.displayLabel, bestCandidate.type.id);

    let signalColorClass = 'text-gray-500';
    if (signal === 'Strong Play') signalColorClass = 'text-green-500';
    else if (signal === 'Play') signalColorClass = 'text-blue-500';
    else if (signal === 'Avoid Play') signalColorClass = 'text-red-500';
    else if (signal === 'Wait') signalColorClass = 'text-yellow-500';

    const html = `<span class="font-bold ${signalColorClass}">${signal}</span> ${scoreLevel}<br><span class="font-bold text-lg">${wrappedDisplayLabel}</span><br><span class="text-xs text-gray-500">${reason}</span>`;

    return { html, bestCandidate, details: bestCandidate.details, signal, reason, detailedExplanation };
}