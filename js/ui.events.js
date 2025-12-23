// js/ui.events.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import { aiWorker, optimizationWorker } from './workers.js';
import * as analysis from './analysis.js';
import * as winspinApi from './api/winspin.js';
import { apiContext } from './api/apiContextManager.js';
import { dom, toggleGuide, hidePatternAlert, updateApiLiveButtonState, addTrainingLogEntry, clearTrainingLog, toggleTrainingLog } from './ui.helpers.js';
import { 
    updateAllTogglesUI, 
    updateWinLossCounter, 
    drawRouletteWheel, 
    renderHistory, 
    renderAnalysisList, 
    renderBoardState, 
    renderStrategyWeights, 
    updateRouletteLegend, 
    updateOptimizationStatus, 
    showOptimizationComplete, 
    showOptimizationStopped, 
    updateOptimizerDebugPanel,
    updateAiStatus, 
    updateMainRecommendationDisplay, 
    initializeAdvancedSettingsUI, 
    toggleParameterSliders,
    getRecommendationDataForDisplay
} from './ui.cards.js';

// --- EVENT HANDLERS ---

/**
 * Handles the "Calculate" button click.
 */
export function handleNewCalculation(isAutoCall = false) {
    console.log("handleNewCalculation: Function started.");
    
    if (apiContext.isAutoModeEnabled() && isAutoCall !== true) {
        alert('Auto mode is enabled. Disable it to use manual input.');
        return;
    }
    
    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        console.log("handleNewCalculation: Invalid inputs detected. Updating display and returning.");
        updateMainRecommendationDisplay();
        return;
    }

    const existingPendingItem = state.history.find(
        item => item.status === 'pending' && item.winningNumber === null
    );

    if (existingPendingItem) {
        console.warn(`handleNewCalculation: An unresolved pending calculation (ID: ${existingPendingItem.id}) already exists. Not creating a new one.`);
        if (isAutoCall !== true) {
            alert("There's already a pending calculation. Please submit the winning number for that one first, or clear history.");
        }
        updateMainRecommendationDisplay();
        return;
    }


    const newHistoryItem = {
        id: Date.now(),
        num1: num1Val,
        num2: num2Val,
        difference: Math.abs(num2Val - num1Val),
        status: 'pending',
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null,
        recommendationDetails: null
    };
    state.history.push(newHistoryItem);
    console.log(`handleNewCalculation: New history item created with ID: ${newHistoryItem.id}. Total history items: ${state.history.length}`);

    state.setCurrentPendingCalculationId(newHistoryItem.id);

    getRecommendationDataForDisplay(num1Val, num2Val).then(recommendation => {
        console.log(`handleNewCalculation: Got recommendation for ID ${newHistoryItem.id}.`);
        const itemToUpdate = state.history.find(item =>
            item.id === newHistoryItem.id && item.status === 'pending' && item.winningNumber === null
        );
        if (itemToUpdate) {
            itemToUpdate.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
            itemToUpdate.recommendationDetails = {
                ...recommendation.details,
                signal: recommendation.signal,
                reason: recommendation.reason
            };
            console.log(`handleNewCalculation: Updated history item ID ${itemToUpdate.id} with recommendation details.`);
        } else {
            console.error(`handleNewCalculation: Failed to find newly created item (ID: ${newHistoryItem.id}) for detail update.`);
        }
        renderHistory();
        updateMainRecommendationDisplay();
        console.log("handleNewCalculation: UI updated and function finished.");
    });
}


export function handleSubmitResult() {
    console.log("handleSubmitResult: Function started.");
    
    if (apiContext.isAutoModeEnabled()) {
        alert('Auto mode is enabled. Disable it to use manual input.');
        return;
    }
    
    console.log(`handleSubmitResult: state.currentPendingCalculationId at start: ${state.currentPendingCalculationId}`);

    if (!state.currentPendingCalculationId) {
        console.log("handleSubmitResult: No current pending calculation ID set.");
        hidePatternAlert();
        updateMainRecommendationDisplay();
        return;
    }

    const winningNumberVal = dom.winningNumberInput.value;
    let winningNumber = null;
    if (winningNumberVal.trim() !== '') {
        winningNumber = parseInt(winningNumberVal, 10);
    }

    if (winningNumber === null || isNaN(winningNumber) || winningNumber < 0 || winningNumber > 36) {
        alert("Please enter a valid winning number (0-36).");
        console.log("handleSubmitResult: Invalid winning number input. Alert shown.");
        return;
    }

    const lastPendingForSubmission = state.history.find(
        item => item.id === state.currentPendingCalculationId && item.status === 'pending' && item.winningNumber === null
    );

    if (!lastPendingForSubmission) {
        console.error("handleSubmitResult: Could not find pending calculation by stored ID.");
        state.setCurrentPendingCalculationId(null);
        updateMainRecommendationDisplay();
        return;
    }
    console.log(`handleSubmitResult: Found pending item by stored ID: ${lastPendingForSubmission.id}. Resolving this item.`);

    evaluateCalculationStatus(lastPendingForSubmission, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    console.log(`handleSubmitResult: Item ID ${lastPendingForSubmission.id} resolved to status: ${lastPendingForSubmission.status}`);

    state.setCurrentPendingCalculationId(null);

    // Update confirmed wins log (unified spin history)
    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    console.log("handleSubmitResult: confirmedWinsLog updated.");

    // IMPORTANT: Also update apiContext spin history for consistency
    // This ensures manual entries are added to the unified timeline
    if (apiContext.getContextSpins().length > 0 || apiContext.getContextId() !== null) {
        // Add the winning number to front of context spins (newest first)
        const contextSpins = apiContext.getContextSpins();
        if (contextSpins.length === 0 || contextSpins[0] !== winningNumber) {
            apiContext.addSpin(winningNumber);
            console.log("handleSubmitResult: Manual entry added to apiContext spin history.");
        }
    }

    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));

    analysis.runAllAnalyses(winningNumber);
    renderHistory();
    console.log("handleSubmitResult: Analysis and history re-rendered.");

    dom.winningNumberInput.value = '';
    console.log("handleSubmitResult: Winning number input cleared.");

    const prevNum2 = parseInt(lastPendingForSubmission.num2, 10);
    if (!isNaN(prevNum2)) {
        dom.number1.value = prevNum2;
        dom.number2.value = winningNumber;
        console.log(`handleSubmitResult: Auto-populating for next spin: num1=${dom.number1.value}, num2=${dom.number2.value}`);
        setTimeout(() => {
            console.log("handleSubmitResult: Triggering next handleNewCalculation via setTimeout.");
            handleNewCalculation();
        }, 50);
    } else {
        console.warn('handleSubmitResult: previous num2 was not a valid number for auto-calculation.');
        updateMainRecommendationDisplay();
    }
    hidePatternAlert();
    console.log("handleSubmitResult: Function finished.");
}


export function handleClearInputs() {
    console.log("handleClearInputs: Function started.");
    dom.number1.value = '';
    dom.number2.value = '';
    dom.winningNumberInput.value = '';
    updateMainRecommendationDisplay();
    console.log("handleClearInputs: Inputs cleared.");
}


export function handleClearHistory() {
    console.log("handleClearHistory: Function started.");
    state.setHistory([]);
    state.setConfirmedWinsLog([]);
    state.setCurrentPendingCalculationId(null);
    
    // Clear API context spin history but preserve settings
    apiContext.clearContext();
    
    renderHistory();
    hidePatternAlert();
    analysis.runAllAnalyses();
    dom.number1.value = '';
    dom.number2.value = '';
    dom.winningNumberInput.value = '';
    updateMainRecommendationDisplay();
    console.log("handleClearHistory: History cleared and UI refreshed.");
}

// --- API HANDLERS ---

function autoFillTerminalCalculatorFromHistory(spins) {
    // spins is newest-first from API
    if (spins.length >= 2) {
        dom.number1.value = spins[1]; // Second newest
        dom.number2.value = spins[0]; // Newest
    }
}

async function handleApiProviderChange() {
    const provider = dom.apiProviderSelect.value;
    
    dom.apiTableSelect.innerHTML = '<option value="">Loading tables...</option>';
    dom.apiTableSelect.disabled = true;
    dom.apiLiveButton.disabled = true;
    dom.apiRefreshButton.disabled = true;
    dom.apiLoadHistoryButton.disabled = true;
    dom.apiAutoToggle.disabled = true;
    dom.apiStatusMessage.textContent = 'Loading tables...';
    
    if (!provider) {
        dom.apiTableSelect.innerHTML = '<option value="">Select Provider First</option>';
        dom.apiStatusMessage.textContent = 'Select a provider to begin';
        updateHistoricalDataIndicator(null);
        return;
    }
    
    try {
        const apiResponse = await winspinApi.fetchRouletteData(provider);
        const tables = winspinApi.extractTableNames(apiResponse);
        
        if (tables.length === 0) {
            dom.apiTableSelect.innerHTML = '<option value="">No tables found</option>';
            dom.apiStatusMessage.textContent = 'No tables available for this provider';
            return;
        }
        
        dom.apiTableSelect.innerHTML = '<option value="">Select Table</option>';
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table.name;
            option.textContent = table.name;
            dom.apiTableSelect.appendChild(option);
        });
        
        dom.apiTableSelect.disabled = false;
        dom.apiStatusMessage.textContent = `Found ${tables.length} tables. Select one to continue.`;
        
    } catch (error) {
        dom.apiTableSelect.innerHTML = '<option value="">Error loading tables</option>';
        dom.apiStatusMessage.textContent = `Error: ${error.message}`;
        console.error('Error loading tables:', error);
    }
}

function handleApiTableChange() {
    const provider = dom.apiProviderSelect.value;
    const tableName = dom.apiTableSelect.value;
    
    if (provider && tableName) {
        apiContext.setContext(provider, tableName);
        dom.apiLiveButton.disabled = false;
        dom.apiRefreshButton.disabled = false;
        dom.apiLoadHistoryButton.disabled = false;
        dom.apiAutoToggle.disabled = false;
        dom.apiStatusMessage.textContent = `Selected: ${tableName}`;
    } else {
        dom.apiLiveButton.disabled = true;
        dom.apiRefreshButton.disabled = true;
        dom.apiLoadHistoryButton.disabled = true;
        dom.apiAutoToggle.disabled = true;
        updateHistoricalDataIndicator(null);
    }
}

function handleApiAutoToggle() {
    const isEnabled = dom.apiAutoToggle.checked;
    apiContext.setAutoMode(isEnabled);
    
    // Disable manual input fields when auto mode is on
    dom.number1.disabled = isEnabled;
    dom.number2.disabled = isEnabled;
    dom.winningNumberInput.disabled = isEnabled;
    dom.calculateButton.disabled = isEnabled;
    dom.submitResultButton.disabled = isEnabled;
    
    if (isEnabled) {
        dom.apiStatusMessage.textContent = 'Auto mode enabled - API is input source';
        addTrainingLogEntry('info', 'Auto mode enabled - manual input disabled');
    } else {
        apiContext.stopLivePolling();
        updateApiLiveButtonState(false);
        dom.apiStatusMessage.textContent = 'Auto mode disabled - manual input enabled';
        addTrainingLogEntry('info', 'Auto mode disabled - manual input enabled');
    }
}

async function handleApiLiveToggle() {
    if (apiContext.isPolling()) {
        apiContext.stopLivePolling();
        updateApiLiveButtonState(false);
        dom.apiStatusMessage.textContent = 'Live polling stopped';
    } else {
        updateApiLiveButtonState(true);
        dom.apiStatusMessage.textContent = 'Starting live polling...';
        
        // Do an immediate refresh first
        await handleApiRefresh();
        
        // Start polling
        apiContext.startLivePolling(handleApiRefresh);
    }
}

async function handleApiRefresh() {
    const provider = dom.apiProviderSelect.value;
    const tableName = dom.apiTableSelect.value;
    
    if (!provider || !tableName) {
        dom.apiStatusMessage.textContent = 'Error: No provider or table selected.';
        return;
    }
    
    try {
        // Fetch with losses data for context
        const apiResponse = await winspinApi.fetchRouletteDataWithLosses(provider);
        apiContext.setLastApiResponse(apiResponse);
        
        // Update sector context
        const sectorLosses = winspinApi.getSectorLosses(apiResponse, tableName);
        if (sectorLosses) {
            apiContext.updateSectorContext(sectorLosses);
        }
        
        // Update number-level context if available
        const numberLosses = winspinApi.getNumberLosses(apiResponse, tableName);
        if (numberLosses) {
            apiContext.updateNumberContext(numberLosses);
            addTrainingLogEntry('info', `Number context updated (${numberLosses.dataQuality})`);
        }
        
        // Update historical data indicator
        updateHistoricalDataIndicator(apiContext.getDataSourceStatus());
        
        const latestSpin = winspinApi.getLatestSpin(apiResponse, tableName);
        
        if (!latestSpin) {
            dom.apiStatusMessage.textContent = 'No spin data available for this table.';
            return;
        }
        
        const wasAdded = apiContext.addSpin(latestSpin.winningNumber);
        
        if (wasAdded) {
            await processApiSpin(latestSpin.winningNumber);
            
            // Auto-fill terminal with new data and trigger calculation
            const contextSpins = apiContext.getContextSpins();
            autoFillTerminalCalculatorFromHistory(contextSpins);
            
            let statusMsg = `New spin: ${latestSpin.winningNumber}`;
            if (apiContext.hasNumberData()) {
                statusMsg += ' (with number context)';
            } else if (apiContext.hasSectorData()) {
                statusMsg += ' (with sector context)';
            }
            dom.apiStatusMessage.textContent = statusMsg;
        } else {
            dom.apiStatusMessage.textContent = `Latest spin: ${latestSpin.winningNumber} (no change)`;
        }
    } catch (error) {
        dom.apiStatusMessage.textContent = `Error: ${error.message}`;
        console.error('Error refreshing API data:', error);
    }
}

async function handleApiLoadHistory() {
    const provider = dom.apiProviderSelect.value;
    const tableName = dom.apiTableSelect.value;
    
    if (!provider || !tableName) {
        dom.apiStatusMessage.textContent = 'Error: No provider or table selected.';
        return;
    }
    
    const confirmed = confirm(
        'This will replace your current history with the last 30 spins from the API. Continue?'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        dom.apiStatusMessage.textContent = 'Loading history with context data...';
        
        // Fetch with losses data for context
        const apiResponse = await winspinApi.fetchRouletteDataWithLosses(provider);
        apiContext.setLastApiResponse(apiResponse);
        
        // Update sector context from losses data
        const sectorLosses = winspinApi.getSectorLosses(apiResponse, tableName);
        if (sectorLosses) {
            const success = apiContext.updateSectorContext(sectorLosses);
            if (success) {
                addTrainingLogEntry('info', `Sector context loaded (${sectorLosses.dataQuality})`);
                if (sectorLosses.hasHistoricalMax) {
                    addTrainingLogEntry('success', 'Historical max data (5+ years) available for sector calibration');
                } else {
                    addTrainingLogEntry('warning', 'Sector historical max data not available - using session data only');
                }
            }
        } else {
            addTrainingLogEntry('warning', 'No sector losses data in API response');
        }
        
        // Update number-level context from losses data
        const numberLosses = winspinApi.getNumberLosses(apiResponse, tableName);
        if (numberLosses) {
            const success = apiContext.updateNumberContext(numberLosses);
            if (success) {
                addTrainingLogEntry('info', `Number context loaded (${numberLosses.dataQuality})`);
                if (numberLosses.hasHistoricalMax) {
                    addTrainingLogEntry('success', 'Historical max data (5+ years) available for number calibration');
                } else {
                    addTrainingLogEntry('warning', 'Number historical max data not available - using session data only');
                }
            }
        } else {
            addTrainingLogEntry('info', 'Number-level context not available from API');
        }
        
        // Update historical data indicator
        updateHistoricalDataIndicator(apiContext.getDataSourceStatus());
        
        const spins = winspinApi.getTableHistory(apiResponse, tableName);
        
        if (spins.length === 0) {
            dom.apiStatusMessage.textContent = 'No spins available for this table.';
            return;
        }
        
        apiContext.replaceContextSpins(spins);
        
        await processApiHistoryLoad(spins);
        
        // Auto-fill terminal with the loaded history
        autoFillTerminalCalculatorFromHistory(apiContext.getContextSpins());
        
        let statusMsg = `Loaded ${spins.length} spins from API`;
        if (apiContext.hasNumberData()) {
            statusMsg += ' with number-level context';
        } else if (apiContext.hasSectorData()) {
            statusMsg += ' with sector context';
        }
        dom.apiStatusMessage.textContent = statusMsg;
        
        // Log API history load
        addTrainingLogEntry('info', `API History loaded: ${spins.length} spins from ${tableName}`);
        addTrainingLogEntry('data', `First 5 (oldest): [${spins.slice(-5).reverse().join(', ')}]`);
        addTrainingLogEntry('data', `Last 5 (newest): [${spins.slice(0, 5).join(', ')}]`);
        
        // Log context summary
        if (apiContext.hasNumberData()) {
            const summary = apiContext.getNumberSummary();
            const elevatedNumbers = Object.entries(summary.numbers)
                .filter(([, data]) => data.ratio >= 0.5)
                .map(([num, data]) => `${num}: ${data.currentLoss}/${data.historicalMax}`);
            
            if (elevatedNumbers.length > 0) {
                addTrainingLogEntry('data', `Extended numbers: ${elevatedNumbers.slice(0, 5).join(', ')}`);
            } else {
                addTrainingLogEntry('data', 'All numbers within typical historical range');
            }
        } else if (apiContext.hasSectorData()) {
            const summary = apiContext.getSectorSummary();
            const elevatedSectors = Object.entries(summary.sectors)
                .filter(([, data]) => data.ratio >= 0.5)
                .map(([id, data]) => `${data.sectorName}: ${data.currentLoss}/${data.historicalMax}`);
            
            if (elevatedSectors.length > 0) {
                addTrainingLogEntry('data', `Elevated sectors: ${elevatedSectors.join(', ')}`);
            } else {
                addTrainingLogEntry('data', 'All sectors within typical historical range');
            }
        }
        
    } catch (error) {
        dom.apiStatusMessage.textContent = `Error: ${error.message}`;
        console.error('Error loading history:', error);
        addTrainingLogEntry('error', `API history load failed: ${error.message}`);
    }
}

/**
 * Updates the historical data indicator UI element
 * @param {Object|null} status - Data source status object or null to reset
 */
function updateHistoricalDataIndicator(status) {
    const indicator = document.getElementById('historicalDataIndicator');
    if (!indicator) return;
    
    if (!status || status.status === 'not_initialized' || status.status === 'defaults') {
        indicator.innerHTML = `
            <div class="flex items-center text-gray-400">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-xs">Historical data: Not loaded</span>
            </div>
        `;
        indicator.className = 'historical-data-indicator p-3 rounded-lg border bg-gray-50 border-gray-200';
        return;
    }
    
    let bgColor, borderColor, textColor, icon;
    
    if (status.isApiCalibrated && status.confidence === 'high') {
        bgColor = 'bg-green-50';
        borderColor = 'border-green-200';
        textColor = 'text-green-700';
        icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>`;
    } else if (status.isApiCalibrated) {
        bgColor = 'bg-blue-50';
        borderColor = 'border-blue-200';
        textColor = 'text-blue-700';
        icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>`;
    } else {
        bgColor = 'bg-yellow-50';
        borderColor = 'border-yellow-200';
        textColor = 'text-yellow-700';
        icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001c-.77 1.332.192 2.999 1.732 2.999z"></path>`;
    }
    
    indicator.innerHTML = `
        <div class="flex items-center ${textColor}">
            <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${icon}
            </svg>
            <div>
                <span class="text-xs font-semibold">${status.label}</span>
                <span class="text-xs block">${status.description}</span>
            </div>
        </div>
    `;
    indicator.className = `historical-data-indicator p-3 rounded-lg border ${bgColor} ${borderColor}`;
}

async function processApiSpin(spin) {
    const contextSpins = apiContext.getContextSpins();
    
    if (contextSpins.length < 3) {
        console.log('Need at least 3 spins to process. Current count:', contextSpins.length);
        return;
    }
    
    const num1 = contextSpins[2];
    const num2 = contextSpins[1];
    const winningNumber = spin;
    
    const newHistoryItem = {
        id: Date.now(),
        num1,
        num2,
        difference: Math.abs(num2 - num1),
        status: 'pending',
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null,
        recommendationDetails: null
    };
    
    state.history.push(newHistoryItem);
    state.setCurrentPendingCalculationId(newHistoryItem.id);
    
    const recommendation = await getRecommendationDataForDisplay(num1, num2);
    
    const itemToUpdate = state.history.find(item =>
        item.id === newHistoryItem.id && item.status === 'pending' && item.winningNumber === null
    );
    
    if (itemToUpdate) {
        itemToUpdate.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
        itemToUpdate.recommendationDetails = {
            ...recommendation.details,
            signal: recommendation.signal,
            reason: recommendation.reason
        };
    }
    
    evaluateCalculationStatus(itemToUpdate, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    state.setCurrentPendingCalculationId(null);
    
    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    
    await analysis.runAllAnalyses(winningNumber);
    renderHistory();
    
    await updateMainRecommendationDisplay();
}

async function processApiHistoryLoad(spins) {
    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`API history load: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null;
            state.setCurrentPendingCalculationId(null);
        }
    }
    
    // API returns newest->oldest, reverse to get oldest->newest for simulation
    const spinsOldestFirst = [...spins].reverse();
    
    const simulatedHistory = runSimulationOnHistory(spinsOldestFirst);
    
    if (currentLivePendingItem) {
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id);
        console.log(`API history load: Re-added preserved pending item ID: ${newPendingCopy.id}`);
    } else {
        state.setCurrentPendingCalculationId(null);
    }
    
    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    
    await analysis.runAllAnalyses();
    renderHistory();
    await updateMainRecommendationDisplay();
}

function runSimulationOnHistory(spinsToProcess) {
    const localHistory = [];
    let localConfirmedWinsLog = [];
    let localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    
    if (spinsToProcess.length < 3) return [];
    
    for (let i = 2; i < spinsToProcess.length; i++) {
        const num1 = spinsToProcess[i - 2];
        const num2 = spinsToProcess[i - 1];
        const winningNumber = spinsToProcess[i];
        
        for (const factorName in localAdaptiveFactorInfluences) {
            localAdaptiveFactorInfluences[factorName] = Math.max(
                config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE,
                localAdaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR
            );
        }
        
        const trendStats = calculateTrendStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const boardStats = getBoardStateStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const neighbourScores = runSharedNeighbourAnalysis(localHistory, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        
        // Get context provider if available - works even without AI training
        const contextProvider = apiContext.hasAnyContextData() ? apiContext : null;
        
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: localConfirmedWinsLog.length > 0 ? localConfirmedWinsLog[localConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: state.useTrendConfirmation, useAdaptivePlayBool: state.useAdaptivePlay, useLessStrictBool: state.useLessStrict,
            sectorContextProvider: contextProvider, // Context works without AI training
            numberContextProvider: contextProvider, // Number context also available
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: localHistory,
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });
        
        const newHistoryItem = {
            id: Date.now() + i,
            num1,
            num2,
            difference: Math.abs(num2 - num1),
            status: 'resolved',
            hitTypes: [],
            typeSuccessStatus: {},
            winningNumber,
            recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.bestCandidate?.details || null
        };
        
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        
        localHistory.push(newHistoryItem);
        if (newHistoryItem.winningNumber !== null) {
            localConfirmedWinsLog.push(newHistoryItem.winningNumber);
        }
    }
    
    return localHistory;
}

// --- TOGGLE HANDLERS ---

function handleTrendConfirmationToggle() {
    state.useTrendConfirmation = dom.trendConfirmationToggle.checked;
    analysis.handleStrategyChange();
}

function handleWeightedZoneToggle() {
    state.useWeightedZone = dom.weightedZoneToggle.checked;
    analysis.handleStrategyChange();
}

function handleProximityBoostToggle() {
    state.useProximityBoost = dom.proximityBoostToggle.checked;
    analysis.handleStrategyChange();
}

function handlePocketDistanceToggle() {
    state.usePocketDistance = dom.pocketDistanceToggle.checked;
    renderHistory();
}

function handleLowestPocketDistanceToggle() {
    state.useLowestPocketDistance = dom.lowestPocketDistanceToggle.checked;
    analysis.handleStrategyChange();
}

function handleAdvancedCalculationsToggle() {
    state.useAdvancedCalculations = dom.advancedCalculationsToggle.checked;
    analysis.handleStrategyChange();
}

function handleDynamicStrategyToggle() {
    state.useDynamicStrategy = dom.dynamicStrategyToggle.checked;
    analysis.handleStrategyChange();
}

function handleAdaptivePlayToggle() {
    state.useAdaptivePlay = dom.adaptivePlayToggle.checked;
    analysis.handleStrategyChange();
}

function handleTableChangeWarningsToggle() {
    state.useTableChangeWarnings = dom.tableChangeWarningsToggle.checked;
    analysis.handleStrategyChange();
}

function handleDueForHitToggle() {
    state.useDueForHit = dom.dueForHitToggle.checked;
    analysis.handleStrategyChange();
}

function handleNeighbourFocusToggle() {
    state.useNeighbourFocus = dom.neighbourFocusToggle.checked;
    analysis.handleStrategyChange();
}

function handleLessStrictModeToggle() {
    state.useLessStrict = dom.lessStrictModeToggle.checked;
    analysis.handleStrategyChange();
}

function handleDynamicTerminalNeighbourCountToggle() {
    state.useDynamicTerminalNeighbourCount = dom.dynamicTerminalNeighbourCountToggle.checked;
    analysis.handleStrategyChange();
}

// --- OPTIMIZER EVENT HANDLERS ---

function handleStartOptimization() {
    console.log("handleStartOptimization: Starting optimization.");
    
    if (state.history.filter(item => item.winningNumber !== null).length < 10) {
        alert('Need at least 10 confirmed spins in history to run optimization.');
        return;
    }
    
    const winningNumbers = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    
    dom.startOptimizationButton.disabled = true;
    dom.stopOptimizationButton.disabled = false;
    toggleParameterSliders(false);
    
    updateOptimizationStatus('Initializing...');
    
    optimizationWorker.postMessage({
        type: 'start',
        payload: {
            winningNumbers: winningNumbers,
            config: {
                STRATEGY_CONFIG: config.STRATEGY_CONFIG,
                ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
                GA_CONFIG: config.GA_CONFIG
            },
            toggles: {
                useTrendConfirmation: state.useTrendConfirmation,
                useWeightedZone: state.useWeightedZone,
                useProximityBoost: state.useProximityBoost,
                useNeighbourFocus: state.useNeighbourFocus,
                useAdaptivePlay: state.useAdaptivePlay,
                useLessStrict: state.useLessStrict,
                useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
                useLowestPocketDistance: state.useLowestPocketDistance
            },
            activeTypeIds: state.activePredictionTypes.map(t => t.id),
            clonablePredictionTypes: config.clonablePredictionTypes,
            terminalMapping: config.terminalMapping,
            rouletteWheel: config.rouletteWheel
        }
    });
}

function handleStopOptimization() {
    console.log("handleStopOptimization: Stopping optimization.");
    optimizationWorker.postMessage({ type: 'stop' });
    
    dom.startOptimizationButton.disabled = false;
    dom.stopOptimizationButton.disabled = true;
    toggleParameterSliders(true);
    
    showOptimizationStopped();
}

// --- INITIALIZATION ---

export function initializeEventListeners() {
    // Main calculator buttons
    if (dom.calculateButton) dom.calculateButton.addEventListener('click', () => handleNewCalculation(false));
    if (dom.submitResultButton) dom.submitResultButton.addEventListener('click', handleSubmitResult);
    if (dom.clearInputsButton) dom.clearInputsButton.addEventListener('click', handleClearInputs);
    if (dom.clearHistoryButton) dom.clearHistoryButton.addEventListener('click', handleClearHistory);
    
    // Train AI button
    if (dom.trainAiButton) dom.trainAiButton.addEventListener('click', analysis.handleTrainFromHistory);
    
    // Toggles
    if (dom.trendConfirmationToggle) dom.trendConfirmationToggle.addEventListener('change', handleTrendConfirmationToggle);
    if (dom.weightedZoneToggle) dom.weightedZoneToggle.addEventListener('change', handleWeightedZoneToggle);
    if (dom.proximityBoostToggle) dom.proximityBoostToggle.addEventListener('change', handleProximityBoostToggle);
    if (dom.pocketDistanceToggle) dom.pocketDistanceToggle.addEventListener('change', handlePocketDistanceToggle);
    if (dom.lowestPocketDistanceToggle) dom.lowestPocketDistanceToggle.addEventListener('change', handleLowestPocketDistanceToggle);
    if (dom.advancedCalculationsToggle) dom.advancedCalculationsToggle.addEventListener('change', handleAdvancedCalculationsToggle);
    if (dom.dynamicStrategyToggle) dom.dynamicStrategyToggle.addEventListener('change', handleDynamicStrategyToggle);
    if (dom.adaptivePlayToggle) dom.adaptivePlayToggle.addEventListener('change', handleAdaptivePlayToggle);
    if (dom.tableChangeWarningsToggle) dom.tableChangeWarningsToggle.addEventListener('change', handleTableChangeWarningsToggle);
    if (dom.dueForHitToggle) dom.dueForHitToggle.addEventListener('change', handleDueForHitToggle);
    if (dom.neighbourFocusToggle) dom.neighbourFocusToggle.addEventListener('change', handleNeighbourFocusToggle);
    if (dom.lessStrictModeToggle) dom.lessStrictModeToggle.addEventListener('change', handleLessStrictModeToggle);
    if (dom.dynamicTerminalNeighbourCountToggle) dom.dynamicTerminalNeighbourCountToggle.addEventListener('change', handleDynamicTerminalNeighbourCountToggle);
    
    // API panel
    if (dom.apiProviderSelect) dom.apiProviderSelect.addEventListener('change', handleApiProviderChange);
    if (dom.apiTableSelect) dom.apiTableSelect.addEventListener('change', handleApiTableChange);
    if (dom.apiAutoToggle) dom.apiAutoToggle.addEventListener('change', handleApiAutoToggle);
    if (dom.apiLiveButton) dom.apiLiveButton.addEventListener('click', handleApiLiveToggle);
    if (dom.apiRefreshButton) dom.apiRefreshButton.addEventListener('click', handleApiRefresh);
    if (dom.apiLoadHistoryButton) dom.apiLoadHistoryButton.addEventListener('click', handleApiLoadHistory);
    
    // Optimizer
    if (dom.startOptimizationButton) dom.startOptimizationButton.addEventListener('click', handleStartOptimization);
    if (dom.stopOptimizationButton) dom.stopOptimizationButton.addEventListener('click', handleStopOptimization);
    
    // Training log
    if (dom.trainingLogToggle) dom.trainingLogToggle.addEventListener('click', toggleTrainingLog);
    if (dom.clearTrainingLogButton) dom.clearTrainingLogButton.addEventListener('click', clearTrainingLog);
    
    console.log("initializeEventListeners: All event listeners attached.");
}