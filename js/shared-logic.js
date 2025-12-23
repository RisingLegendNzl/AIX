// shared-logic.js

// This file contains core calculation logic shared between the main app (index.html)
// and the optimization web worker (optimizationWorker.js).

/**
 * NOTE: These functions are designed to be "pure" where possible.
 * They do not access global variables from index.html directly. Instead, they
 * receive all necessary data (like the rouletteWheel, terminalMapping, configs)
 * as parameters. This makes them predictable and testable.
 */

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
    if (baseNumber < 0 || baseNumber > 36) return [];
    const hitZone = new Set([baseNumber]);
    const numTerminals = terminals ? terminals.length : 0;

    let baseNeighbourCount = (numTerminals === 1) ? 3 : (numTerminals >= 2) ? 1 : 0;
    if (baseNeighbourCount > 0) getNeighbours(baseNumber, baseNeighbourCount, rouletteWheel).forEach(n => hitZone.add(n));

    let terminalNeighbourCount;
    if (useDynamicTerminalNeighbourCountBool && winningNumber !== null) {
        if (baseNumber === winningNumber || (terminals && terminals.includes(winningNumber))) {
            terminalNeighbourCount = 0;
        } else {
            terminalNeighbourCount = (numTerminals === 1 || numTerminals === 2) ? 3 : (numTerminals > 2) ? 1 : 0;
        }
    } else {
        terminalNeighbourCount = (numTerminals === 1 || numTerminals === 2) ? 3 : (numTerminals > 2) ? 1 : 0;
    }

    if (terminals && terminals.length > 0) {
        terminals.forEach(t => {
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
        const baseNum = type.calculateBase(historyItem.num1, historyItem.num2);
        if (baseNum < 0 || baseNum > 36) {
            historyItem.typeSuccessStatus[type.id] = false;
            return;
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
            const baseNum = predictionTypeDefinition.calculateBase(item.num1, item.num2);

            if (baseNum >= 0 && baseNum <= 36) {
                 totalOccurrences[type.id] += weight;
            }

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
            const baseNum = predictionTypeDefinition.calculateBase(item.num1, item.num2);

            if (baseNum >= 0 && baseNum <= 36) {
                stats[type.id].total += weight;
            }
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

            const baseNum = type.calculateBase(item.num1, item.num2);
            if (baseNum < 0 || baseNum > 36) return;

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
            
            const baseNum = predictionTypeDefinition.calculateBase(previousItem.num1, previousItem.num2);
            if (baseNum < 0 || baseNum > 36) return;
            
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
    
    if (scoreGapPercent >= 30 && total >= 5 && hitRate >= 40) {
        confidence = 'high';
    } else if (scoreGapPercent >= 15 && total >= 3 && hitRate >= 30) {
        confidence = 'medium';
    }

    // Generate headline
    const wrappedGroupName = wrapGroupName(topGroup.type.displayLabel, topGroup.type.id);
    let headline;
    if (currentStreak >= 3) {
        headline = `${wrappedGroupName} on ${currentStreak}-spin streak`;
    } else if (hitRate >= 60 && total >= 5) {
        headline = `${wrappedGroupName} hitting strong (${hitRate.toFixed(0)}%)`;
    } else if (scoreGapPercent >= 50) {
        headline = `${wrappedGroupName} leads with clear margin`;
    } else {
        headline = `${wrappedGroupName} recommended`;
    }

    // Generate contextual bullets
    const bullets = [];
    
    if (currentStreak >= 2) {
        bullets.push(`Currently on ${currentStreak}-spin winning streak`);
    }
    
    if (total >= 3) {
        bullets.push(`Recent hit rate: ${hitRate.toFixed(0)}% (${hits}/${total} spins)`);
    }

    const primaryFactor = bestCandidate.details.primaryDrivingFactor;
    if (primaryFactor && primaryFactor !== 'N/A') {
        const factorScore = bestCandidate.details.individualScores?.[primaryFactor] || 0;
        
        if (factorScore > 0) {
            bullets.push(`Primary driver: ${primaryFactor} (${factorScore.toFixed(1)} pts)`);
        } else {
            bullets.push(`Primary factor: ${primaryFactor}`);
        }
    }

    // Add number context info if available
    let numberContextInfo = null;
    if (bestCandidate.details.numberContext && bestCandidate.details.numberContext.hasContext) {
        const numCtx = bestCandidate.details.numberContext;
        numberContextInfo = {
            description: numCtx.contextDescription,
            avgLossStreak: numCtx.avgLossStreak,
            elevatedCount: numCtx.elevatedNumbers?.length || 0,
            hasApiData: numCtx.hasApiData
        };
        
        if (numCtx.elevatedNumbers && numCtx.elevatedNumbers.length > 0) {
            const elevatedList = numCtx.elevatedNumbers.slice(0, 3).map(e => e.number).join(', ');
            bullets.push(`Extended numbers in zone: ${elevatedList}`);
        }
    }

    // Add sector context info if available (fallback if no number context)
    let sectorContextInfo = null;
    if (bestCandidate.details.sectorContext && bestCandidate.details.sectorContext.hasContext) {
        const sectorCtx = bestCandidate.details.sectorContext;
        sectorContextInfo = {
            dominantSector: sectorCtx.dominantSector?.name || null,
            dominantSectorLevel: sectorCtx.dominantSector?.severity?.level || 'normal',
            aggregateSeverity: sectorCtx.aggregateSeverity,
            hasApiData: sectorCtx.hasApiData
        };
        
        // Only add sector bullet if we did not already add number context info
        if (!numberContextInfo && sectorCtx.dominantSector) {
            const severity = sectorCtx.dominantSector.severity;
            if (severity && severity.level !== 'normal') {
                bullets.push(`Sector note: ${severity.description}`);
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
        sectorContextProvider = null, // Optional sector context provider
        numberContextProvider = null, // Optional number context provider (usually same as sector)
        current_STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES, 
        activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel,
        currentHistoryForTrend,
        useDynamicTerminalNeighbourCount
    } = context;

    const currentNum1 = inputNum1;
    const currentNum2 = inputNum2;

    // Determine which context provider to use
    // The apiContext manager now provides both sector and number context
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
            contextConfidenceModifier: 1.0
        };

        const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return null;
        const baseNum = predictionTypeDefinition.calculateBase(currentNum1, currentNum2);
        if (baseNum < 0 || baseNum > 36) return null;

        const terminals = terminalMapping?.[baseNum] || [];
        const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);

        // --- Calculate context for this group's hit zone ---
        // Try number-level context first (more granular), then fall back to sector context
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

        // 5. AI Confidence Score
        if (isAiReadyBool && details.mlProbability > 0) {
            const rawAiPoints = details.mlProbability * current_STRATEGY_CONFIG.aiConfidenceMultiplier;
            rawScore += rawAiPoints;
            details.individualScores['High AI Confidence'] = rawAiPoints;
            details.mlBoostApplied = rawAiPoints > 0;
            if (rawAiPoints > current_STRATEGY_CONFIG.minAiPointsForReason) details.reason.push(`AI Conf`);
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
        
        // Apply context confidence modifier (number-level or sector-level)
        // This is a REDUCTION for high-stress environments, not a boost
        if (details.contextConfidenceModifier < 1.0) {
            finalCalculatedScore *= details.contextConfidenceModifier;
            
            // Add to reason if significant
            if (details.contextConfidenceModifier < 0.95) {
                details.reason.push('Context stress');
            }
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
            scoreLevel = 'high';
        } else if (finalScore >= playThreshold) {
            signal = "Play";
            scoreLevel = 'medium';
        } else {
            signal = "Wait";
            scoreLevel = 'low';
        }

        // Less strict mode alternative conditions
        if (useLessStrictBool && signal === "Wait") {
            if (bestCandidate.details.hitRate >= current_STRATEGY_CONFIG.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD ||
                bestCandidate.details.currentStreak >= current_STRATEGY_CONFIG.LESS_STRICT_MIN_STREAK) {
                signal = "Strong Play";
                scoreLevel = 'high';
                reason += ' (Less Strict)';
            }
        }

        // Trend confirmation check
        if (useTrendConfirmationBool && signal !== "Wait") {
            const lastSuccessState = trendStats.lastSuccessState || [];
            if (lastSuccessState.length > 0 && !lastSuccessState.includes(bestCandidate.type.id)) {
                signal = "Wait";
                scoreLevel = 'low';
                reason = 'Awaiting trend confirmation';
            }
        }
    } else {
        // Simple mode
        if (finalScore >= current_STRATEGY_CONFIG.SIMPLE_PLAY_THRESHOLD) {
            signal = "Play";
            scoreLevel = 'medium';
        } else {
            signal = "Wait";
            scoreLevel = 'low';
        }
    }

    // Generate HTML output
    const colorClass = signal === "Strong Play" ? 'text-green-500' : 
                       signal === "Play" ? 'text-blue-500' : 
                       signal === "Wait" ? 'text-gray-500' : 'text-red-500';
    
    const groupLabel = bestCandidate.type.displayLabel;
    
    let htmlOutput = `<span class="${colorClass} font-bold">${signal}: ${groupLabel}</span>`;
    htmlOutput += `<br><span class="text-xs">${reason}</span>`;
    
    if (bestCandidate.details.currentStreak >= 2) {
        htmlOutput += `<br><span class="text-xs text-green-600">On ${bestCandidate.details.currentStreak}-spin streak</span>`;
    }

    return { 
        html: htmlOutput, 
        bestCandidate, 
        details: bestCandidate.details, 
        signal, 
        reason,
        detailedExplanation
    };
}

/**
 * Returns an empty pattern match result
 * Used when pattern matching is disabled or no patterns found
 */
export function noPatternMatch() {
    return { matchedPattern: null, confidence: 0, reason: '' };
}