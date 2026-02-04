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
    currentRecommendations: [],
    theme: localStorage.getItem('tripsync_theme') || 'system',
    selectedInterests: [],
    votingOrder: [],
    interestOptions: [
        { id: 'beach', icon: '🏖️', label: 'Beach & Sun' },
        { id: 'culture', icon: '🏛️', label: 'Culture & History' },
        { id: 'adventure', icon: '🏔️', label: 'Adventure' },
        { id: 'food', icon: '🍽️', label: 'Food & Dining' },
        { id: 'nightlife', icon: '🎉', label: 'Nightlife' },
        { id: 'nature', icon: '🌲', label: 'Nature & Wildlife' },
        { id: 'shopping', icon: '🛍️', label: 'Shopping' },
        { id: 'relaxation', icon: '🧘', label: 'Relaxation & Spa' }
    ],

    /**
     * Initialize the app
     */
    init() {
        // Apply theme
        this.applyTheme();

        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.log('SW registration failed:', err));
        }

        // Check for trip data in URL
        const tripFromUrl = TripState.decode();
        if (tripFromUrl) {
            this.currentTrip = tripFromUrl;
            this.isJoining = true;

            // Restore recommendations if they exist
            if (tripFromUrl.recommendations) {
                this.currentRecommendations = tripFromUrl.recommendations;
            }

            this.showScreen('select-identity');
            this.renderIdentityList();
        }

        // Load trip history
        this.renderTripHistory();
    },

    /**
     * Apply current theme
     */
    applyTheme() {
        if (this.theme === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', this.theme);
        }
        this.updateThemeIcon();
    },

    /**
     * Toggle between light, dark, and system themes
     */
    toggleTheme() {
        const themes = ['light', 'dark', 'system'];
        const currentIdx = themes.indexOf(this.theme);
        this.theme = themes[(currentIdx + 1) % 3];
        localStorage.setItem('tripsync_theme', this.theme);
        this.applyTheme();
    },

    /**
     * Update theme icon based on current theme
     */
    updateThemeIcon() {
        const icon = document.getElementById('theme-icon');
        if (!icon) return;
        const icons = { light: '☀️', dark: '🌙', system: '💻' };
        icon.textContent = icons[this.theme];
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

        if (participant && participant.maxDays) {
            // Convert total days back to weeks + days for display
            const totalDays = participant.maxDays;
            maxWeeksInput.value = Math.floor(totalDays / 7);
            maxDaysInput.value = totalDays % 7;
        } else {
            // Default: 2 weeks and 0 days = 14 days
            maxWeeksInput.value = 2;
            maxDaysInput.value = 0;
        }
    },

    /**
     * Confirm max duration selection
     */
    confirmMaxDuration() {
        const days = parseInt(document.getElementById('max-days').value) || 0;
        const weeks = parseInt(document.getElementById('max-weeks').value) || 0;

        // Calculate total max days
        const totalMaxDays = (weeks * 7) + days;

        if (totalMaxDays < 1) {
            alert('Please enter a valid trip duration');
            return;
        }

        // Save max duration as total days (not completed yet - need departure city)
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            maxDays: totalMaxDays,
            maxWeeks: weeks // Keep for backward compatibility
        });

        // Go to departure city screen
        this.showScreen('departure-city');
        this.loadDepartureCityDefault();
    },

    /**
     * Load departure city default from participant data
     */
    loadDepartureCityDefault() {
        const participant = TripState.getParticipant(this.currentTrip, this.currentTrip.currentUser);
        const cityInput = document.getElementById('departure-city');
        const nationalityInput = document.getElementById('nationality');

        cityInput.value = participant?.departureCity || '';
        nationalityInput.value = participant?.nationality || '';
    },

    /**
     * Confirm departure city selection
     */
    confirmDepartureCity() {
        const departureCity = document.getElementById('departure-city').value.trim();
        const nationality = document.getElementById('nationality').value.trim();

        if (!departureCity) {
            alert('Please enter your departure city');
            return;
        }

        // Save departure city and nationality (not completed yet - need interests)
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            departureCity: departureCity,
            nationality: nationality || null
        });

        // Go to interests screen
        this.showScreen('interests');
        this.loadInterestsDefaults();
    },

    /**
     * Load interests defaults from participant data
     */
    loadInterestsDefaults() {
        const participant = TripState.getParticipant(this.currentTrip, this.currentTrip.currentUser);
        this.selectedInterests = participant?.interests ? [...participant.interests] : [];
        this.renderInterestsGrid();
    },

    /**
     * Render the interests grid
     */
    renderInterestsGrid() {
        const grid = document.getElementById('interests-grid');
        grid.innerHTML = this.interestOptions.map(opt => `
            <div class="interest-item ${this.selectedInterests.includes(opt.id) ? 'selected' : ''}"
                 onclick="app.toggleInterest('${opt.id}')">
                <span class="interest-icon">${opt.icon}</span>
                <span class="interest-label">${opt.label}</span>
            </div>
        `).join('');
    },

    /**
     * Toggle an interest selection
     */
    toggleInterest(id) {
        const idx = this.selectedInterests.indexOf(id);
        if (idx >= 0) {
            this.selectedInterests.splice(idx, 1);
        } else {
            this.selectedInterests.push(id);
        }
        this.renderInterestsGrid();
    },

    /**
     * Confirm interests selection
     */
    confirmInterests() {
        // Save interests (not completed yet if voting needed)
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            interests: [...this.selectedInterests]
        });

        // If destinations exist and we're joining, go to voting
        if (this.currentTrip.destinations.length > 1 && this.isJoining) {
            this.showScreen('voting');
            this.renderVotingList();
        } else if (!this.isJoining && this.currentTrip.destinations.length === 0) {
            // Owner needs to set destinations first, mark completed
            TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
                completed: true
            });
            this.showScreen('destinations');
        } else {
            // Mark as completed and go to waiting
            TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
                completed: true
            });
            this.saveAndShowWaiting();
        }
    },

    /**
     * Render the voting list
     */
    renderVotingList() {
        // Initialize order from destinations
        this.votingOrder = this.currentTrip.destinations.map(d => d.id);

        // Check for existing votes and sort by them
        const participant = TripState.getParticipant(this.currentTrip, this.currentTrip.currentUser);
        if (participant) {
            const existingVotes = {};
            this.currentTrip.destinations.forEach(d => {
                if (d.votes && d.votes[this.currentTrip.currentUser]) {
                    existingVotes[d.id] = d.votes[this.currentTrip.currentUser];
                }
            });
            if (Object.keys(existingVotes).length > 0) {
                this.votingOrder.sort((a, b) => (existingVotes[a] || 99) - (existingVotes[b] || 99));
            }
        }

        this.renderVotingItems();
        this.initDragAndDrop();
    },

    /**
     * Render voting items
     */
    renderVotingItems() {
        const list = document.getElementById('voting-list');
        list.innerHTML = this.votingOrder.map((destId, idx) => {
            const dest = this.currentTrip.destinations.find(d => d.id === destId);
            return `
                <div class="voting-item" data-id="${destId}" draggable="true">
                    <span class="voting-rank">${idx + 1}</span>
                    <span class="voting-destination">${dest.countries.join(', ')}</span>
                    <span class="voting-drag-handle">⋮⋮</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Initialize drag and drop for voting
     */
    initDragAndDrop() {
        const list = document.getElementById('voting-list');
        let draggedItem = null;

        list.querySelectorAll('.voting-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                draggedItem = null;
                this.updateVotingOrder();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedItem && draggedItem !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        list.insertBefore(draggedItem, item);
                    } else {
                        list.insertBefore(draggedItem, item.nextSibling);
                    }
                }
            });

            // Touch support
            item.addEventListener('touchstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
            }, { passive: true });

            item.addEventListener('touchend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                    draggedItem = null;
                    this.updateVotingOrder();
                }
            });
        });
    },

    /**
     * Update voting order after drag
     */
    updateVotingOrder() {
        const items = document.querySelectorAll('.voting-item');
        this.votingOrder = Array.from(items).map(item => item.dataset.id);
        this.renderVotingItems();
        this.initDragAndDrop();
    },

    /**
     * Confirm votes
     */
    confirmVotes() {
        // Save votes to destinations
        this.votingOrder.forEach((destId, idx) => {
            const dest = this.currentTrip.destinations.find(d => d.id === destId);
            if (dest) {
                if (!dest.votes) dest.votes = {};
                dest.votes[this.currentTrip.currentUser] = idx + 1;
            }
        });

        // Mark as completed
        TripState.updateParticipant(this.currentTrip, this.currentTrip.currentUser, {
            completed: true
        });

        this.saveAndShowWaiting();
    },

    /**
     * Render voting results in waiting screen
     */
    renderVotingResults() {
        const container = document.getElementById('voting-results');
        const list = document.getElementById('voting-results-list');

        if (this.currentTrip.destinations.length < 2) {
            container.style.display = 'none';
            return;
        }

        // Check if anyone has voted
        const hasVotes = this.currentTrip.destinations.some(d => d.votes && Object.keys(d.votes).length > 0);
        if (!hasVotes) {
            container.style.display = 'none';
            return;
        }

        // Calculate scores (lower avg rank = better)
        const scores = this.currentTrip.destinations.map(dest => {
            const votes = dest.votes || {};
            const voteValues = Object.values(votes);
            const avgRank = voteValues.length > 0
                ? voteValues.reduce((a, b) => a + b, 0) / voteValues.length
                : 99;
            return {
                id: dest.id,
                countries: dest.countries.join(', '),
                avgRank,
                voteCount: voteValues.length
            };
        }).sort((a, b) => a.avgRank - b.avgRank);

        list.innerHTML = scores.map((s, idx) => `
            <div class="vote-result-item">
                <span class="voting-rank">${idx + 1}</span>
                <span class="voting-destination">${s.countries}</span>
                <span style="color: var(--text-light); font-size: 0.875rem;">${s.voteCount} vote${s.voteCount !== 1 ? 's' : ''}</span>
            </div>
        `).join('');

        container.style.display = 'block';
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

        // Show generate/see button if all completed
        const generateBtn = document.getElementById('btn-generate');
        if (TripState.allCompleted(this.currentTrip)) {
            generateBtn.style.display = 'block';

            // Check if valid recommendations already exist
            const hasRecommendations = this.currentRecommendations
                && this.currentRecommendations.length > 0
                && this.currentRecommendations[0].destination !== 'Parsing Error';

            if (hasRecommendations) {
                generateBtn.textContent = 'See Recommendations';
                generateBtn.onclick = () => this.showScreen('results');
            } else {
                generateBtn.textContent = 'Generate Recommendations';
                generateBtn.onclick = () => this.generateRecommendations();
            }
        } else {
            generateBtn.style.display = 'none';
        }

        // Render voting results if available
        this.renderVotingResults();

        // Show preferences section if all completed
        const prefsSection = document.getElementById('preferences-section');
        if (TripState.allCompleted(this.currentTrip)) {
            prefsSection.style.display = 'block';
            const directToggle = document.getElementById('direct-flights-toggle');
            directToggle.checked = this.currentTrip.preferences?.directFlightsOnly || false;
        } else {
            prefsSection.style.display = 'none';
        }
    },

    /**
     * Toggle direct flights preference
     */
    toggleDirectFlights() {
        const checked = document.getElementById('direct-flights-toggle').checked;
        if (!this.currentTrip.preferences) {
            this.currentTrip.preferences = {};
        }
        this.currentTrip.preferences.directFlightsOnly = checked;
        TripState.updateUrl(this.currentTrip);
        TripState.saveToHistory(this.currentTrip);
    },

    /**
     * Share trip using native share or copy
     */
    async shareTrip() {
        const shareUrl = document.getElementById('share-url').value;
        const shareData = {
            title: `TripSync: ${this.currentTrip.name}`,
            text: `Join our trip planning for "${this.currentTrip.name}"!`,
            url: shareUrl
        };

        // Try native share first
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                // Fall through to copy
            }
        }

        // Fallback to clipboard copy
        this.copyShareLink();
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

            // Restore recommendations if they exist
            if (trip.recommendations) {
                this.currentRecommendations = trip.recommendations;
            }

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

            // Save recommendations to trip and persist
            this.currentTrip.recommendations = recommendations;
            TripState.saveToHistory(this.currentTrip);

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
        const maxTripLength = Math.min(...trip.participants.map(p => p.maxDays || 14));

        // Get departure cities
        const departureCities = trip.participants.map(p => ({
            name: p.name,
            city: p.departureCity || 'Unknown'
        }));
        const departureCitiesText = departureCities.map(d => `- ${d.name}: ${d.city}`).join('\n');
        const uniqueCities = [...new Set(departureCities.map(d => d.city))];

        // Get nationalities
        const nationalities = trip.participants
            .map(p => p.nationality)
            .filter(n => n)
            .filter((v, i, a) => a.indexOf(v) === i);
        const nationalitiesText = nationalities.length > 0
            ? nationalities.join(', ')
            : 'Not specified';

        // Get shared interests
        const allInterests = trip.participants
            .flatMap(p => p.interests || [])
            .filter((v, i, a) => a.indexOf(v) === i);
        const interestsText = allInterests.length > 0
            ? allInterests.map(id => {
                const opt = this.interestOptions.find(o => o.id === id);
                return opt ? opt.label : id;
            }).join(', ')
            : 'No specific interests provided';

        // Calculate destination scores from votes
        const destinationScores = trip.destinations.map(dest => {
            const votes = dest.votes || {};
            const voteValues = Object.values(votes);
            const avgRank = voteValues.length > 0
                ? voteValues.reduce((a, b) => a + b, 0) / voteValues.length
                : 99;
            return { dest, avgRank, voteCount: voteValues.length };
        }).sort((a, b) => a.avgRank - b.avgRank);

        const hasVotes = destinationScores.some(s => s.voteCount > 0);
        const destinationOptions = hasVotes
            ? destinationScores.map((s, i) =>
                `${i + 1}. ${s.dest.countries.join(', ')} (${s.voteCount} votes, avg rank: ${s.avgRank.toFixed(1)})`
            ).join('\n')
            : trip.destinations.map((d, i) =>
                `Option ${i + 1}: ${d.countries.join(', ')}`
            ).join('\n');

        const rangesText = overlappingRanges.length > 0
            ? overlappingRanges.map(r => `${r.start} to ${r.end} (${r.days} days)`).join('\n')
            : 'No overlapping dates found';

        const directFlightsOnly = trip.preferences?.directFlightsOnly;

        return `You are a travel planning assistant. Analyze the following trip details and recommend the TOP 3 best combinations of dates and destinations.

CRITICAL INSTRUCTIONS FOR FLIGHT PRICES:
1. You MUST use Google Search to find CURRENT flight prices - do NOT estimate or use training data
2. For EACH flight price, cite the source where you found it
3. If you cannot find a specific price via search, write "Price not found" instead of estimating
4. Prices must reflect ACTUAL current rates found in your search results

For weather data, you may use general knowledge (historical patterns are stable).

TRIP: "${trip.name}"
PARTICIPANTS: ${trip.participants.map(p => p.name).join(', ')}

DEPARTURE CITIES:
${departureCitiesText}

SHARED INTERESTS: ${interestsText}
Consider these activity preferences when ranking destinations.

PARTICIPANT NATIONALITIES: ${nationalitiesText}
Include brief visa requirements for these nationalities in recommendations.

DESTINATION OPTIONS:
${destinationOptions}

AVAILABLE DATE RANGES (when all ${trip.participants.length} participant${trip.participants.length > 1 ? 's are' : ' is'} free):
${rangesText}

MAX TRIP LENGTH: ${maxTripLength} days
(This is the strictest constraint across all participants - recommendations MUST NOT exceed this)
${directFlightsOnly ? '\nIMPORTANT: Only consider DIRECT flights. If no direct flights exist for a route, note this limitation.\n' : ''}
For each recommendation, provide:
1. WEATHER: Rate the weather quality for tourism (best combo of temperature + low rain). Provide average min/max temperatures and average rainy days per month for that period.
2. FLIGHT PRICES: Search for round-trip prices WITH checked luggage from EACH departure city. Compare to yearly average: is this period "lower", "typical", or "higher" than usual (like Google Flights)?
3. ACCOMMODATION: Estimate nightly rates for budget (hostel/budget hotel), mid-range (3-star), and luxury (4-5 star) options.
4. Trip must fit within ${maxTripLength} days maximum.

IMPORTANT: Each recommendation should have DIFFERENT date ranges:
- Rec 1: Optimize for BEST WEATHER at that destination
- Rec 2: Optimize for LOWEST FLIGHT PRICES to that destination
- Rec 3: Optimize for BEST VALUE (weather + price balance)

Do NOT return identical dates for all 3 recommendations.

IMPORTANT: Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "recommendations": [
    {
      "rank": 1,
      "destination": "Country/Countries name",
      "destinationOption": 1,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "weatherRating": 4.5,
      "weatherSummary": "Brief weather summary",
      "weatherDetails": {
        "avgMinTemp": 15,
        "avgMaxTemp": 24,
        "avgRainyDaysPerMonth": 5,
        "description": "Weather description for this period"
      },
      "avgFlightPrice": 180,
      "priceComparison": "lower",
      "flightsByCity": {
        ${uniqueCities.map(c => `"${c}": {"price": 150, "source": "Google Flights", "confidence": "verified"}`).join(',\n        ')}
      },
      "accommodation": {
        "budget": 30,
        "midRange": 80,
        "luxury": 200
      },
      "visaInfo": "Brief visa requirements for the nationalities",
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

- weatherRating: 1-5 stars (5 = excellent weather for tourism)
- priceComparison: "lower" / "typical" / "higher" compared to yearly average
- All prices in EUR (€), per person round-trip with checked luggage
- avgMinTemp/avgMaxTemp in Celsius
- avgRainyDaysPerMonth: average number of rainy days per month during the trip period
- confidence: "verified" if found via search, "estimated" if not found`;
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
                'Content-Type': 'application/json',
                'X-App-Token': 'Marie'
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
            // Strip markdown code blocks if present
            let cleanResponse = response
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            // Find the first { and extract balanced JSON using brace counting
            const startIdx = cleanResponse.indexOf('{');
            if (startIdx === -1) throw new Error('No JSON object found');

            let braceCount = 0;
            let endIdx = -1;
            for (let i = startIdx; i < cleanResponse.length; i++) {
                if (cleanResponse[i] === '{') braceCount++;
                if (cleanResponse[i] === '}') braceCount--;
                if (braceCount === 0) {
                    endIdx = i;
                    break;
                }
            }

            if (endIdx === -1) throw new Error('Unbalanced braces in JSON');

            const jsonStr = cleanResponse.substring(startIdx, endIdx + 1);
            const parsed = JSON.parse(jsonStr);

            if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
                throw new Error('Missing recommendations array');
            }

            return parsed.recommendations;
        } catch (e) {
            console.error('Failed to parse recommendations:', e, '\nResponse:', response);
        }

        // Fallback with helpful message
        return [{
            rank: 1,
            destination: 'Parsing Error',
            startDate: '',
            endDate: '',
            weatherRating: 0,
            avgFlightPrice: 'N/A',
            reasoning: 'Failed to parse AI response. Please tap Regenerate to try again.'
        }];
    },

    /**
     * Render results
     */
    renderResults(recommendations) {
        this.currentRecommendations = recommendations;
        const container = document.getElementById('results-container');

        container.innerHTML = recommendations.map((rec, idx) => `
            <div class="result-card ${rec.rank === 1 ? 'rank-1' : ''}" onclick="app.showRecommendationDetail(${idx})">
                <div class="result-rank">#${rec.rank}</div>
                <div class="result-destination">${rec.destination}</div>
                <div class="result-dates">${this.formatDateRange(rec.startDate, rec.endDate)}</div>

                <div class="result-summary">
                    <div class="summary-item">
                        <span class="summary-icon">✈️</span>
                        <span class="summary-value">~€${rec.avgFlightPrice || 'N/A'}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-icon">☀️</span>
                        <span class="summary-value">${this.renderStars(rec.weatherRating)}</span>
                    </div>
                </div>

                <div class="result-tap-hint">Tap for details</div>
            </div>
        `).join('');
    },

    /**
     * Show recommendation detail popup
     */
    showRecommendationDetail(index) {
        const rec = this.currentRecommendations[index];
        if (!rec) return;

        const content = document.getElementById('recommendation-detail-content');

        // Build flight prices by city HTML
        let flightsByCityHtml = '';
        if (rec.flightsByCity) {
            flightsByCityHtml = Object.entries(rec.flightsByCity).map(([city, data]) => {
                // Handle both old format (number) and new format (object)
                const price = typeof data === 'object' ? data.price : data;
                const source = typeof data === 'object' ? data.source : null;
                return `
                    <div class="detail-flight-row">
                        <span class="detail-flight-city">${city}</span>
                        <span class="detail-flight-price">€${price}${source ? ` <span class="flight-source">(${source})</span>` : ''}</span>
                    </div>
                `;
            }).join('');
        }

        // Price comparison badge
        const priceComparisonText = {
            'lower': '↓ Lower than usual',
            'typical': '→ Typical price',
            'higher': '↑ Higher than usual'
        };
        const priceComparisonClass = {
            'lower': 'price-lower',
            'typical': 'price-typical',
            'higher': 'price-higher'
        };
        const comparison = rec.priceComparison || 'typical';

        // Build weather details HTML
        const weather = rec.weatherDetails || {};
        const tempDisplay = (weather.avgMinTemp !== undefined && weather.avgMaxTemp !== undefined)
            ? `${weather.avgMinTemp}°C - ${weather.avgMaxTemp}°C`
            : 'N/A';
        const rainyDaysDisplay = weather.avgRainyDaysPerMonth !== undefined
            ? `${weather.avgRainyDaysPerMonth} days/month`
            : 'N/A';

        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-rank">#${rec.rank} Recommendation</div>
                <h3 class="detail-destination">${rec.destination}</h3>
                <div class="detail-dates">${this.formatDateRange(rec.startDate, rec.endDate)}</div>
            </div>

            <div class="detail-section">
                <h4>✈️ Flight Prices</h4>
                <div class="detail-flights">
                    ${flightsByCityHtml || '<p>No flight data available</p>'}
                    <div class="detail-flight-avg">
                        <span>Average</span>
                        <span>€${rec.avgFlightPrice || 'N/A'}</span>
                    </div>
                </div>
                <div class="detail-comparison ${priceComparisonClass[comparison]}">
                    ${priceComparisonText[comparison]}
                </div>
            </div>

            <div class="detail-section">
                <h4>☀️ Weather</h4>
                <div class="detail-weather-info">
                    <div class="detail-weather-row">
                        <span class="detail-weather-label">Avg. temperature</span>
                        <span class="detail-weather-value">${tempDisplay}</span>
                    </div>
                    <div class="detail-weather-row">
                        <span class="detail-weather-label">Avg. rainy days</span>
                        <span class="detail-weather-value">${rainyDaysDisplay}</span>
                    </div>
                    <div class="detail-weather-description">${weather.description || rec.weatherSummary || ''}</div>
                </div>
                <div class="detail-rating">
                    <span>Weather rating:</span>
                    <span class="rating-stars">${this.renderStars(rec.weatherRating)}</span>
                </div>
            </div>

            ${rec.accommodation ? `
            <div class="detail-section">
                <h4>🏨 Accommodation (per night)</h4>
                <div class="detail-accommodation">
                    <div class="accom-tier">
                        <span class="accom-label">Budget</span>
                        <span class="accom-price">€${rec.accommodation.budget}</span>
                    </div>
                    <div class="accom-tier">
                        <span class="accom-label">Mid-range</span>
                        <span class="accom-price">€${rec.accommodation.midRange}</span>
                    </div>
                    <div class="accom-tier">
                        <span class="accom-label">Luxury</span>
                        <span class="accom-price">€${rec.accommodation.luxury}</span>
                    </div>
                </div>
            </div>
            ` : ''}

            ${rec.visaInfo ? `
            <div class="detail-section">
                <h4>📋 Visa Requirements</h4>
                <p class="detail-reasoning">${rec.visaInfo}</p>
            </div>
            ` : ''}

            <div class="detail-section">
                <h4>💡 Why this option?</h4>
                <p class="detail-reasoning">${rec.reasoning}</p>
            </div>
        `;

        document.getElementById('recommendation-detail').classList.add('active');
    },

    /**
     * Close recommendation detail popup
     */
    closeRecommendationDetail() {
        document.getElementById('recommendation-detail').classList.remove('active');
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
