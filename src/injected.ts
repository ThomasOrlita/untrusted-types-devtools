import { defaultSettings } from './helpers/chromeSettings';

const settingsUrl = chrome.runtime.getURL('settings.json');
var request = new XMLHttpRequest();
request.open('GET', settingsUrl, false);
request.send(null);
const settings = request.responseText || defaultSettings;

export default /*javascript*/ `
{
    // send message to the devtools panel
    const sendMessage = (type, value) => {
        window.postMessage({
            untrustedTypes: true,
            type,
            value
        }, '*');
    };

    let settings = ${settings};

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message.untrustedTypes) return;
        if (message.type === 'settingsChanged') {
            settings = message.value;
        }
    });
    sendMessage('getSettings');


    let index = 0;
    let _open = open;
    open = function () {
        log(arguments[0], 0, 'Window open');
        _open.apply(window, arguments);
    };
    const scopeId = Math.random().toString(36).substr(2, 2);
    function log(input, type, sink) {
        // normalize input
        input ??= '';
        input = String(input);

        const openGroup = () => {
            if (index === 0 && settings.groupMessagesInConsole) {
                if (top === self) {
                    console.groupCollapsed('[#' + scopeId + '-*] Untrusted Types: ' + location.href);
                }
            }
        };

        const stackId = scopeId + '-' + index + '-' + Math.random().toString(36).substr(2, 5);
        const errorStack = new Error().stack;

        let highlightedInput = input;
        let important = false;
        const extraArgs = [];
        for (const keyword of settings.keywords) {
            if (keyword.length > 1 && input.includes(keyword)) {
                highlightedInput = highlightedInput.replaceAll(keyword, '%c$&%c');
                important = true;
                for (let i = 0; i < input.split(keyword).length - 1; i++) {
                    extraArgs.push('color: red; border: 1px dotted red; background: yellow;');
                    extraArgs.push('color: unset; border: reset; background: unset;');
                }
            }
        }

        if (important) {
            const args = [
                '#' + stackId + ' ' + location.href + '\\n%c' + sink + '\\n%c' + highlightedInput,
                'background: red; color: white; font-size: 16px',
                'background: unset; color: unset; font-size: unset;',
                ...extraArgs
            ];

            openGroup();
            sendMessage('sinkFound', { href: location.href, sink, input, stack: errorStack, stackId });
            index++;
            console.trace(...args);

        } else if (!settings.onlyLogHighlighted) {
            const stackTraceSplit = errorStack.split('\\n');

            if (settings.traceLimit && stackTraceSplit.length > settings.traceLimit) return input;

            let ignored = false;
            for (const ignoredSource of settings.ignored) {
                if (ignoredSource.length > 1 && errorStack.includes(ignoredSource)) {
                    ignored = true;
                    break;
                }
            }

            const stackTraceLastLine = stackTraceSplit[stackTraceSplit.length - 1];
            for (const ignoredSourceIfFirst of settings.ignoredIfFirst) {
                if (ignoredSourceIfFirst.length > 1 && stackTraceLastLine.includes(ignoredSourceIfFirst)) {
                    ignored = true;
                    break;
                }
            }

            if (!ignored) {
                openGroup();
                console.trace('#' + stackId + ' ' + location.href + '\\n%c' + sink, 'background: #222; color: #bada55; font-size: 16px', '\\n' + input);
                sendMessage('sinkFound', { href: location.href, sink, input, stack: errorStack, stackId });
                index++;
            }
        }
        return input;
    }

    let trustedTypesEnabled;
    if (!trustedTypes.defaultPolicy) {
        trustedTypes.createPolicy('default', {
            createHTML: log,
            createScript: log,
            createScriptURL: log
        });
        trustedTypesEnabled = false;
    } else {
        console.warn('One or more documents are using Trusted Types. Untrusted Types is disabled.');
        trustedTypesEnabled = true;
    }
    if (top === self) {
        console.groupEnd();
        sendMessage('pageNavigation', { href: location.href, trustedTypesEnabled });
    }
}
//@ sourceURL=UNTRUSTED_TYPES_CHECK_STACK_BELOW
`;