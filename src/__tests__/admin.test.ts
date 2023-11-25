import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { salt } from '@src/constants/auth';
import { createNewUser } from '@src/controllers/user';
import { issueUserJWTToken } from '@src/helpers/auth';
import { CartInterface, Order, PromoCode, User } from '@src/interfaces/interfaces';
import app from '@src/server';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { USER_EMAIL,USER_FIRST_NAME, USER_LAST_NAME, USER_PASS, USER_PASS_CONF, createAdminAccount, createUserAccount } from './accountCreation';
import { createOrder } from '@src/controllers/order';
import { createPromoCode } from '@src/controllers/promocode';

describe('admin',()=>{
  describe('verify admin',()=>{
    let createAdminToken:string = '';
    let createUserToken:string = '';

    beforeAll(async ()=>{
      createUserToken = await createUserAccount();
      createAdminToken = await createAdminAccount();
    });

    afterAll(async ()=>{
      await mongoose.connection.dropDatabase();
    });
    it('should return unauthorized if user is not an admin', async()=>{
      const response = await supertest(app)
        .get('/api/admin/verifyAdmin')
        .set({
          'Authorization': `Bearer ${createUserToken}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      expect(response.body.isAdmin).toBe(false);
    });
    it('should return unauthorized if no login token was provided', async()=>{
      const response = await supertest(app)
        .get('/api/admin/verifyAdmin')
        .set({
          'Authorization': `Bearer ${undefined}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return ok if user is an admin', async ()=>{
      const response = await supertest(app)
        .get('/api/admin/verifyAdmin')
        .set({
          'Authorization': `Bearer ${createAdminToken}`
        })
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.isAdmin).toBe(true);
    });
  });
  describe('password reset status',()=>{
    let createAdminToken:string = '';
    let createUserToken:string = '';

    beforeAll(async ()=>{
      createUserToken = await createUserAccount();
      createAdminToken = await createAdminAccount();
    });

    afterAll(async ()=>{
      await mongoose.connection.dropDatabase();
    });
    it('should return not found if a password reset doc was not found',async ()=>{
      //get the password reset doc
      const response = await supertest(app)
        .post('/api/admin/users/passwordResetStatus')
        .set({
          'Authorization': `Bearer ${createAdminToken}`
        })
        .send({
          email: 'fakeemail@nybagelsclub.com'
        });
      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });
    it('should return unauthorized if user is not an admin', async()=>{
      //attempt to get a password reset doc with the user token
      const response = await supertest(app)
        .post('/api/admin/users/passwordResetStatus')
        .set({
          'Authorization': `Bearer ${createUserToken}`
        })
        .send({
          email: 'fakeemail@nybagelsclub.com'
        });
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return the password reset status for the user with the provided email',async()=>{
      //request a password reset
      const response = await supertest(app)
        .post('/api/users/forgotPassword')
        .set({
          'Authorization': `Bearer ${createUserToken}`
        })
        .send({
          email: USER_EMAIL //same email as user created in beforeall
        });
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.isEmailSent).toBe(true);
      //get the password reset doc
      const resetResponse = await supertest(app)
        .post('/api/admin/users/passwordResetStatus')
        .set({
          'Authorization': `Bearer ${createAdminToken}`
        })
        .send({
          email: USER_EMAIL //same email as user created in beforeall
        });
      expect(resetResponse.status).toBe(HttpStatusCodes.OK);
    });
  });
  describe('promo codes',()=>{
    describe('get promo code total sales',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      let promoCodeID:string = '';

      beforeAll(async ()=>{
        createUserToken = await createUserAccount();
        createAdminToken = await createAdminAccount();
        //insert a promo code
        const promoCodeDoc:PromoCode = await createPromoCode(
          'TEST25',
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          '123',
          'test promo code',
          '25_PERCENT_OFF',
          100,
          false
        );
        expect(promoCodeDoc).toBeDefined();
        promoCodeID = promoCodeDoc._id.toString();

        const cartOne:CartInterface = {
          items: [],
          subtotalInDollars: 0,
          taxInDollars: 0,
          totalQuantity: 0,
          promoCodeID: promoCodeID, //IMPORTANT
          discountAmountInDollars: 0,
          finalPriceInDollars: 10,
          desiredShipDate: new Date()
        };

        const cartTwo:CartInterface = {
          items: [],
          subtotalInDollars: 0,
          taxInDollars: 0,
          totalQuantity: 0,
          promoCodeID: promoCodeID, //IMPORTANT
          discountAmountInDollars: 0,
          finalPriceInDollars: 200,
          desiredShipDate: new Date()
        };

        const cartThree:CartInterface = {
          items: [],
          subtotalInDollars: 0,
          taxInDollars: 0,
          totalQuantity: 0,
          promoCodeID: promoCodeID, //IMPORTANT
          discountAmountInDollars: 0,
          finalPriceInDollars: 25.52,
          desiredShipDate: new Date()
        };

        const shippingAddress = {
          line1: 'test',
          city: 'test',
          state: 'test',
          postal_code: 'test',
          country: 'test',
          phone: '123-123-4567',
          fullName: 'test test'
        };

        //insert 3 orders all using the same promo code
        const orderOne:Order = await createOrder(
          '123', //fake userID doesnt need to be real
          cartOne,
          shippingAddress,
          undefined
        );
        const orderTwo:Order = await createOrder(
          '123', //fake userID doesnt need to be real
          cartTwo,
          shippingAddress,
          undefined
        );
        const orderThree:Order = await createOrder(
          '123', //fake userID doesnt need to be real
          cartThree,
          shippingAddress,
          undefined
        );
        expect(orderOne).toBeDefined();
        expect(orderTwo).toBeDefined();
        expect(orderThree).toBeDefined();
      });

      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if user is not an admin',async ()=>{
        const response = await supertest(app)
          .get('/api/admin/promoCode/fakePromoID/calc')
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should correctly calculate the total sales amount for a promocode in $x.xx format',async()=>{
        const response = await supertest(app)
          .get(`/api/admin/promoCode/${promoCodeID}/calc`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.promoTotalSales).toBe('235.52');
      });
      it('should return not found if the promo code does not exist',async ()=>{
        const response = await supertest(app)
          .get('/api/admin/promoCode/fakePromoID/calc')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
    });
    describe('update a promo code',()=>{
      let promoCodeID:string = '';
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async()=>{
        createAdminToken = await createAdminAccount();
        createUserToken = await createUserAccount();
        //insert a promo code
        const promoCodeDoc:PromoCode = await createPromoCode(
          'TEST25',
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          '123',
          'test promo code',
          '25_PERCENT_OFF',
          100,
          false
        );
        expect(promoCodeDoc).toBeDefined();
        promoCodeID = promoCodeDoc._id.toString();
      });
      afterAll(async()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided',async()=>{
        const response = await supertest(app)
          .put(`/api/admin/promoCode/'does not exist'`)
          .set({
            'Authorization': `Bearer ${undefined}`
          })
          .send({
            totalAllowedUses: 1,
            isDisabled: true,
            description: 'Updated Description'
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        const response = await supertest(app)
          .put(`/api/admin/promoCode/'does not exist'`)
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
          .send({
            totalAllowedUses: 1,
            isDisabled: true,
            description: 'Updated Description'
          });
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found if promo code does not exist',async()=>{
        const response = await supertest(app)
          .put(`/api/admin/promoCode/'does not exist'`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
          .send({
            totalAllowedUses: 1,
            isDisabled: true,
            description: 'Updated Description'
          });
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should update a promo code',async()=>{
        const response = await supertest(app)
          .put(`/api/admin/promoCode/${promoCodeID}`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
          .send({
            totalAllowedUses: 1,
            isDisabled: true,
            description: 'Updated Description'
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.promoCode.description).toBe('Updated Description');
        expect(response.body.promoCode.totalAllowedUses).toBe(1);
        expect(response.body.promoCode.disabled).toBe(true);
      });
    });
    describe('get all promo codes',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async ()=>{
        createUserToken = await createUserAccount();
        createAdminToken = await createAdminAccount();
        await createPromoCode(
          'TEST25',
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          '123',
          'test promo code',
          '25_PERCENT_OFF',
          100,
          false
        );
        await createPromoCode(
          'TEST25',
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          '123',
          'test promo code',
          '25_PERCENT_OFF',
          100,
          false
        );
        await createPromoCode(
          'TEST25',
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          '123',
          'test promo code',
          '25_PERCENT_OFF',
          100,
          false
        );
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        const response = await supertest(app)
          .get('/api/admin/promoCode')
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if no jwt token was provided', async()=>{
        const response = await supertest(app)
          .get('/api/admin/promoCode')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should get all promo codes',async ()=>{
        const response = await supertest(app)
          .get('/api/admin/promoCode')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.promoCodeData.length).toBe(3); // 3 promo codes total
      });
    });
  });
  describe('orders',()=>{
    describe('get an order',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      let orderDoc:Order;
      beforeAll(async ()=>{
        createAdminToken = await createAdminAccount(); 
        createUserToken = await createUserAccount();
        //insert an order
        const shippingAddress = {
          line1: 'test',
          city: 'test',
          state: 'test',
          postal_code: 'test',
          country: 'test',
          phone: '123-123-4567',
          fullName: 'test test'
        };
        const cart:CartInterface = {
          items: [],
          subtotalInDollars: 0,
          taxInDollars: 0,
          totalQuantity: 0,
          promoCodeID: '',
          discountAmountInDollars: 0,
          finalPriceInDollars: 10,
          desiredShipDate: new Date()
        };
        orderDoc = await createOrder(
          '123', //fake userID doesnt need to be real
          cart,
          shippingAddress,
          undefined
        );
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        const response = await supertest(app)
          .get(`/api/admin/orders/test`)
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        const response = await supertest(app)
          .get(`/api/admin/orders/test`)
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should get an order',async ()=>{
        const response = await supertest(app)
          .get(`/api/admin/orders/${orderDoc._id.toString()}`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        console.log(response);
        expect(response.body.order._id.toString()).toBe(orderDoc._id);
      });
      it('should return not found if an order does not exist for that id', async()=>{
        const response = await supertest(app)
          .get(`/api/admin/orders/test`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      })
    });
    describe('update an order',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async ()=>{
        createAdminToken = await createAdminAccount(); 
        createUserToken = await createUserAccount();
        //insert an order
        
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should update an order',()=>{
        expect(true).toBe(false);
      });
    });
    describe('search for an order',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async ()=>{
        createAdminToken = await createAdminAccount(); 
        createUserToken = await createUserAccount();
        //insert an order
        
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should get an order by order ID',()=>{
        expect(true).toBe(false);
      });
    });
    describe('get all pending orders',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async ()=>{
        createAdminToken = await createAdminAccount(); 
        createUserToken = await createUserAccount();
        //insert two pending orders and one processing order
        
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should get all pending orders',()=>{
        expect(true).toBe(false);
      });
    });
    describe('get all processing orders',()=>{
      let createAdminToken:string = '';
      let createUserToken:string = '';
      beforeAll(async ()=>{
        createAdminToken = await createAdminAccount(); 
        createUserToken = await createUserAccount();
        //insert one pending order and two processing orders
        
      });
      afterAll(async ()=>{
        await mongoose.connection.dropDatabase();
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should get all processing orders',()=>{
        expect(true).toBe(false);
      });
    });
    describe('get all orders for provided user',()=>{
      beforeAll(()=>{
        //create a user
        //give the user 3 orders
      });
      afterAll(()=>{
        //delete the user
        //delete the 3 orders
      })
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should get all orders for a user',()=>{
        expect(true).toBe(false);
      });
    });
    describe('get all orders',()=>{
      beforeAll(()=>{
        //create two users
        //give each user the same 3 orders
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        expect(true).toBe(false);
      });
      it('should return unauthorized if the user is not an admin', async()=>{
        expect(true).toBe(false);
      });
      it('should get all orders',()=>{
        expect(true).toBe(false);
      });
    });
  });
  describe('users',()=>{
    let createUserToken:string = '';
    let createAdminToken:string = '';
    let userDoc:User;
    let adminDoc:User;
    beforeAll(async()=>{
      createAdminToken = await createAdminAccount();
      //create a dummy user with the register route
      const response = await supertest(app)
        .post('/api/users/register')
        .send({
          firstName: USER_FIRST_NAME,
          lastName: USER_LAST_NAME,
          email: USER_EMAIL,
          password: USER_PASS,
          passwordConfirm: USER_PASS_CONF
        });
      expect(response.status).toBe(HttpStatusCodes.OK);
      createUserToken = response.body.token;

      const getUserDataResponse = await supertest(app)
        .get('/api/users/')
        .set({
          'Authorization': `Bearer ${createUserToken}`
        })
      expect(getUserDataResponse.status).toBe(HttpStatusCodes.OK);
      userDoc=getUserDataResponse.body.user;

      const getAdminDataResponse = await supertest(app)
        .get('/api/users/')
        .set({
          'Authorization': `Bearer ${createAdminToken}`
        })
      expect(getUserDataResponse.status).toBe(HttpStatusCodes.OK);
      adminDoc=getAdminDataResponse.body.user;
    });
    afterAll(async ()=>{
      //delete the user
      await mongoose.connection.dropDatabase();
    });
    describe('search for a user',()=>{
      it('should return unauthorized if the user is not an admin',async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/search/testUserID')
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if a bearer token was not provided',async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/search/testUserID')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found if a user does not exist',async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/search/testUserID')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return a user for a user ID',async()=>{
        const response = await supertest(app)
          .get(`/api/admin/users/search/${userDoc._id}`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.results.length).toBe(1);
        expect(response.body.results[0]._id).toBe(userDoc._id);
      });
    });
    describe("get a user's membership data",()=>{
      it('should return unauthorized if a bearer token was not provided', async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/memberships/testID')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return unauthorized if the user is not an admin',async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/memberships/testID')
          .set({
            'Authorization': `Bearer ${createUserToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return not found if a membership doc was not found',async()=>{
        const response = await supertest(app)
          .get('/api/admin/users/memberships/testID')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
          .send({
            userID: `${adminDoc._id}`
          })
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should get membership info for a user',async()=>{
        const response = await supertest(app)
          .get(`/api/admin/users/memberships/${userDoc._id}`)
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.membershipDoc.userID).toBe(userDoc._id);
      });
    });
  });
});