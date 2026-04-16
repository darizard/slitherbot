document.addEventListener('DOMContentLoaded', initializeAlertsBox);
document.querySelector('#alert-preview-btn').addEventListener('click', previewAlert);
document.querySelector('#copy-alerts-url-btn').addEventListener('click', copyAlertsUrlToClipboard);
document.querySelector('#image-file-input').addEventListener('change', changeAlertImage);

async function copyAlertsUrlToClipboard() {

    const textToCopy = document.querySelector('#alerts-url-field').value;
    await copyTextToClipboard(textToCopy);

    document.querySelector('#copy-alerts-url-btn').blur();

}

async function copyTextToClipboard(text) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}

async function previewAlert() {

    

}

function initializeAlertsBox() {

    const categoriesContainer = document.querySelector('#alerts-categories-container');
    const alertsMap = new Map(alerts);
    
    alertsMap.keys().forEach((key) => {

        const categoryDiv = document.createElement("div");
        categoryDiv.classList.add('alerts-category-btn');
        categoryDiv.textContent = key;
        categoriesContainer.appendChild(categoryDiv);

    });

    loadAlertDetails(alertsMap.get('Follows')[0]);

}

function loadAlertDetails(alert) {

        document.querySelector('#alert-audio-volume').value = alert.audioVolume;
        document.querySelector('#alert-duration').textContent = alert.alertDuration;
        document.querySelector('#alert-text-input').textContent = alert.alertText;

}

function saveAlertDetails(alert) {



}

function changeAlertImage(event) {

    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
        document.querySelector('#alert-img').src = event.target.result;
    }

    reader.readAsDataURL(file);

}