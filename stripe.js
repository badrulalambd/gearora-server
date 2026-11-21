import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPTE_SECRET_KEY)