import { initEventAlerts } from '../db/queries/eventalerts.js';

export async function initialize() {

    await initEventAlerts();

}

export * as default from './eventalertsclient.js';