// js/state.js
import * as config from './config.js';

// --- Application State ---
export let history = [];
export let confirmedWinsLog = [];
export let isAiReady = false;
export let bestFoundParams = null;
export let currentVideoURL = null;
export let activePredictionTypes = [];

export let strategyStates = {
    weightedZone: { weight: 1.0, name: 'Neighbour Weighting' },
    proximityBoost: { weight: 1.0, name: 'Proximity Boost' }
};

export let patternMemory = {};

export let adaptiveFactorInfluences = {
    'Hit Rate': 1.0,
    'Streak': 1.0,
    'Proximity to Last Spin': 1.0,
    'Hot Zone Weighting': 1.0,
    'High AI Confidence': 1.0,
    'Statistical Trends': 1.0
};

// NEW: This will store the adaptive learning rates set by the RL agent.
// If null, the app uses config.ADAPTIVE_LEARNING_RATES defaults.
export let adaptiveLearningRatesOverride = null;

// --- Global Toggle States ---
export let useTrendConfirmation = config.DEFAULT_PARAMETERS.TOGGLES.useTrendConfirmation;
export let useWeightedZone = config.DEFAULT_PARAMETERS.TOGGLES.useWeightedZone;
export let useProximityBoost = config.DEFAULT_PARAMETERS.TOGGLES.useProximityBoost;
export let usePocketDistance = config.DEFAULT_PARAMETERS.TOGGLES.usePocketDistance;
export let useLowestPocketDistance = config.DEFAULT_PARAMETERS.TOGGLES.useLowestPocketDistance;
export let useAdvancedCalculations = config.DEFAULT_PARAMETERS.TOGGLES.useAdvancedCalculations;
export let useDynamicStrategy = config.DEFAULT_PARAMETERS.TOGGLES.useDynamicStrategy;
export let useAdaptivePlay = config.DEFAULT_PARAMETERS.TOGGLES.useAdaptivePlay;
export let useTableChangeWarnings = config.DEFAULT_PARAMETERS.TOGGLES.useTableChangeWarnings;
export let useDueForHit = config.DEFAULT_PARAMETERS.TOGGLES.useDueForHit;
export let useNeighbourFocus = config.DEFAULT_PARAMETERS.TOGGLES.useNeighbourFocus;
export let useLessStrict = config.DEFAULT_PARAMETERS.TOGGLES.useLessStrict;
export let useDynamicTerminalNeighbourCount = config.DEFAULT_PARAMETERS.TOGGLES.useDynamicTerminalNeighbourCount;
export let useReinforcementLearning = config.RL_CONFIG.enabled; // NEW: Toggle for RL

// --- State Modifying Functions ---
export function setHistory(newHistory) { history = newHistory; }
export function setConfirmedWinsLog(newLog) { confirmedWinsLog = newLog; }
export function setIsAiReady(value) { isAiReady = value; }
export function setBestFoundParams(params) { bestFoundParams = params; }
export function setCurrentVideoURL(url) { currentVideoURL = url; }
export function setActivePredictionTypes(types) { activePredictionTypes = types; }
export function setStrategyStates(states) { strategyStates = states; }
export function setPatternMemory(memory) { patternMemory = memory; }
export function setAdaptiveFactorInfluences(influences) { adaptiveFactorInfluences = influences; }

// NEW: Function to set the RL-overridden adaptive learning rates
export function setAdaptiveLearningRatesOverride(rates) {
    adaptiveLearningRatesOverride = rates;
    config.ADAPTIVE_LEARNING_RATES = { // Temporarily apply these to config for immediate use
        ...config.ADAPTIVE_LEARNING_RATES,
        ...rates,
        FAILURE_MULTIPLIERS: { // Ensure multipliers are also applied
            ...config.ADAPTIVE_LEARNING_RATES.FAILURE_MULTIPLIERS,
            ...rates.FAILURE_MULTIPLIERS
        }
    };
    saveState(); // Save state after override is set
}

// NEW: Function to get the currently effective adaptive learning rates (either default or RL-overridden)
export function getEffectiveAdaptiveLearningRates() {
    return adaptiveLearningRatesOverride || config.ADAPTIVE_LEARNING_RATES;
}

export function setToggles(toggles) {
    useTrendConfirmation = toggles.useTrendConfirmation;
    useWeightedZone = toggles.useWeightedZone;
    useProximityBoost = toggles.useProximityBoost;
    usePocketDistance = toggles.usePocketDistance;
    useLowestPocketDistance = toggles.useLowestPocketDistance;
    useAdvancedCalculations = toggles.useAdvancedCalculations;
    useDynamicStrategy = toggles.useDynamicStrategy;
    useAdaptivePlay = toggles.useAdaptivePlay;
    useTableChangeWarnings = toggles.useTableChangeWarnings;
    useDueForHit = toggles.useDueForHit;
    useNeighbourFocus = toggles.useNeighbourFocus;
    useLessStrict = toggles.useLessStrict;
    useDynamicTerminalNeighbourCount = toggles.useDynamicTerminalNeighbourCount;
    // NEW: Update RL toggle state and also the config.RL_CONFIG.enabled
    if (toggles.hasOwnProperty('useReinforcementLearning')) {
        useReinforcementLearning = toggles.useReinforcementLearning;
        config.RL_CONFIG.enabled = toggles.useReinforcementLearning; // Sync with config
    }
}

export function saveState() {
    localStorage.setItem('terminalCalculatorState', JSON.stringify({
        history,
        confirmedWinsLog,
        strategyStates,
        patternMemory,
        adaptiveFactorInfluences,
        TOGGLES: {
            useTrendConfirmation, useWeightedZone, useProximityBoost, usePocketDistance, useLowestPocketDistance,
            useAdvancedCalculations, useDynamicStrategy, useAdaptivePlay, useTableChangeWarnings,
            useDueForHit, useNeighbourFocus, useLessStrict, useDynamicTerminalNeighbourCount,
            useReinforcementLearning // NEW: Save RL toggle state
        },
        STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, // Save the base config for future loads
        ADAPTIVE_LEARNING_RATES_OVERRIDE: adaptiveLearningRatesOverride // NEW: Save RL override
    }));
}
