/**
 * TripSync State Management
 * Handles encoding/decoding trip data to/from URL for sharing
 */

const TripState = {
    /**
     * Encode trip data to a shareable URL
     * @param {Object} trip - The trip object
     * @returns {string} - Full URL with encoded trip data
     */
    encode(trip) {
        try {
            const json = JSON.stringify(trip);
            const encoded = btoa(encodeURIComponent(json));
            const baseUrl = window.location.origin + window.location.pathname;
            return `${baseUrl}#trip=${encoded}`;
        } catch (e) {
            console.error('Failed to encode trip:', e);
            return null;
        }
    },

    /**
     * Decode trip data from URL hash
     * @param {string} url - The URL containing trip data (optional, uses current URL if not provided)
     * @returns {Object|null} - The decoded trip object or null
     */
    decode(url = window.location.href) {
        try {
            const hashIndex = url.indexOf('#trip=');
            if (hashIndex === -1) return null;

            const encoded = url.substring(hashIndex + 6);
            const json = decodeURIComponent(atob(encoded));
            return JSON.parse(json);
        } catch (e) {
            console.error('Failed to decode trip:', e);
            return null;
        }
    },

    /**
     * Update the current URL with new trip data (without page reload)
     * @param {Object} trip - The trip object
     */
    updateUrl(trip) {
        const url = this.encode(trip);
        if (url) {
            history.replaceState(null, '', url);
        }
    },

    /**
     * Clear trip data from URL
     */
    clearUrl() {
        const baseUrl = window.location.origin + window.location.pathname;
        history.replaceState(null, '', baseUrl);
    },

    /**
     * Create a new trip object
     * @param {string} name - Trip name
     * @param {Array<string>} participants - List of participant names
     * @returns {Object} - New trip object
     */
    createTrip(name, participants) {
        return {
            id: this.generateId(),
            name: name,
            participants: participants.map(p => ({
                name: p,
                availableRanges: [],
                maxDays: null,
                maxWeeks: null,
                completed: false
            })),
            destinations: [],
            createdAt: Date.now(),
            currentUser: null,
            isOwner: true
        };
    },

    /**
     * Generate a unique ID
     * @returns {string}
     */
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    },

    /**
     * Save trip to local storage (for trip history)
     * @param {Object} trip - The trip object
     */
    saveToHistory(trip) {
        try {
            const history = this.getHistory();
            const existingIndex = history.findIndex(t => t.id === trip.id);

            if (existingIndex >= 0) {
                history[existingIndex] = trip;
            } else {
                history.unshift(trip);
            }

            // Keep only last 10 trips
            const trimmed = history.slice(0, 10);
            localStorage.setItem('tripsync_history', JSON.stringify(trimmed));
        } catch (e) {
            console.error('Failed to save to history:', e);
        }
    },

    /**
     * Get trip history from local storage
     * @returns {Array} - List of trips
     */
    getHistory() {
        try {
            const data = localStorage.getItem('tripsync_history');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to get history:', e);
            return [];
        }
    },

    /**
     * Check if all participants have completed their availability
     * @param {Object} trip - The trip object
     * @returns {boolean}
     */
    allCompleted(trip) {
        return trip.participants.every(p => p.completed);
    },

    /**
     * Get participant by name
     * @param {Object} trip - The trip object
     * @param {string} name - Participant name
     * @returns {Object|null}
     */
    getParticipant(trip, name) {
        return trip.participants.find(p => p.name === name) || null;
    },

    /**
     * Update participant data
     * @param {Object} trip - The trip object
     * @param {string} name - Participant name
     * @param {Object} data - Data to update
     * @returns {Object} - Updated trip
     */
    updateParticipant(trip, name, data) {
        const participant = this.getParticipant(trip, name);
        if (participant) {
            Object.assign(participant, data);
        }
        return trip;
    },

    /**
     * Merge two trip states (for when joining/updating)
     * Keeps the most complete data from both
     * @param {Object} local - Local trip data
     * @param {Object} remote - Remote trip data (from URL)
     * @returns {Object} - Merged trip
     */
    merge(local, remote) {
        if (!local) return remote;
        if (!remote) return local;

        // Use the one with more recent updates
        const merged = { ...remote };

        // Merge participant data - keep completed states
        merged.participants = remote.participants.map(rp => {
            const lp = local.participants.find(p => p.name === rp.name);
            if (lp && lp.completed && !rp.completed) {
                return lp;
            }
            if (rp.completed) {
                return rp;
            }
            return lp || rp;
        });

        // Keep destinations from whichever has them
        if (remote.destinations.length > 0) {
            merged.destinations = remote.destinations;
        } else if (local.destinations.length > 0) {
            merged.destinations = local.destinations;
        }

        return merged;
    }
};
