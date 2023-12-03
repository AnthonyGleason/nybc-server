import mongoose from "mongoose";
import { TestCreateUserRes, applyPromoCodeToCart, createEmptyCart, createPopulatedCart, createPromoCodeDoc, createTestStoreItems, createTestingPaymentIntent, createUser, placeOrderForUser} from "./shopTestsHelpers";
import supertest from "supertest";
import app from "@src/server";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { BagelItem, Order, PendingOrder, PromoCode, SpreadItem } from "@src/interfaces/interfaces";
import { getPendingOrderDocByCartToken } from "@src/controllers/pendingOrder";

//add price and variable verification where applicable (ensure fields are still the same)

describe("shop",()=>{
  describe("checkout",()=>{
    describe("checkout cart",()=>{

    });
    describe("receive placed order webhook from stripe",()=>{

    });
    describe("create a tax calculation for a cart",()=>{

    });
    describe("get a payment intent from stripe",()=>{

    });
  });
  describe("cart",()=>{
    describe("handle promo code",()=>{
      describe("get current cart promo code data",()=>{
        let createUserResponse: TestCreateUserRes;
        let cartToken:string = '';
        let promoCodeDoc:PromoCode;
        let emptyCartToken:string = '';
        let storeItems;

        beforeAll(async()=>{
          //create the user
          createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
          //add store items
          storeItems = await createTestStoreItems();
          //create a cart with items
          cartToken = await createPopulatedCart(
            createUserResponse.userToken,
            [{
              selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
              itemID: storeItems[0]._id.toString(),
              updatedQuantity: 2
            }]
          );
          //create a payment intent
          const paymentIntentSecret:string = await createTestingPaymentIntent(createUserResponse.userToken,cartToken);
          //create a promo code
          promoCodeDoc = await createPromoCodeDoc(false,false);
          //apply the promo
          cartToken = await applyPromoCodeToCart(
            promoCodeDoc.code,
            cartToken,
            createUserResponse.userToken,
            paymentIntentSecret
          );

          //create the empty cart token
          emptyCartToken = await createEmptyCart();
        });
        afterAll(async()=>{
          await mongoose.connection.dropDatabase();
        });
        it('should return unauthorized if no login token was provided',async()=>{
          const response = await supertest(app)
            .get('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer`,
              'cart-token': `Bearer ${cartToken}`
            });
          expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
        });
        it('should return forbidden if no cart token was provided',async()=>{
          const response = await supertest(app)
            .get('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer `
            });
          expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
        });
        it('should return forbidden if a cart token was provided but incorrect',async()=>{
          const response = await supertest(app)
            .get('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer 123`
            });
          expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
        });
        it('should return not found if a promo code is not applied to the users cart',async()=>{
          const response = await supertest(app)
            .get('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer ${emptyCartToken}`
            });
          expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
        });
        it('should get the promocode data for the promo code in cart',async()=>{
          const response = await supertest(app)
            .get('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer ${cartToken}`
            });
          expect(response.status).toBe(HttpStatusCodes.OK);
          expect(response.body.discountAmount).toBe(22.475); //(44.95 each dozen * 2) then take 25% of that
          expect(response.body.isPromoApplied).toBe(true);
          expect(response.body.promoCodeName).toBe(promoCodeDoc.code);
        });
      });
      describe("add promo code to the users cart",()=>{
        describe('handles errors correctly', ()=>{
          let createUserResponse: TestCreateUserRes;
          let cartToken:string = '';
          let promoCodeDoc:PromoCode;
          let storeItems;
          let paymentIntentSecret:string;
          let expiredPromoCodeDoc:PromoCode;
          let outOfUsesPromoCodeDoc:PromoCode;

          beforeAll(async()=>{
            //create the user
            createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
            //add store items
            storeItems = await createTestStoreItems();
            //create a cart with items
            cartToken = await createPopulatedCart(
              createUserResponse.userToken,
              [{
                selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              }]
            );
            //create a payment intent
            paymentIntentSecret = await createTestingPaymentIntent(createUserResponse.userToken,cartToken);
            //create a promo code
            promoCodeDoc = await createPromoCodeDoc(false,false);
            //apply the promo
            cartToken = await applyPromoCodeToCart(
              promoCodeDoc.code,
              cartToken,
              createUserResponse.userToken,
              paymentIntentSecret
            );
            //create the expired promoCode doc
            expiredPromoCodeDoc = await createPromoCodeDoc(true,false,'expired');
            outOfUsesPromoCodeDoc = await createPromoCodeDoc(false,true,'outofuses');
          });
          afterAll(async()=>{
            await mongoose.connection.dropDatabase();
          });
          it('should return unauthorized if no login token was provided',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer `,
                'cart-token': `Bearer ${cartToken}`
              })
            expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
          });
          it('should return unauthorized if no cart token was provided',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer `
              })
            expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
          });
          it('should return forbidden if a cart token was provided but incorrect',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer 123`
              })
            expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
          });
          it('should return bad request on missing fields',async()=>{
            const missingFields = ['clientSecret','promoCodeInput'];
    
            for (const field of missingFields) {
              const body:any = {
                clientSecret: paymentIntentSecret,
                promoCodeInput: promoCodeDoc.code
              };
              body[field] = undefined;
        
              const response = await supertest(app)
                .put('/api/shop/promoCode')
                .set({
                  'Authorization': `Bearer ${createUserResponse.userToken}`,
                  'cart-token': `Bearer ${cartToken}`
                })
                .send(body);
              expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
            }
          });
          it('should return not found if a promo code doc does not exist for the promo code id in cart',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              })
              .send({
                clientSecret: paymentIntentSecret,
                promoCodeInput: '123'
              });
            expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
          });
          it('should return forbidden if the promo code is past its expiration date',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              })
              .send({
                clientSecret: paymentIntentSecret,
                promoCodeInput:expiredPromoCodeDoc.code
              });
            expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
          });
          it('should return forbidden if there are no uses left on the promo code',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              })
              .send({
                clientSecret: paymentIntentSecret,
                promoCodeInput: outOfUsesPromoCodeDoc.code
              });
            expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
          });
        });
        describe('code is updated',()=>{
          let createUserResponse: TestCreateUserRes;
          let cartToken:string = '';
          let promoCodeDoc:PromoCode;
          let storeItems;
          let paymentIntentSecret:string;
          let createAdminResponse: TestCreateUserRes;
          let secondPromoCodeDoc: PromoCode;
          beforeAll(async()=>{
            //create the user
            createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
            //add store items
            storeItems = await createTestStoreItems();
            //create a cart with items
            cartToken = await createPopulatedCart(
              createUserResponse.userToken,
              [{
                selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              }]
            );
            //create a payment intent
            paymentIntentSecret = await createTestingPaymentIntent(createUserResponse.userToken,cartToken);
            //create a promo code
            promoCodeDoc = await createPromoCodeDoc(false,false);
            createAdminResponse = await createUser(false,true,'Non-Member','testadmin@nybagelsclub.com');
            secondPromoCodeDoc = await createPromoCodeDoc(false,false,'test15','15_PERCENT_OFF');
          },10000);
          afterAll(async()=>{
            await mongoose.connection.dropDatabase();
          });
          it('should correctly apply the promo code to the users cart',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              })
              .send({
                'promoCodeInput': promoCodeDoc.code,
                'clientSecret': paymentIntentSecret
              });
            expect(response.status).toBe(HttpStatusCodes.OK);
            expect(response.body.discountAmount).toBe(22.475);
            cartToken = response.body.cartToken;
            //get cart data and verify it is correct
            const cartDataResponse = await supertest(app)
              .get('/api/shop/carts/verify')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              });
            expect(cartDataResponse.status).toBe(HttpStatusCodes.OK);
            expect(cartDataResponse.body.cart.discountAmountInDollars).toBe(22.475);
            expect(cartDataResponse.body.cart.totalQuantity).toBe(2);
            expect(cartDataResponse.body.cart.promoCodeID.toString()).toBe(promoCodeDoc._id.toString());
            expect(cartDataResponse.body.cart.finalPriceInDollars).toBeCloseTo(67.425);
            expect(cartDataResponse.body.cart.subtotalInDollars).toBe(89.9);
          });
          it('should correctly update the promo code doc uses after being applied',async()=>{
            // RELIES ON THE ABOVE TEST TO SAVE ON COMPUTING TIME
            const response = await supertest(app) 
              .get('/api/admin/promoCode')
              .set({
                'Authorization': `Bearer ${createAdminResponse.userToken}`
              })
            expect(response.status).toBe(HttpStatusCodes.OK);
            expect(response.body.promoCodeData[0].totalTimesUsed).toBe(1);
            expect(response.body.promoCodeData[0].totalAllowedUses).toBe(100); //see the createPromoCodeDoc helper for why this is 100
          });
          it('should create a pending order doc if one does not exist',async()=>{
            //also relies on the above first test in this block see above
            const pendingOrderDoc:PendingOrder | null = await getPendingOrderDocByCartToken(cartToken)
            expect(pendingOrderDoc).toBeDefined();
            expect(pendingOrderDoc?.cartToken).toBe(cartToken);
            expect(pendingOrderDoc?.userID).toBe(createUserResponse.userID.toString());
            expect(pendingOrderDoc?.dateCreated).toBeDefined();
          });
          it('should correctly update a new promo code and replace the old one',async()=>{
            const response = await supertest(app)
              .put('/api/shop/promoCode')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              })
              .send({
                'promoCodeInput': secondPromoCodeDoc.code,
                'clientSecret': paymentIntentSecret
              });
            expect(response.status).toBe(HttpStatusCodes.OK);
            expect(response.body.discountAmount).toBeCloseTo(13.485);
            expect(response.body.cartToken).toBeDefined();
            cartToken = response.body.cartToken;
            //get cart data and verify it is correct
            const cartDataResponse = await supertest(app)
              .get('/api/shop/carts/verify')
              .set({
                'Authorization': `Bearer ${createUserResponse.userToken}`,
                'cart-token': `Bearer ${cartToken}`
              });
            expect(cartDataResponse.status).toBe(HttpStatusCodes.OK);
            expect(cartDataResponse.body.cart.discountAmountInDollars).toBeCloseTo(13.485);
            expect(cartDataResponse.body.cart.totalQuantity).toBe(2);
            expect(cartDataResponse.body.cart.promoCodeID.toString()).toBe(secondPromoCodeDoc._id.toString());
            expect(cartDataResponse.body.cart.finalPriceInDollars).toBeCloseTo(76.415);
            expect(cartDataResponse.body.cart.subtotalInDollars).toBe(89.9);
            //ensure uses is updated for new code
            const secondPromoCodeRes = await supertest(app) 
              .get('/api/admin/promoCode')
              .set({
                'Authorization': `Bearer ${createAdminResponse.userToken}`
              })
            expect(secondPromoCodeRes.status).toBe(HttpStatusCodes.OK);
            expect(secondPromoCodeRes.body.promoCodeData[1].totalTimesUsed).toBe(1); //using index [1] because the first promo code is 25% off we already verified that above
            expect(secondPromoCodeRes.body.promoCodeData[1].totalAllowedUses).toBe(100);
          });
        });
      });
      describe("remove promo code from cart",()=>{
        let createUserResponse: TestCreateUserRes;
        let cartToken:string = '';
        let promoCodeDoc:PromoCode;
        let storeItems;
        let paymentIntentSecret:string = '';
        beforeAll(async()=>{
          //create the user
          createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
          //add store items
          storeItems = await createTestStoreItems();
          //create a cart with items
          cartToken = await createPopulatedCart(
            createUserResponse.userToken,
            [{
              selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
              itemID: storeItems[0]._id.toString(),
              updatedQuantity: 2
            }]
          );
          //create a payment intent
          paymentIntentSecret = await createTestingPaymentIntent(createUserResponse.userToken,cartToken);
          //create a promo code
          promoCodeDoc = await createPromoCodeDoc(false,false);
          //apply the promo
          cartToken = await applyPromoCodeToCart(
            promoCodeDoc.code,
            cartToken,
            createUserResponse.userToken,
            paymentIntentSecret
          );
          //create a second cart
          //create the payment intent for the second cart
        });
        afterAll(async()=>{
          await mongoose.connection.dropDatabase();
        });
        it('should return unauthorized if no login token was provided',async()=>{
          const response = await supertest(app)
            .delete('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer `,
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              clientSecret: paymentIntentSecret
            });
          expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
        });
        it('should return bad request if a client secret was not provided',async()=>{
          const response = await supertest(app)
            .delete('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer ${cartToken}`
            });
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        });
        it('should return unauthorized if no cart token was provided',async()=>{
          const response = await supertest(app)
            .delete('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer `
            });
          expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
        });
        it('should return forbidden if a cart token was provided but incorrect',async()=>{
          const response = await supertest(app)
            .delete('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer 123`
            });
          expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
        });
        it('should return not found if no membership doc was found',async()=>{
          expect(true).toBe(false);
        });
        it('should return an error if a promo code is not applied to the users cart',async()=>{
          //see beforeAll currently working on this
          expect(true).toBe(false);
        });
        //the below test modifies the scoped cartToken ensure this is last
        it('should correctly remove the promo code from cart',async()=>{
          const response = await supertest(app)
            .delete('/api/shop/promoCode')
            .set({
              'Authorization': `Bearer ${createUserResponse.userToken}`,
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              'clientSecret': paymentIntentSecret
            });
          expect(response.status).toBe(HttpStatusCodes.OK);
          cartToken = response.body.cartToken;
          const cartRes = await supertest(app)
            .get('/api/shop/carts/verify')
            .set({
              'cart-token': `Bearer ${cartToken}`
            });
          expect(cartRes.status).toBe(HttpStatusCodes.OK);
          expect(cartRes.body.cart.discountAmountInDollars).toBe(0);
          expect(cartRes.body.cart.totalQuantity).toBe(2);
          expect(cartRes.body.cart.promoCodeID.toString()).toBe('');
          expect(cartRes.body.cart.finalPriceInDollars).toBeCloseTo(89.9);
          expect(cartRes.body.cart.subtotalInDollars).toBe(89.9);
        });
      });
    });
    describe('cart interactions',()=>{
      describe("add the desired ship date to cart",()=>{
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return bad request if a ship date was not provided.',()=>{

        });
        it('should update the cart with the desired ship date if no login token was provided',()=>{

        });
        it('should update the cart with the desired ship date if a login token was provided',()=>{

        });
      });
      describe("update the gift message field in the cart",()=>{
        it('should return bad request if a gift message was not provided',()=>{

        });
        it('should return unauthorized if no login token was provided',()=>{

        });
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should update the gift message for a users cart',()=>{

        });
      });
      describe("apply the users membership pricing to cart",()=>{
        it('should return not found if a membership doc does not exist for the user',()=>{

        });
        it('should return unauthorized if no login token was provided',()=>{

        });
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should apply non member pricing if the user is not logged in',()=>{

        });
        it('should apply non member pricing if the user does not have a membership doc',()=>{

        });
        it('should correctly apply a users membership tier pricing to cart',()=>{

        });
        it('should correctly apply membership pricing to cart',()=>{

        });
      });
    });
    describe('cart data handling',()=>{
      describe('verify a cart token',()=>{
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return the cart if the cart token is valid',()=>{

        });
      });
      describe('get the cart data for provided token',()=>{
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return not found if a user doc was not found',()=>{

        });
        it('should return not found if a membership doc was not found',()=>{

        });
        it('should get the correct cart data for the provided cart token',()=>{

        });
      });
      describe('create an empty cart',()=>{
        it('should create an empty cart',async()=>{
          const cartToken:string = await createEmptyCart();
          const response = await supertest(app)
            .get('/api/shop/carts/verify')
            .set({
              'cart-token': `Bearer ${cartToken}`
            });
          expect(response.status).toBe(HttpStatusCodes.OK);
          expect(response.body.cart.items.length).toBe(0);
        });
      });
      describe("update the cart based on the provided token",()=>{
        describe('throw errors when applicable',()=>{
          let nonMemberCartToken:string = '';
          let nonMemberUserRes:TestCreateUserRes;
          let storeItems:any;
          beforeAll(async()=>{
            nonMemberCartToken = await createEmptyCart();
            nonMemberUserRes = await createUser(false,false,'Non-Member','test@nybagelsclub.com')
            storeItems = await createTestStoreItems();
          });
          afterAll(async ()=>{
            await mongoose.connection.dropDatabase();
          })
          it('should return unauthorized if no cart token was provided',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer `,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              })
            expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
          });
          it('should return forbidden if a cart token was provided but incorrect',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer 123`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              })
            expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
          });
          it('should return bad request on missing input fields',async()=>{
            const missingFields = ['selection','itemID','updatedQuantity'];
    
            for (const field of missingFields) {
              const body:any = {
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              };
              body[field] = undefined;
        
              const response = await supertest(app)
                .put('/api/shop/carts')
                .set({
                  'cart-token': `Bearer ${nonMemberCartToken}`,
                  'Authorization': `Bearer ${nonMemberUserRes.userToken}`
                })
                .send(body);
              expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
            }
          });
          it('should return bad request if the updated quantity is negative',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${nonMemberCartToken}`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: -1
              })
            expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
          });
          it('should return bad request if the updated quantity is not a number',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${nonMemberCartToken}`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 'test'
              })
            expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
          });
          it('should return not found if a item doc does not exist for the provided item id',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${nonMemberCartToken}`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: 'test',
                updatedQuantity: 2
              })
            expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
          });
          it('should return not modified if the bagel selection is invalid',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${nonMemberCartToken}`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'test',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              })
            expect(response.status).toBe(HttpStatusCodes.NOT_MODIFIED);
          });
          //no test is performed for spread selections because we only sell 1LB spreads
        });
        describe('correctly update cart',()=>{
          let nonMemberCartToken:string = '';
          let nonMemberUserRes:TestCreateUserRes;
          let storeItems:any;
          let diamondMemberCartToken:string = '';
          let diamondMemberUserRes:TestCreateUserRes;

          beforeAll(async()=>{
            nonMemberCartToken = await createEmptyCart();
            nonMemberUserRes = await createUser(false,false,'Non-Member','test@nybagelsclub.com')
            storeItems = await createTestStoreItems();
            diamondMemberCartToken = await createEmptyCart();
            diamondMemberUserRes = await createUser(false,false,'Diamond Member','test2@nybagelsclub.com')
          });
          afterAll(async()=>{
            await mongoose.connection.dropDatabase();
          });
          it('should invalidate the old cart token, provide a correct new cart token',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${nonMemberCartToken}`,
                'Authorization': `Bearer ${nonMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 2
              });
            expect(response.status).toBe(HttpStatusCodes.OK);
            expect(response.body.cartToken).not.toBe(nonMemberCartToken);
            // should correctly provide a cart token for the updated cart
            const verifyCartResponse = await supertest(app)
              .get('/api/shop/carts/verify')
              .set({
                'cart-token': `Bearer ${response.body.cartToken}`
              });
            expect(verifyCartResponse.status).toBe(HttpStatusCodes.OK);
            expect(verifyCartResponse.body.cart.items[0].quantity).toBe(2); //quantity requested above
          });
          it('should correctly apply the users membership discount',async()=>{
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${diamondMemberCartToken}`,
                'Authorization': `Bearer ${diamondMemberUserRes.userToken}`
              })
              .send({
                selection: 'dozen',
                itemID: storeItems[0]._id.toString(),
                updatedQuantity: 1
              });
            expect(response.status).toBe(HttpStatusCodes.OK);
            expect(response.body.cart.finalPriceInDollars).toBe(38.2075);
          });
          it('should correctly apply promo pricing',async()=>{
            expect(true).toBe(false);
          });
          it('should correctly apply membership and promo pricing at the same time',async()=>{
            expect(true).toBe(false);
          });
          it('should correctly update the quantity of a item already in the cart',async()=>{
            expect(true).toBe(false);
          });
        });
      });
    });
  });
  describe('shop items',()=>{
    describe("get all shop items",()=>{
      describe('shop items do not exist',()=>{
        it('should return not found if no shop items exist',async()=>{
          const response = await supertest(app)
            .get('/api/shop/all');
          expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
        });
      });
      describe('shop items exist',()=>{
        let storeItems;
        beforeAll(async()=>{
          storeItems = await createTestStoreItems();
        });
        afterAll(async()=>{
          await mongoose.connection.dropDatabase();
        })
        it('should return all shop items',async()=>{
          const response = await supertest(app)
            .get('/api/shop/all');
          expect(response.status).toBe(HttpStatusCodes.OK);
          expect(response.body.allItems).toBeDefined();
          expect(response.body.allItems.length).toBe(storeItems.length);
        });
      });
    });
    describe('get shop item by item ID',()=>{
      let storeItems:any;
      beforeAll(async()=>{
        storeItems = await createTestStoreItems();
      })
      it('should return not found if a store item for the provided item id does not exist',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/item/123`)
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return the shop item for the item id provided.',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/item/${storeItems[0]._id.toString()}`)
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.item._id.toString()).toBe(storeItems[0]._id.toString());
      });
    });
    describe('request a personalized order',()=>{
      it('should return bad request if missing input fields',async()=>{
        const missingFields = ['emailInput','requestInput','quantityInput','requestsPackageDeal'];
  
        for (const field of missingFields) {
          const body:any = {
            'emailInput': 'test123@nybagelsclub.com',
            'requestInput': 'Please disregard this message, this is an automated test.',
            'quantityInput': '0',
            'requestsPackageDeal': true
          };
          body[field] = undefined;
    
          const response = await supertest(app)
            .post('/api/shop/orders/custom')
            .send(body);
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        };
      });
      test.skip('should sent an email to our webmaster when a custom order is requested',async()=>{
        const response = await supertest(app)
          .post('/api/shop/orders/custom')
          .send({
            'emailInput': 'test123@nybagelsclub.com',
            'requestInput': 'Please disregard this message, this is an automated test.',
            'quantityInput': '0',
            'requestsPackageDeal': true
          });

        console.log(response);
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.isEmailSent).toBe(true);
      });
    });
    describe('get a users order by order ID',()=>{
      let createUserResponse: TestCreateUserRes;
      let secondUserResponse: TestCreateUserRes;
      let orderDoc:Order;

      beforeAll(async()=>{
        //create the user
        createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
        //add store items
        let storeItems = await createTestStoreItems();
        //create a cart with items
        let cartToken = await createPopulatedCart(
          createUserResponse.userToken,
          [{
            selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
            itemID: storeItems[0]._id.toString(),
            updatedQuantity: 2
          }]
        );
        //place two orders (they are the same)
        orderDoc = await placeOrderForUser(createUserResponse.userID.toString(), cartToken);
        //create the second user
        secondUserResponse = await createUser(false,false,'Non-Member','test2@nybagelsclub.com');
      },10000);

      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      });

      it('should return unauthorized if a user token was not provided',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user token is incorrect',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${'123'}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found the order is not found',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('users should receive unauthorized when trying to access another users orders',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${secondUserResponse.userToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return the order for the provided order ID',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${createUserResponse.userToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.orderDoc._id.toString()).toBe(orderDoc._id.toString());
      });
    });
    describe('get all of a users orders',()=>{
      let createUserResponse: TestCreateUserRes;
      let secondUserResponse: TestCreateUserRes;
      beforeAll(async()=>{
        //create the user
        createUserResponse = await createUser(false,false,'Non-Member','test@nybagelsclub.com');
        //add store items
        let storeItems = await createTestStoreItems();
        //create a cart with items
        let cartToken = await createPopulatedCart(
          createUserResponse.userToken,
          [{
            selection: 'dozen', //may need to change this if you adjust the order of store items added, a permenant fix could be to filter the array
            itemID: storeItems[0]._id.toString(),
            updatedQuantity: 2
          }]
        );
        //place two orders (they are the same)
        await Promise.all([
          placeOrderForUser(createUserResponse.userID.toString(), cartToken),
          placeOrderForUser(createUserResponse.userID.toString(), cartToken)
        ]);
        //create the second user
        secondUserResponse = await createUser(false,false,'Non-Member','test2@nybagelsclub.com');
      },10000);
      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      })
      it('should return unauthorized if a user token was not provided', async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer `
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user token is incorrect',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${'123'}`
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found if the user has no orders placed',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${secondUserResponse.userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return the users orders',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${createUserResponse.userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.orders.length).toBe(2);
      });
    });
  });
});