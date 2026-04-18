const alertsMap = new Map(alerts);
let selectedCategory = null;
let selectedAlert = null;

document.addEventListener('DOMContentLoaded', initializePage);
document.querySelector('#alert-preview-btn').addEventListener('click', previewAlert);
document.querySelector('#copy-alerts-url-btn').addEventListener('click', copyAlertsUrlToClipboard);
document.querySelector('#image-file-input').addEventListener('change', changeAlertImage);
document.querySelector('#image-file-input-btn').addEventListener('click', imageFileInputBtnClicked);
document.querySelector('#audio-file-input').addEventListener('change', changeAudioFile);
document.querySelector('#audio-file-input-btn').addEventListener('click', audioFileInputBtnClicked);
document.querySelector('#alert-audio-volume').addEventListener('input', setAudioVolume);
document.querySelector('#play-audio-btn').addEventListener('click', playAlertAudio);

function initializePage() {

    const categoriesContainer = document.querySelector('#alerts-categories-container');
    
    alertsMap.keys().forEach((key) => {

        const categoryBtn = document.createElement("button");
        categoryBtn.addEventListener('click', (event) => switchAlertCategory(key, event));
        categoryBtn.classList.add('alerts-category-btn');
        categoryBtn.textContent = key;
        categoriesContainer.appendChild(categoryBtn);

    });

    document.querySelector('#alert-audio-volume').addEventListener('change', setAudioVolume);

    selectedCategory = 'Follows';
    loadAlertDetails(alertsMap.get('Follows')[0]);

}

async function copyAlertsUrlToClipboard() {

    const textToCopy = document.querySelector('#alerts-url-field').value;
    await copyTextToClipboard(textToCopy);

    document.querySelector('#copy-alerts-url-btn').blur();

}

function setAudioVolume(event) {

    document.querySelector('#alert-audio').volume = event.target.value;

}

function playAlertAudio(event) {

    document.querySelector('#alert-audio').currentTime = 0;
    document.querySelector('#alert-audio').play();
    event.target.blur();

}

async function copyTextToClipboard(text) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}

async function previewAlert(event) {

    event.target.blur();

}

function switchAlertCategory(category) {

    if(category === selectedCategory) return;

    selectedCategory = category;
    loadAlertDetails(alertsMap.get(category)[0]);

}

function loadAlertDetails(alert) {

    document.querySelector('#alert-audio-volume').value = alert.audioVolume;
    document.querySelector('#alert-duration-input').textContent = alert.alertDuration || '0';
    document.querySelector('#alert-text-input').textContent = alert.alertText;
    document.querySelector('#selected-alert-description').textContent = alert.alertDescription;

    selectedAlert = alert;

}

function saveAlertDetails(alert) {



}

function imageFileInputBtnClicked(event) {

    document.querySelector('#image-file-input').click();
    event.target.blur();

}

function audioFileInputBtnClicked(event) {

    document.querySelector('#audio-file-input').click();
    event.target.blur();

}

function changeAlertImage(event) {

    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
        document.querySelector('#alert-img-thumb').src = event.target.result;
    }

    reader.readAsDataURL(file);

}

function changeAudioFile(event) {

    const file = event.target.files[0];
    if(!file) return;

    document.querySelector('#alert-audio-filename').textContent = file.name;
    const reader = new FileReader();

    reader.onload = (event) => {
        document.querySelector('#alert-audio').src = event.target.result;
    }

    reader.readAsDataURL(file);

}