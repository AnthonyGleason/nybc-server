import { isTestingModeEnabled } from "@src/config/config";

export const stripe = require('stripe')(isTestingModeEnabled ? process.env.STRIPE_TEST_SIGNING_SECRET : process.env.STRIPE_SIGNING_SECRET);
