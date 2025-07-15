// js/trendWorker.js - A new worker for deep trend analysis.

// --- ANALYSIS LOGIC ---

/**
 * Analyzes the provided history to find trend-related insights.
 * @param {Array} history - The full application history.
 * @returns {object|null} An object containing the analysis report or null.
 */
function analyzeTrends(history) {
    if (!history || history.length < 10) {
        return null; // Not enough data to perform a meaningful analysis.
    }

    const report = {
        longTerm: {},
        shortTerm: {},
        dominantGroup: null,
        confidence: 'low',
        reason: 'No clear trend identified.'
    };

    const allTypes = ['diffMinus', 'diffResult', 'diffPlus', 'sumMinus', 'sumResult', 'sumPlus'];
    const confirmedHistory = history.filter(item => item.status !== 'pending' && item.recommendedGroupId);
    
    if (confirmedHistory.length < 10) {
        return null;
    }

    // --- Long-Term Analysis (Entire History) ---
    allTypes.forEach(typeId => {
        const relevantPlays = confirmedHistory.filter(item => item.recommendedGroupId === typeId);
        const wins = relevantPlays.filter(item => item.hitTypes.includes(typeId)).length;
        const total = relevantPlays.length;
        report.longTerm[typeId] = {
            winRate: total > 0 ? (wins / total) * 100 : 0,
            plays: total,
            wins: wins
        };
    });

    // --- Short-Term Analysis (Last 25 Spins) ---
    const shortTermHistory = confirmedHistory.slice(-25);
    allTypes.forEach(typeId => {
        const relevantPlays = shortTermHistory.filter(item => item.recommendedGroupId === typeId);
        const wins = relevantPlays.filter(item => item.hitTypes.includes(typeId)).length;
        const total = relevantPlays.length;
        report.shortTerm[typeId] = {
            winRate: total > 0 ? (wins / total) * 100 : 0,
            plays: total,
            wins: wins
        };
    });

    // --- Determine Dominant Group ---
    let bestCandidate = null;
    let maxScore = -1;

    for (const typeId of allTypes) {
        const long = report.longTerm[typeId];
        const short = report.shortTerm[typeId];

        // We need a minimum number of plays to consider a trend valid
        if (long.plays < 5 || short.plays < 3) {
            continue;
        }

        // Score is a combination of short-term performance and long-term reliability.
        // Give more weight to recent (short-term) performance.
        const score = (short.winRate * 0.7) + (long.winRate * 0.3);

        if (score > maxScore) {
            maxScore = score;
            bestCandidate = typeId;
        }
    }

    if (bestCandidate && maxScore > 55) { // Confidence threshold
        report.dominantGroup = bestCandidate;
        report.confidence = maxScore > 75 ? 'high' : 'medium';
        report.reason = `Dominant performance with a blended win rate of ${maxScore.toFixed(1)}%.`;
    }

    return report;
}


// --- WEB WORKER MESSAGE HANDLER ---
self.onmessage = (event) => {
    const { type, payload } = event.data;

    if (type === 'analyze') {
        const analysisReport = analyzeTrends(payload.history);
        if (analysisReport) {
            self.postMessage({
                type: 'trendReport',
                payload: analysisReport
            });
        }
    }
};
