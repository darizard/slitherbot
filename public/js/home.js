async function copyAlertsUrlToClipboard() {

    const textToCopy = document.getElementById('alerts-url-field').value;
    await copyTextToClipboard(textToCopy);

}

async function copyTextToClipboard(text) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}