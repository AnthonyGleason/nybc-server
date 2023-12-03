import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { salt } from "@src/constants/auth";
import { insertManyStoreItems } from "@src/controllers/item";
import { createMembership } from "@src/controllers/membership";
import { createOrder } from "@src/controllers/order";
import { createPromoCode } from "@src/controllers/promocode";
import { createNewUser } from "@src/controllers/user";
import { Address, CartInterface, Membership, PromoCode, User } from "@src/interfaces/interfaces";
import app from "@src/server";
import bcrypt from 'bcrypt';
import supertest from "supertest";

//insert store items for tests
export const createTestStoreItems = async function(){
  return await insertManyStoreItems([
    {
      'name': 'Plain Bagels',
      'dozenPrice': 44.95,
      'cat': 'bagel',
      'sixPrice': 24.95
    },
    {
      'name': 'Everything Bagels',
      'dozenPrice': 44.95,
      'cat': 'bagel',
      'sixPrice': 24.95
    },
    {
      'name': 'Sesame Bagels',
      'dozenPrice': 44.95,
      'cat': 'bagel',
      'sixPrice': 24.95
    },
    {
      'name': 'Olive Cream Cheese',
      'price': 19.95,
      'cat': 'spread',
    },
    {
      'name': 'Lox Cream Cheese',
      'dozenPrice': 19.95,
      'cat': 'spread'
    }
  ]);
};
export interface TestCreateUserRes{
  userID: string,
  userToken: string,
  membershipDocID: string
};

//create a user with membership
export const createUser = async function(
  isMembershipExpired:boolean,
  isAdmin:boolean,
  membershipTier:string,
  email:string
){
  //create user
  let userGroup = 'member';
  if (isAdmin) userGroup = 'admin';
  const userDoc:User = await createNewUser(
    'Test',
    'Test',
    email,
    await bcrypt.hash('pass',salt),
    new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
    false,
    userGroup
  );
  let membershipExpiryDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  if (isMembershipExpired) {
    membershipExpiryDate.setFullYear(membershipExpiryDate.getFullYear() - 1);
  } else {
    membershipExpiryDate.setFullYear(membershipExpiryDate.getFullYear() + 1);
  };

  //create membership doc
  const membershipDoc = await createMembership(
    userDoc._id.toString(),
    membershipExpiryDate,
    membershipTier
  );

  //sign in user
  const response = await supertest(app)
    .post('/api/users/login')
    .send({
      'email': email,
      'password': 'pass'
    });
  expect(response.status).toBe(HttpStatusCodes.OK);

  return {
    userID: userDoc._id.toString(),
    userToken: response.body.token,
    membershipDocID: membershipDoc._id.toString()
  };
};

// create a cart populated with dummy items
export const createPopulatedCart = async function (
  userToken: string,
  storeItemSelections: [{
    selection: string,
    itemID: string,
    updatedQuantity: number
  }]
) {
  // init with an empty cart
  let cartToken = await createEmptyCart();

  // create an array to store promises
  const updateCartPromises = storeItemSelections.map(async (
    selection: {
      selection: string,
      itemID: string,
      updatedQuantity: number
    }
  ) => {
    const response = await supertest(app)
      .put('/api/shop/carts')
      .set({
        'Authorization': `Bearer ${userToken}`,
        'cart-token': `Bearer ${cartToken}`
      })
      .send(selection);
    cartToken = response.body.cartToken;
  });
  // wait for all promises to resolve before logging cartToken
  await Promise.all(updateCartPromises);

  return cartToken;
};


//create an empty cart
export const createEmptyCart = async function():Promise<string>{
  const response = await supertest(app)
    .post('/api/shop/carts')
  expect(response.status).toBe(HttpStatusCodes.OK);
  return response.body.cartToken;
};

//request a payment intent
export const createTestingPaymentIntent = async function(userToken:string,cartToken:string){
  const response = await supertest(app)
    .post('/api/shop/carts/create-payment-intent')
    .set({
      'Authorization': `Bearer ${userToken}`,
      'cart-token': `Bearer ${cartToken}`
    });
  expect(response.status).toBe(HttpStatusCodes.OK);
  return response.body.paymentIntentToken;
};

//create a promo code doc
export const createPromoCodeDoc = async function(isExpired:boolean, isOutOfUses:boolean, codeName?:string, promoPerk?:string){
  let promoExpiryDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  let totalTimesUsed:number = 0;
  if (isOutOfUses) totalTimesUsed = 101; //set this to a number higher than total allowed uses
  
  if (isExpired) {
    promoExpiryDate.setFullYear(promoExpiryDate.getFullYear() - 1);
  } else {
    promoExpiryDate.setFullYear(promoExpiryDate.getFullYear() + 1);
  };
  const promoCodeDoc:PromoCode = await createPromoCode(
    codeName || 'TEST25',
    promoExpiryDate,
    'testuser',
    'test promo code',
    promoPerk || '25_PERCENT_OFF',
    100,
    false,
    totalTimesUsed
  );
  return promoCodeDoc;
};

//apply a promo code to a cart
export const applyPromoCodeToCart = async function(
  promoCodeInput:string,
  cartToken:string,
  userToken:string,
  paymentIntent:string,
){
  const response = await supertest(app)
    .put('/api/shop/promoCode')
    .set({
      'Authorization': `Bearer ${userToken}`,
      'cart-token': `Bearer ${cartToken}`
    })
    .send({
      'promoCodeInput': promoCodeInput,
      'clientSecret': paymentIntent
    });
  expect(response.status).toBe(HttpStatusCodes.OK);
  return(response.body.cartToken);
};

//get user data for user token
export const getUserDataByToken = async function(userToken:string){
  const response = await supertest(app)
    .get('/api/users/')
    .set({
      'Authorization': `Bearer ${userToken}`,
    })
  expect(response.status).toBe(HttpStatusCodes.OK);
  return response.body.user;
};

//place an order for user
export const placeOrderForUser = async function(userID:string,cartToken:string){
  const response = await supertest(app)
    .get('/api/shop/carts/verify')
    .set({
      'cart-token': `Bearer ${cartToken}`
    })
  const cart:CartInterface = await response.body.cart;
  const shippingAddress:Address = {
    line1: '123 Test RD',
    city: 'Test',
    state: 'NY',
    postal_code: '11105',
    country: 'USA',
    phone: '123-456-7890',
    fullName: 'Test User'
  };

  return await createOrder(
    userID,
    cart,
    shippingAddress,
    'Test gift message'
  );
};