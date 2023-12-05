import { isTestingModeEnabled } from "@src/config/config";

export const stripe = require('stripe')(isTestingModeEnabled ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_KEY);
