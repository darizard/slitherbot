let selectedCategory = null;
let selectedAlertType = null;
let alertPreviewTimeout = null;

const unsavedAlertsMap = new Map([]); // keys are sub types instead of categories
const alertsMedia = new Map([]); // keys are sub types
const unsavedAlertsMedia = new Map([]); // keys are sub types, values are { imageUrl, audioUrl }
const lastAlertForCategory = new Map([]); // keys are categories, values are sub types

const DEFAULT_ALERT_DETAILS = {
    imageFile: '',
    audioFile: 'audio_here.mp3',
    alertText: '',
    alertDuration: 8000,
    audioVolume: 20,
    alertDescription: ''
};

document.addEventListener('DOMContentLoaded', initializePage);
document.querySelector('#alert-preview-btn').addEventListener('click', previewAlert);
document.querySelector('#copy-alerts-url-btn').addEventListener('click', copyAlertsUrlToClipboard);
document.querySelector('#image-file-input').addEventListener('change', setAlertImage);
document.querySelector('#image-file-input-btn').addEventListener('click', imageFileInputBtnClicked);
document.querySelector('#audio-file-input').addEventListener('change', setAudioFile);
document.querySelector('#audio-file-input-btn').addEventListener('click', audioFileInputBtnClicked);
document.querySelector('#audio-volume-input').addEventListener('input', setAudioVolume);
document.querySelector('#alert-duration-input').addEventListener('change', setAlertDuration);
document.querySelector('#alert-text-input').addEventListener('change', setAlertText);
document.querySelector('#play-audio-btn').addEventListener('click', playAudioBtnClicked);
document.querySelector('#save-alert-btn').addEventListener('click', uploadAlert);
document.querySelector('#discard-changes-btn').addEventListener('click', clearAlertDetails);
document.querySelectorAll('.alerts-category-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
        await switchAlertCategory(btn.textContent, event);
    });
});
document.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', (event) => {
        event.currentTarget.blur();
    });
});

async function initializePage() {

    document.querySelector(`#${defaultCategory.toLowerCase().replace(' ', '')}-alerts-category-btn`).click();

    selectedCategory = defaultCategory;
    selectedAlertType = defaultAlertType;
        await displayAlertDetails(alertsMap.get(selectedCategory).find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    }));

    lastAlertForCategory.set(defaultCategory, defaultAlertType);

}

async function copyAlertsUrlToClipboard() {

    const textToCopy = document.querySelector('#alerts-url-field').value;
    await copyTextToClipboard(textToCopy);

    document.querySelector('#copy-alerts-url-btn').blur();

}

function setAudioVolume(event) {

    document.querySelector('#alert-audio').volume = event.currentTarget.value;
    updateUnsavedAlert('audioVolume', event.currentTarget.valueAsNumber * 100);
    
}

function setAlertDuration(event) {

    updateUnsavedAlert('alertDuration', parseFloat(event.currentTarget.value) * 1000);

}

function setAlertText(event) {

    updateUnsavedAlert('alertText', event.currentTarget.value);

}

function playAlertAudio(event) {

    document.querySelector('#alert-audio').currentTime = 0;
    document.querySelector('#alert-audio').play();

}

function stopAlertAudio(event) {

    const audioEl = document.querySelector('#alert-audio');
    
    audioEl.pause();
    audioEl.currentTime = 0;

}

async function copyTextToClipboard(text) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}

function previewAlert(event) {

    event.currentTarget.blur();
    clearTimeout(alertPreviewTimeout);
    const imgPreviewEl = document.querySelector('#alert-img');
    document.querySelector('#alert-img').setAttribute('src', document.querySelector('#alert-img-thumb').src);
    playAlertAudio();
    const duration = parseInt(document.querySelector('#alert-duration-input').value) * 1000;
    alertPreviewTimeout = setTimeout(() => {
        imgPreviewEl.removeAttribute('src');
        stopAlertAudio();
    }, parseInt(document.querySelector('#alert-duration-input').value) * 1000);

}

async function switchAlertCategory(category, event) {

    if(category === selectedCategory) return;

    const optionsContainer = document.querySelector('#alert-options-container');
    const settings1 = document.querySelector('#alert-settings-section-1');
    const settings2 = document.querySelector('#alert-settings-section-2');

    const alertToDisplay = alertsMap.get(category).find((alert) => {
        return alert.subscriptionType === lastAlertForCategory.get(category);
    }) || alertsMap.get(category)[0];

    const alertBox = [];
    for(let i = 0; i < alertsMap.get(category).length; i++) {
        const newButton = document.createElement('button');
        const subType = alertsMap.get(category)[i].subscriptionType;
        newButton.setAttribute('id', `${subType}-alert-type-btn`);
        newButton.classList.add('alert-type-btn');
        newButton.addEventListener('click', (event) => {
            changeSelectedAlert(newButton.id.split('-')[0], event);
            event.currentTarget.blur();
        });
        newButton.tabIndex = 0;

        const descH2 = document.createElement('h2');
        descH2.setAttribute('id', `${subType}-description`);
        descH2.classList.add('alert-description');
        descH2.textContent = alertsMap.get(category)[i].alertDescription;
        if(unsavedAlertsMap.has(subType)) descH2.textContent += ' (UNSAVED)';
        newButton.appendChild(descH2);

        alertBox.push(newButton);

        if(i === 0) {
            alertBox.push(settings1);
            alertBox.push(settings2);
        }
    }

    optionsContainer.replaceChildren(...alertBox);
    
    if(selectedCategory) {
        document.querySelector(`#${selectedCategory.toLowerCase().replace(' ', '')}-alerts-category-btn`).classList.remove('selected-category');
    }
    event.currentTarget.classList.add('selected-category');
    selectedCategory = category;
    
    await changeSelectedAlert(lastAlertForCategory.get(category) || alertsMap.get(selectedCategory)[0].subscriptionType);

}

async function changeSelectedAlert(type) {

    if(type === selectedAlertType) return;
    clearTimeout(alertPreviewTimeout);

    const newSelectedBtn = document.querySelector(`#${type}-alert-type-btn`);
    newSelectedBtn.classList.add('selected-alert');
    const settings1 = document.querySelector('#alert-settings-section-1');
    newSelectedBtn.after(settings1);
    settings1.after(document.querySelector('#alert-settings-section-2'));
    
    document.querySelector(`#${selectedAlertType}-alert-type-btn`)?.classList.remove('selected-alert');
    document.querySelector(`#${type}-alert-type-btn`)?.classList.add('selected-alert');
    
    selectedAlertType = type;
    lastAlertForCategory.set(selectedCategory, selectedAlertType);
    await displayAlertDetails(alertsMap.get(selectedCategory).find((alert) => {
        return alert.subscriptionType === type;
    }));

}

async function displayAlertDetails(alert) {

    const unsavedAlert = unsavedAlertsMap.get(selectedAlertType);

    const volumeVal = unsavedAlert?.audioVolume || alert.audioVolume || DEFAULT_ALERT_DETAILS.audioVolume;
    const durationVal = unsavedAlert?.alertDuration || alert.alertDuration || DEFAULT_ALERT_DETAILS.alertDuration;
    const textVal = unsavedAlert?.alertText || alert.alertText || DEFAULT_ALERT_DETAILS.alertText;
    const audioFileVal = unsavedAlert?.audioFile || alert.audioFile || DEFAULT_ALERT_DETAILS.audioFile;

    const imageUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.imageUrl || alertsMedia.get(alert.subscriptionType)?.imageUrl;
    const audioUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.audioUrl || alertsMedia.get(alert.subscriptionType)?.audioUrl;
    const APImedia = await getMedia(alert.subscriptionId, (imageUrl === undefined), (audioUrl === undefined))

    document.querySelector('#alert-audio-filename').value = audioFileVal;
    document.querySelector('#audio-volume-input').value = volumeVal / 100;
    document.querySelector('#alert-duration-input').value = durationVal / 1000;
    document.querySelector('#alert-text-input').value = textVal;

    document.querySelector('#alert-img-thumb').setAttribute('src', imageUrl ?? APImedia.imageUrl ?? '');
    document.querySelector('#alert-audio').setAttribute('src', audioUrl ?? APImedia.audioUrl ?? '');

}

function imageFileInputBtnClicked(event) {

    document.querySelector('#image-file-input').click();
    event.currentTarget.blur();

}

function audioFileInputBtnClicked(event) {

    document.querySelector('#audio-file-input').click();
    event.currentTarget.blur();

}

function playAudioBtnClicked(event) {

    playAlertAudio();
    event.currentTarget.blur();

}

function setAlertImage(event) {

    const file = event.currentTarget.files[0];
    if(!file) return;
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.imageUrl);

    const blobURL = URL.createObjectURL(file);

    document.querySelector('#alert-img-thumb').setAttribute('src', blobURL);
    
    updateUnsavedAlert('imageFile', file.name);
    unsavedAlertsMedia.set(selectedAlertType, { 
        imageUrl: blobURL,
        audioUrl: unsavedAlertsMedia.get(selectedAlertType)?.audioUrl ?? undefined
    });

    document.querySelector('#image-file-input').value = '';

}

function setAudioFile(event) {

    const file = event.currentTarget.files[0];
    if(!file) return;
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.audioUrl);

    const blobURL = URL.createObjectURL(file);

    document.querySelector('#alert-audio-filename').value = file.name;
    document.querySelector('#alert-audio').setAttribute('src', blobURL);

    updateUnsavedAlert('audioFile', file.name);
    unsavedAlertsMedia.set(selectedAlertType, { 
        imageUrl: unsavedAlertsMedia.get(selectedAlertType)?.imageUrl ?? undefined,
        audioUrl: blobURL
    });

    document.querySelector('#audio-file-input').value = '';
    
}

async function uploadAlert() {

    const unsavedAlert = unsavedAlertsMap.get(selectedAlertType) ?? undefined;
    if(unsavedAlert === undefined) return;
    
    const mappedAlert = alertsMap.get(selectedCategory).find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    });

    const data = new FormData();
    const { imageUrl, audioUrl } = unsavedAlertsMedia.get(selectedAlertType);

    if(imageUrl) {
        const imageBlob = await fetch(imageUrl).then(r => r.blob());
        data.append('imageBlob', imageBlob, unsavedAlert.imageFile);
    }
    if(audioUrl) {
        const audioBlob = await fetch(audioUrl).then(r => r.blob());
        data.append('audioBlob', audioBlob, unsavedAlert.audioFile);
    }
    data.append('audioVolume', unsavedAlert.audioVolume);
    data.append('alertDuration', unsavedAlert.alertDuration);
    data.append('alertText', unsavedAlert.alertText);
    data.append('subscriptionId', mappedAlert.subscriptionId);

    const res = await fetch('/slither/alerts', {
        method: 'POST',
        body: data
    });

    if(res.ok) {

        if(unsavedAlert.imageFile) mappedAlert.imageFile = unsavedAlert.imageFile;
        if(unsavedAlert.audioFile) mappedAlert.audioFile = unsavedAlert.audioFile;
        if(unsavedAlert.audioVolume) mappedAlert.audioVolume = unsavedAlert.audioVolume;
        if(unsavedAlert.alertDuration) mappedAlert.audioDuration = unsavedAlert.audioDuration;
        if(unsavedAlert.alertText) mappedAlert.alertText = unsavedAlert.alertText;
        document.querySelector(`#${selectedAlertType}-description`).textContent = mappedAlert.alertDescription;
        unsavedAlertsMap.delete(selectedAlertType);

    }

}

function clearAlertDetails() {
    
    document.querySelector('#alert-audio').removeAttribute('src');
    document.querySelector('#alert-img-thumb').removeAttribute('src');
    document.querySelector('#alert-img').removeAttribute('src');

    document.querySelector('#image-file-input').value = '';
    document.querySelector('#audio-file-input').value = '';
    document.querySelector('#alert-audio-filename').value = DEFAULT_ALERT_DETAILS.audioFile;

    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.audioUrl);
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.imageUrl);
    unsavedAlertsMedia.delete(selectedAlertType);
    unsavedAlertsMap.delete(selectedAlertType);

    const alertToRestore = alertsMap.get(selectedCategory).find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    });

    document.querySelector(`#${selectedAlertType}-description`).textContent = alertToRestore.alertDescription;
    displayAlertDetails(alertToRestore);

}

function updateUnsavedAlert(attr, val) {

    const alertBtn = document.querySelector('.selected-alert');
    const type = alertBtn.id.substring(0, alertBtn.id.indexOf('-'));

    if(!unsavedAlertsMap.has(type)) {
        unsavedAlertsMap.set(type, { });
        alertBtn.querySelector('h2').textContent += ' (UNSAVED)';
    }
    unsavedAlertsMap.get(type)[attr] = val;

}

async function getMedia(subType, getImage, getAudio) {

    if(!getImage && !getAudio) return;

    return { image: '', audio: '' };

    console.log(`subType: ${subType}, getImage: ${getImage}, getAudio: ${getAudio}`);

}