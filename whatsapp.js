// ==UserScript== Обновление: 21 декабря 2021 - Исправлен баг с кнопками для бета-версии

/*
* ОПИСАНИЕ ФУНКЦИОНАЛА
* 1. Открытие нового чата по номеру телефона
* 2. Массовая рассылка сообщений
* 3. ------Добавление кнопок...
* 4. Оповещения, showDocumentComments(), showPopup(url)
* 5. Загрузка выбраных сообщений на unirenter server
* 6. Уведомления о получении новых сообщений
*/

const whatsapp_helper = function () {
    //Версия
    const version = 365;

    console.warn('WhatsApp Helper версия: ' + version);
    console.warn('Обновление: 21 декабря 2021 - Исправлен баг с кнопками для бета-версии');

    console.warn('Обновление: 10 мая 2022 - Скрытие уведомления о доступности новой версии');
    console.warn('Обновление: 10 мая 2022 - Опциональные параметры');
    console.warn('Обновление: 10 мая 2022 - Загрузка всех фотографий из сообщения');
    console.warn('Обновление: 11 мая 2022 - Поправлены окошки');
    console.warn('Обновление: 11 мая 2022 - Сброс XHR при смене диалога');
    console.warn('Обновление: 11 мая 2022 - Закрытия окошка "Неправильный номер" в конце рассылки');
    console.warn('Обновление: 11 мая 2022 - После рассылки открывается номер 7 925 605-02-75');
    console.warn('Обновление: 11 мая 2022 - Обновление окошек при ALT+ANYKEY');
    console.warn('Обновление: 11 мая 2022 - Окошко при CORS ошибке');
    console.warn('Обновление: 11 мая 2022 - Чтение сообщений');
    console.warn('Обновление: 12 мая 2022 - Отлов исходящих сообщений и отправка на сервер');
    console.warn('Обновление: 12 мая 2022 - Функция добавления CSS файлов');

    //Дополнительные параметры URL
    queryArgs['version'] = version;
    let queryArgsString = '';
    for (let arg in queryArgs) {
        queryArgsString += `&${arg}=${queryArgs[arg]}`;
    }

    // ---*** МАССОВАЯ РАССЫЛКА СООБЩЕНИЙ :

    // URL API для получения сообщений
    const massMessagingUrl = 'https://a.unirenter.ru/b24/api/whatsapp.php?do=sendMsg' + queryArgsString;
    // URL API для подтверждения отправки сообщения
    const massMessagingConfirmUrl = 'https://a.unirenter.ru/b24/api/whatsapp.php?do=sendConfirm' + queryArgsString + '&id=';
    // Время задержки перед отправкой текущего сообщения
    const beforeSendMessageDelay = 1500; //3000
    // Время задержки после получения подтверждения о доставке сообщения перед отправкой нового сообщения
    const beforeNextMessageDelay = 4000; //5000
    // Максимальное время ожидания визуального отчета об отправке сообщения в чате
    const waitUntilMessageSentDelay = 5000; //5000
    //Cтатус интервала
    let sendMessageStatus = false;
    //ид интервала для кнопки стоп
    let sendMessageInterval = null;

    // ---*** ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ***---

    // Полифилл Element.matches()
    if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.matchesSelector ||
            Element.prototype.webkitMatchesSelector ||
            Element.prototype.mozMatchesSelector ||
            Element.prototype.msMatchesSelector;
    }

    // Добавление CSS стилей
    function appendStyle(cssRules) {
        var css = document.createElement('style');
        //css.type = 'text/css';
        css.appendChild(document.createTextNode(cssRules));
        document.head.appendChild(css);
    }

    //Добавление CSS файлов
    function appendStyleFile(url){
        $('head').append(`<link href="${url}" rel="stylesheet" />`)
    }
    

    // function for triggering mouse events
    function eventFire(elem, type, centerX, centerY) {
        var evt = document.createEvent('MouseEvents');
        //todo: depricated initMouseEvent
        evt.initMouseEvent(
            type,
            true,
            true,
            window,
            1,
            1,
            1,
            centerX || 0,
            centerY || 0,
            false,
            false,
            false,
            false,
            0,
            elem
        )
        new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true
        });
        elem.dispatchEvent(evt)
    }

    // Функция слежения за изменениями в DOM (внутри target)
    function watchDomMutation(selector, target, callback) {
        var ob = new MutationObserver((mutationsList, observer) => {
            for (let mutation of mutationsList) {
                if (mutation.type != 'childList' || !mutation.addedNodes.length) {
                    continue;
                }
                Array.from(mutation.addedNodes).forEach(function (node) {
                    if (!(node instanceof Element)) {
                        return;
                    }
                    if (node.matches(selector)) {
                        callback(node);
                    }
                });
            }
        });
        ob.observe(target, {
            childList: true,
            subtree: true
        });
    }

    // Функция ожидает появление элемента с selector (внутри target)
    function waitForElement(selector, parent = document) {
        return new Promise(function (resolve) {
            let interval = setInterval(function () {
                const element = parent.querySelector(selector);
                DEBUG_MODE && console.log('CORE_DEBUG_MODE', 'Ожидается:', selector, 'Найдено:', element);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 400);
        });
    }

    // Синхронная функция задержки
    const delay = ms => {
        return new Promise(r => setTimeout(() => r(), ms))
    }

    // ---*** ОБЩИЕ ФУНКЦИИ ***---

    // Функция форматирования текста сообщения
    function formatTextMessage(textMessage) {
        return textMessage.replace(/  /gm, '');
    }

    // Функция форматирования номера телефона
    function formatPhoneNumber(phoneNumber) {
        phoneNumber = phoneNumber.replace(/\D/g, '');
        return phoneNumber.length === 10
            ? '7' + phoneNumber
            : phoneNumber.length === 11
                ? phoneNumber.replace(/^8/g, '7')
                : phoneNumber;
    }

    function isValidPhone(phone) {
        return /^(\+{0,})(\d{0,})([(]{1}\d{1,3}[)]{0,}){0,}(\s?\d+|\+\d{2,3}\s{1}\d+|\d+){1}[\s|-]?\d+([\s|-]?\d+){1,2}(\s){0,}$/.test(phone);
    }

    // Селектор для Текстовой области
    const textareaSelector = '._1UWac._1LbR4'; // Непосредственный родитель у 'div.copyable-text.selectable-text'
    const phoneNumberNotFoundSelector = '._2J8hu'; // Непосредственный родитель у 'div.copyable-text.selectable-text'

    // Функция открытия чата по номеру телефона. Возвращает Promise
    function openChatByPhone(phoneNumber, messageText) {
        var whatsappApiLink = document.getElementById('openChatAPI');
        whatsappApiLink.href = 'https://api.whatsapp.com/send?phone=' + phoneNumber + '&text=' + phoneNumber;
        if ('' != phoneNumber && '' != whatsappApiLink.href) {
            whatsappApiLink.click();
        }
        return new Promise(function (resolve, reject) {
            var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    DEBUG_MODE && console.log('DEBUG_MODE', 'Ожидается:', textareaSelector + ' или ' + phoneNumberNotFoundSelector, 'Найдено:', mutation.target);
                    if (mutation.target.matches(phoneNumberNotFoundSelector) && (mutation.target.textContent.includes('Неверный номер телефона.') || mutation.target.textContent.includes('Номер телефону, надісланий через посилання, неправильний.'))) {
                        observer.disconnect();
                        reject('Неверный номер телефона - ' + phoneNumber);
                    }
                    if (mutation.target.matches(textareaSelector) && mutation.target.textContent.includes(phoneNumber)/*&& mutation.target.textContent*/) {
                        observer.disconnect();
                        let textarea = mutation.target.querySelector('.copyable-text[role="textbox"]');
                        textarea.innerHTML = messageText || '';
                        eventFire(textarea, 'input');
                        resolve(mutation.target.closest('div.copyable-area'));
                    }
                });
            });
            setTimeout(() => {
                let textarea = document.querySelector(textareaSelector);
                console.error(textarea)
                if (textarea.textContent.includes(phoneNumber)) {
                    observer.disconnect();
                    textarea = textarea.querySelector('.copyable-text[role="textbox"]');
                    textarea.innerHTML = messageText || '';
                    eventFire(textarea, 'input');
                    resolve(textarea.closest('div.copyable-area'));
                }
            }, beforeNextMessageDelay)
            observer.observe(document.querySelector('#app'), {
                childList: true,
                subtree: true,
                attributes: true
            });
            setTimeout(() => {
                observer.disconnect()
                reject('Observer timeout - ' + phoneNumber);
            }, beforeNextMessageDelay * 2)
        });
    }

    // ---*** ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ***---

    // ---*** СОБЫТИЯ ***---

    // ОЖИДАНИЕ #app
    var waitForAppInterval = setInterval(function () {
        if ($('#app')[0]) {
            clearInterval(waitForAppInterval);

        }
    }, 200);

    // ОЖИДАНИЕ #side
    var waitForSidebarInterval = setInterval(function () {
        if ($('#side')[0]) {
            clearInterval(waitForSidebarInterval);

            // Проверка актуальности классов
            if (!$('#side').hasClass('_1KDb8')) {
                /**
                 * Селекторы которые необходимо заменить и подсказки где их искать в DOM, можно найти в коде по запрсу "Селектор"
                 * На данный момент их 4 штуки.
                 * Также необходимо заменить имя класса в условии этого условного оператора.
                 */
                console.error('ВНИМАНИЕ: НЕ НАЙДЕНЫ НЕОБХОДИМЫЕ КЛАССЫ! WhatsApp Helper может работать неправильно! Обратитесь в администратору - необходимо изменить Селекторы.');
            }

            // Ширина notify
            appendStyle('.growl.growl-large{width:' + ($('#side').width() - 16) + 'px;}');

            // добавление ссылки для whatsapp api
            $('#app').append('<a href="" id="openChatAPI"></a>');

            // Стили для родительского контейнера для кнопок
            $('#app #side header div:nth-child(2)').css('display', 'contents');

            // добавление кнопок в левый сайдбар
            addOpenChatByPhoneButton();
            addMassMessagingButton();

            // Слехка за поступлением новых ообщений
            watchContactList();
        }
    }, 200);

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 1. Открытие нового чата по номеру телефона
     * --------------------------------------------------------------------------------------------------------------
     */
    // Создание кнопки
    function addOpenChatByPhoneButton() {

        // Добавление CSS стилей
        appendStyle('#openChatButton{cursor:pointer;position:relative;right:12px;}' +
            '#phoneFormContainer{position:absolute;right:50px;top:55px;}' +
            '#phoneFormContainer.open{display:block}' +
            '#phoneFormContainer form{display:flex;box-shadow:0px 0 10px #0d141854;border-radius:5px}' +
            '#phoneFormContainer input{border-radius:5px 0 0 5px;width:150px;height:42px;outline-style:none;border:1px solid #999;padding:5px 8px;font-size:20px;color:#333;box-sizing:border-box;-moz-appearance:textfield;}' +
            '#phoneFormContainer input::-webkit-outer-spin-button,#phoneFormContainer input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}' +
            '#phoneFormContainer input::placeholder{color:#777;font-size:15px;}' +
            '#phoneFormContainer button{background-color:#dcf8c6;border:1px solid #8da57b;height:42px;border-radius:0 5px 5px 0;width:44px;position:relative;right:1px;font-weight:bold;color:#555}' +
            '#phoneFormContainer button:hover{background-color:#ecfbe0;border-color:#999}');
        // Добавление HTML верстки для кнопки с выпадающей формой
        $($('#side header div')[4])
            .prepend('<div id="openChatButton" title="Открыть чат по номеру">' +
                '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAQAAAC0NkA6AAAAAmJLR0QA/4ePzL8AAAOfSURBVFgJ7cFviNaFAQfwzz3P3ZOdnluB2XXkixbRH6FAmmQQ1NHexND8c7FRlpCtzBJhMIJeFLGBZgwcC4LYi3K+CrpUMtiGL45qzGr+uXF3Xs6gsiDrOL3ynlx9o+T4Pc/5eHrns3d9Pn50oZb6lzF7/dz5qOix3aAxYwZt16PiHCr+LCJixBXOZYXDIiIiIt633BR+4h/ipEfN9prYaSolz4o4YIMbzDbbDTY4KGKzkoY67RcfW+R7nb4Q9zm7Z0XVOiW1yh5VFZs0cIkD4j8WmLBafK5TYytE1R0m9OkzoVtVLDPJLH3ioEvV2iV6NVJxWDyiEFFYL4a1qfO0OKJLvS4j4tfO1CMOKClEFMr6xUp1PhC3ONMaccx8k20XG9SKqLVRbFNnXMzSyG7xismGxPVqRdRaKAbVOSyu1ciVRkWPesdFB/pERERERPShQxz3g5LT+nGzRj70WzylCR4XL2tsrvhSvSFxvVoRtRaKQT8oOe11sVSHRpajT713cKep3Im9JtkjHnGmi30g7lWvRxxUVogolPWLlSa5RwxpNdkT4t9K6lW8L9YpRBQeE8PaTNJqSPxGvfmOizucabmo6jahT58J3apimQZWiKPa1XpB7NDYZlG1XlmtssdUxSYNtfin2KJwkRGxVmMlm0X022ihOeZYaKN+EZuUnMUip/zPrQoPimMWOJtlhkVEREQMW2pKz4hD2hV2iH06nE2blbYZcMIJA7ZZqc05VOwXzytcYkDsVNZENzkp1ihc7Zj4ixZN9IAYt1hhiTGxVVNtFZ/oUuh2UvxeE7XZI97WrvBLX4s/aKJ5jog3VBRW+Vr8SYumudpR8apWhbt8JbZp1TQ3GhEvalHoNiZ26TChbLW/OWXAKjOyxJjYotYtPhP7LPC9bvtERMQr5puBX6iK57Qo/MyAOGatnSL+6z5zrDUqPvMrM3C3qnhRWeGnekXEqN+Z5bQr7RbRq9O03e646DVLrdVGveRy9Vb5XIx4yLQtMSJ2a1frIo102SVipy7TdKNPxVs6nY/7fSFG3GyarnFEfGSx89Fph9hr2ubZI8atcT7milEz0GqriOe1O5cN4k0ztMa4OORWU1lsXNxlxm6yX3xji9kau8qn4o8uSMUzTomjHtZmsnmGxBvaXLBF3hZxyDpzFRYYEO/q0BQtVhgUccJf3e86F7vNh+I9l2miVj3+7lsRERF7zPV/cJX1eg076bAnVfzoQnwHXHmKhT4mw9YAAAAASUVORK5CYII=" width="24px" height="24px" style="cursor: pointer">' +
                '</div>' +
                '<div id="phoneFormContainer" hidden>' +
                '<form>' +
                '<input id="phone" type="text" name="phone" placeholder="Введите номер" autocomplete="off">' +
                '<button type="submit">ОК</button>' +
                '</form>' +
                '</div>');
        const input = $('#phoneFormContainer input');
        // Появление формы по клику
        $('#openChatButton').on('click', function () {
            let container = $('#phoneFormContainer');
            container.toggleClass('open');
            if (!container.hasClass('open')) {
                $('#phoneFormContainer input').val('');
            }
        });
        // Обращение к Whatsapp API через клик по ссылке
        $('#phoneFormContainer form').on('submit', function (e) {
            e.preventDefault();
            let phoneNumber = formatPhoneNumber(input.val());
            input.val(phoneNumber);
            if (!phoneNumber) {
                console.error('ОШИБКА: поле ввода номера телефона пустое');
                return;
            }
            let container = $('#phoneFormContainer');
            if (!container.hasClass('open')) {
                container.addClass('open');
            }
            openChatByPhone(phoneNumber);
        });
        // Действие при вставке номера телефона в форму или вне ее
        window.addEventListener('paste', function (e) {
            if (e.clipboardData.getData('text')) {
                e.preventDefault();
                let phoneNumber = formatPhoneNumber(e.clipboardData.getData('text'));
                $('#phoneFormContainer input').val(phoneNumber);
                $('#phoneFormContainer form').submit();
            }
        });
    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 2. Массовая рассылка сообщений
     * --------------------------------------------------------------------------------------------------------------
     */

    let restMessagesCountIndicator;

    // Создание кнопки
    function addMassMessagingButton() {
        // Добавление CSS стилей
        appendStyle('#massMessagingButton{cursor:pointer;position:relative;right:32px;}' +
            '#massMessagingButton.blocked{cursor:progress}' +
            '#massMessagingButton svg{margin-bottom:5px}' +
            '#restMessagesCountIndicator{position:absolute;top:-10px;right:-10px;border-radius:50%;width:10px;height:16px;padding:2px 5px;font-weight:bold;color:#fff;box-shadow:0 0 4px rgba(0,0,0,.4);background-color: var(--unread-marker-background);display:none;}');
        // Добавление HTML верстки для кнопки
        $($('#app #side header div')[4])
            .prepend('<div id="massMessagingButton" title="Автоматическая рассылка">' +
                '<svg width="27px" height="27px" fill="#777" fill-rule="evenodd" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"><path d="m49 125v99c0 3 2 6 5 6h132c2 0 4-3 4-6v-99c0-3-3-6-6-6h-128c-4 0-7 2-7 6zm74 63 44-41 10-9v75c0 3-2 5-3 5h-108c-2 0-4-2-4-5v-75l11 9 44 41c1 1 2 1 3 1s2 0 3-1zm27-41 18-15h-96l18 15 26 24c1 1 3 2 4 2 2 0 3-1 4-2l26-24zm-39-97c0 13-1 40 0 52 0 10 16 12 18 0v-52l18 17c2 3 9 11 16 4 2-1 3-4 3-7 0-5-5-8-10-13l-28-29c-9-8-13-3-20 4l-31 31c-9 9 2 23 13 13 5-4 18-18 21-20zm-111 19v29c0 10 6 14 12 11 8-2 6-11 6-21 3 2 4 4 6 6l6 6c3 2 4 4 6 6 3 3 4 4 9 4 2 0 5-2 6-3 4-4 3-10-2-14-3-4-16-16-17-18 7 0 15 1 19-3 5-6 2-16-8-16h-33c-3 0-6 1-8 3s-2 6-2 10zm208 6c-5 8-22 16-22 27 0 3 4 8 10 8 5 0 8-5 13-10l12-12c0 9-1 18 5 21 8 3 14-2 14-9v-33c0-7-4-11-11-11h-32c-10 0-13 9-10 14 4 7 12 5 21 5z"/></svg>' +
                '<span id="restMessagesCountIndicator"></span>' +
                '</div>');
        // Индикатор колличества сообщений в очереди
        restMessagesCountIndicator = $('#restMessagesCountIndicator');
        // Запуск рассылки
        $('#massMessagingButton').click(() => {
            if (!$('#massMessagingButton').hasClass('blocked')) doMassMessaging();
        });
    }

    // Функция отображения счетчика оставшихся сообщений для рассылки
    function restIndicatorSet(restMessagesCount) {
        if (restMessagesCount) {
            sendMessageStatus = true;
            restMessagesCountIndicator.text(restMessagesCount);
            restMessagesCountIndicator.css('display', 'block');
        } else {
            sendMessageStatus = false;
            restMessagesCountIndicator.css('display', 'none');
        }
    }

    function getImgBlobPng(url) {
        return new Promise(function (resolve) {
            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    var imageUrl = window.URL.createObjectURL(blob);
                    var canvas = document.createElement("canvas");
                    var ctx = canvas.getContext("2d");
                    var imageEl = document.createElement("img");
                    imageEl.src = imageUrl;
                    imageEl.onload = (e) => {
                        canvas.width = e.target.width;
                        canvas.height = e.target.height;
                        ctx.drawImage(e.target, 0, 0, e.target.width, e.target.height);
                        canvas.toBlob(pngBlob => resolve(pngBlob), "image/png", 1);
                    };
                });
        }
        );

    }

    // Функция ожидания визуального отчета об отправке сообщения в чате
    function waitUntilMessageSent() {
        // Предыдущее отправленное сообщение в ленте
        let previousMessage = $('.message-out:last-of-type');

        return new Promise((resolve, reject) => {
            var waitLastMsgInterval = setInterval(() => {
                var lastMessage = $('.message-out:last-of-type');
                if (previousMessage !== lastMessage) {
                    clearInterval(waitLastMsgInterval);
                    var escapeTimeout;
                    var waitCheckIconInterval = setInterval(() => {
                        var iconMsgCheck = $('[data-icon="msg-check"]');
                        var iconMsgDblcheck = $('[data-icon="msg-dblcheck"]');
                        if (iconMsgCheck || iconMsgDblcheck) {
                            clearInterval(waitCheckIconInterval);
                            clearTimeout(escapeTimeout);
                            resolve('отчет получен');
                        }
                    }, 200);
                    escapeTimeout = setTimeout(function () {
                        clearInterval(waitCheckIconInterval);
                        clearTimeout(escapeTimeout);
                        reject('отчет не получен');
                    }, waitUntilMessageSentDelay);
                }
            }, 200);
        });
    }

    let readyForPaste = false;

    function waitForPaste(index, count) {
        readyForPaste = true;
        appendAlerts({
            0: {
                title: 'Вставка изображении (' + index + ' из ' + count + ')',
                msg: 'Нажмите CTRL-V',
                bColor: 'red',
                tColor: 'white'
            }
        }, 'waitctrlv');
        return new Promise((resolve) => {

            function listener(event) {
                if (!readyForPaste) {
                    event.preventDefault();
                    return false;
                } else {
                    readyForPaste = false;
                    document.removeEventListener('paste', listener, true);
                    navigator.clipboard.writeText('');
                    removeAlerts('waitctrlv');
                    resolve();
                }
            }

            document.addEventListener('paste', listener, true);
        });
    }

    // Главная функция рассылки сообщений
    async function doMassMessaging() {
        if (sendMessageStatus === true) {
            return;
        }
        let doPaste = new Event("do_paste", { bubbles: true });
        const massMessagingButton = $('#massMessagingButton');
        massMessagingButton.addClass('blocked');
        DEBUG_MODE && console.log("AUTOSEND: button blocked");

        //Добавляем try catch, чтобы ловить ошибку cors
        try {
            let response = await fetch(massMessagingUrl);
            DEBUG_MODE && console.log("AUTOSEND: API response received");
            let data = await response.json();
            DEBUG_MODE && console.log("AUTOSEND: JSON acquired");

            if (!data.msg || Object.keys(data.msg).length === 0) {
                if (!data.msg) console.error('ОШИБКА: неверный формат ответа сервера');
                else console.warn('Сообщений для рассылки нет');
                massMessagingButton.removeClass('blocked');
                return;
            } else {
                var restMessagesCount = Object.keys(data.msg).length;
                restIndicatorSet(restMessagesCount);
                DEBUG_MODE && console.log(`AUTOSEND: ${restMessagesCount} messages ready`);
            }
            let errorsCount = 0,
                sentCount = 0;
            for (let key in data.msg) {
                let phoneNumber = formatPhoneNumber(data.msg[key].phone),
                    messageText = formatTextMessage(data.msg[key].msgText);
                try {
                    // Открытие окна чата
                    let messageBox = await openChatByPhone(phoneNumber, messageText);
                    DEBUG_MODE && console.warn('Message box ready')
                    DEBUG_MODE && console.log(messageBox)
                    /* Эмуляция наличия изображений для тестов
                    var imgs = [
                        'https://image.freepik.com/free-vector/the-scheme-of-data-transmission-isometric-secure-connection-cloud-computing-server-room-datacent_39422-875.jpg',
                        'https://image.freepik.com/free-photo/product-presentation-podium-minimal-design-with-a-light-pink-color-background-3d-rendering_41470-4006.jpg'
                    ];
                    if('79259336744' === key){
                        data.msg[key].img = imgs;
                    }*/
                    let buttonSend;
                    if (data.msg[key].hasOwnProperty('img')) {

                        let count = data.msg[key]['img'].length;
                        let index = 0;
                        let input;
                        for (const url of data.msg[key]['img']) {

                            // Вставка изображний
                            let pngBlob = await getImgBlobPng(url);

                            await navigator.clipboard.write([
                                new ClipboardItem({
                                    [pngBlob.type]: pngBlob
                                })
                            ]);

                            input = input || await waitForElement(textareaSelector + ' div.copyable-text.selectable-text[data-tab="6"]');

                            setTimeout(function () {
                                document.dispatchEvent(doPaste);
                            }, 200);

                            await waitForPaste(++index, count);
                        }
                        buttonSend = await waitForElement('span[data-icon="send"]'); // '._19dz5 span[data-icon="send"]'
                    } else {
                        buttonSend = messageBox.querySelector('span[data-icon="send"]');
                    }
                    await delay(beforeSendMessageDelay);
                    // Отправка сообщения
                    eventFire(buttonSend, 'click');
                    DEBUG_MODE && console.log("AUTOSEND: send button clicked");
                    // Отправка отчета о рассылке на Unirenter
                    fetch(massMessagingConfirmUrl + key + '&status=3');
                    DEBUG_MODE && console.log("AUTOSEND: report sent to Unirenter");
                    // Включение механизма ожидания визуального отчета об отправке сообщения в чате
                    let sendingStatus = '';
                    try {
                        sendingStatus = await waitUntilMessageSent();
                    } catch (e) {
                        sendingStatus = e;
                    }
                    sentCount++;
                    console.info('ОТПРАВЛЕНО: ' + phoneNumber + ' - "' + messageText.slice(0, 50) + '" (' + sendingStatus + ')');
                } catch (error) {
                    errorsCount++;
                    fetch(massMessagingConfirmUrl + key + '&status=6');
                    console.error('ОШИБКА: ' + error);
                } finally {
                    // Отправляем ещё, если задержка не равна 0
                    // Задержка перед переходом к следующему сообщению
                    await delay(beforeNextMessageDelay);
                    restIndicatorSet(--restMessagesCount);
                    DEBUG_MODE && console.log(`AUTOSEND: ${restMessagesCount} messages left to send`);
                }
            }
            //Удаляем окно "неверный номер", если оно существует
            if ($('._20C5O._2Zdgs').length) {
                $('._20C5O._2Zdgs').click();
            }
            massMessagingButton.removeClass('blocked');
            console.warn('ГОТОВО. Ошибок: ' + errorsCount + ' Отправлено: ' + sentCount);

            openChatByPhone('7 925 605-02-75');
        } catch (e) {
            showCorsError();
            return;
        }
    }

    //Авторассылка сообщений
    $(document).ready(() => {
        //Удаляем окошко "Обновить"
        //Делаем интервал и проверяем, существует ли окошко с обновлением
        setInterval(() => {
            $('._3z9_h').remove();
        }, 1000);

        if (autoMessageDelay != 0)
            sendMessageInterval = setInterval(doMassMessaging, autoMessageDelay * 1000);

        //Добавляем стили
        appendStyleFile('https://raw.githubusercontent.com/urtvs/tempermonkey/main/whatsapp/whatsapp_style.css');
    })


    /**
     * --------------------------------------------------------------------------------------------------------------
     * 3. ------Добавление кнопок...
     * --------------------------------------------------------------------------------------------------------------
     */
    var waitTime2 = 1000;
    var openTel = '';
    var el_ = null;

    var interval2 = setInterval(function () {
        if (void 0 != document.querySelector('#side') && void 0 == document.querySelector('#addUnirenter')) {

            //Меняем значок поиска на копирование
            var parent2 = document.querySelectorAll('#main header > div');
            var number2 = document.querySelector('._21nHd span').textContent.replace(/[\D]/gi, '');
            if (parent2 && parent2[2]) {
                var title2 = parent2[1].querySelector('span[dir="auto"]');
                parent2 = parent2[2].querySelector('div');
                var button2 = document.createElement('img');
                button2.id = 'addUnirenter';
                button2.style = 'height:24px; padding:8px; cursor:pointer;';
                button2.onclick = function () {
                    if(!number2){
                        return;
                    }
                    navigator.clipboard.writeText(number2)
                    .then(() => {
                        console.log('Скопирован номер');
                    });

                };
                button2.src = 'https://a.unirenter.ru/b24/img/icons8-copy-24.png';
                parent2.insertAdjacentElement('afterbegin', button2);
                // --- notify. Добавленно в версии 3
                // addNotifyForWhatsappButton(parent2);
                // Кнопка перехода sip:
                var button3 = document.createElement('img');
                button3.id = 'addUnirenter';
                button3.style = 'height:24px; padding:8px; cursor:pointer;';
                button3.onclick = function () {
                    window.location.href = `sip://${number2}`;
                };
                button3.src = 'https://a.unirenter.ru/b24/img/call.png';
                parent2.insertAdjacentElement('afterbegin', button3);
                addNotifyForWhatsappButton(parent2);
                // ---
            }

            //if (void 0 != document.querySelector('#addUnirenter')) clearInterval(interval);
        }
    }, waitTime2);

    document.body.addEventListener('DOMSubtreeModified', function (e) {
        if (e.target.querySelector) {
            var tel = e.target.querySelector('span[dir="auto"].selectable-text.invisible-space.copyable-text:last-child > span');
            if (tel && tel.innerText) {
                openTel = tel.innerText;
                el_ = e.target.querySelector('span[data-icon="x"]');
            }
        }
    });

    // delegate
    function on(elSelector, eventName, selector, fn) {
        var element = document.querySelector(elSelector);
        element.addEventListener(eventName, function (event) {
            if (event.target.matches(selector)) {
                DEBUG_MODE && console.log('DEBUG_MODE', 'Event ' + eventName + ' on ' + selector, event.target);
                return fn(event);
            }
        });
    }

    // get request
    function getReq(url) {
        var i = document.createElement('img');
        i.onload = function () {
            i.remove();
        };
        i.onerror = function (e) {
            i.remove();
        };
        i.src = url;
        document.body.appendChild(i);
    }

    $('body').on('click', function (e) {
        if($(e.target).hasClass('epia9gcq')){
            apiLogActionSendMsg();
        }
    });

    $('body').on('keyup', 'div[contenteditable="true"]', function (e) {
        if (e.key == 'Enter'){
            apiLogActionSendMsg();
        }
    });

    // Отпаравка факта отправки сообщения на api/userAction.php
    function apiLogActionSendMsg() {
        var parent2 = document.querySelectorAll('#main header > div');
        if (!parent2 || !parent2[2]){
            return;
        }
        var title2 = parent2[1].querySelector('span[dir="auto"]');
        let url = 'https://a.unirenter.ru/b24/api/userAction.php?source=whats&action=sendMsg&contact=' + encodeURIComponent(title2.innerText) + queryArgsString;
        let text = document.querySelector('._1UWac._1LbR4 ._13NKt').textContent;
        if(!text){
            text = $('._3K4-L > div:last-child span[dir="ltr"]').text();
        }
        try {
            fetch(url, {
                method: 'post',
                body: JSON.stringify({
                    message: text
                })
            });
        } catch (e) {
            showCorsError();
            return;
        }
    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 4. Оповещения, showDocumentComments(), showPopup()
     * --------------------------------------------------------------------------------------------------------------
     */

    var notifyUrl = 'https://a.unirenter.ru//b24/api/notifyService.php?do=notifyWhatsapp' + queryArgsString;
    //notifyUrl = notifyUrl.replace('&dev=2', '');

    //var notifyPhone = null;
    var urlContactParams = null;

    var notifyInterval;
    watchDomMutation('#main', document.body, function (divMAin) {
        let notifyPhoneOrContactText = divMAin.querySelector('header span[dir=auto]').innerText;
        urlContactParamsNew = isValidPhone(notifyPhoneOrContactText)
            ? ('&phone=' + notifyPhoneOrContactText.replace(/[\D]/gi, ''))
            : ('&contact=' + notifyPhoneOrContactText);

        if (urlContactParamsNew !== urlContactParams) {
            clearInterval(notifyInterval);
            isShowAlerts('notify') && removeAlerts('notify');
            window.growls['notify'] = {};
            urlContactParams = urlContactParamsNew;
            setTimeout(() => {
                reloadAlerts(notifyUrl + urlContactParamsNew, 'notify');
            }, 300);
            notifyInterval = setInterval(function () {
                getAlerts(notifyUrl + urlContactParamsNew, function (alerts) {
                    appendAlerts(alerts, 'notify');
                })
            }, 3000);
        }
    });

    function addNotifyForWhatsappButton(parent) {
        var button3 = document.createElement('img');
        button3.id = 'notifyUnirenter';
        button3.style = 'height:24px; padding:8px; cursor:pointer;';
        button3.src = 'https://a.unirenter.ru/b24/img/alert.png';
        button3.title = 'Получить оповещения';
        button3.addEventListener('click', () => {
            reloadAlerts(notifyUrl + urlContactParamsNew, 'notify');
        });
        parent.insertAdjacentElement('afterbegin', button3);
    }

    window.showDocumentComments = function (param, eventTarget) {
        var notifyId = eventTarget.closest('div.growl[data-notify-id]').dataset.notifyId;
        var confirmUrl = notifyUrl + param + '&id=' + notifyId + urlContactParamsNew;

        DEBUG_MODE && console.log('Do query to confirmUrl', confirmUrl);

        fetch(confirmUrl).then(() => {
            removeAlert('notify', notifyId);
            getAlerts(notifyUrl + urlContactParamsNew, function (alerts) {
                appendAlerts(alerts, 'notify');
            })
        });
    }

    /*
    * ----------------------------- Popup
    */
    appendStyle('#popup_window {width:80%;height:80%;position:relative;z-index:100;margin:auto;margin-top:5%;}' +
        '#popup_window > * {padding:12px 8px}' +
        '#popup_window header {background-color:rgba(99,99,99,.2)}' +
        '#popup_window header h4 {font-weight:bold;font-size:20px;margin:0;padding:0}' +
        '#popup_window header span#btn1221 {padding:5px 10px;float:right;border-radius:4px;background-color:#882c2c;font-size:15px;margin:-1px 5px 0;cursor:pointer;color:#fff}');

    window.popupIsLoading = false;
    window.showPopup = async (url) => {
        url += '&version=' + version + '&ah=' + hash + '&userID=' + userID + '&phoneID=' + phoneID;
        if (popupIsLoading) return false;
        popupIsLoading = true;
        let alreadyPopup = document.getElementById('popup_window');
        if (alreadyPopup) closePopup(alreadyPopup);
        DEBUG_MODE && console.log('Query URL: ', url);
        let data = await fetch(url).then(response => response.json());
        DEBUG_MODE && console.log('Data: ', data);
        if (data && data.hasOwnProperty('msg')) {
            const chatMessagesWrapper = $('#main');
            let k = Object.keys(data.msg)[0];
            let message = data.msg[k];
            const popup = $('<div id="popup_window" style="background-color:' + message.bColor + '">' +
                '<header>' +
                '<span id="btn1221" onclick="closePopup(this)">Закрыть</span>' +
                '<h4 style="color:' + message.tColor + '">' + message.title + '</h4>' +
                '</header>' +
                '<div style="color:' + message.tColor + '">' + message.msg + '</div>' +
                '</div>');
            chatMessagesWrapper.append(popup);
            popupIsLoading = false;
        }
    }

    window.closePopup = (element) => {
        (element.id === 'popup_window' ? element : element.closest('div#popup_window')).remove();
    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 5. Загрузка выбраных сообщений на unirenter server
     * --------------------------------------------------------------------------------------------------------------
     */

    var uploadToServerButton = document.createElement('button');
    uploadToServerButton.title = 'Отправить на сервер';
    uploadToServerButton.innerHTML = '<span data-testid="star-btn" data-icon="star-btn" class="">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="24" height="24" fill-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" viewBox="0 0 640 640" xmlns:v="https://vecta.io/nano"><path d="M434 192L324 57c-1-1-2-2-4-2-1 0-3 1-4 2L206 192c-1 1-1 3 0 5 0 2 2 3 4 3h40v114c0 3 2 6 5 6h130c3 0 5-3 5-6V200h40c2 0 4-1 5-3s1-4-1-5zm108 228c-9 0-17 8-17 17 0 10 8 18 17 18 10 0 18-8 18-18 0-9-8-17-18-17zm81-45c0-1 0-1-1-2h-1c-2-3-4-5-6-6l-93-90c-11-11-24-17-37-17h-70c-6 0-10 4-10 10s4 10 10 10h70c10 0 19 7 24 11l60 59H71l60-59c5-4 14-11 24-11h70c5 0 10-4 10-10s-5-10-10-10h-70c-13 0-26 6-38 17l-91 89c-3 2-6 4-8 7-11 13-18 29-18 47v35c0 38 31 70 70 70h500c38 0 70-32 70-70v-35c0-17-6-33-17-45zM83 460c-13 0-23-10-23-23 0-12 10-22 23-22 12 0 22 10 22 22 0 13-10 23-22 23zm477 5H410c-11 0-20-9-20-20v-15c0-11 9-20 20-20h150c11 0 20 9 20 20v15c0 11-9 20-20 20z"/></svg>' +
        '</span>';

    var messagesRegion;

    function makeBase64Image(img, maxWidth) {
        var w, h;
        if (img.naturalWidth > maxWidth) {
            w = maxWidth;
            h = (img.naturalHeight * maxWidth) / img.naturalWidth;
        } else {
            w = img.naturalWidth;
            h = img.naturalHeight;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg');
    }

    uploadToServerButton.onclick = function () {

        var user = document.querySelector('#main header span[dir=auto]').textContent;

        var selectedMessages = [];

        var messageSelectionIndicators = messagesRegion.querySelectorAll('div[tabindex] > span > div');

        messageSelectionIndicators.forEach(async function (indicator) {

            if (getComputedStyle(indicator.lastChild.lastChild.lastChild).opacity === '1') {
                // Альтернативное условие: getComputedStyle(indicator).backgroundColor !== 'rgba(0, 0, 0, 0)'

                var messageContainer = indicator.parentNode.parentNode;
                var combinedMessage = messageContainer.querySelector('div.copyable-text');
                var time, date = '', images = [], text = '';

                if (combinedMessage) {
                    var info = combinedMessage.dataset.prePlainText.replace('[', '').replace(': ', '').replace(']', ',').split(', ');
                    time = info[0];
                    date = info[1];
                    text = combinedMessage.querySelector('span.copyable-text').textContent;
                } else {
                    messageContainer.querySelectorAll('span[dir=auto]').forEach(function (info) {
                        if (/^[0-9]{2}:[0-9]{2}$/.test(info.innerText)) {
                            time = info.innerText;
                        }
                    });
                }

                //UPD 10.05.2022
                //Если изображений меньше 4, то просто получаем и отправляем.
                //Если больше (есть кнопка "Ещё"), то открываем их, пролистываем и тогда отправляем
                var lasImgParent = null;
                if (messageContainer.querySelector('.VWPRY') === null) {
                    messageContainer.querySelectorAll('img').forEach(function (img) {
                        if (!img.classList.contains('emoji') && img.src.indexOf('blob') == 0) {
                            if (!lasImgParent || (lasImgParent !== img.parentNode.parentNode)) {
                                lasImgParent = img.parentNode.parentNode;
                                images.push(makeBase64Image(img));
                            }
                        }
                    });
                } else {
                    let imageElements = messageContainer.querySelectorAll('img');
                    let lastElement = imageElements[imageElements.length - 1];
                    lastElement.click();

                    await delay(1000);

                    let imageSlidesBlock = document.querySelector('._1XWMx');
                    let imageSlides = imageSlidesBlock.querySelectorAll('.zm1kZ');

                    for (let slideContent of imageSlides) {
                        slideContent.querySelectorAll('.zm1kZ._1uBVh._8KUDv .GfgP-')[1].click();
                        await delay(1000);

                        let imageBlock = document.querySelector('._2E0wf');
                        images.push(makeBase64Image(imageBlock.querySelector('img')));
                    }
                }
                document.querySelector('._2OBzR [data-testid="x-viewer"]').click();

                selectedMessages.push({
                    'time': time,
                    'date': date,
                    'user': user,
                    'images': images,
                    'text': text
                });
            }

        });

        DEBUG_MODE && console.log('Массив данных:', selectedMessages);
        // DEBUG_MODE && console.log('JSON:', JSON.stringify(selectedMessages));

        fetch('https://a.unirenter.ru/b24/api/whatsapp.php?do=upload' + queryArgsString, {
            method: 'post',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(selectedMessages)
        }).then(res => res.json())
            .then(res => console.log(res));

    }

    watchDomMutation('#main footer + span > div', document, messagesSelectPanel => {
        messagesRegion = document.querySelector('#main div[role=region]');

        var exampleButton = messagesSelectPanel.childNodes[2];
        uploadToServerButton.className = exampleButton.className;
        uploadToServerButton.disabled = exampleButton.disabled;

        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type == "attributes") {
                    uploadToServerButton.disabled = exampleButton.disabled;
                }
            });
        });

        observer.observe(exampleButton, {
            attributes: true
        });

        messagesSelectPanel.childNodes[1].after(uploadToServerButton);
    });

    /**
     * --------------------------------------------------------------------------------------------------------------
     * 6. Уведомления о получении новых сообщений
     * --------------------------------------------------------------------------------------------------------------
     */

    function watchContactList() {

        // Селектор для Каждого Контакта из списка в бововой панели
        const contactNodeSelector = '._3m_Xw';
        // Селектор индикатора новых оповещений
        const noticeIndicatorSelector = '._1pJ9J'; // contactNodeSelector + ' ' + 'div[role="gridcell"][aria-colindex="1"] > span > div'
        // Селектор внутреннего span индикатора новых оповещений
        const noticeIndicatorSelectorSpan = '._1pJ9J'; // noticeIndicatorSelector + ' > ' + 'span[aria-label]'

        const contactsUnreadCount = {};


        function updateMsgCount(noticeIndicator) {
            let contactNode = noticeIndicator.closest(contactNodeSelector);
            DEBUG_MODE && console.log('DEBUG_MODE: contactNode: ', contactNode);

            let contactPhoneOrName = contactNode.querySelector('div[role="gridcell"][aria-colindex="2"] div:first-child').textContent;
            DEBUG_MODE && console.log('DEBUG_MODE: Номер телефона или имя контакта: ', contactPhoneOrName);

            let urlContactParams = isValidPhone(contactPhoneOrName)
                ? ('&phone=' + contactPhoneOrName.replace(/[\D]/gi, ''))
                : ('&contact=' + contactPhoneOrName);
            let messagesCount = noticeIndicator.textContent || 0;

            if (!contactsUnreadCount.hasOwnProperty(contactPhoneOrName) ||
                (contactsUnreadCount.hasOwnProperty(contactPhoneOrName) &&
                    contactsUnreadCount[contactPhoneOrName] < messagesCount)) {
                DEBUG_MODE && console.log('messagesCount', messagesCount);
                let url = 'https://a.unirenter.ru/b24/api/whatsapp.php?do=whatsappIncomeMsg&version='
                    + queryArgsString
                    + urlContactParams;
                
                let text = contactNode.querySelector('[dir="ltr"]').textContent;

                try {
                    fetch(url, {
                        method: 'post',
                        body: JSON.stringify({message: text})
                    });
                } catch (e) {
                    showCorsError();
                    return;
                }
            }
            contactsUnreadCount[contactPhoneOrName] = messagesCount;
        }

        var ob = new MutationObserver((mutationsList, observer) => {
            for (let mutation of mutationsList) {

                if (mutation.type !== 'childList' && mutation.type !== 'characterData') {
                    continue;
                }

                switch (mutation.type) {
                    case 'childList':
                        let indicator = mutation.target.querySelector('.' + noticeIndicatorSelectorSpan)
                        DEBUG_MODE && console.log('DEBUG_MODE indicatorNode: ', indicator);
                        if (indicator) {
                            DEBUG_MODE && console.log('DEBUG_MODE: Появление индикатора', indicator)
                            updateMsgCount(indicator);
                        } else if (mutation.removedNodes.length) {
                            Array.from(mutation.removedNodes).forEach((node) => {
                                if (!(node instanceof Element)) {
                                    return;
                                }
                                if (node.matches(noticeIndicatorSelector)) {
                                    DEBUG_MODE && console.log('DEBUG_MODE: Прочитано', mutation.target)
                                    updateMsgCount(mutation.target);
                                }
                            });
                        }
                        break;
                    case 'characterData':
                        let indexOf = mutation.target.parentNode.parentNode.parentNode.innerHTML.indexOf(noticeIndicatorSelectorSpan.replace('.', ''));
                        if (indexOf != -1) {
                            DEBUG_MODE && console.log('DEBUG_MODE: Изменение количества оповещений', mutation.target.parentNode.parentNode.parentNode)
                            updateMsgCount(mutation.target.parentNode.parentNode.parentNode);
                        }
                        break;
                }
            }
        });
        ob.observe(document.querySelector('#pane-side'), {
            childList: true,
            subtree: true,
            characterData: true
        });

    }

    /**
     * --------------------------------------------------------------------------------------------------------------
     * Инструменты, плагины
     * --------------------------------------------------------------------------------------------------------------
     */

    /*
    * ----------------------------- Alerts
    */

    appendStyle('#growls-br{z-index:16000;position:fixed;bottom:10px;left:0px}' +
        '.growl{opacity:1;position:relative;border-radius:4px;-webkit-transition:all .4s ease-in-out;-moz-transition:all .4s ease-in-out;transition:all .4s ease-in-out}' +
        '.growl:hover{opacity:1;}' +
        '.growl.growl-incoming{opacity:0}' +
        '.growl.growl-outgoing{opacity:0}' +
        '.growl.growl-large{min-width:330px;padding:0;margin:5px 0px 0 10px}' +
        '.growl.growl-default{color:#fff;background:#535C69;box-shadow: 0 0 3px 1px rgba(255,255,255,.2);overflow:hidden}' +
        '.growl .growl-close{cursor:pointer;float:right;font-size:18px;line-height:17px;font-weight:bold;font-family:helvetica,verdana,sans-serif;width:19px;padding-top:1px;text-align:center;vertical-align:text-top;display:inline-block;color:#d8ff00;border-radius:50%;margin:2px 3px;background:#00000054; mix-blend-mode:overlay;border:.5px solid #00000008;}' +
        '.growl .growl-close:hover{mix-blend-mode:difference;}' +
        '.growl .growl-title{font-size:13px;line-height:1.1;font-weight:bold;text-transform:uppercase;background-color:#ffffff30;padding: 6px 15px 3px 8px;border-bottom: 1px solid #ffffff17;box-shadow:0 2px 9px 1px #8a8a8a40;}' +
        '.close-all-alerts{display:none;margin-left:auto;padding: 5px 9px;color:#fff;border:none;background-color:#535C69;border-radius:4px;cursor:pointer;opacity:.8;transition:opacity .5s}' +
        '.close-all-alerts:hover{opacity:1}' +
        '.growl .growl-message{padding:4px 10px 7px;line-height:1.1;}' +
        '.growl .growl-message span{cursor:pointer}' +
        '#growls-br a:hover,#growls-br *[onclick]:hover{text-decoration:underline}');

    var closeAllBtn = null;
    growls = {};

    //Дополнительный аргумент postData - в случае комбинации alt+anykey
    //Переписал XHR на FETCH, т.к. появилась проблема с обработкой ошибок
    async function getAlerts(url, callback, postData = {}) {
        let requestBody = {};
        if(!postData.type){
            requestBody.method = 'get';
        }else{
            requestBody.method = 'post';
            requestBody.body = postData.body;
        }

        try {
            let response = await fetch(url + queryArgsString, {
                requestBody
            });
            let responseJSON = await response.json();
            callback(responseJSON.results.notifyWhatsapp.result);
        } catch (e) {
            showCorsError();
            return;
        }
    }

    function showAlerts(url, alertsType, postData = {}) {
        alertsTicking[alertsType] = true;
        getAlerts(url,
            function (alerts) {
                appendAlerts(alerts, alertsType);
                alertsTicking[alertsType] = false;
            },
            postData
        );
    }

    function isShowAlerts(alertsType) {
        return typeof window.growls[alertsType] !== 'undefined' && window.growls[alertsType] !== {};
    }

    var alertsTicking = [];

    function reloadAlerts(url, alertsType, postData = {}) {
        if (!alertsTicking[alertsType]) {
            isShowAlerts(alertsType) && removeAlerts(alertsType);
            window.growls[alertsType] = {};
            showAlerts(url, alertsType, postData);
        }
    }

    function appendAlerts(alerts = {}, alertsType) {

        if (typeof window.growls[alertsType] === 'undefined')
            window.growls[alertsType] = {};

        for (var index in alerts) {
            if (alertsType === 'notify' && typeof window.growls['notify'][index] !== 'undefined')
                continue;
            if (typeof window.growls[alertsType][index] !== 'undefined') {
                window.growls[alertsType][index].remove();
            }
            window.growls[alertsType][index] = $.growl({
                title: alerts[index].title,
                message: alerts[index].msg,
                location: 'br',
                size: 'large',
                fixed: true,
                delayOnHover: false
            });
            if (typeof alerts[index].attr !== 'undefined') {
                window.growls[alertsType][index]['$_growl'][0].setAttribute(alerts[index].attr[0], alerts[index].attr[1])
            }
            window.growls[alertsType][index]['$_growl'][0].style.backgroundColor = alerts[index].bColor;
            window.growls[alertsType][index]['$_growl'][0].style.color = alerts[index].tColor;
            window.growls[alertsType][index]['$_growl'][0].dataset.notifyId = index;
        }
        if (countAlerts() > 1 && !closeAllBtn) {
            var growls = document.getElementById('growls-br');
            closeAllBtn = document.createElement("button");
            closeAllBtn.setAttribute('title', 'Закрыть все');
            closeAllBtn.addEventListener("click", function () {
                for (var alertsType in window.growls) {
                    removeAlerts(alertsType);
                }
            }, false);
            closeAllBtn.innerHTML = 'X';
            closeAllBtn.classList.add('close-all-alerts');
            closeAllBtn.style.display = 'block';
            growls.prepend(closeAllBtn);
        }
        if (document.getElementById('growls-br')) {
            var observeComments = new MutationObserver(function () {
                if (closeAllBtn) {
                    closeAllBtn.style.display = document.querySelectorAll('#growls-br .growl').length > 1 ? 'block' : 'none';
                }
            });
            observeComments.observe(document.getElementById('growls-br'), {
                childList: true,
                subtree: true
            })
        }
    }

    function countAlerts() {
        if (typeof window.growls !== 'object' || window.growls === null) {
            return 0;
        }
        var count = 0;
        for (var aType in window.growls) {

            count += Object.keys(window.growls[aType]).length
        }
        return count;
    }

    function removeAlerts(alertsType) {
        for (let alertId in window.growls[alertsType]) {
            removeAlert(alertsType, alertId);
        }
    }

    function removeAlert(alertsType, alertId) {
        if (window.growls[alertsType].hasOwnProperty(alertId)) {
            window.growls[alertsType][alertId].remove();
        }
    }

    //Слушаем нажатие клавиш
    let altPress = false;
    window.addEventListener('keyup', e => {
        if (e.code == 'AltLeft' || e.code == 'AltRight') {
            altPress = false;
        }
    });
    window.addEventListener('keydown', e => {
        let key = '';
        if (e.code == 'AltLeft' || e.code == 'AltRight') {
            altPress = true;
            return;
        }

        if(altPress === false){
            return;
        }

        let notifyPhoneOrContactText = document.querySelector('header span[dir=auto]').innerText;
        let urlContactParamsNew;
        urlContactParamsNew = isValidPhone(notifyPhoneOrContactText)
            ? ('&phone=' + notifyPhoneOrContactText.replace(/[\D]/gi, ''))
            : ('&contact=' + notifyPhoneOrContactText);

        key = e.code.replace('Key', '').replace('Digit', '').replace('Numpad', '');

        navigator.clipboard.readText()
            .then(text => {
                reloadAlerts(
                    notifyUrl + urlContactParamsNew + '&keypress=alt+' + key,
                    'notify',
                    {
                        type: 'POST',
                        body: JSON.stringify({
                            buffer: text
                        })
                    });
            })
            .catch(err => {
                // возможно, пользователь не дал разрешение на чтение данных из буфера обмена
                console.log('Something went wrong', err);
            });
    });

    //Окошко ошибки CORS
    function showCorsError() {
        // removeAlerts('notify');
        clearInterval(sendMessageInterval);
        appendAlerts(
            {
                corsError: {
                    title: 'ПРОБЛЕМА ОКОШКИ',
                    msg: `Нажмите CTRL + SHIFT + R и включите расширения. <br>
                            <a href="https://a.unirenter.ru/b24/r.php?l=std&q=511" target="_blank">Подробней</a>`,
                    bColor: '#e6005c',
                    tColor: '#ffffff'
                }
            },
            'notify'
        );
    }

    //Delete update message
    //watchDomMutation('span._3z9_h', document.body, (node) => {node.remove()})
} 