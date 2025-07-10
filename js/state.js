// js/state.js
import { DEFAULT_PARAMETERS, STRATEGY_CONFIG, ADAPTIVE_LEARNING_RATES } from './config.js';

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

// --- Global Toggle States ---
export let useTrendConfirmation = DEFAULT_PARAMETERS.TOGGLES.useTrendConfirmation;
export let useWeightedZone = DEFAULT_PARAMETERS.TOGGLES.useWeightedZone;
export let useProximityBoost = DEFAULT_PARAMETERS.TOGGLES.useProximityBoost;
export let usePocketDistance = DEFAULT_PARAMETERS.TOGGLES.usePocketDistance;
export let useLowestPocketDistance = DEFAULT_PARAMETERS.TOGGLES.useLowestPocketDistance;
export let useAdvancedCalculations = DEFAULT_PARAMETERS.TOGGLES.useAdvancedCalculations;
export let useDynamicStrategy = DEFAULT_PARAMETERS.TOGGLES.useDynamicStrategy;
export let useAdaptivePlay = DEFAULT_PARAMETERS.TOGGLES.useAdaptivePlay;
export let useTableChangeWarnings = DEFAULT_PARAMETERS.TOGGLES.useTableChangeWarnings;
export let useDueForHit = DEFAULT_PARAMETERS.TOGGLES.useDueForHit;
export let useNeighbourFocus = DEFAULT_PARAMETERS.TOGGLES.useNeighbourFocus;
export let useLessStrict = DEFAULT_PARAMETERS.TOGGLES.useLessStrict;
export let useDynamicTerminalNeighbourCount = DEFAULT_PARAMETERS.TOGGLES.useDynamicTerminalNeighbourCount;

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
        history, confirmedWinsLog,
        strategyStates, patternMemory, adaptiveFactorInfluences,
        TOGGLES: {
            useTrendConfirmation, useWeightedZone, useProximityBoost, usePocketDistance, useLowestPocketDistance,
            useAdvancedCalculations, useDynamicStrategy, useAdaptivePlay, useTableChangeWarnings,
            useDueForHit, useNeighbourFocus, useLessStrict, useDynamicTerminalNeighbourCount
        },
        STRATEGY_CONFIG: STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: ADAPTIVE_LEARNING_RATES
    }) // Close the main object here
    ); // Close the JSON.stringify() and setItem() calls here
}//
