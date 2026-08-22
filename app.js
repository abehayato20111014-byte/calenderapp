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
    tutorialStep: 1,
    currentEditingEvent: null,
    selectedGroupId: null,         
    groupSubTab: 'events',         
    newGroupMembers: []            
};

let currentModalNotifications = [];
let toastTimeout = null;
let isFirebaseReady = false;
let audioCtx = null;
window.lastNotifCheck = Date.now();

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
                console.warn('Inline SW Registration failed:', err);
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
    if (dateDisp) {
        dateDisp.textContent = `${state.currentDate.format('YYYY/MM/DD')}(${jaDay})`;
        
        // 土曜日は青、日曜日は赤でスタイル適用
        const dayOfWeek = state.currentDate.day();
        dateDisp.classList.remove('sat', 'sun');
        if (dayOfWeek === 6) {
            dateDisp.classList.add('sat');
            dateDisp.style.color = '#3b82f6';
        } else if (dayOfWeek === 0) {
            dateDisp.classList.add('sun');
            dateDisp.style.color = '#ef4444';
        } else {
            dateDisp.style.color = '';
        }
    }
    
    const container = document.getElementById('eventsContainer');
    if (!container) return;
    container.innerHTML = '';

    const todayStr = state.currentDate.format('YYYY-MM-DD');
    const todayEvents = state.events.filter(e => isEventOnDate(e, todayStr) && !e.isAllDay);

    todayEvents.forEach(evt => {
        const card = document.createElement('div');
        card.className = `event-card ${evt.isImportant ? 'important-event' : ''}`;
        
        card.style.overflow = 'hidden';
        card.style.textOverflow = 'ellipsis';
        card.style.whiteSpace = 'nowrap';
        card.style.boxSizing = 'border-box';

        if (evt.color) {
            card.style.backgroundColor = evt.color;
            card.style.color = '#ffffff';
        }

        const [sH, sM] = (evt.startTime || '00:00').split(':').map(Number);
        let [eH, eM] = (evt.endTime || '01:00').split(':').map(Number);

        // 日跨ぎ処理（深夜〜翌日）: s.endTime < s.startTime の場合は翌日扱いで24時間を加算し1本の連続スケジュールとして描画
        if (evt.endTime && evt.startTime && evt.endTime < evt.startTime) {
            eH += 24;
        }

        const topPx = (sH * 50) + (sM * 50 / 60);
        const heightPx = ((eH * 50) + (eM * 50 / 60)) - topPx;

        card.style.top = `${topPx}px`;
        card.style.height = `${Math.max(heightPx, 24)}px`;
        
        const shareIcon = (evt.sharedGroupIds && evt.sharedGroupIds.length > 0) || evt.ownerId ? '👥 ' : '';
        const icon = evt.isImportant ? '⭐ ' : '';
        
        card.innerHTML = `
            <strong>${shareIcon}${icon}${evt.title}</strong> (${evt.startTime}-${evt.endTime})
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
    if (evt.ownerId && state.profile.userId && evt.ownerId !== state.profile.userId) {
        return;
    }

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
                const h = Math.floor(totalM / 60) % 24;
                const m = totalM % 60;
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            };

            recordStateForUndo(`予定「${evt.title}」の時間を変更しました`);
            evt.startTime = formatTime(startMinutes);
            evt.endTime = formatTime(endMinutes);

            if (evt.sharedGroupIds && evt.sharedGroupIds.length > 0) {
                syncSharedEventToCloud(evt);
            }

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
        dateDisp.style.color = '';
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
            
            card.style.overflow = 'hidden';
            card.style.textOverflow = 'ellipsis';
            card.style.whiteSpace = 'nowrap';
            card.style.boxSizing = 'border-box';

            if (evt.color) card.style.backgroundColor = evt.color;

            const [sH, sM] = (evt.startTime || '00:00').split(':').map(Number);
            let [eH, eM] = (evt.endTime || '01:00').split(':').map(Number);

            // 日跨ぎ処理（週ビューでの計算補正）
            if (evt.endTime && evt.startTime && evt.endTime < evt.startTime) {
                eH += 24;
            }

            const topPx = (sH * 50) + (sM * 50 / 60) + 28;
            const heightPx = ((eH * 50) + (eM * 50 / 60)) - ((sH * 50) + (sM * 50 / 60));

            card.style.top = `${topPx}px`;
            card.style.height = `${Math.max(heightPx, 20)}px`;

            const shareIcon = (evt.sharedGroupIds && evt.sharedGroupIds.length > 0) || evt.ownerId ? '👥 ' : '';
            card.innerHTML = `<strong>${shareIcon}${evt.title}</strong>`;
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
/////////





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
            
            evtLabel.style.whiteSpace = 'nowrap';
            evtLabel.style.overflow = 'hidden';
            evtLabel.style.textOverflow = 'ellipsis';
            evtLabel.style.display = 'block';
            evtLabel.style.maxWidth = '100%';
            evtLabel.style.boxSizing = 'border-box';

            if (evt.color) {
                evtLabel.style.backgroundColor = evt.color;
                evtLabel.style.color = '#ffffff';
            }

            let prefix = '';
            if (evt.sharedGroupIds || evt.ownerId) prefix += '👥';
            if (evt.isImportant) prefix += '⭐';
            if (evt.isAllDay) prefix += '【終日】';
            else if (isMultiDay) prefix += '↔️';

            let displayTitle = prefix + evt.title;
            if (displayTitle.length > 6) {
                displayTitle = displayTitle.substring(0, 5) + '…';
            }

            evtLabel.textContent = displayTitle;
            
            evtLabel.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventModal(evt);
            });

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

        const isShared = (evt.sharedGroupIds && evt.sharedGroupIds.length > 0) || evt.ownerId;
        const isOtherOwner = evt.ownerId && evt.ownerId !== state.profile.userId;

        item.innerHTML = `
            <div class="card-color-bar" style="background-color: ${accentColor};"></div>
            <div class="card-main-content">
                <div class="card-top-row">
                    <div class="card-title-group">
                        <input type="checkbox" ${evt.completed ? 'checked' : ''} data-id="${evt.id}" class="complete-toggle">
                        <span class="card-title">${evt.title}</span>
                    </div>
                    <div class="card-badges">
                        ${isShared ? `<span class="badge-shared">👥 共有${isOtherOwner ? `(${evt.ownerName || '他'})` : ''}</span>` : ''}
                        ${evt.isImportant ? '<span class="badge-important">⭐ 重要</span>' : ''}
                        ${evt.completed ? '<span class="badge-completed">完了</span>' : ''}
                    </div>
                </div>
                <div class="card-meta-row">
                    <span class="meta-item">📅 ${dateDisplay}</span>
                    <span class="meta-item">⏰ ${timeDisplay}</span>
                </div>
            </div>
            <button class="btn btn-secondary btn-small edit-btn" data-id="${evt.id}">${isOtherOwner ? '詳細' : '編集'}</button>
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
            renderGroupSection();
            return;
        }

        groupIds.forEach(gId => {
            db.ref('groups/' + gId).on('value', (gSnap) => {
                if (gSnap.exists()) {
                    state.groups[gId] = gSnap.val();
                    renderGroupSection();
                }
            });

            db.ref('groupEvents/' + gId).on('value', (evtSnap) => {
                const cloudEvents = evtSnap.val() || {};
                let hasChanges = false;

                Object.keys(cloudEvents).forEach(evtId => {
                    const cloudEvt = cloudEvents[evtId];
                    if (cloudEvt.ownerId !== myId) {
                        const localIdx = state.events.findIndex(e => e.id === evtId);
                        if (localIdx >= 0) {
                            state.events[localIdx] = {
                                ...state.events[localIdx],
                                title: cloudEvt.title,
                                isImportant: cloudEvt.isImportant,
                                isAllDay: cloudEvt.isAllDay,
                                startDate: cloudEvt.startDate,
                                endDate: cloudEvt.endDate,
                                startTime: cloudEvt.startTime,
                                endTime: cloudEvt.endTime,
                                color: cloudEvt.color,
                                ownerId: cloudEvt.ownerId,
                                ownerName: cloudEvt.ownerName,
                                sharedGroupIds: cloudEvt.sharedGroupIds
                            };
                            hasChanges = true;
                        } else {
                            state.events.push({
                                id: cloudEvt.id,
                                title: cloudEvt.title,
                                isImportant: cloudEvt.isImportant,
                                isAllDay: cloudEvt.isAllDay,
                                startDate: cloudEvt.startDate,
                                endDate: cloudEvt.endDate,
                                startTime: cloudEvt.startTime,
                                endTime: cloudEvt.endTime,
                                color: cloudEvt.color,
                                ownerId: cloudEvt.ownerId,
                                ownerName: cloudEvt.ownerName,
                                sharedGroupIds: cloudEvt.sharedGroupIds,
                                completed: false
                            });
                            hasChanges = true;
                        }
                    }
                });

                if (hasChanges) {
                    saveData();
                    renderAllViews();
                }
            });
        });
    });

    db.ref('userNotifications/' + myId).on('child_added', (snapshot) => {
        const notif = snapshot.val();
        if (notif && notif.timestamp > window.lastNotifCheck) {
            triggerNotification(notif.title, notif.message);
            window.lastNotifCheck = Date.now();
        }
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
/////
















function renderCreateGroupFriendsSelect() {
    const container = document.getElementById('createGroupFriendsSelect');
    if (!container) return;
    container.innerHTML = '';

    const friendIds = Object.keys(state.friends);
    if (friendIds.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:#94a3b8;">招待可能なフレンドがいません</div>';
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-bottom: 8px;';

    const select = document.createElement('select');
    select.className = 'select-box';
    select.style.cssText = 'flex: 1; font-size: 0.8rem; padding: 4px 8px;';
    select.innerHTML = '<option value="">フレンドを選択して追加...</option>' + 
        friendIds.map(fId => `<option value="${fId}">${state.friends[fId]} (${fId})</option>`).join('');

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary btn-small';
    addBtn.textContent = '追加';
    addBtn.style.fontSize = '0.75rem';

    wrapper.appendChild(select);
    wrapper.appendChild(addBtn);
    container.appendChild(wrapper);

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'group-members-tags';
    container.appendChild(tagsContainer);

    const renderTags = () => {
        tagsContainer.innerHTML = '';
        if (state.newGroupMembers.length === 0) {
            tagsContainer.innerHTML = '<span style="font-size:0.75rem; color:#94a3b8;">選択されたメンバーはいません</span>';
            return;
        }
        state.newGroupMembers.forEach(mem => {
            const tag = document.createElement('span');
            tag.className = 'member-tag';
            tag.innerHTML = `👤 ${mem.name} <span class="remove-mem-btn" style="cursor:pointer; margin-left:4px; font-weight:bold;">✕</span>`;
            tag.querySelector('.remove-mem-btn').onclick = () => {
                state.newGroupMembers = state.newGroupMembers.filter(m => m.id !== mem.id);
                renderTags();
            };
            tagsContainer.appendChild(tag);
        });
    };

    addBtn.onclick = () => {
        const selectedId = select.value;
        if (!selectedId) return;

        if (state.newGroupMembers.some(m => m.id === selectedId)) {
            alert('既に選択されているフレンドです。');
            return;
        }

        state.newGroupMembers.push({
            id: selectedId,
            name: state.friends[selectedId]
        });
        select.value = '';
        renderTags();
    };

    renderTags();
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

    state.newGroupMembers.forEach(m => {
        members[m.id] = m.name;
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
        state.newGroupMembers = [];
        renderCreateGroupFriendsSelect();
    });
}

function renderMyGroupsList() {
    const container = document.getElementById('myGroupsList');
    if (!container) return;
    container.innerHTML = '';

    const groupKeys = Object.keys(state.groups);
    if (groupKeys.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.85rem;">参加中のグループはありません</div>';
        return;
    }

    groupKeys.forEach(gId => {
        const grp = state.groups[gId];
        const card = document.createElement('div');
        card.className = 'group-card-item';
        card.style.cursor = 'pointer';

        const memberTagsHtml = Object.values(grp.members || {}).map(mName => `<span class="member-tag">👤 ${mName}</span>`).join('');

        card.innerHTML = `
            <div class="group-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <strong>👨‍👩‍👧‍👦 ${grp.name}</strong>
                <span class="badge badge-primary" style="font-size:0.7rem;">詳細・共有 ▶</span>
            </div>
            <div style="margin-top:6px;">
                <div style="font-size:0.75rem; color:#475569; margin-bottom:2px;">メンバー (${Object.keys(grp.members || {}).length}名):</div>
                <div class="group-members-tags">${memberTagsHtml}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            state.selectedGroupId = gId;
            state.groupSubTab = 'events';
            renderGroupSection();
        });

        container.appendChild(card);
    });
}

function renderGroupDetailView(container) {
    const grp = state.groups[state.selectedGroupId];
    if (!grp) {
        state.selectedGroupId = null;
        renderGroupSection();
        return;
    }

    container.innerHTML = '';

    const detailCard = document.createElement('div');
    detailCard.className = 'settings-card';
    detailCard.style.cssText = 'padding: 16px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 16px;';

    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;';
    headerDiv.innerHTML = `
        <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">👨‍👩‍👧‍👦 ${grp.name}</h3>
        <button class="btn btn-secondary btn-small" id="backToGroupListBtn" style="font-size:0.75rem;">← グループ一覧</button>
    `;

    detailCard.appendChild(headerDiv);

    const subTabBar = document.createElement('div');
    subTabBar.style.cssText = 'display: flex; gap: 6px; margin-bottom: 14px; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px;';

    const tabs = [
        { id: 'events', label: '📅 共有予定' },
        { id: 'members', label: '👥 メンバー・招待' },
        { id: 'share', label: '📤 予定を共有' }
    ];

    tabs.forEach(tab => {
        const btn = document.createElement('button');
        const isActive = state.groupSubTab === tab.id;
        btn.className = `btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-small`;
        btn.style.cssText = `flex: 1; font-size: 0.75rem; padding: 6px 4px; text-align: center; border-radius: 8px;`;
        btn.textContent = tab.label;
        btn.onclick = () => {
            state.groupSubTab = tab.id;
            renderGroupSection();
        };
        subTabBar.appendChild(btn);
    });

    detailCard.appendChild(subTabBar);

    const contentArea = document.createElement('div');

    if (state.groupSubTab === 'events') {
        const groupEvents = state.events.filter(e => e.sharedGroupIds && e.sharedGroupIds.includes(grp.id));
        if (groupEvents.length === 0) {
            contentArea.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.85rem;">このグループに共有されている予定はありません</div>';
        } else {
            groupEvents.forEach(evt => {
                const item = document.createElement('div');
                item.className = 'detailed-event-card';
                item.style.marginBottom = '8px';
                
                const startD = evt.startDate || evt.date;
                const endD = evt.endDate || evt.date;
                const isSameDay = startD === endD;
                const dateDisplay = isSameDay ? startD : `${startD} 〜 ${endD}`;
                const timeDisplay = evt.isAllDay ? '終日' : `${evt.startTime} 〜 ${evt.endTime}`;

                item.innerHTML = `
                    <div class="card-color-bar" style="background-color: ${evt.color || '#3b82f6'};"></div>
                    <div class="card-main-content">
                        <div class="card-top-row">
                            <span class="card-title">${evt.title}</span>
                            <span class="badge badge-secondary" style="font-size:0.7rem;">👤 ${evt.ownerName || 'メンバー'}</span>
                        </div>
                        <div class="card-meta-row">
                            <span class="meta-item">📅 ${dateDisplay}</span>
                            <span class="meta-item">⏰ ${timeDisplay}</span>
                        </div>
                    </div>
                `;
                item.style.cursor = 'pointer';
                item.onclick = () => openEventModal(evt);
                contentArea.appendChild(item);
            });
        }
    } else if (state.groupSubTab === 'members') {
        const memberListDiv = document.createElement('div');
        memberListDiv.style.marginBottom = '16px';
        memberListDiv.innerHTML = '<div style="font-size:0.8rem; font-weight:bold; color:#475569; margin-bottom:6px;">現在のメンバー:</div>';

        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'group-members-tags';
        Object.values(grp.members || {}).forEach(mName => {
            tagsDiv.innerHTML += `<span class="member-tag">👤 ${mName}</span>`;
        });
        memberListDiv.appendChild(tagsDiv);

        const inviteDiv = document.createElement('div');
        inviteDiv.style.cssText = 'margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1;';
        inviteDiv.innerHTML = '<div style="font-size:0.8rem; font-weight:bold; color:#475569; margin-bottom:6px;">フレンドをグループに招待:</div>';

        const unaddedFriends = Object.keys(state.friends).filter(fId => !grp.members || !grp.members[fId]);

        if (unaddedFriends.length === 0) {
            inviteDiv.innerHTML += '<div style="font-size:0.75rem; color:#94a3b8;">招待可能な未参加のフレンドはいません</div>';
        } else {
            const inviteRow = document.createElement('div');
            inviteRow.style.cssText = 'display:flex; gap:6px;';
            
            let options = unaddedFriends.map(fId => `<option value="${fId}">${state.friends[fId]} (${fId})</option>`).join('');
            inviteRow.innerHTML = `
                <select class="select-box invite-friend-select" style="flex:1; font-size:0.75rem; padding:4px;">
                    <option value="">フレンドを選択...</option>
                    ${options}
                </select>
                <button class="btn btn-primary btn-small do-invite-btn" style="font-size:0.75rem; padding:4px 8px;">招待送信</button>
            `;

            inviteRow.querySelector('.do-invite-btn').onclick = () => {
                const sel = inviteRow.querySelector('.invite-friend-select');
                if (sel && sel.value) {
                    inviteFriendToExistingGroup(grp.id, sel.value);
                    renderGroupSection();
                } else {
                    alert('招待するフレンドを選択してください。');
                }
            };
            inviteDiv.appendChild(inviteRow);
        }

        contentArea.appendChild(memberListDiv);
        contentArea.appendChild(inviteDiv);

    } else if (state.groupSubTab === 'share') {
        const myEvents = state.events.filter(e => !e.ownerId || e.ownerId === state.profile.userId);
        
        if (myEvents.length === 0) {
            contentArea.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.85rem;">共有可能な自分の予定がありません</div>';
        } else {
            const intro = document.createElement('div');
            intro.style.cssText = 'font-size:0.75rem; color:#64748b; margin-bottom:10px;';
            intro.textContent = 'あなたの予定一覧から選択して、このグループへ一括共有できます：';
            contentArea.appendChild(intro);

            myEvents.forEach(evt => {
                const isAlreadyShared = evt.sharedGroupIds && evt.sharedGroupIds.includes(grp.id);
                const item = document.createElement('div');
                item.className = 'detailed-event-card';
                item.style.cssText = 'margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; padding:8px 12px;';

                const startD = evt.startDate || evt.date;
                const timeStr = evt.isAllDay ? '終日' : evt.startTime;

                item.innerHTML = `
                    <div>
                        <div style="font-weight:bold; font-size:0.85rem;">${evt.title}</div>
                        <div style="font-size:0.75rem; color:#64748b;">📅 ${startD} (${timeStr})</div>
                    </div>
                    <div>
                        ${isAlreadyShared 
                            ? '<span class="badge badge-success" style="font-size:0.7rem;">共有済み</span>' 
                            : `<button class="btn btn-primary btn-small share-this-evt-btn" style="font-size:0.75rem; padding:4px 8px;">共有する</button>`}
                    </div>
                `;

                const shareBtn = item.querySelector('.share-this-evt-btn');
                if (shareBtn) {
                    shareBtn.onclick = () => {
                        if (!evt.sharedGroupIds) evt.sharedGroupIds = [];
                        if (!evt.sharedGroupIds.includes(grp.id)) {
                            evt.sharedGroupIds.push(grp.id);
                        }
                        evt.ownerId = state.profile.userId;
                        evt.ownerName = state.profile.userName;

                        saveData();
                        syncSharedEventToCloud(evt);
                        notifyGroupMembersForEvent([grp.id], evt);
                        showToast(`「${evt.title}」をグループに共有しました`);
                        renderGroupSection();
                        renderAllViews();
                    };
                }

                contentArea.appendChild(item);
            });
        }
    }

    detailCard.appendChild(contentArea);
    container.appendChild(detailCard);

    const backBtn = detailCard.querySelector('#backToGroupListBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            state.selectedGroupId = null;
            renderGroupSection();
        };
    }
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

        const groupsContainer = document.getElementById('myGroupsList');

        if (state.selectedGroupId && state.groups[state.selectedGroupId]) {
            renderGroupDetailView(groupsContainer);
        } else {
            renderMyGroupsList();
            renderCreateGroupFriendsSelect();
        }
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

    // 階層型設定画面: 「お気に入り設定」のタップで詳細画面へ遷移
    const openFavDetailBtn = document.getElementById('openFavDetailBtn');
    if (openFavDetailBtn) {
        openFavDetailBtn.addEventListener('click', openFavDetail);
    }

    const backFromFavDetailBtn = document.getElementById('backFromFavDetailBtn');
    if (backFromFavDetailBtn) {
        backFromFavDetailBtn.addEventListener('click', () => {
            const favDetailEl = document.getElementById('settingsFavDetail');
            if (favDetailEl) favDetailEl.classList.add('hidden');
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

// 階層型設定画面のお気に入り詳細表示（openFavDetail）
// 階層型設定画面のお気に入り詳細表示（openFavDetail）
function openFavDetail() {
    const settingsMain = document.getElementById('settingsMainCard');
    if (settingsMain) settingsMain.classList.add('hidden');

    let favDetailEl = document.getElementById('settingsFavDetail');
    if (!favDetailEl) {
        favDetailEl = document.createElement('div');
        favDetailEl.id = 'settingsFavDetail';
        favDetailEl.className = 'settings-card';
        favDetailEl.style.cssText = 'padding: 16px; background: #ffffff; border-radius: 12px; margin-bottom: 16px;';
        
        // settingsMainCard の親要素に追加
        if (settingsMain && settingsMain.parentElement) {
            settingsMain.parentElement.appendChild(favDetailEl);
        } else {
            document.body.appendChild(favDetailEl);
        }
    }

    favDetailEl.classList.remove('hidden');
    renderFavoriteListDetail();
}

// Vanilla JSによるお気に入りCRUDとonchangeリアルタイム反映
function renderFavoriteListDetail() {
    const favDetailEl = document.getElementById('settingsFavDetail');
    if (!favDetailEl) return;

    favDetailEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
            <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">★ お気に入り設定</h3>
            <button class="btn btn-secondary btn-small" id="backFromFavDetailBtn" style="font-size:0.75rem;">← 戻る</button>
        </div>
        <div style="margin-bottom:12px;">
            <button class="btn btn-primary btn-small" id="addNewFavItemBtn" style="font-size:0.8rem;">＋ お気に入りを新規作成</button>
        </div>
        <div id="favoriteCRUDContainer" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    document.getElementById('backFromFavDetailBtn').onclick = () => {
        favDetailEl.classList.add('hidden');
        const settingsMain = document.getElementById('settingsMainCard');
        if (settingsMain) settingsMain.classList.remove('hidden');
    };

    document.getElementById('addNewFavItemBtn').onclick = () => {
        openEventModalForFavorite();
    };

    const container = document.getElementById('favoriteCRUDContainer');
    if (state.favorites.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:16px;">登録されているお気に入りはありません</div>';
        return;
    }

    state.favorites.forEach(fav => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;';

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="width:12px; height:12px; border-radius:50%; background:${fav.color || '#3b82f6'}; display:inline-block;"></span>
                <strong style="font-size:0.85rem;">${fav.title}</strong>
                <span style="font-size:0.75rem; color:#64748b;">(${fav.isAllDay ? '終日' : (fav.startTime + '〜' + fav.endTime)})</span>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn btn-secondary btn-small edit-fav-btn" style="font-size:0.75rem; padding:4px 8px;">編集</button>
                <button class="btn btn-secondary btn-small del-fav-btn" style="font-size:0.75rem; color:#ef4444; padding:4px 8px;">削除</button>
            </div>
        `;

        row.querySelector('.edit-fav-btn').onclick = () => openEventModalForFavorite(fav);
        row.querySelector('.del-fav-btn').onclick = () => {
            state.favorites = state.favorites.filter(f => f.id !== fav.id);
            saveData();
            updateFavoriteDropdown();
            renderFavoriteListDetail();
            showToast('お気に入りを削除しました');
        };

        container.appendChild(row);
    });
}
function openEventModalForFavorite(fav = null) {
    // 予定入力モーダルをお気に入りデータで初期化して開く
    openEventModal(fav ? { ...fav, startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD') } : null);

    const saveBtn = document.getElementById('saveEventBtn');
    if (!saveBtn) return;

    // 保存ボタンの動作をお気に入り保存用に変更
    saveBtn.onclick = () => {
        const titleInput = document.getElementById('eventTitleInput');
        const title = titleInput ? titleInput.value.trim() : '';

        if (!title) {
            if (titleInput) titleInput.style.borderColor = '#ef4444';
            showToast('⚠️ タイトルを入力してください');
            return;
        }

        const favObj = {
            id: fav ? fav.id : 'fav_' + Date.now(),
            title: title,
            isImportant: document.getElementById('eventImportantInput').checked,
            isAllDay: document.getElementById('eventAllDayInput').checked,
            startTime: document.getElementById('eventStartInput').value,
            endTime: document.getElementById('eventEndInput').value,
            color: state.selectedColor,
            notifications: JSON.parse(JSON.stringify(currentModalNotifications))
        };

        if (fav) {
            const idx = state.favorites.findIndex(f => f.id === fav.id);
            if (idx >= 0) state.favorites[idx] = favObj;
        } else {
            state.favorites.push(favObj);
        }

        saveData();
        updateFavoriteDropdown();
        closeEventModal();
        renderFavoriteListDetail();
        showToast(fav ? 'お気に入りを更新しました' : 'お気に入りに登録しました');

        // 保存完了後にボタンの動作を通常の予定保存に戻す
        saveBtn.onclick = saveEventFromModal;
    };
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

function compressAndReadImage(file, maxWidth, maxHeight, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => {
            callback(e.target.result);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function initImageUploads() {
    const iconInput = document.getElementById('userIconInput');
    const bgInput = document.getElementById('bgInput');

    const uploadIconBtn = document.getElementById('uploadIconBtn');
    const uploadBgBtn = document.getElementById('uploadBgBtn');
    const headerAvatar = document.getElementById('headerAvatar');
    const groupAvatar = document.getElementById('groupAvatar');

    if (uploadIconBtn && iconInput) {
        uploadIconBtn.addEventListener('click', () => iconInput.click());
    }
    if (headerAvatar && iconInput) {
        headerAvatar.addEventListener('click', () => iconInput.click());
    }
    if (groupAvatar && iconInput) {
        groupAvatar.addEventListener('click', () => iconInput.click());
    }
    if (uploadBgBtn && bgInput) {
        uploadBgBtn.addEventListener('click', () => bgInput.click());
    }

    const handleIconUpload = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            compressAndReadImage(file, 200, 200, (dataUrl) => {
                state.customTheme.userIcon = dataUrl;
                saveData();
                applyTheme();
                showToast('アイコン画像を更新しました');
                e.target.value = '';
            });
        }
    };

    const handleBgUpload = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            compressAndReadImage(file, 1080, 1920, (dataUrl) => {
                state.customTheme.bgImage = dataUrl;
                saveData();
                applyTheme();
                showToast('背景画像を更新しました');
                e.target.value = '';
            });
        }
    };

    if (iconInput) {
        iconInput.addEventListener('change', handleIconUpload);
    }

    if (bgInput) {
        bgInput.addEventListener('change', handleBgUpload);
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

    const openShareModalBtn = document.getElementById('openShareModalBtn');
    if (openShareModalBtn) openShareModalBtn.addEventListener('click', openShareGroupModal);

    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    if (closeShareModalBtn) closeShareModalBtn.addEventListener('click', closeShareGroupModal);

    const cancelShareBtn = document.getElementById('cancelShareBtn');
    if (cancelShareBtn) cancelShareBtn.addEventListener('click', closeShareGroupModal);

    const confirmShareBtn = document.getElementById('confirmShareBtn');
    if (confirmShareBtn) confirmShareBtn.addEventListener('click', confirmShareEvent);

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

    // 保存ボタンを他と同じ左詰めに変更するレイアウト補正
    const modalFooter = modal.querySelector('.modal-footer') || modal.querySelector('.form-actions');
    const saveBtn = document.getElementById('saveEventBtn');
    if (modalFooter) {
        modalFooter.style.justifyContent = 'flex-start';
        modalFooter.style.display = 'flex';
        modalFooter.style.gap = '8px';
    }
    if (saveBtn) {
        saveBtn.style.marginRight = '0';
        saveBtn.style.marginLeft = '0';
    }
    
    clearModalErrors();
    modal.classList.remove('hidden');

    state.currentEditingEvent = evt;
    updateFavoriteDropdown();

    const allDayCheckbox = document.getElementById('eventAllDayInput');
    const repeatCheckbox = document.getElementById('eventRepeatInput');
    const startInput = document.getElementById('eventStartInput');
    const endInput = document.getElementById('eventEndInput');
    const weekdayContainer = document.getElementById('repeatWeekdayContainer');

    document.querySelectorAll('.weekday-selector input[type="checkbox"]').forEach(cb => cb.checked = false);

    const isOtherOwner = evt && evt.ownerId && state.profile.userId && evt.ownerId !== state.profile.userId;

    const setModalDisabled = (disabled) => {
        const titleEl = document.getElementById('eventTitleInput');
        const startDEl = document.getElementById('eventStartDateInput');
        const endDEl = document.getElementById('eventEndDateInput');
        const startTEl = document.getElementById('eventStartInput');
        const endTEl = document.getElementById('eventEndInput');
        const impEl = document.getElementById('eventImportantInput');

        if (titleEl) titleEl.disabled = disabled;
        if (startDEl) startDEl.disabled = disabled;
        if (endDEl) endDEl.disabled = disabled;
        if (startTEl) startTEl.disabled = disabled;
        if (endTEl) endTEl.disabled = disabled;
        if (impEl) impEl.disabled = disabled;
        if (allDayCheckbox) allDayCheckbox.disabled = disabled;
        if (repeatCheckbox) repeatCheckbox.disabled = disabled;

        const delBtn = document.getElementById('deleteEventBtn');
        const shareBtn = document.getElementById('openShareModalBtn');
        const favBtn = document.getElementById('saveFavoriteBtn');
        const noticeEl = document.getElementById('sharedEventNotice');

        if (saveBtn) saveBtn.classList.toggle('hidden', disabled);
        if (delBtn) delBtn.classList.toggle('hidden', disabled || !evt);
        if (shareBtn) shareBtn.classList.toggle('hidden', disabled);
        if (favBtn) favBtn.classList.toggle('hidden', disabled);
        if (noticeEl) noticeEl.classList.toggle('hidden', !disabled);
    };

    setModalDisabled(isOtherOwner);

    if (evt) {
        const editIdEl = document.getElementById('editEventId');
        const titleEl = document.getElementById('eventTitleInput');
        const impEl = document.getElementById('eventImportantInput');
        const startDEl = document.getElementById('eventStartDateInput');
        const endDEl = document.getElementById('eventEndDateInput');

        if (editIdEl) editIdEl.value = evt.id;
        if (titleEl) titleEl.value = evt.title || '';
        if (impEl) impEl.checked = !!evt.isImportant;
        if (startDEl) startDEl.value = evt.startDate || evt.date || state.currentDate.format('YYYY-MM-DD');
        if (endDEl) endDEl.value = evt.endDate || evt.date || state.currentDate.format('YYYY-MM-DD');
        
        if (allDayCheckbox) allDayCheckbox.checked = !!evt.isAllDay;
        if (repeatCheckbox) repeatCheckbox.checked = false;
        if (weekdayContainer) weekdayContainer.classList.add('hidden');

        if (startInput) startInput.value = evt.startTime || '09:00';
        if (endInput) endInput.value = evt.endTime || '10:00';

        currentModalNotifications = evt.notifications ? JSON.parse(JSON.stringify(evt.notifications)) : [];
        state.selectedColor = evt.color || state.customColors[0];
    } else {
        const editIdEl = document.getElementById('editEventId');
        const titleEl = document.getElementById('eventTitleInput');
        const impEl = document.getElementById('eventImportantInput');
        const startDEl = document.getElementById('eventStartDateInput');
        const endDEl = document.getElementById('eventEndDateInput');

        if (editIdEl) editIdEl.value = '';
        if (titleEl) titleEl.value = '';
        if (impEl) impEl.checked = false;
        
        const currentStr = state.currentDate.format('YYYY-MM-DD');
        if (startDEl) startDEl.value = currentStr;
        if (endDEl) endDEl.value = currentStr;

        if (allDayCheckbox) allDayCheckbox.checked = false;
        if (repeatCheckbox) repeatCheckbox.checked = false;
        if (weekdayContainer) weekdayContainer.classList.add('hidden');

        if (startInput) startInput.value = '09:00';
        if (endInput) endInput.value = '10:00';

        currentModalNotifications = [];
        state.selectedColor = state.customColors[0];
    }

    renderNotificationListInModal();
    if (!isOtherOwner) {
        toggleTimeInputsForMode(allDayCheckbox ? allDayCheckbox.checked : false);
    }
    renderModalColorPalette(state.selectedColor);
}

function closeEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) modal.classList.add('hidden');
    state.currentEditingEvent = null;

    // 保存ボタンのイベントを通常保存に戻す（この1行を追加）
    const saveBtn = document.getElementById('saveEventBtn');
    if (saveBtn) saveBtn.onclick = saveEventFromModal;
}

function openShareGroupModal() {
    if (!state.profile.userId) {
        alert('共有機能を使用するには、先にグループタブからプロフィールを設定してください。');
        return;
    }

    const groupKeys = Object.keys(state.groups);
    if (groupKeys.length === 0) {
        alert('参加しているグループがありません。「グループ・フレンド」タブからグループを作成・参加してください。');
        return;
    }

    const container = document.getElementById('shareGroupListContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentEvt = state.currentEditingEvent;
    const currentSharedGroupIds = currentEvt ? (currentEvt.sharedGroupIds || []) : [];

    groupKeys.forEach(gId => {
        const grp = state.groups[gId];
        const label = document.createElement('label');
        label.className = 'share-group-item';
        
        const isChecked = currentSharedGroupIds.includes(gId);
        label.innerHTML = `
            <input type="checkbox" value="${gId}" class="share-grp-cb" ${isChecked ? 'checked' : ''}>
            <span>👨‍👩‍👧‍👦 <strong>${grp.name}</strong></span>
        `;
        container.appendChild(label);
    });

    document.getElementById('shareGroupModal').classList.remove('hidden');
}

function closeShareGroupModal() {
    document.getElementById('shareGroupModal').classList.add('hidden');
}

function confirmShareEvent() {
    const selectedGroupIds = Array.from(document.querySelectorAll('.share-grp-cb:checked')).map(cb => cb.value);

    if (selectedGroupIds.length === 0) {
        alert('共有先のグループを少なくとも1つ選択してください。');
        return;
    }

    let evt = state.currentEditingEvent;
    if (!evt) {
        const title = document.getElementById('eventTitleInput').value.trim() || '無題の予定';
        evt = {
            id: 'evt_' + Date.now(),
            title: title,
            isImportant: document.getElementById('eventImportantInput').checked,
            isAllDay: document.getElementById('eventAllDayInput').checked,
            startDate: document.getElementById('eventStartDateInput').value,
            endDate: document.getElementById('eventEndDateInput').value,
            startTime: document.getElementById('eventStartInput').value,
            endTime: document.getElementById('eventEndInput').value,
            color: state.selectedColor,
            notifications: JSON.parse(JSON.stringify(currentModalNotifications)),
            completed: false
        };
        state.events.push(evt);
    }

    evt.ownerId = state.profile.userId;
    evt.ownerName = state.profile.userName;
    evt.sharedGroupIds = selectedGroupIds;

    saveData();
    syncSharedEventToCloud(evt);
    notifyGroupMembersForEvent(selectedGroupIds, evt);

    closeShareGroupModal();
    closeEventModal();
    renderAllViews();

    showToast(`👥 ${selectedGroupIds.length}個のグループに予定を共有しました`);
}

function syncSharedEventToCloud(evt) {
    if (!isFirebaseReady || !evt.sharedGroupIds) return;
    const db = firebase.database();

    const sharedData = {
        id: evt.id,
        ownerId: evt.ownerId || state.profile.userId,
        ownerName: evt.ownerName || state.profile.userName,
        title: evt.title,
        isImportant: evt.isImportant,
        isAllDay: evt.isAllDay,
        startDate: evt.startDate,
        endDate: evt.endDate,
        startTime: evt.startTime,
        endTime: evt.endTime,
        color: evt.color,
        sharedGroupIds: evt.sharedGroupIds,
        updatedAt: Date.now()
    };

    evt.sharedGroupIds.forEach(gId => {
        db.ref(`groupEvents/${gId}/${evt.id}`).set(sharedData);
    });
}

function notifyGroupMembersForEvent(groupIds, evt) {
    if (!isFirebaseReady) return;
    const db = firebase.database();

    groupIds.forEach(gId => {
        const group = state.groups[gId];
        if (!group || !group.members) return;

        Object.keys(group.members).forEach(memberId => {
            if (memberId !== state.profile.userId) {
                const notifRef = db.ref(`userNotifications/${memberId}`).push();
                notifRef.set({
                    id: notifRef.key,
                    title: '📅 共有予定が追加・更新されました',
                    message: `${state.profile.userName} さんが「${evt.title}」をグループ「${group.name}」に共有しました`,
                    timestamp: Date.now()
                });
            }
        });
    });
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

    let startDate = startDateInput ? startDateInput.value : '';
    let endDate = endDateInput ? endDateInput.value : '';
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

    // 日跨ぎ判定（深夜〜翌日）: s.endTime < s.startTime の場合は自動で翌日判定を実施
    if (!isAllDay && startTime && endTime && endTime < startTime) {
        if (startDate === endDate) {
            endDate = dayjs(startDate).add(1, 'day').format('YYYY-MM-DD');
            if (endDateInput) endDateInput.value = endDate;
        }
    } else if (startDate > endDate) {
        if (startDateInput) startDateInput.style.borderColor = '#ef4444';
        if (endDateInput) endDateInput.style.borderColor = '#ef4444';
        showToast('⚠️ 終了日は開始日以降の日付に設定してください');
        return;
    }

    recordStateForUndo(`予定の追加・保存を行いました`);

    let targetEvt = null;

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
                    completed: false,
                    ownerId: state.profile.userId,
                    ownerName: state.profile.userName
                };
                state.events.push(newEvt);
                createdCount++;
            }
            currDay = currDay.add(1, 'day');
        }

        showToast(`✅ ${createdCount}件の繰り返し予定を作成しました`);
    } else {
        const existingIdx = state.events.findIndex(e => e.id === id);
        const existingEvt = existingIdx >= 0 ? state.events[existingIdx] : null;

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
            completed: false,
            ownerId: existingEvt ? (existingEvt.ownerId || state.profile.userId) : state.profile.userId,
            ownerName: existingEvt ? (existingEvt.ownerName || state.profile.userName) : state.profile.userName,
            sharedGroupIds: existingEvt ? existingEvt.sharedGroupIds : null
        };

        if (existingIdx >= 0) {
            state.events[existingIdx] = eventObj;
        } else {
            state.events.push(eventObj);
        }

        targetEvt = eventObj;
        showToast(`✅ 予定「${title}」を保存しました`);
    }

    if (targetEvt && targetEvt.sharedGroupIds && targetEvt.sharedGroupIds.length > 0) {
        syncSharedEventToCloud(targetEvt);
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

    if (targetEvt) {
        recordStateForUndo(`予定「${targetEvt.title}」を削除しました`);

        // 共有グループのクラウドデータ削除同期
        if (isFirebaseReady && targetEvt.sharedGroupIds && targetEvt.sharedGroupIds.length > 0) {
            const db = firebase.database();
            targetEvt.sharedGroupIds.forEach(gId => {
                db.ref(`groupEvents/${gId}/${targetEvt.id}`).remove();
            });
        }
    }

    state.events = state.events.filter(e => e.id !== id);
    saveData();
    closeEventModal();
    renderAllViews();
}
