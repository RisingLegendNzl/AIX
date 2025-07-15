// js/rlWorker.js

// Keep the module imports to ensure the library code executes and defines globals
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@latest/dist/tf-core.min.js';
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-layers@latest/dist/tf-layers.min.js';
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@latest/dist/tf-backend-cpu.min.js';

import * as config from './config.js'; // Import config to access RL_CONFIG

// Access the global `tf` object from `self`
const tf = self.tf;

if (!tf) {
    const errorMsg = 'TensorFlow.js global object (tf) is not defined after import. Cannot proceed.';
    console.error(errorMsg);
    self.postMessage({ type: 'error', payload: { message: `RL Model: ${errorMsg}` } });
    throw new Error(errorMsg);
}

async function initTensorFlow() {
    try {
        await tf.ready();
        tf.enableProdMode();
        tf.setBackend('cpu');
        if (config.DEBUG_MODE) console.log('TensorFlow.js backend (CPU) initialized in rlWorker.');
        self.postMessage({ type: 'status', payload: { message: 'RL Model: TensorFlow.js Ready.' } });
    } catch (err) {
        console.error('Failed to initialize TensorFlow.js backend in rlWorker:', err);
        self.postMessage({ type: 'error', payload: { message: 'RL Model: Failed to initialize TensorFlow.js backend.' } });
        throw err;
    }
}

let tfInitializedPromise = initTensorFlow();

// --- RL Agent State ---
let rlConfig = {};
let currentAdaptiveRates = {}; // The rates the RL agent is currently using/tuning
let currentEpisodeHistory = []; // History within the current RL episode
let episodeSpinsCount = 0; // Counter for spins within the current episode
let rlPolicyModel = null;

// This function builds a simple policy network to output adjustments (actions)
function createRlPolicyModel(inputShape, outputUnits) {
    const input = tf.input({ shape: [inputShape] });
    const dense1 = tf.layers.dense({ units: 32, activation: 'relu', kernelInitializer: 'heNormal' }).apply(input);
    const dropout1 = tf.layers.dropout({ rate: 0.2 }).apply(dense1);
    const dense2 = tf.layers.dense({ units: 16, activation: 'relu', kernelInitializer: 'heNormal' }).apply(dropout1);
    const dropout2 = tf.layers.dropout({ rate: 0.1 }).apply(dense2);
    // Output layer: 'linear' activation for predicting continuous delta values
    const output = tf.layers.dense({ units: outputUnits, activation: 'linear' }).apply(dropout2);
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({ optimizer: tf.train.adam(rlConfig.learningRate), loss: 'meanSquaredError' });
    return model;
}

// Function to get the RL agent's state representation (input to the policy model)
// This state should capture the performance context relevant to adaptive rates
function getRlState(history, currentRates) {
    // Collect rolling performance metrics over a window (e.g., last `episodeLength` spins)
    const recentPlays = history.slice(-rlConfig.episodeLength).filter(item => 
        item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails?.finalScore > 0 && item.recommendationDetails?.signal !== 'Avoid Play'
    );

    let totalPlaysConsidered = recentPlays.length;
    let wins = recentPlays.filter(item => item.status === 'success').length;
    let losses = recentPlays.filter(item => item.status === 'fail').length;

    let totalStreakBreaks = recentPlays.filter(item => item.failureMode === 'streakBreak').length;
    let totalNearMisses = recentPlays.filter(item => item.failureMode === 'nearMiss').length;
    let totalSectionShifts = recentPlays.filter(item => item.failureMode === 'sectionShift').length;
    let totalNormalLosses = recentPlays.filter(item => item.failureMode === 'normalLoss').length;

    const winRate = totalPlaysConsidered > 0 ? wins / totalPlaysConsidered : 0.5;
    const lossRate = totalPlaysConsidered > 0 ? losses / totalPlaysConsidered : 0.5;

    // Feature scaling for state values (0 to 1 range)
    const scale = (val, max) => Math.min(1, val / max);

    // State vector: [winRate, lossRate, scaled_streakBreaks, scaled_nearMisses, scaled_sectionShifts, scaled_normalLosses, current_adaptive_rates...]
    const stateVector = [
        winRate,
        lossRate,
        scale(totalStreakBreaks, rlConfig.episodeLength),
        scale(totalNearMisses, rlConfig.episodeLength),
        scale(totalSectionShifts, rlConfig.episodeLength),
        scale(totalNormalLosses, rlConfig.episodeLength),
        currentRates.SUCCESS,
        currentRates.FAILURE,
        currentRates.MIN_INFLUENCE,
        currentRates.MAX_INFLUENCE,
        currentRates.FORGET_FACTOR,
        currentRates.CONFIDENCE_WEIGHTING_MULTIPLIER,
        currentRates.CONFIDENCE_WEIGHTING_MIN_THRESHOLD / 50 // Assuming max threshold is 50 for scaling
    ];

    // Add scaled failure multipliers to state as well
    for (const key of rlConfig.tunableFailureMultipliers) {
        stateVector.push((currentRates.FAILURE_MULTIPLIERS[key] || 1.0) / 5.0); // Assuming max multiplier is 5 for scaling
    }
    
    return tf.tensor2d([stateVector]);
}

// Function to calculate the reward for the current episode
// Reward is based on win/loss ratio, adjusted by specific failure modes.
function calculateReward(episodeHistory) {
    let episodeWins = 0;
    let episodeLosses = 0;
    let episodeAvoidedLosses = 0;
    let totalPlaysConsidered = 0;
    let netReward = 0;

    episodeHistory.forEach(item => {
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails?.finalScore > 0) {
            if (item.recommendationDetails.signal === 'Avoid Play') {
                episodeAvoidedLosses++;
                netReward += 0.1; // Small positive reward for correctly avoiding a bad play
            } else {
                totalPlaysConsidered++;
                if (item.status === 'success') {
                    episodeWins++;
                    netReward += 1.0; // Base reward for a win
                } else {
                    episodeLosses++;
                    // Base penalty for a loss
                    netReward -= 1.0; 

                    // Adjust penalty based on failure mode
                    switch (item.failureMode) {
                        case 'streakBreak':
                            netReward -= 0.5; // Additional penalty for breaking a streak
                            break;
                        case 'sectionShift':
                            netReward -= 0.8; // Higher additional penalty for a significant shift
                            break;
                        case 'nearMiss':
                            netReward += 0.3; // Small positive adjustment, meaning it was "almost right"
                            break;
                        case 'normalLoss':
                        default:
                            // Already included in base penalty
                            break;
                    }
                }
            }
        }
    });

    // Normalize net reward based on the number of plays considered in the episode
    if (totalPlaysConsidered + episodeAvoidedLosses > 0) {
        // Average reward per decision, clamped to a reasonable range
        return Math.max(-1.5, Math.min(1.5, netReward / (totalPlaysConsidered + episodeAvoidedLosses)));
    }
    
    return 0; // Neutral reward if no actionable decisions were made
}

// Function to interpret model output as actions (deltas) and apply them to rates
function applyActionsToRates(rates, actionDeltas) {
    const newRates = { 
        ...rates,
        FAILURE_MULTIPLIERS: { ...rates.FAILURE_MULTIPLIERS } // Deep copy failure multipliers
    };
    const tunableParams = rlConfig.tunableAdaptiveRates;
    const tunableMultipliers = rlConfig.tunableFailureMultipliers;
    const actionValues = actionDeltas.arraySync()[0]; // Get the actual numerical values from the tensor
    let actionIndex = 0;

    // Apply adjustments to main adaptive rates
    for (const param of tunableParams) {
        const adjustment = actionValues[actionIndex] * rlConfig.adjustmentSteps[param];
        newRates[param] = rates[param] + adjustment;
        // Clamp values to sensible ranges
        if (param === 'SUCCESS' || param === 'FAILURE') newRates[param] = Math.max(0.01, Math.min(1.0, newRates[param]));
        if (param === 'MIN_INFLUENCE') newRates[param] = Math.max(0.0, Math.min(1.0, newRates[param]));
        if (param === 'MAX_INFLUENCE') newRates[param] = Math.max(1.0, Math.min(5.0, newRates[param]));
        if (param === 'FORGET_FACTOR') newRates[param] = Math.max(0.9, Math.min(0.999, newRates[param]));
        if (param === 'CONFIDENCE_WEIGHTING_MULTIPLIER') newRates[param] = Math.max(0.001, Math.min(0.1, newRates[param]));
        if (param === 'CONFIDENCE_WEIGHTING_MIN_THRESHOLD') newRates[param] = Math.max(0, Math.min(50, newRates[param]));
        actionIndex++;
    }

    // Apply adjustments to failure multipliers
    for (const multiplierKey of tunableMultipliers) {
        const adjustment = actionValues[actionIndex] * rlConfig.adjustmentSteps.multiplierAdjustment;
        newRates.FAILURE_MULTIPLIERS[multiplierKey] = rates.FAILURE_MULTIPLIERS[multiplierKey] + adjustment;
        newRates.FAILURE_MULTIPLIERS[multiplierKey] = Math.max(0.1, Math.min(5.0, newRates.FAILURE_MULTIPLIERS[multiplierKey])); // Sensible range for multipliers
        actionIndex++;
    }

    return newRates;
}

// Main RL learning loop
async function learnFromEpisode() {
    if (episodeSpinsCount < rlConfig.episodeLength) return; // Not enough data for an episode yet
    if (currentEpisodeHistory.length === 0) {
        self.postMessage({ type: 'status', payload: { message: 'RL Model: No history for episode.' } });
        return;
    }

    await tfInitializedPromise;

    self.postMessage({ type: 'status', payload: { message: 'RL Model: Learning from episode...' } });

    const reward = calculateReward(currentEpisodeHistory);
    const currentStateTensor = getRlState(currentEpisodeHistory, currentAdaptiveRates);

    // Predict current actions (deltas) from the policy model
    const currentPredictedActionsTensor = rlPolicyModel.predict(currentStateTensor);
    const currentPredictedActionsArray = currentPredictedActionsTensor.arraySync()[0];

    // Calculate "target" actions for training. This is a very simplified policy gradient idea:
    // We adjust the `currentPredictedActions` by `(reward * learningRate)` to create a `targetAction`.
    // The model is then trained to produce this `targetAction` from the `currentStateTensor`.
    // This implicitly guides the policy towards actions that lead to higher rewards.
    const numTunableParams = rlConfig.tunableAdaptiveRates.length + rlConfig.tunableFailureMultipliers.length;
    const targetActionsArray = new Array(numTunableParams);

    for(let i = 0; i < numTunableParams; i++) {
        // Use an epsilon-greedy approach for exploration during learning
        let actionDelta = currentPredictedActionsArray[i];
        if (Math.random() < rlConfig.explorationRate) {
            // Explore: add random noise to the action
            actionDelta += (Math.random() * 2 - 1) * 0.1; // Random value between -0.1 and 0.1
        }
        
        // Scale action by reward and learning rate.
        // A positive reward moves actions in the predicted direction, negative moves opposite.
        targetActionsArray[i] = actionDelta + (reward * rlConfig.learningRate * rlConfig.adjustmentSteps[Object.keys(rlConfig.adjustmentSteps)[i] || 'multiplierAdjustment']); // Heuristic adjustment
        // This adjustment step mapping is still a bit raw, ideally actions are directly interpretable deltas.
    }
    const targetActionsTensor = tf.tensor2d([targetActionsArray]);

    // Train the model
    await rlPolicyModel.fit(currentStateTensor, targetActionsTensor, {
        epochs: 1, // Train for one epoch per learning step
        verbose: 0, // Suppress verbose output
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                if (config.DEBUG_MODE) console.log(`RL Model: Training loss: ${logs.loss ? logs.loss.toFixed(4) : 'N/A'}`);
            }
        }
    });

    // After training, predict the *new* actions from the same current state
    // These new actions represent the refined policy, which we then apply to get the next `currentAdaptiveRates`.
    const newPredictedActionsTensor = rlPolicyModel.predict(currentStateTensor);
    currentAdaptiveRates = applyActionsToRates(currentAdaptiveRates, newPredictedActionsTensor);
    
    // Dispose of tensors to prevent memory leaks
    currentStateTensor.dispose();
    currentPredictedActionsTensor.dispose();
    targetActionsTensor.dispose();
    newPredictedActionsTensor.dispose();

    self.postMessage({ type: 'newAdaptiveRates', payload: { adaptiveRates: currentAdaptiveRates } });
    self.postMessage({ type: 'status', payload: { message: `RL Model: Episode complete. Reward: ${reward.toFixed(2)}` } });

    // Reset for next episode
    currentEpisodeHistory = [];
    episodeSpinsCount = 0;
}


// --- Message Handling for Web Worker ---
self.onmessage = async (event) => {
    const { type, payload } = event.data;

    try {
        await tfInitializedPromise;
    } catch (tfInitError) {
        console.error("RL Worker: TensorFlow.js was not initialized, cannot process message.", tfInitError);
        self.postMessage({ type: 'error', payload: { message: 'RL Model: Initialization failed. Cannot process request.' } });
        return;
    }

    switch (type) {
        case 'init':
            rlConfig = payload.config;
            currentAdaptiveRates = payload.currentAdaptiveRates;
            
            // Determine the number of output units based on tunable parameters
            const numTunableParams = rlConfig.tunableAdaptiveRates.length + rlConfig.tunableFailureMultipliers.length;
            // Calculate input shape based on getRlState's vector size
            const inputShape = 13 + rlConfig.tunableFailureMultipliers.length; // 13 from fixed metrics + base adaptive rates
            rlPolicyModel = createRlPolicyModel(inputShape, numTunableParams); 
            self.postMessage({ type: 'status', payload: { message: 'RL Model: Ready for learning.' } });
            break;
        case 'spinResult':
            if (!rlConfig.enabled) return;
            currentEpisodeHistory.push(payload.spinData);
            episodeSpinsCount++;

            if (episodeSpinsCount >= rlConfig.learningInterval) { // Check for learning interval
                learnFromEpisode();
            }
            break;
        case 'updateConfig': // To update RL config or initial rates dynamically
            if (payload.config) {
                rlConfig = payload.config;
                // Re-initialize model if input/output shapes might change due to config update
                const numTunableParams = rlConfig.tunableAdaptiveRates.length + rlConfig.tunableFailureMultipliers.length;
                const inputShape = 13 + rlConfig.tunableFailureMultipliers.length;
                if (!rlPolicyModel || rlPolicyModel.input.shape[1] !== inputShape || rlPolicyModel.output.shape[1] !== numTunableParams) {
                    if (rlPolicyModel) rlPolicyModel.dispose();
                    rlPolicyModel = createRlPolicyModel(inputShape, numTunableParams);
                }
            }
            if (payload.currentAdaptiveRates) currentAdaptiveRates = payload.currentAdaptiveRates;
            self.postMessage({ type: 'status', payload: { message: 'RL Model: Configuration updated.' } });
            break;
        case 'getRates': // For main thread to request current RL-tuned rates
            self.postMessage({ type: 'newAdaptiveRates', payload: { adaptiveRates: currentAdaptiveRates } });
            break;
    }
};
