import type alerttypes from "../types/alerttypes.js";
import type eventsubtypes from "../types/eventsubtypes.js";
import type viewtypes from "./types/viewtypes.js";

// TELL TYPESCRIPT THAT THESE WILL BE IMPORTED FROM THE EJS TEMPLATE
declare const defaultCategory: alerttypes.EventAlertCategory;
declare const defaultAlertType: eventsubtypes.SubscriptionType;
declare const alertsMap: Map<alerttypes.EventAlertCategory, alerttypes.EventAlertDetails[]>;

/* DEFINE TYPES FOR PAGE ELEMENTS */
/**<audio> for the currently selected alert */
let alertAudioElement: HTMLAudioElement;
/**<img> in the Alert Preview box, only visible during preview */
let alertImagePreviewElement: HTMLImageElement;
/**<img> in the Set Image box, always visible */
let alertImageThumb: HTMLImageElement;
/**<input> to define how long the alert should play */
let alertDurationInput: HTMLInputElement;
/**Container <div> displaying all data for the currently selected alert category */
let alertOptionsContainer: HTMLDivElement;
/**Container <div> for the buttons to select specific alert types */
let alertTypeButtonsContainer: HTMLDivElement;
/**Container <div> for the alert preview, image/audio buttons and displays, and duration input */
let alertSettingsSection1: HTMLDivElement;
/**Container <div> for the alert text and save/discard alert changes buttons */
let alertSettingsSection2: HTMLDivElement;
/**Read-only <input> element displaying the file name for the current alert's audio */
let alertAudioFilenameInput: HTMLInputElement;
/**Range type <input> to control the alert volume */
let alertAudioVolumeInput: HTMLInputElement;
/**<input> for the text to display when playing the alert */
let alertTextInput: HTMLInputElement;
/**Invisible <input> element triggered by Set Image button<input>  */
let alertImageFileInput: HTMLInputElement;
/**<button> which triggers the alert image input element */
let alertImageFileButton: HTMLButtonElement;
/**Invisible <input> element triggered by Set Audio button */
let alertAudioFileInput: HTMLInputElement;
/**<button> which triggers the alert audio input element */
let alertAudioFileButton: HTMLButtonElement;
/**<button> which plays the current audio src in the audio input element */
let playAudioButton: HTMLButtonElement;

/* DATA STRUCTURES USED IN FRONTEND LOGIC */
/**Store the details of the alert for each subscription type which has been changed but not saved by the user */
const unsavedAlertsMap: Map<eventsubtypes.SubscriptionType, Omit<alerttypes.EventAlertDetails, 'subscriptionId' | 'subscriptionType' | 'category'>> = new Map([]); // keys are sub types instead of categories
/**Store the file names and URLs of the media for every subscription type that the user has interacted with since page load */
const alertsMedia: Map<eventsubtypes.SubscriptionType, viewtypes.AlertMediaData> = new Map([]); // keys are sub types
/**Store the file names and URLs of the media for every subscription type that the user has updated on the page but not saved to the server */
const unsavedAlertsMedia: Map<eventsubtypes.SubscriptionType, viewtypes.AlertMediaData > = new Map([]); // keys are sub types, values are { imageUrl, audioUrl }
/**Map the last alert that the user had selected for each category */
const lastAlertForCategory: Map<alerttypes.EventAlertCategory, eventsubtypes.SubscriptionType> = new Map([]); // keys are categories, values are sub types

/**The currently selected alert category */
let selectedCategory = defaultCategory;
/**The currently selected alert type */
let selectedAlertType = defaultAlertType;
/**Save the timeout for the alert preview so that it can be cleared manually if the user takes certain actions while an alert preview is playing */
let alertPreviewTimeout: number | null = null;

/**Data to use if the user has not uploaded or input anything for an alert type */
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

    (document.querySelector(`#${categoryNameToButtonID(selectedCategory)}`) as HTMLButtonElement).click();
    
    await displayAlertDetails(alertsMap?.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    }));

    document.querySelector(`#${categoryNameToButtonID(defaultCategory)}`)?.classList.add('selected-category');
    document.querySelector(`#${defaultAlertType}-alert-type-btn`)?.classList.add('selected-alert');
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
            await switchAlertCategory(btn.textContent as alerttypes.EventAlertCategory, event);
        });
    });

    document.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            if(event.currentTarget) (event.currentTarget as HTMLButtonElement).blur();
        });
    });

}

function initElementReferences() {

    alertAudioElement = document.querySelector('#alert-audio') as HTMLAudioElement;
    alertImagePreviewElement = document.querySelector('#alert-img') as HTMLImageElement;
    alertImageThumb = document.querySelector('#alert-img-thumb') as HTMLImageElement;
    alertDurationInput = document.querySelector('#alert-duration-input') as HTMLInputElement;
    alertOptionsContainer = document.querySelector('#alert-options-container') as HTMLDivElement;
    alertTypeButtonsContainer = document.querySelector('#alert-type-buttons-container') as HTMLDivElement;
    alertSettingsSection1 = document.querySelector('#alert-settings-section-1') as HTMLDivElement;
    alertSettingsSection2 = document.querySelector('#alert-settings-section-2') as HTMLDivElement;
    alertAudioFilenameInput = document.querySelector('#alert-audio-filename') as HTMLInputElement;
    alertAudioVolumeInput = document.querySelector('#audio-volume-input') as HTMLInputElement;
    alertTextInput = document.querySelector('#alert-text-input') as HTMLInputElement;
    alertImageFileInput = document.querySelector('#image-file-input') as HTMLInputElement;
    alertImageFileButton = document.querySelector('#image-file-input-btn') as HTMLButtonElement;
    alertAudioFileInput = document.querySelector('#audio-file-input') as HTMLInputElement;
    alertAudioFileButton = document.querySelector('#audio-file-input-btn') as HTMLButtonElement;
    playAudioButton = document.querySelector('#play-audio-btn') as HTMLButtonElement;

}

async function copyAlertsUrlToClipboard() {

    const urlField = document.querySelector('#alerts-url-field');
    if(urlField) {
        const textToCopy = (urlField as HTMLInputElement).value;
        await copyTextToClipboard(textToCopy);
    }

    const alertsUrlCopyBtn = document.querySelector('#copy-alerts-url-btn') as (HTMLButtonElement | null);
    if(alertsUrlCopyBtn) alertsUrlCopyBtn.blur();

}

function setAudioVolume(event: Event) {

    const eventTarget = event.currentTarget as HTMLInputElement | null;
    if(eventTarget) {
        alertAudioElement.volume = eventTarget.valueAsNumber;
        updateUnsavedAlert('audioVolume', eventTarget.valueAsNumber * 100);
    }
    
}

function setAlertDuration(event: Event) {
    
    if(event.currentTarget) updateUnsavedAlert('alertDuration', parseFloat((event.currentTarget as HTMLInputElement).value) * 1000);

}

function setAlertText(event: Event) {

    if(event.currentTarget) updateUnsavedAlert('alertText', (event.currentTarget as HTMLInputElement).value);

}

function playAlertAudio() {

    alertAudioElement.currentTime = 0;
    alertAudioElement.play().catch((_err: Error) => { });

}

function stopAlertAudio() {

    alertAudioElement.pause();
    alertAudioElement.currentTime = 0;

}

async function copyTextToClipboard(text: string) {

    try {
        await navigator.clipboard.writeText(text);
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`);
    }

}

function previewAlert(event: Event) {

    if(event.currentTarget) {
        (event.currentTarget as HTMLButtonElement | null)?.blur();
        if(alertPreviewTimeout) clearTimeout(alertPreviewTimeout);
        alertImagePreviewElement.setAttribute('src', alertImageThumb.src);
        playAlertAudio();
        alertPreviewTimeout = window.setTimeout(() => {
            alertImagePreviewElement.removeAttribute('src');
            stopAlertAudio();
        }, parseFloat(alertDurationInput.value) * 1000);

    }


}

async function switchAlertCategory(newCategory: alerttypes.EventAlertCategory, event: Event) {

    if(newCategory === selectedCategory) return;
    const alertsForCategory = alertsMap.get(newCategory);
    if(!alertsForCategory) return;
    const newCategoryBtn = event.currentTarget ? event.currentTarget as HTMLButtonElement : undefined;

    const alertTypeButtons: HTMLButtonElement[] = [];
    for(let i = 0; i < alertsForCategory.length; i++) {
        const newButton = document.createElement('button');
        const newSubType = alertsForCategory[i]?.subscriptionType;
        if(!newSubType) continue;
        newButton.setAttribute('id', `${newSubType}-alert-type-btn`);
        newButton.classList.add('alert-type-btn');
        newButton.addEventListener('click', async (event) => {
            await changeSelectedAlert(newSubType);
            (event.target as HTMLButtonElement | null)?.blur();
        });
        newButton.tabIndex = 0;

        newButton.textContent = alertsForCategory[i]?.alertDescription ?? '';
        if(unsavedAlertsMap.has(newSubType)) newButton.textContent += ' (UNSAVED)';

        alertTypeButtons.push(newButton);

    }

    alertTypeButtonsContainer.replaceChildren(...alertTypeButtons);

    const optionsSections = []
    optionsSections.push(alertTypeButtonsContainer);

    optionsSections.push(alertSettingsSection1);
    optionsSections.push(alertSettingsSection2);

    alertOptionsContainer.replaceChildren(...optionsSections);
    
    if(selectedCategory) {
        document.querySelector(`#${categoryNameToButtonID(selectedCategory)}`)?.classList.remove('selected-category');
    }
    newCategoryBtn?.classList.add('selected-category');
    selectedCategory = newCategory;
    
    await changeSelectedAlert(lastAlertForCategory.get(newCategory) || alertsForCategory[0]?.subscriptionType);

}

async function changeSelectedAlert(type: eventsubtypes.SubscriptionType | undefined) {

    if(type === selectedAlertType || !type) return;
    if(alertPreviewTimeout) clearTimeout(alertPreviewTimeout);

    alertImageThumb.setAttribute('src', '');
    alertImagePreviewElement.setAttribute('src', '');
    alertAudioElement.setAttribute('src', '');

    const newSelectedBtn = document.querySelector(`#${type}-alert-type-btn`) as HTMLButtonElement;
    newSelectedBtn.classList.add('selected-alert');
    
    document.querySelector(`#${selectedAlertType}-alert-type-btn`)?.classList.remove('selected-alert');
    document.querySelector(`#${type}-alert-type-btn`)?.classList.add('selected-alert');
    
    selectedAlertType = type;
    lastAlertForCategory.set(selectedCategory, selectedAlertType);
    await displayAlertDetails(alertsMap.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === type;
    }));

}

async function displayAlertDetails(alert: alerttypes.EventAlertDetails | undefined) {

    const unsavedAlert = unsavedAlertsMap.get(selectedAlertType);
    if(!alert) return;


    const volumeVal = unsavedAlert?.audioVolume || alert.audioVolume || DEFAULT_ALERT_DETAILS.audioVolume;
    const durationVal = unsavedAlert?.alertDuration || alert.alertDuration || DEFAULT_ALERT_DETAILS.alertDuration;
    const textVal = unsavedAlert?.alertText || alert.alertText || DEFAULT_ALERT_DETAILS.alertText;
    const audioFileVal = unsavedAlert?.audioFile || alert.audioFile || DEFAULT_ALERT_DETAILS.audioFile;

    const alertMediaData = alertsMedia.get(alert.subscriptionType) 
                            ?? alertsMedia.set(alert.subscriptionType, { imageUrl: undefined, imageName: undefined, audioUrl: undefined, audioName: undefined })
                                          .get(alert.subscriptionType) as viewtypes.AlertMediaData;
    


    let imageUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.imageUrl || alertsMedia.get(alert.subscriptionType)?.imageUrl;
    let audioUrl = unsavedAlertsMedia.get(alert.subscriptionType)?.audioUrl || alertsMedia.get(alert.subscriptionType)?.audioUrl;
    const APImedia = await getAlertMediaBySubId(alert.subscriptionId, imageUrl === undefined, audioUrl === undefined)

    if(APImedia?.imageBlob) {
        if(alertMediaData.imageUrl) URL.revokeObjectURL(alertMediaData.imageUrl);
        imageUrl = alertMediaData.imageUrl = URL.createObjectURL(APImedia.imageBlob);
        alertMediaData.imageName = APImedia.imageFileName;
    } 
    if(APImedia?.audioBlob) {
        if(alertMediaData.audioUrl) URL.revokeObjectURL(alertMediaData.audioUrl);
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

    if(!alertImageFileInput.files) return;
    const file = alertImageFileInput.files[0];
    if(!file) return;

    const unsavedImageUrl = unsavedAlertsMedia.get(selectedAlertType)?.imageUrl;
    if(unsavedImageUrl) URL.revokeObjectURL(unsavedImageUrl);

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

    let file: File | undefined;
    if(!alertAudioFileInput.files || !alertAudioFileInput.files[0]) return;
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
    if(unsavedAlert === undefined) return;

    const mappedAlert = alertsMap.get(selectedCategory)?.find((alert) => {
        return alert.subscriptionType === selectedAlertType;
    });
    if(!mappedAlert) return;

    const data = new FormData();

    const { imageUrl = undefined, audioUrl = undefined } = unsavedAlertsMedia.get(selectedAlertType) ?? { };

    if(imageUrl) {
        const imageBlob = await fetch(imageUrl).then(r => r.blob());
        data.append('imageBlob', imageBlob, unsavedAlert.imageFile ?? undefined);
    }
    if(audioUrl) {
        const audioBlob = await fetch(audioUrl).then(r => r.blob());
        data.append('audioBlob', audioBlob, unsavedAlert.audioFile ?? undefined);
    }
    if(unsavedAlert.audioVolume) data.append('audioVolume', unsavedAlert.audioVolume.toString());
    if(unsavedAlert.alertDuration) data.append('alertDuration', unsavedAlert.alertDuration.toString());
    if(unsavedAlert.alertText) data.append('alertText', unsavedAlert.alertText);
    data.append('subscriptionId', mappedAlert.subscriptionId);

    const res = await fetch('/slither/alerts', {
        method: 'POST',
        body: data
    });

    if(res.ok) {

        if(unsavedAlert.imageFile) mappedAlert.imageFile = unsavedAlert.imageFile;
        if(unsavedAlert.audioFile) mappedAlert.audioFile = unsavedAlert.audioFile;
        if(unsavedAlert.audioVolume) mappedAlert.audioVolume = unsavedAlert.audioVolume;
        if(unsavedAlert.alertDuration) mappedAlert.alertDuration = unsavedAlert.alertDuration;
        if(unsavedAlert.alertText) mappedAlert.alertText = unsavedAlert.alertText;
        (document.querySelector(`#${selectedAlertType}-alert-type-btn`) as HTMLButtonElement).textContent = mappedAlert.alertDescription;
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
    if(!alertBtn || !alertToRestore) {
        console.error('Expected alert type not found in underlying data (Oops I broke something)');
        return;
    }

    alertBtn.textContent = alertToRestore.alertDescription;
    await displayAlertDetails(alertToRestore);

}

function updateUnsavedAlert(attr: keyof alerttypes.EventAlertDetails, val: string | number) {

    const alertBtn = document.querySelector('.selected-alert');
    if(!alertBtn) return;
    const type = alertBtn.id.substring(0, alertBtn.id.indexOf('-')) as eventsubtypes.SubscriptionType;

    if(!unsavedAlertsMap.has(type)) {
        unsavedAlertsMap.set(type, {
            imageFile: null, imageFileName: null, audioFile: null, audioFileName: null,
            alertText: null, alertDuration: null, audioVolume: null, alertDescription: null
        });
        alertBtn.textContent += ' (UNSAVED)';
    }

    // Explanation: TypeScript can't express the relationship between a dynamic key and its corresponding value type.
    // i.e., the transpiler doesn't know to take the value of 'attr' and look at its possible assignment types, so I need
    // to cast the type of ALL of the properties of unsavedAlert to be (string | number | null)
    const unsavedAlert = unsavedAlertsMap.get(type) as Record<string, string | number | null>;
    unsavedAlert[attr] = val;

}

async function getAlertMediaBySubId(subId: string, getImage: boolean, getAudio: boolean): Promise<viewtypes.APIMedia | null> {

    console.log(`subId: ${subId}, getImage: ${getImage}, getAudio: ${getAudio}`);

    if(!getImage && !getAudio) return null;

    // Endpoint returns JSON with { imageBase64: <Blob>, imageFileName: <string>, imageFileMime: <string>
    //                              audioBase64: <Blob>, audioFileName: <string>, audioFileMime: <string>
    //                              subType: <SubscriptionType> }
    const response = await fetch(`/slither/alerts/media`, { method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' } ,
                                                               body: JSON.stringify({
                                                                   subId: subId,
                                                                   getImage: getImage,
                                                                   getAudio: getAudio
                                                               })
    });

    const resJson = await response.json();

    const APImedia: viewtypes.APIMedia = { subType: resJson.subType };

    if(resJson.imageBase64) {
        const binaryString = atob(resJson.imageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for(let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        APImedia.imageBlob = new Blob([bytes], { type: resJson.imageFileMime });
        APImedia.imageFileName = resJson.imageFileName;
    }

    if(resJson.audioBase64) {
        const binaryString = atob(resJson.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for(let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        APImedia.audioBlob = new Blob([bytes], { type: resJson.audioFileMime });
        APImedia.audioFileName = resJson.audioFileName;
    }

    return APImedia;

}

function categoryNameToButtonID(catName: string): string {

    return `${catName.toLowerCase().replace(' ', '')}-alerts-category-btn`

}