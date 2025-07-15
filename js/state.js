// js/state.js
import * as config from './config.js';

// --- Application State ---
export let history = [];
export let confirmedWinsLog = [];
export let isAiReady = false;
export let bestFoundParams = null;
export let currentVideoURL = null;
export let activePredictionTypes = [];
export let trendWorkerAnalysis = null; 
// NEW: State to hold the Conductor's current operational mode.
export let systemMode = 'standard'; // Default mode

export let strategyStates = {
    weightedZone: { weight: 1.0, name: 'Neighbour Weighting' },
    proximityBoost: { weight: 1.0, name: 'Proximity Boost' }
};

// ... other state variables ...

// --- State Modifying Functions ---
export function setHistory(newHistory) { history = newHistory; }
export function setConfirmedWinsLog(newLog) { confirmedWinsLog = newLog; }
export function setIsAiReady(value) { isAiReady = value; }
export function setBestFoundParams(params) { bestFoundParams = params; }
export function setCurrentVideoURL(url) { currentVideoURL = url; }
export function setActivePredictionTypes(types) { activePredictionTypes = types; }
export function setTrendWorkerAnalysis(analysis) { trendWorkerAnalysis = analysis; }
// NEW: Setter for the system mode
export function setSystemMode(mode) { systemMode = mode; }
export function setStrategyStates(states) { strategyStates = states; }
// ... rest of the state file is unchanged ...
