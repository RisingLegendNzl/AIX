// js/state.js
import * as config from './config.js';

// --- Application State ---
export let history = [];
export let confirmedWinsLog = [];
export let isAiReady = false;
export let bestFoundParams = null;
export let currentVideoURL = null;
export let activePredictionTypes = [];
// NEW: Store the ID of the currently pending calculation
export let currentPendingCalculationId = null;

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

// NEW: Setter for currentPendingCalculationId with logging
export function setCurrentPendingCalculationId(id) {
    if (currentPendingCalculationId !== id) {
        console.log(`STATE: currentPendingCalculationId changed from ${currentPendingCalculationId} to ${id}`);
    }
    currentPendingCalculationId = id;
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
}

export function saveState() {
    localStorage.setItem('terminalCalculatorState', JSON.stringify({
        history,
        confirmedWinsLog,
        strategyStates,
        patternMemory,
        adaptiveFactorInfluences,
        currentPendingCalculationId, // NEW: Save the pending ID
        TOGGLES: {
            useTrendConfirmation, useWeightedZone, useProximityBoost, usePocketDistance, useLowestPocketDistance,
            useAdvancedCalculations, useDynamicStrategy, useAdaptivePlay, useTableChangeWarnings,
            useDueForHit, useNeighbourFocus, useLessStrict, useDynamicTerminalNeighbourCount
        },
        STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES
    }));
}
