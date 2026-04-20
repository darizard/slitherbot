let selectedCategory = null;
let selectedAlertType = null;

document.addEventListener('DOMContentLoaded', initializePage);
document.querySelector('#alert-preview-btn').addEventListener('click', previewAlert);
document.querySelector('#copy-alerts-url-btn').addEventListener('click', copyAlertsUrlToClipboard);
document.querySelector('#image-file-input').addEventListener('change', changeAlertImage);
document.querySelector('#image-file-input-btn').addEventListener('click', imageFileInputBtnClicked);
document.querySelector('#audio-file-input').addEventListener('change', changeAudioFile);
document.querySelector('#audio-file-input-btn').addEventListener('click', audioFileInputBtnClicked);
document.querySelector('#audio-volume-input').addEventListener('input', setAudioVolume);
document.querySelector('#play-audio-btn').addEventListener('click', playAlertAudio);
document.querySelectorAll('.alerts-category-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
        switchAlertCategory(btn.textContent, event);
        changeSelectedAlert(alertsMap.get(selectedCategory)[0].subscriptionType);
        event.currentTarget.blur();
    });
});

function initializePage() {

    const settings1 = document.querySelector('#alert-settings-section-1');
    const settings2 = document.querySelector('#alert-settings-section-2');

    const defaultAlertBtn = document.querySelector(`#${defaultAlertType}-alert-type-btn`);
    defaultAlertBtn.after(settings1);
    settings1.after(settings2);

    document.querySelector(`#${defaultCategory.toLowerCase().replace(' ', '')}-alerts-category-btn`).classList.add('selected-category');
    document.querySelector(`#${defaultAlertType}-alert-type-btn`).classList.add('selected-alert');

    selectedCategory = defaultCategory;
    selectedAlertType = defaultAlertType;

}

async function copyAlertsUrlToClipboard() {

    const textToCopy = document.querySelector('#alerts-url-field').value;
    await copyTextToClipboard(textToCopy);

    document.querySelector('#copy-alerts-url-btn').blur();

}

function setAudioVolume(event) {

    document.querySelector('#alert-audio').volume = event.currentTarget.value;

}

function playAlertAudio(event) {

    document.querySelector('#alert-audio').currentTime = 0;
    document.querySelector('#alert-audio').play();
    event.currentTarget.blur();

}

async function copyTextToClipboard(text) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}

async function previewAlert(event) {

    event.currentTarget.blur();

}

function switchAlertCategory(category, event) {

    if(category === selectedCategory) return;

    const optionsContainer = document.querySelector('#alert-options-container');
    const settings1 = document.querySelector('#alert-settings-section-1');
    const settings2 = document.querySelector('#alert-settings-section-2');

    const alertButtons = [];
    for(let i = 0; i < alertsMap.get(category).length; i++) {
        const newButton = document.createElement('button');
        newButton.setAttribute('id', `${alertsMap.get(category)[i].subscriptionType}-alert-type-btn`);
        newButton.classList.add('alert-type-btn');
        newButton.addEventListener('click', (event) => {
            changeSelectedAlert(newButton.id.split('-')[0], event);
            event.currentTarget.blur();
        });
        newButton.tabIndex = 0;

        const descH2 = document.createElement('h2');
        descH2.classList.add('alert-description');
        descH2.textContent = alertsMap.get(category)[i].alertDescription;
        newButton.appendChild(descH2);

        alertButtons.push(newButton);

        if(i === 0) {
            alertButtons.push(settings1);
            alertButtons.push(settings2);
        }
    }

    optionsContainer.replaceChildren(...alertButtons);
    
    document.querySelector(`#${selectedCategory.toLowerCase().replace(' ', '')}-alerts-category-btn`).classList.remove('selected-category');
    event.currentTarget.classList.add('selected-category');
    selectedCategory = category;
    loadAlertDetails(alertsMap.get(category)[0]);

}

function changeSelectedAlert(type) {

    if(type === selectedAlertType) return;

    const newSelectedBtn = document.querySelector(`#${type}-alert-type-btn`);
    newSelectedBtn.classList.add('selected-alert');
    const settings1 = document.querySelector('#alert-settings-section-1');
    newSelectedBtn.after(settings1);
    settings1.after(document.querySelector('#alert-settings-section-2'));

    
    document.querySelector(`#${selectedAlertType}-alert-type-btn`)?.classList.remove('selected-alert');
    document.querySelector(`#${type}-alert-type-btn`)?.classList.add('selected-alert');

    selectedAlertType = type;
    loadAlertDetails(alertsMap.get(selectedCategory).find((alert) => {
        return alert.subscriptionType === type
    }));

}

function loadAlertDetails(alert) {

    document.querySelector('#audio-volume-input').value = `${alert.audioVolume}`;
    document.querySelector('#alert-duration-input').textContent = alert.alertDuration || '0';
    document.querySelector('#alert-text-input').textContent = alert.alertText;

    document.querySelector(`#${alert.subscriptionType}-alert-type-btn`).querySelector('h2').textContent = alert.alertDescription;

}

function saveAlertDetails(alert) {



}

function imageFileInputBtnClicked(event) {

    document.querySelector('#image-file-input').click();
    event.currentTarget.blur();

}

function audioFileInputBtnClicked(event) {

    document.querySelector('#audio-file-input').click();
    event.currentTarget.blur();

}

function changeAlertImage(event) {

    const file = event.currentTarget.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
        document.querySelector('#alert-img-thumb').src = event.currentTarget.result;
    }

    reader.readAsDataURL(file);

}

function changeAudioFile(event) {

    const file = event.currentTarget.files[0];
    if(!file) return;

    document.querySelector('#alert-audio-filename').textContent = file.name;
    const reader = new FileReader();

    reader.onload = (event) => {
        document.querySelector('#alert-audio').src = event.currentTarget.result;
    }

    reader.readAsDataURL(file);

}

