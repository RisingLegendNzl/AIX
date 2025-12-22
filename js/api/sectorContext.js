// js/api/sectorContext.js - Sector Context Manager
// Manages historical sector data for group confidence calibration
// Uses 5+ year historical max data as normalization reference, NOT as predictor

/**
 * IMPORTANT: This module provides CONTEXT, not PREDICTION.
 * Historical max values are used to normalize current observations,
 * not to imply that sectors are "due" or more likely to hit.
 */

// --- SECTOR DEFINITIONS ---

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

export const SECTOR_DEFINITIONS = {
    // Color sectors
    red: { name: 'Red', numbers: RED_NUMBERS },
    black: { name: 'Black', numbers: BLACK_NUMBERS },
    
    // Dozen sectors
    dozen1: { name: '1st Dozen (1-12)', numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    dozen2: { name: '2nd Dozen (13-24)', numbers: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] },
    dozen3: { name: '3rd Dozen (25-36)', numbers: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36] },
    
    // Column sectors
    column1: { name: '1st Column', numbers: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34] },
    column2: { name: '2nd Column', numbers: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35] },
    column3: { name: '3rd Column', numbers: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36] },
    
    // High/Low sectors
    low: { name: 'Low (1-18)', numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
    high: { name: 'High (19-36)', numbers: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36] },
    
    // Parity sectors
    even: { name: 'Even', numbers: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36] },
    odd: { name: 'Odd', numbers: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35] }
};

// Severity thresholds (as ratios of historical max)
export const SEVERITY_THRESHOLDS = {
    NORMAL: 0.3,      // Below 30% of historical max
    MILD: 0.5,        // 30-50% of historical max
    ELEVATED: 0.7,    // 50-70% of historical max
    HIGH: 0.85,       // 70-85% of historical max
    EXTREME: 1.0      // 85%+ of historical max
};

// Default historical max values (conservative estimates if API data unavailable)
// These represent typical 5+ year maximums observed in European roulette
const DEFAULT_HISTORICAL_MAX = {
    red: 25,
    black: 25,
    dozen1: 35,
    dozen2: 35,
    dozen3: 35,
    column1: 35,
    column2: 35,
    column3: 35,
    low: 25,
    high: 25,
    even: 25,
    odd: 25
};

/**
 * Sector Context Manager
 * Tracks sector loss streaks and provides normalized severity context
 */
class SectorContextManager {
    constructor() {
        this.currentLossStreaks = {};
        this.historicalMax = { ...DEFAULT_HISTORICAL_MAX };
        this.lastUpdated = null;
        this.dataSource = 'defaults'; // 'defaults' | 'api' | 'calculated'
        this.isInitialized = false;
        
        // NEW: Track which sectors have API-provided max values vs defaults
        this.apiProvidedMaxSectors = new Set();
        this.apiDataTimestamp = null;
    }

    /**
     * Initialize or update with API losses data
     * @param {Object} apiLossesData - Losses data from API (current streaks and historical max)
     * @returns {boolean} True if update was successful
     */
    updateFromApi(apiLossesData) {
        if (!apiLossesData) {
            console.warn('[SectorContext] No API losses data provided');
            return false;
        }

        try {
            // Map API sector names to our internal names
            const sectorMapping = {
                'Red': 'red',
                'Black': 'black',
                '1st 12': 'dozen1',
                '2nd 12': 'dozen2',
                '3rd 12': 'dozen3',
                '1st Column': 'column1',
                '2nd Column': 'column2',
                '3rd Column': 'column3',
                'Low': 'low',
                'High': 'high',
                'Even': 'even',
                'Odd': 'odd',
                '1-18': 'low',
                '19-36': 'high'
            };

            // Reset API-provided tracking
            this.apiProvidedMaxSectors.clear();

            // Process API data
            if (Array.isArray(apiLossesData)) {
                // Array format: [{name, losses, max}, ...]
                apiLossesData.forEach(sector => {
                    const internalName = sectorMapping[sector.name] || sector.name.toLowerCase();
                    if (SECTOR_DEFINITIONS[internalName]) {
                        this.currentLossStreaks[internalName] = sector.losses || 0;
                        if (sector.max && sector.max > 0) {
                            this.historicalMax[internalName] = sector.max;
                            this.apiProvidedMaxSectors.add(internalName);
                        }
                    }
                });
                this.dataSource = this.apiProvidedMaxSectors.size > 0 ? 'api' : 'calculated';
            } else if (typeof apiLossesData === 'object') {
                // Object format: {sectorName: {losses, max}, ...}
                for (const [name, data] of Object.entries(apiLossesData)) {
                    const internalName = sectorMapping[name] || name.toLowerCase();
                    if (SECTOR_DEFINITIONS[internalName]) {
                        this.currentLossStreaks[internalName] = data.losses || data.current || 0;
                        if (data.max && data.max > 0) {
                            this.historicalMax[internalName] = data.max;
                            this.apiProvidedMaxSectors.add(internalName);
                        }
                    }
                }
                this.dataSource = this.apiProvidedMaxSectors.size > 0 ? 'api' : 'calculated';
            }

            this.lastUpdated = new Date();
            this.apiDataTimestamp = new Date();
            this.isInitialized = true;
            
            console.log('[SectorContext] Updated from API:', {
                dataSource: this.dataSource,
                apiProvidedMaxCount: this.apiProvidedMaxSectors.size,
                apiProvidedMaxSectors: Array.from(this.apiProvidedMaxSectors)
            });
            
            return true;
        } catch (error) {
            console.error('[SectorContext] Error processing API data:', error);
            return false;
        }
    }

    /**
     * Calculate sector loss streaks from spin history
     * @param {Array<number>} spinHistory - Array of spin numbers (newest first)
     */
    calculateFromSpinHistory(spinHistory) {
        if (!spinHistory || spinHistory.length === 0) {
            return;
        }

        // Reset current streaks
        for (const sectorId in SECTOR_DEFINITIONS) {
            this.currentLossStreaks[sectorId] = 0;
        }

        // Calculate current loss streaks for each sector
        for (const sectorId in SECTOR_DEFINITIONS) {
            const sectorNumbers = SECTOR_DEFINITIONS[sectorId].numbers;
            let streak = 0;

            // Count consecutive spins NOT in this sector (from newest)
            for (const spin of spinHistory) {
                if (sectorNumbers.includes(spin)) {
                    break; // Sector hit, streak ends
                }
                streak++;
            }

            this.currentLossStreaks[sectorId] = streak;
        }

        // Only change data source if we don't already have API data
        if (this.dataSource !== 'api') {
            this.dataSource = 'calculated';
        }
        this.lastUpdated = new Date();
        this.isInitialized = true;
    }

    /**
     * Get severity level for a sector
     * @param {string} sectorId - Sector identifier
     * @returns {Object} Severity info {ratio, level, description, isApiMax}
     */
    getSectorSeverity(sectorId) {
        const currentLoss = this.currentLossStreaks[sectorId] || 0;
        const maxLoss = this.historicalMax[sectorId] || DEFAULT_HISTORICAL_MAX[sectorId] || 30;
        const isApiMax = this.apiProvidedMaxSectors.has(sectorId);

        const ratio = maxLoss > 0 ? currentLoss / maxLoss : 0;

        let level, description;
        if (ratio < SEVERITY_THRESHOLDS.NORMAL) {
            level = 'normal';
            description = 'within typical range';
        } else if (ratio < SEVERITY_THRESHOLDS.MILD) {
            level = 'mild';
            description = 'slightly extended';
        } else if (ratio < SEVERITY_THRESHOLDS.ELEVATED) {
            level = 'elevated';
            description = 'moderately extended';
        } else if (ratio < SEVERITY_THRESHOLDS.HIGH) {
            level = 'high';
            description = 'notably extended';
        } else {
            level = 'extreme';
            description = 'near historical extreme';
        }

        return {
            sectorId,
            sectorName: SECTOR_DEFINITIONS[sectorId]?.name || sectorId,
            currentLoss,
            historicalMax: maxLoss,
            ratio: Math.min(ratio, 1.0), // Cap at 1.0
            level,
            description,
            isApiMax  // NEW: Indicates if max value came from API
        };
    }

    /**
     * Get sectors that a number belongs to
     * @param {number} num - Roulette number (0-36)
     * @returns {Array<string>} Array of sector IDs
     */
    getSectorsForNumber(num) {
        if (num === 0) {
            return []; // Zero is not in any betting sector
        }

        const sectors = [];
        for (const [sectorId, def] of Object.entries(SECTOR_DEFINITIONS)) {
            if (def.numbers.includes(num)) {
                sectors.push(sectorId);
            }
        }
        return sectors;
    }

    /**
     * Calculate sector exposure for a set of numbers
     * @param {Array<number>} numbers - Array of roulette numbers
     * @returns {Object} Sector exposure map {sectorId: {count, ratio, severity}}
     */
    calculateSectorExposure(numbers) {
        const validNumbers = numbers.filter(n => n >= 1 && n <= 36);
        if (validNumbers.length === 0) {
            return {};
        }

        const exposure = {};

        for (const sectorId in SECTOR_DEFINITIONS) {
            const sectorNumbers = SECTOR_DEFINITIONS[sectorId].numbers;
            const overlap = validNumbers.filter(n => sectorNumbers.includes(n));
            const count = overlap.length;
            const ratio = count / validNumbers.length;

            if (count > 0) {
                const severity = this.getSectorSeverity(sectorId);
                exposure[sectorId] = {
                    count,
                    ratio,
                    numbers: overlap,
                    severity
                };
            }
        }

        return exposure;
    }

    /**
     * Calculate aggregate severity score for a group's hit zone
     * This correlates historical sector data to calculation groups
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone
     * @returns {Object} Aggregate severity context for the calculation group
     */
    calculateGroupSectorContext(hitZoneNumbers) {
        const exposure = this.calculateSectorExposure(hitZoneNumbers);

        if (Object.keys(exposure).length === 0) {
            return {
                hasContext: false,
                aggregateSeverity: 0,
                dominantSector: null,
                sectorExposure: {},
                contextDescription: 'No sector context available (hit zone may only contain 0)',
                hasApiData: false
            };
        }

        // Calculate weighted average severity
        let totalWeight = 0;
        let weightedSeverity = 0;
        let dominantSector = null;
        let maxExposure = 0;
        let hasAnyApiData = false;

        for (const [sectorId, data] of Object.entries(exposure)) {
            const weight = data.ratio;
            weightedSeverity += data.severity.ratio * weight;
            totalWeight += weight;
            
            // Track if any sector has API-provided max
            if (data.severity.isApiMax) {
                hasAnyApiData = true;
            }

            if (data.ratio > maxExposure) {
                maxExposure = data.ratio;
                dominantSector = {
                    id: sectorId,
                    name: data.severity.sectorName,
                    exposure: data.ratio,
                    severity: data.severity
                };
            }
        }

        const aggregateSeverity = totalWeight > 0 ? weightedSeverity / totalWeight : 0;

        // Generate context description
        let contextDescription;
        if (aggregateSeverity < SEVERITY_THRESHOLDS.NORMAL) {
            contextDescription = 'Sectors within typical historical range';
        } else if (aggregateSeverity < SEVERITY_THRESHOLDS.MILD) {
            contextDescription = 'Minor sector extensions observed';
        } else if (aggregateSeverity < SEVERITY_THRESHOLDS.ELEVATED) {
            contextDescription = 'Moderate sector stress detected';
        } else if (aggregateSeverity < SEVERITY_THRESHOLDS.HIGH) {
            contextDescription = 'Elevated sector stress levels';
        } else {
            contextDescription = 'Unusual sector environment (near historical extremes)';
        }

        return {
            hasContext: true,
            aggregateSeverity,
            dominantSector,
            sectorExposure: exposure,
            contextDescription,
            dataSource: this.dataSource,
            lastUpdated: this.lastUpdated,
            hasApiData: hasAnyApiData  // NEW: Indicates if group uses API-provided max values
        };
    }

    /**
     * Get confidence modifier based on sector context
     * Returns a multiplier (0.85 to 1.0) for group confidence adjustment
     * 
     * IMPORTANT: This is a CONTEXTUAL modifier, not a boost.
     * Extreme sectors reduce confidence (more uncertainty), not increase it.
     * @param {Object} groupContext - Context from calculateGroupSectorContext
     * @returns {number} Confidence multiplier
     */
    getConfidenceModifier(groupContext) {
        if (!groupContext.hasContext) {
            return 1.0; // No modification
        }

        const severity = groupContext.aggregateSeverity;

        // Higher severity = MORE uncertainty = LOWER confidence
        // This is intentionally conservative - extreme conditions mean less predictability
        if (severity < SEVERITY_THRESHOLDS.NORMAL) {
            return 1.0; // Normal conditions, no change
        } else if (severity < SEVERITY_THRESHOLDS.MILD) {
            return 0.98; // Slight uncertainty
        } else if (severity < SEVERITY_THRESHOLDS.ELEVATED) {
            return 0.95; // Moderate uncertainty
        } else if (severity < SEVERITY_THRESHOLDS.HIGH) {
            return 0.90; // Increased uncertainty
        } else {
            return 0.85; // High uncertainty in extreme conditions
        }
    }

    /**
     * Get summary of current sector state
     * @returns {Object} Summary object with data source information
     */
    getSummary() {
        const summary = {
            isInitialized: this.isInitialized,
            dataSource: this.dataSource,
            lastUpdated: this.lastUpdated,
            apiDataTimestamp: this.apiDataTimestamp,
            apiProvidedMaxCount: this.apiProvidedMaxSectors.size,
            totalSectors: Object.keys(SECTOR_DEFINITIONS).length,
            hasFullApiData: this.apiProvidedMaxSectors.size === Object.keys(SECTOR_DEFINITIONS).length,
            sectors: {}
        };

        for (const sectorId in SECTOR_DEFINITIONS) {
            summary.sectors[sectorId] = this.getSectorSeverity(sectorId);
        }

        return summary;
    }

    /**
     * Get data source status for UI display
     * @returns {Object} Status object with user-friendly descriptions
     */
    getDataSourceStatus() {
        const apiCount = this.apiProvidedMaxSectors.size;
        const totalCount = Object.keys(SECTOR_DEFINITIONS).length;
        
        if (!this.isInitialized) {
            return {
                status: 'not_initialized',
                label: 'Not Connected',
                description: 'No sector data loaded',
                isApiCalibrated: false,
                confidence: 'low'
            };
        }
        
        if (this.dataSource === 'api' && apiCount === totalCount) {
            return {
                status: 'full_api',
                label: '5+ Year Data Active',
                description: `Historical max data from API for all ${totalCount} sectors`,
                isApiCalibrated: true,
                confidence: 'high',
                timestamp: this.apiDataTimestamp
            };
        }
        
        if (this.dataSource === 'api' && apiCount > 0) {
            return {
                status: 'partial_api',
                label: 'Partial API Data',
                description: `API data for ${apiCount}/${totalCount} sectors, defaults for rest`,
                isApiCalibrated: true,
                confidence: 'medium',
                timestamp: this.apiDataTimestamp
            };
        }
        
        if (this.dataSource === 'calculated') {
            return {
                status: 'session_only',
                label: 'Session Data Only',
                description: 'Using current session streaks with default historical bounds',
                isApiCalibrated: false,
                confidence: 'low'
            };
        }
        
        return {
            status: 'defaults',
            label: 'Using Defaults',
            description: 'Using conservative default values',
            isApiCalibrated: false,
            confidence: 'low'
        };
    }

    /**
     * Generate human-readable explanation for UI
     * @param {Object} groupContext - Context from calculateGroupSectorContext
     * @returns {Object} Explanation for display
     */
    generateExplanation(groupContext) {
        if (!groupContext.hasContext) {
            return {
                headline: 'No historical sector context',
                description: 'Sector analysis unavailable for this configuration.',
                details: [],
                disclaimer: null,
                isApiCalibrated: false
            };
        }

        const details = [];
        const dataStatus = this.getDataSourceStatus();

        // Add dominant sector info
        if (groupContext.dominantSector) {
            const dom = groupContext.dominantSector;
            const maxSource = dom.severity.isApiMax ? '(API)' : '(default)';
            details.push(
                `Primary sector exposure: ${dom.name} (${(dom.exposure * 100).toFixed(0)}% of hit zone)`
            );
            details.push(
                `${dom.name} status: ${dom.severity.currentLoss} spins since last hit ` +
                `(${dom.severity.description}, historical max: ${dom.severity.historicalMax} ${maxSource})`
            );
        }

        // Add aggregate context
        if (groupContext.aggregateSeverity >= SEVERITY_THRESHOLDS.ELEVATED) {
            details.push(
                `Note: Elevated sector stress may indicate increased variance`
            );
        }

        return {
            headline: groupContext.contextDescription,
            description: dataStatus.isApiCalibrated
                ? 'Calibrated with 5+ years of historical sector data'
                : 'Using session data with default historical bounds',
            details,
            disclaimer: 'Historical patterns provide context only, not prediction. Each spin is independent.',
            confidenceModifier: this.getConfidenceModifier(groupContext),
            isApiCalibrated: dataStatus.isApiCalibrated,
            dataSourceLabel: dataStatus.label
        };
    }

    /**
     * Reset to default state
     */
    reset() {
        this.currentLossStreaks = {};
        this.historicalMax = { ...DEFAULT_HISTORICAL_MAX };
        this.lastUpdated = null;
        this.dataSource = 'defaults';
        this.isInitialized = false;
        this.apiProvidedMaxSectors.clear();
        this.apiDataTimestamp = null;
    }
}

// Export singleton instance
export const sectorContext = new SectorContextManager();

// Export class for testing
export { SectorContextManager };