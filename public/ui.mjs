export async function api(path, options = {}, fetcher = globalThis.fetch) {
 const response = await fetcher(path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
 const data = response.status === 204 ? {} : await response.json();
 if (!response.ok) throw Object.assign(new Error(data.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.'), {status: response.status});
 return data;
}
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0) + ' ₽';
const action = (label, attrs = '', secondary = false) => `<button class="button ${secondary ? 'button-secondary' : ''}" ${attrs}>${label}</button>`;
export function render(s) {
 const e = escape, route = s.route || 'home', services = s.services || [];
 const notice = `${s.error ? `<p class="notice error" role="alert">${e(s.error)}</p>` : ''}${s.success ? `<p class="notice success" role="status">${e(s.success)}</p>` : ''}`;
 const notifications = s.user ? `<details class="notifications" id="notification-panel" ${s.notificationsOpen ? 'open' : ''}><summary>Уведомления <span class="notification-count">${e(s.unreadCount || 0)}</span></summary>${s.notificationsError ? `<p class="notice error" role="alert">${e(s.notificationsError)}</p>${action('Обновить уведомления','data-action="notifications-refresh"',true)}` : s.notificationsBusy ? '<p role="status">Загружаем уведомления…</p>' : (s.notifications || []).length ? `<ul>${s.notifications.map(n=>`<li class="${n.read ? '' : 'unread'}">${e(n.text)}</li>`).join('')}</ul>` : '<p>Уведомлений пока нет.</p>'}${s.unreadCount ? action('Отметить прочитанными',`data-action="notifications-read" ${s.notificationsBusy ? 'disabled' : ''}`,true) : ''}</details>` : '';
 let content = '';
 if (route === 'admin') {
  const tab = s.adminTab || 'bookings';
  const submit = action(s.busy ? 'Сохраняем…' : 'Сохранить',`type="submit" ${s.busy ? 'disabled' : ''}`);
  const masterOptions = selected => (s.masters || []).map(m=>`<option value="${e(m.id)}" ${String(m.id) === String(selected) ? 'selected' : ''}>${e(m.name)}${!m.active ? ' (неактивен)' : ''}</option>`).join('');
  const activeField = item => `<label>Доступность<select name="active"><option value="1" ${item.active ? 'selected' : ''}>Активна</option><option value="0" ${!item.active ? 'selected' : ''}>Скрыта</option></select></label>`;
  const serviceFields = item => `<label>Название услуги<input name="name" value="${e(item.name)}" maxlength="100" required></label><label>Описание<textarea name="description" maxlength="1000">${e(item.description)}</textarea></label><div class="inline-fields"><label>Длительность, мин<input type="number" name="duration_minutes" min="30" max="480" step="30" value="${e(item.duration_minutes)}" required></label><label>Цена, ₽<input type="number" name="price" min="0" max="1000000" step="1" value="${e(item.price)}" required></label></div>${activeField(item)}`;
  const masterFields = item => `<label>Имя мастера<input name="name" value="${e(item.name)}" maxlength="100" required></label><label>Специализация<input name="specialty" value="${e(item.specialty)}" maxlength="1000" required></label>${activeField(item)}`;
  let panel = '';
  if (tab === 'bookings') panel = (s.bookings || []).length ? s.bookings.map(b=>`<article class="admin-booking"><div><p class="eyebrow">ЗАПИСЬ № ${e(b.id)}</p><h3>${e(b.service_name)}</h3><p>${e(b.date)} · ${e(b.time)}<br>Мастер: ${e(b.master_name)}${b.user_name ? '<br>Клиент: '+e(b.user_name) : ''}</p><form data-form="status" data-id="${e(b.id)}"><label>Статус записи<select name="status"><option value="" ${b.status === 'pending' ? 'selected' : ''} disabled>Ожидает подтверждения</option>${Object.entries({confirmed:'Подтверждена',cancelled:'Отменена',completed:'Завершена'}).map(([key,label])=>`<option value="${key}" ${key === b.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${submit}</form></div><details class="reschedule"><summary>Перенести запись</summary><form data-form="reschedule" data-id="${e(b.id)}"><label>Мастер<select name="master_id" required>${masterOptions(b.master_id)}</select></label><div class="inline-fields"><label>Новая дата<input type="date" name="date" value="${e(b.date)}" min="${tomorrow()}" required></label><label>Новое время<input type="time" name="time" value="${e(b.time)}" step="1800" required></label></div><p class="field-note">Сервер проверит доступность. Номер записи сохранится.</p>${submit}</form></details></article>`).join('') : '<p class="empty">Записей пока нет.</p>';
  if (tab === 'services') panel = `<div class="admin-grid"><div>${services.map(item=>`<article class="admin-item"><h3>${e(item.name)}</h3><form data-form="service-edit" data-id="${e(item.id)}">${serviceFields(item)}${submit}</form></article>`).join('') || '<p class="empty">Услуг пока нет.</p>'}</div><div class="form-card"><h2>Новая услуга</h2><form data-form="service-create">${serviceFields({active:1})}${submit}</form></div></div>`;
  if (tab === 'masters') panel = `<div class="admin-grid"><div>${(s.masters || []).map(item=>`<article class="admin-item"><h3>${e(item.name)}</h3><form data-form="master-edit" data-id="${e(item.id)}">${masterFields(item)}${submit}</form></article>`).join('') || '<p class="empty">Мастеров пока нет.</p>'}</div><div class="form-card"><h2>Новый мастер</h2><form data-form="master-create">${masterFields({active:1})}${submit}</form></div></div>`;
  if (tab === 'blocks') panel = `<div class="form-card block-form"><h2>Перерыв мастера</h2><p class="admin-note">Заблокируйте интервал, чтобы он не предлагался при записи.</p><form data-form="block"><label>Мастер<select name="master_id" required>${masterOptions('')}</select></label><label>Дата перерыва<input name="date" type="date" min="${tomorrow()}" value="${e(s.date)}" required></label><div class="inline-fields"><label>Начало<input type="time" name="start_time" step="1800" required></label><label>Окончание<input type="time" name="end_time" step="1800" required></label></div>${submit}</form></div>`;
  content = `<section class="page-section"><div class="page-heading"><p class="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p><h1>Студия <em>под контролем.</em></h1></div>${s.user?.role !== 'admin' ? '<p class="notice error" role="alert">Доступ только для администратора</p>' : `<div class="admin-tabs" role="tablist" aria-label="Управление студией">${Object.entries({bookings:'Записи',services:'Услуги',masters:'Мастера',blocks:'Перерывы'}).map(([key,label])=>action(label,`type="button" role="tab" id="tab-${key}" aria-controls="admin-panel" aria-selected="${tab === key}" data-tab="${key}"`,true)).join('')}</div>${notice}${s.loading ? '<p class="empty" role="status">Загружаем данные студии…</p>' : `<div id="admin-panel" role="tabpanel" aria-labelledby="tab-${e(tab)}">${panel}</div>`}${s.error ? action('Обновить данные','data-action="retry"',true) : ''}`}</section>`;
 }
 if (route === 'cabinet') {
  content = `<section class="page-section"><div class="section-heading"><div><p class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</p><h1>${e(s.user?.name)},<br><em>ваши планы.</em></h1></div><a class="button" href="#services">Новая запись ↗</a></div>${notice}<h2 class="list-heading">Мои записи</h2>${s.loading ? '<p class="empty" role="status">Загружаем ваши записи…</p>' : (s.bookings || []).length ? `<div class="booking-list">${s.bookings.map(b=>`<article class="visit"><div class="visit-date"><strong>${e(b.time)}</strong><span>${e(b.date)}</span></div><div class="visit-info"><span class="status status-${e(b.status)}">${e(({pending:'Ожидает подтверждения',confirmed:'Подтверждена',cancelled:'Отменена',completed:'Завершена'})[b.status] || b.status)}</span><h3>${e(b.service_name)}</h3><p>Мастер: ${e(b.master_name)}</p></div><strong class="visit-price">${money(b.price)}</strong>${!['cancelled','completed'].includes(b.status) ? action('Отменить',`data-cancel="${e(b.id)}" ${s.busy ? 'disabled' : ''}`,true) : ''}</article>`).join('')}</div>` : !s.error ? '<div class="empty"><h3>Пока нет записей</h3><p>Самое время запланировать небольшой перерыв для себя.</p><a class="button" href="#services">Выбрать услугу ↗</a></div>' : ''}${s.error ? action('Обновить записи','data-action="retry"',true) : ''}</section>`;
 }
 if (route === 'booking') {
  const service = services.find(v => String(v.id) === String(s.serviceId));
  const master = (s.masters || []).find(v => String(v.id) === String(s.masterId));
  content = `<section class="page-section"><a class="text-link" href="#services">← Все услуги</a><div class="page-heading"><p class="eyebrow">ОНЛАЙН-ЗАПИСЬ</p><h1>Время <em>для вас.</em></h1><p>Выберите мастера, день и свободное время.</p></div>${notice}${s.loading ? '<p class="empty" role="status">Загружаем данные для записи…</p>' : !service ? '<div class="empty">Сначала выберите услугу в каталоге. <a href="#services">К услугам →</a></div>' : `<div class="booking-layout"><form class="booking-form" data-form="booking"><fieldset><legend><span>01</span> Ваш мастер</legend><label>Мастер<select name="master_id" required><option value="">Выберите мастера</option>${(s.masters || []).map(m=>`<option value="${e(m.id)}" ${String(m.id) === String(s.masterId) ? 'selected' : ''}>${e(m.name)}${m.specialty ? ' · '+e(m.specialty) : ''}</option>`).join('')}</select></label>${!s.masters?.length ? '<p class="field-note">Мастера пока не добавлены.</p>' : ''}</fieldset><fieldset><legend><span>02</span> День и время</legend><label>Дата<input type="date" name="date" value="${e(s.date)}" min="${tomorrow()}" required></label><p class="slot-caption">Доступное время</p>${s.slotsError ? `<p class="notice error" role="alert">${e(s.slotsError)}</p>${action('Обновить время','type="button" data-action="slots"',true)}` : s.slotsLoading ? '<p class="empty compact" role="status">Загружаем свободное время…</p>' : !s.masterId ? '<p class="field-note">Сначала выберите мастера.</p>' : (s.slots || []).length ? `<div class="slots" role="group" aria-label="Свободное время">${s.slots.map(time=>action(e(time),`type="button" data-time="${e(time)}" aria-pressed="${time === s.time}"`,time !== s.time)).join('')}</div><p class="field-note">Показаны только свободные интервалы. Занятое время недоступно для записи.</p>` : '<p class="empty compact">Свободного времени нет. Выберите другой день или мастера.</p>'}</fieldset>${action(s.busy ? 'Записываем…' : 'Подтвердить запись',`type="submit" ${s.busy || s.slotsLoading || !s.time || !s.masterId ? 'disabled' : ''}`)}</form><aside class="booking-summary"><p class="eyebrow">ВАШ ВИЗИТ</p><h2>${e(service.name)}</h2><p>${e(service.description)}</p><dl><div><dt>Продолжительность</dt><dd>${e(service.duration_minutes)} мин</dd></div><div><dt>Мастер</dt><dd>${e(master?.name || 'Не выбран')}</dd></div><div><dt>Дата</dt><dd>${e(s.date || 'Не выбрана')}</dd></div><div><dt>Время</dt><dd>${e(s.time || 'Не выбрано')}</dd></div></dl><div class="summary-price"><span>Итого</span><strong>${money(service.price)}</strong></div><p class="field-note">Управлять записью можно в личном кабинете.</p></aside></div>`}</section>`;
 }
 if (route === 'login' || route === 'register') {
  const register = route === 'register';
  content = `<section class="auth-layout"><div class="auth-story"><p class="eyebrow">ВАШ ЛИЧНЫЙ РИТУАЛ</p><h1>${register ? 'Давайте<br><em>познакомимся.</em>' : 'С возвращением<br><em>к себе.</em>'}</h1><p class="lead">Ваши записи, любимый мастер и новые планы — в одном месте.</p><a class="text-link" href="#services">← Вернуться к услугам</a></div><div class="form-card"><p class="eyebrow">${register ? 'НОВЫЙ АККАУНТ' : 'ЛИЧНЫЙ КАБИНЕТ'}</p><h2>${register ? 'Регистрация' : 'Вход'}</h2>${notice}<form data-form="${route}">${register ? '<label>Имя<input name="name" autocomplete="name" maxlength="100" required></label>' : ''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Пароль<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="8"' : ''} maxlength="128" required></label>${register ? '<p class="field-note">Не менее 8 символов. Не используйте свой настоящий пароль.</p>' : ''}${action(s.busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти',`type="submit" ${s.busy ? 'disabled' : ''}`)}</form><p class="form-switch">${register ? 'Уже есть аккаунт? <a href="#login">Войти</a>' : 'Впервые у нас? <a href="#register">Зарегистрироваться</a>'}</p></div></section>`;
 }
 if (route === 'home' || route === 'services') {
  content = `${route === 'home' ? `<section class="hero"><div class="hero-copy"><p class="eyebrow">СТУДИЯ СТИЛЯ · ОНЛАЙН-ЗАПИСЬ</p><h1>Ваш стиль.<br><em>Ваше время.</em></h1><p class="lead">Найдите свою услугу, выберите мастера и оставьте время для себя. Всё остальное — в руках профессионалов.</p><a class="button" href="#services">Выбрать услугу <span aria-hidden="true">↗</span></a></div><aside class="hero-art" aria-label="TDlend — пространство вашего стиля"><span class="art-top">TDLEND / STUDIO</span><span class="monogram" aria-hidden="true">Td.</span><span class="art-bottom">Маленький ритуал.<br>Большая разница.</span></aside></section>` : ''}
  <section class="catalog"><div class="section-heading"><div><p class="eyebrow">МЕНЮ СТУДИИ</p><h${route === 'home' ? '2' : '1'}>Услуги<span class="copper"> & уход</span></h${route === 'home' ? '2' : '1'}></div><p>То, что нужно именно вам.<br>Выберите — и найдём удобное время.</p></div>${notice}
  ${s.loading ? '<div class="empty" role="status">Загружаем услуги…</div>' : services.length ? `<div class="service-list">${services.map((service,i)=>`<article class="service-row"><span class="row-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><div class="service-info"><h3>${e(service.name)}</h3><p>${e(service.description)}</p><span class="duration">${e(service.duration_minutes)} мин</span></div><div class="service-price">${money(service.price)}</div>${action('Записаться <span aria-hidden="true">↗</span>',`data-service="${e(service.id)}"`)}</article>`).join('')}</div>` : !s.error ? '<div class="empty">Услуги пока не добавлены. Загляните чуть позже.</div>' : ''}
  ${s.error ? action('Попробовать ещё раз','data-action="retry"',true) : ''}</section>`;
 }
 return `<header class="site-header"><a class="brand" href="#home" aria-label="TDlend — главная">TD<span>lend</span><i aria-hidden="true">.</i></a><nav aria-label="Основная навигация"><a href="#services" ${['home','services'].includes(route) ? 'aria-current="page"' : ''}>Услуги</a>${s.user ? `${action(`Уведомления <span class="notification-count">${e(s.unreadCount || 0)}</span>`,'data-action="notifications" aria-controls="notification-panel"',true)}<a href="#cabinet" ${route === 'cabinet' ? 'aria-current="page"' : ''}>Личный кабинет</a>${s.user.role === 'admin' ? '<a href="#admin">Управление</a>' : ''}${action('Выйти','data-action="logout"',true)}` : '<a class="nav-login" href="#login">Войти <span aria-hidden="true">↗</span></a>'}</nav></header>${notifications}<main id="main" tabindex="-1">${s.sessionError ? `<p class="notice error global-notice" role="alert">${e(s.sessionError)}</p>` : ''}${content}</main><footer class="site-footer"><a class="brand" href="#home">TD<span>lend</span><i>.</i></a><p>Время для себя начинается здесь.</p><a href="#services">Выбрать услугу <span aria-hidden="true">↗</span></a></footer>`;
}
export function createController({request = api, paint = () => {}, navigate = () => {}} = {}) {
 const state = {route:'home',user:null,services:[],masters:[],bookings:[],slots:[],date:tomorrow(),masterId:'',serviceId:'',time:'',error:'',success:'',busy:false,loading:false};
 let generation = 0, slotGeneration = 0, bookingsSource = null;
 const bookingSource = scope => JSON.stringify([scope,state.user?.id]);
 const draw = () => paint(state);
 const read = async (path, label) => {
  try { return await request(path); }
  catch (error) { throw Object.assign(new Error('Не удалось загрузить '+label+': '+error.message),{status:error.status}); }
 };
 const controller = {state,
  async notifications(markRead = false, toggle = false) {
   if (!state.user || state.notificationsBusy) return;
   if (toggle) state.notificationsOpen = !state.notificationsOpen;
   const identity = state.user.id;
   state.notificationsBusy = true; state.notificationsError = ''; draw();
   try {
    if (markRead) await request('/api/notifications/read',{method:'POST'});
    const data = await request('/api/notifications');
    if (state.user?.id === identity) { state.notifications = data.notifications; state.unreadCount = data.unread_count; }
   } catch (error) { state.notificationsError = 'Не удалось загрузить уведомления: ' + error.message; }
   finally { state.notificationsBusy = false; draw(); }
  },
  tab(name) { if (['bookings','services','masters','blocks'].includes(name)) { state.adminTab = name; state.error = ''; state.success = ''; draw(); } },
  async adminSave(form, id, values) {
   if (state.busy || state.user?.role !== 'admin' || !['status','reschedule','service-create','service-edit','master-create','master-edit','block'].includes(form)) return;
   state.busy = true; state.error = ''; state.success = ''; draw();
   try {
    if (form === 'block') {
     const body = {master_id:Number(values.master_id),date:values.date,start_time:values.start_time,end_time:values.end_time};
     const service = state.services.find(s=>s.active);
     if (!service) throw new Error('Для проверки перерыва нужна хотя бы одна активная услуга.');
     await request('/api/admin/blocks',{method:'POST',body});
     const data = await request('/api/slots?'+new URLSearchParams({date:body.date,master_id:body.master_id,service_id:service.id}));
     if (data.slots.some(time=>time >= body.start_time && time < body.end_time)) throw new Error('Перерыв отправлен, но время ещё доступно. Обновите данные.');
    } else if (form.startsWith('service-') || form.startsWith('master-')) {
     const service = form.startsWith('service-'), kind = service ? 'services' : 'masters';
     const body = service ? {name:values.name,description:values.description,duration_minutes:Number(values.duration_minutes),price:Number(values.price),active:Number(values.active)} : {name:values.name,specialty:values.specialty,active:Number(values.active)};
     const create = form.endsWith('create');
     const response = await request('/api/admin/'+kind+(create ? '' : '/'+encodeURIComponent(id)),{method:create ? 'POST' : 'PATCH',body});
     state[kind] = (await request('/api/admin/'+kind))[kind];
     const saved = state[kind].find(item=>String(item.id) === String(create ? response[service ? 'service' : 'master'].id : id));
     if (!saved || Object.entries(body).some(([key,value])=>saved[key] !== value)) throw new Error('Изменение не подтверждено. Обновите данные.');
    } else {
    const body = form === 'status' ? {status:values.status} : {date:values.date,time:values.time,master_id:Number(values.master_id)};
    await request('/api/admin/bookings/'+encodeURIComponent(id),{method:'PATCH',body});
    state.bookings = (await request('/api/admin/bookings')).bookings; bookingsSource = bookingSource('admin');
    const saved = state.bookings.find(b=>String(b.id) === String(id));
    if (!saved || Object.entries(body).some(([key,value])=>saved[key] !== value)) throw new Error('Изменение не подтверждено. Обновите данные.');
    }
    state.success = 'Изменения сохранены.';
    state.resetForm = form+':'+(id || '');
   } catch (error) { state.error = error.message; }
   finally { state.busy = false; draw(); }
  },
  async reserve() {
   if (state.busy || !state.user || !state.masterId || !state.serviceId || !state.time || !state.slots.includes(state.time)) return;
   state.busy = true; state.error = ''; state.success = ''; draw();
   try {
    const {booking} = await request('/api/bookings',{method:'POST',body:{service_id:Number(state.serviceId),master_id:Number(state.masterId),date:state.date,time:state.time}});
    state.time = ''; state.slots = [];
    await navigate('cabinet',true);
    await controller.load('cabinet');
    if (state.error || !state.bookings.some(b=>String(b.id) === String(booking.id))) throw new Error('Запись отправлена, но не подтверждена в кабинете. Обновите список перед повторной попыткой.');
    state.success = 'Запись создана. До встречи в студии!';
   } catch (error) { state.error = error.message; if (error.status === 409) await controller.loadSlots(); }
   finally { state.busy = false; draw(); }
  },
  async cancel(id) {
   const booking = state.bookings.find(b=>String(b.id) === String(id));
   if (state.busy || !state.user || !booking || (bookingsSource && bookingsSource !== bookingSource('own')) || ['cancelled','completed'].includes(booking.status)) return;
   state.busy = true; state.error = ''; state.success = ''; draw();
   try {
    await request('/api/bookings/'+encodeURIComponent(id),{method:'DELETE'});
    state.bookings = (await request('/api/bookings')).bookings; bookingsSource = bookingSource('own');
    const saved = state.bookings.find(b=>String(b.id) === String(id));
    if (saved && saved.status !== 'cancelled') throw new Error('Не удалось подтвердить отмену. Обновите список.');
    state.success = 'Запись отменена. Вы можете выбрать другое время.';
   } catch (error) { state.error = error.message; }
   finally { state.busy = false; draw(); }
  },
  async logout() {
   if (state.busy) return;
   state.busy = true; state.error = ''; draw();
   try {
    await request('/api/auth/logout',{method:'POST'});
    try { await request('/api/auth/me'); throw new Error('Выход не подтверждён. Попробуйте снова.'); }
    catch (error) { if (error.status !== 401) throw error; }
    ++generation; ++slotGeneration; bookingsSource = null;
    Object.assign(state,{user:null,bookings:[],notifications:[],unreadCount:0,serviceId:'',masterId:'',time:'',slots:[],success:''});
    navigate('home');
   } catch (error) { state.error = error.message; }
   finally { state.busy = false; draw(); }
  },
  async changeBooking(name, value) {
   if (name === 'time') { if (state.slots.includes(value)) state.time = value; draw(); return; }
   if (name === 'master_id') state.masterId = value;
   if (name === 'date') state.date = value;
   await controller.loadSlots();
  },
  async loadSlots() {
   const current = ++slotGeneration;
   state.time = ''; state.slots = []; state.slotsError = ''; state.slotsLoading = false;
   if (!state.masterId || !state.date || !state.serviceId) { draw(); return; }
   state.slotsLoading = true; draw();
   try {
    const data = await request('/api/slots?' + new URLSearchParams({date:state.date,master_id:state.masterId,service_id:state.serviceId}));
    if (current === slotGeneration) state.slots = data.slots;
   } catch (error) { if (current === slotGeneration) state.slotsError = 'Не удалось загрузить свободное время: ' + error.message; }
   finally { if (current === slotGeneration) { state.slotsLoading = false; draw(); } }
  },
  chooseService(id) {
   state.serviceId = String(id); state.time = ''; state.masterId = '';
   return navigate(`${state.user ? 'booking' : 'login'}?service=${encodeURIComponent(id)}`);
  },
  async authenticate(kind, body) {
   if (state.busy) return;
   state.busy = true; state.error = ''; draw();
   try {
    state.user = (await request('/api/auth/' + kind, {method:'POST',body})).user;
    await navigate(state.serviceId ? 'booking?service=' + encodeURIComponent(state.serviceId) : 'cabinet');
   } catch (error) { state.error = error.message; }
   finally { state.busy = false; draw(); }
  },
  async init(route = 'home') {
   try { state.user = (await request('/api/auth/me')).user; }
   catch (error) { if (error.status !== 401) state.sessionError = 'Не удалось проверить сессию: ' + error.message; }
   await controller.load(route);
  },
  async load(hash = 'home') {
   const [page, query] = hash.replace(/^#/, '').split('?');
   state.route = ['home','services','login','register','booking','cabinet','admin'].includes(page) ? page : 'home';
   const nextSource = state.user && (state.route === 'cabinet' ? bookingSource('own') : state.route === 'admin' && state.user.role === 'admin' ? bookingSource('admin') : null);
   if (!state.user || (nextSource && nextSource !== bookingsSource)) state.bookings = [];
   if (nextSource || !state.user) bookingsSource = nextSource;
   const selected = new URLSearchParams(query).get('service');
   if (selected) state.serviceId = selected;
   if (['booking','cabinet','admin'].includes(state.route) && !state.user) {
    navigate(state.serviceId ? 'login?service='+encodeURIComponent(state.serviceId) : 'login'); return;
   }
   const current = ++generation;
   ++slotGeneration;
   state.error = ''; state.success = ''; state.loading = true; draw();
   try {
    if (state.route === 'admin' && state.user?.role === 'admin') {
     const [visits,catalog,team] = await Promise.all([read('/api/admin/bookings','записи студии'),read('/api/admin/services','услуги студии'),read('/api/admin/masters','мастеров студии')]);
     if (current === generation) { state.bookings = visits.bookings; state.services = catalog.services; state.masters = team.masters; }
    } else if (['home','services'].includes(state.route)) {
     const data = await read('/api/services','услуги');
     if (current === generation) state.services = data.services;
    } else if (state.route === 'cabinet') {
     const data = await read('/api/bookings','ваши записи');
     if (current === generation) state.bookings = data.bookings;
    } else if (state.route === 'booking') {
     const [catalog, team] = await Promise.all([read('/api/services','услуги'),read('/api/masters','мастеров')]);
     if (current === generation) { state.services = catalog.services; state.masters = team.masters; await controller.loadSlots(); }
    }
   } catch (error) { if (current === generation) state.error = error.message; }
   finally { if (current === generation) { state.loading = false; draw(); } }
  }
 };
 return controller;
}
export function mount({root, win = globalThis.window, request = api}) {
 const drafts = new Map();
 let lastUser = null;
 const paint = state => {
  if (lastUser && !state.user) drafts.clear();
  else rememberForms(root,drafts,state.resetForm);
  lastUser = state.user;
  root.innerHTML = render(state);
  restoreForms(root,drafts,state.resetForm);
  state.resetForm = '';
 };
 const navigate = async (route, loaded = false) => {
  win.history.pushState(null,'','#'+route);
  if (!loaded) await controller.load(route);
  if (controller.state.user) await controller.notifications();
  win.scrollTo?.(0,0);
  root.querySelector('#main')?.focus({preventScroll:true});
 };
 const controller = createController({request,paint,navigate});
 root.addEventListener('click',async event => {
  const link = event.target.closest('a[href^="#"]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
   event.preventDefault(); await navigate(link.getAttribute('href').slice(1)); return;
  }
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.service) return controller.chooseService(d.service);
  if (d.time) return controller.changeBooking('time',d.time);
  if (d.tab) return controller.tab(d.tab);
  if (d.cancel) {
   if (win.confirm('Отменить эту запись?')) return controller.cancel(d.cancel);
   return;
  }
  if (d.action === 'logout') return controller.logout();
  if (d.action === 'retry') return controller.load(win.location.hash);
  if (d.action === 'slots') return controller.loadSlots();
  if (d.action === 'notifications') return controller.notifications(false,true);
  if (d.action === 'notifications-refresh') return controller.notifications();
  if (d.action === 'notifications-read') return controller.notifications(true);
 });
 root.addEventListener('change',event => {
  if (event.target.closest('[data-form="booking"]')) return controller.changeBooking(event.target.name,event.target.value);
 });
 root.addEventListener('toggle',event => {
  if (event.target.id === 'notification-panel') controller.state.notificationsOpen = event.target.open;
 },true);
 root.addEventListener('submit',async event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (!form.checkValidity()) { form.reportValidity?.(); return; }
  const values = Object.fromEntries(new win.FormData(form));
  if (['login','register'].includes(form.dataset.form)) return controller.authenticate(form.dataset.form,values);
  if (form.dataset.form === 'booking') return controller.reserve();
  return controller.adminSave(form.dataset.form,form.dataset.id,values);
 });
 win.addEventListener('hashchange',()=>controller.load(win.location.hash));
 const ready = controller.init(win.location.hash).then(async()=>{if (controller.state.user) await controller.notifications();});
 return {controller,ready};
}
const formBaselines = new WeakMap(), draftMetadata = new WeakMap();
function draftMeta(drafts) {
 if (!draftMetadata.has(drafts)) draftMetadata.set(drafts,{baselines:new Map(),conflicts:new Set()});
 return draftMetadata.get(drafts);
}
const formValues = form => Object.fromEntries(Array.from(form.elements).filter(c=>c.name && c.type !== 'password').map(c=>[c.name,c.value]));
export function rememberForms(root, drafts, resetKey) {
 const meta = draftMeta(drafts);
 for (const form of root.querySelectorAll('form[data-form]')) {
  const key = form.dataset.form+':'+(form.dataset.id || '');
  if (key === resetKey || form.dataset.form === 'booking') continue;
  const baseline = formBaselines.get(form) || Object.fromEntries(Array.from(form.elements).filter(c=>c.name && c.type !== 'password').map(c=>[c.name,c.defaultValue ?? '']));
  const values = Object.fromEntries(Object.entries(formValues(form)).filter(([name,value])=>value !== baseline[name]));
  if (Object.keys(values).length) { drafts.set(key,values); meta.baselines.set(key,baseline); meta.conflicts.delete(key); }
  else { drafts.delete(key); meta.baselines.delete(key); }
 }
}
export function restoreForms(root, drafts, resetKey) {
 const meta = draftMeta(drafts);
 if (resetKey) { drafts.delete(resetKey); meta.baselines.delete(resetKey); meta.conflicts.delete(resetKey); }
 for (const form of root.querySelectorAll('form[data-form]')) {
  const key = form.dataset.form+':'+(form.dataset.id || ''), baseline = formValues(form);
  formBaselines.set(form,baseline);
  const values = drafts.get(key), previous = meta.baselines.get(key);
  if (values && previous && Object.entries(previous).some(([name,value])=>baseline[name] !== value)) {
   drafts.delete(key); meta.baselines.delete(key); meta.conflicts.add(key);
  } else if (values) for (const control of form.elements) if (Object.hasOwn(values,control.name)) control.value = values[control.name];
  if (meta.conflicts.has(key)) form.insertAdjacentHTML('afterbegin','<p class="notice error" role="alert">Данные изменились на сервере. Черновик сброшен: проверьте актуальные значения перед сохранением.</p>');
 }
}
export function tomorrow(now = new Date()) {
 const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
