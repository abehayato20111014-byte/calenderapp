/**
 * Schola Planner - Service Worker内包 Webアプリケーション版 (app.js)
 */

dayjs.locale('ja');

const firebaseConfig = {
    apiKey: "AIzaSyDOJMMM9mlLPv-v-FY38NgyEn197HfuNz8",
    authDomain: "project-3274200529122638548.firebaseapp.com",
    databaseURL: "https://project-3274200529122638548-default-rtdb.firebaseio.com",
    projectId: "project-3274200529122638548",
    storageBucket: "project-3274200529122638548.firebasestorage.app",
    messagingSenderId: "307664229113",
    appId: "1:307664229113:web:3feceb6320b93f5bdc4828"
};

const DEFAULT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'];

const state = {
    currentDate: dayjs(),
    pickerYear: dayjs().year(),
    events: [],
    favorites: [],
    previousEventsSnapshot: null,
    profile: { userId: '', userName: '' },
    settings: { autoDeleteCompleted: false, globalNotification: true, weekStart: 'sun', tabBarPosition: 'bottom' },
    customColors: [...DEFAULT_COLORS],
    selectedColor: DEFAULT_COLORS[0],
    customTheme: { bgImage: '', userIcon: '' },
    activeTab: 'view-dayweek',
    activeSubView: 'day',
    friends: {},          
    incomingRequests: [], 
    groups: {},           
    tutorialStep: 1
};

let currentModalNotifications = [];
let toastTimeout = null;
let isFirebaseReady = false;
let audioCtx = null;

document.addEventListener('DOMContentLoaded', () => {
    dayjs.locale('ja');

    registerInlineServiceWorker();
    initFirebase();
    loadLocalData();
    applyTheme();
    applyTabBarPosition();
    initNavigation();
    initDayWeekView();
    initMonthView();
    initListView();
    initGroupAndFriendView();
    checkURLFriendInvite();
    initSettingsView();
    initImageUploads();
    initModalEvents();
    initToastEvents();
    initTutorial();
    initMonthSwipe();
    requestNotificationPermission();

    const unlockAudio = () => {
        unlockAudioContext();
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    checkAndProcessEvents();
    setInterval(checkAndProcessEvents, 60000);
    setInterval(checkScheduledNotifications, 10000);
    setInterval(updateCurrentTimeIndicator, 60000);

    renderAllViews();

    if (!localStorage.getItem('schola_tutorial_seen')) {
        openTutorial();
    }
});

/* app.js 内で Blob を用いて Service Worker を動的登録 */
function registerInlineServiceWorker() {
    if ('serviceWorker' in navigator) {
        const swCode = `
            self.addEventListener('install', (e) => self.skipWaiting());
            self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
            self.addEventListener('notificationclick', (event) => {
                event.notification.close();
                event.waitUntil(
                    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                        for (let i = 0; i < clientList.length; i++) {
                            let client = clientList[i];
                            if ('focus' in client) return client.focus();
                        }
                        if (clients.openWindow) return clients.openWindow('./');
                    })
                );
            });
        `;
        const blob = new Blob([swCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        navigator.serviceWorker.register(blobUrl)
            .then(reg => console.log('Inline Service Worker Registered:', reg.scope))
            .catch(err => {
                console.warn('Inline SW Registration failed, trying sw.js fallback:', err);
                navigator.serviceWorker.register('sw.js').catch(() => {});
            });
    }
}

function initFirebase() {
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        isFirebaseReady = true;
    } catch (e) {
        console.warn('Firebase connection standby');
    }
}

function loadLocalData() {
    const savedEvents = localStorage.getItem('schola_events_v3');
    if (savedEvents) state.events = JSON.parse(savedEvents);

    const savedFavs = localStorage.getItem('schola_favorites');
    if (savedFavs) state.favorites = JSON.parse(savedFavs);

    const savedProfile = localStorage.getItem('schola_user_profile');
    if (savedProfile) state.profile = JSON.parse(savedProfile);

    const savedSettings = localStorage.getItem('schola_settings');
    if (savedSettings) {
        state.settings = Object.assign(state.settings, JSON.parse(savedSettings));
        const autoDelToggle = document.getElementById('autoDeleteCompletedToggle');
        if (autoDelToggle) autoDelToggle.checked = !!state.settings.autoDeleteCompleted;
        const weekStartSelect = document.getElementById('weekStartSelect');
        if (weekStartSelect) weekStartSelect.value = state.settings.weekStart || 'sun';
        const tabBarSelect = document.getElementById('tabBarPositionSelect');
        if (tabBarSelect) tabBarSelect.value = state.settings.tabBarPosition || 'bottom';
    }

    const savedColors = localStorage.getItem('schola_custom_colors');
    if (savedColors) state.customColors = JSON.parse(savedColors);
    if (state.customColors.length > 0) state.selectedColor = state.customColors[0];

    const savedTheme = localStorage.getItem('schola_theme');
    if (savedTheme) state.customTheme = JSON.parse(savedTheme);
}

function saveData() {
    localStorage.setItem('schola_events_v3', JSON.stringify(state.events));
    localStorage.setItem('schola_favorites', JSON.stringify(state.favorites));
    localStorage.setItem('schola_user_profile', JSON.stringify(state.profile));
    localStorage.setItem('schola_settings', JSON.stringify(state.settings));
    localStorage.setItem('schola_custom_colors', JSON.stringify(state.customColors));
    localStorage.setItem('schola_theme', JSON.stringify(state.customTheme));

    syncCloudUserData();
}

function syncCloudUserData() {
    if (!isFirebaseReady || !state.profile.userId) return;
    try {
        const db = firebase.database();
        db.ref('users/' + state.profile.userId).set({
            userId: state.profile.userId,
            userName: state.profile.userName,
            events: state.events,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('Cloud Sync Error:', e);
    }
}

function applyTabBarPosition() {
    const appContainer = document.getElementById('appContainer');
    if (!appContainer) return;

    appContainer.classList.remove('tab-pos-bottom', 'tab-pos-top', 'tab-pos-left', 'tab-pos-right');
    const pos = state.settings.tabBarPosition || 'bottom';
    appContainer.classList.add(`tab-pos-${pos}`);
}

function initTutorial() {
    const showBtn = document.getElementById('showTutorialBtn');
    if (showBtn) showBtn.addEventListener('click', openTutorial);
    const closeBtn = document.getElementById('closeTutorialBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeTutorial);
    const prevBtn = document.getElementById('prevStepBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => changeTutorialStep(-1));
    const nextBtn = document.getElementById('nextStepBtn');
    if (nextBtn) nextBtn.addEventListener('click', () => changeTutorialStep(1));
    const finishBtn = document.getElementById('finishTutorialBtn');
    if (finishBtn) finishBtn.addEventListener('click', closeTutorial);
}

function openTutorial() {
    state.tutorialStep = 1;
    updateTutorialUI();
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.classList.remove('hidden');
}

function closeTutorial() {
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem('schola_tutorial_seen', 'true');
}

function changeTutorialStep(delta) {
    state.tutorialStep = Math.max(1, Math.min(4, state.tutorialStep + delta));
    updateTutorialUI();
}

function updateTutorialUI() {
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`tutorialStep${i}`);
        if (stepEl) {
            if (i === state.tutorialStep) stepEl.classList.remove('hidden');
            else stepEl.classList.add('hidden');
        }
    }
    document.querySelectorAll('.step-dots .dot').forEach((dot, idx) => {
        if (idx + 1 === state.tutorialStep) dot.classList.add('active');
        else dot.classList.remove('active');
    });

    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    const finishBtn = document.getElementById('finishTutorialBtn');

    if (prevBtn) prevBtn.classList.toggle('hidden', state.tutorialStep === 1);
    if (nextBtn) nextBtn.classList.toggle('hidden', state.tutorialStep === 4);
    if (finishBtn) finishBtn.classList.toggle('hidden', state.tutorialStep !== 4);
}

function initMonthSwipe() {
    const swipeArea = document.getElementById('calendarSwipeArea');
    if (!swipeArea) return;
    let startX = 0, startY = 0;

    swipeArea.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    swipeArea.addEventListener('touchend', (e) => {
        if (!startX || !startY) return;
        const diffX = startX - e.changedTouches[0].clientX;
        const diffY = startY - e.changedTouches[0].clientY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
            state.currentDate = diffX > 0 ? state.currentDate.add(1, 'month') : state.currentDate.subtract(1, 'month');
            renderMonthCalendar();
        }
        startX = 0; startY = 0;
    }, { passive: true });
}

function recordStateForUndo(actionMessage) {
    state.previousEventsSnapshot = JSON.parse(JSON.stringify(state.events));
    showToast(actionMessage, true);
}

function showToast(message, showUndo = false) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('toastUndoBtn');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    if (undoBtn) undoBtn.classList.toggle('hidden', !showUndo);
    toast.classList.remove('hidden');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 5000);
}

function initToastEvents() {
    const undoBtn = document.getElementById('toastUndoBtn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (state.previousEventsSnapshot) {
                state.events = JSON.parse(JSON.stringify(state.previousEventsSnapshot));
                state.previousEventsSnapshot = null;
                saveData();
                renderAllViews();
                showToast('変更を元に戻しました', false);
            }
        });
    }
}

function applyTheme() {
    const container = document.getElementById('appContainer');
    const headerAvatar = document.getElementById('headerAvatar');
    const groupAvatar = document.getElementById('groupAvatar');

    if (container) {
        container.style.backgroundImage = state.customTheme.bgImage ? `url('${state.customTheme.bgImage}')` : 'none';
    }

    const setAvatar = (el) => {
        if (!el) return;
        if (state.customTheme.userIcon) {
            el.style.backgroundImage = `url('${state.customTheme.userIcon}')`;
            el.textContent = '';
        } else {
            el.style.backgroundImage = 'none';
            el.textContent = '👤';
        }
    };
    setAvatar(headerAvatar);
    setAvatar(groupAvatar);
}

function checkAndProcessEvents() {
    const now = dayjs();
    let hasChanges = false;

    state.events = state.events.filter(evt => {
        if (evt.isAllDay) return true;
        const endDateTime = dayjs(`${evt.endDate || evt.date} ${evt.endTime}`);
        if (now.isAfter(endDateTime)) {
            if (state.settings.autoDeleteCompleted) {
                hasChanges = true;
                return false;
            } else if (!evt.completed) {
                evt.completed = true;
                hasChanges = true;
            }
        }
        return true;
    });

    if (hasChanges) {
        saveData();
        renderAllViews();
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function unlockAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playNotificationSound() {
    try {
        unlockAudioContext();
        
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
        osc.frequency.setValueAtTime(1320, now + 0.15);
        
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    } catch (e) {
        console.warn('Audio play failed:', e);
    }
}

function triggerNotification(title, message) {
    playNotificationSound();

    if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: message,
                    icon: state.customTheme.userIcon || undefined,
                    badge: state.customTheme.userIcon || undefined,
                    tag: 'schola-planner-' + Date.now(),
                    renotify: true
                });
            }).catch(() => {
                new Notification(title, { body: message });
            });
        } else {
            try {
                new Notification(title, { body: message });
            } catch (e) {
                console.warn('Desktop Notification error:', e);
            }
        }
    }
    showToast(`🔔 ${title}: ${message}`);
}

function checkScheduledNotifications() {
    const now = dayjs();
    let hasChanges = false;

    state.events.forEach(evt => {
        if (!evt.notifications || evt.notifications.length === 0) return;

        const startStr = evt.startDate || evt.date;
        const timeStr = evt.isAllDay ? '00:00' : (evt.startTime || '00:00');
        const eventStartDateTime = dayjs(`${startStr} ${timeStr}`);

        evt.notifications.forEach(notif => {
            if (notif.triggered) return;

            let notifTime = eventStartDateTime;
            if (notif.unit === 'min') notifTime = eventStartDateTime.subtract(notif.value, 'minute');
            else if (notif.unit === 'hour') notifTime = eventStartDateTime.subtract(notif.value, 'hour');
            else if (notif.unit === 'day') notifTime = eventStartDateTime.subtract(notif.value, 'day');

            if (now.isAfter(notifTime) || now.isSame(notifTime, 'second')) {
                notif.triggered = true;
                hasChanges = true;

                let unitLabel = '分';
                if (notif.unit === 'hour') unitLabel = '時間';
                if (notif.unit === 'day') unitLabel = '日';

                triggerNotification(`予定のリマインダー`, `「${evt.title}」の${notif.value}${unitLabel}前になりました`);
            }
        });
    });

    if (hasChanges) {
        saveData();
    }
}

function initNavigation() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            switchTab(e.currentTarget.dataset.tab);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    const navBtn = document.querySelector(`.bottom-nav .nav-item[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add('active');
    
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.add('active');

    state.activeTab = tabId;
    renderAllViews();
}

function renderAllViews() {
    if (state.activeSubView === 'day') {
        renderDayTimeline();
    } else {
        renderWeekTimeline();
    }
    renderMonthCalendar();
    renderDetailedList();
    renderGroupSection();
    renderSettingsColorPalette();
}

function initDayWeekView() {
    const btnDay = document.getElementById('btnViewDay');
    const btnWeek = document.getElementById('btnViewWeek');
    
    if (btnDay && btnWeek) {
        btnDay.addEventListener('click', () => {
            btnDay.classList.add('active');
            btnWeek.classList.remove('active');
            document.getElementById('dayTimelineView').classList.remove('hidden');
            document.getElementById('weekTimelineView').classList.add('hidden');
            state.activeSubView = 'day';
            renderDayTimeline();
        });

        btnWeek.addEventListener('click', () => {
            btnWeek.classList.add('active');
            btnDay.classList.remove('active');
            document.getElementById('dayTimelineView').classList.add('hidden');
            document.getElementById('weekTimelineView').classList.remove('hidden');
            state.activeSubView = 'week';
            renderWeekTimeline();
        });
    }

    const prevBtn = document.getElementById('prevDateBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            state.currentDate = state.activeSubView === 'day' 
                ? state.currentDate.subtract(1, 'day') 
                : state.currentDate.subtract(1, 'week');
            renderAllViews();
        });
    }

    const nextBtn = document.getElementById('nextDateBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            state.currentDate = state.activeSubView === 'day' 
                ? state.currentDate.add(1, 'day') 
                : state.currentDate.add(1, 'week');
            renderAllViews();
        });
    }

    const todayBtn = document.getElementById('todayDateBtn');
    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            state.currentDate = dayjs();
            renderAllViews();
        });
    }

    ['timeAxis', 'weekTimeAxis'].forEach(id => {
        const axis = document.getElementById(id);
        if (axis) {
            axis.innerHTML = '';
            for (let h = 0; h < 24; h++) {
                const slot = document.createElement('div');
                slot.className = 'time-slot-label';
                slot.textContent = `${String(h).padStart(2, '0')}:00`;
                axis.appendChild(slot);
            }
        }
    });
}

function isEventOnDate(evt, dateStr) {
    const start = evt.startDate || evt.date;
    const end = evt.endDate || evt.date;
    return start <= dateStr && dateStr <= end;
}

function getJapaneseDayOfWeek(dayObj) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayObj.day()];
}

function renderDayTimeline() {
    const jaDay = getJapaneseDayOfWeek(state.currentDate);
    const dateDisp = document.getElementById('currentDateDisplay');
    if (dateDisp) dateDisp.textContent = `${state.currentDate.format('YYYY/MM/DD')}(${jaDay})`;
    
    const container = document.getElementById('eventsContainer');
    if (!container) return;
    container.innerHTML = '';

    const todayStr = state.currentDate.format('YYYY-MM-DD');
    const todayEvents = state.events.filter(e => isEventOnDate(e, todayStr) && !e.isAllDay);

    todayEvents.forEach(evt => {
        const card = document.createElement('div');
        card.className = `event-card ${evt.isImportant ? 'important-event' : ''}`;
        
        if (evt.color) {
            card.style.backgroundColor = evt.color;
            card.style.color = '#ffffff';
        }

        const [sH, sM] = (evt.startTime || '00:00').split(':').map(Number);
        const [eH, eM] = (evt.endTime || '01:00').split(':').map(Number);
        const topPx = (sH * 50) + (sM * 50 / 60);
        const heightPx = ((eH * 50) + (eM * 50 / 60)) - topPx;

        card.style.top = `${topPx}px`;
        card.style.height = `${Math.max(heightPx, 24)}px`;
        
        const icon = evt.isImportant ? '⭐ ' : '';
        card.innerHTML = `
            <strong>${icon}${evt.title}</strong> (${evt.startTime}-${evt.endTime})
            <div class="event-card-resize-handle"></div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('event-card-resize-handle')) return;
            openEventModal(evt);
        });

        setupEventDragAndResize(card, evt);
        container.appendChild(card);
    });

    updateCurrentTimeIndicator();
}

function setupEventDragAndResize(card, evt) {
    let startY, startTop, startHeight;
    let isResizing = false;
    let isDragging = false;

    const onPointerDown = (e) => {
        e.stopPropagation();
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        startTop = parseFloat(card.style.top);
        startHeight = parseFloat(card.style.height);

        if (e.target.classList.contains('event-card-resize-handle')) {
            isResizing = true;
        } else {
            isDragging = true;
        }

        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
    };

    const onPointerMove = (e) => {
        if (!isDragging && !isResizing) return;
        if (e.preventDefault) e.preventDefault();

        const currentY = e.clientY || (e.touches && e.touches[0].clientY);
        const deltaY = currentY - startY;

        if (isDragging) {
            let newTop = Math.max(0, Math.min(1200 - startHeight, startTop + deltaY));
            newTop = Math.round(newTop / 12.5) * 12.5;
            card.style.top = `${newTop}px`;
        } else if (isResizing) {
            let newHeight = Math.max(20, startHeight + deltaY);
            newHeight = Math.round(newHeight / 12.5) * 12.5;
            card.style.height = `${newHeight}px`;
        }
    };

    const onPointerUp = () => {
        if (isDragging || isResizing) {
            const topPx = parseFloat(card.style.top);
            const heightPx = parseFloat(card.style.height);

            const startMinutes = Math.round((topPx / 50) * 60);
            const durationMinutes = Math.round((heightPx / 50) * 60);
            const endMinutes = startMinutes + durationMinutes;

            const formatTime = (totalM) => {
                const h = Math.floor(totalM / 60);
                const m = totalM % 60;
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            };

            recordStateForUndo(`予定「${evt.title}」の時間を変更しました`);
            evt.startTime = formatTime(startMinutes);
            evt.endTime = formatTime(Math.min(1439, endMinutes));

            saveData();
            renderAllViews();
        }

        isDragging = false;
        isResizing = false;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
    };

    card.addEventListener('mousedown', onPointerDown);
    card.addEventListener('touchstart', onPointerDown, { passive: false });
}

function updateCurrentTimeIndicator() {
    const indicator = document.getElementById('currentTimeIndicator');
    if (!indicator) return;

    if (state.currentDate.isSame(dayjs(), 'day')) {
        indicator.classList.remove('hidden');
        const now = dayjs();
        const topPx = (now.hour() * 50) + (now.minute() * 50 / 60);
        indicator.style.top = `${topPx}px`;
    } else {
        indicator.classList.add('hidden');
    }
}

function renderWeekTimeline() {
    const isMonStart = state.settings.weekStart === 'mon';
    const startOfWeek = state.currentDate.startOf('week').add(isMonStart ? 1 : 0, 'day');
    const endOfWeek = startOfWeek.add(6, 'day');

    const dateDisp = document.getElementById('currentDateDisplay');
    if (dateDisp) {
        dateDisp.textContent = `${startOfWeek.format('MM/DD')} 〜 ${endOfWeek.format('MM/DD')}`;
    }

    const container = document.getElementById('weekGridContainer');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const dayObj = startOfWeek.add(i, 'day');
        const dayStr = dayObj.format('YYYY-MM-DD');
        const isToday = dayObj.isSame(dayjs(), 'day');
        const dayOfWeek = dayObj.day();

        let colorClass = '';
        if (dayOfWeek === 6) colorClass = 'sat';
        if (dayOfWeek === 0) colorClass = 'sun';

        const col = document.createElement('div');
        col.className = 'week-timeline-col';

        const header = document.createElement('div');
        header.className = `week-col-header-sticky ${isToday ? 'is-today' : ''} ${colorClass}`;
        const jaDay = getJapaneseDayOfWeek(dayObj);
        header.textContent = `${dayObj.date()}(${jaDay})`;
        col.appendChild(header);

        const dayEvents = state.events.filter(e => isEventOnDate(e, dayStr) && !e.isAllDay);

        dayEvents.forEach(evt => {
            const card = document.createElement('div');
            card.className = `event-card ${evt.isImportant ? 'important-event' : ''}`;
            if (evt.color) card.style.backgroundColor = evt.color;

            const [sH, sM] = (evt.startTime || '00:00').split(':').map(Number);
            const [eH, eM] = (evt.endTime || '01:00').split(':').map(Number);
            const topPx = (sH * 50) + (sM * 50 / 60) + 28;
            const heightPx = ((eH * 50) + (eM * 50 / 60)) - ((sH * 50) + (sM * 50 / 60));

            card.style.top = `${topPx}px`;
            card.style.height = `${Math.max(heightPx, 20)}px`;

            card.innerHTML = `<strong>${evt.title}</strong>`;
            card.addEventListener('click', () => openEventModal(evt));
            col.appendChild(card);
        });

        container.appendChild(col);
    }
}

function initMonthView() {
    const monthBtn = document.getElementById('monthDisplay');
    if (monthBtn) {
        monthBtn.addEventListener('click', openMonthPickerModal);
    }

    const prevBtn = document.getElementById('prevMonthBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        state.currentDate = state.currentDate.subtract(1, 'month');
        renderMonthCalendar();
    });

    const nextBtn = document.getElementById('nextMonthBtn');
    if (nextBtn) nextBtn.addEventListener('click', () => {
        state.currentDate = state.currentDate.add(1, 'month');
        renderMonthCalendar();
    });

    const todayBtn = document.getElementById('todayMonthBtn');
    if (todayBtn) todayBtn.addEventListener('click', () => {
        state.currentDate = dayjs();
        renderMonthCalendar();
    });
}

function openMonthPickerModal() {
    const modal = document.getElementById('monthPickerModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    state.pickerYear = state.currentDate.year();
    renderMonthPickerContent();

    document.getElementById('pickerPrevYearBtn').onclick = () => {
        state.pickerYear--;
        renderMonthPickerContent();
    };
    document.getElementById('pickerNextYearBtn').onclick = () => {
        state.pickerYear++;
        renderMonthPickerContent();
    };
}

function renderMonthPickerContent() {
    document.getElementById('pickerYearDisplay').textContent = `${state.pickerYear}年`;
    const grid = document.getElementById('monthGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        const isCurrentSelected = state.currentDate.year() === state.pickerYear && state.currentDate.month() + 1 === m;
        btn.className = `month-item-btn ${isCurrentSelected ? 'active' : ''}`;
        btn.textContent = `${m}月`;
        btn.addEventListener('click', () => {
            state.currentDate = state.currentDate.year(state.pickerYear).month(m - 1);
            document.getElementById('monthPickerModal').classList.add('hidden');
            renderMonthCalendar();
        });
        grid.appendChild(btn);
    }
}

function renderMonthCalendar() {
    const monthDisp = document.getElementById('monthDisplay');
    if (monthDisp) monthDisp.textContent = state.currentDate.format('YYYY年 MM月');

    const weekdaysContainer = document.getElementById('calendarWeekdays');
    if (weekdaysContainer) {
        weekdaysContainer.innerHTML = '';
        const isMonStart = state.settings.weekStart === 'mon';
        const weekdays = isMonStart ? [
            { label: '月', cls: '' }, { label: '火', cls: '' }, { label: '水', cls: '' },
            { label: '木', cls: '' }, { label: '金', cls: '' }, { label: '土', cls: 'sat' }, { label: '日', cls: 'sun' }
        ] : [
            { label: '日', cls: 'sun' }, { label: '月', cls: '' }, { label: '火', cls: '' },
            { label: '水', cls: '' }, { label: '木', cls: '' }, { label: '金', cls: '' }, { label: '土', cls: 'sat' }
        ];

        weekdays.forEach(w => {
            const div = document.createElement('div');
            div.className = `weekday-cell ${w.cls}`;
            div.textContent = w.label;
            weekdaysContainer.appendChild(div);
        });
    }

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isMonStart = state.settings.weekStart === 'mon';
    const startOfMonth = state.currentDate.startOf('month');
    const daysInMonth = state.currentDate.daysInMonth();
    
    let startDayIndex = startOfMonth.day();
    if (isMonStart) startDayIndex = (startDayIndex === 0) ? 6 : startDayIndex - 1;

    for (let i = 0; i < startDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell disabled';
        grid.appendChild(emptyCell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = state.currentDate.date(d);
        const dateStr = dateObj.format('YYYY-MM-DD');
        const isToday = dateObj.isSame(dayjs(), 'day');
        const dayOfWeek = dateObj.day();

        let dayColorClass = '';
        if (dayOfWeek === 6) dayColorClass = 'sat';
        if (dayOfWeek === 0) dayColorClass = 'sun';

        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';

        const numDiv = document.createElement('div');
        numDiv.className = `day-number ${isToday ? 'is-today' : ''} ${dayColorClass}`;
        numDiv.textContent = d;
        cell.appendChild(numDiv);

        cell.addEventListener('click', () => {
            state.currentDate = dateObj;
            switchTab('view-dayweek');
        });

        const dayEvents = state.events.filter(e => isEventOnDate(e, dateStr));
        dayEvents.sort((a, b) => {
            const aIsMultiOrAllDay = a.isAllDay || (a.startDate && a.endDate && a.startDate !== a.endDate);
            const bIsMultiOrAllDay = b.isAllDay || (b.startDate && b.endDate && b.startDate !== b.endDate);
            if (aIsMultiOrAllDay && !bIsMultiOrAllDay) return -1;
            if (!aIsMultiOrAllDay && bIsMultiOrAllDay) return 1;
            return (a.startTime || '').localeCompare(b.startTime || '');
        });

        dayEvents.forEach(evt => {
            const isMultiDay = evt.startDate && evt.endDate && evt.startDate !== evt.endDate;
            const evtLabel = document.createElement('div');
            evtLabel.className = `cell-event ${evt.isImportant ? 'important-event' : ''}`;
            if (evt.color) {
                evtLabel.style.backgroundColor = evt.color;
                evtLabel.style.color = '#ffffff';
            }

            let prefix = evt.isImportant ? '⭐' : '';
            if (evt.isAllDay) prefix += '【終日】';
            else if (isMultiDay) prefix += '↔️';

            let displayTitle = prefix + evt.title;
            if (displayTitle.length > 7) displayTitle = displayTitle.substring(0, 6) + '…';

            evtLabel.textContent = displayTitle;
            cell.appendChild(evtLabel);
        });

        grid.appendChild(cell);
    }
}

function initListView() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderDetailedList);

    const sortSelect = document.getElementById('sortOrderSelect');
    if (sortSelect) sortSelect.addEventListener('change', renderDetailedList);

    const checkComplete = document.getElementById('showCompletedCheck');
    if (checkComplete) checkComplete.addEventListener('change', renderDetailedList);

    const filterStart = document.getElementById('filterStartDateInput');
    if (filterStart) filterStart.addEventListener('change', renderDetailedList);

    const filterEnd = document.getElementById('filterEndDateInput');
    if (filterEnd) filterEnd.addEventListener('change', renderDetailedList);

    const clearBtn = document.getElementById('clearDateFilterBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (filterStart) filterStart.value = '';
            if (filterEnd) filterEnd.value = '';
            renderDetailedList();
        });
    }
}

function renderDetailedList() {
    const container = document.getElementById('detailedEventList');
    if (!container) return;
    container.innerHTML = '';

    const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const sortOrder = document.getElementById('sortOrderSelect')?.value || 'asc';
    const showCompleted = document.getElementById('showCompletedCheck')?.checked;
    const filterStartVal = document.getElementById('filterStartDateInput')?.value;
    const filterEndVal = document.getElementById('filterEndDateInput')?.value;

    let filtered = state.events.filter(evt => {
        if (!showCompleted && evt.completed) return false;
        if (query && !evt.title.toLowerCase().includes(query)) return false;

        const evtStart = evt.startDate || evt.date;
        const evtEnd = evt.endDate || evt.date;

        if (filterStartVal && evtEnd < filterStartVal) return false;
        if (filterEndVal && evtStart > filterEndVal) return false;

        return true;
    });

    filtered.sort((a, b) => {
        const dateA = a.startDate || a.date;
        const dateB = b.startDate || b.date;
        const comp = dateA.localeCompare(dateB);
        return sortOrder === 'asc' ? comp : -comp;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:0.9rem;">該当する予定はありません</div>';
        return;
    }

    filtered.forEach(evt => {
        const item = document.createElement('div');
        item.className = `detailed-event-card ${evt.completed ? 'is-completed' : ''}`;
        
        const startD = evt.startDate || evt.date;
        const endD = evt.endDate || evt.date;

        const startObj = dayjs(startD);
        const endObj = dayjs(endD);

        const isSameDay = startD === endD;
        const dateDisplay = isSameDay 
            ? `${startObj.format('YYYY/MM/DD')} (${getJapaneseDayOfWeek(startObj)})`
            : `${startObj.format('MM/DD')}(${getJapaneseDayOfWeek(startObj)}) 〜 ${endObj.format('MM/DD')}(${getJapaneseDayOfWeek(endObj)})`;

        const timeDisplay = evt.isAllDay ? '終日' : `${evt.startTime} 〜 ${evt.endTime}`;
        const accentColor = evt.color || '#3b82f6';

        item.innerHTML = `
            <div class="card-color-bar" style="background-color: ${accentColor};"></div>
            <div class="card-main-content">
                <div class="card-top-row">
                    <div class="card-title-group">
                        <input type="checkbox" ${evt.completed ? 'checked' : ''} data-id="${evt.id}" class="complete-toggle">
                        <span class="card-title">${evt.title}</span>
                    </div>
                    <div class="card-badges">
                        ${evt.isImportant ? '<span class="badge-important">⭐ 重要</span>' : ''}
                        ${evt.completed ? '<span class="badge-completed">完了</span>' : ''}
                    </div>
                </div>
                <div class="card-meta-row">
                    <span class="meta-item">📅 ${dateDisplay}</span>
                    <span class="meta-item">⏰ ${timeDisplay}</span>
                </div>
            </div>
            <button class="btn btn-secondary btn-small edit-btn" data-id="${evt.id}">編集</button>
        `;

        item.querySelector('.complete-toggle').addEventListener('change', (e) => {
            recordStateForUndo(`予定「${evt.title}」の状態を変更しました`);
            evt.completed = e.target.checked;
            saveData();
            renderDetailedList();
        });

        item.querySelector('.edit-btn').addEventListener('click', () => openEventModal(evt));
        container.appendChild(item);
    });
}

function initGroupAndFriendView() {
    const saveProfBtn = document.getElementById('saveProfileBtn');
    if (saveProfBtn) {
        saveProfBtn.addEventListener('click', () => {
            const userId = document.getElementById('setupUserIdInput').value.trim();
            const userName = document.getElementById('setupUserNameInput').value.trim();

            if (!userId || !userName) {
                alert('IDと名前の両方を入力してください。');
                return;
            }

            state.profile = { userId, userName };
            saveData();
            renderGroupSection();
            listenToFirebaseRealtime();
            showToast('プロフィールを保存し、クラウド同期を開始しました');
        });
    }

    const editProfBtn = document.getElementById('editProfileBtn');
    if (editProfBtn) {
        editProfBtn.addEventListener('click', () => {
            document.getElementById('profileSetupCard').classList.remove('hidden');
            document.getElementById('groupMainArea').classList.add('hidden');
        });
    }

    const copyLinkBtn = document.getElementById('copyInviteLinkBtn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyFriendInviteLink);
    }

    const sendReqBtn = document.getElementById('sendFriendRequestBtn');
    if (sendReqBtn) {
        sendReqBtn.addEventListener('click', sendFriendRequest);
    }

    const createGrpBtn = document.getElementById('createGroupBtn');
    if (createGrpBtn) {
        createGrpBtn.addEventListener('click', createNewGroup);
    }

    if (state.profile.userId) {
        listenToFirebaseRealtime();
    }
}

function copyFriendInviteLink() {
    if (!state.profile.userId) {
        alert('先にプロフィール（IDと名前）を設定してください。');
        return;
    }

    const inviteUrl = `${window.location.origin}${window.location.pathname}?add_friend=${encodeURIComponent(state.profile.userId)}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteUrl).then(() => {
            showToast('📋 招待リンクをコピーしました！友達に共有してください');
        }).catch(() => {
            prompt('以下のリンクをコピーして共有してください:', inviteUrl);
        });
    } else {
        prompt('以下のリンクをコピーして共有してください:', inviteUrl);
    }
}

function checkURLFriendInvite() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('add_friend');

    if (targetUserId) {
        switchTab('view-group');

        const input = document.getElementById('friendSearchIdInput');
        if (input) {
            input.value = targetUserId;
            showToast(`🔗 ID: ${targetUserId} さんの招待リンクを開きました。「申請送信」を押してください`);
        }

        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function listenToFirebaseRealtime() {
    if (!isFirebaseReady || !state.profile.userId) return;

    const db = firebase.database();
    const myId = state.profile.userId;

    db.ref('friendRequests/' + myId).on('value', (snapshot) => {
        const val = snapshot.val() || {};
        state.incomingRequests = [];
        Object.keys(val).forEach(key => {
            if (val[key].status === 'pending') {
                state.incomingRequests.push(val[key]);
            }
        });
        renderFriendRequests();
    });

    db.ref('friends/' + myId).on('value', (snapshot) => {
        const val = snapshot.val() || {};
        state.friends = val;
        renderFriendsList();
        renderCreateGroupFriendsSelect();
    });

    db.ref('userGroups/' + myId).on('value', (snapshot) => {
        const val = snapshot.val() || {};
        state.groups = {};
        const groupIds = Object.keys(val);

        if (groupIds.length === 0) {
            renderMyGroupsList();
            return;
        }

        groupIds.forEach(gId => {
            db.ref('groups/' + gId).on('value', (gSnap) => {
                if (gSnap.exists()) {
                    state.groups[gId] = gSnap.val();
                    renderMyGroupsList();
                }
            });
        });
    });
}

function sendFriendRequest() {
    const input = document.getElementById('friendSearchIdInput');
    const targetId = input ? input.value.trim() : '';

    if (!targetId) {
        alert('相手のユーザーIDを入力してください。');
        return;
    }
    if (targetId === state.profile.userId) {
        alert('自分自身にフレンド申請を送ることはできません。');
        return;
    }

    if (!isFirebaseReady) return;

    const db = firebase.database();
    db.ref('users/' + targetId).once('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert('指定されたユーザーIDが見つかりませんでした。');
            return;
        }

        db.ref(`friendRequests/${targetId}/${state.profile.userId}`).set({
            fromId: state.profile.userId,
            fromName: state.profile.userName,
            status: 'pending',
            timestamp: Date.now()
        }).then(() => {
            showToast(`${targetId} さんにフレンド申請を送信しました`);
            if (input) input.value = '';
        });
    });
}

function renderFriendRequests() {
    const container = document.getElementById('incomingRequestsList');
    if (!container) return;
    container.innerHTML = '';

    if (state.incomingRequests.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8;">届いている申請はありません</div>';
        return;
    }

    state.incomingRequests.forEach(req => {
        const item = document.createElement('div');
        item.className = 'request-item';
        item.innerHTML = `
            <div>
                <strong>${req.fromName}</strong>
                <span style="font-size:0.75rem; color:#64748b;">(ID: ${req.fromId})</span>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn btn-primary accept-btn" style="font-size:0.75rem; padding:4px 8px;">承認</button>
                <button class="btn btn-secondary reject-btn" style="font-size:0.75rem; padding:4px 8px;">拒否</button>
            </div>
        `;

        item.querySelector('.accept-btn').onclick = () => acceptFriendRequest(req);
        item.querySelector('.reject-btn').onclick = () => rejectFriendRequest(req);
        container.appendChild(item);
    });
}

function acceptFriendRequest(req) {
    if (!isFirebaseReady) return;
    const db = firebase.database();
    const myId = state.profile.userId;

    db.ref(`friends/${myId}/${req.fromId}`).set(req.fromName);
    db.ref(`friends/${req.fromId}/${myId}`).set(state.profile.userName);
    db.ref(`friendRequests/${myId}/${req.fromId}`).remove();

    showToast(`${req.fromName} さんとフレンドになりました！`);
}

function rejectFriendRequest(req) {
    if (!isFirebaseReady) return;
    firebase.database().ref(`friendRequests/${state.profile.userId}/${req.fromId}`).remove();
    showToast('フレンド申請を拒否しました');
}

function renderFriendsList() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    container.innerHTML = '';

    const friendIds = Object.keys(state.friends);
    if (friendIds.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8;">まだフレンドがいません</div>';
        return;
    }

    friendIds.forEach(fId => {
        const fName = state.friends[fId];
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div>
                <strong>👤 ${fName}</strong>
                <span style="font-size:0.75rem; color:#64748b; margin-left:4px;">ID: ${fId}</span>
            </div>
            <span class="badge badge-success">フレンド</span>
        `;
        container.appendChild(item);
    });
}

function renderCreateGroupFriendsSelect() {
    const container = document.getElementById('createGroupFriendsSelect');
    if (!container) return;
    container.innerHTML = '';

    const friendIds = Object.keys(state.friends);
    if (friendIds.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:#94a3b8;">招待可能なフレンドがいません</div>';
        return;
    }

    friendIds.forEach(fId => {
        const fName = state.friends[fId];
        const label = document.createElement('label');
        label.className = 'friend-checkbox-label';
        label.innerHTML = `
            <input type="checkbox" value="${fId}" data-name="${fName}" class="create-grp-friend-cb">
            <span>${fName} (${fId})</span>
        `;
        container.appendChild(label);
    });
}

function createNewGroup() {
    const nameInput = document.getElementById('newGroupNameInput');
    const grpName = nameInput ? nameInput.value.trim() : '';

    if (!grpName) {
        alert('グループ名を入力してください。');
        return;
    }

    if (!isFirebaseReady) return;

    const db = firebase.database();
    const groupId = 'grp_' + Date.now();
    const myId = state.profile.userId;

    const members = {};
    members[myId] = state.profile.userName;

    document.querySelectorAll('.create-grp-friend-cb:checked').forEach(cb => {
        members[cb.value] = cb.dataset.name;
    });

    const groupObj = {
        id: groupId,
        name: grpName,
        ownerId: myId,
        members: members,
        createdAt: Date.now()
    };

    db.ref('groups/' + groupId).set(groupObj).then(() => {
        Object.keys(members).forEach(mId => {
            db.ref(`userGroups/${mId}/${groupId}`).set(true);
        });

        showToast(`グループ「${grpName}」を作成しました`);
        if (nameInput) nameInput.value = '';
    });
}

function renderMyGroupsList() {
    const container = document.getElementById('myGroupsList');
    if (!container) return;
    container.innerHTML = '';

    const groupKeys = Object.keys(state.groups);
    if (groupKeys.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8;">参加中のグループはありません</div>';
        return;
    }

    groupKeys.forEach(gId => {
        const grp = state.groups[gId];
        const card = document.createElement('div');
        card.className = 'group-card-item';

        const memberTagsHtml = Object.values(grp.members || {}).map(mName => `<span class="member-tag">👤 ${mName}</span>`).join('');

        const unaddedFriends = Object.keys(state.friends).filter(fId => !grp.members || !grp.members[fId]);
        let inviteOptionsHtml = unaddedFriends.map(fId => `<option value="${fId}">${state.friends[fId]} (${fId})</option>`).join('');

        card.innerHTML = `
            <div class="group-card-header">
                <strong>👨‍👩‍👧‍👦 ${grp.name}</strong>
                <span style="font-size:0.7rem; color:#64748b;">ID: ${grp.id}</span>
            </div>
            <div>
                <div style="font-size:0.75rem; color:#475569; margin-bottom:2px;">メンバー:</div>
                <div class="group-members-tags">${memberTagsHtml}</div>
            </div>
            ${unaddedFriends.length > 0 ? `
            <div style="margin-top:6px; display:flex; gap:6px;">
                <select class="select-box invite-friend-select" style="flex:1; font-size:0.75rem; padding:4px;">
                    <option value="">フレンドを選択して招待</option>
                    ${inviteOptionsHtml}
                </select>
                <button class="btn btn-primary invite-btn" style="font-size:0.75rem; padding:4px 8px;">招待</button>
            </div>
            ` : ''}
        `;

        const inviteBtn = card.querySelector('.invite-btn');
        if (inviteBtn) {
            inviteBtn.onclick = () => {
                const select = card.querySelector('.invite-friend-select');
                const selectedFriendId = select ? select.value : '';
                if (!selectedFriendId) {
                    alert('招待するフレンドを選択してください。');
                    return;
                }
                inviteFriendToExistingGroup(grp.id, selectedFriendId);
            };
        }

        container.appendChild(card);
    });
}

function inviteFriendToExistingGroup(groupId, friendId) {
    if (!isFirebaseReady) return;
    const db = firebase.database();
    const friendName = state.friends[friendId];

    db.ref(`groups/${groupId}/members/${friendId}`).set(friendName);
    db.ref(`userGroups/${friendId}/${groupId}`).set(true);

    showToast(`グループに ${friendName} さんを招待しました`);
}

function renderGroupSection() {
    const setupCard = document.getElementById('profileSetupCard');
    const mainArea = document.getElementById('groupMainArea');

    if (!state.profile.userId) {
        if (setupCard) setupCard.classList.remove('hidden');
        if (mainArea) mainArea.classList.add('hidden');
    } else {
        if (setupCard) setupCard.classList.add('hidden');
        if (mainArea) mainArea.classList.remove('hidden');

        const nameEl = document.getElementById('displayUserName');
        const idEl = document.getElementById('displayUserId');
        if (nameEl) nameEl.textContent = state.profile.userName;
        if (idEl) idEl.textContent = `ID: ${state.profile.userId}`;
    }
}

function initSettingsView() {
    const autoDelToggle = document.getElementById('autoDeleteCompletedToggle');
    if (autoDelToggle) {
        autoDelToggle.addEventListener('change', (e) => {
            state.settings.autoDeleteCompleted = e.target.checked;
            saveData();
        });
    }

    const weekStartSelect = document.getElementById('weekStartSelect');
    if (weekStartSelect) {
        weekStartSelect.addEventListener('change', (e) => {
            state.settings.weekStart = e.target.value;
            saveData();
            renderAllViews();
        });
    }

    const tabBarPositionSelect = document.getElementById('tabBarPositionSelect');
    if (tabBarPositionSelect) {
        tabBarPositionSelect.addEventListener('change', (e) => {
            state.settings.tabBarPosition = e.target.value;
            saveData();
            applyTabBarPosition();
        });
    }

    const openColorDetailBtn = document.getElementById('openColorDetailBtn');
    if (openColorDetailBtn) {
        openColorDetailBtn.addEventListener('click', () => {
            document.getElementById('settingsMainCard').classList.add('hidden');
            document.getElementById('settingsColorDetail').classList.remove('hidden');
        });
    }

    const backToSettingsBtn = document.getElementById('backToSettingsBtn');
    if (backToSettingsBtn) {
        backToSettingsBtn.addEventListener('click', () => {
            document.getElementById('settingsColorDetail').classList.add('hidden');
            document.getElementById('settingsMainCard').classList.remove('hidden');
        });
    }

    const openAddColorModalBtn = document.getElementById('openAddColorModalBtn');
    if (openAddColorModalBtn) {
        openAddColorModalBtn.addEventListener('click', () => {
            document.getElementById('addColorModal').classList.remove('hidden');
        });
    }

    const addColorBtn = document.getElementById('addColorBtn');
    if (addColorBtn) {
        addColorBtn.addEventListener('click', () => {
            const picker = document.getElementById('newColorPicker');
            if (picker && picker.value) {
                const colorVal = picker.value.toLowerCase();
                if (!state.customColors.includes(colorVal)) {
                    state.customColors.push(colorVal);
                    saveData();
                    renderSettingsColorPalette();
                    document.getElementById('addColorModal').classList.add('hidden');
                    showToast('新しいカラーを追加しました');
                } else {
                    alert('既にリストにあるカラーです。');
                }
            }
        });
    }
}

function renderSettingsColorPalette() {
    const colorContainer = document.getElementById('settingsColorList');
    if (!colorContainer) return;
    colorContainer.innerHTML = '';

    state.customColors.forEach(color => {
        const colorTag = document.createElement('div');
        colorTag.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${color};
            color: #fff;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 0.8rem;
            font-weight: bold;
        `;
        colorTag.innerHTML = `
            <span>${color}</span>
            <span class="remove-color-btn" style="cursor:pointer; margin-left:4px; font-size:1rem;">✕</span>
        `;

        colorTag.querySelector('.remove-color-btn').addEventListener('click', () => {
            if (state.customColors.length <= 1) {
                alert('カラーは最低1つ保持する必要があります。');
                return;
            }
            state.customColors = state.customColors.filter(c => c !== color);
            saveData();
            renderSettingsColorPalette();
            showToast('カラーを削除しました');
        });

        colorContainer.appendChild(colorTag);
    });
}

function initImageUploads() {
    const iconInput = document.getElementById('userIconInput');
    if (iconInput) {
        iconInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    state.customTheme.userIcon = event.target.result;
                    saveData();
                    applyTheme();
                    showToast('アイコン画像を更新しました');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const bgInput = document.getElementById('bgInput');
    if (bgInput) {
        bgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    state.customTheme.bgImage = event.target.result;
                    saveData();
                    applyTheme();
                    showToast('背景画像を更新しました');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const removeBgBtn = document.getElementById('removeBgBtn');
    if (removeBgBtn) {
        removeBgBtn.addEventListener('click', () => {
            state.customTheme.bgImage = '';
            saveData();
            applyTheme();
            showToast('背景画像をリセットしました');
        });
    }
}

function initModalEvents() {
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) addEventBtn.addEventListener('click', () => openEventModal());

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);

    const cancelEventBtn = document.getElementById('cancelEventBtn');
    if (cancelEventBtn) cancelEventBtn.addEventListener('click', closeEventModal);

    const saveEventBtn = document.getElementById('saveEventBtn');
    if (saveEventBtn) saveEventBtn.addEventListener('click', saveEventFromModal);

    const deleteEventBtn = document.getElementById('deleteEventBtn');
    if (deleteEventBtn) deleteEventBtn.addEventListener('click', deleteEventFromModal);

    const allDayCheckbox = document.getElementById('eventAllDayInput');
    if (allDayCheckbox) {
        allDayCheckbox.addEventListener('change', (e) => {
            toggleTimeInputsForMode(e.target.checked);
        });
    }

    const repeatCheckbox = document.getElementById('eventRepeatInput');
    if (repeatCheckbox) {
        repeatCheckbox.addEventListener('change', (e) => {
            const container = document.getElementById('repeatWeekdayContainer');
            const rangeLabel = document.getElementById('dateRangeLabel');
            if (container) {
                container.classList.toggle('hidden', !e.target.checked);
            }
            if (rangeLabel) {
                rangeLabel.textContent = e.target.checked ? '繰り返す期間 (開始日 〜 終了日)' : '開始日 〜 終了日';
            }
        });
    }

    const addNotifBtn = document.getElementById('addNotificationTimeBtn');
    if (addNotifBtn) {
        addNotifBtn.addEventListener('click', addNotificationToModalList);
    }

    const saveFavBtn = document.getElementById('saveFavoriteBtn');
    if (saveFavBtn) {
        saveFavBtn.addEventListener('click', saveCurrentAsFavorite);
    }

    const favSelect = document.getElementById('favoriteTemplateSelect');
    if (favSelect) {
        favSelect.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            if (selectedId) applyFavoriteTemplate(selectedId);
        });
    }

    const closePickerBtn = document.getElementById('closePickerBtn');
    if (closePickerBtn) {
        closePickerBtn.addEventListener('click', () => {
            document.getElementById('monthPickerModal').classList.add('hidden');
        });
    }

    const closeAddColorModalBtn = document.getElementById('closeAddColorModalBtn');
    if (closeAddColorModalBtn) {
        closeAddColorModalBtn.addEventListener('click', () => {
            document.getElementById('addColorModal').classList.add('hidden');
        });
    }
}

function addNotificationToModalList() {
    const valInput = document.getElementById('notificationValueInput');
    const unitSelect = document.getElementById('notificationUnitSelect');

    const val = parseInt(valInput ? valInput.value : '0', 10);
    const unit = unitSelect ? unitSelect.value : 'min';

    if (isNaN(val) || val < 0) return;

    currentModalNotifications.push({
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        value: val,
        unit: unit,
        triggered: false
    });

    renderNotificationListInModal();
}

function removeNotificationFromModalList(notifId) {
    currentModalNotifications = currentModalNotifications.filter(n => n.id !== notifId);
    renderNotificationListInModal();
}

function renderNotificationListInModal() {
    const container = document.getElementById('notificationListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (currentModalNotifications.length === 0) {
        container.innerHTML = '<span style="font-size:0.75rem; color:#94a3b8;">設定された通知はありません</span>';
        return;
    }

    currentModalNotifications.forEach(notif => {
        let unitLabel = '分前';
        if (notif.unit === 'hour') unitLabel = '時間前';
        if (notif.unit === 'day') unitLabel = '日前';

        const chip = document.createElement('div');
        chip.className = 'notification-chip';
        chip.innerHTML = `
            <span>🔔 ${notif.value} ${unitLabel}</span>
            <span class="remove-btn">✕</span>
        `;
        chip.querySelector('.remove-btn').onclick = () => removeNotificationFromModalList(notif.id);
        container.appendChild(chip);
    });
}

function updateFavoriteDropdown() {
    const select = document.getElementById('favoriteTemplateSelect');
    if (!select) return;

    select.innerHTML = '<option value="">★ お気に入りから呼び出し...</option>';
    state.favorites.forEach(fav => {
        const opt = document.createElement('option');
        opt.value = fav.id;
        opt.textContent = `★ ${fav.title} (${fav.startTime || '終日'})`;
        select.appendChild(opt);
    });
}

function saveCurrentAsFavorite() {
    const title = document.getElementById('eventTitleInput').value.trim();
    if (!title) {
        alert('お気に入りに登録するにはタイトルを入力してください。');
        return;
    }

    const favObj = {
        id: 'fav_' + Date.now(),
        title: title,
        isImportant: document.getElementById('eventImportantInput').checked,
        isAllDay: document.getElementById('eventAllDayInput').checked,
        startTime: document.getElementById('eventStartInput').value,
        endTime: document.getElementById('eventEndInput').value,
        color: state.selectedColor,
        notifications: JSON.parse(JSON.stringify(currentModalNotifications))
    };

    state.favorites.push(favObj);
    saveData();
    updateFavoriteDropdown();
    showToast(`「${title}」をお気に入り登録しました！`);
}

function applyFavoriteTemplate(favId) {
    const fav = state.favorites.find(f => f.id === favId);
    if (!fav) return;

    document.getElementById('eventTitleInput').value = fav.title;
    document.getElementById('eventImportantInput').checked = !!fav.isImportant;
    
    const allDayCb = document.getElementById('eventAllDayInput');
    if (allDayCb) allDayCb.checked = !!fav.isAllDay;

    document.getElementById('eventStartInput').value = fav.startTime || '09:00';
    document.getElementById('eventEndInput').value = fav.endTime || '10:00';

    currentModalNotifications = fav.notifications ? JSON.parse(JSON.stringify(fav.notifications)) : [];
    renderNotificationListInModal();

    state.selectedColor = fav.color || state.customColors[0];
    renderModalColorPalette(state.selectedColor);
    toggleTimeInputsForMode(fav.isAllDay);

    showToast(`お気に入り「${fav.title}」を呼び出しました`);
}

function toggleTimeInputsForMode(isAllDay) {
    const startInput = document.getElementById('eventStartInput');
    const endInput = document.getElementById('eventEndInput');
    if (startInput && endInput) {
        startInput.disabled = isAllDay;
        endInput.disabled = isAllDay;
        startInput.style.opacity = isAllDay ? '0.4' : '1';
        endInput.style.opacity = isAllDay ? '0.4' : '1';
    }
}

function renderModalColorPalette(selectedColor) {
    const container = document.getElementById('modalColorPalette');
    if (!container) return;
    container.innerHTML = '';

    state.customColors.forEach(color => {
        const dot = document.createElement('div');
        dot.className = `color-dot ${color === selectedColor ? 'selected' : ''}`;
        dot.style.backgroundColor = color;
        dot.addEventListener('click', () => {
            state.selectedColor = color;
            renderModalColorPalette(color);
        });
        container.appendChild(dot);
    });
}

function clearModalErrors() {
    const fields = ['eventTitleInput', 'eventStartDateInput', 'eventEndDateInput', 'eventStartInput', 'eventEndInput'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.borderColor = '';
    });
}

function openEventModal(evt = null) {
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    
    clearModalErrors();
    modal.classList.remove('hidden');

    updateFavoriteDropdown();

    const allDayCheckbox = document.getElementById('eventAllDayInput');
    const repeatCheckbox = document.getElementById('eventRepeatInput');
    const startInput = document.getElementById('eventStartInput');
    const endInput = document.getElementById('eventEndInput');
    const weekdayContainer = document.getElementById('repeatWeekdayContainer');

    document.querySelectorAll('.weekday-selector input[type="checkbox"]').forEach(cb => cb.checked = false);

    if (evt) {
        document.getElementById('editEventId').value = evt.id;
        document.getElementById('eventTitleInput').value = evt.title;
        document.getElementById('eventImportantInput').checked = !!evt.isImportant;
        document.getElementById('eventStartDateInput').value = evt.startDate || evt.date;
        document.getElementById('eventEndDateInput').value = evt.endDate || evt.date;
        
        if (allDayCheckbox) allDayCheckbox.checked = !!evt.isAllDay;
        if (repeatCheckbox) repeatCheckbox.checked = false;
        if (weekdayContainer) weekdayContainer.classList.add('hidden');

        if (startInput) startInput.value = evt.startTime || '09:00';
        if (endInput) endInput.value = evt.endTime || '10:00';

        currentModalNotifications = evt.notifications ? JSON.parse(JSON.stringify(evt.notifications)) : [];

        state.selectedColor = evt.color || state.customColors[0];
        document.getElementById('deleteEventBtn').classList.remove('hidden');
    } else {
        document.getElementById('editEventId').value = '';
        document.getElementById('eventTitleInput').value = '';
        document.getElementById('eventImportantInput').checked = false;
        
        const currentStr = state.currentDate.format('YYYY-MM-DD');
        document.getElementById('eventStartDateInput').value = currentStr;
        document.getElementById('eventEndDateInput').value = currentStr;

        if (allDayCheckbox) allDayCheckbox.checked = false;
        if (repeatCheckbox) repeatCheckbox.checked = false;
        if (weekdayContainer) weekdayContainer.classList.add('hidden');

        if (startInput) startInput.value = '09:00';
        if (endInput) endInput.value = '10:00';

        currentModalNotifications = [];

        state.selectedColor = state.customColors[0];
        document.getElementById('deleteEventBtn').classList.add('hidden');
    }

    renderNotificationListInModal();
    toggleTimeInputsForMode(allDayCheckbox ? allDayCheckbox.checked : false);
    renderModalColorPalette(state.selectedColor);
}

function closeEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) modal.classList.add('hidden');
}

function saveEventFromModal() {
    clearModalErrors();

    const titleInput = document.getElementById('eventTitleInput');
    const startDateInput = document.getElementById('eventStartDateInput');
    const endDateInput = document.getElementById('eventEndDateInput');
    const startInput = document.getElementById('eventStartInput');
    const endInput = document.getElementById('eventEndInput');

    const id = document.getElementById('editEventId').value;
    const title = titleInput ? titleInput.value.trim() : '';
    const isImportant = document.getElementById('eventImportantInput').checked;
    const isAllDay = document.getElementById('eventAllDayInput').checked;
    const isRepeat = document.getElementById('eventRepeatInput').checked;

    const startDate = startDateInput ? startDateInput.value : '';
    const endDate = endDateInput ? endDateInput.value : '';
    const startTime = startInput ? startInput.value : '';
    const endTime = endInput ? endInput.value : '';

    if (!title) {
        if (titleInput) {
            titleInput.style.borderColor = '#ef4444';
            titleInput.focus();
        }
        showToast('⚠️ タイトルを入力してください');
        return;
    }

    if (!startDate || !endDate) {
        if (!startDate && startDateInput) startDateInput.style.borderColor = '#ef4444';
        if (!endDate && endDateInput) endDateInput.style.borderColor = '#ef4444';
        showToast('⚠️ 開始日と終了日を正しく選択してください');
        return;
    }

    if (startDate > endDate) {
        if (startDateInput) startDateInput.style.borderColor = '#ef4444';
        if (endDateInput) endDateInput.style.borderColor = '#ef4444';
        showToast('⚠️ 終了日は開始日以降の日付に設定してください');
        return;
    }

    if (!isAllDay && startDate === endDate && startTime >= endTime) {
        if (startInput) startInput.style.borderColor = '#ef4444';
        if (endInput) endInput.style.borderColor = '#ef4444';
        showToast('⚠️ 終了時刻は開始時刻より後に設定してください');
        return;
    }

    recordStateForUndo(`予定の追加・保存を行いました`);

    if (isRepeat) {
        const selectedWeekdays = Array.from(document.querySelectorAll('.weekday-selector input[type="checkbox"]:checked')).map(cb => Number(cb.value));
        
        if (selectedWeekdays.length === 0) {
            showToast('⚠️ 繰り返す曜日を少なくとも1つ選択してください');
            return;
        }

        let currDay = dayjs(startDate);
        const endDay = dayjs(endDate);
        let createdCount = 0;

        while (currDay.isBefore(endDay) || currDay.isSame(endDay, 'day')) {
            const dayOfWeek = currDay.day();
            
            if (selectedWeekdays.includes(dayOfWeek)) {
                const dayStr = currDay.format('YYYY-MM-DD');
                const newEvt = {
                    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    title,
                    isImportant,
                    isAllDay,
                    startDate: dayStr,
                    endDate: dayStr,
                    startTime: isAllDay ? '00:00' : startTime,
                    endTime: isAllDay ? '23:59' : endTime,
                    color: state.selectedColor,
                    notifications: JSON.parse(JSON.stringify(currentModalNotifications)),
                    completed: false
                };
                state.events.push(newEvt);
                createdCount++;
            }
            currDay = currDay.add(1, 'day');
        }

        showToast(`✅ ${createdCount}件の繰り返し予定を作成しました`);
    } else {
        const eventObj = {
            id: id || 'evt_' + Date.now(),
            title,
            isImportant,
            isAllDay,
            startDate,
            endDate,
            startTime: isAllDay ? '00:00' : startTime,
            endTime: isAllDay ? '23:59' : endTime,
            color: state.selectedColor,
            notifications: JSON.parse(JSON.stringify(currentModalNotifications)),
            completed: false
        };

        const existingIdx = state.events.findIndex(e => e.id === id);
        if (existingIdx >= 0) {
            state.events[existingIdx] = eventObj;
        } else {
            state.events.push(eventObj);
        }
        showToast(`✅ 予定「${title}」を保存しました`);
    }

    saveData();
    closeEventModal();
    renderAllViews();
}

function deleteEventFromModal() {
    const id = document.getElementById('editEventId').value;
    const targetEvt = state.events.find(e => e.id === id);

    if (targetEvt && targetEvt.isImportant) {
        if (!confirm('⭐ この予定は「重要」に設定されています。本当に削除しますか？')) return;
    }

    if (targetEvt) recordStateForUndo(`予定「${targetEvt.title}」を削除しました`);

    state.events = state.events.filter(e => e.id !== id);
    saveData();
    closeEventModal();
    renderAllViews();
}
