import type { APIMedia, EventAlertCategory, EventAlertDetails, SubscriptionType } from "./types/viewtypes.js"

/* TELL TYPESCRIPT THAT THESE WILL BE IMPORTED FROM THE EJS TEMPLATE */
declare const defaultCategory: EventAlertCategory
declare const defaultAlertType: SubscriptionType
declare const alertsMap: Map<EventAlertCategory, Map<SubscriptionType, EventAlertDetails>>

/* DEFINE TYPES FOR PAGE ELEMENTS */
/**<audio> for the currently selected alert */
let alertAudioElement: HTMLAudioElement
/**<img> in the Alert Preview box, only visible during preview */
let alertImagePreviewElement: HTMLImageElement
/**<img> in the Set Image box, always visible */
let alertImageThumb: HTMLImageElement
/**<input> to define how long the alert should play */
let alertDurationInput: HTMLInputElement
/**Container <div> displaying all data for the currently selected alert category */
let alertOptionsContainer: HTMLDivElement
/**Container <div> for the buttons to select specific alert types */
let alertTypeButtonsContainer: HTMLDivElement
/**Container <div> for the alert preview, image/audio buttons and displays, and duration input */
let alertSettingsSection1: HTMLDivElement
/**Container <div> for the alert text and save/discard alert changes buttons */
let alertSettingsSection2: HTMLDivElement
/**Read-only <input> element displaying the file name for the current alert's audio */
let alertAudioFileNameInput: HTMLInputElement
/**Range type <input> to control the alert volume */
let alertAudioVolumeInput: HTMLInputElement
/**<input> for the text to display when playing the alert */
let alertTextInput: HTMLInputElement
/**Invisible <input> element triggered by Set Image button<input>  */
let alertImageFileInput: HTMLInputElement
/**<button> which triggers the alert image input element */
let alertImageFileButton: HTMLButtonElement
/**Invisible <input> element triggered by Set Audio button */
let alertAudioFileInput: HTMLInputElement
/**<button> which triggers the alert audio input element */
let alertAudioFileButton: HTMLButtonElement
/**<button> which plays the current audio src in the audio input element */
let playAudioButton: HTMLButtonElement
/**<input> containing the Alerts URL specific to the user */
let alertsUrlInput: HTMLInputElement

/* DATA STRUCTURES USED IN FRONTEND LOGIC */
/**Store the details of the alert for each subscription type which has been changed but not saved by the user */
const unsavedAlertsMap: Map<EventAlertCategory, Map<SubscriptionType, EventAlertDetails>> = new Map([]) // keys are sub types instead of categories
/**Map the last alert that the user had selected for each category */
const lastAlertTypeForCategory: Map<EventAlertCategory, SubscriptionType> = new Map([]) // keys are categories, values are sub types

/**The currently selected alert category */
let selectedCategory = defaultCategory
/**The currently selected alert type */
let selectedAlertType = defaultAlertType
/**Save the timeout for the alert preview so that it can be cleared manually if the user takes certain actions while an alert preview is playing */
let alertPreviewTimeout: number | null = null

/**Data to use if the user has not uploaded or input anything for an alert type */
const DEFAULT_ALERT_DETAILS = {
    imageFileName: '',
    audioFileName: '(None)',
    alertText: '',
    alertDuration: 8000,
    audioVolume: 20,
    alertDescription: ''
}

/*******************************************PAGE SETUP*******************************************/

document.addEventListener('DOMContentLoaded', initializePage)

/** Page Setup */
async function initializePage(): Promise<void> {

    initElementReferences()
    await initEventListeners()

    alertImageFileInput.setAttribute('accept', 'image/apng, image/avif, image/gif, image/jpeg, image/png, image/svg+xml, image/webp')
    alertAudioFileInput.setAttribute('accept', 'audio/mpeg, audio/wav, audio/mp4')
    alertAudioFileNameInput.readOnly = true

    document.querySelector(`#${categoryNameToButtonID(defaultCategory)}`)?.classList.add('selected-category')
    document.querySelector(`#${alertNameToButtonID(defaultAlertType)}`)?.classList.add('selected-alert')
    
    await displayAlertDetails(defaultCategory, defaultAlertType)

    lastAlertTypeForCategory.set(defaultCategory, defaultAlertType)

}

/** Set up event listeners for known elements at the time of page load */
async function initEventListeners(): Promise<void> {

    alertImageFileInput?.addEventListener('change', setAlertImageFile)
    alertImageFileButton?.addEventListener('click', imageFileInputBtnClicked)
    alertAudioFileInput?.addEventListener('change', setAlertAudioFile)
    alertAudioFileButton?.addEventListener('click', audioFileInputBtnClicked)
    alertAudioVolumeInput?.addEventListener('input', setAlertAudioVolume)
    alertDurationInput?.addEventListener('input', setAlertDuration)
    alertTextInput?.addEventListener('input', setAlertText)
    playAudioButton?.addEventListener('click', playAudioBtnClicked)

    document.querySelector('#alert-preview-btn')?.addEventListener('click', previewAlert)
    document.querySelector('#copy-alerts-url-btn')?.addEventListener('click', copyAlertsUrlToClipboard)
    document.querySelector('#save-alert-btn')?.addEventListener('click', uploadAlert)
    document.querySelector('#discard-changes-btn')?.addEventListener('click', discardAlertChanges)
    document.querySelectorAll('.alerts-category-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            await switchAlertCategory(btn.textContent as EventAlertCategory)
        })
    })
}

/** Make it easier to refer to page elements elsewhere */
function initElementReferences(): void {

    alertAudioElement = document.querySelector('#alert-audio') as HTMLAudioElement
    alertImagePreviewElement = document.querySelector('#alert-img') as HTMLImageElement
    alertImageThumb = document.querySelector('#alert-img-thumb') as HTMLImageElement
    alertDurationInput = document.querySelector('#alert-duration-input') as HTMLInputElement
    alertOptionsContainer = document.querySelector('#alert-options-container') as HTMLDivElement
    alertTypeButtonsContainer = document.querySelector('#alert-type-buttons-container') as HTMLDivElement
    alertSettingsSection1 = document.querySelector('#alert-settings-section-1') as HTMLDivElement
    alertSettingsSection2 = document.querySelector('#alert-settings-section-2') as HTMLDivElement
    alertAudioFileNameInput = document.querySelector('#alert-audio-filename') as HTMLInputElement
    alertAudioVolumeInput = document.querySelector('#audio-volume-input') as HTMLInputElement
    alertTextInput = document.querySelector('#alert-text-input') as HTMLInputElement
    alertImageFileInput = document.querySelector('#image-file-input') as HTMLInputElement
    alertImageFileButton = document.querySelector('#image-file-input-btn') as HTMLButtonElement
    alertAudioFileInput = document.querySelector('#audio-file-input') as HTMLInputElement
    alertAudioFileButton = document.querySelector('#audio-file-input-btn') as HTMLButtonElement
    playAudioButton = document.querySelector('#play-audio-btn') as HTMLButtonElement
    
    alertsUrlInput = document.querySelector('#alerts-url-field') as HTMLInputElement
}

/** Update of all elements in the #alert-options-container div and update styling to reflect selected elements */
async function switchAlertCategory(newCategory: EventAlertCategory): Promise<void> {

    // Make sure we actually have a new category and data for it
    if(newCategory === selectedCategory) return
    const alertsForCategory = alertsMap.get(newCategory)
    if(!alertsForCategory) return

    // Create the buttons for the different alert types in the category and place them into their container
    const alertTypeButtons: HTMLButtonElement[] = []
    for(const [newSubType, alertDetails] of alertsForCategory) {
        const newButton = document.createElement('button')
        newButton.setAttribute('id', `${alertNameToButtonID(newSubType)}`)
        newButton.classList.add('alert-type-btn')
        newButton.addEventListener('click', async () => {
            await changeSelectedAlert(newSubType)
        })
        newButton.tabIndex = 0

        newButton.textContent = alertDetails.alertDescription ?? ''
        if(unsavedAlertsMap.get(newCategory)?.get(newSubType)) newButton.textContent += ' (UNSAVED)'

        alertTypeButtons.push(newButton)

    }
    alertTypeButtonsContainer.replaceChildren(...alertTypeButtons)

    // Put the settings containers in the correct order and then place them into their parent container
    const optionsSections = []
    optionsSections.push(alertTypeButtonsContainer)
    optionsSections.push(alertSettingsSection1)
    optionsSections.push(alertSettingsSection2)
    alertOptionsContainer.replaceChildren(...optionsSections)
    
    // Remove styling from the old selected category and apply it to the newly selected one, then update the reference
    document.querySelector(`#${categoryNameToButtonID(selectedCategory)}`)?.classList.remove('selected-category')
    document.querySelector(`#${categoryNameToButtonID(newCategory)}`)?.classList.add('selected-category')
    selectedCategory = newCategory
    
    // Now on to displaying the correct alert
    await changeSelectedAlert(lastAlertTypeForCategory.get(newCategory) ?? alertsForCategory.keys().next().value)

}

/** Clean up any previously displayed alert details and set up the page with a newly selected alert */
async function changeSelectedAlert(type: SubscriptionType | undefined): Promise<void> {

    // Basic alert type validation
    if(!type) {
        console.error(`Did not receive an alert type when trying to change selected alert.`)
        return
    }
    if(type === selectedAlertType) return

    // Clear out displayed alert media, and if a preview is playing, stop its ending timeout
    if(alertPreviewTimeout) clearTimeout(alertPreviewTimeout)
    alertImageThumb.setAttribute('src', '')
    alertImagePreviewElement.setAttribute('src', '')
    alertAudioElement.setAttribute('src', '')

    // Remove styling from the previously selected alert if applicable and then apply it to the newly selected one
    document.querySelector(`#${alertNameToButtonID(selectedAlertType)}`)?.classList.remove('selected-alert')
    document.querySelector(`#${alertNameToButtonID(type)}`)?.classList.add('selected-alert')
    
    // Update the state variables for the currently selected alert and move on to displaying the appropriate alert details
    selectedAlertType = type
    lastAlertTypeForCategory.set(selectedCategory, selectedAlertType)
    await displayAlertDetails(selectedCategory, selectedAlertType)

}

// TODO: Refactor for one-file-per-request
/** Display the details for the currently selected alert. If the user has entered unsaved data, display it. Otherwise, show the details
 *  for the currently saved alert on the server.
 */
async function displayAlertDetails(category: EventAlertCategory, alertType: SubscriptionType): Promise<void> {

    // Basic validation. There should always be an entry for all valid category and event types.
    const mappedAlert = alertsMap.get(category)?.get(alertType)
    if(!mappedAlert) {
        console.error(`Oops, something is broken. Alert details were requested for an unmapped alert. Category: ${category} Type: ${alertType}`)
        return
    }

    // Prioritize displaying any unsaved changes made by the user before the server data
    const unsavedAlert = unsavedAlertsMap.get(category)?.get(alertType)

    const volumeVal = unsavedAlert?.audioVolume ?? mappedAlert.audioVolume
    const durationVal = unsavedAlert?.alertDuration ?? mappedAlert.alertDuration
    const textVal = unsavedAlert?.alertText ?? mappedAlert.alertText
    const audioFileName = unsavedAlert?.audioFileName ?? mappedAlert.audioFileName
    const imageFileName = unsavedAlert?.imageFileName ?? mappedAlert.imageFileName
    
    // Now is the time to download any media from the server if the user hasn't already.
    // Tell the function to retrieve an image or audio file from the server only if
    // - (1) there is no existing URL to use (no imageUrl / audioUrl in the data structures)
    // - AND
    // - (2) there exists a file on the server to retrieve (successfully received a filename from the server)
    let imageUrl = unsavedAlert?.imageUrl ?? mappedAlert.imageUrl
    const getImage = !imageUrl && imageFileName
    const apiImage = getImage ? await getAlertMedia(mappedAlert.subscriptionId, `image`) : undefined
    imageUrl = apiImage?.fileBlob ? URL.createObjectURL(apiImage.fileBlob) : imageUrl

    let audioUrl = unsavedAlert?.audioUrl ?? mappedAlert.audioUrl
    const getAudio = !audioUrl && audioFileName
    const apiAudio = getAudio ? await getAlertMedia(mappedAlert.subscriptionId, `audio`) : undefined
    audioUrl = apiAudio?.fileBlob ? URL.createObjectURL(apiAudio.fileBlob) : audioUrl

    // The appropriate alert details have been worked out. Display them. Use default values if the user has never interacted
    // with the current alert type before.
    alertAudioFileNameInput.value = audioFileName ?? DEFAULT_ALERT_DETAILS.audioFileName
    alertAudioVolumeInput.value = ((volumeVal ?? DEFAULT_ALERT_DETAILS.audioVolume) / 100).toString()
    alertDurationInput.value = ((durationVal ?? DEFAULT_ALERT_DETAILS.alertDuration) / 1000).toString()
    alertTextInput.value = textVal ?? DEFAULT_ALERT_DETAILS.alertText
    alertImageThumb.setAttribute('src', imageUrl ?? '')
    alertAudioElement.setAttribute('src', audioUrl ?? '')

}

/** Identify all of the unsaved alert changes entered by the user and upload them to the server */
async function uploadAlert() {

    // We must have some unsaved data to upload or this is pointless
    const unsavedAlert = unsavedAlertsMap.get(selectedCategory)?.get(selectedAlertType)
    if(!unsavedAlert) return

    // The currently selected alert type should never be undefined in the alerts map
    const mappedAlert = alertsMap.get(selectedCategory)?.get(selectedAlertType)
    if(!mappedAlert) return

    const data = new FormData()

    // Upload all unsaved data
    if(unsavedAlert.imageUrl) {
        const imageBlob = await fetch(unsavedAlert.imageUrl).then(r => r.blob())
        data.append('imageBlob', imageBlob, unsavedAlert.imageFileName ?? undefined)
    }
    if(unsavedAlert.audioUrl) {
        const audioBlob = await fetch(unsavedAlert.audioUrl).then(r => r.blob())
        data.append('audioBlob', audioBlob, unsavedAlert.audioFileName ?? undefined)
    }
    if(unsavedAlert.audioVolume) data.append('audioVolume', unsavedAlert.audioVolume.toString())
    if(unsavedAlert.alertDuration) data.append('alertDuration', unsavedAlert.alertDuration.toString())
    if(unsavedAlert.alertText) data.append('alertText', unsavedAlert.alertText)
    data.append('subscriptionId', mappedAlert.subscriptionId)

    // TODO: Changed this to PUT. Verify it still works...
    const res = await fetch('/slither/media', {
        method: 'PUT',
        body: data
    })

    // For any data that were uploaded to the server, update alertsMap and then clear out the entry from the unsaved alerts data
    if(res.ok) {

        if(unsavedAlert.imageFileName !== null) mappedAlert.imageFileName = unsavedAlert.imageFileName
        if(unsavedAlert.audioFileName !== null) mappedAlert.audioFileName = unsavedAlert.audioFileName
        if(unsavedAlert.audioVolume) mappedAlert.audioVolume = unsavedAlert.audioVolume
        if(unsavedAlert.alertDuration) mappedAlert.alertDuration = unsavedAlert.alertDuration
        if(unsavedAlert.alertText !== null) mappedAlert.alertText = unsavedAlert.alertText
        
        const alertTypeBtn = document.querySelector(`#${alertNameToButtonID(selectedAlertType)}`) as HTMLButtonElement
        alertTypeBtn.textContent = mappedAlert.alertDescription

        unsavedAlertsMap.get(selectedCategory)?.delete(selectedAlertType)
        
    }

}

/** Restore all data that matches what we have on the server, discarding any unsaved changed the user has entered */
async function discardAlertChanges() {

    // Make sure we have anything to do
    const unsavedAlert = unsavedAlertsMap.get(selectedCategory)?.get(selectedAlertType)
    if(!unsavedAlert) return

    // Revoke the URLs for any unsaved image and audio files, and clear them from any elements they are referenced by
    if(unsavedAlert.audioUrl) {
        alertAudioElement.removeAttribute('src')
        alertAudioFileInput.value = ''
        URL.revokeObjectURL(unsavedAlert.audioUrl)
    }
    if(unsavedAlert.imageUrl) {
        if(alertPreviewTimeout) { clearTimeout(alertPreviewTimeout) }
        alertImageThumb.removeAttribute('src')
        alertImagePreviewElement.removeAttribute('src')
        alertImageFileInput.value = ''
        URL.revokeObjectURL(unsavedAlert.imageUrl)
    }

    // Delete the entry from the unsaved alerts map and update the text on the alert type button
    unsavedAlertsMap.get(selectedCategory)?.delete(selectedAlertType)

    const alertTypeBtn = document.querySelector(`#${alertNameToButtonID(selectedAlertType)}`) as HTMLButtonElement
    const description = alertsMap.get(selectedCategory)?.get(selectedAlertType)?.alertDescription
    alertTypeBtn.textContent = description ?? 'Error'


    await displayAlertDetails(selectedCategory, selectedAlertType)

}

async function getAlertMedia(subId: string, mediaType: ('image' | 'audio')): Promise<APIMedia | null> {

    console.log(`subId: ${subId}, mediaType: ${mediaType}`)

    // Endpoint returns JSON with { base64: <Blob>, fileName: <string>, fileMime <string> }
    const response = await fetch(`/slither/media/${subId}/${mediaType}`, { method: 'GET',
                                                            headers: { 'Content-Type': 'application/json' }
    })

    const resJson = await response.json()
    const fileBlob = base64ToBlob(resJson.base64, resJson.fileMime)
    return { fileBlob, fileName: resJson.fileName, fileMime: resJson.fileMime }

}

/******************************************DATA MANIPULATION******************************************/
function base64ToBlob(base64: any, mimeType: any) {

    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for(let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return new Blob([bytes], { type: mimeType })

}

/******************************************SPECIFIC USER INTERACTIONS******************************************/

async function copyAlertsUrlToClipboard() {

    const textToCopy = alertsUrlInput.value
    await copyTextToClipboard(textToCopy)

}

function previewAlert() {

    if(alertPreviewTimeout) clearTimeout(alertPreviewTimeout)
    alertImagePreviewElement.setAttribute('src', alertImageThumb.src)
    playAlertAudio()
    alertPreviewTimeout = window.setTimeout(() => {
        alertImagePreviewElement.removeAttribute('src')
        stopAlertAudio()
    }, parseFloat(alertDurationInput.value) * 1000)

}

/***************************************SET A SINGLE ALERT DETAIL TYPE EVENTS***************************************/

function setAlertImageFile() {

    // Make sure we got a file
    if(!alertImageFileInput.files) return
    const file = alertImageFileInput.files[0]
    if(!file) return

    // TODO: Check file type

    // If the current alert already has an unsaved image URL, revoke it before creating the new one.
    const unsavedImageUrl = unsavedAlertsMap.get(selectedCategory)?.get(selectedAlertType)?.imageUrl
    if(unsavedImageUrl) URL.revokeObjectURL(unsavedImageUrl)

    // Create new object URL for the uploaded file, display it in the thumbnail preview, and update the unsaved alerts map
    const blobURL = URL.createObjectURL(file)
    alertImageThumb.setAttribute('src', blobURL)
    alertImagePreviewElement.setAttribute('src', blobURL)
    updateUnsavedAlert('imageFileName', file.name)
    updateUnsavedAlert('imageUrl', blobURL)

    // Clear the value of the image file input
    alertImageFileInput.value = ''

}

function setAlertAudioFile() {

    // Make sure we got a file
    if(!alertAudioFileInput.files) return
    const file = alertAudioFileInput.files[0]
    if(!file) return

    // TODO: Check file type
    
    // If the current alert already has an unsaved image URL, revoke it before creating the new one.
    const unsavedAudioUrl = unsavedAlertsMap.get(selectedCategory)?.get(selectedAlertType)?.audioUrl
    if(unsavedAudioUrl) URL.revokeObjectURL(unsavedAudioUrl)

    // Create new object URL for the uploaded file, plug it into the audio element's src attribute, and update the unsaved alerts map
    const blobURL = URL.createObjectURL(file)
    alertAudioFileNameInput.value = file.name
    alertAudioElement.setAttribute('src', blobURL)
    updateUnsavedAlert('audioFileName', file.name)
    updateUnsavedAlert('audioUrl', blobURL)

    // Clear the value of the audio file input
    alertAudioFileInput.value = ''
    
}

function setAlertAudioVolume() {

    const newVolume = alertAudioVolumeInput.valueAsNumber
    alertAudioElement.volume = newVolume
    updateUnsavedAlert('audioVolume', newVolume * 100)
    
}

function setAlertDuration() {
    
    updateUnsavedAlert('alertDuration', parseFloat(alertDurationInput.value) * 1000)

}

function setAlertText() {

    updateUnsavedAlert('alertText', alertTextInput.value)

}

/***************************************BUTTON CLICKED TYPE EVENTS***************************************/

function imageFileInputBtnClicked() {

    alertImageFileInput.click()

}

function audioFileInputBtnClicked() {

    alertAudioFileInput.click()

}

function playAudioBtnClicked() {

    playAlertAudio()

}

/*******************************PAGE FUNCTIONALITY HELPERS*******************************/

function updateUnsavedAlert(attr: keyof EventAlertDetails, val: string | number): void {

    const subId = alertsMap.get(selectedCategory)?.get(selectedAlertType)?.subscriptionId
    if(!subId) {
        console.error(`Could not obtain subscription ID for alert. Category: ${selectedCategory} Alert Type: ${selectedAlertType}`)
        return
    }

    if(!unsavedAlertsMap.has(selectedCategory)) unsavedAlertsMap.set(selectedCategory, new Map())
    if(!unsavedAlertsMap.get(selectedCategory)?.has(selectedAlertType)) {
        unsavedAlertsMap.get(selectedCategory)?.set(selectedAlertType, {
            subscriptionId: subId,
            imageFileName: null,
            audioFileName: null,
            alertText: null,
            alertDuration: null,
            audioVolume: null,
            alertDescription: null
    })
    
    const selectedAlertBtn = document.querySelector('.selected-alert') as HTMLButtonElement
    selectedAlertBtn.textContent += ' (UNSAVED)'
    }

    // Explanation: TypeScript can't express the relationship between a dynamic key and its corresponding value type.
    // i.e., the transpiler doesn't know to take the value of 'attr' and look at its possible assignment types, so I need
    // to cast the type of ALL of the properties of unsavedAlert to be (string | number | null)
    const unsavedAlert = unsavedAlertsMap.get(selectedCategory)?.get(selectedAlertType) as Record<string, string | number | null>
    unsavedAlert[attr] = val

}

function playAlertAudio() {

    alertAudioElement.currentTime = 0
    alertAudioElement.play().catch((_err: Error) => { })

}

function stopAlertAudio() {

    alertAudioElement.pause()
    alertAudioElement.currentTime = 0

}

function categoryNameToButtonID(catName: string): string {

    return `${catName.toLowerCase().replace(' ', '')}-alerts-category-btn`

}

function alertNameToButtonID(alertName: string): string {

    return `${alertName}-alert-type-btn`

}

async function copyTextToClipboard(text: string) {

    try {
        await navigator.clipboard.writeText(text)
    } catch(err) {
        console.error(`Error copying to clipboard: ${err}`)
    }

}