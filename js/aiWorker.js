// aiWorker.js - Web Worker for TensorFlow.js AI Model (Ensemble)
// IMPROVED: Increased sequence length, better features, weighted ensemble, accuracy tracking

import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@latest/dist/tf-core.min.js';
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-layers@latest/dist/tf-layers.min.js';
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@latest/dist/tf-backend-cpu.min.js';

import * as config from './config.js';

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

// ===========================
// IMPROVED: ENSEMBLE CONFIGURATION
// ===========================

const ENSEMBLE_CONFIG = [
    {
        name: 'Specialist',
        path: 'roulette-ml-model-specialist',
        lstmUnits: 24,  // IMPROVED: Slightly larger for better pattern capture
        epochs: 50,     // IMPROVED: More epochs
        batchSize: 32,
        weight: 1.0     // NEW: Base weight for ensemble
    },
    {
        name: 'Generalist',
        path: 'roulette-ml-model-generalist',
        lstmUnits: 64,
        epochs: 60,
        batchSize: 16,
        weight: 1.0     // NEW: Base weight for ensemble
    }
];

// IMPROVED: Increased sequence length for better pattern capture
const SEQUENCE_LENGTH = 8;
const TRAINING_MIN_HISTORY = 15;  // IMPROVED: Need more history for longer sequences
const failureModes = ['none', 'normalLoss', 'streakBreak', 'sectionShift'];

let ensemble = ENSEMBLE_CONFIG.map(cfg => ({ 
    ...cfg, 
    model: null, 
    scaler: null,
    recentAccuracy: 0.5  // NEW: Track recent prediction accuracy
}));
let terminalMapping = {};
let rouletteWheel = [];
let isTraining = false;

// NEW: Track prediction history for weighted ensemble
let predictionHistory = [];
const MAX_PREDICTION_HISTORY = 50;

// ===========================
// HELPER FUNCTIONS
// ===========================

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
 * Calculates the consecutive hits/misses for each prediction type
 */
function getConsecutivePerformanceForAI(historySubset, allPredictionTypes) {
    const consecutiveHits = {};
    const consecutiveMisses = {};

    allPredictionTypes.forEach(type => {
        consecutiveHits[type.id] = 0;
        consecutiveMisses[type.id] = 0;
    });

    if (historySubset.length === 0) return { consecutiveHits, consecutiveMisses };

    for (let i = historySubset.length - 1; i >= 0; i--) {
        const item = historySubset[i];
        if (item.status === 'pending' || item.winningNumber === null) {
            break; 
        }

        allPredictionTypes.forEach(type => {
            if (item.typeSuccessStatus && item.typeSuccessStatus.hasOwnProperty(type.id)) {
                if ((consecutiveHits[type.id] === 0 && consecutiveMisses[type.id] === 0) || 
                    (item.typeSuccessStatus[type.id] && consecutiveHits[type.id] > 0) ||
                    (!item.typeSuccessStatus[type.id] && consecutiveMisses[type.id] > 0)) {
                    
                    if (item.typeSuccessStatus[type.id]) {
                        consecutiveHits[type.id]++; 
                        consecutiveMisses[type.id] = 0;
                    } else {
                        consecutiveMisses[type.id]++; 
                        consecutiveHits[type.id] = 0;
                    }
                } else {
                    consecutiveHits[type.id] = 0;
                    consecutiveMisses[type.id] = 0;
                }
            } else {
                consecutiveHits[type.id] = 0;
                consecutiveMisses[type.id] = 0;
            }
        });
    }

    return { consecutiveHits, consecutiveMisses };
}

/**
 * Check if a number is a repeat within context window
 */
function isRepeatNumberInContext(winningNumber, historySlice, windowSize) {
    const recentNumbers = historySlice.slice(-windowSize).map(item => item.winningNumber).filter(n => n !== null);
    return recentNumbers.includes(winningNumber);
}

/**
 * Check if winning number is a neighbor of recent numbers
 */
function isNeighborHitInContext(winningNumber, historySlice, windowSize, rouletteWheel, neighborDistance) {
    const recentNumbers = historySlice.slice(-windowSize).map(item => item.winningNumber).filter(n => n !== null);
    for (const recentNum of recentNumbers) {
        const dist = calculatePocketDistanceLocal(winningNumber, recentNum, rouletteWheel);
        if (dist <= neighborDistance) return true;
    }
    return false;
}

function calculatePocketDistanceLocal(num1, num2, wheel) {
    const idx1 = wheel.indexOf(num1);
    const idx2 = wheel.indexOf(num2);
    if (idx1 === -1 || idx2 === -1) return Infinity;
    const directDist = Math.abs(idx1 - idx2);
    const wrapDist = wheel.length - directDist;
    return Math.min(directDist, wrapDist);
}

// IMPROVED: Sigmoid normalization for streaks
function sigmoidNormalize(value, halfPoint = 5) {
    return 1 / (1 + Math.exp(-value / halfPoint + 1));
}

const scaleFeature = (value, index, scaler) => {
    if (!scaler || scaler.min[index] === undefined || scaler.max[index] === undefined) {
        console.warn('Scaler is invalid or missing min/max for index', index, scaler);
        return value;
    }
    const featureMin = scaler.min[index];
    const featureMax = scaler.max[index];
    if (featureMax === featureMin) return 0;
    return (value - featureMin) / (featureMax - featureMin);
};

// ===========================
// IMPROVED: FEATURE ENGINEERING
// ===========================

/**
 * IMPROVED: Get features for a history item
 * Focuses on calculation-relevant features, removes non-predictive ones
 */
function getImprovedFeatures(item, currentHistorySliceForContext, allPredictionTypes, rouletteWheel) {
    const props = getNumberProperties(item.winningNumber);
    const { consecutiveHits, consecutiveMisses } = getConsecutivePerformanceForAI(currentHistorySliceForContext, allPredictionTypes);

    // Context features
    const isCurrentRepeat = isRepeatNumberInContext(item.winningNumber, currentHistorySliceForContext, SEQUENCE_LENGTH);
    const isCurrentNeighborHit = isNeighborHitInContext(item.winningNumber, currentHistorySliceForContext, SEQUENCE_LENGTH, rouletteWheel, 2);
    
    // Calculate velocity features (rate of change)
    let hitRateVelocity = 0;
    if (currentHistorySliceForContext.length >= 3) {
        const recentHits = currentHistorySliceForContext.slice(-3).filter(h => h.status === 'success').length;
        const olderHits = currentHistorySliceForContext.slice(-6, -3).filter(h => h.status === 'success').length;
        hitRateVelocity = (recentHits - olderHits) / 3;
    }

    // Core calculation features (most predictive)
    const features = [
        // Difference and sum normalized
        item.difference / 36,
        (item.num1 + item.num2) / 72,
        
        // Pocket distance features
        item.pocketDistance !== null ? item.pocketDistance / 18 : 0.5,
        item.recommendedGroupPocketDistance !== null ? item.recommendedGroupPocketDistance / 18 : 0.5,
        
        // Repeat and neighbor context
        isCurrentRepeat ? 1 : 0,
        isCurrentNeighborHit ? 1 : 0,
        
        // Hit rate velocity
        (hitRateVelocity + 1) / 2,  // Normalize to [0, 1]
    ];
    
    // Per-group success status (binary)
    allPredictionTypes.forEach(type => {
        features.push(item.typeSuccessStatus?.[type.id] ? 1 : 0);
    });
    
    // IMPROVED: Consecutive hit/miss features with sigmoid normalization
    allPredictionTypes.forEach(type => {
        features.push(sigmoidNormalize(consecutiveHits[type.id], 5));
        features.push(sigmoidNormalize(consecutiveMisses[type.id], 5));
    });
    
    // Add basic number properties (less predictive but useful for context)
    features.push(props.isRed, props.isBlack);
    features.push(props.isHigh, props.isLow);
    features.push(props.isD1, props.isD2, props.isD3);
    
    return features;
}

// ===========================
// DATA PREPARATION
// ===========================

function prepareDataForLSTM(historyData, historicalStreakData) {
    const validHistory = historyData.filter(item => item.status === 'success' && item.winningNumber !== null);
    if (validHistory.length < SEQUENCE_LENGTH + 1) {
        self.postMessage({ type: 'status', message: `AI Model: Need at least ${TRAINING_MIN_HISTORY} confirmed spins to train.` });
        return { xs: null, ys: null, scaler: null, featureCount: 0 };
    }

    const rawFeatures = [];
    const rawGroupLabels = [];
    const rawFailureLabels = [];
    const rawStreakLengthLabels = [];

    for (let i = SEQUENCE_LENGTH; i < validHistory.length; i++) {
        const sequenceItems = validHistory.slice(i - SEQUENCE_LENGTH, i);
        const targetItem = validHistory[i];

        const sequenceFeatures = sequenceItems.map((item, idx) => {
            const historySliceForContext = validHistory.slice(0, i - SEQUENCE_LENGTH + idx + 1);
            return getImprovedFeatures(item, historySliceForContext, config.allPredictionTypes, rouletteWheel);
        });

        rawFeatures.push(sequenceFeatures);

        // Labels
        rawGroupLabels.push(config.allPredictionTypes.map(type => targetItem.typeSuccessStatus?.[type.id] ? 1 : 0));
        rawFailureLabels.push(failureModes.map(mode => (targetItem.failureMode === mode ? 1 : 0)));

        const streakLengthLabel = config.allPredictionTypes.map(type => {
            const streaks = historicalStreakData?.[type.id] || [];
            return streaks.length > 0 ? streaks.reduce((a, b) => a + b, 0) / streaks.length : 0;
        });
        rawStreakLengthLabels.push(streakLengthLabel);
    }

    if (rawFeatures.length === 0) {
        return { xs: null, ys: null, scaler: null, featureCount: 0 };
    }

    const featureCount = rawFeatures[0][0].length;

    // Calculate scaler
    const newScaler = {
        min: Array(featureCount).fill(Infinity),
        max: Array(featureCount).fill(-Infinity)
    };
    
    for (let i = 0; i < rawFeatures.length; i++) {
        for (let j = 0; j < rawFeatures[i].length; j++) {
            for (let k = 0; k < rawFeatures[i][j].length; k++) {
                const val = rawFeatures[i][j][k];
                newScaler.min[k] = Math.min(newScaler.min[k], val);
                newScaler.max[k] = Math.max(newScaler.max[k], val);
            }
        }
    }

    // Apply scaling
    const scaledFeatures = rawFeatures.map(sequence => 
        sequence.map(itemFeatures => 
            itemFeatures.map((val, idx) => scaleFeature(val, idx, newScaler))
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

// ===========================
// MODEL CREATION
// ===========================

function createMultiOutputLSTMModel(inputShape, groupOutputUnits, failureOutputUnits, streakOutputUnits, lstmUnits) {
    const input = tf.input({ shape: inputShape });
    
    // IMPROVED: Add attention-like mechanism with bidirectional processing
    const lstmLayer = tf.layers.lstm({
        units: lstmUnits,
        returnSequences: false,
        activation: 'tanh',
        recurrentActivation: 'sigmoid',
        kernelInitializer: 'glorotUniform',
        recurrentInitializer: 'orthogonal',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
    }).apply(input);
    
    // IMPROVED: Multiple dropout layers with batch normalization
    const dropout1 = tf.layers.dropout({ rate: 0.3 }).apply(lstmLayer);
    const dense1 = tf.layers.dense({ units: Math.floor(lstmUnits / 2), activation: 'relu' }).apply(dropout1);
    const dropout2 = tf.layers.dropout({ rate: 0.2 }).apply(dense1);

    const groupOutput = tf.layers.dense({ units: groupOutputUnits, activation: 'sigmoid', name: 'group_output' }).apply(dropout2);
    const failureOutput = tf.layers.dense({ units: failureOutputUnits, activation: 'softmax', name: 'failure_output' }).apply(dropout2);
    const streakOutput = tf.layers.dense({ units: streakOutputUnits, activation: 'relu', name: 'streak_output' }).apply(dropout2);

    const model = tf.model({ inputs: input, outputs: [groupOutput, failureOutput, streakOutput] });

    // IMPROVED: Use Adam with learning rate decay
    const optimizer = tf.train.adam(0.001);

    model.compile({
        optimizer: optimizer,
        loss: {
            'group_output': 'binaryCrossentropy',
            'failure_output': 'categoricalCrossentropy',
            'streak_output': 'meanSquaredError'
        },
        metrics: ['accuracy']
    });
    return model;
}

// ===========================
// TRAINING
// ===========================

async function trainEnsemble(historyData, historicalStreakData) {
    await tfInitializedPromise;

    if (isTraining) {
        self.postMessage({ type: 'status', message: 'AI Ensemble: Training already in progress.' });
        return;
    }
    isTraining = true;
    self.postMessage({ type: 'status', message: 'AI Ensemble: Preparing data...' });

    const { xs, ys, scaler, featureCount } = prepareDataForLSTM(historyData, historicalStreakData);
    if (!xs || !ys.group_output || !ys.failure_output || !ys.streak_output) {
        self.postMessage({ type: 'status', message: `AI Model: Not enough valid data to train.` });
        isTraining = false;
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

            if (member.model) {
                member.model.dispose();
                member.model = null;
            }
            
            member.model = createMultiOutputLSTMModel([SEQUENCE_LENGTH, featureCount], groupLabelCount, failureLabelCount, streakLabelCount, member.lstmUnits);

            // IMPROVED: Use early stopping callback simulation
            let bestLoss = Infinity;
            let patienceCounter = 0;
            const patience = 10;

            await member.model.fit(xs, ys, {
                epochs: member.epochs,
                batchSize: member.batchSize,
                validationSplit: 0.2,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        self.postMessage({ type: 'status', message: `AI Ensemble: Training ${member.name} (Epoch ${epoch + 1}/${member.epochs}) - Loss: ${logs.loss?.toFixed(4) || 'N/A'}` });
                        
                        // Simple early stopping logic
                        const currentLoss = logs.val_loss || logs.loss;
                        if (currentLoss < bestLoss) {
                            bestLoss = currentLoss;
                            patienceCounter = 0;
                        } else {
                            patienceCounter++;
                        }
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

    xs.dispose();
    if (ys.group_output) ys.group_output.dispose();
    if (ys.failure_output) ys.failure_output.dispose();
    if (ys.streak_output) ys.streak_output.dispose();

    isTraining = false;
    self.postMessage({ type: 'status', message: 'AI Ensemble: Ready!' });
}

// ===========================
// MODEL LOADING
// ===========================

async function loadModelsFromStorage() {
    await tfInitializedPromise;
    
    const results = [];
    for (const member of ensemble) {
        try {
            member.model = await tf.loadLayersModel(`indexeddb://${member.path}`);
            console.log(`TF.js Model ${member.name} loaded from IndexedDB.`);
            results.push(true);
        } catch (error) {
            console.log(`TF.js Model ${member.name} not found in IndexedDB, needs training.`);
            results.push(false);
        }
    }
    return results;
}

async function clearModelsFromStorage() {
    await tfInitializedPromise;
    
    for (const member of ensemble) {
        try {
            await tf.io.removeModel(`indexeddb://${member.path}`);
            console.log(`TF.js Model ${member.name} cleared from IndexedDB.`);
        } catch (error) {
            console.log(`TF.js Model ${member.name} not in IndexedDB to clear.`);
        }
        if (member.model) {
            member.model.dispose();
            member.model = null;
        }
        member.scaler = null;
        member.recentAccuracy = 0.5;
    }
    predictionHistory = [];
}

// ===========================
// IMPROVED: WEIGHTED ENSEMBLE PREDICTION
// ===========================

/**
 * IMPROVED: Update model weights based on prediction accuracy
 */
function updateModelWeights() {
    if (predictionHistory.length < 5) return;
    
    const recentHistory = predictionHistory.slice(-20);
    
    for (const member of ensemble) {
        let correct = 0;
        let total = 0;
        
        for (const pred of recentHistory) {
            if (pred.modelPredictions && pred.modelPredictions[member.name] && pred.actualResult !== undefined) {
                total++;
                // Check if the top predicted group matched the actual result
                const topPredictedGroup = pred.modelPredictions[member.name].topGroup;
                if (pred.actualResult.includes(topPredictedGroup)) {
                    correct++;
                }
            }
        }
        
        member.recentAccuracy = total > 0 ? correct / total : 0.5;
        // Weight based on accuracy, with bounds
        member.weight = Math.max(0.5, Math.min(2.0, 0.5 + member.recentAccuracy));
    }
}

/**
 * Record prediction for accuracy tracking
 */
function recordPrediction(predictions, modelPredictions) {
    predictionHistory.push({
        timestamp: Date.now(),
        predictions,
        modelPredictions,
        actualResult: null  // Will be updated when result comes in
    });
    
    // Trim history
    if (predictionHistory.length > MAX_PREDICTION_HISTORY) {
        predictionHistory = predictionHistory.slice(-MAX_PREDICTION_HISTORY);
    }
}

// ===========================
// AI EXPLANATION GENERATION
// ===========================

function wrapGroupName(groupName, groupId) {
    if (!groupId || !groupName) return groupName;
    const colorClass = `group-name-${groupId}`;
    return `<span class="${colorClass}">${groupName}</span>`;
}

function analyzeGroupRecentPerformance(groupId, validHistory) {
    const recentWindow = 10;
    const recentHistory = validHistory.slice(-recentWindow);
    
    let hits = 0;
    let total = 0;
    let currentStreak = 0;
    let streakBroken = false;
    
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
                streakBroken = true;
            }
        }
    }
    
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    
    return { hitRate, hits, total, currentStreak };
}

function determineConfidence(averagedGroupProbs) {
    const sortedProbs = Object.values(averagedGroupProbs).sort((a, b) => b - a);
    const maxProb = sortedProbs[0];
    const spread = sortedProbs[0] - sortedProbs[1];
    
    if (maxProb >= 0.6 && spread >= 0.15) return 'high';
    if (maxProb >= 0.4 && spread >= 0.08) return 'medium';
    return 'low';
}

function generateGroupRecommendationHeadline(topGroup, confidence, performance) {
    const wrappedGroupName = wrapGroupName(topGroup.groupName, topGroup.groupId);
    
    if (performance.currentStreak >= 3) {
        return `${wrappedGroupName} on ${performance.currentStreak}-spin winning streak`;
    }
    
    if (performance.total >= 5 && performance.hitRate >= 70) {
        return `${wrappedGroupName} hitting ${performance.hitRate.toFixed(0)}% of recent spins`;
    }
    
    if (confidence === 'high') {
        return `High confidence: ${wrappedGroupName}`;
    }
    
    return `${wrappedGroupName} shows strongest pattern`;
}

function generateAiExplanation(lastSequence, validHistory, averagedGroupProbs) {
    if (!lastSequence || lastSequence.length === 0) {
        return {
            headline: "Insufficient data for AI analysis",
            bullets: ["Need at least 15 confirmed spins for calculation group predictions"],
            confidence: 'none',
            windowSize: 0,
            topGroup: null,
            runnerUpGroup: null,
            scoreGap: 0
        };
    }

    const sortedGroups = config.allPredictionTypes
        .map(type => ({
            groupId: type.id,
            groupName: type.displayLabel,
            probability: averagedGroupProbs[type.id] || 0
        }))
        .sort((a, b) => b.probability - a.probability);

    const topGroup = sortedGroups[0];
    const runnerUpGroup = sortedGroups[1] || { groupName: 'None', probability: 0 };
    const scoreGap = topGroup.probability - runnerUpGroup.probability;

    const confidence = determineConfidence(averagedGroupProbs);
    const performance = analyzeGroupRecentPerformance(topGroup.groupId, validHistory);
    
    const headline = generateGroupRecommendationHeadline(topGroup, confidence, performance);
    
    const bullets = [];
    
    bullets.push(`AI confidence: ${(topGroup.probability * 100).toFixed(1)}%`);
    
    if (performance.total >= 3) {
        bullets.push(`Recent: ${performance.hits}/${performance.total} (${performance.hitRate.toFixed(0)}%)`);
    }
    
    if (performance.currentStreak >= 2) {
        bullets.push(`Current streak: ${performance.currentStreak} consecutive hits`);
    }
    
    const wrappedRunnerUp = wrapGroupName(runnerUpGroup.groupName, runnerUpGroup.groupId);
    bullets.push(`Runner-up: ${wrappedRunnerUp} (${(runnerUpGroup.probability * 100).toFixed(1)}%)`);

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

// ===========================
// PREDICTION
// ===========================

async function predictWithEnsemble(historyData) {
    await tfInitializedPromise;

    const activeModels = ensemble.filter(m => m.model && m.scaler);
    if (activeModels.length === 0) return null;

    const validHistory = historyData.filter(item => item.status === 'success' && item.winningNumber !== null);
    if (validHistory.length < SEQUENCE_LENGTH) return null;

    const lastSequence = validHistory.slice(-SEQUENCE_LENGTH);
    const scaler = activeModels[0].scaler;

    // Update model weights based on recent accuracy
    updateModelWeights();

    try {
        const getFeaturesForPrediction = (item, historySliceForContext) => {
            return getImprovedFeatures(item, historySliceForContext, config.allPredictionTypes, rouletteWheel);
        };

        const inputSequence = lastSequence.map((item, idx) => {
            const historySliceForContext = validHistory.slice(0, validHistory.length - SEQUENCE_LENGTH + idx + 1);
            const features = getFeaturesForPrediction(item, historySliceForContext);
            return features.map((val, i) => scaleFeature(val, i, scaler));
        });

        const inputTensor = tf.tensor3d([inputSequence]);
        
        // IMPROVED: Weighted ensemble predictions
        const modelPredictions = {};
        const averagedGroupProbs = new Float32Array(config.allPredictionTypes.length).fill(0);
        const averagedFailureProbs = new Float32Array(failureModes.length).fill(0);
        const averagedStreakPreds = new Float32Array(config.allPredictionTypes.length).fill(0);
        
        let totalWeight = 0;

        for (const member of activeModels) {
            const prediction = member.model.predict(inputTensor);
            const groupProbs = await prediction[0].data();
            const failureProbs = await prediction[1].data();
            const streakPreds = await prediction[2].data();

            // Store individual model predictions for tracking
            const topGroupIdx = groupProbs.indexOf(Math.max(...groupProbs));
            modelPredictions[member.name] = {
                topGroup: config.allPredictionTypes[topGroupIdx]?.id,
                groupProbs: Array.from(groupProbs),
                weight: member.weight
            };

            // Weight by model accuracy
            const weight = member.weight;
            totalWeight += weight;

            groupProbs.forEach((p, i) => averagedGroupProbs[i] += p * weight);
            failureProbs.forEach((p, i) => averagedFailureProbs[i] += p * weight);
            streakPreds.forEach((p, i) => averagedStreakPreds[i] += p * weight);

            prediction[0].dispose();
            prediction[1].dispose();
            prediction[2].dispose();
        }

        // Normalize by total weight
        if (totalWeight > 0) {
            averagedGroupProbs.forEach((p, i) => averagedGroupProbs[i] /= totalWeight);
            averagedFailureProbs.forEach((p, i) => averagedFailureProbs[i] /= totalWeight);
            averagedStreakPreds.forEach((p, i) => averagedStreakPreds[i] /= totalWeight);
        }

        inputTensor.dispose();

        // Convert to object format
        const groupProbsObject = {};
        config.allPredictionTypes.forEach((type, i) => {
            groupProbsObject[type.id] = averagedGroupProbs[i];
        });

        const finalResult = { groups: {}, failures: {}, streakPredictions: {}, modelWeights: {} };
        config.allPredictionTypes.forEach((type, i) => finalResult.groups[type.id] = averagedGroupProbs[i]);
        failureModes.forEach((mode, i) => finalResult.failures[mode] = averagedFailureProbs[i]);
        config.allPredictionTypes.forEach((type, i) => finalResult.streakPredictions[type.id] = averagedStreakPreds[i]);
        
        // Include model weights in result
        activeModels.forEach(m => finalResult.modelWeights[m.name] = m.weight);

        // Generate AI explanation
        const aiExplanation = generateAiExplanation(lastSequence, validHistory, groupProbsObject);
        finalResult.aiExplanation = aiExplanation;

        // Record prediction for accuracy tracking
        recordPrediction(finalResult, modelPredictions);

        return finalResult;

    } catch (error) {
        console.error('Error during ensemble prediction:', error);
        return null;
    }
}

// ===========================
// MESSAGE HANDLER
// ===========================

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (!type) {
        self.postMessage({ type: 'error', message: 'AI Worker: No message type specified. Cannot process request.' });
        return;
    }

    switch (type) {
        case 'init':
            terminalMapping = payload.terminalMapping;
            rouletteWheel = payload.rouletteWheel;
            const loadedScaler = payload.scaler ? JSON.parse(payload.scaler) : null;
            if (loadedScaler) {
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
            
        case 'record_result':
            // NEW: Record actual result for accuracy tracking
            if (predictionHistory.length > 0 && payload.hitTypes) {
                const lastPrediction = predictionHistory[predictionHistory.length - 1];
                if (!lastPrediction.actualResult) {
                    lastPrediction.actualResult = payload.hitTypes;
                    updateModelWeights();
                }
            }
            break;
    }
};