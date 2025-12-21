// aiWorker.js - Web Worker for TensorFlow.js AI Model (Ensemble)

// Keep the module imports to ensure the library code executes and defines globals
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@latest/dist/tf-core.min.js';
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-layers@latest/dist/tf-layers.min.js';
// APPLIED FIX: Import the CPU backend
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@latest/dist/tf-backend-cpu.min.js';


import * as config from './config.js';

// Access the global `tf` object from `self`
const tf = self.tf;

if (!tf) {
    const errorMsg = 'TensorFlow.js global object (tf) is not defined after import. Cannot proceed.';
    console.error(errorMsg);
    self.postMessage({ type: 'error', message: `AI Model: ${errorMsg}` });
    throw new Error(errorMsg);
}

async function initTensorFlow() {
    try {
        await tf.ready();

        tf.enableProdMode();
        // Ensure backend is explicitly set after it's imported and ready
        tf.setBackend('cpu');
        if (config.DEBUG_MODE) console.log('TensorFlow.js backend (CPU) initialized in aiWorker.');
    } catch (err) {
        console.error('Failed to initialize TensorFlow.js backend in aiWorker:', err);
        self.postMessage({ type: 'error', message: 'AI Model: Failed to initialize TensorFlow.js backend.' });
        throw err;
    }
}

let tfInitializedPromise = initTensorFlow();

console.log('TensorFlow.js tf object in aiWorker (from self.tf):', tf);


// --- ENSEMBLE CONFIGURATION ---
const ENSEMBLE_CONFIG = [
    {
        name: 'Specialist',
        path: 'roulette-ml-model-specialist',
        lstmUnits: 16, // Smaller, faster model
        epochs: 40,
        batchSize: 32,
    },
    {
        name: 'Generalist',
        path: 'roulette-ml-model-generalist',
        lstmUnits: 64, // Larger, more complex model
        epochs: 60,
        batchSize: 16,
    }
];

const SEQUENCE_LENGTH = 5;
const TRAINING_MIN_HISTORY = 10;
const failureModes = ['none', 'normalLoss', 'streakBreak', 'sectionShift'];

// Corrected variable name here to ENSEMBLE_CONFIG
let ensemble = ENSEMBLE_CONFIG.map(cfg => ({ ...cfg, model: null, scaler: null }));
let terminalMapping = {};
let rouletteWheel = [];
let isTraining = false;

// Helper to get number properties (unchanged)
function getNumberProperties(num) {
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const getRouletteNumberColor = (number) => {
        if (number === 0) return 'green';
        if (redNumbers.includes(number)) return 'red';
        return 'black';
    };
    const color = getRouletteNumberColor(num);
    const isEven = num % 2 === 0 && num !== 0;
    const isOdd = num % 2 !== 0;
    const isHigh = num >= 19 && num <= 36;
    const isLow = num >= 1 && num <= 18;
    const isD1 = num >= 1 && num <= 12;
    const isD2 = num >= 13 && num <= 24;
    const isD3 = num >= 25 && num <= 36;
    const isCol1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(num);
    const isCol2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(num);
    const isCol3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(num);
    return {
        isEven: isEven ? 1 : 0, isOdd: isOdd ? 1 : 0, isRed: color === 'red' ? 1 : 0,
        isBlack: color === 'black' ? 1 : 0, isHigh: isHigh ? 1 : 0, isLow: isLow ? 1 : 0,
        isD1: isD1 ? 1 : 0, isD2: isD2 ? 1 : 0, isD3: isD3 ? 1 : 0,
        isCol1: isCol1 ? 1 : 0, isCol2: isCol2 ? 1 : 0, isCol3: isCol3 ? 1 : 0,
    };
}

/**
 * Calculates the consecutive hits/misses for each prediction type up to a given history item.
 * This is a helper function for prepareDataForLSTM and predictWithEnsemble.
 * @param {Array} historySubset - A slice of history ending at the current point.
 * @param {Array} allPredictionTypes - All prediction type definitions.
 * @returns {object} An object with current consecutive hits and misses for each prediction type ID.
 */
function getConsecutivePerformanceForAI(historySubset, allPredictionTypes) {
    const consecutiveHits = {};
    const consecutiveMisses = {};

    allPredictionTypes.forEach(type => {
        consecutiveHits[type.id] = 0;
        consecutiveMisses[type.id] = 0;
    });

    if (historySubset.length === 0) return { consecutiveHits, consecutiveMisses };

    // Iterate backwards from the most recent item in the subset
    for (let i = historySubset.length - 1; i >= 0; i--) {
        const item = historySubset[i];
        if (item.status === 'pending' || item.winningNumber === null) {
            // If the item is pending or missing winningNumber, it breaks the streak for all types
            // that were active up to this point, effectively resetting counts.
            // For robust AI features, we might need a more nuanced approach for pending.
            // For now, let's assume only fully evaluated history items contribute to consecutive counts.
            break; 
        }

        let allTypesEvaluatedForThisItem = false;
        allPredictionTypes.forEach(type => {
            if (item.typeSuccessStatus && item.typeSuccessStatus.hasOwnProperty(type.id)) {
                allTypesEvaluatedForThisItem = true; // At least one type was evaluated
                // Only count if not already started, or if continuing same streak
                if ((consecutiveHits[type.id] === 0 && consecutiveMisses[type.id] === 0) || 
                    (item.typeSuccessStatus[type.id] && consecutiveHits[type.id] > 0) ||
                    (!item.typeSuccessStatus[type.id] && consecutiveMisses[type.id] > 0)) {
                    
                    if (item.typeSuccessStatus[type.id]) { // Hit
                        consecutiveHits[type.id]++; 
                        consecutiveMisses[type.id] = 0; // Reset miss streak
                    } else { // Miss
                        consecutiveMisses[type.id]++; 
                        consecutiveHits[type.id] = 0; // Reset hit streak
                    }
                } else {
                    // This means the streak for this specific type was broken by an opposite result earlier in the historySliceForThisItem
                    // So we effectively stop counting for this type beyond this point for this specific snapshot.
                    // This logic ensures we're only capturing the *current* consecutive streak.
                    consecutiveHits[type.id] = 0; // Reset if streak broke earlier
                    consecutiveMisses[type.id] = 0; // Reset if streak broke earlier
                }
            } else {
                // If type success status isn't available for this type in this item,
                // it means this type wasn't active or calculated. Break the streak.
                // Reset for this specific type
                consecutiveHits[type.id] = 0;
                consecutiveMisses[type.id] = 0;
            }
        });
        // If no types were evaluated in this item at all, it's like a break in the chain for all relevant types.
        // This outer break is likely not needed if inner loop handles it for each type.
        // Removing for now for more precise per-type tracking.
        // if (!allTypesEvaluatedForThisItem) {
        //     break;
        // }
    }

    return { consecutiveHits, consecutiveMisses };
}

// FIXED: Move scaleFeature to global scope so it's accessible by predictWithEnsemble
const scaleFeature = (value, index, scaler) => {
    if (!scaler || scaler.min[index] === undefined || scaler.max[index] === undefined) {
        // Fallback or error if scaler is not valid
        console.warn('Scaler is invalid or missing min/max for index', index, scaler);
        return value; // Return original value or handle as error
    }
    const featureMin = scaler.min[index];
    const featureMax = scaler.max[index];
    if (featureMax === featureMin) return 0; // Avoid division by zero if feature is constant
    return (value - featureMin) / (featureMax - featureMin);
};


// Function to prepare data, now includes consecutive hit/miss features
function prepareDataForLSTM(historyData, historicalStreakData) {
    const validHistory = historyData.filter(item => item.status === 'success' && item.winningNumber !== null);
    if (validHistory.length < SEQUENCE_LENGTH + 1) {
        self.postMessage({ type: 'status', message: `AI Model: Need at least ${TRAINING_MIN_HISTORY} confirmed spins to train.` });
        return { xs: null, ys: null, scaler: null, featureCount: 0 };
    }

    const getFeatures = (item, currentHistorySliceForContext) => {
        const props = getNumberProperties(item.winningNumber);
        
        // Calculate consecutive performance up to this item
        const { consecutiveHits, consecutiveMisses } = getConsecutivePerformanceForAI(currentHistorySliceForContext, config.allPredictionTypes);

        // Normalize consecutive counts (e.g., max 10 for misses/hits, or use a sigmoid for very long streaks)
        // MaxStreak can be a configurable value in config.js if needed.
        const maxStreakToNormalize = 10; 

        // Get repeat and neighbor hit status for this specific item in context
        // Ensure to pass config.rouletteWheel here
        const isCurrentRepeat = isRepeatNumberInContext(item.winningNumber, currentHistorySliceForContext, config.AI_CONFIG.sequenceLength);
        const isCurrentNeighborHit = isNeighborHitInContext(item.winningNumber, currentHistorySliceForContext, config.AI_CONFIG.sequenceLength, config.rouletteWheel, 1);


        return [
            item.num1 / 36, item.num2 / 36, item.difference / 36,
            item.pocketDistance !== null ? item.pocketDistance / 18 : 0,
            item.recommendedGroupPocketDistance !== null ? item.recommendedGroupPocketDistance / 18 : 1,
            // Add categorical features for winning number properties
            props.isEven, props.isOdd, props.isRed, props.isBlack,
            props.isHigh, props.isLow, props.isD1, props.isD2, props.isD3,
            props.isCol1, props.isCol2, props.isCol3,
            ...config.allPredictionTypes.map(type => item.typeSuccessStatus[type.id] ? 1 : 0),
            // Add consecutive hit/miss features for each prediction type
            ...config.allPredictionTypes.flatMap(type => [
                Math.min(consecutiveHits[type.id] / maxStreakToNormalize, 1),   // Normalized consecutive hits
                Math.min(consecutiveMisses[type.id] / maxStreakToNormalize, 1) // Normalized consecutive misses
            ]),
            // NEW: Add repeat and neighbor hit features
            isCurrentRepeat ? 1 : 0,
            isCurrentNeighborHit ? 1 : 0
        ];
    };

    let rawFeatures = [];
    let rawGroupLabels = [];
    let rawFailureLabels = [];
    let rawStreakLengthLabels = [];

    for (let i = 0; i < validHistory.length - SEQUENCE_LENGTH; i++) {
        const sequence = validHistory.slice(i, i + SEQUENCE_LENGTH);
        const targetItem = validHistory[i + SEQUENCE_LENGTH];

        // For each item in the sequence, get its features, passing the history slice *up to that item*
        const xs_row = sequence.map((item, idx) => {
            const historySliceForThisItem = validHistory.slice(0, i + idx + 1); // Slice up to the current item being processed in the overall history
            return getFeatures(item, historySliceForThisItem);
        });
        rawFeatures.push(xs_row);

        rawGroupLabels.push(config.allPredictionTypes.map(type => targetItem.typeSuccessStatus[type.id] ? 1 : 0));
        rawFailureLabels.push(failureModes.map(mode => (targetItem.failureMode === mode ? 1 : 0)));

        const streakLengthLabel = config.allPredictionTypes.map(type => {
            const streaks = historicalStreakData[type.id] || [];
            return streaks.length > 0 ? streaks.reduce((a, b) => a + b, 0) / streaks.length : 0;
        });
        rawStreakLengthLabels.push(streakLengthLabel);
    }

    const featureCount = rawFeatures.length > 0 ? rawFeatures[0][0].length : 0;

    // Apply scaling to the entire feature set after generating all features
    const newScaler = {
        min: Array(featureCount).fill(Infinity),
        max: Array(featureCount).fill(-Infinity)
    };
    
    // Recalculate min/max for scaling across all features
    for (let i = 0; i < rawFeatures.length; i++) { // Iterate over sequences
        for (let j = 0; j < rawFeatures[i].length; j++) { // Iterate over items in sequence
            for (let k = 0; k < rawFeatures[i][j].length; k++) { // Iterate over features in item
                const val = rawFeatures[i][j][k];
                newScaler.min[k] = Math.min(newScaler.min[k], val);
                newScaler.max[k] = Math.max(newScaler.max[k], val);
            }
        }
    }

    // Apply scaling to rawFeatures
    const scaledFeatures = rawFeatures.map(sequence => 
        sequence.map(itemFeatures => 
            itemFeatures.map((val, idx) => scaleFeature(val, idx, newScaler)) // Pass newScaler here
        )
    );

    const xs = scaledFeatures.length > 0 ? tf.tensor3d(scaledFeatures) : null;
    const ys = {
        group_output: rawGroupLabels.length > 0 ? tf.tensor2d(rawGroupLabels) : null,
        failure_output: rawFailureLabels.length > 0 ? tf.tensor2d(rawFailureLabels) : null,
        streak_output: rawStreakLengthLabels.length > 0 ? tf.tensor2d(rawStreakLengthLabels) : null
    };

    return { xs, ys, scaler: newScaler, featureCount };
}

// Function to create model, now with a third output for streaks
function createMultiOutputLSTMModel(inputShape, groupOutputUnits, failureOutputUnits, streakOutputUnits, lstmUnits) {
    const input = tf.input({ shape: inputShape });
    const lstmLayer = tf.layers.lstm({
        units: lstmUnits,
        returnSequences: false,
        activation: 'relu',
        kernelInitializer: 'glorotUniform',
        recurrentInitializer: 'glorotUniform'
    }).apply(input);
    const dropoutLayer = tf.layers.dropout({ rate: 0.2 }).apply(lstmLayer);

    const groupOutput = tf.layers.dense({ units: groupOutputUnits, activation: 'sigmoid', name: 'group_output' }).apply(dropoutLayer);
    const failureOutput = tf.layers.dense({ units: failureOutputUnits, activation: 'softmax', name: 'failure_output' }).apply(dropoutLayer);
    const streakOutput = tf.layers.dense({ units: streakOutputUnits, activation: 'relu', name: 'streak_output' }).apply(dropoutLayer);

    const model = tf.model({ inputs: input, outputs: [groupOutput, failureOutput, streakOutput] });

    model.compile({
        optimizer: tf.train.adam(),
        loss: {
            'group_output': 'binaryCrossentropy',
            'failure_output': 'categoricalCrossentropy',
            'streak_output': 'meanSquaredError'
        },
        metrics: ['accuracy']
    });
    return model;
}

// Main training function (updated for new data)
async function trainEnsemble(historyData, historicalStreakData) {
    await tfInitializedPromise;

    if (isTraining) {
        self.postMessage({ type: 'status', message: 'AI Ensemble: Training already in progress.' });
        return;
    }
    isTraining = true;
    self.postMessage({ type: 'status', message: 'AI Ensemble: Preparing data...' });

    // Prepare data outside of the main tf.tidy loop for training, but tensors are still managed.
    // We will dispose them at the end of the trainEnsemble function.
    const { xs, ys, scaler, featureCount } = prepareDataForLSTM(historyData, historicalStreakData);
    if (!xs || !ys.group_output || !ys.failure_output || !ys.streak_output) {
        self.postMessage({ type: 'status', message: `AI Model: Not enough valid data to train.` });
        isTraining = false;
        // Dispose of any tensors that might have been created before exiting
        if (xs) xs.dispose();
        if (ys.group_output) ys.group_output.dispose();
        if (ys.failure_output) ys.failure_output.dispose();
        if (ys.streak_output) ys.streak_output.dispose();
        return;
    }

    self.postMessage({ type: 'saveScaler', payload: JSON.stringify(scaler) });
    ensemble.forEach(member => member.scaler = scaler);

    const groupLabelCount = config.allPredictionTypes.length;
    const failureLabelCount = failureModes.length;
    const streakLabelCount = config.allPredictionTypes.length;

    for (const member of ensemble) {
        try {
            self.postMessage({ type: 'status', message: `AI Ensemble: Training ${member.name}...` });

            // Dispose of the existing model and explicitly nullify the reference
            // This happens before creating a new model to ensure old resources are cleared.
            if (member.model) {
                member.model.dispose();
                member.model = null; // Ensure the reference is cleared
                if (config.DEBUG_MODE) console.log(`Disposed old model for ${member.name}.`);
            }
            
            // Create a new model for the current ensemble member
            member.model = createMultiOutputLSTMModel([SEQUENCE_LENGTH, featureCount], groupLabelCount, failureLabelCount, streakLabelCount, member.lstmUnits);

            // The model.fit() call returns a Promise and should be awaited directly.
            // Intermediate tensors *created by fit* are typically handled internally by TF.js.
            // So, tf.tidy() is not needed around `model.fit` itself.
            await member.model.fit(xs, ys, {
                epochs: member.epochs,
                batchSize: member.batchSize,
                callbacks: {
                    onEpochEnd: (epoch) => {
                        self.postMessage({ type: 'status', message: `AI Ensemble: Training ${member.name} (Epoch ${epoch + 1}/${member.epochs})` });
                    }
                }
            });

            await member.model.save(`indexeddb://${member.path}`);
            console.log(`TF.js Model ${member.name} saved.`);
        } catch (error) {
            console.error(`Error training model ${member.name}:`, error);
            self.postMessage({ type: 'status', message: `AI Ensemble: Training for ${member.name} failed. Error: ${error.message}` });
        }
    }

    // Dispose of input and output tensors after all training is complete
    xs.dispose();
    if (ys.group_output) ys.group_output.dispose();
    if (ys.failure_output) ys.failure_output.dispose();
    if (ys.streak_output) ys.streak_output.dispose();

    isTraining = false;
    self.postMessage({ type: 'status', message: 'AI Ensemble: Ready!' });
}

// --- AI EXPLANATION GENERATION (CALCULATION-GROUP-FOCUSED) ---

/**
 * Wraps a group name in a colored span for visual distinction
 * FIXED: Added to enable group name coloring in AI explanations
 */
function wrapGroupName(groupName, groupId) {
    if (!groupId || !groupName) return groupName;
    const colorClass = `group-name-${groupId}`;
    return `<span class="${colorClass}">${groupName}</span>`;
}

/**
 * Analyzes recent performance of a specific calculation group
 */
function analyzeGroupRecentPerformance(groupId, validHistory) {
    const recentWindow = 10; // Last 10 confirmed spins
    const recentHistory = validHistory.slice(-recentWindow);
    
    let hits = 0;
    let total = 0;
    let currentStreak = 0;
    let streakBroken = false;
    
    // Walk backwards through recent history to calculate metrics
    for (let i = recentHistory.length - 1; i >= 0; i--) {
        const item = recentHistory[i];
        if (item.typeSuccessStatus && item.typeSuccessStatus[groupId] !== undefined) {
            total++;
            if (item.typeSuccessStatus[groupId]) {
                hits++;
                if (!streakBroken) {
                    currentStreak++;
                }
            } else {
                streakBroken = true; // Stop counting streak once we hit a miss
            }
        }
    }
    
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    
    return {
        hitRate,
        hits,
        total,
        currentStreak
    };
}

/**
 * Determines confidence level based on prediction probabilities and score gap
 */
function determineConfidence(averagedGroupProbs) {
    const sortedProbs = Object.values(averagedGroupProbs).sort((a, b) => b - a);
    const maxProb = sortedProbs[0];
    const spread = sortedProbs[0] - sortedProbs[1]; // Gap between top 2 groups
    
    // High confidence: strong probability AND clear winner
    if (maxProb >= 0.6 && spread >= 0.15) return 'high';
    
    // Medium confidence: decent probability OR clear winner
    if (maxProb >= 0.4 && spread >= 0.08) return 'medium';
    
    // Low confidence: weak signals or close competition
    return 'low';
}

/**
 * Generates the headline explaining the calculation group recommendation
 * FIXED: Now uses wrapGroupName for colored group names
 */
function generateGroupRecommendationHeadline(topGroup, confidence, performance) {
    const wrappedGroupName = wrapGroupName(topGroup.groupName, topGroup.groupId);
    
    // Priority 1: Active winning streak
    if (performance.currentStreak >= 3) {
        return `${wrappedGroupName} on ${performance.currentStreak}-spin winning streak`;
    }
    
    // Priority 2: Exceptional recent performance
    if (performance.total >= 5 && performance.hitRate >= 70) {
        return `${wrappedGroupName} hitting ${performance.hitRate.toFixed(0)}% of recent spins`;
    }
    
    // Priority 3: High confidence from AI
    if (confidence === 'high') {
        return `AI strongly favors ${wrappedGroupName}`;
    }
    
    // Priority 4: Moderate performance with decent confidence
    if (performance.total >= 3 && performance.hitRate >= 50 && confidence === 'medium') {
        return `${wrappedGroupName} shows consistent recent performance`;
    }
    
    // Priority 5: Low confidence warning
    if (confidence === 'low') {
        return `AI suggests ${wrappedGroupName} but signals are mixed`;
    }
    
    // Default: Simple recommendation
    return `AI recommends ${wrappedGroupName}`;
}

/**
 * Generates explanation bullets for calculation group recommendation
 * FIXED: Now uses wrapGroupName for colored group names
 */
function generateGroupRecommendationBullets(topGroup, runnerUpGroup, scoreGap, performance, lastSequence, validHistory) {
    const bullets = [];
    
    const wrappedRunnerUpName = wrapGroupName(runnerUpGroup.groupName, runnerUpGroup.groupId);
    
    // --- BULLET 1: Score comparison (why this group beats alternatives) ---
    if (scoreGap >= 0.20) {
        bullets.push(`Scores ${(scoreGap * 100).toFixed(0)}% higher than ${wrappedRunnerUpName} (clear winner)`);
    } else if (scoreGap >= 0.10) {
        bullets.push(`Edges out ${wrappedRunnerUpName} by ${(scoreGap * 100).toFixed(0)}%`);
    } else {
        bullets.push(`Very close race with ${wrappedRunnerUpName} (${(scoreGap * 100).toFixed(0)}% margin)`);
    }
    
    // --- BULLET 2: Recent historical performance ---
    if (performance.total >= 5) {
        if (performance.currentStreak >= 2) {
            bullets.push(`Currently on ${performance.currentStreak}-spin streak (${performance.hits}/${performance.total} recent hits)`);
        } else if (performance.hitRate >= 60) {
            bullets.push(`Strong recent form: ${performance.hits} hits in last ${performance.total} spins (${performance.hitRate.toFixed(0)}%)`);
        } else if (performance.hitRate >= 40) {
            bullets.push(`Recent performance: ${performance.hits}/${performance.total} spins (${performance.hitRate.toFixed(0)}%)`);
        } else {
            bullets.push(`Recent struggle: ${performance.hits}/${performance.total} hits (${performance.hitRate.toFixed(0)}%) - watch carefully`);
        }
    } else if (performance.total > 0) {
        bullets.push(`Limited recent data: ${performance.hits}/${performance.total} hits - treat cautiously`);
    } else {
        bullets.push(`No recent history for this group - AI prediction based on patterns only`);
    }
    
    // --- BULLET 3: Supporting pattern context (if space permits) ---
    // Analyze patterns to add context
    const colorAnalysis = analyzeColorPattern(lastSequence);
    const parityAnalysis = analyzeParityPattern(lastSequence);
    const repeatAnalysis = analyzeRepeatsAndNeighbors(lastSequence);
    
    // Add most relevant supporting pattern
    if (colorAnalysis.maxStreak >= 4) {
        bullets.push(`Pattern signal: ${colorAnalysis.maxStreak} consecutive ${colorAnalysis.streakColor} numbers`);
    } else if (parityAnalysis.evenCount === 0 || parityAnalysis.oddCount === 0) {
        const dominantParity = parityAnalysis.evenCount === 0 ? 'odd' : 'even';
        bullets.push(`Pattern signal: All ${SEQUENCE_LENGTH} recent spins were ${dominantParity}`);
    } else if (repeatAnalysis.neighborHits >= 3) {
        bullets.push(`Pattern signal: ${repeatAnalysis.neighborHits} spins clustered in wheel sectors`);
    } else if (repeatAnalysis.repeats.length >= 2) {
        bullets.push(`Pattern signal: ${repeatAnalysis.repeats.length} repeat numbers detected`);
    } else {
        // No strong pattern - mention AI confidence level instead
        if (topGroup.prob >= 0.55) {
            bullets.push(`AI confidence: ${(topGroup.prob * 100).toFixed(0)}% probability for this group`);
        } else if (topGroup.prob <= 0.35) {
            bullets.push(`Weak signals - AI sees no dominant pattern (${(topGroup.prob * 100).toFixed(0)}%)`);
        } else {
            bullets.push(`Moderate AI signal (${(topGroup.prob * 100).toFixed(0)}% confidence)`);
        }
    }
    
    // Return exactly 3 bullets
    return bullets.slice(0, 3);
}

/**
 * Analyzes the sequence to detect color patterns
 */
function analyzeColorPattern(sequence) {
    const colors = sequence.map(item => {
        const num = item.winningNumber;
        if (num === 0) return 'green';
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        return redNumbers.includes(num) ? 'red' : 'black';
    });
    
    // Check for streaks
    let currentColor = colors[0];
    let streakLength = 1;
    let maxStreak = 1;
    let streakColor = currentColor;
    
    for (let i = 1; i < colors.length; i++) {
        if (colors[i] === currentColor) {
            streakLength++;
            if (streakLength > maxStreak) {
                maxStreak = streakLength;
                streakColor = currentColor;
            }
        } else {
            streakLength = 1;
            currentColor = colors[i];
        }
    }
    
    return { maxStreak, streakColor, colors };
}

/**
 * Analyzes the sequence to detect even/odd patterns
 */
function analyzeParityPattern(sequence) {
    const parities = sequence.map(item => {
        const num = item.winningNumber;
        if (num === 0) return 'zero';
        return num % 2 === 0 ? 'even' : 'odd';
    });
    
    const evenCount = parities.filter(p => p === 'even').length;
    const oddCount = parities.filter(p => p === 'odd').length;
    
    return { evenCount, oddCount, parities };
}

/**
 * Analyzes the sequence to detect repeats and neighbors
 */
function analyzeRepeatsAndNeighbors(sequence) {
    const numbers = sequence.map(item => item.winningNumber);
    const repeats = [];
    const seen = new Set();
    
    for (const num of numbers) {
        if (seen.has(num)) {
            repeats.push(num);
        }
        seen.add(num);
    }
    
    // Check for neighbors on the wheel
    let neighborHits = 0;
    for (let i = 1; i < numbers.length; i++) {
        const distance = calculatePocketDistanceLocal(numbers[i], numbers[i-1], rouletteWheel);
        if (distance <= 2) {
            neighborHits++;
        }
    }
    
    return { repeats, neighborHits };
}

/**
 * Local pocket distance calculation
 */
function calculatePocketDistanceLocal(num1, num2, wheel) {
    const idx1 = wheel.indexOf(num1);
    const idx2 = wheel.indexOf(num2);
    if (idx1 === -1 || idx2 === -1) return Infinity;
    const directDist = Math.abs(idx1 - idx2);
    const wrapDist = wheel.length - directDist;
    return Math.min(directDist, wrapDist);
}

/**
 * Generates a complete AI explanation for calculation group recommendation
 * This is the main entry point for explanation generation
 */
function generateAiExplanation(lastSequence, validHistory, averagedGroupProbs) {
    if (!lastSequence || lastSequence.length === 0) {
        return {
            headline: "Insufficient data for AI analysis",
            bullets: ["Need at least 5 confirmed spins for calculation group predictions"],
            confidence: "none",
            windowSize: 0,
            topGroup: null,
            runnerUpGroup: null,
            scoreGap: 0
        };
    }
    
    // Find top calculation group and runner-up
    const groupEntries = Object.entries(averagedGroupProbs)
        .map(([groupId, prob]) => ({
            groupId,
            prob,
            groupName: config.allPredictionTypes.find(t => t.id === groupId)?.displayLabel || groupId
        }))
        .sort((a, b) => b.prob - a.prob);
    
    if (groupEntries.length === 0) {
        return {
            headline: "No calculation groups available",
            bullets: ["Unable to generate recommendation - check system configuration"],
            confidence: "none",
            windowSize: SEQUENCE_LENGTH,
            topGroup: null,
            runnerUpGroup: null,
            scoreGap: 0
        };
    }
    
    const topGroup = groupEntries[0];
    const runnerUpGroup = groupEntries[1] || { groupId: 'none', prob: 0, groupName: 'None' };
    const scoreGap = topGroup.prob - runnerUpGroup.prob;
    
    // Determine confidence level
    const confidence = determineConfidence(averagedGroupProbs);
    
    // Analyze recent performance of top group
    const recentPerformance = analyzeGroupRecentPerformance(topGroup.groupId, validHistory);
    
    // Generate headline explaining the choice
    const headline = generateGroupRecommendationHeadline(topGroup, confidence, recentPerformance);
    
    // Generate bullets explaining WHY this group was chosen
    const bullets = generateGroupRecommendationBullets(
        topGroup, 
        runnerUpGroup, 
        scoreGap, 
        recentPerformance,
        lastSequence,
        validHistory
    );
    
    return {
        headline,
        bullets,
        confidence,
        windowSize: SEQUENCE_LENGTH,
        topGroup: topGroup.groupName,
        runnerUpGroup: runnerUpGroup.groupName,
        scoreGap: (scoreGap * 100).toFixed(1)
    };
}

// Prediction function (updated to include explanation)
async function predictWithEnsemble(historyData) {
    await tfInitializedPromise;

    const activeModels = ensemble.filter(m => m.model && m.scaler);
    if (activeModels.length === 0) return null;

    const validHistory = historyData.filter(item => item.status === 'success' && item.winningNumber !== null);
    if (validHistory.length < SEQUENCE_LENGTH) return null;

    const lastSequence = validHistory.slice(-SEQUENCE_LENGTH);

    const scaler = activeModels[0].scaler; // Assuming all models use the same scaler

    // Helper to get features including consecutive performance
    const getFeaturesForPrediction = (item, historySliceForContext) => {
        const props = getNumberProperties(item.winningNumber);
        const { consecutiveHits, consecutiveMisses } = getConsecutivePerformanceForAI(historySliceForContext, config.allPredictionTypes);

        const maxStreakToNormalize = 10; // Must match training normalization

        // Get repeat and neighbor hit status for this specific item in context
        const isCurrentRepeat = isRepeatNumberInContext(item.winningNumber, historySliceForContext, config.AI_CONFIG.sequenceLength);
        const isCurrentNeighborHit = isNeighborHitInContext(item.winningNumber, historySliceForContext, config.AI_CONFIG.sequenceLength, config.rouletteWheel, 1);

        return [
            item.num1 / 36, item.num2 / 36, item.difference / 36,
            item.pocketDistance !== null ? item.pocketDistance / 18 : 0,
            item.recommendedGroupPocketDistance !== null ? item.recommendedGroupPocketDistance / 18 : 1,
            // Add categorical features for winning number properties
            props.isEven, props.isOdd, props.isRed, props.isBlack,
            props.isHigh, props.isLow, props.isD1, props.isD2, props.isD3,
            props.isCol1, props.isCol2, props.isCol3,
            ...config.allPredictionTypes.map(type => item.typeSuccessStatus[type.id] ? 1 : 0),
            // Add consecutive hit/miss features for each prediction type
            ...config.allPredictionTypes.flatMap(type => [
                Math.min(consecutiveHits[type.id] / maxStreakToNormalize, 1),
                Math.min(consecutiveMisses[type.id] / maxStreakToNormalize, 1)
            ]),
            // NEW: Add repeat and neighbor hit features
            isCurrentRepeat ? 1 : 0,
            isCurrentNeighborHit ? 1 : 0
        ];
    };


    let inputTensor = null;
    try {
        // Wrap input tensor creation in tf.tidy for automatic disposal
        inputTensor = tf.tidy(() => {
            const inputFeatures = lastSequence.map((item, idx) => {
                const historySliceForThisItem = validHistory.slice(0, validHistory.length - SEQUENCE_LENGTH + idx + 1);
                return getFeaturesForPrediction(item, historySliceForThisItem).map((val, featureIdx) => scaleFeature(val, featureIdx, scaler));
            });
            return tf.tensor3d([inputFeatures]);
        });
        
        // Predictions are awaited outside of tidy, as they return Promises.
        const allPredictions = await Promise.all(activeModels.map(m => m.model.predict(inputTensor)));

        // Average the predictions
        const averagedGroupProbs = new Float32Array(config.allPredictionTypes.length).fill(0);
        const averagedFailureProbs = new Float32Array(failureModes.length).fill(0);
        const averagedStreakPreds = new Float32Array(config.allPredictionTypes.length).fill(0);

        for (const prediction of allPredictions) {
            const groupProbs = await prediction[0].data();
            const failureProbs = await prediction[1].data();
            const streakPreds = await prediction[2].data();

            groupProbs.forEach((p, i) => averagedGroupProbs[i] += p);
            failureProbs.forEach((p, i) => averagedFailureProbs[i] += p);
            streakPreds.forEach((p, i) => averagedStreakPreds[i] += p);

            // Dispose of prediction tensors after reading data
            prediction[0].dispose();
            prediction[1].dispose();
            prediction[2].dispose();
        }

        averagedGroupProbs.forEach((p, i) => averagedGroupProbs[i] /= allPredictions.length);
        averagedFailureProbs.forEach((p, i) => averagedFailureProbs[i] /= allPredictions.length);
        averagedStreakPreds.forEach((p, i) => averagedStreakPreds[i] /= allPredictions.length);

        // Convert to object format for easier access
        const groupProbsObject = {};
        config.allPredictionTypes.forEach((type, i) => {
            groupProbsObject[type.id] = averagedGroupProbs[i];
        });

        const finalResult = { groups: {}, failures: {}, streakPredictions: {} };
        config.allPredictionTypes.forEach((type, i) => finalResult.groups[type.id] = averagedGroupProbs[i]);
        failureModes.forEach((mode, i) => finalResult.failures[mode] = averagedFailureProbs[i]);
        config.allPredictionTypes.forEach((type, i) => finalResult.streakPredictions[type.id] = averagedStreakPreds[i]);

        // Generate calculation-group-focused AI explanation
        const aiExplanation = generateAiExplanation(lastSequence, validHistory, groupProbsObject);
        finalResult.aiExplanation = aiExplanation;

        return finalResult;

    } catch (error) {
        console.error('Error during ensemble prediction:', error);
        return null;
    } finally {
        // Ensure inputTensor is disposed if it was successfully created.
        // If an error occurred before inputTensor was assigned, it might be null.
        if (inputTensor && !inputTensor.isDisposed) inputTensor.dispose(); 
    }
}


// Storage functions (unchanged)
async function loadModelsFromStorage() {
    await tfInitializedPromise;

    const loadPromises = ensemble.map(async (member) => {
        try {
            member.model = await tf.loadLayersModel(`indexeddb://${member.path}`);
            console.log(`TF.js Model ${member.name} loaded from IndexedDB.`);
            return true;
        } catch (error) {
            console.warn(`Could not load model ${member.name}. It may need to be trained.`);
            return false;
        }
    });
    return Promise.all(loadPromises);
}

async function clearModelsFromStorage() {
    await tfInitializedPromise;

    const clearPromises = ensemble.map(async (member) => {
        try {
            if (member.model) {
                member.model.dispose();
                member.model = null;
            }
            await tf.io.removeModel(`indexeddb://${member.path}`);
        } catch (error) {
            // Error is expected if model doesn't exist
        }
    });
    await Promise.all(clearPromises);
    ensemble.forEach(m => m.scaler = null);
    console.log('All TF.js models and scalers cleared.');
}


// Helper for isRepeatNumberInContext
function isRepeatNumberInContext(winningNumber, historySubset, recentHistoryLength) {
    if (historySubset.length === 0) return false;
    const relevantHistory = historySubset
        .filter(item => item.winningNumber !== null) // Only confirmed spins
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, recentHistoryLength); // Get only the recent spins

    return relevantHistory.some(item => item.winningNumber === winningNumber);
}

// Helper for isNeighborHitInContext
function isNeighborHitInContext(winningNumber, historySubset, recentHistoryLength, rouletteWheel, neighborDistance = 1) {
    if (historySubset.length === 0) return false;
    const relevantHistory = historySubset
        .filter(item => item.winningNumber !== null) // Only confirmed spins
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, recentHistoryLength); // Get only the recent spins

    for (const item of relevantHistory) {
        const lastSpin = item.winningNumber;
        if (lastSpin === winningNumber) continue; // Don't count as neighbor if it's the same number
        
        // Use calculatePocketDistance (assuming it's available or imported correctly in worker scope)
        // Since calculatePocketDistance is in shared-logic.js, we need to ensure it's truly global in worker if needed.
        // Given it's a small pure function, for worker context, a local copy or direct import might be considered.
        // For a clean worker, let's locally define calculatePocketDistance if it's not imported.
        // However, in our architecture, shared-logic.js is not imported into aiWorker.js.
        // So, we'll need to pass rouletteWheel to the prediction function if calculatePocketDistance is in analysis.js.

        // Re-implement a lightweight calculatePocketDistance for internal worker use, or ensure it's shared.
        // Let's assume calculatePocketDistance from shared-logic.js is NOT directly available here.
        // For this worker, direct array operations will be used for simplicity if calculatePocketDistance is not easily imported.

        const getPocketDistanceLocal = (num1, num2, wheel) => {
            const idx1 = wheel.indexOf(num1);
            const idx2 = wheel.indexOf(num2);
            if (idx1 === -1 || idx2 === -1) return Infinity;
            const directDist = Math.abs(idx1 - idx2);
            const wrapDist = wheel.length - directDist;
            return Math.min(directDist, wrapDist);
        };

        const distance = getPocketDistanceLocal(winningNumber, lastSpin, rouletteWheel);
        if (distance <= neighborDistance) {
            return true;
        }
    }
    return false;
}


// --- Message Handling for Web Worker (Updated) ---
self.onmessage = async (event) => {
    const { type, payload } = event.data;

    try {
        await tfInitializedPromise;
    } catch (tfInitError) {
        console.error("AI Worker: TensorFlow.js was not initialized, cannot process message.", tfInitError);
        self.postMessage({ type: 'error', message: 'AI Model: Initialization failed. Cannot process request.' });
        return;
    }

    switch (type) {
        case 'init':
            terminalMapping = payload.terminalMapping;
            rouletteWheel = payload.rouletteWheel;
            const loadedScaler = payload.scaler ? JSON.parse(payload.scaler) : null;
            if(loadedScaler) {
                ensemble.forEach(m => m.scaler = loadedScaler);
            }
            const loadResults = await loadModelsFromStorage();
            if (loadResults.every(Boolean)) {
                self.postMessage({ type: 'status', message: 'AI Ensemble: Ready!' });
            } else {
                self.postMessage({ type: 'status', message: `AI Ensemble: Need at least ${TRAINING_MIN_HISTORY} confirmed spins to train.` });
            }
            break;
        case 'train':
            await trainEnsemble(payload.history, payload.historicalStreakData);
            break;
        case 'predict':
            const probabilities = await predictWithEnsemble(payload.history);
            self.postMessage({ type: 'predictionResult', probabilities });
            break;
        case 'clear_model':
            await clearModelsFromStorage();
            self.postMessage({ type: 'status', message: 'AI Ensemble: Cleared.' });
            break;
        case 'update_config':
            terminalMapping = payload.terminalMapping;
            rouletteWheel = payload.rouletteWheel;
            break;
    }
};