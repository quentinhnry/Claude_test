/**
 * TripSync Application
 * Main application logic
 */

const app = {
    currentTrip: null,
    currentScreen: 'home',
    calendarDate: new Date(),
    selectedRanges: [],
    rangeSelectionStart: null,
    lastTapTime: 0,
    lastTapDate: null,
    screenHistory: [],
    isJoining: false,

    /**
     * Initialize the app
     */
    init() {
        // Check for trip data in URL
        const tripFromUrl = TripState.decode();
        if (tripFromUrl) {
            this.currentTrip = tripFromUrl;
            this.isJoining = true;
            this.showScreen('select-identity');
            this.renderIdentityList();
        }

        // Load trip history
        this.renderTripHistory();
    },

    /**
     * Show a specific screen
     */
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        // Track history
        if (this.currentScreen !== screenId) {
            this.screenHistory.push(this.currentScreen);
        }

        // Show target screen
        const screen = document.getElementById(`screen-${screenId}`);
        if (screen) {
            screen.classList.add('active');
            this.currentScreen = screenId;
        }

        // Screen-specific initialization
        if (screenId === 'availability') {
            this.renderCalendar();
        } else if (screenId === 'waiting') {
            this.renderWaitingScreen();
        } else if (screenId === 'destinations') {
            this.renderDestinations();
        }
    },

    /**
     * Go back to previous screen
     */
    goBack() {
        const prev = this.screenHistory.pop();
        if (prev) {
            this.showScreen(prev);
            this.screenHistory.pop(); // Remove duplicate
        } else {
            this.showScreen('home');
        }
    },

    /**
     * Go to home screen (exit flow)
     */
    goHome() {
        TripState.clearUrl();
        this.currentTrip = null;
        this.screenHistory = [];
        this.selectedRanges = [];
        this.rangeSelectionStart = null;
        this.showScreen('home');
        this.renderTripHistory();
    },

    /**
     * Handle create trip form submission
     */
    handleCreateTrip(event) {
        event.preventDefault();

        const name = document.getElementById('trip-name').value.trim();
        const participantInputs = document.querySelectorAll('.participant-name');
        const participants = Array.from(participantInputs)
            .map(input => input.value.trim())
            .filter(p => p.length > 0);

        if (participants.length < 1) {
            alert('Please add at least 1 participant');
            return;
        }

        // Create new trip
        this.currentTrip = TripState.createTrip(name, participants);
        this.isJoining = false;

        // Show identity selection
        this.showScreen('select-identity');
        this.renderIdentityList();
    },

    /**
     * Add a participant input
     */
    addParticipant() {
        const list = document.getElementById('participants-list');
        const div = document.createElement('div');
        div.className = 'participant-input';
        div.innerHTML = `
            <input type="text" placeholder="Name" class="participant-name" required>
            <button type="button" class="btn-remove" onclick="app.removeParticipant(this)">×</button>
        `;
        list.appendChild(div);

        // Show remove button on first participant if we have more than one
        if (list.children.length > 1) {
            list.querySelector('.btn-remove').style.visibility = 'visible';
        }
    },

    /**
     * Remove a participant input
     */
    removeParticipant(btn) {
        const list = document.getElementById('participants-list');
        if (list.children.length > 1) {
            btn.parentElement.remove();
        }

        // Hide remove button if only one left
        if (list.children.length === 1) {
            list.querySelector('.btn-remove').style.visibility = 'hidden';
        }
    },

    /**
     * Render identity selection list
     */
    renderIdentityList() {
        const list = document.getElementById('identity-list');
        list.innerHTML = this.currentTrip.participants.map(p => `
            <div class="identity-item ${p.completed ? 'completed' : ''}" onclick="app.selectIdentity('${p.name}')">
                ${p.name}
                ${p.completed ? ' ✓' : ''}
            </div>
        `).join('');
    },

    /**
     * Select identity
     */
    selectIdentity(name) {
        this.currentTrip.currentUser = name;

        // Load any previously selected ranges for this user
        const participant = TripState.getParticipant(this.currentTrip, name);
        if (participant && participant.availableRanges) {
            this.selectedRanges = [...participant.availableRanges];
        } else {
            this.selectedRanges = [];
        }
        this.rangeSelectionStart = null;

        this.showScreen('availability');
    },

    /**
     * Render calendar
     */
    renderCalendar() {
        const calendar = document.getElementById('calendar');
        const monthYear = document.getElementById('calendar-month-year');

        const year = this.calendarDate.getFullYear();
        const month = this.calendarDate.getMonth();

        monthYear.textContent = new Date(year, month).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });

        // Day headers
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let html = days.map(d => `<div class="calendar-header">${d}</div>`).join('');

        // Get first day of month and total days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            const dateStr = this.formatDate(year, month - 1, day);
            html += `<div class="calendar-day other-month" data-date="${dateStr}">${day}</div>`;
        }

        // Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = this.formatDate(year, month, day);
            const date = new Date(year, month, day);
            const isToday = date.getTime() === today.getTime();
            const isAvailable = this.isDateInRanges(dateStr);
            const isRangeStart = this.rangeSelectionStart === dateStr;
            const isPast = date < today;

            let classes = 'calendar-day';
            if (isToday) classes += ' today';
            if (isAvailable) classes += ' available';
            if (isRangeStart) classes += ' range-start';
            if (isPast) classes += ' past';

            html += `<div class="${classes}" data-date="${dateStr}" onclick="app.handleDateClick('${dateStr}')">${day}</div>`;
        }

        // Next month days
        const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
        const remaining = totalCells - firstDay - daysInMonth;
        for (let day = 1; day <= remaining; day++) {
            const dateStr = this.formatDate(year, month + 1, day);
            html += `<div class="calendar-day other-month" data-date="${dateStr}">${day}</div>`;
        }

        calendar.innerHTML = html;
        this.renderRangesRecap();
    },

    /**
     * Format date as YYYY-MM-DD
     */
    formatDate(year, month, day) {
        // Handle month overflow
        const date = new Date(year, month, day);
        return date.toISOString().split('T')[0];
    },

    /**
     * Check if a date is within any selected range
     */
    isDateInRanges(dateStr) {
        const date = new Date(dateStr);
        return this.selectedRanges.some(range => {
            const start = new Date(range.start);
            const end = new Date(range.end);
            return date >= start && date <= end;
        });
    },

    /**
     * Handle date click for range selection
     */
    handleDateClick(dateStr) {
        const now = Date.now();
        const isDoubleTap = (now - this.lastTapTime < 400) && (this.lastTapDate === dateStr);
        this.lastTapTime = now;
        this.lastTapDate = dateStr;

        // If date is already in a range, remove that range
        if (this.isDateInRanges(dateStr)) {
            this.removeRangeContaining(dateStr);
            this.rangeSelectionStart = null;
            this.renderCalendar();
            return;
        }

        // Double tap = single day selection
        if (isDoubleTap) {
            this.selectedRanges.push({ start: dateStr, end: dateStr });
            this.rangeSelectionStart = null;
            this.renderCalendar();
            return;
        }

        // First tap = set range start
        if (!this.rangeSelectionStart) {
            this.rangeSelectionStart = dateStr;
            this.renderCalendar();
            return;
        }

        // Second tap = complete the range
        let start = this.rangeSelectionStart;
        let end = dateStr;

        // Ensure start is before end
        if (new Date(start) > new Date(end)) {
            [start, end] = [end, start];
        }

        this.selectedRanges.push({ start, end });
        this.rangeSelectionStart = null;
        this.renderCalendar();
    },

    /**
     * Remove a range containing a specific date
     */
    removeRangeContaining(dateStr) {
        const date = new Date(dateStr);
        this.selectedRanges = this.selectedRanges.filter(range => {
            const start = new Date(range.start);
            const end = new Date(range.end);
            return !(date >= start && date <= end);
        });
    },

    /**
     * Remove a specific range by index
     */
    removeRange(index) {
        this.selectedRanges.splice(index, 1);
        this.renderCalendar();
    },

    /**
     * Render the ranges recap below calendar
     */
    renderRangesRecap() {
        const container = document.getElementById('ranges-recap');
        if (!container) return;

        if (this.selectedRanges.length === 0) {
            container.innerHTML = '<div class="ranges-empty">No dates selected yet. Tap a start date, then an end date.</div>';
            return;
        }

        // Sort ranges by start date
        const sorted = [...this.selectedRanges].sort((a, b) =>
            new Date(a.start) - new Date(b.start)
        );

        container.innerHTML = sorted.map((range, idx) => {
            const start = new Date(range.start);
            const end = new Date(range.end);
            const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            const options = { month: 'short', day: 'numeric' };

            const startStr = start.toLocaleDateString('en-US', options);
            const endStr = end.toLocaleDateString('en-US', options);
            const dateDisplay = range.start === range.end
                ? startStr
                : `${startStr} → ${endStr}`;

            return `
                <div class="range-item">
                    <div>
                        <div class="range-item-dates">${dateDisplay}</div>
                        <div class="range-item-days">${days} day${days > 1 ? 's' : ''}</div>
                    </div>
                    <button class="range-item-remove" onclick="app.removeRange(${idx})">×</button>
                </div>
            `;
        }).join('');
    },

    /**
     * Navigate to previous month
     */
    prevMonth() {
        this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
        this.renderCalendar();
    },

    /**
     * Navigate to next month
     */
    nextMonth() {
        this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
        this.renderCalendar();
    },

    /**
     * Confirm availability selection
     */
    confirmAvailability() {
        if (this.selectedRanges.length === 0) {
            alert('Please select at least one date range when you are available');
            return;
        }

        // Save available ranges to participant (not completed yet - need max duration)
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            availableRanges: [...this.selectedRanges]
        });

        // Go to max duration screen
        this.showScreen('max-duration');
        this.loadMaxDurationDefaults();
    },

    /**
     * Load max duration defaults from participant data
     */
    loadMaxDurationDefaults() {
        const participant = TripState.getParticipant(this.currentTrip, this.currentTrip.currentUser);
        const maxDaysInput = document.getElementById('max-days');
        const maxWeeksInput = document.getElementById('max-weeks');

        if (participant) {
            maxDaysInput.value = participant.maxDays || 7;
            maxWeeksInput.value = participant.maxWeeks || 2;
        }
    },

    /**
     * Confirm max duration selection
     */
    confirmMaxDuration() {
        const maxDays = parseInt(document.getElementById('max-days').value) || 7;
        const maxWeeks = parseInt(document.getElementById('max-weeks').value) || 2;

        // Save max duration and mark as completed
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            maxDays: maxDays,
            maxWeeks: maxWeeks,
            completed: true
        });

        // If owner and not joining, go to destinations
        if (!this.isJoining && this.currentTrip.destinations.length === 0) {
            this.showScreen('destinations');
        } else {
            // Save and go to waiting
            this.saveAndShowWaiting();
        }
    },

    /**
     * Modify a participant's data (from waiting screen)
     */
    modifyParticipant(name) {
        this.currentTrip.currentUser = name;

        // Load participant's existing data
        const participant = TripState.getParticipant(this.currentTrip, name);
        if (participant && participant.availableRanges) {
            this.selectedRanges = [...participant.availableRanges];
        } else {
            this.selectedRanges = [];
        }
        this.rangeSelectionStart = null;

        // Mark as not completed so they can re-do
        TripState.updateParticipant(this.currentTrip, name, {
            completed: false
        });

        // Go to availability screen
        this.showScreen('availability');
    },

    /**
     * Render destinations screen
     */
    renderDestinations() {
        const list = document.getElementById('destinations-list');

        if (this.currentTrip.destinations.length === 0) {
            // Add one empty destination option
            this.currentTrip.destinations.push({
                id: TripState.generateId(),
                countries: []
            });
        }

        list.innerHTML = this.currentTrip.destinations.map((dest, idx) => `
            <div class="destination-option" data-id="${dest.id}">
                <div class="destination-option-header">
                    <span>Option ${idx + 1}</span>
                    ${this.currentTrip.destinations.length > 1 ? `
                        <button class="btn-remove" onclick="app.removeDestination('${dest.id}')">×</button>
                    ` : ''}
                </div>
                <div class="destination-countries">
                    ${dest.countries.map(c => `
                        <span class="country-tag">
                            ${c}
                            <button onclick="app.removeCountry('${dest.id}', '${c}')">×</button>
                        </span>
                    `).join('')}
                </div>
                <div class="add-country-form">
                    <input type="text" placeholder="Add country..." id="country-input-${dest.id}"
                           onkeypress="if(event.key==='Enter'){app.addCountry('${dest.id}');event.preventDefault();}">
                    <button onclick="app.addCountry('${dest.id}')">Add</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Add a destination option
     */
    addDestinationOption() {
        this.currentTrip.destinations.push({
            id: TripState.generateId(),
            countries: []
        });
        this.renderDestinations();
    },

    /**
     * Remove a destination option
     */
    removeDestination(id) {
        this.currentTrip.destinations = this.currentTrip.destinations.filter(d => d.id !== id);
        this.renderDestinations();
    },

    /**
     * Add a country to a destination
     */
    addCountry(destId) {
        const input = document.getElementById(`country-input-${destId}`);
        const country = input.value.trim();

        if (country) {
            const dest = this.currentTrip.destinations.find(d => d.id === destId);
            if (dest && !dest.countries.includes(country)) {
                dest.countries.push(country);
                input.value = '';
                this.renderDestinations();
            }
        }
    },

    /**
     * Remove a country from a destination
     */
    removeCountry(destId, country) {
        const dest = this.currentTrip.destinations.find(d => d.id === destId);
        if (dest) {
            dest.countries = dest.countries.filter(c => c !== country);
            this.renderDestinations();
        }
    },

    /**
     * Confirm destinations and proceed
     */
    confirmDestinations() {
        // Filter out empty destinations
        this.currentTrip.destinations = this.currentTrip.destinations.filter(d => d.countries.length > 0);

        if (this.currentTrip.destinations.length === 0) {
            alert('Please add at least one destination option');
            return;
        }

        this.saveAndShowWaiting();
    },

    /**
     * Save trip and show waiting screen
     */
    saveAndShowWaiting() {
        // Update URL
        TripState.updateUrl(this.currentTrip);

        // Save to history
        TripState.saveToHistory(this.currentTrip);

        // Show waiting screen
        this.showScreen('waiting');
    },

    /**
     * Render waiting screen
     */
    renderWaitingScreen() {
        // Update share URL
        const shareUrl = document.getElementById('share-url');
        shareUrl.value = TripState.encode(this.currentTrip);

        // Render participant statuses with modify buttons
        const statusContainer = document.getElementById('participants-status');
        statusContainer.innerHTML = this.currentTrip.participants.map(p => `
            <div class="participant-status-item">
                <div class="participant-info">
                    <span>${p.name} ${p.name === this.currentTrip.currentUser ? '(you)' : ''}</span>
                    <span class="status-badge ${p.completed ? 'completed' : 'pending'}">
                        ${p.completed ? 'Ready' : 'Pending'}
                    </span>
                </div>
                <button class="btn-modify" onclick="app.modifyParticipant('${p.name}')">Modify</button>
            </div>
        `).join('');

        // Show generate button if all completed
        const generateBtn = document.getElementById('btn-generate');
        if (TripState.allCompleted(this.currentTrip)) {
            generateBtn.style.display = 'block';
        } else {
            generateBtn.style.display = 'none';
        }
    },

    /**
     * Copy share link to clipboard
     */
    async copyShareLink() {
        const shareUrl = document.getElementById('share-url');
        try {
            await navigator.clipboard.writeText(shareUrl.value);
            alert('Link copied to clipboard!');
        } catch (e) {
            // Fallback
            shareUrl.select();
            document.execCommand('copy');
            alert('Link copied to clipboard!');
        }
    },

    /**
     * Show join dialog
     */
    showJoinDialog() {
        document.getElementById('join-dialog').classList.add('active');
        document.getElementById('join-link-input').value = '';
    },

    /**
     * Close join dialog
     */
    closeJoinDialog() {
        document.getElementById('join-dialog').classList.remove('active');
    },

    /**
     * Join from pasted link
     */
    joinFromLink() {
        const input = document.getElementById('join-link-input');
        const url = input.value.trim();

        const trip = TripState.decode(url);
        if (trip) {
            this.currentTrip = trip;
            this.isJoining = true;
            this.closeJoinDialog();
            this.showScreen('select-identity');
            this.renderIdentityList();
        } else {
            alert('Invalid trip link');
        }
    },

    /**
     * Render trip history on home screen
     */
    renderTripHistory() {
        const container = document.getElementById('trips-container');
        const history = TripState.getHistory();

        if (history.length === 0) {
            container.innerHTML = '<p style="color: var(--text-light); font-size: 0.875rem;">No trips yet</p>';
            return;
        }

        container.innerHTML = history.map(trip => `
            <div class="trip-item">
                <div onclick="app.loadTrip('${trip.id}')" style="flex: 1; cursor: pointer;">
                    <div class="trip-item-name">${trip.name}</div>
                    <div class="trip-item-meta">${trip.participants.length} participant${trip.participants.length > 1 ? 's' : ''}</div>
                </div>
                <button class="btn-delete-trip" onclick="event.stopPropagation(); app.deleteTrip('${trip.id}')" title="Delete trip">×</button>
            </div>
        `).join('');
    },

    /**
     * Load a trip from history
     */
    loadTrip(tripId) {
        const history = TripState.getHistory();
        const trip = history.find(t => t.id === tripId);

        if (trip) {
            this.currentTrip = trip;
            this.isJoining = false;

            // Go to waiting screen to see status / continue
            TripState.updateUrl(trip);
            this.showScreen('waiting');
        }
    },

    /**
     * Delete a trip from history
     */
    deleteTrip(tripId) {
        if (confirm('Are you sure you want to delete this trip?')) {
            const history = TripState.getHistory();
            const filtered = history.filter(t => t.id !== tripId);
            localStorage.setItem('tripsync_history', JSON.stringify(filtered));
            this.renderTripHistory();
        }
    },

    /**
     * Generate AI recommendations
     */
    async generateRecommendations() {
        this.showLoading('Analyzing availability, weather, and prices...');

        try {
            const prompt = this.buildPrompt();
            const response = await this.callAIProxy(prompt);
            const recommendations = this.parseRecommendations(response);

            this.renderResults(recommendations);
            this.hideLoading();
            this.showScreen('results');
        } catch (error) {
            console.error('API Error:', error);
            this.hideLoading();
            alert('Failed to generate recommendations: ' + error.message);
        }
    },

    /**
     * Build the prompt for AI
     */
    buildPrompt() {
        const trip = this.currentTrip;

        // Find overlapping available dates across all participants
        const overlappingRanges = this.findOverlappingRanges(trip.participants);

        // Find minimum max duration across all participants
        const maxDays = Math.min(...trip.participants.map(p => p.maxDays || 30));
        const maxWeeks = Math.min(...trip.participants.map(p => p.maxWeeks || 8));

        const destinationOptions = trip.destinations.map((d, i) =>
            `Option ${i + 1}: ${d.countries.join(', ')}`
        ).join('\n');

        const rangesText = overlappingRanges.length > 0
            ? overlappingRanges.map(r => `${r.start} to ${r.end} (${r.days} days)`).join('\n')
            : 'No overlapping dates found';

        return `You are a travel planning assistant. Analyze the following trip details and recommend the TOP 3 best combinations of dates and destinations.

TRIP: "${trip.name}"
PARTICIPANTS: ${trip.participants.map(p => p.name).join(', ')}

DESTINATION OPTIONS:
${destinationOptions}

AVAILABLE DATE RANGES (when all ${trip.participants.length} participant${trip.participants.length > 1 ? 's are' : ' is'} free):
${rangesText}

MAX TRIP DURATION: ${maxDays} consecutive days / ${maxWeeks} consecutive weeks
(Trip recommendations must not exceed these limits)

For each recommendation, consider:
1. Weather at the destination during those dates
2. Typical flight prices for that time (with checked luggage, from major European hubs)
3. Duration suitability (weekend trip vs longer vacation)
4. Must not exceed the max trip duration specified above

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "recommendations": [
    {
      "rank": 1,
      "destination": "Country/Countries name",
      "destinationOption": 1,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "weatherRating": 4.5,
      "weatherDescription": "Brief weather description",
      "priceRating": 4,
      "priceRange": "€150-250",
      "reasoning": "Why this is a good option"
    },
    {
      "rank": 2,
      ...
    },
    {
      "rank": 3,
      ...
    }
  ]
}

Ratings are 1-5 stars. Price is per person round-trip flight estimate.`;
    },

    /**
     * Find overlapping available ranges across all participants
     */
    findOverlappingRanges(participants) {
        if (participants.length === 0) return [];

        // Get all available dates for each participant as sets
        const participantDates = participants.map(p => {
            const dates = new Set();
            (p.availableRanges || []).forEach(range => {
                const start = new Date(range.start);
                const end = new Date(range.end);
                const current = new Date(start);
                while (current <= end) {
                    dates.add(current.toISOString().split('T')[0]);
                    current.setDate(current.getDate() + 1);
                }
            });
            return dates;
        });

        // Find intersection of all date sets
        if (participantDates.length === 0) return [];

        let commonDates = participantDates[0];
        for (let i = 1; i < participantDates.length; i++) {
            commonDates = new Set([...commonDates].filter(d => participantDates[i].has(d)));
        }

        // Convert back to sorted array and find consecutive ranges
        const sortedDates = [...commonDates].sort();
        return this.findConsecutiveRanges(sortedDates);
    },

    /**
     * Find consecutive date ranges
     */
    findConsecutiveRanges(dates) {
        if (dates.length === 0) return [];

        const ranges = [];
        let rangeStart = dates[0];
        let prevDate = dates[0];

        for (let i = 1; i < dates.length; i++) {
            const current = new Date(dates[i]);
            const prev = new Date(prevDate);
            const diffDays = (current - prev) / (1000 * 60 * 60 * 24);

            if (diffDays > 1) {
                // End current range
                const days = Math.round((new Date(prevDate) - new Date(rangeStart)) / (1000 * 60 * 60 * 24)) + 1;
                if (days >= 2) { // Only include ranges of 2+ days
                    ranges.push({
                        start: rangeStart,
                        end: prevDate,
                        days: days
                    });
                }
                rangeStart = dates[i];
            }
            prevDate = dates[i];
        }

        // Add last range
        const days = Math.round((new Date(prevDate) - new Date(rangeStart)) / (1000 * 60 * 60 * 24)) + 1;
        if (days >= 2) {
            ranges.push({
                start: rangeStart,
                end: prevDate,
                days: days
            });
        }

        return ranges.slice(0, 10); // Limit to 10 ranges
    },

    /**
     * Call AI Proxy
     */
    async callAIProxy(prompt) {
        const response = await fetch('https://proxy-ai-psi.vercel.app/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }

        const data = await response.json();
        return data.text;
    },

    /**
     * Parse recommendations from AI response
     */
    parseRecommendations(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.recommendations;
            }
        } catch (e) {
            console.error('Failed to parse recommendations:', e);
        }

        // Fallback
        return [{
            rank: 1,
            destination: 'Unable to parse',
            startDate: '',
            endDate: '',
            weatherRating: 0,
            priceRating: 0,
            priceRange: 'N/A',
            reasoning: response
        }];
    },

    /**
     * Render results
     */
    renderResults(recommendations) {
        const container = document.getElementById('results-container');

        container.innerHTML = recommendations.map(rec => `
            <div class="result-card ${rec.rank === 1 ? 'rank-1' : ''}">
                <div class="result-rank">#${rec.rank} Recommendation</div>
                <div class="result-destination">${rec.destination}</div>
                <div class="result-dates">${this.formatDateRange(rec.startDate, rec.endDate)}</div>

                <div class="result-ratings">
                    <div class="rating-item">
                        <div class="rating-label">Weather</div>
                        <div class="rating-value rating-stars">${this.renderStars(rec.weatherRating)}</div>
                        <div class="rating-label">${rec.weatherDescription || ''}</div>
                    </div>
                    <div class="rating-item">
                        <div class="rating-label">Price</div>
                        <div class="rating-value rating-stars">${this.renderStars(rec.priceRating)}</div>
                    </div>
                </div>

                <div class="result-price">
                    <span class="price-label">Est. flight price (pp)</span>
                    <span class="price-value">${rec.priceRange}</span>
                </div>

                <div class="result-reasoning">${rec.reasoning}</div>
            </div>
        `).join('');
    },

    /**
     * Format date range for display
     */
    formatDateRange(start, end) {
        if (!start || !end) return '';
        const startDate = new Date(start);
        const endDate = new Date(end);
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    },

    /**
     * Render star rating
     */
    renderStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalf = rating % 1 >= 0.5;
        let stars = '★'.repeat(fullStars);
        if (hasHalf) stars += '½';
        stars += '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0));
        return stars;
    },

    /**
     * Regenerate recommendations
     */
    regenerate() {
        this.generateRecommendations();
    },

    /**
     * Show loading overlay
     */
    showLoading(text = 'Loading...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.add('active');
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
