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

// Re-defining analyzeFactorShift here for export from shared-logic
// This function exists in analysis.js but is not exported from shared-logic.
// So, we need to ensure it's either imported from analysis.js directly into optimizationWorker.js,
// or exported from here if it's meant to be a shared utility.
// Given the current import structure (optimizationWorker imports * as shared), it needs to be exported from here.
export function analyzeFactorShift(history, strategyConfig) { // FIXED: Exported analyzeFactorShift
    let factorShiftDetected = false;
    let reason = '';

    const relevantSuccessfulPlays = [...history]
        .filter(item => item.status === 'success' && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.primaryDrivingFactor !== "N/A")
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE); // Get only the recent successful plays

    if (relevantSuccessfulPlays.length < strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE) {
        return { factorShiftDetected: false, reason: 'Not enough successful plays to detect factor shift.' };
    }

    const factorCounts = {};
    relevantSuccessfulPlays.forEach(item => {
        const factor = item.recommendationDetails.primaryDrivingFactor;
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
    });

    const totalFactorsConsidered = relevantSuccessfulPlays.length;
    let dominantFactor = null;
    let dominantFactorPercentage = 0;
    let diversityScore = 0; // Higher diversity means more spread out factors

    Object.keys(factorCounts).forEach(factor => {
        const percentage = (factorCounts[factor] / totalFactorsConsidered) * 100;
        if (percentage > dominantFactorPercentage) {
            dominantFactorPercentage = percentage;
            dominantFactor = factor;
        }
        diversityScore += Math.pow(factorCounts[factor] / totalFactorsConsidered, 2);
    });

    if (dominantFactorPercentage < strategyConfig.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT) {
        factorShiftDetected = true;
        reason = `No single dominant primary factor (${dominantFactorPercentage.toFixed(1)}%) in recent successful plays.`;
    }

    if (!factorShiftDetected && diversityScore < (1 - strategyConfig.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD)) {
        factorShiftDetected = true;
        reason = `High diversity of primary factors in recent successful plays.`;
    }
    
    return { factorShiftDetected, reason: factorShiftDetected ? reason : '' };
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
        current_STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES, 
        activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel,
        currentHistoryForTrend 
    } = context;

    const currentNum1 = inputNum1;
    const currentNum2 = inputNum2;

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
            individualScores: {}
        };

        const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return null;
        const baseNum = predictionTypeDefinition.calculateBase(currentNum1, currentNum2);
        if (baseNum < 0 || baseNum > 36) return null;

        const terminals = terminalMapping?.[baseNum] || [];
        const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, context.useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);

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

        // --- APPLY ADAPTIVE INFLUENCES ---
        let finalCalculatedScore = 0;
        let mostInfluentialFactor = "N/A";
        let highestInfluencedScore = -Infinity; // Initialize with negative infinity

        for (const factorName in currentAdaptiveInfluences) {
            const influence = currentAdaptiveInfluences[factorName];
            let factorScore = details.individualScores[factorName] || 0;

            const influencedScore = factorScore * influence;
            finalCalculatedScore += influencedScore;

            if (influencedScore > highestInfluencedScore) {
                highestInfluencedScore = influencedScore;
                mostInfluentialFactor = factorName;
            }
        }

        if (mostInfluentialFactor === "N/A" && details.reason.length > 0) {
            mostInfluentialFactor = details.reason[0];
        } else if (mostInfluentialFactor === "N/A") {
            mostInfluentialFactor = "Statistical Trends"; // Default if no specific factor dominated
        }

        details.finalScore = finalCalculatedScore;
        details.baseScore = rawHitRatePoints + rawStreakPoints; // Re-calculate baseScore with actual points
        details.primaryDrivingFactor = mostInfluentialFactor;
        details.adaptiveInfluenceUsed = currentAdaptiveInfluences[mostInfluentialFactor] || 1.0;

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
        // Returned object now includes 'signal' and 'reason' for history logging
        return { html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">Not enough data for a recommendation.</span>', bestCandidate: null, details: null, signal: "Wait for Signal", reason: "Not enough data" };
    }

    candidates.sort((a, b) => b.score - a.score);
    let bestCandidate = candidates[0];

    // Handle scenario where best candidate has very low or zero score
    if (bestCandidate.score <= 0) {
        // Returned object now includes 'signal' and 'reason' for history logging
        return { html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">No strong recommendations based on current data.</span>', bestCandidate: null, details: null, signal: "Wait for Signal", reason: "No strong recommendations" };
    }

    if (isForWeightUpdate) {
        return { bestCandidate };
    }

    let signal = "Wait";
    let signalColor = "text-gray-500";
    let reason = "(Low Confidence)"; // Default reason for 'Wait'

    const effectiveStrategyConfig = current_STRATEGY_CONFIG;

    // --- REFINED PLAY SIGNAL LOGIC ---
    if (useAdaptivePlayBool) {
        if (useLessStrictBool) {
            // Less Strict Mode: Lower thresholds or special conditions for high confidence
            if (bestCandidate.score >= effectiveStrategyConfig.LESS_STRICT_STRONG_PLAY_THRESHOLD ||
                (bestCandidate.details.hitRate >= effectiveStrategyConfig.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD && bestCandidate.details.currentStreak >= effectiveStrategyConfig.LESS_STRICT_MIN_STREAK)) {
                signal = "Strong Play";
                signalColor = "text-green-600";
                reason = `(High Confidence: ${bestCandidate.details?.primaryDrivingFactor || 'Unknown'})`;
            } else if (bestCandidate.score >= effectiveStrategyConfig.LESS_STRICT_PLAY_THRESHOLD) {
                signal = "Play";
                signalColor = "text-purple-700";
                reason = `(Moderate Confidence: ${bestCandidate.details?.primaryDrivingFactor || 'Unknown'})`;
            } else {
                signal = "Wait for Signal";
                signalColor = "text-gray-500";
                reason = `(Low Confidence)`;
            }
        } else {
            // Standard Adaptive Play Logic
            if (bestCandidate.score >= effectiveStrategyConfig.ADAPTIVE_STRONG_PLAY_THRESHOLD) {
                signal = "Strong Play";
                signalColor = "text-green-600";
                reason = `(High Confidence: ${bestCandidate.details?.primaryDrivingFactor || 'Unknown'})`;
            } else if (bestCandidate.score >= effectiveStrategyConfig.ADAPTIVE_PLAY_THRESHOLD) {
                signal = "Play";
                signalColor = "text-purple-700";
                reason = `(Moderate Confidence: ${bestCandidate.details?.primaryDrivingFactor || 'Unknown'})`;
            } else {
                signal = "Wait for Signal";
                signalColor = "text-gray-500";
                reason = `(Low Confidence)`;
            }
        }
    } else {
        // Fallback to simpler logic if Adaptive Play is off (similar to original, but uses new scores)
        if (bestCandidate.score > effectiveStrategyConfig.SIMPLE_PLAY_THRESHOLD) {
            signal = "Play";
            signalColor = "text-purple-700";
            reason = `(${bestCandidate.details?.primaryDrivingFactor || 'Unknown Reason'})`;
        } else {
            signal = "Wait for Signal";
            signalColor = "text-gray-500";
            reason = `(Low Confidence)`;
        }
    }

    // --- Trend Confirmation Override (IF TOGGLED AND APPLICABLE) ---
    // This override always happens AFTER adaptive play signals have been determined.
    if (useTrendConfirmationBool) {
        const successfulPlaysInHistory = currentHistoryForTrend.filter(item => item.status === 'success' && item.winningNumber !== null && item.recommendedGroupId && item.recommendationDetails && item.recommendationDetails.finalScore > 0).length;
        
        // If there's an established trend (at least one previous successful play based on an actual "Play" signal)
        // AND the best candidate's group does NOT match the last successful state
        if (successfulPlaysInHistory > 0 && trendStats.lastSuccessState.length > 0 && !trendStats.lastSuccessState.includes(bestCandidate.type.id)) {
            signal = 'Wait for Signal';
            signalColor = "text-gray-500";
            reason = `(Waiting for ${bestCandidate.type.label} trend confirmation)`;
        } else if (successfulPlaysInHistory > 0 && trendStats.lastSuccessState.length === 0) {
            // If there are successful plays but no lastSuccessState (e.g., initial plays after clear history), still wait for trend to establish
            signal = 'Wait for Signal';
            signalColor = "text-gray-500";
            reason = `(No established trend to confirm)`;
        } else if (successfulPlaysInHistory < effectiveStrategyConfig.MIN_TREND_HISTORY_FOR_CONFIRMATION) {
             signal = 'Wait for Signal';
             signalColor = "text-gray-500";
             reason = `(Not enough trend history)`;
        }
    }

    // --- TABLE CHANGE WARNING OVERRIDE (IF TOGGLED AND APPLICABLE) ---
    // This is the highest priority override. If a warning is active, it advises to avoid.
    if (useTableChangeWarningsBool && rollingPerformance && rollingPerformance.totalPlaysInWindow >= effectiveStrategyConfig.WARNING_MIN_PLAYS_FOR_EVAL) {
        let tableChangeDetected = false;
        let warningReason = '';

        // Check for consecutive losses
        if (rollingPerformance.consecutiveLosses >= effectiveStrategyConfig.WARNING_LOSS_STREAK_THRESHOLD) {
            tableChangeDetected = true;
            warningReason = `Consecutive Losses: ${rollingPerformance.consecutiveLosses}`;
        }
        
        // Check for low rolling win rate (only if not already warned by consecutive losses)
        if (!tableChangeDetected && rollingPerformance.rollingWinRate < effectiveStrategyConfig.WARNING_ROLLING_WIN_RATE_THRESHOLD) {
            tableChangeDetected = true;
            warningReason = `Low Rolling Win Rate: ${rollingPerformance.rollingWinRate.toFixed(1)}%`;
        }

        // Check for Primary Factor Shift
        if (!tableChangeDetected && factorShiftStatus && factorShiftStatus.factorShiftDetected) {
            tableChangeDetected = true;
            warningReason = `Factor Shift: ${factorShiftStatus.reason}`;
        }

        if (tableChangeDetected) {
            signal = 'Avoid Play';
            signalColor = "text-red-700";
            reason = `(Table Change Warning: ${warningReason})`;
            // For 'Avoid Play', bestCandidate should be null as no recommendation to bet is given
            // The HTML generation needs to use 'details' from the original bestCandidate, but return null for bestCandidate itself.
            let tempDetails = { ...bestCandidate.details, signal: signal, reason: reason }; // Clone and add signal/reason for history
            let finalHtmlForAvoid = `<strong class="${signalColor}">${signal}</strong> <br><span class="text-xs text-gray-600">Final Score: ${tempDetails.finalScore?.toFixed(2) || 'N/A'}</span><br><span class="text-xs text-gray-500">${reason}</span>`;
            
            return { html: finalHtmlForAvoid, bestCandidate: null, details: tempDetails, signal: signal, reason: reason };
        }
    }


    let finalHtml = `<strong class="${signalColor}">${signal}:</strong> Play <strong style="color: ${bestCandidate.type.textColor};">${bestCandidate.type.label}</strong><br><span class="text-xs text-gray-600">Final Score: ${bestCandidate.score.toFixed(2)}</span><br><span class="text-xs text-gray-500">${reason}</span>`;
    
    // If the final signal is "Wait" or "Avoid" (after all overrides), simplify the HTML output
    if (signal.includes('Wait') || signal.includes('Avoid')) {
        finalHtml = `<strong class="${signalColor}">${signal}</strong> <br><span class="text-xs text-gray-600">Final Score: ${bestCandidate.score.toFixed(2)}</span><br><span class="text-xs text-gray-500">${reason}</span>`;
    }

    // Use useNeighbourFocusBool parameter
    if (useNeighbourFocusBool && (signal === 'Play' || signal === 'Strong Play')) {
        const fullPredictionType = allPredictionTypes.find(t => t.id === bestCandidate.type.id);
        if (fullPredictionType) {
            const baseNum = fullPredictionType.calculateBase(currentNum1, currentNum2);
            const terminals = terminalMapping?.[baseNum] || [];
            // Use context.useDynamicTerminalNeighbourCount
            const hotNumbers = getHitZone(baseNum, terminals, lastWinningNumber, context.useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel)
                .map(num => ({num, score: neighbourScores[num]?.success || 0 }))
                .filter(n => n.score > 0)
                .sort((a,b) => b.score - a.score)
                .slice(0,5)
                .map(n => n.num);

            if (hotNumbers.length > 0) {
                finalHtml += `<br><span class=\"text-xs text-gray-600\">Focus on hot neighbours: <strong>${hotNumbers.join(', ')}</strong></span>`;
            }
        }
    }

    // Return the signal and reason along with html and bestCandidate/details
    return { html: finalHtml, bestCandidate: bestCandidate, details: bestCandidate.details, signal: signal, reason: reason };
}
