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

// Placeholder for a simple RL "model" (e.g., a policy network)
// For a simple start, we can just use direct parameter adjustments.
// A full RL agent would have state representation, action space, and a Q-network or policy network.
// Let's define a minimal TF.js model here as a placeholder for future expansion.
let rlPolicyModel = null;

// This function would build a simple model to output adjustments (actions)
function createRlPolicyModel(inputShape, outputUnits) {
    const input = tf.input({ shape: [inputShape] });
    const dense1 = tf.layers.dense({ units: 32, activation: 'relu' }).apply(input);
    const dense2 = tf.layers.dense({ units: 16, activation: 'relu' }).apply(dense1);
    // Output layer should map to adjustments for each tunable parameter.
    // For now, let's just make it output `outputUnits` values, which we'll interpret as deltas.
    const output = tf.layers.dense({ units: outputUnits, activation: 'linear' }).apply(dense2);
    const model = tf.model({ inputs: input, outputs: [output] }); // Output needs to be an array for tf.model if it's one tensor
    model.compile({ optimizer: tf.train.adam(), loss: 'meanSquaredError' });
    return model;
}

// Function to get the RL agent's state representation (input to the policy model)
function getRlState(history, currentRates) {
    // This is a simplified state for demonstration.
    // A real RL state would be more complex: e.g., win/loss streaks, avg win rate,
    // distribution of failure modes, current adaptive influence values.
    let totalPlays = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalNearMisses = 0;
    let totalStreakBreaks = 0;

    history.forEach(item => {
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails?.finalScore > 0 && item.recommendationDetails?.signal !== 'Avoid Play') {
            totalPlays++;
            if (item.status === 'success') {
                totalWins++;
            } else {
                totalLosses++;
                if (item.failureMode === 'nearMiss') totalNearMisses++;
                if (item.failureMode === 'streakBreak') totalStreakBreaks++;
            }
        }
    });

    const winRate = totalPlays > 0 ? totalWins / totalPlays : 0.5;
    const lossRate = totalPlays > 0 ? totalLosses / totalPlays : 0.5;

    // Simple state vector: [winRate, lossRate, nearMissRate, streakBreakRate, current_SUCCESS, current_FAILURE, ...]
    const stateVector = [
        winRate,
        lossRate,
        totalLosses > 0 ? totalNearMisses / totalLosses : 0,
        totalLosses > 0 ? totalStreakBreaks / totalLosses : 0,
        currentRates.SUCCESS,
        currentRates.FAILURE,
        currentRates.MIN_INFLUENCE,
        currentRates.MAX_INFLUENCE,
        currentRates.FORGET_FACTOR,
        currentRates.CONFIDENCE_WEIGHTING_MULTIPLIER,
        currentRates.CONFIDENCE_WEIGHTING_MIN_THRESHOLD
    ];

    // Add failure multipliers to state as well
    for (const key of rlConfig.tunableFailureMultipliers) {
        stateVector.push(currentRates.FAILURE_MULTIPLIERS[key] || 1.0);
    }
    
    return tf.tensor2d([stateVector]);
}

// Function to calculate the reward for the current episode
function calculateReward(episodeHistory) {
    let episodeWins = 0;
    let episodeLosses = 0;
    let episodeAvoidedLosses = 0;
    let totalPlaysConsidered = 0; // Plays where a recommendation was made and not 'Avoid'

    episodeHistory.forEach(item => {
        // Only count as a "play" for reward if a recommendation was made and it wasn't an explicit 'Avoid Play'
        if (item.recommendedGroupId && item.winningNumber !== null && item.recommendationDetails?.finalScore > 0) {
            if (item.recommendationDetails.signal === 'Avoid Play') {
                episodeAvoidedLosses++;
            } else {
                totalPlaysConsidered++;
                if (item.status === 'success') {
                    episodeWins++;
                } else {
                    episodeLosses++;
                    // Penalize specific failure modes more
                    if (item.failureMode === 'streakBreak') episodeLosses += 0.5; // Additional penalty
                    if (item.failureMode === 'sectionShift') episodeLosses += 0.8; // Even higher additional penalty
                    if (item.failureMode === 'nearMiss') episodeLosses -= 0.2; // Small reward for near miss, reduces overall loss impact
                }
            }
        }
    });

    // Reward based on win/loss ratio, with bonus for avoided losses
    let reward = 0;
    if (totalPlaysConsidered > 0) {
        reward = (episodeWins - episodeLosses) / totalPlaysConsidered; // Simple win rate contribution
    } else {
        reward = 0; // No plays, neutral reward
    }
    
    // Add a bonus for avoided losses, as they represent successful strategy application
    reward += episodeAvoidedLosses * 0.1; // Small bonus per avoided loss

    // Clamp reward to a reasonable range
    reward = Math.max(-1, Math.min(1, reward));

    return reward;
}

// Function to interpret model output as actions and apply them to rates
function applyActionsToRates(rates, actions) {
    const newRates = { 
        ...rates,
        FAILURE_MULTIPLIERS: { ...rates.FAILURE_MULTIPLIERS } // Deep copy failure multipliers
    };
    const tunableParams = rlConfig.tunableAdaptiveRates;
    const tunableMultipliers = rlConfig.tunableFailureMultipliers;
    const actionValues = actions.arraySync()[0]; // Get the actual numerical values from the tensor
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

// Main RL learning loop (simplified for initial implementation)
async function learnFromEpisode() {
    if (episodeSpinsCount < rlConfig.episodeLength) return; // Not enough data for an episode yet
    if (currentEpisodeHistory.length === 0) { // Should not happen if episodeSpinsCount is met
        self.postMessage({ type: 'status', payload: { message: 'RL Model: No history for episode.' } });
        return;
    }

    await tfInitializedPromise;

    self.postMessage({ type: 'status', payload: { message: 'RL Model: Learning from episode...' } });

    const reward = calculateReward(currentEpisodeHistory);
    const currentStateTensor = getRlState(currentEpisodeHistory, currentAdaptiveRates);

    // Get the current predicted actions (deltas) from the model
    const currentPredictedActionsTensor = rlPolicyModel.predict(currentStateTensor);
    const currentPredictedActions = currentPredictedActionsTensor.arraySync()[0];

    // Calculate "target" actions for training. This is a very simplified policy gradient idea:
    // If reward is good, try to reinforce the current actions. If bad, try to move away.
    // A more robust RL setup would use a value function or more complex policy gradient.
    const numTunableParams = rlConfig.tunableAdaptiveRates.length + rlConfig.tunableFailureMultipliers.length;
    const targetActions = new Array(numTunableParams);

    for(let i = 0; i < numTunableParams; i++) {
        // This is a heuristic. A positive reward reinforces the current action/direction,
        // a negative reward pushes it in the opposite direction.
        // The strength of this reinforcement is scaled by the learning rate.
        targetActions[i] = currentPredictedActions[i] + (reward * rlConfig.learningRate);
    }
    const targetActionsTensor = tf.tensor2d([targetActions]);

    // Train the model to output these "target" actions from the current state
    await rlPolicyModel.fit(currentStateTensor, targetActionsTensor, {
        epochs: 1, // Train for one epoch per learning step
        verbose: 0, // Suppress verbose output
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                if (config.DEBUG_MODE) console.log(`RL Model: Training loss: ${logs.loss.toFixed(4)}`);
            }
        }
    });

    // After training, update the current adaptive rates by making a new prediction from the current state.
    // This uses the newly updated policy.
    const newPredictedActions = rlPolicyModel.predict(currentStateTensor);
    currentAdaptiveRates = applyActionsToRates(currentAdaptiveRates, newPredictedActions);
    
    // Ensure all tensors are disposed to prevent memory leaks
    currentStateTensor.dispose();
    currentPredictedActionsTensor.dispose();
    targetActionsTensor.dispose();
    newPredictedActions.dispose();

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
            // Input shape: number of features in stateVector. Check getRlState.
            // Current state vector size: 11 (fixed metrics + base adaptive rates) + number of tunableFailureMultipliers
            const inputShape = 11 + rlConfig.tunableFailureMultipliers.length;
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
            if (payload.config) rlConfig = payload.config;
            if (payload.currentAdaptiveRates) currentAdaptiveRates = payload.currentAdaptiveRates;
            self.postMessage({ type: 'status', payload: { message: 'RL Model: Configuration updated.' } });
            break;
        case 'getRates': // For main thread to request current RL-tuned rates
            self.postMessage({ type: 'newAdaptiveRates', payload: { adaptiveRates: currentAdaptiveRates } });
            break;
    }
};
