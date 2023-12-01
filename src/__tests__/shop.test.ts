import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { shopRouter } from "@src/routes/shop";
import app from "@src/server";
import mongoose from "mongoose";
import supertest from "supertest";
import { createAdminAccount, createUserAccount } from "./accountCreation";
import { createBagelItem } from "@src/controllers/item";
import { BagelItem, Order } from "@src/interfaces/interfaces";
import { createTempBagelItem, createTempOrder, createTempSpreadItem } from "./shopTestsHelpers";
import { createOrder } from "@src/controllers/order";
import { invalidatedTokens } from "@src/helpers/auth";
import { isDate } from "util/types";

// MAKE THE CALLS TO STRIPE API WHEN STRIPE IS IN TEST MODE!
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
      describe("get promo code data",()=>{
        it('should return unauthorized if no login token was provided',()=>{

        });
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return not found if a promo code is not applied to the users cart',()=>{

        });
        it('should return not found if a promo code doc does not exist for the promo code id in cart',()=>{

        });
        it('should get the promocode data for the promo code in cart',()=>{
          
        });
      });
      describe("add promo code to the users cart",()=>{
        it('should return unauthorized if no login token was provided',()=>{

        });
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return bad request on missing fields',()=>{

        });
        it('should return not found if a promo code doc does not exist for the promo code id in cart',()=>{

        });
        it('should return forbidden if the promo code is past its expiration date',()=>{

        });
        it('should return forbidden if there are no uses left on the promo code',()=>{

        });
        it('should update the pending order document if one already exists',()=>{

        });
        it('should create a pending order doc if one does not exist',()=>{

        });
        it('should correctly apply the promo code to the users cart',()=>{

        });
      });
      describe("remove promo code from cart",()=>{
        it('should return unauthorized if no login token was provided',()=>{

        });
        it('should return unauthorized if no cart token was provided',()=>{

        });
        it('should return forbidden if a cart token was provided but incorrect',()=>{
          
        });
        it('should return not found if no membership doc was found',()=>{

        });
        it('should return an error if a promo code is not applied to the users cart',()=>{

        });
        it('should remove the promo code from cart',()=>{

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
          const response = await supertest(app)
            .post('/api/shop/carts')
          expect(response.body.cartToken).toBeDefined();
        });
      });
      describe("update the cart based on the provided token",()=>{
        let cartToken:string = '';
        let bagelItemID:string = '';
        beforeAll(async()=>{
          //create an empty cart
          const response = await supertest(app)
            .post('/api/shop/carts')
          cartToken = await response.body.cartToken;
          //create a shop item
          bagelItemID = (await createTempBagelItem())._id.toString();
        });
        afterAll(async()=>{
          await mongoose.connection.dropDatabase();
        })
        it('should return unauthorized if no cart token was provided',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': ``
            });
          expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
        });
        it('should return forbidden if a cart token was provided but incorrect',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer test`
            });
          expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
        });
        it('should return bad request on missing input fields',async()=>{
          const missingFields = ['selection','itemID','updatedQuantity'];

          for (const field of missingFields) {
            const body:any = {
              selection: 'dozen',
              itemID: bagelItemID,
              updatedQuantity: 2
            };
            body[field] = undefined;
            const response = await supertest(app)
              .put('/api/shop/carts')
              .set({
                'cart-token': `Bearer ${cartToken}`
              })
              .send(body);
            expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
          };
        });
        it('should return bad request if the updated quantity is negative',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              selection: 'dozen',
              itemID: bagelItemID,
              updatedQuantity: -1
            });
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        });
        it('should return bad request if the updated quantity is not a number',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              selection: 'dozen',
              itemID: bagelItemID,
              updatedQuantity: 'NotANumber'
            });
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        });
        it('should return not found if a item doc does not exist for the provided item id',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              selection: 'dozen',
              itemID: '123',
              updatedQuantity: 2
            });
          expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
        });
        it('should return not modified if the bagel selection is invalid',async()=>{
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer ${cartToken}`
            })
            .send({
              selection: 'doesNotExist',
              itemID: bagelItemID,
              updatedQuantity: 3
            });
          expect(response.status).toBe(HttpStatusCodes.NOT_MODIFIED);
        });
        //no test is performed for spread selections because we only sell 1LB spreads
        it('should provide the user an updated cart token and invalidate the old one',async()=>{
          //store the current token
          const oldCartToken:string = cartToken;
          //update the cart
          const response = await supertest(app)
            .put('/api/shop/carts')
            .set({
              'cart-token': `Bearer ${cartToken}`,
            })
            .send({
              selection: 'dozen',
              itemID: bagelItemID,
              updatedQuantity: 3
            });
          expect(response.status).toBe(HttpStatusCodes.OK);
          //ensure invalidated tokens includes the old token
          expect(response.body.cartToken).toBeDefined();
          expect(response.body.cart).toBeDefined();
          expect(response.body.cart.items.length).toBe(1);
          expect(response.body.cart.items[0].selection).toBe('dozen');
          expect(response.body.cart.items[0].quantity).toBe(3);
          expect(response.body.cart.items[0].unitPriceInDollars).toBe(2.5);
          expect(response.body.cart.items[0].itemData._id.toString()).toBe(bagelItemID);
          expect(response.body.cart.subtotalInDollars).toBe(7.5);
          expect(response.body.cart.totalQuantity).toBe(3);
          expect(response.body.cart.discountAmountInDollars).toBe(0); //the test user is not a member
          expect(response.body.cart.desiredShipDate).toBeDefined();
          //the invalidated token exists in the invalidated tokens array
          expect(invalidatedTokens.some((item:any) => item.cart === oldCartToken)).toBe(true);
        });
        it('should correctly apply the users membership discount',async()=>{

        });
        it('should correctly update the quantity of a item already in the cart',async()=>{

        });
        it('should correctly apply promo pricing',async()=>{

        });
        it('should correctly apply membership and promo pricing at the same time',async()=>{

        });
      });
    });
  });
  describe('shop items',()=>{
    describe("get all shop items",()=>{
      describe('shop items do not exist',()=>{
        it('should return not found if no shop items exist',async()=>{
          const response = await supertest(app)
            .get('/api/shop/all')
          expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
        });
      });
      describe('shop items exist',()=>{
        beforeAll(async()=>{
          await createTempBagelItem();
          await createTempSpreadItem();
        });
        afterAll(async()=>{
          await mongoose.connection.dropDatabase();
        });
        it('should return all shop items',async()=>{
          const response = await supertest(app)
            .get('/api/shop/all')
          expect(response.status).toBe(HttpStatusCodes.OK);
          expect(response.body.allItems.length).toBe(2);
        });
      });
    });
    describe('get shop item by item ID',()=>{
      let itemID:string = '';
      beforeAll(async()=>{
        const bagelItem = await createTempBagelItem();
        itemID = bagelItem._id.toString();
      });
      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return not found if a store item for the provided item id does not exist',async()=>{
        const response = await supertest(app)
          .get('/api/shop/item/testItemID')
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return the shop item for the item id provided.',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/item/${itemID}`)
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.item._id.toString()).toBe(itemID);
      });
    });
    describe('request a personalized order',()=>{
      it('should return bad request if missing input fields',async()=>{
        const missingFields = ['emailInput', 'requestInput', 'quantityInput', 'requestsPackageDeal'];

        for (const field of missingFields) {
          const body:any = {
            emailInput: 'test@test.com',
            requestInput: '*This email was sent as apart of an automated test.*',
            quantityInput: '0',
            requestsPackageDeal: true
          };
          body[field] = undefined;
    
          const response = await supertest(app)
          .post('/api/shop/orders/custom')
          .send(body);
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        }  
      });
      test.skip('should sent an email to our webmaster when a custom order is requested',async()=>{
        const response = await supertest(app)
          .post('/api/shop/orders/custom')
          .send({
            emailInput: 'test@test.com',
            requestInput: '*This email was sent as apart of an automated test.*',
            quantityInput: '0',
            requestsPackageDeal: true
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.isEmailSent).toBe(true);
      });
    });
    describe('get a users order by order ID',()=>{
      let userToken:string = '';
      let adminToken:string = '';
      let order:Order;
      beforeAll(async()=>{
        userToken = await createUserAccount();
        adminToken = await createAdminAccount();
        //get the user doc
        const response = await supertest(app)
          .get('/api/users/')
          .set({
            'Authorization': `Bearer ${userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        //give the user an order
        order = await createTempOrder(response.body.user._id.toString());
      });
      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a user token was not provided',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${'ordernumtest'}`)
          .set({
            'Authorization': `Bearer ${undefined}`
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user token is incorrect',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${'ordernumtest'}`)
          .set({
            'Authorization': `Bearer ${'doesnotexist'}`
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found the order is not found',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${'ordernumtest'}`)
          .set({
            'Authorization': `Bearer ${userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('users should receive unauthorized when trying to access another users orders',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${order._id.toString()}`)
          .set({
            'Authorization': `Bearer ${adminToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return the order for the provided order ID',async()=>{
        const response = await supertest(app)
          .get(`/api/shop/orders/${order._id.toString()}`)
          .set({
            'Authorization': `Bearer ${userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.orderDoc._id.toString()).toBe(order._id.toString());
      });
    });
    describe('get all of a users orders',()=>{
      let userToken:string = '';
      let adminToken:string = '';
      beforeAll(async()=>{
        userToken = await createUserAccount();
        adminToken = await createAdminAccount();
        //get the user doc
        const response = await supertest(app)
          .get('/api/users/')
          .set({
            'Authorization': `Bearer ${userToken}`
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        //create two orders
        await createTempOrder(response.body.user._id.toString());
        await createTempOrder(response.body.user._id.toString());
      });
      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a user token was not provided', async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user token is incorrect',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${'29749872987isfhsjafh8728'}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found if the user has no orders placed',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${adminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return the users orders',async()=>{
        const response = await supertest(app)
          .get('/api/shop/orders')
          .set({
            'Authorization': `Bearer ${userToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.orders.length).toBe(2);
      });
    });
  });
});