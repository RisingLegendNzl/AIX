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

function calculatePocketDistance(num1, num2, rouletteWheel) {
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

export function getRecommendation(context) {
    const {
        trendStats, boardStats, neighbourScores,
        inputNum1, inputNum2,
        isForWeightUpdate = false, aiPredictionData = null,
        currentAdaptiveInfluences, lastWinningNumber,
        useProximityBoostBool, useWeightedZoneBool, useNeighbourFocusBool,
        isAiReadyBool, useTrendConfirmationBool,
        current_STRATEGY_CONFIG,
        activePredictionTypes, allPredictionTypes, terminalMapping, rouletteWheel,
        currentHistoryForTrend // Add this for trend confirmation checks
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
            patternBoostApplied: false, // Not implemented in this context, but kept for consistency
            patternBoostMultiplier: 1, // Not implemented in this context, but kept for consistency
            mlProbability: (aiPredictionData && aiPredictionData.groups && aiPredictionData.groups[type.id] !== undefined) ? aiPredictionData.groups[type.id] : 0,
            mlBoostApplied: false,
            aiLowPocketBoostApplied: false, // Not implemented in this context, but kept for consistency
            finalScore: 0,
            primaryDrivingFactor: "N/A",
            adaptiveInfluenceUsed: 1.0,
            confluenceBonus: 1.0, // Not implemented in this context, but kept for consistency
            reason: [],
            individualScores: {}
        };

        const predictionTypeDefinition = allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return null;
        const baseNum = predictionTypeDefinition.calculateBase(currentNum1, currentNum2);
        if (baseNum < 0 || baseNum > 36) return null;

        const terminals = terminalMapping?.[baseNum] || [];
        // Use context.useDynamicTerminalNeighbourCount for internal hitZone calculation
        const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, context.useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel);

        // --- Calculate Raw Score Components ---
        let rawScore = 0;

        // 1. Base Score from Hit Rate
        const rawHitRatePoints = Math.max(0, details.hitRate - 40) * 0.5;
        rawScore += rawHitRatePoints;
        details.individualScores['Hit Rate'] = rawHitRatePoints;
        if (rawHitRatePoints > 1) details.reason.push(`Hit Rate`);

        // 2. Momentum Score from Current Streak
        const rawStreakPoints = Math.min(15, details.currentStreak * 5);
        rawScore += rawStreakPoints;
        details.individualScores['Streak'] = rawStreakPoints;
        if (rawStreakPoints > 0) details.reason.push(`Streak`);

        // 3. Proximity Score (IF TOGGLED)
        if (useProximityBoostBool && lastWinningNumber !== null) {
            for (const zoneNum of hitZone) {
                const dist = calculatePocketDistance(zoneNum, lastWinningNumber, rouletteWheel);
                if (dist < details.predictiveDistance) details.predictiveDistance = dist;
            }
            details.proximityBoostApplied = details.predictiveDistance <= 5;
            if (details.proximityBoostApplied) {
                const rawProximityPoints = (5 - details.predictiveDistance) * 2;
                rawScore += rawProximityPoints;
                details.individualScores['Proximity to Last Spin'] = rawProximityPoints;
                details.reason.push(`Proximity`);
            }
        }

        // 4. Neighbour Score (IF TOGGLED)
        if (useWeightedZoneBool) {
            const neighbourWeightedScore = hitZone.reduce((sum, num) => sum + (neighbourScores[num]?.success || 0), 0);
            const rawNeighbourPoints = Math.min(10, neighbourWeightedScore * 0.5);
            rawScore += rawNeighbourPoints;
            details.individualScores['Hot Zone Weighting'] = rawNeighbourPoints;
            details.weightedZoneBoostApplied = rawNeighbourPoints > 0;
            if (details.weightedZoneBoostApplied) details.reason.push(`Neighbours`);
        }

        // 5. AI Confidence Score
        if (isAiReadyBool && details.mlProbability > 0) {
            const rawAiPoints = details.mlProbability * 25;
            rawScore += rawAiPoints;
            details.individualScores['High AI Confidence'] = rawAiPoints;
            details.mlBoostApplied = rawAiPoints > 0;
            if (rawAiPoints > 5) details.reason.push(`AI Conf`);
        }

        // --- APPLY ADAPTIVE INFLUENCES ---
        let finalCalculatedScore = 0;
        let mostInfluentialFactor = "N/A";
        let highestInfluencedScore = 0;

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
            mostInfluentialFactor = "Statistical Trends";
        }

        details.finalScore = finalCalculatedScore;
        details.baseScore = rawHitRatePoints + rawStreakPoints;
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
        return { html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">Not enough data for a recommendation.</span>', bestCandidate: null, details: null };
    }

    candidates.sort((a, b) => b.score - a.score);
    let bestCandidate = candidates[0];

    if (bestCandidate.score <= 0) {
        return { html: '<span class="text-gray-500">Wait for Signal</span><br><span class="text-xs">No strong recommendations based on current data.</span>', bestCandidate: null, details: null };
    }

    if (isForWeightUpdate) {
        return { bestCandidate };
    }

    let signal = "Wait";
    let signalColor = "text-gray-500";
    let reason = "(Low Confidence)";

    // Use current_STRATEGY_CONFIG passed from optimizer OR global ones
    const effectiveStrategyConfig = current_STRATEGY_CONFIG;


    if (bestCandidate.score > 50) {
        signal = "Strong Play";
        signalColor = "text-green-600";
        reason = `(${bestCandidate.details?.primaryDrivingFactor || 'Unknown Reason'})`;
    } else if (bestCandidate.score > 20) {
        signal = "Play";
        signalColor = "text-purple-700";
        reason = `(${bestCandidate.details?.primaryDrivingFactor || 'Unknown Reason'})`;
    }

    // Use useTrendConfirmationBool parameter
    if (useTrendConfirmationBool && trendStats.lastSuccessState.length > 0 && !trendStats.lastSuccessState.includes(bestCandidate.type.id)) {
        signal = 'Wait for Signal';
        signalColor = "text-gray-500";
        reason = `(Waiting for ${bestCandidate.type.label} trend confirmation)`;
    } else if (useTrendConfirmationBool && trendStats.lastSuccessState.length === 0 && currentHistoryForTrend.filter(item => item.status === 'success').length > 0) {
        signal = 'Wait for Signal';
        signalColor = "text-gray-500";
        reason = `(No established trend to confirm)`;
    }

    let finalHtml = `<strong class="${signalColor}">${signal}:</strong> Play <strong style="color: ${bestCandidate.type.textColor};">${bestCandidate.type.label}</strong><br><span class="text-xs text-gray-600">Final Score: ${bestCandidate.score.toFixed(2)}</span><br><span class="text-xs text-gray-500">${reason}</span>`;
    if (signal.includes('Wait')) {
        finalHtml = `<strong class="${signalColor}">${signal}</strong> <br><span class="text-xs text-gray-600">Final Score: ${bestCandidate.score.toFixed(2)}</span><br><span class="text-xs text-gray-500">${reason}</span>`;
    }

    // Use useNeighbourFocusBool parameter
    if (useNeighbourFocusBool && (signal === 'Play' || signal === 'Strong Play')) {
        const baseNum = bestCandidate.type.calculateBase(currentNum1, currentNum2);
        const terminals = terminalMapping?.[baseNum] || [];
        // Use context.useDynamicTerminalNeighbourCount
        const hotNumbers = getHitZone(baseNum, terminals, lastWinningNumber, context.useDynamicTerminalNeighbourCount, terminalMapping, rouletteWheel)
            .map(num => ({num, score: neighbourScores[num]?.success || 0 }))
            .filter(n => n.score > 0)
            .sort((a,b) => b.score - a.score)
            .slice(0,5)
            .map(n => n.num);

        if (hotNumbers.length > 0) {
            finalHtml += `<br><span class="text-xs text-gray-600">Focus on hot neighbours: <strong>${hotNumbers.join(', ')}</strong></span>`;
        }
    }

    return { html: finalHtml, bestCandidate, details: bestCandidate.details };
}
