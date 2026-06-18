let selectedCategory = defaultCategory;
let selectedAlertType = defaultAlertType;
let alertPreviewTimeout = null;
let alertAudioElement;
let alertImagePreviewElement;
let alertImageThumb;
let alertDurationInput;
let alertOptionsContainer;
let alertTypeButtonsContainer;
let alertSettingsSection1;
let alertSettingsSection2;
let alertAudioFilenameInput;
let alertAudioVolumeInput;
let alertTextInput;
let alertImageFileInput;
let alertImageFileButton;
let alertAudioFileInput;
let alertAudioFileButton;
let playAudioButton;
const unsavedAlertsMap = new Map([]); // keys are sub types instead of categories
const alertsMedia = new Map([]); // keys are sub types
const unsavedAlertsMedia = new Map([]); // keys are sub types, values are { imageUrl, audioUrl }
const lastAlertForCategory = new Map([]); // keys are categories, values are sub types
const DEFAULT_ALERT_DETAILS = {
    imageFile: '',
    audioFile: '(None)',
    alertText: '',
    alertDuration: 8000,
    audioVolume: 20,
    alertDescription: ''
};
document.addEventListener('DOMContentLoaded', initializePage);
async function initializePage() {
    await initEventListeners();
    initElementReferences();
    alertImageFileInput.setAttribute('accept', 'image/apng, image/avif, image/gif, image/jpeg, image/png, image/svg+xml, image/webp');
    alertAudioFileInput.setAttribute('accept', 'audio/mpeg, audio/wav, audio/mp4');
    document.querySelector(`#${categoryNameToButtonID(selectedCategory)}`).click();
    await displayAlertDetails(alertsMap?.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    }));
    lastAlertForCategory.set(defaultCategory, defaultAlertType);
}
async function initEventListeners() {
    document.querySelector('#alert-preview-btn')?.addEventListener('click', previewAlert);
    document.querySelector('#copy-alerts-url-btn')?.addEventListener('click', copyAlertsUrlToClipboard);
    document.querySelector('#image-file-input')?.addEventListener('change', setAlertImage);
    document.querySelector('#image-file-input-btn')?.addEventListener('click', imageFileInputBtnClicked);
    document.querySelector('#audio-file-input')?.addEventListener('change', setAudioFile);
    document.querySelector('#audio-file-input-btn')?.addEventListener('click', audioFileInputBtnClicked);
    document.querySelector('#audio-volume-input')?.addEventListener('input', setAudioVolume);
    document.querySelector('#alert-duration-input')?.addEventListener('input', setAlertDuration);
    document.querySelector('#alert-text-input')?.addEventListener('input', setAlertText);
    document.querySelector('#play-audio-btn')?.addEventListener('click', playAudioBtnClicked);
    document.querySelector('#save-alert-btn')?.addEventListener('click', uploadAlert);
    document.querySelector('#discard-changes-btn')?.addEventListener('click', discardAlertChanges);
    document.querySelectorAll('.alerts-category-btn').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            await switchAlertCategory(btn.textContent, event);
        });
    });
    document.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            if (event.currentTarget)
                event.currentTarget.blur();
        });
    });
}
function initElementReferences() {
    alertAudioElement = document.querySelector('#alert-audio');
    alertImagePreviewElement = document.querySelector('#alert-img');
    alertImageThumb = document.querySelector('#alert-img-thumb');
    alertDurationInput = document.querySelector('#alert-duration-input');
    alertOptionsContainer = document.querySelector('#alert-options-container');
    alertTypeButtonsContainer = document.querySelector('#alert-type-buttons-container');
    alertSettingsSection1 = document.querySelector('#alert-settings-section-1');
    alertSettingsSection2 = document.querySelector('#alert-settings-section-2');
    alertAudioFilenameInput = document.querySelector('#alert-audio-filename');
    alertAudioVolumeInput = document.querySelector('#audio-volume-input');
    alertTextInput = document.querySelector('#alert-text-input');
    alertImageFileInput = document.querySelector('#image-file-input');
    alertImageFileButton = document.querySelector('#image-file-input-btn');
    alertAudioFileInput = document.querySelector('#audio-file-input');
    alertAudioFileButton = document.querySelector('#audio-file-input-btn');
    playAudioButton = document.querySelector('#play-audio-btn');
}
async function copyAlertsUrlToClipboard() {
    const urlField = document.querySelector('#alerts-url-field');
    if (urlField) {
        const textToCopy = urlField.value;
        await copyTextToClipboard(textToCopy);
    }
    const alertsUrlCopyBtn = document.querySelector('#copy-alerts-url-btn');
    if (alertsUrlCopyBtn)
        alertsUrlCopyBtn.blur();
}
function setAudioVolume(event) {
    const eventTarget = event.currentTarget;
    if (eventTarget) {
        alertAudioElement.volume = eventTarget.valueAsNumber;
        updateUnsavedAlert('audioVolume', eventTarget.valueAsNumber * 100);
    }
}
function setAlertDuration(event) {
    if (event.currentTarget)
        updateUnsavedAlert('alertDuration', parseFloat(event.currentTarget.value) * 1000);
}
function setAlertText(event) {
    if (event.currentTarget)
        updateUnsavedAlert('alertText', event.currentTarget.value);
}
function playAlertAudio() {
    alertAudioElement.currentTime = 0;
    alertAudioElement.play().catch((_err) => { });
}
function stopAlertAudio() {
    alertAudioElement.pause();
    alertAudioElement.currentTime = 0;
}
async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    }
    catch (err) {
        console.error(`Error copying to clipboard: ${err}`);
    }
}
function previewAlert(event) {
    if (event.currentTarget) {
        event.currentTarget?.blur();
        if (alertPreviewTimeout)
            clearTimeout(alertPreviewTimeout);
        alertImagePreviewElement.setAttribute('src', alertImageThumb.src);
        playAlertAudio();
        alertPreviewTimeout = setTimeout(() => {
            alertImagePreviewElement.removeAttribute('src');
            stopAlertAudio();
        }, parseFloat(alertDurationInput.value) * 1000);
    }
}
async function switchAlertCategory(newCategory, event) {
    if (newCategory === selectedCategory)
        return;
    const alertsForCategory = alertsMap.get(newCategory);
    if (!alertsForCategory)
        return;
    const newCategoryBtn = event.currentTarget ? event.currentTarget : undefined;
    const alertTypeButtons = [];
    for (let i = 0; i < alertsForCategory.length; i++) {
        const newButton = document.createElement('button');
        const newSubType = alertsForCategory[i]?.subscriptionType;
        if (!newSubType)
            continue;
        newButton.setAttribute('id', `${newSubType}-alert-type-btn`);
        newButton.classList.add('alert-type-btn');
        newButton.addEventListener('click', async (event) => {
            await changeSelectedAlert(newSubType);
            event.target?.blur();
        });
        newButton.tabIndex = 0;
        newButton.textContent = alertsForCategory[i]?.alertDescription ?? '';
        if (unsavedAlertsMap.has(newSubType))
            newButton.textContent += ' (UNSAVED)';
        alertTypeButtons.push(newButton);
    }
    alertTypeButtonsContainer.replaceChildren(...alertTypeButtons);
    const optionsSections = [];
    optionsSections.push(alertTypeButtonsContainer);
    optionsSections.push(alertSettingsSection1);
    optionsSections.push(alertSettingsSection2);
    alertOptionsContainer.replaceChildren(...optionsSections);
    if (selectedCategory) {
        document.querySelector(`#${categoryNameToButtonID(selectedCategory)}`)?.classList.remove('selected-category');
    }
    newCategoryBtn?.classList.add('selected-category');
    selectedCategory = newCategory;
    await changeSelectedAlert(lastAlertForCategory.get(newCategory) || alertsForCategory[0]?.subscriptionType);
}
async function changeSelectedAlert(type) {
    if (type === selectedAlertType || !type)
        return;
    if (alertPreviewTimeout)
        clearTimeout(alertPreviewTimeout);
    alertImageThumb.setAttribute('src', '');
    alertImagePreviewElement.setAttribute('src', '');
    alertAudioElement.setAttribute('src', '');
    const newSelectedBtn = document.querySelector(`#${type}-alert-type-btn`);
    newSelectedBtn.classList.add('selected-alert');
    document.querySelector(`#${selectedAlertType}-alert-type-btn`)?.classList.remove('selected-alert');
    document.querySelector(`#${type}-alert-type-btn`)?.classList.add('selected-alert');
    selectedAlertType = type;
    lastAlertForCategory.set(selectedCategory, selectedAlertType);
    await displayAlertDetails(alertsMap.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === type;
    }));
}
async function displayAlertDetails(alert) {
    const unsavedAlert = unsavedAlertsMap.get(selectedAlertType);
    if (!unsavedAlert || !alert)
        return;
    const volumeVal = unsavedAlert.audioVolume || alert.audioVolume || DEFAULT_ALERT_DETAILS.audioVolume;
    const durationVal = unsavedAlert.alertDuration || alert.alertDuration || DEFAULT_ALERT_DETAILS.alertDuration;
    const textVal = unsavedAlert.alertText || alert.alertText || DEFAULT_ALERT_DETAILS.alertText;
    const audioFileVal = unsavedAlert.audioFile || alert.audioFile || DEFAULT_ALERT_DETAILS.audioFile;
    const alertMediaData = alertsMedia.get(alert.subscriptionType)
        ?? alertsMedia.set(alert.subscriptionType, { imageUrl: undefined, imageName: undefined, audioUrl: undefined, audioName: undefined })
            .get(alert.subscriptionType);
    let imageUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.imageUrl || alertsMedia.get(alert.subscriptionType)?.imageUrl;
    let audioUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.audioUrl || alertsMedia.get(alert.subscriptionType)?.audioUrl;
    const APImedia = await getAlertMediaBySubId(alert.subscriptionId, imageUrl === undefined, audioUrl === undefined);
    if (APImedia?.imageBlob) {
        if (alertMediaData.imageUrl)
            URL.revokeObjectURL(alertMediaData.imageUrl);
        imageUrl = alertMediaData.imageUrl = URL.createObjectURL(APImedia.imageBlob);
        alertMediaData.imageName = APImedia.imageFileName;
    }
    if (APImedia?.audioBlob) {
        if (alertMediaData.audioUrl)
            URL.revokeObjectURL(alertMediaData.audioUrl);
        audioUrl = alertMediaData.audioUrl = URL.createObjectURL(APImedia.audioBlob);
        alertMediaData.audioName = APImedia.audioFileName;
    }
    alertAudioFilenameInput.value = audioFileVal;
    alertAudioVolumeInput.value = (volumeVal / 100).toString();
    alertDurationInput.value = (durationVal / 1000).toString();
    alertTextInput.value = textVal || '';
    alertImageThumb.setAttribute('src', imageUrl ?? '');
    alertAudioElement.setAttribute('src', audioUrl ?? '');
}
function imageFileInputBtnClicked() {
    alertImageFileInput.click();
    alertImageFileButton.blur();
}
function audioFileInputBtnClicked() {
    alertAudioFileInput.click();
    alertAudioFileButton.blur();
}
function playAudioBtnClicked() {
    playAlertAudio();
    playAudioButton.blur();
}
function setAlertImage() {
    if (!alertImageFileInput.files)
        return;
    const file = alertImageFileInput.files[0];
    if (!file)
        return;
    const unsavedImageUrl = unsavedAlertsMedia.get(selectedAlertType)?.imageUrl;
    if (unsavedImageUrl)
        URL.revokeObjectURL(unsavedImageUrl);
    const blobURL = URL.createObjectURL(file);
    alertImageThumb.setAttribute('src', blobURL);
    updateUnsavedAlert('imageFile', file.name);
    // CONTINUE TS CONVERSION HERE -- ALSO VERIFY THAT WE DON'T NEED TO SAVE THE IMAGENAME AND AUDIONAME OR MAKE THEM OPTIONAL IN THE ALERTMEDIADATA TYPE
    unsavedAlertsMedia.set(selectedAlertType, {
        imageUrl: blobURL,
        audioUrl: unsavedAlertsMedia.get(selectedAlertType)?.audioUrl ?? undefined
    });
    alertImageFileInput.value = '';
}
function setAudioFile() {
    let file;
    if (!alertAudioFileInput.files || !alertAudioFileInput.files[0])
        return;
    file = alertAudioFileInput.files[0];
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.audioUrl ?? '');
    const blobURL = URL.createObjectURL(file);
    alertAudioFilenameInput.value = file.name;
    alertAudioElement.setAttribute('src', blobURL);
    updateUnsavedAlert('audioFile', file.name);
    unsavedAlertsMedia.set(selectedAlertType, {
        imageUrl: unsavedAlertsMedia.get(selectedAlertType)?.imageUrl,
        audioUrl: blobURL
    });
    alertAudioFileInput.value = '';
}
async function uploadAlert() {
    const unsavedAlert = unsavedAlertsMap.get(selectedAlertType) ?? undefined;
    if (unsavedAlert === undefined)
        return;
    const mappedAlert = alertsMap.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    });
    if (!mappedAlert)
        return;
    const data = new FormData();
    const { imageUrl = undefined, audioUrl = undefined } = unsavedAlertsMedia.get(selectedAlertType) ?? {};
    if (imageUrl) {
        const imageBlob = await fetch(imageUrl).then(r => r.blob());
        data.append('imageBlob', imageBlob, unsavedAlert.imageFile ?? undefined);
    }
    if (audioUrl) {
        const audioBlob = await fetch(audioUrl).then(r => r.blob());
        data.append('audioBlob', audioBlob, unsavedAlert.audioFile ?? undefined);
    }
    if (unsavedAlert.audioVolume)
        data.append('audioVolume', unsavedAlert.audioVolume.toString());
    if (unsavedAlert.alertDuration)
        data.append('alertDuration', unsavedAlert.alertDuration.toString());
    if (unsavedAlert.alertText)
        data.append('alertText', unsavedAlert.alertText);
    data.append('subscriptionId', mappedAlert.subscriptionId);
    const res = await fetch('/slither/alerts', {
        method: 'POST',
        body: data
    });
    if (res.ok) {
        if (unsavedAlert.imageFile)
            mappedAlert.imageFile = unsavedAlert.imageFile;
        if (unsavedAlert.audioFile)
            mappedAlert.audioFile = unsavedAlert.audioFile;
        if (unsavedAlert.audioVolume)
            mappedAlert.audioVolume = unsavedAlert.audioVolume;
        if (unsavedAlert.alertDuration)
            mappedAlert.alertDuration = unsavedAlert.alertDuration;
        if (unsavedAlert.alertText)
            mappedAlert.alertText = unsavedAlert.alertText;
        document.querySelector(`#${selectedAlertType}-alert-type-btn`).textContent = mappedAlert.alertDescription;
        unsavedAlertsMap.delete(selectedAlertType);
    }
}
async function discardAlertChanges() {
    alertAudioElement.removeAttribute('src');
    alertImageThumb.removeAttribute('src');
    alertImagePreviewElement.removeAttribute('src');
    alertImageFileInput.value = '';
    alertAudioFileInput.value = '';
    alertAudioFilenameInput.value = DEFAULT_ALERT_DETAILS.audioFile;
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.audioUrl ?? '');
    URL.revokeObjectURL(unsavedAlertsMedia.get(selectedAlertType)?.imageUrl ?? '');
    unsavedAlertsMedia.delete(selectedAlertType);
    unsavedAlertsMap.delete(selectedAlertType);
    const alertToRestore = alertsMap.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    });
    const alertBtn = document.querySelector(`#${selectedAlertType}-alert-type-btn`);
    if (!alertBtn || !alertToRestore) {
        console.error('Expected alert type not found in underlying data (Oops I broke something)');
        return;
    }
    alertBtn.textContent = alertToRestore.alertDescription;
    await displayAlertDetails(alertToRestore);
}
function updateUnsavedAlert(attr, val) {
    const alertBtn = document.querySelector('.selected-alert');
    if (!alertBtn)
        return;
    const type = alertBtn.id.substring(0, alertBtn.id.indexOf('-'));
    let unsavedAlert;
    if (!unsavedAlertsMap.has(type)) {
        unsavedAlert = unsavedAlertsMap.set(type, undefined).get(type);
        alertBtn.textContent += ' (UNSAVED)';
    }
    else {
        unsavedAlert = unsavedAlertsMap.get(type);
    }
    unsavedAlert[attr] = val;
}
async function getAlertMediaBySubId(subId, getImage, getAudio) {
    console.log(`subId: ${subId}, getImage: ${getImage}, getAudio: ${getAudio}`);
    if (!getImage && !getAudio)
        return null;
    // Endpoint returns JSON with { imageBase64: <Blob>, imageFileName: <string>, imageFileMime: <string>
    //                              audioBase64: <Blob>, audioFileName: <string>, audioFileMime: <string>
    //                              subType: <SubscriptionType> }
    const response = await fetch(`/slither/alerts/media`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subId: subId,
            getImage: getImage,
            getAudio: getAudio
        })
    });
    const resJson = await response.json();
    const APImedia = { subType: resJson.subType };
    if (resJson.imageBase64) {
        const binaryString = atob(resJson.imageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        APImedia.imageBlob = new Blob([bytes], { type: resJson.imageFileMime });
        APImedia.imageFileName = resJson.imageFileName;
    }
    if (resJson.audioBase64) {
        const binaryString = atob(resJson.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        APImedia.audioBlob = new Blob([bytes], { type: resJson.audioFileMime });
        APImedia.audioFileName = resJson.audioFileName;
    }
    return APImedia;
}
function categoryNameToButtonID(catName) {
    return `${catName.toLowerCase().replace(' ', '')}-alerts-category-btn`;
}
export {};
